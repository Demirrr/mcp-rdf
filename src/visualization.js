/**
 * Network visualization configuration
 * Contains all the settings for the vis.js network visualization
 */
const NETWORK_OPTIONS = {
  nodes: {
    shape: 'dot',
    size: 15,
    font: { size: 14 },
    color: {
      background: '#97C2FC', // Default node background
      border: '#2B7CE9',     // Default node border
      highlight: {
        background: '#D2E5FF',
        border: '#2B7CE9'
      }
    }
  },
  edges: {
    font: { size: 14, align: 'middle' },
    color: 'gray',
    arrows: { to: true },
    smooth: false, // Disabling smooth edges for potentially clearer straight lines
    width: 2
  },
  physics: {
    enabled: true,
    barnesHut: {
      gravitationalConstant: -2000,
      centralGravity: 0.3,
      springLength: 95,
      springConstant: 0.04,
      damping: 0.09 // Add damping for more stable physics
    },
    minVelocity: 0.75
  },
  interaction: {
    hover: true, // Enable hover effects
    tooltipDelay: 300,
    hideEdgesOnDrag: true
  }
};

// Initialize data structures for vis.js
const nodes = new vis.DataSet([]);
const edges = new vis.DataSet([]);
const container = document.getElementById('mynetwork');
const data = { nodes: nodes, edges: edges };
const network = new vis.Network(container, data, NETWORK_OPTIONS);

// WebSocket connection
const socket = io(`http://localhost:${window.location.port}`);

// Global state variables
let currentGraphData = null; // Stores the full graph data received from the server
let showOnlyTypeTriples = false; // Flag to filter by rdfs:subClassOf

// DOM Elements - Using constants for better maintainability
const DOM = {
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  tripleSlider: document.getElementById('tripleSlider'),
  tripleCount: document.getElementById('tripleCount'),
  typeFilterButton: document.getElementById('typeFilterButton'),
  fileInput: document.getElementById('fileInput'),
  subjectInput: document.getElementById('subject'),
  predicateInput: document.getElementById('predicate'),
  objectInput: document.getElementById('object'),
  downloadDialogContainer: document.getElementById('downloadDialogContainer')
};

// --- Event Listeners ---

/**
 * Handles WebSocket connection and initial graph request.
 */
socket.on('connect', () => {
  console.log('Connected to WebSocket');
  socket.emit('requestGraph'); // Request initial graph data on connect
});

/**
 * Handles incoming graph data from the WebSocket.
 * @param {object} data - The graph data containing nodes and edges.
 */
socket.on('graphData', function(data) {
  currentGraphData = data;
  const sliderValue = DOM.tripleSlider.value;
  updateVisualization(data, sliderValue);
});

// Search functionality event listeners
let searchTimeout = null;
DOM.searchInput.addEventListener('input', handleSearchInput);
DOM.searchResults.addEventListener('click', handleSearchResultClick);
document.addEventListener('click', handleDocumentClick);

// File upload event listener
DOM.fileInput.addEventListener('change', handleFileUpload);

// Triple slider event listener
DOM.tripleSlider.addEventListener('input', handleTripleSliderInput);

// Chat functionality event listener
DOM.chatInput.addEventListener('keypress', handleChatKeyPress);

// --- Functions ---

/**
 * Handles input on the search field, debouncing the search query.
 * @param {Event} e - The input event.
 */
function handleSearchInput(e) {
  const query = e.target.value.toLowerCase();
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (!query) {
    DOM.searchResults.style.display = 'none';
    return;
  }

  searchTimeout = setTimeout(() => {
    if (!currentGraphData) return;

    const results = [];
    
    currentGraphData.nodes.forEach(node => {
      if (node.label.toLowerCase().includes(query)) {
        results.push({
          type: 'node',
          id: node.id,
          label: node.label
        });
      }
    });

    currentGraphData.edges.forEach(edge => {
      if (edge.label.toLowerCase().includes(query) || 
          (edge.title && edge.title.toLowerCase().includes(query))) { // Search edge title as well if available
        results.push({
          type: 'edge',
          id: edge.id,
          label: edge.label,
          from: edge.from,
          to: edge.to
        });
      }
    });

    displaySearchResults(results, query);
  }, 250); // Debounce for 250ms
}

/**
 * Displays search results in the search results container.
 * @param {Array<object>} results - An array of search result objects.
 * @param {string} query - The search query.
 */
