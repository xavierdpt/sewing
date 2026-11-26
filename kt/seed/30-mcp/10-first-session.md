---
title: The first Claude Code session
tags: [mcp, claude, setup, permissions, getting-started]
---
1. **Start Claude Code in the project folder.** The MCP server is declared for this folder only,
   and its path (`mcp/server.js`) is relative to it.
2. **Approve the server.** At the first start, Claude Code asks whether to use the MCP servers of
   `.mcp.json`. Accept `knowledge-tree`. The `/mcp` command shows whether it is connected and
   lists its tools (`kt_get_tree`, `kt_create_node`, ...).
3. **Try a read.** Ask "Show me the tree." Claude calls `kt_get_tree`, without a permission
   prompt: the read tools are allowed in `.claude/settings.json`.
4. **Try a write.** Ask Claude to add a small note. Before `kt_create_node`, Claude Code asks you
   to allow the call; you can allow it once, or for the rest of the session. Writes always ask
   unless you allow them yourself.

## When the tools are missing

- `/mcp` shows the server as failed: run `npm install` in the folder, then restart Claude Code.
- The tools answer with an empty tree: the database is new. Run `npm run seed` (sample content),
  or ask Claude to create a first node, which becomes the root.
- Claude falls back to `node bin/kt.js ...` commands: that's the same operations from the
  command line, and works too.
