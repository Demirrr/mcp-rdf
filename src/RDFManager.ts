import path from 'path';
import * as fs from 'fs';
import * as N3 from 'n3';
import { Quad, NamedNode, Literal, DataFactory } from 'n3'; // Import necessary types and DataFactory

const fsp = fs.promises;
const { namedNode, literal, quad, defaultGraph } = DataFactory; // Destructure DataFactory methods

// RDF triples structure
export interface Triple {subject: string; predicate: string; object: string;}

export interface RDFGraph {triples: Triple[]; prefixMap: Map<string, string>;}

export class RDFKnowledgeGraphManager {
  private readonly memoryFilePath?: string;
  private readonly commonPrefixes: Map<string, string>;
  private graph: RDFGraph; // Add in-memory graph storage

  constructor(memoryFilePath?: string) {
    this.memoryFilePath = memoryFilePath ? (path.isAbsolute(memoryFilePath) ? memoryFilePath : path.join(process.cwd(), memoryFilePath)) : undefined;
    // Initialize common prefixes
    this.commonPrefixes = new Map([
      ['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:'],
      ['http://www.w3.org/2000/01/rdf-schema#', 'rdfs:'],
      ['http://www.w3.org/2002/07/owl#', 'owl:'],
      ['http://www.benchmark.org/family#', 'family:'],
      // Add other common prefixes as needed
    ]);
    // Initialize empty graph
    this.graph = {
      triples: [],
      prefixMap: new Map(this.commonPrefixes)
    };
  }

  public getMemoryFilePath(): string | undefined {
    return this.memoryFilePath;
  }

