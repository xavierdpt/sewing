---
title: The specification file
tags: [methodology, spec, requirements]
links:
  - to: methodology/todo-file
    note: each todo item cites the requirements it serves
---
`task-<name>.md` says what is asked and why. Its parts, in this order:

1. **A short introduction**: what the work is, in two or three sentences, and a pointer to the
   todo file.
2. **A status line**, in italics, kept up to date: "Nothing built yet", "Items 1 to 4 done",
   and anything that waits for the user (a go, a decision, a restart).
3. **Decided so far**: one bullet per decision, with a few words of reason. User decisions are
   marked as such ("decided by the user"), so that an agent doesn't reopen them.
4. **The requirements**, each with an id (`B-1`, `B-2`, ...) and a heading: what is wanted,
   precisely enough to be checked. What is left out, and why, belongs here too.
5. **Open questions**, each with an id (`Q-1`, ...) and a proposed answer. A settled question
   leaves the list; its answer goes into "Decided so far" or into a requirement.

## Keeping it current

- When a todo item is done, the requirement it served gets a line: *Done: X-n*, with a few words
  on what changed.
- When a decision changes during the work, the specification is edited where the old decision
  was, and the change is marked ("changed after X-n, decided by the user"). A dropped requirement
  keeps its id and heading, marked "(Dropped)", with the reason.
- Facts measured during the work (sizes, counts, test results) go where they are used, with the
  date or item that produced them.
