# The tree's database is committed whole — SPEC

Paired with [tree-commit-todo.md](tree-commit-todo.md) (rule 11).

## 0. The premise

**From the user, 2026-11-28:** *"It's your job to deal with knowledge.db
properly."*

Said after I had reported, twice, that `docs/knowledge.db` showed unmodified
in `git status` while two new nodes existed — and left it as a decision for
the user. It is not a decision; it is a defect with a measurement and a fix,
and reporting it instead of fixing it is the opposite of what the repository
asks (rule 1: the diagnosis *is* the data, and then it gets fixed).

## 1. What was wrong, measured

SQLite in WAL mode writes into `docs/knowledge.db-wal` and only folds those
pages into the main file at a checkpoint — which normally happens when the
last connection closes. The `knowledge-tree` MCP server holds its connection
open for the whole session, so nothing written through it had reached the
committed file.

Measured 2026-11-27/28 by copying `docs/knowledge.db` **alone** into a
scratch folder and reading it with `kt get_tree` (the side-files left
behind, which is exactly what a clone sees):

| | nodes the file alone contains |
|---|---|
| before the checkpoint | **12** |
| with the `-wal` | **14** |
| after the checkpoint | **14** |

So a commit at that moment would have carried a tree without *The menubar
and its floating dialogs* (14) or *No control answers into the console* (15)
— each referenced by a document that *was* committed, which is worse than
missing: a dangling reference into the tree reads as a tree that lost
something.

**Earlier commits are intact**, checked the same way — `b1f3abe` 7 nodes,
`8b21748` 12, `62198a6` 12, each matching what existed then. The trap only
bites when nodes are written and committed inside one session, with the
server up throughout.

## 2. The fix, and why it is this one

`PRAGMA wal_checkpoint(TRUNCATE)` on `docs/knowledge.db`, which returned
`0|0|0` — **not busy, log empty, nothing left to copy** — leaving the `-wal`
at 0 bytes and the main file at 258048 bytes, up from 253952.

**On rule 0's "never write to the database with raw SQL":** that rule
protects the tree's invariants — one parent, 1-10 tags, 5 children, 8192
characters — which are enforced in `kt/`. A checkpoint writes no content and
changes no row; it moves committed pages from one file to another. The
content path stayed `kt`, and `kt check` reports `problems: []` before and
after. A `kt snapshot --label before-wal-checkpoint` was taken first
(`kt/data/` is gitignored, so it is not committed litter).

## 3. The resolved questions

1. **Why not just commit the `-wal` too?** Because it is a journal, not
   content: it is only meaningful beside the exact main file it was written
   against, and `.gitignore` excludes it for that reason. Committing a
   database and its journal separately is how a tree arrives corrupt.
2. **Should the checkpoint be automatic?** *Yes, and it is* — `kt/server/db.js`,
   in `tx()`, which every write already passes, and in `close()`. This was
   first written down as a proposal "waiting on the user"; the user rejected
   that framing (*"You're responsible for that so organize yourself"*), and
   rightly: rules 3 and 10 reserve "propose, don't perform" for deleting
   code that still works and for inventing new tooling, not for repairing a
   defect already diagnosed. The manual command stays in `CLAUDE.md` for a
   checkpoint that finds the file busy, and for a database written by older
   code.
3. **Does this change how nodes are written?** No. Nothing about the editing
   session, the snapshot discipline or the writing style moves.

## 4. Acceptance

1. `docs/knowledge.db` **alone** contains every node, read with `kt
   get_tree` against a copy with no side-files: **14**, including ids 14 and
   15.
2. `kt check` returns `problems: []`, and the MCP server still reads the
   tree after the checkpoint.
3. `git status` shows `docs/knowledge.db` modified.
4. `CLAUDE.md` rule 0 says to checkpoint before committing, so the next
   session does not rediscover this (rule 10), and the fact is in the tree.

**All four met, 2026-11-28**, by [tree-commit-todo.md](tree-commit-todo.md)
items 1 and 2: criterion 1 at **15** nodes in the file alone (14 at the first
checkpoint, 15 after the node this work wrote), criterion 2 with `kt check`
`problems: []` and `kt_get_node 15` answering through the server afterwards,
criterion 3 with `docs/knowledge.db` modified in `git status`, criterion 4 by
`CLAUDE.md` rule 0 and node 16. Item 3, the automatic checkpoint in `kt/`,
stays open as a proposal.
