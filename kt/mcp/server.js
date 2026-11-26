#!/usr/bin/env node
// MCP server (stdio) exposing the knowledge tree operations as kt_* tools.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KnowledgeTree } from '../server/db.js';
import { ops, runOp } from '../server/ops.js';

const kt = new KnowledgeTree();
const server = new McpServer({ name: 'knowledge-tree', version: '0.1.0' });

for (const [name, op] of Object.entries(ops)) {
  server.registerTool(`kt_${name}`, { description: op.description, inputSchema: op.input }, async (args) => {
    try {
      const result = await runOp(kt, name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `${e.code || 'ERROR'}: ${e.message}` }] };
    }
  });
}

await server.connect(new StdioServerTransport());