   private getFormatFromPath(filePath: string | undefined): string {
    if (!filePath) {
      return 'Turtle'; // Default to Turtle if no file path is provided
    }
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.nt':
        return 'N-Triples';
      case '.nq':
        return 'N-Quads';
      case '.trig':
        return 'TriG';
      case '.jsonld':
        // N3.js writer might not directly support JSON-LD writing,
        // but we can indicate it for potential future use or error handling.
        // For now, we'll default to Turtle or N-Triples if JSON-LD writing isn't supported by N3.js Writer.
        console.warn(`JSON-LD format (.jsonld) might not be fully supported by N3.js Writer for saving. Defaulting to Turtle.`);
        return 'Turtle'; // Defaulting to Turtle as a fallback
      case '.ttl':
      default: // Default to Turtle for unknown extensions
        return 'Turtle';
    }
  }

   private shortenIRI(graph: RDFGraph, iri: string): string {
    // First try to find an existing prefix match from common prefixes
    for (const [prefix, shortPrefix] of this.commonPrefixes) {
      if (iri.startsWith(prefix)) {
        return iri.replace(prefix, shortPrefix);
      }
    }

    // Then try prefixes already in the graph's prefix map (added during reading)
     for (const [prefix, shortPrefix] of graph.prefixMap) {
       if (iri.startsWith(prefix)) {
         return iri.replace(prefix, shortPrefix);
       }
     }


    // If no match found, attempt to register a new prefix if it looks like a common IRI pattern
    const hashIndex = iri.lastIndexOf('#');
    const slashIndex = iri.lastIndexOf('/');
    const splitIndex = Math.max(hashIndex, slashIndex); // Use the last # or /

    if (splitIndex !== -1) {
      const prefix = iri.substring(0, splitIndex + 1);
      // Extract a potential namespace name from the part after the prefix
      const namespaceCandidate = iri.substring(splitIndex + 1);
      // Use the first segment as a potential short prefix base, convert to lowercase
      const shortPrefixBase = namespaceCandidate.split(/[\/#]/)[0].toLowerCase();
      // Ensure the short prefix base is not empty and doesn't start with a number
      if (shortPrefixBase && !/^\d/.test(shortPrefixBase)) {
         const shortPrefix = `${shortPrefixBase}:`;
         // Check if this short prefix is already used for a different IRI
         let isPrefixUsed = false;
         for(const [existingPrefix, existingShortPrefix] of graph.prefixMap) {
             if (existingShortPrefix === shortPrefix && existingPrefix !== prefix) {
                 isPrefixUsed = true;
                 break;
             }
         }
         if (!isPrefixUsed) {
            graph.prefixMap.set(prefix, shortPrefix);
            return iri.replace(prefix, shortPrefix);
         } else {
             // If the short prefix is already used for a different IRI, don't shorten
             console.warn(`Short prefix "${shortPrefix}" derived from "${iri}" is already used for "${isPrefixUsed}". Not shortening.`);
         }
      }
    }

    // If no shortening is possible, return the original IRI
    return iri;
  }

  /**
   * Converts a potentially shortened IRI back to its full IRI form
   * using the provided prefix map.
   * @param prefixMap The map of full IRIs to short prefixes.
   * @param shortenedIri The potentially shortened IRI string.
   * @returns The full IRI string.
   */
  private expandIRI(prefixMap: Map<string, string>, shortenedIri: string): string {
    const colonIndex = shortenedIri.indexOf(':');

    // If no colon, assume it's already a full IRI or relative IRI
    if (colonIndex === -1) {
      return shortenedIri;
    }

    const shortPrefix = shortenedIri.substring(0, colonIndex + 1); // Include the colon
    const localName = shortenedIri.substring(colonIndex + 1);

    // Iterate through the prefix map to find the corresponding full prefix
    // Note: The prefixMap stores full IRI -> short prefix. We need to find the inverse.
    for (const [fullPrefix, mappedShortPrefix] of prefixMap) {
      if (mappedShortPrefix === shortPrefix) {
        return fullPrefix + localName;
      }
    }

     // Also check common prefixes if they are not already in the graph's prefix map
     for (const [fullPrefix, mappedShortPrefix] of this.commonPrefixes) {
        if (mappedShortPrefix === shortPrefix) {
          return fullPrefix + localName;
        }
     }


    // If no matching prefix found, return the original string
    // This might happen for relative IRIs or unknown prefixes
    console.warn(`Could not expand prefix for "${shortenedIri}". Returning as is.`);
    return shortenedIri;
  }

  public async updateGraph(updateFn: (graph: RDFGraph) => void): Promise<void> {
    updateFn(this.graph);
    // Optionally persist to disk if memoryFilePath is set
    if (this.memoryFilePath) {
      await this.saveGraph(this.graph);
    }
  }

  public async readGraph(): Promise<RDFGraph> {
    // If no memory file path is provided, return the in-memory graph
    if (!this.memoryFilePath) {
      return this.graph;
    }

    // Check if the file exists before attempting to read
    try {
      await fsp.access(this.memoryFilePath, fs.constants.F_OK);
    } catch (e) {
      console.log(`Memory file not found at ${this.memoryFilePath}. Using in-memory graph.`);
      return this.graph;
    }

    // Read from file only if it exists and we haven't loaded it yet
    if (this.graph.triples.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const rdfStream = fs.createReadStream(this.memoryFilePath!, { encoding: 'utf8' });
        const parser = new N3.StreamParser();

        rdfStream.pipe(parser);

        parser.on('prefix', (prefix: string, iri: NamedNode) => {
          this.graph.prefixMap.set(iri.value, `${prefix}:`);
        });

        parser.on('data', (quad: N3.Quad) => {
          const triple: Triple = {
            subject: this.shortenIRI(this.graph, quad.subject.value),
            predicate: this.shortenIRI(this.graph, quad.predicate.value),
            object: quad.object.termType === 'Literal'
              ? quad.object.value
              : this.shortenIRI(this.graph, quad.object.value)
          };

          this.graph.triples.push(triple);
        });

        parser.on('end', () => {
          console.log('# Parsing complete. Graph contains', this.graph.triples.length, 'triples.');
          console.log('Gathered prefixes:', Array.from(this.graph.prefixMap.entries()).map(([iri, prefix]) => `${prefix} -> ${iri}`).join(', '));
          resolve();
        });

        parser.on('error', (err: Error) => {
          console.error('Error while parsing:', err);
          reject(err);
        });

        rdfStream.on('error', (err: NodeJS.ErrnoException) => {
          console.error(`File stream error for ${this.memoryFilePath}:`, err);
          if (err.code !== 'ENOENT') {
            reject(err);
          }
        });
      });
    }

    return this.graph;
  }

  public async saveGraph(graph: RDFGraph): Promise<void> {
    if (!this.memoryFilePath) {
      console.warn('No memory file path provided. Graph will not be saved.');
      return;
    }

    // Update the in-memory graph
    this.graph = graph;

    // Determine the output format based on the file extension
    const format = this.getFormatFromPath(this.memoryFilePath);

    // Convert the graph's prefix map to the format required by N3.js Writer
    const writerPrefixes: { [key: string]: string } = {};
    for (const [fullPrefix, shortPrefix] of this.commonPrefixes) {
      writerPrefixes[shortPrefix.slice(0, -1)] = fullPrefix;
    }
    for (const [fullPrefix, shortPrefix] of graph.prefixMap) {
      writerPrefixes[shortPrefix.slice(0, -1)] = fullPrefix;
    }

    const writer = new N3.Writer({ format: format, prefixes: writerPrefixes });

    for (const triple of graph.triples) {
      const subjectNode = namedNode(this.expandIRI(graph.prefixMap, triple.subject));
      const predicateNode = namedNode(this.expandIRI(graph.prefixMap, triple.predicate));

      let objectTerm: NamedNode | Literal;
      if (triple.object.startsWith('"') || triple.object.includes('^^') || triple.object.includes('@')) {
        try {
          const parser = new N3.Parser();
          const quads = parser.parse(`_:s _:p ${triple.object} .`);
          if (quads.length > 0 && quads[0].object.termType === 'Literal') {
            objectTerm = quads[0].object as Literal;
          } else {
            console.warn(`Could not parse object string "${triple.object}" as a literal. Treating as a plain literal.`);
            objectTerm = literal(triple.object);
          }
        } catch (e) {
          console.error(`Error parsing literal string "${triple.object}":`, e);
          objectTerm = literal(triple.object);
        }
      } else {
        objectTerm = namedNode(this.expandIRI(graph.prefixMap, triple.object));
      }

      writer.addQuad(subjectNode, predicateNode, objectTerm, defaultGraph());
    }

    const serializedGraph = await new Promise<string>((resolve, reject) => {
      writer.end((error: Error | null, result: string) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    await fsp.writeFile(this.memoryFilePath, serializedGraph, 'utf8');
    console.log(`Graph saved to ${this.memoryFilePath} in ${format} format.`);
  }

  private tripleEquals(a: Triple, b: Triple): boolean {
    return (a.subject === b.subject && a.predicate === b.predicate && a.object === b.object);
  }

  async addTriples(triples: Triple[]): Promise<Triple[]> {
    const newTriples = triples.filter(newTriple =>
      !this.graph.triples.some(existingTriple => this.tripleEquals(existingTriple, newTriple)));

    if (newTriples.length > 0) {
      this.graph.triples.push(...newTriples);
      // Save the graph to the file if memoryFilePath is set
      if (this.memoryFilePath) {
        await this.saveGraph(this.graph);
      }
      console.log(`Added ${newTriples.length} new triples.`);
    } else {
      console.log("No new triples to add.");
    }

    return newTriples;
  }
} 