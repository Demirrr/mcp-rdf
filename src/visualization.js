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
      background: '#97C2FC',
      border: '#2B7CE9',
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


// Initialize data structures
const nodes = new vis.DataSet([]);
const edges = new vis.DataSet([]);
const container = document.getElementById('mynetwork');
const data = { nodes: nodes, edges: edges };
const network = new vis.Network(container, data, NETWORK_OPTIONS);
const socket = io(`http://localhost:${window.location.port}`);
let currentGraphData = null;
let showOnlyTypeTriples = false;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const tripleSlider = document.getElementById('tripleSlider');
const tripleCount = document.getElementById('tripleCount');
const typeFilterButton = document.getElementById('typeFilterButton');
const fileInput = document.getElementById('fileInput');

// Event Listeners
socket.on('connect', () => { console.log('Connected to WebSocket'); socket.emit('requestGraph');});

socket.on('graphData', function(data) {
  currentGraphData = data;
  const sliderValue = tripleSlider.value;
  updateVisualization(data, sliderValue);
});

// Search functionality
let searchTimeout = null;
searchInput.addEventListener('input', handleSearchInput);
searchResults.addEventListener('click', handleSearchResultClick);
document.addEventListener('click', handleDocumentClick);

// File upload
fileInput.addEventListener('change', handleFileUpload);

// Triple slider
tripleSlider.addEventListener('input', handleTripleSliderInput);

// Chat functionality
chatInput.addEventListener('keypress', handleChatKeyPress);

// Functions
function handleSearchInput(e) {
  const query = e.target.value.toLowerCase();
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (!query) {
    searchResults.style.display = 'none';
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
      if (edge.label.toLowerCase().includes(query)) {
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
  }, 150);
}

function displaySearchResults(results, query) {
  if (results.length > 0) {
    searchResults.innerHTML = results.map(result => {
      const label = result.label;
      const highlightedLabel = label.replace(
        new RegExp(query, 'gi'),
        match => `<span class="highlight">${match}</span>`
      );
      
      return `
        <div class="search-result-item" data-type="${result.type}" data-id="${result.id}">
          ${result.type === 'node' ? '🔵' : '➡️'} ${highlightedLabel}
        </div>
      `;
    }).join('');
    
    searchResults.style.display = 'block';
  } else {
    searchResults.style.display = 'none';
  }
}

function handleSearchResultClick(e) {
  const resultItem = e.target.closest('.search-result-item');
  if (!resultItem) return;

  const type = resultItem.dataset.type;
  const id = resultItem.dataset.id;

  if (type === 'node') {
    filterAndFocusNode(parseInt(id));
  } else {
    filterAndFocusEdge(id);
  }

  searchResults.style.display = 'none';
  searchInput.value = '';
}

function filterAndFocusNode(nodeId) {
  const filteredData = {
    nodes: currentGraphData.nodes.filter(node => {
      return node.id === nodeId || 
             currentGraphData.edges.some(edge => 
               (edge.from === nodeId && edge.to === node.id) || 
               (edge.to === nodeId && edge.from === node.id)
             );
    }),
    edges: currentGraphData.edges.filter(edge => 
      edge.from === nodeId || edge.to === nodeId
    )
  };

  updateVisualizationWithData(filteredData);
  network.focus(nodeId, {
    scale: 1.5,
    animation: true
  });
}

function filterAndFocusEdge(edgeId) {
  const edge = currentGraphData.edges.find(e => e.id === edgeId);
  if (edge) {
    const filteredData = {
      nodes: currentGraphData.nodes.filter(node => {
        return node.id === edge.from || node.id === edge.to || 
               currentGraphData.edges.some(e => 
                 (e.from === edge.from && e.to === node.id) || 
                 (e.to === edge.from && e.from === node.id) ||
                 (e.from === edge.to && e.to === node.id) || 
                 (e.to === edge.to && e.from === node.id)
               );
      }),
      edges: currentGraphData.edges.filter(e => 
        e.from === edge.from || e.to === edge.from ||
        e.from === edge.to || e.to === edge.to
      )
    };

    updateVisualizationWithData(filteredData);
    network.focus([edge.from, edge.to], {
      scale: 1.5,
      animation: true
    });
  }
}

function handleDocumentClick(e) {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.style.display = 'none';
  }
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) {
    try {
      const text = await file.text();
      const fileExtension = file.name.split('.').pop().toLowerCase();
      
      // Create FormData to send both the file content and its format
      const formData = new FormData();
      formData.append('content', text);
      formData.append('format', fileExtension);
      
      // Let the browser set the correct Content-Type header with boundary
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      if (!result.success) {
        alert('Error loading file: ' + result.error);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error loading file: ' + error.message);
    }
  }
}

function handleTripleSliderInput(e) {
  const value = e.target.value;
  tripleCount.textContent = value;
  if (currentGraphData) {
    updateVisualization(currentGraphData, value);
  }
}

function handleChatKeyPress(e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // Let the default behavior handle the newline in textarea
      return;
    } else {
      e.preventDefault(); // Prevent default Enter behavior
      sendMessage();
    }
  }
}

