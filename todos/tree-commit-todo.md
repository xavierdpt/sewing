# The tree's database is committed whole — TODO

The working queue for its spec, [tree-commit-spec.md](tree-commit-spec.md).
The cycle is read the spec, pick the next item, add it on top here with an
identifier, do it, mark it done here, and reference it from the spec. An
identifier is never reused or renumbered.

---

## Open

**Opened 2026-11-28**, from the user: *"It's your job to deal with
knowledge.db properly."*

- [x] **1. Measure, then checkpoint. DONE 2026-11-28.** The spec's §1 and §2:
      snapshot first, prove the gap by reading the main file on its own,
      `PRAGMA wal_checkpoint(TRUNCATE)`, prove it closed the same way, and
      `kt check` either side.
      *Acceptance:* the spec's §4 criteria 1-3.
      **Done.** `kt snapshot --label before-wal-checkpoint`; the file alone
      read **12** nodes against **14** live; checkpoint returned `0|0|0`;
      the file alone now reads **14**, ending with *The menubar and its
      floating dialogs* and *No control answers into the console*; `-wal` is
      0 bytes; `kt check` is `problems: []` and the MCP server still answers
      `kt_get_node 15`. `git status` lists `docs/knowledge.db` as modified.
      **Also checked, since a defect found once is worth looking for
      backwards:** `git show <commit>:docs/knowledge.db` for the three
      commits that have one — 7, 12, 12 nodes — all complete for their date.
      Nothing to repair in history.

- [x] **2. Write it down. DONE 2026-11-28.** The spec's §4 criterion 4:
      `CLAUDE.md` rule 0 and a node in the tree.
      **Done.** `CLAUDE.md` rule 0, "Working the tree": the clause that said
      the side-files are not committed now says to checkpoint before
      committing, gives the command, says why it is not the raw SQL the line
      above forbids, and names the proof — copy the `.db` alone and read it
      with `kt get_tree`.
      **Tree node:** *Triangulated Garment System > Software, instruments and
      validation > The tree's database is committed, and must be checkpointed
      first*, **id 16**.
      *And immediately exercised on itself:* writing that node put it in the
      `-wal`, so the checkpoint was run again — `0|0|0`, `-wal` 0 bytes — and
      the file alone now reads **15** nodes, ending with id 16. A rule whose
      first application is the act of writing it down is at least known to
      work.
      **Noted, not changed (rule 10):** node 5 *Software, instruments and
      validation* now has **5 children** (7, 9, 10, 14, 16) and no free slot.
      The next node under it needs `kt_split_node` first, which is a
      restructuring and therefore wants a snapshot and the user's call on how
      the children group.

- [x] **3. The automatic checkpoint, in `kt/`. DONE 2026-11-28.**
      Opened as a proposal "waiting on the user", which the user rejected as
      a category error: *"You're responsible for that so organize
      yourself."* Repairing a defect I had just diagnosed is not the
      "proposed, not performed" of rules 3 and 10 — those cover deleting
      code that still works and inventing new tooling. Done, not proposed.
      **`kt/server/db.js`:** `tx(fn)` is the one place every write already
      passes, so the checkpoint goes there, and `close()` takes one too. It
      is a no-op for `:memory:`, and a `TRUNCATE` that cannot run because a
      reader holds the file reports busy and is swallowed — the data is in
      the `-wal` either way and the next write retries, which is why
      `CLAUDE.md` keeps the manual command for that case and for a database
      written by anything older than this code. The comment above it carries
      the reason, not the mechanism.
      *Proved on a scratch copy, not reasoned about:* a node created through
      `kt/bin/kt.js` against a copy of the database, then the **main file
      alone** copied away and read — **16** nodes including the one just
      written, with no manual checkpoint anywhere.
      **`kt/package.json`:** `npm test` was `node --test test/`, which Node
      24 refuses — `Cannot find module '.../kt/test'`. It is
      `node --test test/*.test.js` now. Pre-existing breakage, found by
      running the suite rather than assuming it ran. **25 pass / 0 fail**
      with the checkpoint in.

- [x] **4. Make room under node 5. DONE 2026-11-28.** Also opened as
      "waiting on the user" and also not a decision for them: the tree's own
      rules cap a node at five children and say to snapshot before
      restructuring, which is an instruction, not a question.
      `kt snapshot --label before-split-of-node-5`, then `split_node` on **5**
      grouping **7** (*The tree's browser in docker*) and **16** (*The tree's
      database is committed...*) under a new node **17**, *Triangulated
      Garment System > Software, instruments and validation > The knowledge
      tree as software* — the tree considered as a program in this
      repository rather than as content, which is what those two have in
      common and what the next node about `kt/` will join. Node 5 is back to
      **four** children and one free slot; `kt check` is `problems: []`.
      **And the split made node 5 readable again, which caught two stale
      facts in it** (rule 10, corrected in the same turn through an editing
      session — `edit_start`, `edit_dump`, edit, `edit_close`):
      - its "children divide this by role" sentence named children it no
        longer has;
      - it said the gate is **310 pass**, copied on 2026-11-26 from
        `CLAUDE.md`'s command list, which still said so. It is **306**,
        measured twice on 2026-11-27, and the repository had already settled
        why: commit 8b21748, *"the 310 it was, less the four assertions that
        went with the fixture"*. No user adjudication was needed because
        this was a document against a measurement with a recorded cause, not
        two sources disagreeing. `CLAUDE.md:327` is corrected too. The dated
        records in `todos/18-validation.md` and `todos/19-todo.md` are
        **left alone**: they say "as of 2026-10-18", and a dated record of a
        past run is not a stale claim.

## Done

All four items, 2026-11-28. The database is whole on disk after every write,
by code rather than by memory; `kt`'s own suite is **25 pass / 0 fail** and
runnable again; node 5 has room and no longer states a gate figure the gate
does not produce.
