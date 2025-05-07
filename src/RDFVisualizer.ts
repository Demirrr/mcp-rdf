import { RDFKnowledgeGraphManager } from './RDFManager';
import { Triple } from './RDFKG';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { resolve } from 'path';

interface SocketIOClient {
  emit(event: string, data: any): void;
  on(event: string, callback: (data: any) => void): void;
}

export class RDFVisualizer {
  private io!: Server;
  private graphManager: RDFKnowledgeGraphManager;
  private nodes: any[] = [];
  private edges: any[] = [];
  private port: number;

  constructor(graphManager: RDFKnowledgeGraphManager, port: number = 3000) {
    this.graphManager = graphManager;
    this.port = port;
  }

  async initialize() {
    // Create HTTP server with file upload handling
    const httpServer = createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getVisualizationHTML());
      }
      // Handle file uploads
      else if (req.url === '/upload' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const graph = JSON.parse(body);
            // Save the uploaded graph
            await this.graphManager.saveGraph(graph);
            // Update all connected clients
            const visualizationData = this.convertToVisualization(graph);
            this.io.emit('graphData', visualizationData);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            console.error('Error processing uploaded file:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON-LD file' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Initialize Socket.IO
    this.io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Handle graph updates
    this.io.on('connection', (socket: SocketIOClient) => {
      // Send initial graph data when client connects
      (async () => {
        try {
          const graph = await this.graphManager.readGraph();
          const visualizationData = this.convertToVisualization(graph);
          socket.emit('graphData', visualizationData);

          // Send prefix data to client
          const prefixes = this.extractPrefixes(graph);
          socket.emit('prefixes', prefixes);
        } catch (error) {
          console.error('Error initializing graph:', error);
          socket.emit('error', 'Failed to load initial graph');
        }
      })();

      // Handle explicit graph requests
      socket.on('requestGraph', async () => {
        const graph = await this.graphManager.readGraph();
        const visualizationData = this.convertToVisualization(graph);
        socket.emit('graphData', visualizationData);
      });

      // Handle adding new triples
      socket.on('addTriple', async (triple: Triple) => {
        try {
          const graph = await this.graphManager.readGraph();
          graph.triples.push(triple);
          await this.graphManager.saveGraph(graph);
          const visualizationData = this.convertToVisualization(graph);
          this.io.emit('graphData', visualizationData);
        } catch (error) {
          console.error('Error adding triple:', error);
        }
      });
    });

    // Start server
    httpServer.listen(this.port, () => {
      console.log(`Visualization server running at http://localhost:${this.port}`);
    });
  }

  private extractPrefixes(graph: { triples: any[], prefixes?: { [key: string]: string } }): string[] {
    const prefixes = new Set<string>();
    
    // Add default prefixes from JSON-LD
    if (graph.prefixes) {
      Object.values(graph.prefixes).forEach((prefix: string) => {
        prefixes.add(prefix);
      });
    }

    // Extract prefixes from existing triples
    graph.triples.forEach((triple: Triple) => {
      const getPrefix = (iri: string) => {
        const match = iri.match(/^(http[s]?:\/\/[^\/]+)\/|:(.*)$/);
        if (match) {
          return match[1] || match[2];
        }
        return '';
      };

      if (triple.subject) {
        prefixes.add(getPrefix(triple.subject));
      }
      if (triple.predicate) {
        prefixes.add(getPrefix(triple.predicate));
      }
      if (!triple.isLiteral && triple.object) {
        prefixes.add(getPrefix(triple.object));
      }
    });

    return Array.from(prefixes);
  }

  private convertToVisualization(graph: any): { nodes: any[], edges: any[] } {
    const nodes = new Set<string>();
    const edges: any[] = [];

    // Add all subjects and objects as nodes
    graph.triples.forEach((triple: Triple) => {
      nodes.add(triple.subject);
      if (!triple.isLiteral) {
        nodes.add(triple.object);
      }
    });

    // Convert to vis.js format
    const visNodes = Array.from(nodes).map((node, id) => ({
      id: id,
      label: node,
      shape: 'dot'
    }));

    // Create edges
    graph.triples.forEach((triple: Triple, index: number) => {
      if (!triple.isLiteral) {
        edges.push({
          id: 'edge_' + index,
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
          // create an array with nodes
          var nodes = new vis.DataSet([]);
          
          // create an array with edges
          var edges = new vis.DataSet([]);
          
          // create a network
          var container = document.getElementById('mynetwork');
          var data = {
            nodes: nodes,
            edges: edges
          };
          var options = {
            nodes: {
              shape: 'dot',
              size: 15,
              font: {
                size: 14
              }
            },
            edges: {
              font: {
                size: 14,
                align: 'middle'
              },
              color: 'gray',
              arrows: {
                to: true
              },
              smooth: false,
              width: 2
            },
            physics: {
              enabled: true,
              barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.3,
                springLength: 95,
                springConstant: 0.04
              },
              minVelocity: 0.75
            }
          };
          var network = new vis.Network(container, data, options);

          // Handle file upload
          document.getElementById('fileInput').addEventListener('change', async function(event) {
            const file = event.target.files[0];
            if (file) {
              try {
                const text = await file.text();
                const response = await fetch('/upload', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: text
                });
                const result = await response.json();
                if (!result.success) {
                  alert('Error loading file: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error loading file');
              }
            }
          });

          // Socket.IO connection
          const socket = io('http://localhost:${this.port}');
          
          // Request initial graph data and update visualization
          socket.on('connect', () => {
            socket.emit('requestGraph');
          });
          
          // Update visualization when new graph data arrives
          socket.on('graphData', function(data) {
            nodes.clear();
            edges.clear();
            nodes.add(data.nodes);
            edges.add(data.edges);
            
            // Center the view after updating
            network.fit();
          });
        </script>
      </body>
      </html>
    `.replace('${this.port}', this.port.toString());
  }

}