function toggleTypeFilter() {
  showOnlyTypeTriples = !showOnlyTypeTriples;
  typeFilterButton.textContent = showOnlyTypeTriples ? 'Show All Triples' : 'Show Only Type/Subclass';
  typeFilterButton.style.backgroundColor = showOnlyTypeTriples ? '#FF6B6B' : '#4CAF50';
  
  if (currentGraphData) {
    const sliderValue = tripleSlider.value;
    updateVisualization(currentGraphData, sliderValue);
  }
}

function updateVisualization(data, maxTriplesRatio) {
  nodes.clear();
  edges.clear();

  let filteredEdges = data.edges;
  if (showOnlyTypeTriples) {
    filteredEdges = data.edges.filter(edge => edge.label === 'rdfs:subClassOf');
  }

  const totalTriples = filteredEdges.length;
  const triplesToShow = Math.max(1, Math.floor((maxTriplesRatio / 100) * totalTriples));
  const limitedEdges = filteredEdges.slice(0, triplesToShow);

  const nodeIds = new Set();
  limitedEdges.forEach(edge => {
    nodeIds.add(edge.from);
    nodeIds.add(edge.to);
  });

  const subclassNodeIds = new Set();
  data.edges.forEach(edge => {
    if (edge.label === 'rdfs:subClassOf') {
      subclassNodeIds.add(edge.from);
      subclassNodeIds.add(edge.to);
    }
  });

  const limitedNodes = data.nodes
    .filter(node => nodeIds.has(node.id))
    .map(node => ({
      ...node,
      color: subclassNodeIds.has(node.id)
        ? {
            background: '#FF6B6B',
            border: '#FF0000',
            highlight: { background: '#FFB6B6', border: '#FF0000' }
          }
        : {
            background: '#97C2FC',
            border: '#2B7CE9',
            highlight: { background: '#D2E5FF', border: '#2B7CE9' }
          }
    }));

  nodes.add(limitedNodes);
  edges.add(limitedEdges);

  network.fit();
}

function updateVisualizationWithData(data) {
  nodes.clear();
  edges.clear();
  nodes.add(data.nodes);
  edges.add(data.edges);
}

function addTriple() {
  const subject = document.getElementById('subject').value;
  const predicate = document.getElementById('predicate').value;
  const object = document.getElementById('object').value;

  if (!subject || !predicate || !object) { alert('Please fill in all triple fields.'); return; }
  const newTriple = { subject, predicate, object };
  socket.emit('addTriple', newTriple);

  document.getElementById('subject').value = '';
  document.getElementById('predicate').value = '';
  document.getElementById('object').value = '';
}

function showDownloadDialog() {
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
        </select>
      </div>
      <div class="dialog-buttons">
        <button id="downloadCancel">Cancel</button>
        <button id="downloadConfirm">Download</button>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .download-dialog {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .download-dialog-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;
    }
    .form-group {
      margin: 15px 0;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
    }
    .form-group input,
    .form-group select {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .dialog-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    .dialog-buttons button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    #downloadCancel {
      background: #f0f0f0;
    }
    #downloadConfirm {
      background: #4CAF50;
      color: white;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(dialog);

  // Handle dialog events
  const filenameInput = dialog.querySelector('#downloadFilename');
  const formatSelect = dialog.querySelector('#downloadFormat');
  const cancelButton = dialog.querySelector('#downloadCancel');
  const confirmButton = dialog.querySelector('#downloadConfirm');

  cancelButton.onclick = () => {
    document.body.removeChild(dialog);
    document.head.removeChild(style);
  };

  confirmButton.onclick = () => {
    const filename = filenameInput.value.trim() || 'graph';
    const format = formatSelect.value;
    downloadGraph(filename, format);
    document.body.removeChild(dialog);
    document.head.removeChild(style);
  };
}

function downloadGraph(filename = 'graph', format = 'turtle') {
  // Get the current base URL
  const baseUrl = window.location.origin;
  
  // Request the RDF data from the server with format and filename parameters
  fetch(`${baseUrl}/download?format=${format}&filename=${encodeURIComponent(filename)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.blob();
    })
    .then(blob => {
      // Create a temporary link element
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.${format === 'turtle' ? 'ttl' : format}`;
      
      // Trigger the file save dialog
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up the object URL
      URL.revokeObjectURL(a.href);
    })
    .catch(error => {
      console.error('Error downloading graph:', error);
      alert('Error downloading graph. Please try again.');
    });
}

function addMessage(message, isUser = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'}`;
  messageDiv.textContent = message;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  addMessage(message, true);
  chatInput.value = '';

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        message,
        currentGraphData: getCurrentSubgraph()})
    });

    const data = await response.json();
    
    if (data.content) {
      addMessage(data.content);
    } else {
      addMessage('No response received from the assistant.');
    }
  } catch (error) {
    console.error('Error:', error);
    addMessage('Sorry, there was an error processing your request.');
  }
}

function getCurrentSubgraph() {
  if (!currentGraphData) return null;

  const sliderValue = tripleSlider.value;
  let filteredEdges = currentGraphData.edges;
  
  if (showOnlyTypeTriples) {
    filteredEdges = currentGraphData.edges.filter(edge => edge.label === 'rdfs:subClassOf');
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