function displaySearchResults(results, query) {
  if (results.length > 0) {
    DOM.searchResults.innerHTML = results.map(result => {
      const label = result.label;
      // Highlight the matched part of the label
      const highlightedLabel = label.replace(
        new RegExp(query, 'gi'),
        match => `<span class="highlight">${match}</span>`
      );
      
      return `
        <div class="search-result-item" data-type="${result.type}" data-id="${result.id}" role="option">
          ${result.type === 'node' ? '🔵' : '➡️'} ${highlightedLabel}
        </div>
      `;
    }).join('');
    
    DOM.searchResults.style.display = 'block';
  } else {
    DOM.searchResults.style.display = 'none';
  }
}

/**
 * Handles click events on search result items.
 * @param {Event} e - The click event.
 */
function handleSearchResultClick(e) {
  const resultItem = e.target.closest('.search-result-item');
  if (!resultItem) return;

  const type = resultItem.dataset.type;
  const id = (type === 'node') ? parseInt(resultItem.dataset.id) : resultItem.dataset.id; // Node IDs are numbers, edge IDs might be strings

  if (type === 'node') {
    filterAndFocusNode(id);
  } else {
    filterAndFocusEdge(id);
  }

  DOM.searchResults.style.display = 'none';
  DOM.searchInput.value = ''; // Clear search input after selection
}

/**
 * Filters the graph to show a specific node and its immediate neighbors, then focuses on it.
 * @param {number} nodeId - The ID of the node to filter and focus on.
 */
function filterAndFocusNode(nodeId) {
  if (!currentGraphData) return;

  const connectedEdges = currentGraphData.edges.filter(edge => 
    edge.from === nodeId || edge.to === nodeId
  );

  const connectedNodeIds = new Set([nodeId]);
  connectedEdges.forEach(edge => {
    connectedNodeIds.add(edge.from);
    connectedNodeIds.add(edge.to);
  });

  const filteredData = {
    nodes: currentGraphData.nodes.filter(node => connectedNodeIds.has(node.id)),
    edges: connectedEdges
  };

  updateVisualizationWithData(filteredData);
  network.focus(nodeId, {
    scale: 1.5,
    animation: {duration: 500, easingFunction: "easeOutQuart"}
  });
}

/**
 * Filters the graph to show a specific edge and its connected nodes, then focuses on them.
 * @param {string} edgeId - The ID of the edge to filter and focus on.
 */
function filterAndFocusEdge(edgeId) {
  if (!currentGraphData) return;

  const edge = currentGraphData.edges.find(e => e.id === edgeId);
  if (edge) {
    const nodeIds = new Set([edge.from, edge.to]);
    
    // Include all edges connected to these two nodes
    const relatedEdges = currentGraphData.edges.filter(e => 
      nodeIds.has(e.from) || nodeIds.has(e.to)
    );

    // Collect all nodes connected by these related edges
    relatedEdges.forEach(e => {
      nodeIds.add(e.from);
      nodeIds.add(e.to);
    });

    const filteredData = {
      nodes: currentGraphData.nodes.filter(node => nodeIds.has(node.id)),
      edges: relatedEdges
    };

    updateVisualizationWithData(filteredData);
    network.focus([edge.from, edge.to], {
      scale: 1.5,
      animation: {duration: 500, easingFunction: "easeOutQuart"}
    });
  }
}

/**
 * Hides search results when clicking outside the search input and results.
 * @param {Event} e - The click event.
 */
function handleDocumentClick(e) {
  if (!DOM.searchInput.contains(e.target) && !DOM.searchResults.contains(e.target)) {
    DOM.searchResults.style.display = 'none';
  }
}

/**
 * Handles file upload, sending the content to the server.
 * @param {Event} event - The file input change event.
 */
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) {
    try {
      const text = await file.text();
      const fileExtension = file.name.split('.').pop().toLowerCase();
      
      const formData = new FormData();
      formData.append('content', text);
      formData.append('format', fileExtension); // Send format for server-side parsing

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        alert('Error loading file: ' + result.error);
      }
      // The server will emit 'graphData' on success, which will update the visualization
    } catch (error) {
      console.error('Error:', error);
      alert('Error loading file: ' + error.message);
    } finally {
      event.target.value = ''; // Clear the file input to allow re-uploading the same file
    }
  }
}

