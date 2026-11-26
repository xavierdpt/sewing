---
title: The todo file
tags: [methodology, todo, ids, testing]
---
`task-<name>-todo.md` holds the steps toward the specification. It starts with a short reminder of
the rules, then the workflow, then the items.

## The rules at the top

- **Nothing starts without the user's go.** Neither does anything hard to undo: stopping a
  server, deleting data, committing.
- What the work may touch, and what it must only read.

## The workflow, per item

1. **Take** the next planned item, or add a new one at the **top** of the list, marked todo
   (`- [ ]`), with where it lives in the code and what changes. Give it the next id.
2. **Do it.** If a question comes up, stop and ask (see the questions loop).
3. **Autotest it** if possible: a test that fails without the change and passes with it, and the
   whole suite still green. If it cannot be tested automatically, say so in the item.
4. **Mark it done** (`- [x]`), and write a short **result** under it: what changed, the test
   results, what was left for later items.
5. **Reference it in the specification**: *Done: X-n* where the specification describes what the
   item did.

One item per session by default; the user may ask to go on with the next one.

## Items and ids

- Each item: a checkbox, its id in bold (`**KB-4**`), a title, the requirements it serves, then
  a few bullets: where in the code, what changes, how it is tested.
- **Ids are never reused or renumbered**, even when an item is dropped (strike it through and say
  why), so commits, tests and the specification can cite them.
- New items go at the top, so the list grows from the top. Before work starts, the planned items
  can be reordered freely: they are done from the bottom up.
