# MCP RDF Server

A Model Context Protocol (MCP) server implementation for RDF Knowledge Graph.

## Installation

You can install the package globally via npm:

```bash
npm install -g mcp-rdf
```

## Running from Source

### Prerequisites

- Node.js (>= 18)
- npm

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/Demirrr/mcp-rdf.git
cd mcp-rdf
```

2. Install dependencies:
```bash
npm install --save-dev @types/node

npm run build && npm start
```

## Using Pre-built Executables

We provide pre-built executables for different platforms in the `bin` directory:

- Linux: `bin/mcp-rdf-linux`
- macOS: `bin/mcp-rdf-macos`
- Windows: `bin/mcp-rdf-win.exe`

### Running the Executables

#### Linux
```bash
./bin/mcp-rdf-linux
```

#### macOS
```bash
./bin/mcp-rdf-macos
```

#### Windows
```bash
.\bin\mcp-rdf-win.exe
```

## Building Executables

If you want to build the executables yourself:

1. Install pkg globally:
```bash
npm install -g pkg
```

2. Build the executables:
```bash
pkg . --targets node18-linux-x64,node18-macos-x64,node18-win-x64 --output bin/mcp-rdf
```

## Features

- MCP server implementation for RDF Knowledge Graph
- TypeScript support
- Cross-platform executables
- Easy to use CLI interface

## License

ISC 