/**
 * Handles input from the triple slider, updating the displayed triple count and visualization.
 * @param {Event} e - The input event.
 */
function handleTripleSliderInput(e) {
  const value = e.target.value;
  DOM.tripleCount.textContent = `${value}%`;
  if (currentGraphData) {
    updateVisualization(currentGraphData, value);
  }
}

/**
 * Handles key presses in the chat input, specifically for sending messages on Enter.
 * Allows Shift+Enter for newlines.
 * @param {KeyboardEvent} e - The keyboard event.
 */
function handleChatKeyPress(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Prevent default Enter behavior (newline)
    sendMessage();
  }
}

/**
 * Toggles the filter to show only 'rdfs:subClassOf' triples.
 */
function toggleTypeFilter() {
  showOnlyTypeTriples = !showOnlyTypeTriples;
  DOM.typeFilterButton.textContent = showOnlyTypeTriples ? 'Show All' : 'Type/Class Only';
  DOM.typeFilterButton.style.backgroundColor = showOnlyTypeTriples ? '#FF6B6B' : '#4CAF50';
  
  if (currentGraphData) {
    const sliderValue = DOM.tripleSlider.value;
    updateVisualization(currentGraphData, sliderValue);
  }
}

/**
 * Updates the vis.js network visualization based on current graph data and filter settings.
 * @param {object} data - The complete graph data (nodes and edges).
 * @param {string} maxTriplesRatio - The percentage (as a string, e.g., "75") of triples to display.
 */
function updateVisualization(data, maxTriplesRatio) {
  nodes.clear();
  edges.clear();

  let filteredEdges = data.edges;
  if (showOnlyTypeTriples) {
    // Filter for rdfs:subClassOf and rdf:type triples
    filteredEdges = data.edges.filter(edge => 
      edge.label === 'rdfs:subClassOf' || edge.label === 'rdf:type'
    );
  }

  const totalTriples = filteredEdges.length;
  // Calculate how many triples to show based on the slider percentage
  const triplesToShow = Math.max(1, Math.floor((maxTriplesRatio / 100) * totalTriples));
  const limitedEdges = filteredEdges.slice(0, triplesToShow);

  const nodeIdsInView = new Set();
  limitedEdges.forEach(edge => {
    nodeIdsInView.add(edge.from);
    nodeIdsInView.add(edge.to);
  });

  // Identify nodes that are part of 'rdfs:subClassOf' or 'rdf:type' relationships
  const typeRelationNodeIds = new Set();
  data.edges.forEach(edge => {
    if (edge.label === 'rdfs:subClassOf' || edge.label === 'rdf:type') {
      typeRelationNodeIds.add(edge.from);
      typeRelationNodeIds.add(edge.to);
    }
  });

  const limitedNodes = data.nodes
    .filter(node => nodeIdsInView.has(node.id))
    .map(node => ({
      ...node,
      // Apply a specific color for nodes involved in type/subclass relations
      color: typeRelationNodeIds.has(node.id)
        ? {
            background: '#FF6B6B', // Reddish background
            border: '#FF0000',     // Red border
            highlight: { background: '#FFB6B6', border: '#FF0000' }
          }
        : { // Default color from NETWORK_OPTIONS
            background: NETWORK_OPTIONS.nodes.color.background,
            border: NETWORK_OPTIONS.nodes.color.border,
            highlight: NETWORK_OPTIONS.nodes.color.highlight
          }
    }));

  nodes.add(limitedNodes);
  edges.add(limitedEdges);

  network.fit(); // Adjusts view to fit all nodes
}

/**
 * Clears the current visualization and adds a new set of nodes and edges.
 * Useful for filtered views.
 * @param {object} data - The data object containing nodes and edges to display.
 */
function updateVisualizationWithData(data) {
  nodes.clear();
  edges.clear();
  nodes.add(data.nodes);
  edges.add(data.edges);
  network.fit();
}

/**
 * Sends a new triple to the server to be added to the graph.
 */
function addTriple() {
  const subject = DOM.subjectInput.value.trim();
  const predicate = DOM.predicateInput.value.trim();
  const object = DOM.objectInput.value.trim();

  if (!subject || !predicate || !object) {
    alert('Please fill in all triple fields (Subject, Predicate, Object).');
    return;
  }
  const newTriple = { subject, predicate, object };
  socket.emit('addTriple', newTriple);

  // Clear input fields after sending
  DOM.subjectInput.value = '';
  DOM.predicateInput.value = '';
  DOM.objectInput.value = '';
}

