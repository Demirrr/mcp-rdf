import { Socket as IOSocket } from 'socket.io';

export interface CurrentGraphData {
  nodes: Array<{ id: number; label: string }>;
  edges: Array<{ from: number; to: number; label: string }>;
}

export interface ChatRequest {
  message: string;
  currentGraphData: CurrentGraphData;
}

export interface AddTripleArgs {
  subject: string;
  predicate: string;
  object: string;
}

export interface ClientSocket extends IOSocket {}

export interface VisualizationData {
  nodes: Array<{ id: number; label: string; shape: string }>;
  edges: Array<{ id: string; from: number; to: number; label: string; arrows: string }>;
} 