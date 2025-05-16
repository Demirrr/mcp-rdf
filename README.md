# MCP-RDF

**Version:** 1.0.1  
**Author:** cdemir  
**License:** ISC

## Description

MCP-RDF is a Node.js server that utilizes the Model Context Protocol (MCP) to manage and interact with RDF-based Knowledge Graphs. It integrates real-time communication through Socket.IO and leverages modern inference libraries such as HuggingFace for intelligent reasoning.

## Features

- RDF Knowledge Graph support
- Real-time communication with Socket.IO
- HuggingFace inference integration
- TypeScript support
- Environment configuration with dotenv
- Built using the Model Context Protocol SDK

## Installation

```bash
# Clone the repository
git clone https://github.com/Demirrr/mcp-rdf
cd mcp-rdf

# Install dependencies
npm install
```

## Usage

### Build

Compile TypeScript source files:

```bash
npm run build
```

### Start

Run the compiled server:

```bash
npm start
```

> Make sure to build the project before starting.

## Environment Variables

Create a `.env` file to configure environment variables required by the server:

```env
# Example:
PORT=3000
```

## Project Structure

```
.
├── src/              # TypeScript source files
├── dist/             # Compiled JavaScript output
├── .env              # Environment variables (not committed)
├── package.json      # Project configuration
├── tsconfig.json     # TypeScript configuration
└── README.md         # Project documentation
```

## Dependencies

### Runtime

- [`@huggingface/inference`](https://www.npmjs.com/package/@huggingface/inference) - Inference API for machine learning models
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - SDK for the Model Context Protocol
- [`dotenv`](https://www.npmjs.com/package/dotenv) - Load environment variables
- [`socket.io`](https://www.npmjs.com/package/socket.io) - Real-time communication library

### Development

- [`typescript`](https://www.npmjs.com/package/typescript) - TypeScript language support
- [`@types/node`](https://www.npmjs.com/package/@types/node) - Node.js type definitions
- [`@types/socket.io`](https://www.npmjs.com/package/@types/socket.io) - TypeScript definitions for Socket.IO

## Scripts

- `npm run build` – Compile TypeScript code into JavaScript (`dist/`)
- `npm start` – Run the server from the compiled output
- `npm test` – Placeholder for test scripts

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

© cdemir, 2025
