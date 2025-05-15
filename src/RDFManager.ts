import path from 'path';
import { promises as fs } from 'fs';
import { Triple } from './RDFKG';
import { RDFGraph } from './RDFKG';

export class RDFKnowledgeGraphManager {
  private readonly memoryFilePath: string;

  constructor(memoryFilePath: string) {
    this.memoryFilePath = path.isAbsolute(memoryFilePath) ? memoryFilePath : path.join(process.cwd(), memoryFilePath);}

  public async saveGraph(graph: RDFGraph): Promise<void> {await fs.writeFile(this.memoryFilePath, JSON.stringify(graph, null, 2));}

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
  async readGraph(): Promise<RDFGraph> {
    return JSON.parse(await fs.readFile(this.memoryFilePath, "utf-8")) as RDFGraph;
  }

} 