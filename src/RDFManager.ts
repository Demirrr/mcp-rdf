import path from 'path';
import * as fs from 'fs';
import * as N3 from 'n3';

const fsp = fs.promises;


// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(process.cwd(), 'rdf-store.jsonld');

// If MEMORY_FILE_PATH is just a filename, put it in the current working directory
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(process.cwd(), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// RDF triples structure
export interface Triple {subject: string; predicate: string; object: string;}
export interface RDFGraph {triples: Triple[];}

export class RDFKnowledgeGraphManager {
  private readonly memoryFilePath: string;

  constructor(memoryFilePath: string) {
    this.memoryFilePath = path.isAbsolute(memoryFilePath) ? memoryFilePath : path.join(process.cwd(), memoryFilePath);}

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
        writer.end((error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    
      await fsp.writeFile(this.memoryFilePath, ntriples, 'utf8');
    }
    

  private tripleEquals(a: Triple, b: Triple): boolean {
    return (a.subject === b.subject &&a.predicate === b.predicate &&a.object === b.object );}

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
  async dept_readGraph(): Promise<RDFGraph> {
    // Create an empty graph
    const graph: RDFGraph = { triples: [] };
    // Create a readable stream from the Turtle file
    const rdfStream = fs.createReadStream(this.memoryFilePath, { encoding: 'utf8' });
    // Create an N3 StreamParser
    const parser = new N3.StreamParser();
    rdfStream.pipe(parser);
    // On each parsed quad, convert it to a Triple and add to the graph
    parser.on('data', (quad) => {
      const triple: Triple = {
        subject: quad.subject.value, predicate: quad.predicate.value, object: quad.object.value};
        graph.triples.push(triple);});
    // On end of parsing, print the RDFGraph
    parser.on('end', () => {
      console.log('# Parsing complete. Graph contains', graph.triples.length, 'triples.');
    });
    // Handle any errors
    parser.on('error', (err) => {console.error('Error while parsing:', err);});

    for (const triple of graph.triples) {
      console.log(triple);
    }
    return graph; //JSON.parse(await fsp.readFile(this.memoryFilePath, "utf-8")) as RDFGraph;
  }
  async readGraph(): Promise<RDFGraph> {
  const graph: RDFGraph = { triples: [] };

  await new Promise<void>((resolve, reject) => {
    const rdfStream = fs.createReadStream(this.memoryFilePath, { encoding: 'utf8' });
    const parser = new N3.StreamParser();

    rdfStream.pipe(parser);

    parser.on('data', (quad) => {
      const triple: Triple = {
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value,
      };
      graph.triples.push(triple);
    });

    parser.on('end', () => {
      console.log('# Parsing complete. Graph contains', graph.triples.length, 'triples.');
      resolve(); // Parsing is done
    });

    parser.on('error', (err) => {
      console.error('Error while parsing:', err);
      reject(err); // Propagate error
    });
  });

  return graph;
}

} 