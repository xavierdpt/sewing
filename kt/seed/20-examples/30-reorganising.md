---
title: "Example: reorganising a full node"
tags: [examples, claude, restructuring, split]
links:
  - to: inside/editing-session-internals
    note: rewritten summaries go through an editing session
---
**The situation:** a node "Recipes" has 5 children ("Bread", "Pizza dough", "Soups", "Stews",
"Salads"), the maximum. You ask: "Add my focaccia recipe."

**What Claude does:**

1. Finds "Recipes" full (no free child slot), so it cannot add a sixth child.
2. Proposes a split: "Doughs" (Bread, Pizza dough) and "Dishes" (Soups, Stews, Salads), each
   with a short summary and its own tags. It takes a snapshot first.
3. After the split, "Recipes" has 2 children, and the focaccia goes under "Doughs".
4. Runs the invariant check and reports the new structure.

For a larger reorganisation ("merge these two nodes", "move the section on X to Y"), Claude
proceeds step by step, with a snapshot before each step, and does the text changes by hand in an
editing session: no tool cuts or merges content on its own.

**Your part:** say if you prefer other groups. A split is easy to adjust before more content goes
in.
