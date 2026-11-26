---
title: Editing session internals
tags: [editing-session, architecture, files, transactions]
---
How an editing session (the steps are in `CLAUDE.md`) keeps edits safe.

## What the edit folder holds

- `.session.json`, the manifest: when the session started, and for each dumped node its title and
  a SHA-256 hash of its content at dump time.
- `<id>.md` per dumped node: the raw content, nothing else (no title, no tags).

There is no other state: the MCP server and the `kt` command line read the same folder, so a
session started with one can be closed with the other.

## How changes are detected

- A file is **modified** when the hash of its text differs from the hash in the manifest.
- A node was **changed in the database since its dump** when the hash of its current content
  differs from the manifest. The close then refuses that node rather than overwrite the other
  change: merge by hand, or dump it again.

## Why the close is all or nothing

The close first checks every file (size, deleted files, files that were never dumped, changes
in the database). If anything is wrong, it lists every problem at once and writes nothing. Only
then does it write all the modified contents in one transaction, so the tree never holds half of
a multi-node edit.

Clearing the folder removes only `.md` files and the manifest: other files in it are left alone.
