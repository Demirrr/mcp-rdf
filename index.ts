import { RDFKnowledgeGraphManager } from "./src/RDFManager";
import { RDFVisualizer } from "./src/RDFVisualizer";

const rdfManager = new RDFKnowledgeGraphManager();
const visualizer = new RDFVisualizer(rdfManager, 4000, "./src/visualization.html");
// Initialize the visualization server
visualizer.initialize();