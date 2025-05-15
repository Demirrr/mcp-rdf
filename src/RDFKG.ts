import path from 'path';
import { promises as fs } from 'fs';

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(process.cwd(), 'rdf-store.jsonld');

// If MEMORY_FILE_PATH is just a filename, put it in the current working directory
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(process.cwd(), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// RDF triples structure
export interface Triple {subject: string; predicate: string; object: string;
}
export interface RDFGraph {triples: Triple[];}