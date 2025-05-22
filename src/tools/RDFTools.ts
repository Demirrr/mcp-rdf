import { RDFKnowledgeGraphManager } from '../RDFManager';
import { AddTripleArgs, CurrentGraphData } from '../interfaces/interface_visualizer';
import { Server as SocketIOServer } from 'socket.io';

export class RDFTools {
  private graphManager: RDFKnowledgeGraphManager;
  private io: SocketIOServer;

  constructor(graphManager: RDFKnowledgeGraphManager, io: SocketIOServer) {
    this.graphManager = graphManager;
    this.io = io;
  }

  async get_number_of_triples(currentGraphData: CurrentGraphData): Promise<string> {
    const count = currentGraphData?.edges?.length ?? 0;
    return `There ${count === 1 ? 'is' : 'are'} ${count} triple${count === 1 ? '' : 's'} in the graph.`;
  }

  async addTriple(args: AddTripleArgs): Promise<{ success: true; message: string }> {
    await this.graphManager.updateGraph(graph => {
      graph.triples.push(args);
    });
    await this.fetchAndSendGraphData();
    return { success: true, message: 'Triple added successfully' };
  }

  async addTriples(args: { triples: AddTripleArgs[] }): Promise<{ success: true; message: string }> {
    await this.graphManager.updateGraph(graph => {
      graph.triples.push(...args.triples);
    });
    await this.fetchAndSendGraphData();
    return { success: true, message: `Successfully added ${args.triples.length} triples` };
  }

  async removeTriple(args: AddTripleArgs): Promise<{ success: true; message: string }> {
    let removed = false;
    await this.graphManager.updateGraph(graph => {
      const initialLength = graph.triples.length;
      graph.triples = graph.triples.filter(triple => 
        !(triple.subject === args.subject && 
          triple.predicate === args.predicate && 
          triple.object === args.object)
      );
      removed = graph.triples.length < initialLength;
    });
    await this.fetchAndSendGraphData();
    return { 
      success: true, 
      message: removed ? 'Triple removed successfully' : 'Triple not found in the graph' 
    };
  }

  async removeTriples(args: { triples: AddTripleArgs[] }): Promise<{ success: true; message: string }> {
    let removedCount = 0;
    await this.graphManager.updateGraph(graph => {
      const initialLength = graph.triples.length;
      graph.triples = graph.triples.filter(triple => {
        const shouldRemove = args.triples.some(t => 
          t.subject === triple.subject && 
          t.predicate === triple.predicate && 
          t.object === triple.object
        );
        if (shouldRemove) removedCount++;
        return !shouldRemove;
      });
    });
    await this.fetchAndSendGraphData();
    return { 
      success: true, 
      message: `Successfully removed ${removedCount} triples` 
    };
  }

  private async fetchAndSendGraphData() {
    try {
      const graph = await this.graphManager.readGraph();
      const visualizationData = this.convertToVisualization(graph);
      this.io.emit('graphData', visualizationData);
    } catch (error) {
      console.error('Error fetching and sending graph data:', error);
      this.io.emit('error', 'Failed to load graph data for clients');
    }
  }

  private convertToVisualization(graph: any) {
    const nodes = new Set<string>();
    const edges: Array<{ id: string; from: number; to: number; label: string; arrows: string }> = [];
    const nodeMap = new Map<string, number>();
    let nodeIdCounter = 0;

    graph.triples.forEach((triple: any) => {
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

    graph.triples.forEach((triple: any, index: number) => {
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