/**
 * Displays a modal dialog for downloading the graph.
 */
function showDownloadDialog() {
  // Remove existing dialog if any
  if (DOM.downloadDialogContainer.firstChild) {
    DOM.downloadDialogContainer.innerHTML = '';
  }

  const dialog = document.createElement('div');
  dialog.className = 'download-dialog';
  dialog.innerHTML = `
    <div class="download-dialog-content">
      <h3>Download Graph</h3>
      <div class="form-group">
        <label for="downloadFilename">Filename:</label>
        <input type="text" id="downloadFilename" value="graph" />
      </div>
      <div class="form-group">
        <label for="downloadFormat">Format:</label>
        <select id="downloadFormat">
          <option value="turtle">Turtle (.ttl)</option>
          <option value="ntriples">N-Triples (.nt)</option>
          <option value="nquads">N-Quads (.nq)</option>
          <option value="trig">TriG (.trig)</option>
          <option value="jsonld">JSON-LD (.jsonld)</option>
        </select>
      </div>
      <div class="dialog-buttons">
        <button id="downloadCancel">Cancel</button>
        <button id="downloadConfirm" class="primary-button">Download</button>
      </div>
    </div>
  `;

  DOM.downloadDialogContainer.appendChild(dialog); // Append to a dedicated container
  DOM.downloadDialogContainer.classList.add('visible'); // Show the dialog

  // Attach event listeners to dialog elements
  const filenameInput = dialog.querySelector('#downloadFilename');
  const formatSelect = dialog.querySelector('#downloadFormat');
  const cancelButton = dialog.querySelector('#downloadCancel');
  const confirmButton = dialog.querySelector('#downloadConfirm');

  cancelButton.onclick = () => {
    DOM.downloadDialogContainer.classList.remove('visible');
    setTimeout(() => {
      DOM.downloadDialogContainer.innerHTML = '';
    }, 300); // Wait for fade out animation
  };

  confirmButton.onclick = () => {
    const filename = filenameInput.value.trim() || 'graph';
    const format = formatSelect.value;
    downloadGraph(filename, format);
    DOM.downloadDialogContainer.classList.remove('visible');
    setTimeout(() => {
      DOM.downloadDialogContainer.innerHTML = '';
    }, 300); // Wait for fade out animation
  };
}

/**
 * Initiates the download of the current RDF graph from the server.
 * @param {string} filename - The desired filename for the downloaded file.
 * @param {string} format - The desired RDF format (e.g., 'turtle', 'ntriples').
 */
function downloadGraph(filename = 'graph', format = 'turtle') {
  const baseUrl = window.location.origin;
  
  fetch(`${baseUrl}/download?format=${format}&filename=${encodeURIComponent(filename)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format === 'turtle' ? 'ttl' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url); // Clean up the object URL
    })
    .catch(error => {
      console.error('Error downloading graph:', error);
      alert('Error downloading graph. Please try again. ' + error.message);
    });
}

/**
 * Adds a chat message to the display.
 * @param {string} message - The message content.
 * @param {boolean} isUser - True if the message is from the user, false if from the assistant.
 */
function addMessage(message, isUser = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'}`;
  messageDiv.textContent = message;
  DOM.chatMessages.appendChild(messageDiv);
  DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight; // Scroll to bottom
}

/**
 * Sends the user's chat message to the server and displays the assistant's response.
 */
async function sendMessage() {
  const message = DOM.chatInput.value.trim();
  if (!message) return;

  addMessage(message, true);
  DOM.chatInput.value = ''; // Clear input

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        message,
        currentGraphData: getCurrentSubgraph() // Send the *currently visualized* subgraph
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.content) {
      addMessage(data.content);
    } else {
      addMessage('No meaningful response received from the assistant.');
    }
  } catch (error) {
    console.error('Error sending chat message:', error);
    addMessage('Sorry, there was an error processing your request. Please try again.');
  }
}

/**
 * Retrieves the currently displayed subgraph based on slider value and type filter.
 * This is used when sending graph context to the chat AI.
 * @returns {object|null} The subgraph data (nodes and edges) or null if no graph data.
 */
