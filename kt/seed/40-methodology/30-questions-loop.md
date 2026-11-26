---
title: The questions loop
tags: [methodology, spec, questions, agents]
links:
  - to: methodology/specification
    note: every answer is written into the specification
---
Questions are where an agent's guesses become the user's decisions. The loop has two moments.

## Before the work: "Any questions?"

Once the task is specified, the user asks the agent whether it has any questions. The agent:

1. Reads what the task touches (the code, the existing files) before asking, so that it doesn't
   ask what it can find out itself.
2. Lists its questions in the specification ("Open questions"), each with an id and a proposed
   answer, and asks them in the conversation, numbered, short, each one understandable on its
   own.
3. Writes each answer into the specification as it comes: a decision into "Decided so far", a
   detail into the requirement it affects. An answer often raises a new question; it gets the
   next id.
4. When an answer is unclear, says so and rephrases the question, rather than guessing.

The work starts when no question blocks it, and the user gives the go.

## During the work: stop and ask

When the agent finds something the specification does not settle (a case not foreseen, two ways
to do it with different consequences, a conflict between two requirements), it stops, asks, and
updates the specification with the answer before going on. When the user changes a decision in
the middle of an item, the agent applies it, updates the specification and the item, and says
what changed.

What the agent decides alone, it says in its report, so that the user can overrule it.
