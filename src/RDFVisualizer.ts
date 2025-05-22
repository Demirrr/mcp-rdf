import { RDFKnowledgeGraphManager, Triple, RDFGraph } from './RDFManager';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer, Socket as IOSocket } from 'socket.io';
import { readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import fsp from 'fs/promises';
import { CurrentGraphData, ChatRequest, AddTripleArgs, ClientSocket, VisualizationData } from './interfaces/interface_visualizer';
import * as N3 from 'n3';
import { Quad, NamedNode, Literal, DataFactory } from 'n3';
const { namedNode, literal, defaultGraph } = DataFactory;
require('dotenv').config();

export class RDFVisualizer {
  private io!: SocketIOServer;
  private graphManager: RDFKnowledgeGraphManager;
  private port: number;
  private templatePath: string;
  private openai: OpenAI;
  private model_name: string;
  private tools: ChatCompletionTool[];

  constructor(graphManager: RDFKnowledgeGraphManager, port: number = 3000,templatePath: string = './src/visualization.html') {
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
      } else if (req.url === '/download' && req.method === 'GET') {
        await this.handleDownloadRequest(req, res);
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
    try {
      // Use a more robust approach to parse multipart form data
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      
      // Parse the multipart form data
      const contentType = req.headers['content-type'];
      if (!contentType || !contentType.includes('multipart/form-data')) {
        throw new Error('Invalid content type: expected multipart/form-data');
      }

      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        throw new Error('No boundary found in content-type header');
      }

      // Split the body by boundary
      const parts = body.toString().split('--' + boundary);
      let content = '';
      let format = '';

      for (const part of parts) {
        if (part.includes('name="content"')) {
          // Extract content between the headers and the next boundary
          const contentMatch = part.match(/\r\n\r\n([\s\S]*?)(?=\r\n--|$)/);
          if (contentMatch) {
            content = contentMatch[1].trim();
          }
        } else if (part.includes('name="format"')) {
          const formatMatch = part.match(/\r\n\r\n([\s\S]*?)(?=\r\n--|$)/);
          if (formatMatch) {
            format = formatMatch[1].trim();
          }
        }
      }

      if (!content || !format) {
        throw new Error('Missing content or format in upload');
      }

      // Create a temporary file with the correct extension
      const tempFilePath = path.join(process.cwd(), `temp_upload.${format}`);
      await fsp.writeFile(tempFilePath, content, 'utf8');

      try {
        // Set the memory file path to the temporary file
        this.graphManager = new RDFKnowledgeGraphManager(tempFilePath);
        
        // Read the graph from the temporary file
        const graph = await this.graphManager.readGraph();
        
        // Convert and send the visualization data
        const visualizationData = this.convertToVisualization(graph);
        this.io.emit('graphData', visualizationData);
        
        res.writeHead(200, { 'Content-Type': 'application/json'});
        res.end(JSON.stringify({success: true}));
      } finally {
        // Clean up the temporary file
        try {
          await fsp.unlink(tempFilePath);
        } catch (error) {
          console.error('Error cleaning up temporary file:', error);
        }
      }
    } catch (error) {
      console.error('Error processing uploaded file:', error);
      res.writeHead(400, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid RDF file format: ' + (error instanceof Error ? error.message : String(error))
      }));
    }
  }

  private async handleAddTripleRequest(req: IncomingMessage, res: ServerResponse) {
    let body = '';
    try {
      for await (const chunk of req) {body += chunk.toString();}
      const newTriple: Triple = JSON.parse(body);
      await this.graphManager.updateGraph(graph => {
        graph.triples.push(newTriple);
      });
      this.fetchAndSendGraphData(this.io);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true, message: 'Triple added successfully' }));
    } catch (error) {
      console.error('Error adding triple via HTTP:', error);
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: 'Invalid triple format'}));
    }
  }

  private async get_number_of_triples(currentGraphData: CurrentGraphData) {
    const count = currentGraphData.edges.length;
    return `There are ${count} triples in the graph.`;
  }
  

  private async handleChatRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = '';
    try {
      for await (const chunk of req) { body += chunk.toString(); }
      const requestData: ChatRequest = JSON.parse(body);
      const { message, currentGraphData } = requestData;

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
          if (functionName === "get_number_of_triples") {
          functionResult = await this.get_number_of_triples(currentGraphData);}
          else if (functionName === "addTriple") {
            const result = await this.handleAddTriple(args);
            functionResult = result.message;
          }
          else {console.warn(`Unknown function: ${functionName}`);}

          // @TODO: Do we need to add the functionResult to the message?
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
  
  

  private async handleAddTriple(args: AddTripleArgs): Promise<{ success: true; message: string }> {
    await this.graphManager.updateGraph(graph => {
      graph.triples.push(args);
    });
    this.fetchAndSendGraphData(this.io);
    return { success: true, message: 'Triple added successfully' };
  }
  

  private sendSuccessResponse(res: ServerResponse, data: any, statusCode: number = 200): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    console.debug("Sending success response:", JSON.stringify(data));
    res.end(JSON.stringify(data));
  }
  
  private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
  
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
        await this.graphManager.updateGraph(graph => {
          graph.triples.push(triple);
        });
        this.fetchAndSendGraphData(this.io);
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
      const graph = await this.graphManager.readGraph();
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

  private async handleDownloadRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const graph = await this.graphManager.readGraph();
      const memoryFilePath = this.graphManager.getMemoryFilePath();
      
      if (!memoryFilePath) {
        // If no file path is provided, serialize the graph in memory
        const writer = new N3.Writer({ format: 'Turtle' });
        for (const triple of graph.triples) {
          const subjectNode = namedNode(triple.subject);
          const predicateNode = namedNode(triple.predicate);
          let objectTerm: NamedNode | Literal;
          
          if (triple.object.startsWith('"') || triple.object.includes('^^') || triple.object.includes('@')) {
            try {
              const parser = new N3.Parser();
              const quads = parser.parse(`_:s _:p ${triple.object} .`);
              if (quads.length > 0 && quads[0].object.termType === 'Literal') {
                objectTerm = quads[0].object as Literal;
              } else {
                objectTerm = literal(triple.object);
              }
            } catch (e) {
              objectTerm = literal(triple.object);
            }
          } else {
            objectTerm = namedNode(triple.object);
          }
          
          writer.addQuad(subjectNode, predicateNode, objectTerm, defaultGraph());
        }
        
        const serializedGraph = await new Promise<string>((resolve, reject) => {
          writer.end((error: Error | null, result: string) => {
            if (error) reject(error);
            else resolve(result);
          });
        });
        
        res.writeHead(200, {
          'Content-Type': 'text/turtle',
          'Content-Disposition': 'attachment; filename="graph.ttl"'
        });
        
        res.end(serializedGraph);
        return;
      }
      
      // Read the serialized graph from the file
      const serializedGraph = await fsp.readFile(memoryFilePath, 'utf8');
      
      // Set appropriate headers for RDF download
      res.writeHead(200, {
        'Content-Type': 'text/turtle',
        'Content-Disposition': 'attachment; filename="graph.ttl"'
      });
      
      res.end(serializedGraph);
    } catch (error) {
      console.error('Error handling download request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to download graph' }));
    }
  }
}