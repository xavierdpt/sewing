---
title: Data model and where each rule is enforced
tags: [sqlite, architecture, data-model, triggers, full-text]
links:
  - to: inside/editing-session-internals
    note: an editing session writes content through the same table and checks
---
The tree is one SQLite file, opened with `better-sqlite3` in WAL mode. Four tables hold it:

| table | holds |
|---|---|
| `nodes` | `id`, `parent_id`, `title`, `content`, `position` (order among siblings), creation and update dates |
| `node_tags` | one row per (node, tag) |
| `links` | `from_id`, `to_id`, `note` |
| `nodes_fts` | an FTS5 full-text index over title and content, kept in sync by triggers |

## Where each rule lives

Most rules are checked twice: first in `server/db.js`, which gives a clear error code and message,
then by the database itself, as a safety net.

| rule | in the code | in the database |
|---|---|---|
| one root | `createNode` refuses a second root | a unique index on the nodes whose `parent_id` is null |
| at most 5 children | checked before inserting or moving | `BEFORE INSERT` and `BEFORE UPDATE OF parent_id` triggers |
| 1 to 10 tags | checked on every tag change | a trigger refuses an 11th tag row |
| content size | checked before writing | a `CHECK` on the length of `content` |
| no self-link | — | a `CHECK (from_id <> to_id)` on `links` |
| no link to an ancestor | checked on link, move and split | — (the ancestry is recursive; `check()` finds any that slipped through) |

A split creates its group nodes under a parent that is still full, before moving the children into
them. For that moment only, a flag row in a small table, `kt_split_in_progress`, switches off the
children triggers. The flag never survives the transaction.

## Tags

Tags are normalised before they are stored: trimmed, lowercased, spaces, `_` and `/` turned into
`-`, other characters dropped, at most 40 characters. So "Full Text", "full_text" and "full-text"
are the same tag.

## Full-text search

`kt_search_text` queries `nodes_fts`, so it finds words in titles and content, with a snippet
around the match. Tags are not in this index: tag search goes through `node_tags`.
