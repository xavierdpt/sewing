# Knowledge Tree

A tree of knowledge nodes, indexed by tags, stored in SQLite. You add and reorganise content by
talking to Claude, which works on the tree through MCP tools. A web viewer shows the result.

## First steps

Requires Node.js 18 or later.

```sh
npm install
npm run seed                # optional, once: load the sample content of seed/
npm run build && npm start  # the viewer on http://127.0.0.1:3001
```

`npm run seed` loads a small sample tree that describes this project: how it works inside, examples
of working with Claude, the MCP tooling, and a methodology for specifying work with an agent.
Skip it to start from an empty tree: the first node Claude creates becomes the root. The seed
loads only into an empty database and never deletes existing data; see `seed.md`.

Then start Claude Code in this folder and approve the `knowledge-tree` MCP server when asked.
Ask Claude things like:

- "Show me the tree."
- "Add a note about ... to the knowledge tree."
- "What does the tree say about ...?"

`CLAUDE.md` holds the rules of the tree and the workflows Claude follows. The database
(`data/knowledge.db`) is not versioned; use `node bin/kt.js snapshot --label <name>` to keep a copy.

## Commands

```sh
npm run dev               # API on :3001 + Vite on :5173 (proxies /api), with hot reload
npm run build && npm start  # API + built UI on http://127.0.0.1:3001 (HOST, PORT to change)
npm test                  # invariant and seed tests (in-memory or temporary databases)
npm run check             # verify the invariants on data/knowledge.db
npm run seed              # load seed/ into an empty database (see seed.md)
node bin/kt.js help       # the command-line tool: the same operations as the MCP tools
```

## Stack and layout

| part | tech | where |
|---|---|---|
| frontend (read-only viewer) | HTML, JS, CSS, React 18, built with Vite 5 | `client/` (`index.html`, `src/App.jsx`, `src/styles.css`, `src/api.js`) |
| backend | Node.js (v18) + Express 5 | `server/index.js` (HTTP), `server/ops.js` (operations) |
| database | SQLite via `better-sqlite3` 11 (FTS5 for full-text) | `server/db.js` (schema + rules), file `data/knowledge.db` |
| editing sessions | files on disk | `server/edit-session.js`, folder `data/edit/` |
| MCP server | `@modelcontextprotocol/sdk`, stdio | `mcp/server.js`, registered in `.mcp.json` as `knowledge-tree` |
| CLI | same operations as the MCP tools | `bin/kt.js` |
| seed | one Markdown file per node, YAML front matter (`yaml`) | `seed/`, `scripts/seed.js`, `server/seed-files.js` (see `seed.md`) |
| tests | `node --test` | `test/tree.test.js`, `test/seed.test.js` |

The code runs on the current Node LTS. `package.json` asks for `>=22`, which is what
`better-sqlite3@13` requires; `vite@8` wants `^20.19.0 || >=22.12.0`.

It said "runs on Node 18: keep `better-sqlite3@11` (v12+ needs Node 20/22) and
`vite@5`" until 2026-11-28. That pin existed to match Ubuntu 24.04's archive node,
and Node 18 went end of life in April 2025 — so two dependencies were being held
back to preserve an unsupported runtime. The docker image installs the LTS from
nodejs.org now (`NODE_VERSION` in `docker/knowledge-tree/Dockerfile.build`,
v26.13.1 at the time), and the pins came off: `better-sqlite3@11.10.0` does not
compile on Node 26 at all — `node-gyp` fails in `make` — which is what the old pin
was protecting and is now the reason to drop it.

Environment variables: `KT_DB` (database file), `KT_EDIT_DIR` (editing-session folder),
`KT_SNAPSHOT_DIR` (snapshot folder), `HOST` and `PORT` (web server).

`.mcp.json` starts the MCP server with `node mcp/server.js` from the project folder.
`.claude/settings.json` lets the read tools run without a permission prompt.

## Web UI and HTTP API

- The UI is a **read-only viewer**: tree, tag/text search, node content (Markdown) with a meter of
  its size against the content limit (blue, orange from 75 %, red from 90 %), children and
  links, and a Refresh button to pick up changes. All content editing is done from Claude
  sessions through the MCP / command line tools. Do not add editing features to the UI.
- UI colours are neutral, as CSS variables named by role in `client/src/styles.css`: `--primary`
  `#1e88e5` (with `--primary-dark`, `--primary-light`), `--text` `#162142`, greys `#585a5e`,
  `#a8acb2`, background `#ebf0f7`, `--warning` `#ff6600`, `--danger` `#c94d48`. The font is the
  system sans-serif font (no web font).
- HTTP: `POST /api/ops/<operation>` with the operation input as the JSON body →
  `{result}` or `{error: {code, message}}` (404 for `NOT_FOUND`, 400 for rule violations).
  Only read operations are served: write operations (`write: true` in `server/ops.js`) and local
  file-system operations (`local: true`, e.g. `edit_status`) get 403 `READ_ONLY`. `GET /api/ops`
  lists the read operations.

## Changing the code

- New operation: add it to `ops` in `server/ops.js` (zod input + `run`, and `write: true` if it
  changes the database); it then appears as an MCP tool and a `kt` command, and, if it is a read
  operation, an HTTP endpoint. Document it in the MCP tool table of `CLAUDE.md`. A new read tool
  can be added to the allow list in `.claude/settings.json`.
- Limits (`MAX_CHILDREN`, `MIN_TAGS`, `MAX_TAGS`, `MAX_CONTENT`) live in `server/limits.js`, shared
  by the server and the UI. Changing `MAX_CONTENT` is enough: on open, `KnowledgeTree` rewrites the
  `CHECK` on `nodes.content` of an existing database (refused if a node would exceed a lower limit).
  Restart the web server and the MCP server afterwards: they keep the old limit in memory.
- New rule: enforce it in `server/db.js` (and in SQL when possible), add a test in
  `test/tree.test.js`, extend `check()`, and document it in the rules table of `CLAUDE.md`.
- Seed format: `server/seed-files.js`, tested in `test/seed.test.js`; document changes in
  `seed.md`.
