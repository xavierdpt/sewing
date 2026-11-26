---
title: Using the tree from other agents and scripts
tags: [mcp, cli, agents, scripts]
links:
  - to: inside/one-registry
    note: the MCP tools and the kt commands are the same operations
---
## Other MCP clients

Any agent that can start a stdio MCP server can use the tree: the command is `node`, and the
argument is the path of `mcp/server.js`. Outside the project folder, give the absolute path. For
example, for Codex, in its configuration file:

```toml
[mcp_servers.knowledge-tree]
command = "node"
args = ["/absolute/path/to/the/project/mcp/server.js"]
```

The agent then sees the same `kt_*` tools. It doesn't read `CLAUDE.md` by itself: point it to
that file (or copy its rules into the agent's own instructions), or it won't know the workflows.

## Scripts

`node bin/kt.js <operation> --option value` runs any operation and prints JSON, so it fits shell
scripts and other programs. Errors go to stderr with exit status 1, and `kt check` also exits 1
when the tree has a problem, which makes it usable as a check in a script.

## Several clients at once

The MCP server, the command line and the viewer can all run on the same database at the same
time. The database file can be changed with the `KT_DB` environment variable, for example to
keep a separate tree for tests.