function getCurrentSubgraph() {
  if (!currentGraphData) return null;

  const sliderValue = DOM.tripleSlider.value;
  let filteredEdges = currentGraphData.edges;
  
  if (showOnlyTypeTriples) {
    filteredEdges = currentGraphData.edges.filter(edge => 
      edge.label === 'rdfs:subClassOf' || edge.label === 'rdf:type'
    );
  }

  const totalTriples = filteredEdges.length;
  const triplesToShow = Math.max(1, Math.floor((sliderValue / 100) * totalTriples));
  const limitedEdges = filteredEdges.slice(0, triplesToShow);

  const nodeIds = new Set();
  limitedEdges.forEach(edge => {
    nodeIds.add(edge.from);
    nodeIds.add(edge.to);
  });

  const limitedNodes = currentGraphData.nodes.filter(node => nodeIds.has(node.id));

  return {
    nodes: limitedNodes,
    edges: limitedEdges
  };
}

/**
 * Clears the entire RDF graph, both visualization and on the server.
 */
function clearGraph() {
  if (confirm('Are you sure you want to clear the entire RDF graph? This action cannot be undone.')) {
    // Clear the visualization
    nodes.clear();
    edges.clear();
    currentGraphData = null; // Clear local data
    
    // Notify the server to clear the graph
    socket.emit('clearGraph');
    
    // Reset UI elements
    DOM.tripleSlider.value = 100;
    DOM.tripleCount.textContent = '100%';
    showOnlyTypeTriples = false;
    DOM.typeFilterButton.textContent = 'Type/Class Only';
    DOM.typeFilterButton.style.backgroundColor = '#4CAF50';
    
    addMessage('Graph cleared successfully.');
  }
}

// --- Panel Management ---

/**
 * Initializes draggable functionality for panels.
 */
function initializeDraggablePanels() {
  const draggables = document.querySelectorAll('.draggable');
  
  draggables.forEach(panel => {
    const header = panel.querySelector('.panel-header');
    let isDragging = false;
    let initialX, initialY;
    let xOffset = 0, yOffset = 0;

    // Get current computed style to set initial position relative to its parent
    const computedStyle = window.getComputedStyle(panel);
    const matrix = new DOMMatrixReadOnly(computedStyle.transform);
    xOffset = matrix.m41;
    yOffset = matrix.m42;

    header.addEventListener('mousedown', dragStart);

    function dragStart(e) {
      // Only start dragging if the mousedown is on the header itself, not children like buttons
      if (e.target === header || Array.from(header.children).includes(e.target)) {
        isDragging = true;
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        panel.style.cursor = 'grabbing'; // Change cursor to indicate dragging
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
      }
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault(); // Prevent text selection etc.
        xOffset = e.clientX - initialX;
        yOffset = e.clientY - initialY;
        panel.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
      }
    }

    function dragEnd() {
      isDragging = false;
      panel.style.cursor = 'grab'; // Reset cursor
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', dragEnd);
    }
  });
}

/**
 * Toggles the collapsed state of a panel.
 * @param {string} panelType - The type of panel (e.g., 'chat', 'controls').
 */
function togglePanel(panelType) {
  const panel = document.querySelector(`.${panelType}-container`);
  const content = panel.querySelector('.panel-content');
  const button = panel.querySelector('.minimize-btn');
  
  content.classList.toggle('collapsed');
  
  const isCollapsed = content.classList.contains('collapsed');

  button.textContent = isCollapsed ? '+' : '++';
  
  if (isCollapsed) {
    content.style.display = 'none'; // Hide content entirely
    panel.style.height = panel.querySelector('.panel-header').offsetHeight + 'px'; // Collapse to header height
    // Disable all interactive elements inside the collapsed content
    const interactiveElements = content.querySelectorAll('input, button, select, textarea');
    interactiveElements.forEach(element => {
      element.disabled = true;
      element.setAttribute('tabindex', '-1'); // Make them not focusable
    });
  } else {
    content.style.display = 'block'; // Show content
    panel.style.height = 'auto'; // Restore original height (or let CSS handle it)
    // Re-enable interactive elements
    const interactiveElements = content.querySelectorAll('input, button, select, textarea');
    interactiveElements.forEach(element => {
      element.disabled = false;
      element.removeAttribute('tabindex');
    });
  }
}

// Initialize draggable panels when the document is loaded
document.addEventListener('DOMContentLoaded', initializeDraggablePanels);