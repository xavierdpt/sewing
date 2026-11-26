---
title: "Example: asking the tree a question"
tags: [examples, claude, search, full-text]
links:
  - to: inside/data-model
    note: tag search and full-text search use different tables
---
**The request:** "What does the knowledge tree say about what happens when two edits touch the
same node?"

**What Claude does:**

1. Searches by tags (`editing-session`, `transactions`) and by text ("changed in the database").
2. Reads the nodes it found: here, "Editing session internals".
3. Answers from them, and names the node it used (title and id), so you can open it in the viewer.

If the tree has nothing on the subject, Claude says so. It doesn't fill the gap from its general
knowledge, the web or a test program unless you ask for it, and it doesn't add anything to the
tree unless you ask for that too.

**Variants that work well:**

- "Which nodes are tagged `mcp`?"
- "Show me the tree two levels deep."
- "Which nodes link to *Editing session internals*?"
