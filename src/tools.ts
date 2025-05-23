import { ChatCompletionTool } from 'openai/resources/chat/completions';

export const tools: ChatCompletionTool[] = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get current temperature for a given location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City and country e.g. Bogotá, Colombia"
        }
      },
      required: ["location"],
      additionalProperties: false
    }
  }
},  
{
  type: "function",
  function: {
    name: "get_number_of_triples",
    description: "Get the number of triples.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
},
{
  type: "function",
  function: {
    name: "saveGraphToDisk",
    description: "Save the current RDF graph to disk in a specified format.",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          description: "The RDF format to save the graph in (turtle, ntriples, nquads, trig)",
          enum: ["turtle", "ntriples", "nquads", "trig"]
        },
        filename: {
          type: "string",
          description: "The name of the file to save the graph to (without extension)"
        }
      },
      required: ["format", "filename"],
      additionalProperties: false
    }
  }
},
{
  type: "function",
  function: {
    name: "addTriple",
    description: "Add a triple to the graph.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        predicate: { type: "string" },
        object: { type: "string" }
      },
      required: ["subject", "predicate", "object"],
      additionalProperties: false
    } 
  }
},
{
  type: "function",
  function: {
    name: "addTriples",
    description: "Add multiple triples to the graph.",
    parameters: {
      type: "object",
      properties: {
        triples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              predicate: { type: "string" },
              object: { type: "string" }
            },
            required: ["subject", "predicate", "object"],
            additionalProperties: false
          }
        }
      },
      required: ["triples"],
      additionalProperties: false
    }
  }
},
{
  type: "function",
  function: {
    name: "removeTriple",
    description: "Remove a specific triple from the graph.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        predicate: { type: "string" },
        object: { type: "string" }
      },
      required: ["subject", "predicate", "object"],
      additionalProperties: false
    }
  }
},
{
  type: "function",
  function: {
    name: "removeTriples",
    description: "Remove multiple triples from the graph.",
    parameters: {
      type: "object",
      properties: {
        triples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              predicate: { type: "string" },
              object: { type: "string" }
            },
            required: ["subject", "predicate", "object"],
            additionalProperties: false
          }
        }
      },
      required: ["triples"],
      additionalProperties: false
    }
  }
},
{
  type: "function",
  function: {
    name: "listAvailableFiles",
    description: "List all available RDF files in the current directory.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
},
{
  type: "function",
  function: {
    name: "readRDFFile",
    description: "Read an RDF file from disk into memory.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "The name of the RDF file to read (with extension)"
        }
      },
      required: ["filename"],
      additionalProperties: false
    }
  }
}]; 