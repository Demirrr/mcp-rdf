import { RDFKnowledgeGraphManager, Triple, RDFGraph } from './RDFManager';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer, Socket as IOSocket } from 'socket.io';
import { readFileSync } from 'fs';
import path from 'path';

interface ClientSocket extends IOSocket {}

interface VisualizationData {nodes: any[];edges: any[];}

export class RDFVisualizer {
  private io!: SocketIOServer;
  private graphManager: RDFKnowledgeGraphManager;
  private port: number;
  private templatePath: string;

  constructor(graphManager: RDFKnowledgeGraphManager, port: number = 3000, templatePath: string = './vs.html') {
    this.graphManager = graphManager;
    this.port = port;
    this.templatePath = path.resolve(templatePath);

    this.graphManager.readGraph().then(graph => {
      graph.triples.forEach(triple => {
        console.log(triple);
      });
    });
  }

  async initialize() {
    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/') {
        this.serveVisualizationHTML(res);
      } else if (req.url === '/upload' && req.method === 'POST') {
        await this.handleFileUpload(req, res);
      } else if (req.url === '/addTriple' && req.method === 'POST') {
        await this.handleAddTripleRequest(req, res);
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
    const nodes = new Set < string > ();
    const edges: any[] = [];
    const nodeMap = new Map < string, number > ();
    let nodeIdCounter = 0;

    graph.triples.forEach(triple => {

      if (!nodeMap.has(triple.subject)) {nodeMap.set(triple.subject, nodeIdCounter++); nodes.add(triple.subject);}
      
      if (triple.object && !nodeMap.has(triple.object)) { nodeMap.set(triple.object, nodeIdCounter++); nodes.add(triple.object);}

    });

    const visNodes = Array.from(nodes).map(node => ({id: nodeMap.get(node)!, label: node, shape: 'dot'}));

    graph.triples.forEach((triple, index) => {
      const fromId = nodeMap.get(triple.subject)!;
      const toId = triple.object ? nodeMap.get(triple.object)! : undefined;

      if (toId !== undefined) {
        edges.push({id: `edge_${index}`,
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