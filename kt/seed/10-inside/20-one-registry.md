---
title: One operation, three entry points
tags: [architecture, mcp, cli, http-api, operations]
links:
  - to: inside/data-model
    note: every operation ends in the storage layer, where the rules are enforced
---
Every operation on the tree is declared once, in the `ops` registry of `server/ops.js`. An
entry has a description, an input schema (zod) and a `run` function that calls the storage
layer (`KnowledgeTree` in `server/db.js`). Some entries are marked `write: true` (they change the
database) or `local: true` (they touch local files, like snapshots or the edit folder).

Three entry points read that one registry:

| entry point | file | what it exposes |
|---|---|---|
| MCP server (stdio) | `mcp/server.js` | every operation, as a tool named `kt_<operation>` |
| command line | `bin/kt.js` | every operation, as `kt <operation> --option value` |
| HTTP API, used by the viewer | `server/index.js` | read operations only: write and local ones get 403 `READ_ONLY` |

All three go through the same `runOp` function, which validates the input against the schema
(unknown fields are refused, with `INVALID_INPUT`) before running the operation. So a tool, a
command and an HTTP call with the same input give the same result and the same errors.

## Consequences

- Adding an operation to the registry is enough to get the MCP tool and the command; the tool
  description that Claude reads is the registry's `description`.
- The viewer cannot change the tree, even by calling the API by hand.
- The MCP server and the command line can be used at the same time on the same database: SQLite
  serialises the writes.
