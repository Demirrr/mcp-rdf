import { RDFKnowledgeGraphManager } from './RDFManager';
import { Triple, RDFGraph } from './RDFKG';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer, Socket as IOSocket } from 'socket.io';
import { readFileSync } from 'fs';

interface ClientSocket extends IOSocket {} // Corrected interface

interface VisualizationData { nodes: any[]; edges: any[];}

interface GraphData {triples: Triple[];prefixes?: { [key: string]: string };}

export class RDFVisualizer {
  private io!: SocketIOServer;
  private graphManager: RDFKnowledgeGraphManager;
  private port: number;
  private templatePath: string;
  constructor(graphManager: RDFKnowledgeGraphManager, port: number = 3000, templatePath: string ='./vs.html') {
    this.graphManager = graphManager;
    this.port = port;
    this.templatePath = templatePath;
  }

  async initialize() {
    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getVisualizationHTML());
      } else if (req.url === '/upload' && req.method === 'POST') {
        await this.handleFileUpload(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.io = new SocketIOServer(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    });

    this.io.on('connection', this.handleSocketConnection);

    httpServer.listen(this.port, () => {
      console.log(`Visualization server running at http://localhost:${this.port}`);
    });
  }

  private async handleFileUpload(req: IncomingMessage, res: ServerResponse) {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }
    try {
      const graph: GraphData = JSON.parse(body);
      // Ensure prefixes is always present
      const graphWithPrefixes: RDFGraph = {
        ...graph,
        prefixes: graph.prefixes || {}
      };
      await this.graphManager.saveGraph(graphWithPrefixes);
      const visualizationData = this.convertToVisualization(graph);
      this.io.emit('graphData', visualizationData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error('Error processing uploaded file:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON-LD file' }));
    }
  }

  private handleSocketConnection = (socket: ClientSocket) => {
    this.sendInitialGraphData(socket);

    socket.on('requestGraph', async () => {
      const graph = await this.graphManager.readGraph();
      const visualizationData = this.convertToVisualization(graph);
      socket.emit('graphData', visualizationData);
    });

    socket.on('addTriple', async (triple: Triple) => {
      try {
        const graph = await this.graphManager.readGraph();
        graph.triples.push(triple);
        await this.graphManager.saveGraph(graph); // Assuming saveGraph is async
        const visualizationData = this.convertToVisualization(graph);
        this.io.emit('graphData', visualizationData);
      } catch (error) {
        console.error('Error adding triple:', error);
      }
    });
  };

  private async sendInitialGraphData(socket: ClientSocket) {
    try {
      const graph = await this.graphManager.readGraph();
      const visualizationData = this.convertToVisualization(graph);
      socket.emit('graphData', visualizationData);

      const prefixes = this.extractPrefixes(graph);
      socket.emit('prefixes', prefixes);
    } catch (error) {
      console.error('Error initializing graph:', error);
      socket.emit('error', 'Failed to load initial graph');
    }
  }

  private extractPrefixes(graph: GraphData): string[] {
    const prefixes = new Set<string>();

    if (graph.prefixes) {
      Object.values(graph.prefixes).forEach(prefix => prefixes.add(prefix));
    }

    const getPrefix = (iri: string) => {
      const match = iri.match(/^(http[s]?:\/\/[^\/]+)\/|:(.*)$/);
      return match ? (match[1] || match[2]) : '';
    };

    graph.triples.forEach(triple => {
      if (triple.subject) prefixes.add(getPrefix(triple.subject));
      if (triple.predicate) prefixes.add(getPrefix(triple.predicate));
      if (!triple.isLiteral && triple.object) prefixes.add(getPrefix(triple.object));
    });

    return Array.from(prefixes);
  }

  private convertToVisualization(graph: GraphData): VisualizationData {
    const nodes = new Set<string>();
    const edges: any[] = [];

    graph.triples.forEach(triple => {
      nodes.add(triple.subject);
      if (!triple.isLiteral) nodes.add(triple.object);
    });

    const visNodes = Array.from(nodes).map((node, id) => ({
      id,
      label: node,
      shape: 'dot'
    }));

    graph.triples.forEach((triple, index) => {
      if (!triple.isLiteral) {
        edges.push({
          id: `edge_${index}`,
          from: visNodes.findIndex(n => n.label === triple.subject),
          to: visNodes.findIndex(n => n.label === triple.object),
          label: triple.predicate,
          arrows: 'to'
        });
      }
    });

    return { nodes: visNodes, edges };
  }

  private getVisualizationHTML(): string {
    try {
      // Read the template file
      let htmlTemplate = readFileSync(this.templatePath, 'utf8');
      
      // Replace the port placeholder
      htmlTemplate = htmlTemplate.replace('${this.port}', this.port.toString());
      
      return htmlTemplate;
    } catch (error) {
      console.error('Error reading template file:', error);
      // Fallback to a simple HTML if template cannot be read
      return `<!DOCTYPE html>
        <html>
        <head>
          <title>RDF Graph Visualization</title>
          <script src="https://cdnjs.cloudflare.com/ajax/socket.io/4.0.1/socket.io.js"></script>
        </head>
        <body>
          <h1>Error loading visualization</h1>
          <p>Could not load the template file. Please check the server logs.</p>
        </body>
        </html>`;
    }
  }
}