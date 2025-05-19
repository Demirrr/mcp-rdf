import { RDFKnowledgeGraphManager, Triple, RDFGraph } from './RDFManager';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer, Socket as IOSocket } from 'socket.io';
import { readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
require('dotenv').config();

interface CurrentGraphData {
  nodes: Array<{ id: number; label: string }>;
  edges: Array<{ from: number; to: number; label: string }>;
}
// Define interfaces for expected request body and function arguments for better type safety
interface ChatRequest {
  message: string;
  currentGraphData: CurrentGraphData;
  functions: ChatCompletionTool[];
}

// Define interfaces for specific function arguments
interface AddTripleArgs {
  subject: string;
  predicate: string;
  object: string;
}

interface SetMaxTriplesRatioArgs {
  ratio: number;
}

interface CountTriplesArgs {
  nodeOrRelation: string;
}

interface ClientSocket extends IOSocket {}

interface VisualizationData {
  nodes: Array<{ id: number; label: string; shape: string }>;
  edges: Array<{ id: string; from: number; to: number; label: string; arrows: string }>;
}

export class RDFVisualizer {
  private io!: SocketIOServer;
  private graphManager: RDFKnowledgeGraphManager;
  private port: number;
  private templatePath: string;
  private openai: OpenAI;
  private model_name: string;
  private tools: ChatCompletionTool[];

  constructor(
    graphManager: RDFKnowledgeGraphManager,
    port: number = 3000,
    templatePath: string = './src/visualization.html'
  ) {
    this.graphManager = graphManager;
    this.port = port;
    this.templatePath = path.resolve(templatePath);
    this.model_name = process.env.MODEL_NAME as string;
    this.openai = new OpenAI({
      apiKey: process.env.TOKEN,
      baseURL: process.env.BASE_URL
    });    
    this.tools = [{
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
      }
    ] as ChatCompletionTool[];
  }

  async initialize() {
    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/') {
        this.serveVisualizationHTML(res);
      } else if (req.url === '/upload' && req.method === 'POST') {
        await this.handleFileUpload(req, res);
      } else if (req.url === '/addTriple' && req.method === 'POST') {
        await this.handleAddTripleRequest(req, res);
      } else if (req.url === '/chat' && req.method === 'POST') {
        await this.handleChatRequest(req, res);
      } else if (req.url?.startsWith('/src/')) {
        // Handle static files from src directory
        const filePath = path.join(process.cwd(), req.url);
        try {
          const fileContent = readFileSync(filePath);
          const ext = path.extname(filePath);
          const contentType = {
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.html': 'text/html',
            '.json': 'application/json'
          }[ext] || 'text/plain';
          
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(fileContent);
        } catch (error) {
          console.error('Error serving static file:', error);
          res.writeHead(404);
          res.end('File not found');
        }
      } else {
        this.handleNotFound(res);
      }
    });

    this.io = new SocketIOServer(httpServer, {cors: {  origin: '*',methods: ['GET', 'POST']}});
    this.io.on('connection', this.handleSocketConnection);
    httpServer.listen(this.port, () => {console.log(`Visualization server running at http://localhost:${this.port}`);});
  }

  private serveVisualizationHTML(res: ServerResponse) {
    try {
      const htmlTemplate = readFileSync(this.templatePath, 'utf8');
      const replacedHTML = htmlTemplate.replace('${this.port}', this.port.toString());
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(replacedHTML);
    } catch (error) {
      console.error('Error reading template file:', error);
      res.writeHead(500, {
        'Content-Type': 'text/html'
      });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>RDF Graph Visualization - Error</title>
        </head>
        <body>
          <h1>Error loading visualization</h1>
          <p>Could not load the template file: <code>${this.templatePath}</code>. Please ensure the path is correct and the file exists.</p>
          <p>Error details: ${error}</p>
        </body>
        </html>
      `);
    }
  }

  private async handleFileUpload(req: IncomingMessage, res: ServerResponse) {
    let body = '';
    try {
      for await (const chunk of req) { body += chunk.toString(); }
      const graph: RDFGraph = JSON.parse(body);
      await this.graphManager.saveGraph(graph);
      const visualizationData = this.convertToVisualization(graph);
      this.io.emit('graphData', visualizationData);
      res.writeHead(200, { 'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true}));
    } catch (error) {
      console.error('Error processing uploaded file:', error);
      res.writeHead(400, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({error: 'Invalid JSON-LD file format'}));
    }
  }

  private async handleAddTripleRequest(req: IncomingMessage, res: ServerResponse) {
    let body = '';
    try {
      for await (const chunk of req) {body += chunk.toString();}
      const newTriple: Triple = JSON.parse(body);
      const graph = await this.graphManager.readGraph();
      graph.triples.push(newTriple);
      await this.graphManager.saveGraph(graph);
      this.fetchAndSendGraphData(this.io);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true, message: 'Triple added successfully' }));
    } catch (error) {
      console.error('Error adding triple via HTTP:', error);
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'Invalid triple format'}));
    }
  }
  // Dummy weather function
  private async get_weather({ location }: { location: string }) {
    return `It's sunny and 22°C in ${location}.`;
  }
  private async get_number_of_triples(currentGraphData: CurrentGraphData) {
    const count = currentGraphData.edges.length;
    return `There are ${count} triples in the graph.`;
  }
   
  /**
   * Handles incoming chat requests, processes user messages,
   * interacts with the OpenAI API for completions and function calls,
   * and responds to the client.
   *
   * @param req The incoming HTTP request.
   * @param res The server response object.
   */
  private async handleChatRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = '';
    try {
      for await (const chunk of req) { body += chunk.toString(); }
      const requestData: ChatRequest = JSON.parse(body);
      const { message, currentGraphData, functions } = requestData;

      if (!message || !functions) {
        this.sendErrorResponse(res, 400, 'Missing message or functions in request body');
        return;
      }

      const initialResponse = await this.openai.chat.completions.create({
        model: this.model_name,
        messages: [
          { role: "system", content: `You are an AI assistant that helps users interact with an RDF graph visualization. You can help users understand the graph structure, add new triples, and modify the visualization settings.`},
          { role: "user", content: message }
        ],
        tools: this.tools,
        tool_choice: "auto"
      });

      const initialMessage = initialResponse.choices[0].message;
      const toolCalls = initialMessage.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          let functionResult = "";
          if (functionName === "get_weather") {
            functionResult = await this.get_weather(args);
          } 
          else if (functionName === "get_number_of_triples") {
            functionResult = await this.get_number_of_triples(currentGraphData);
          }
          else {
            console.warn(`Unknown function: ${functionName}`);
          }

          console.debug(functionResult);
          const followup = await this.openai.chat.completions.create({
            model: this.model_name,
            messages: [
              { role: "user", content: message },
              {
                role: "assistant",
                tool_calls: toolCalls.map(tc => ({
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  }
                }))
              },
              {
                role: "tool",
                tool_call_id: toolCall.id,
                content: functionResult
              }
            ],
          });

          this.sendSuccessResponse(res, { content: followup.choices[0].message.content });
        }
      } else {
        this.sendSuccessResponse(res, { content: initialMessage.content });
      }
    } catch (error) {
      console.error('Error processing chat request:', error);
      this.sendErrorResponse(res, 500, 'Failed to process chat request');
    }
  }
  
  /**
   * Delegates the handling of specific function calls.
   *
   * @param functionName The name of the function to handle.
   * @param args The arguments provided for the function call.
   * @param currentGraphData The current graph data, potentially needed by some functions.
   * @returns A promise resolving with the result of the function execution.
   */
  private async handleFunctionCall(functionName: string, args: any, currentGraphData: any): Promise<any> {
    switch (functionName) {
      case 'addTriple':
        // Validate arguments for addTriple
        if (!this.isValidAddTripleArgs(args)) {
          throw new Error('Invalid arguments for addTriple function');
        }
        return this.handleAddTriple(args as AddTripleArgs);
  
      case 'setMaxTriplesRatio':
        // Validate arguments for setMaxTriplesRatio
         if (!this.isValidSetMaxTriplesRatioArgs(args)) {
          throw new Error('Invalid arguments for setMaxTriplesRatio function');
        }
        return this.handleSetMaxTriplesRatio(args as SetMaxTriplesRatioArgs);
  
      case 'countTriples':
        // Validate arguments for countTriples
        if (!this.isValidCountTriplesArgs(args)) {
          throw new Error('Invalid arguments for countTriples function');
        }
        return this.handleCountTriples(args as CountTriplesArgs, currentGraphData);
  
      default:
        // Handle unknown function calls
        console.warn(`Unknown function called: ${functionName}`);
        return { success: false, message: `Unknown function: ${functionName}` };
    }
  }
  
  /**
   * Handles the 'addTriple' function call.
   * Reads the current graph, adds the new triple, saves the graph, and notifies clients.
   *
   * @param args The arguments for the addTriple function.
   * @returns A success message.
   */
  private async handleAddTriple(args: AddTripleArgs): Promise<{ success: true; message: string }> {
    // Assuming graphManager is available in the class instance
    const graph = await this.graphManager.readGraph();
    // Assuming graph.triples is an array where triples can be pushed directly
    graph.triples.push(args);
    await this.graphManager.saveGraph(graph);
    // Assuming fetchAndSendGraphData is a method that fetches and sends updated graph data via sockets
    this.fetchAndSendGraphData(this.io); // Assuming this.io is the socket.io server instance
    return { success: true, message: 'Triple added successfully' };
  }
  
  /**
   * Handles the 'setMaxTriplesRatio' function call.
   * Currently just returns a success message acknowledging the change.
   * More complex logic to actually set the ratio would go here.
   *
   * @param args The arguments for the setMaxTriplesRatio function.
   * @returns A success message.
   */
  private async handleSetMaxTriplesRatio(args: SetMaxTriplesRatioArgs): Promise<{ success: true; message: string }> {
    // @TODO: Implement logic to actually set the max triples ratio in your visualization settings
    console.log(`Setting max triples ratio to ${args.ratio}%`);
    return { success: true, message: `Triple ratio set to ${args.ratio}%` };
  }
  
  /**
   * Handles the 'countTriples' function call.
   * Counts triples involving a specific node or relation in the current graph data.
   *
   * @param args The arguments for the countTriples function.
   * @param currentGraphData The current graph data to analyze.
   * @returns An object containing success status, count, and a message.
   */
  private async handleCountTriples(args: CountTriplesArgs, currentGraphData: ChatRequest['currentGraphData']): Promise<{ success: true; count: number; message: string }> {
    // Filter edges where either the source or target node label, or the edge label,
    // contains the specified nodeOrRelation string.
    // This logic assumes a specific structure for nodes and edges in currentGraphData.
    const count = currentGraphData.edges.filter((edge: { from: number; to: number; label: string }) => {
      const fromNode = currentGraphData.nodes.find((n: { id: number; label: string }) => n.id === edge.from);
      const toNode = currentGraphData.nodes.find((n: { id: number; label: string }) => n.id === edge.to);
  
      const nodeMatch = (fromNode?.label.includes(args.nodeOrRelation) || toNode?.label.includes(args.nodeOrRelation));
      const relationMatch = edge.label.includes(args.nodeOrRelation);
  
      return nodeMatch || relationMatch;
    }).length;
  
    return {
      success: true,
      count: count,
      message: `Found ${count} triples involving "${args.nodeOrRelation}"`
    };
  }
  
  /**
   * Sends a successful JSON response to the client.
   *
   * @param res The server response object.
   * @param data The data to send in the response body.
   * @param statusCode The HTTP status code (defaults to 200).
   */
  private sendSuccessResponse(res: ServerResponse, data: any, statusCode: number = 200): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    console.debug("Sending success response:", JSON.stringify(data));
    res.end(JSON.stringify(data));
  }
  
  /**
   * Sends an error JSON response to the client.
   *
   * @param res The server response object.
   * @param statusCode The HTTP status code.
   * @param message The error message to send.
   */
  private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
  
  // Basic validation functions for function arguments (can be made more robust)
  private isValidAddTripleArgs(args: any): args is AddTripleArgs {
    return typeof args === 'object' && args !== null &&
           typeof args.subject === 'string' &&
           typeof args.predicate === 'string' &&
           typeof args.object === 'string';
  }
  
  private isValidSetMaxTriplesRatioArgs(args: any): args is SetMaxTriplesRatioArgs {
    return typeof args === 'object' && args !== null &&
           typeof args.ratio === 'number';
  }
  
  private isValidCountTriplesArgs(args: any): args is CountTriplesArgs {
    return typeof args === 'object' && args !== null &&
           typeof args.nodeOrRelation === 'string';
  }
  
  
  // Assume the following members exist in the class:
  // private openai: OpenAI; // Initialized OpenAI client
  // private graphManager: { readGraph(): Promise<{ triples: any[] }>; saveGraph(graph: any): Promise<void> }; // Interface for graph management
  // private io: Socket; // Initialized socket.io server instance
  // private fetchAndSendGraphData(io: Socket): void; // Method to fetch and send graph data
  
  // Example of how these members might be declared in the class:
  /*
  class ChatService {
    private openai: OpenAI;
    private graphManager: {
      readGraph(): Promise<{ triples: any[] }>;
      saveGraph(graph: any): Promise<void>
    };
    private io: Socket;
  
    constructor(openai: OpenAI, graphManager: any, io: Socket) {
      this.openai = openai;
      this.graphManager = graphManager; // Assign the graph manager instance
      this.io = io; // Assign the socket.io instance
    }
  
    // ... other methods including fetchAndSendGraphData and the refactored handleChatRequest
    private fetchAndSendGraphData(io: Socket): void {
        // Implementation to fetch graph data and emit via io
        console.log("Fetching and sending graph data...");
        // Example: io.emit('graphDataUpdate', latestGraphData);
    }
  }
  */

  private handleNotFound(res: ServerResponse) { res.writeHead(404); res.end('Not found'); }

  private handleSocketConnection = (socket: ClientSocket) => {
    console.log('Client connected:', socket.id);
    this.fetchAndSendGraphData(socket)

    socket.on('requestGraph', async () => {
      console.log('Client requested graph:', socket.id);
      this.fetchAndSendGraphData(socket);
    });

    socket.on('addTriple', async (triple: Triple) => {
      console.log('Client adding triple via WebSocket:', socket.id, triple);
      try {
        const graph = await this.graphManager.readGraph();
        graph.triples.push(triple);
        await this.graphManager.saveGraph(graph);
        this.fetchAndSendGraphData(this.io); // Emit to all connected clients
      } catch (error) {
        console.error('Error adding triple via WebSocket:', error);
        socket.emit('error', 'Failed to add triple');
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  };

  private async fetchAndSendGraphData(emitter: SocketIOServer | ClientSocket) {
    try {
      const graph:RDFGraph = await this.graphManager.readGraph();
      const visualizationData = this.convertToVisualization(graph);
      emitter.emit('graphData', visualizationData);

    } catch (error) {
      console.error('Error fetching and sending graph data:', error);
      if (emitter instanceof IOSocket) {
        emitter.emit('error', 'Failed to load graph data');
      } else {
        this.io.emit('error', 'Failed to load graph data for clients');
      }
    }
  }

  private convertToVisualization(graph: RDFGraph): VisualizationData {
    const nodes = new Set<string>();
    const edges: Array<{ id: string; from: number; to: number; label: string; arrows: string }> = [];
    const nodeMap = new Map<string, number>();
    let nodeIdCounter = 0;

    graph.triples.forEach(triple => {
      if (!nodeMap.has(triple.subject)) {
        nodeMap.set(triple.subject, nodeIdCounter++);
        nodes.add(triple.subject);
      }
      
      if (triple.object && !nodeMap.has(triple.object)) {
        nodeMap.set(triple.object, nodeIdCounter++);
        nodes.add(triple.object);
      }
    });

    const visNodes = Array.from(nodes).map(node => ({
      id: nodeMap.get(node)!,
      label: node,
      shape: 'dot'
    }));

    graph.triples.forEach((triple, index) => {
      const fromId = nodeMap.get(triple.subject)!;
      const toId = triple.object ? nodeMap.get(triple.object)! : undefined;

      if (toId !== undefined) {
        edges.push({
          id: `edge_${index}`,
          from: fromId,
          to: toId,
          label: triple.predicate,
          arrows: 'to'
        });
      }
    });

    return {
      nodes: visNodes,
      edges
    };
  }
}