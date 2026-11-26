---
title: Spec + todo methodology
tags: [methodology, spec, todo, agents, workflow]
links:
  - to: examples
    note: the examples show single requests; this is for larger pieces of work
---
How a piece of work (a feature, a migration, a large reorganisation of content) is specified and
carried out with a coding agent: Claude, Codex or any other. Agents read this before starting a
piece of work that the user frames as a task.

**A piece of work has two Markdown files**, side by side, named after it:

- `task-<name>.md`, the **specification**: what is asked and why, what is decided, and what is
  still open;
- `task-<name>-todo.md`, the **todo**: the steps, small and self-contained, each with an id.

**How it goes:**

1. The user creates the two files (or asks the agent to) and describes the task.
2. The user asks the agent whether it has any questions. The questions are settled in the
   conversation, and every answer is written into the specification (the questions loop).
3. The agent works through the todo, one item at a time, with the user's go.
4. When the agent finds a new question during the work, it stops, asks it, and updates the
   specification with the answer before going on.

The specification is the reference: anything decided in the conversation ends up in it, so that
another agent, or the same one in a later session, can carry on from the files alone.
