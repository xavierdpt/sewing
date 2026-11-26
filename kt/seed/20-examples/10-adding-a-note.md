---
title: "Example: adding a note"
tags: [examples, claude, workflow, tags]
links:
  - to: inside/data-model
    note: why "Full Text" and "full-text" end up as the same tag
---
**The request:** "Add to the knowledge tree: full-text search does not look at tags, so a word
that is only a tag is found by tag search, not by text search."

**What Claude does**, following the mandatory workflow:

1. Lists the existing tags and proposes candidates that reuse them: `full-text`, `search`, `tags`,
   `sqlite`.
2. Finds nodes with those tags. Here: "Data model and where each rule is enforced", which has a
   "Full-text search" section.
3. Reads that node. The point is already half there ("Tags are not in this index"), so the note
   extends that node rather than creating a new one.
4. Adds one sentence to the section, in an editing session, and checks the size stays under
   the limit.
5. Tells you which node changed, with its path and id (`Knowledge tree: sample content > How
   it works inside > Data model and where each rule is enforced (id 3)`), and quotes the sentence
   it added.

**What Claude doesn't do:** add an explanation of FTS5 you didn't ask for, test the claim with a
script, or search the web. If the note had been unclear (which search? in the viewer or through
the tools?), it would have asked first.

Had nothing matched, Claude would have created a new node under the most specific parent, with its
tags and a link to the closest related node.
