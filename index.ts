import { RDFKnowledgeGraphManager } from "./src/RDFManager";
import { RDFVisualizer } from "./src/RDFVisualizer";

const local_path_of_kg = "inferred_family-benchmark_rich_background.ttl";

const rdfManager = new RDFKnowledgeGraphManager();
const visualizer = new RDFVisualizer(rdfManager, 4000, "./src/visualization.html");
// Initialize the visualization server
visualizer.initialize();


// Load and display initial graph
/*
rdfManager.readGraph().then(graph => {
    console.log(graph);
});



import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { homedir } from "node:os";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { InferenceProvider } from "@huggingface/inference";
import type { ChatCompletionStreamOutput } from "@huggingface/tasks/src/tasks/chat-completion/inference";

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


// Define all MCP servers
const SERVERS: StdioServerParameters[] = [
	{command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", join(homedir(), "Desktop")], env: { MCP_FILESYSTEM_ROOT: DESKTOP_PATH, MCP_FILESYSTEM_DEFAULT_PATH: DESKTOP_PATH}},
	//{command: "npx", args: ["@playwright/mcp@latest"]},
	//{command: "npx", args: ["-y", "@modelcontextprotocol/server-memory", join(homedir(), "databases")], env: { MCP_SQLITE_DEFAULT_DB_PATH: join(homedir(), "databases"), MCP_SQLITE_ALLOW_WRITE: "true"}},
];


async function main() {
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
*/
