import { RDFKnowledgeGraphManager, Triple } from './src/RDFKnowledgeGraphManager';
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { homedir } from "node:os";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { InferenceProvider } from "@huggingface/inference";
import type { ChatCompletionStreamOutput } from "@huggingface/tasks/src/tasks/chat-completion/inference";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod"; // Import zod for schema validation

import { ANSI } from "./src/util";
import { Agent } from './src/Agent';

import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();
const PROVIDER = (process.env.PROVIDER as InferenceProvider) ?? "asdf";
const BASE_URL = "http://harebell.cs.upb.de:8501/v1"
const TOKEN = process.env.TOKEN ?? "token-tentris-upb"
const MODEL_ID = process.env.MODEL_ID ?? "tentris"
const DESKTOP_PATH = join(homedir(), "Desktop");

// Initialize the RDF Knowledge Graph Manager
const rdfKnowledgeGraphManager = new RDFKnowledgeGraphManager();

// Create MCP Server for RDF
const rdfServer = new McpServer({
    name: "rdf-knowledge-graph",
    version: "1.0.0",
    capabilities: {resources: {},tools: {},}});

// Add methods to the server

// Initialize method
rdfServer.tool(
    "initialize", 
    "Initialize the RDF knowledge graph server", 
    {}, 
    async () => {
        console.log("RDF Knowledge Graph MCP Server initialized");
        return {
            content: [
                {
                    type: "text",
                    text: "RDF server initialized successfully"
                }
            ]
        };
    }
);
// Method to add triples to the RDF store
rdfServer.tool(
    "add-triples", 
    "Add new triples to the RDF knowledge graph", 
    {
        triples: z.array(z.object({
            subject: z.string().describe("URI or blank node identifier for the subject"),
            predicate: z.string().describe("URI for the predicate"),
            object: z.string().describe("URI, blank node or literal value for the object"),
            datatype: z.string().optional().describe("Optional: datatype URI for literals"),
            language: z.string().optional().describe("Optional: language tag for literals"),
            isLiteral: z.boolean().optional().describe("Whether the object is a literal value")
        })).describe("Array of RDF triples to add")
    }, 
    async ({ triples }) => {
        try {
            const addedTriples = await rdfKnowledgeGraphManager.addTriples(triples);
            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully added ${addedTriples.length} triples to the knowledge graph.`
                    }
                ],
                data: {
                    success: true,
                    added: addedTriples.length,
                    triples: addedTriples
                }
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error adding triples: ${error instanceof Error ? error.message : String(error)}`
                    }
                ],
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
);
        
// Method to query triples based on patterns
rdfServer.tool(
    "query-triples", 
    "Query triples from the RDF knowledge graph based on a pattern", 
    {
        query: z.object({
            subject: z.string().optional().describe("Subject pattern to match"),
            predicate: z.string().optional().describe("Predicate pattern to match"),
            object: z.string().optional().describe("Object pattern to match"),
            datatype: z.string().optional().describe("Datatype pattern to match"),
            language: z.string().optional().describe("Language pattern to match"),
            isLiteral: z.boolean().optional().describe("Whether the object is a literal")
        }).describe("Query pattern to match triples")
    }, 
    async ({ query }) => {
        try {
            const results = await rdfKnowledgeGraphManager.queryTriples(query);
            return {
                content: [
                    {
                        type: "text",
                        text: `Found ${results.length} matching triples.`
                    }
                ],
                data: {
                    success: true,
                    count: results.length,
                    results
                }
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error querying triples: ${error instanceof Error ? error.message : String(error)}`
                    }
                ],
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
);
// Define all MCP servers
const SERVERS: StdioServerParameters[] = [
	{command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", join(homedir(), "Desktop")], env: { MCP_FILESYSTEM_ROOT: DESKTOP_PATH, MCP_FILESYSTEM_DEFAULT_PATH: DESKTOP_PATH}},
	//{command: "npx", args: ["@playwright/mcp@latest"]},
	//{command: "npx", args: ["-y", "@modelcontextprotocol/server-memory", join(homedir(), "databases")], env: { MCP_SQLITE_DEFAULT_DB_PATH: join(homedir(), "databases"), MCP_SQLITE_ALLOW_WRITE: "true"}},
    // Add our custom RDF server
    //{server: rdfServer.server}
];


async function main() {
    try {
        // Get and print all triples
        console.log("All triples in the store:");
        const allTriples = await rdfKnowledgeGraphManager.getAllTriples();
        for (const triple of allTriples) {
            console.log(triple);
        }
    } catch (error) {
        console.error('Error:', error);
    }

    const agent = new Agent(
		BASE_URL
			? {endpointUrl: BASE_URL, model: MODEL_ID, apiKey: TOKEN, servers: SERVERS}
			: {provider: PROVIDER, model: MODEL_ID, apiKey: TOKEN, servers: SERVERS});


	const rl = readline.createInterface({ input: stdin, output: stdout });
	let abortController = new AbortController();
	let waitingForInput = false;
	async function waitForInput() {
		waitingForInput = true;
		const input = await rl.question("> ");
		waitingForInput = false;
		return input;
	}
	rl.on("SIGINT", async () => {
		if (waitingForInput) {
			// close the whole process
			await agent.cleanup();
			stdout.write("\n");
			rl.close();
		} else {
			// otherwise, it means a request is underway
			abortController.abort();
			abortController = new AbortController();
			stdout.write("\n");
			stdout.write(ANSI.GRAY);
			stdout.write("Ctrl+C a second time to exit");
			stdout.write(ANSI.RESET);
			stdout.write("\n");
		}
	});
	process.on("uncaughtException", (err) => {
		stdout.write("\n");
		rl.close();
		throw err;
	});

	await agent.loadTools();

	stdout.write(ANSI.BLUE);
	stdout.write(`Agent loaded with ${agent.availableTools.length} tools:\n`);
	stdout.write(ANSI.RESET);
	stdout.write("\n");

	while (true) {
		const input = await waitForInput();
		for await (const chunk of agent.run(input, { abortSignal: abortController.signal })) {
			if ("choices" in chunk) {
				const delta = (chunk as ChatCompletionStreamOutput).choices[0]?.delta;
				if (delta.content) {stdout.write(delta.content);}

				if (delta.tool_calls) {
					stdout.write(ANSI.GRAY);
					for (const deltaToolCall of delta.tool_calls) {
						if (deltaToolCall.id) {stdout.write(`<Tool ${deltaToolCall.id}>\n`);}
						if (deltaToolCall.function.name) {stdout.write(deltaToolCall.function.name + " ");}
						if (deltaToolCall.function.arguments) {stdout.write(deltaToolCall.function.arguments);}
					}
					stdout.write(ANSI.RESET);}
			} else {
				/// Tool call info
				stdout.write("\n\n");
				stdout.write(ANSI.GREEN);
				stdout.write(`Tool[${chunk.name}] ${chunk.tool_call_id}\n`);
				stdout.write(chunk.content);
				stdout.write(ANSI.RESET);
				stdout.write("\n\n");
			}
		}
		stdout.write("\n");
	}
    
}

// Call the main function
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});