import path from 'path';
import * as fs from 'fs';
import * as N3 from 'n3';

const fsp = fs.promises;

// RDF triples structure
export interface Triple {subject: string; predicate: string; object: string;}

export interface RDFGraph {triples: Triple[]; prefixMap: Map<string, string>;}

export class RDFKnowledgeGraphManager {
  private readonly memoryFilePath: string;

  constructor(memoryFilePath: string) {
    this.memoryFilePath = path.isAbsolute(memoryFilePath) ? memoryFilePath : path.join(process.cwd(), memoryFilePath);
  }

  private shortenIRI(graph: RDFGraph, iri: string): string {
    // First try to find an existing prefix match
    for (const [prefix, shortPrefix] of graph.prefixMap) {
      if (iri.startsWith(prefix)) {
        return iri.replace(prefix, shortPrefix);
      }
    }

    // If no match found, try to register a new prefix
    const hashIndex = iri.lastIndexOf('#');
    if (hashIndex !== -1) {
      const prefix = iri.substring(0, hashIndex + 1);
      const namespace = iri.substring(hashIndex + 1).split('/')[0].toLowerCase();
      const shortPrefix = `${namespace}:`;
      graph.prefixMap.set(prefix, shortPrefix);
      return iri.replace(prefix, shortPrefix);
    }
    return iri;
  }

  public async saveGraph(graph: RDFGraph): Promise<void> {
    const writer = new N3.Writer({ format: 'N-Triples' });
  
    for (const triple of graph.triples) {
      writer.addQuad(
        N3.DataFactory.namedNode(triple.subject),
        N3.DataFactory.namedNode(triple.predicate),
        triple.object.startsWith('"') || triple.object.includes('^^') || triple.object.includes('@')
          ? N3.DataFactory.literal(triple.object)
          : N3.DataFactory.namedNode(triple.object)
      );
    }
  
    const ntriples = await new Promise<string>((resolve, reject) => {
      writer.end((error: Error | null, result: string) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  
    await fsp.writeFile(this.memoryFilePath, ntriples, 'utf8');
  }

  private tripleEquals(a: Triple, b: Triple): boolean {
    return (a.subject === b.subject && a.predicate === b.predicate && a.object === b.object);
  }

  async addTriples(triples: Triple[]): Promise<Triple[]> {
    const graph = await this.readGraph();
    const expandedTriples = triples.map(triple => 
      ({...triple, subject: triple.subject, predicate: triple.predicate, object: triple.object }));    
    // Filter out triples that already exist
    const newTriples = expandedTriples.filter(newTriple => 
      !graph.triples.some(existingTriple => this.tripleEquals(existingTriple, newTriple)));    
    graph.triples.push(...newTriples);
    // Save the graph to the file
    await this.saveGraph(graph);
    return newTriples;
  }
  
  async readGraph(): Promise<RDFGraph> {
    const graph: RDFGraph = { 
      triples: [],
      prefixMap: new Map([
        ['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:'],
        ['http://www.w3.org/2000/01/rdf-schema#', 'rdfs:'],
        ['http://www.w3.org/2002/07/owl#', 'owl:'],
        ['http://www.benchmark.org/family#', 'family:']
      ])
    };

    await new Promise<void>((resolve, reject) => {
      const rdfStream = fs.createReadStream(this.memoryFilePath, { encoding: 'utf8' });
      const parser = new N3.StreamParser();
      rdfStream.pipe(parser);

      parser.on('data', (quad: N3.Quad) => {
        const triple: Triple = {
          subject: this.shortenIRI(graph, quad.subject.value),
          predicate: this.shortenIRI(graph, quad.predicate.value),
          object: quad.object.termType === 'Literal' 
            ? quad.object.value 
            : this.shortenIRI(graph, quad.object.value)
        };
        
        graph.triples.push(triple);
      });

      parser.on('end', () => {
        console.log('# Parsing complete. Graph contains', graph.triples.length, 'triples.');
        resolve();
      });

      parser.on('error', (err: Error) => {
        console.error('Error while parsing:', err);
        reject(err);
      });
    });

    return graph;
  }
} 