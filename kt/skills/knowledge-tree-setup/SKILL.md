---
name: knowledge-tree-setup
description: Install the Knowledge Tree project (tag-indexed knowledge tree in SQLite, with MCP tools, a CLI and a read-only web viewer) from GitHub. Clones the repository, installs dependencies, optionally loads the sample seed content (asked, default yes), checks the database and builds the viewer. Use when the user asks to install, set up, clone or get started with the knowledge tree / knowledge-tree-base.
---

# Knowledge Tree: install and initial setup

Repository: `https://github.com/xavierdpt/knowledge-tree-base`

Follow the steps in order. Stop and report on the first failure, with the command's output; do not
work around a failure by editing project files.

## 1. Check the prerequisites

```sh
git --version
node --version   # must be >= 18.18
npm --version
```

If Node.js is missing or older than 18.18, stop and tell the user: the project needs Node 18.18 or
later (it pins `better-sqlite3@11` and `vite@5` to stay compatible with Node 18).

## 2. Clone

- Target folder: the one the user named, otherwise `./knowledge-tree-base` under the current
  directory.
- If the folder already exists:
  - it is a clone of this repository (`git -C <folder> remote get-url origin` points to
    `knowledge-tree-base`) → don't clone again, reuse it and continue at step 3;
  - otherwise → stop and ask the user for another folder. Never delete or overwrite it.

```sh
git clone https://github.com/xavierdpt/knowledge-tree-base <folder>
cd <folder>
```

Run every following command from `<folder>`.

## 3. Install the dependencies

```sh
npm install
```

`better-sqlite3` is a native module: it downloads a prebuilt binary, or compiles one (needs
Python 3, `make` and a C++ compiler). If the install fails on it, report the error and the missing
build tools to the user.

## 4. Ask whether to load the seed

Ask the user with AskUserQuestion, **default yes**:

- **Yes (Recommended)**: load the sample content of `seed/`, a small tree that describes the
  project itself (how it works, examples of working with Claude, the MCP tooling, and the
  "Spec + todo methodology" that `CLAUDE.md` relies on).
- **No**: start from an empty tree; the first node Claude creates becomes the root.

If the user doesn't answer or says "default", load it.

If yes:

```sh
npm run seed
```

The seed loads only into an **empty** database. If it refuses because `data/knowledge.db` already
holds content (a reused folder), tell the user and stop there for the seed: **never delete the
database** to make it pass. Starting over from the seed means deleting `data/knowledge.db`,
`data/knowledge.db-wal` and `data/knowledge.db-shm` after stopping the web server and every Claude
session using the MCP server; do it only if the user explicitly asks, after a snapshot
(`node bin/kt.js snapshot --label before-reseed`).

## 5. Verify

```sh
npm run check     # must return {"problems": []}
npm test          # optional but quick: invariant and seed tests, on temporary databases
```

## 6. Build the viewer

```sh
npm run build
```

Don't start the server unless the user asks. To start it, run `npm start` in the background:
the read-only viewer is then on `http://127.0.0.1:3001` (`HOST` and `PORT` change it).

## 7. Report and hand over

Tell the user, briefly:

- where the project was cloned, and whether the seed was loaded;
- the result of `npm run check` (and `npm test` if run);
- how to open the viewer: `npm start`, then `http://127.0.0.1:3001` (or `npm run dev` for hot
  reload on `:5173`);
- **to use the tree, start Claude Code inside the cloned folder** (`cd <folder> && claude`) and
  approve the `knowledge-tree` MCP server when asked: it is declared in the project's `.mcp.json`,
  so it is only available in sessions started there. `CLAUDE.md` in that folder then gives Claude
  the rules and workflows of the tree;
- things to ask there: "Show me the tree.", "Add a note about ... to the knowledge tree.",
  "What does the tree say about ...?";
- without the MCP server, `node bin/kt.js help` gives the same operations on the command line;
- `data/knowledge.db` is not versioned: keep copies with `node bin/kt.js snapshot --label <name>`.
