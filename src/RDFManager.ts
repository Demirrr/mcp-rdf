import path from 'path';
import { promises as fs } from 'fs';
import { Triple } from './RDFKG';
import { RDFGraph } from './RDFKG';

// The RDFKnowledgeGraphManager class contains all operations to interact with the RDF knowledge graph
export class RDFKnowledgeGraphManager {
  private readonly memoryFilePath: string;

  constructor(memoryFilePath: string) {
    // If just a filename, put it in the current working directory
    this.memoryFilePath = path.isAbsolute(memoryFilePath)
      ? memoryFilePath
      : path.join(process.cwd(), memoryFilePath);
  }

  public async loadGraph(): Promise<RDFGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      return JSON.parse(data) as RDFGraph;
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        // Initialize with common RDF prefixes
        return { 
          triples: [],
          prefixes: {
            "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "xsd": "http://www.w3.org/2001/XMLSchema#",
            "owl": "http://www.w3.org/2002/07/owl#",
            "foaf": "http://xmlns.com/foaf/0.1/",
            "schema": "http://schema.org/",
            "dc": "http://purl.org/dc/elements/1.1/"
          }
        };
      }
      throw error;
    }
  }

  public async saveGraph(graph: RDFGraph): Promise<void> {
    await fs.writeFile(this.memoryFilePath, JSON.stringify(graph, null, 2));
  }

  // Helper method to resolve prefixed names to full URIs
  private resolveURI(value: string, prefixes: Record<string, string>): string {
    if (!value.includes(':')) return value;
    
    const [prefix, local] = value.split(':', 2);
    return prefixes[prefix] ? prefixes[prefix] + local : value;
  }

  // Helper to check if two triples are equal
  private tripleEquals(a: Triple, b: Triple): boolean {
    return (
      a.subject === b.subject &&
      a.predicate === b.predicate &&
      a.object === b.object &&
      a.datatype === b.datatype &&
      a.language === b.language &&
      a.isLiteral === b.isLiteral
    );
  }

  async addTriples(triples: Triple[]): Promise<Triple[]> {
    const graph = await this.loadGraph();
    
    // Resolve any prefixed names in the triples
    const expandedTriples = triples.map(triple => ({
      ...triple,
      subject: this.resolveURI(triple.subject, graph.prefixes),
      predicate: this.resolveURI(triple.predicate, graph.prefixes),
      object: triple.isLiteral ? triple.object : this.resolveURI(triple.object, graph.prefixes)
    }));
    
    // Filter out triples that already exist
    const newTriples = expandedTriples.filter(newTriple => 
      !graph.triples.some(existingTriple => this.tripleEquals(existingTriple, newTriple))
    );
    
    graph.triples.push(...newTriples);
    await this.saveGraph(graph);
    return newTriples;
  }

  async deleteTriples(patterns: Partial<Triple>[]): Promise<number> {
    const graph = await this.loadGraph();
    
    // Resolve any prefixed names in the patterns
    const expandedPatterns = patterns.map(pattern => ({
      ...pattern,
      subject: pattern.subject ? this.resolveURI(pattern.subject, graph.prefixes) : undefined,
      predicate: pattern.predicate ? this.resolveURI(pattern.predicate, graph.prefixes) : undefined,
      object: pattern.object && !pattern.isLiteral ? this.resolveURI(pattern.object, graph.prefixes) : pattern.object
    }));

    const initialCount = graph.triples.length;
    
    // Filter out triples that match the patterns
    graph.triples = graph.triples.filter(triple => 
      !expandedPatterns.some(pattern => 
        (!pattern.subject || triple.subject === pattern.subject) &&
        (!pattern.predicate || triple.predicate === pattern.predicate) &&
        (!pattern.object || triple.object === pattern.object) &&
        (pattern.isLiteral === undefined || triple.isLiteral === pattern.isLiteral) &&
        (pattern.datatype === undefined || triple.datatype === pattern.datatype) &&
        (pattern.language === undefined || triple.language === pattern.language)
      )
    );
    
    const deletedCount = initialCount - graph.triples.length;
    await this.saveGraph(graph);
    return deletedCount;
  }

  async addPrefix(prefix: string, uri: string): Promise<boolean> {
    const graph = await this.loadGraph();
    
    if (graph.prefixes[prefix] === uri) {
      return false; // Prefix already exists with the same URI
    }
    
    graph.prefixes[prefix] = uri;
    await this.saveGraph(graph);
    return true;
  }

  async deletePrefix(prefix: string): Promise<boolean> {
    const graph = await this.loadGraph();
    
    if (!graph.prefixes[prefix]) {
      return false; // Prefix doesn't exist
    }
    
    delete graph.prefixes[prefix];
    await this.saveGraph(graph);
    return true;
  }

  async readGraph(): Promise<RDFGraph> {
    return this.loadGraph();
  }

  async queryTriples(query: Partial<Triple>): Promise<Triple[]> {
    const graph = await this.loadGraph();

    // Resolve any prefixed names in the query
    const expandedQuery = {
      subject: query.subject ? this.resolveURI(query.subject, graph.prefixes) : undefined,
      predicate: query.predicate ? this.resolveURI(query.predicate, graph.prefixes) : undefined,
      object: query.object && !query.isLiteral ? this.resolveURI(query.object, graph.prefixes) : query.object,
      isLiteral: query.isLiteral,
      datatype: query.datatype,
      language: query.language
    };

    // Filter triples based on the query
    return graph.triples.filter(triple => 
      (!expandedQuery.subject || triple.subject === expandedQuery.subject) &&
      (!expandedQuery.predicate || triple.predicate === expandedQuery.predicate) &&
      (!expandedQuery.object || triple.object === expandedQuery.object) &&
      (expandedQuery.isLiteral === undefined || triple.isLiteral === expandedQuery.isLiteral) &&
      (expandedQuery.datatype === undefined || triple.datatype === expandedQuery.datatype) &&
      (expandedQuery.language === undefined || triple.language === expandedQuery.language)
    );
  }

  async listSubjects(): Promise<string[]> {
    const graph = await this.loadGraph();
    return [...new Set(graph.triples.map(t => t.subject))];
  }

  async getPrefixes(): Promise<Record<string, string>> {
    const graph = await this.loadGraph();
    return { ...graph.prefixes };
  }

  async exportAsNTriples(): Promise<string> {
    const graph = await this.loadGraph();
    return graph.triples.map(triple => {
      const subject = triple.subject.startsWith('_:') 
        ? triple.subject 
        : `<${triple.subject}>`;
      
      const predicate = `<${triple.predicate}>`;
      
      let object;
      if (triple.isLiteral) {
        object = `"${triple.object}"`;
        if (triple.datatype) {
          object += `^^<${triple.datatype}>`;
        } else if (triple.language) {
          object += `@${triple.language}`;
        }
      } else {
        object = triple.object.startsWith('_:') 
          ? triple.object 
          : `<${triple.object}>`;
      }
      
      return `${subject} ${predicate} ${object} .`;
    }).join('\n');
  }

  async getAllTriples(): Promise<Triple[]> {
    const graph = await this.loadGraph();
    return [...graph.triples];
  }
} 