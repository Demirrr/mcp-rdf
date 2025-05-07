import { RDFKnowledgeGraphManager } from './RDFManager';
import { Triple, RDFGraph } from './RDFKG';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer, Socket as IOSocket } from 'socket.io';

interface ClientSocket extends IOSocket {} // Corrected interface

interface VisualizationData { nodes: any[]; edges: any[];}

interface GraphData {triples: Triple[];prefixes?: { [key: string]: string };}

export class RDFVisualizer {
  private io!: SocketIOServer;
  private graphManager: RDFKnowledgeGraphManager;
  private port: number;
  constructor(graphManager: RDFKnowledgeGraphManager, port: number = 3000) {
    this.graphManager = graphManager;
    this.port = port;
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
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>RDF Graph Visualization</title>
        <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.1/socket.io.js"></script>
        <style type="text/css">
          #mynetwork {
            width: 100%;
            height: 100%;
            border: 1px solid lightgray;
          }
          body {
            font-family: sans-serif;
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
          }
        </style>
      </head>
      <body>
        <div id="mynetwork"></div>
        <div style="position: absolute; top: 20px; right: 20px; z-index: 1000;">
          <input type="file" id="fileInput" accept=".json,.jsonld" style="display: none;" />
          <button onclick="document.getElementById('fileInput').click()" style="padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Load JSON-LD File
          </button>
        </div>
        <script type="text/javascript">
          const nodes = new vis.DataSet([]);
          const edges = new vis.DataSet([]);
          const container = document.getElementById('mynetwork');
          const data = { nodes: nodes, edges: edges };
          const options = {
            nodes: { shape: 'dot', size: 15, font: { size: 14 } },
            edges: { font: { size: 14, align: 'middle' }, color: 'gray', arrows: { to: true }, smooth: false, width: 2 },
            physics: { enabled: true, barnesHut: { gravitationalConstant: -2000, centralGravity: 0.3, springLength: 95, springConstant: 0.04 }, minVelocity: 0.75 }
          };
          const network = new vis.Network(container, data, options);

          document.getElementById('fileInput').addEventListener('change', async function(event) {
            const file = event.target.files[0];
            if (file) {
              try {
                const text = await file.text();
                const response = await fetch('/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
                const result = await response.json();
                if (!result.success) alert('Error loading file: ' + result.error);
              } catch (error) {
                console.error('Error:', error);
                alert('Error loading file');
              }
            }
          });

          const socket = io('http://localhost:${this.port}');
          socket.on('connect', () => socket.emit('requestGraph'));
          socket.on('graphData', function(data) {
            nodes.clear();
            edges.clear();
            nodes.add(data.nodes);
            edges.add(data.edges);
            network.fit();
          });
        </script>
      </body>
      </html>
    `.replace('${this.port}', this.port.toString());
  }
}