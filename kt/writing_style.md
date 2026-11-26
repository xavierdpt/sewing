# Writing style of the knowledge tree

How node content is written. Follow these rules for every node you create or edit. When a lesson
from a node is worth keeping, it becomes a rule here, with at most a one-line example.

## Node shape

- **One topic per node.** A section that would be true elsewhere belongs there, linked from here.
- **No title heading**: the viewer already shows the title. Sections are `##`, subsections `###`;
  no `#`, and `####` only when unavoidable.
- Nodes are usually well under the 8192-character limit. A node that grows past about half of it
  is often two topics: consider splitting it.

## The opening

The opening is the text before the first section. A reader who stops there knows the main point.

- It states the **main point in full sentences**, not a caption ("How the seed is loaded.") or a
  string of fragments.
- It says **what makes the topic hard or important**; for a hub, how its children divide the
  topic. The sections follow that order.
- It holds **only** the main point: background that belongs to another node stays there and is
  linked where it is needed; edge cases, quirks and figures go into sections.
- Usually 2 to 5 sentences, or one sentence and a short list.
- It does **not** list or summarise the sections that follow: the headings already show them.

Before: "Seed loading. Front matter, keys, links; refuses non-empty databases."
After: "The seed is loaded once, into an empty database, so that loading it can never overwrite
content added since. Two things can make it fail: a file that breaks a tree rule, and a link to a
key that does not exist."

## Language

- Plain, direct sentences; present tense; active voice. One spelling (British or American)
  throughout a node.
- No filler ("Note that", "It is important to", "basically").
- **Bold** for a key term where it is defined, not for general emphasis.
- `Code spans` for names that appear literally in files or code (`kt_get_node`, `parent_id`).

## Anticipating the reader's questions

A node is not done while a sentence leaves its likely reader (someone who knows the parent topic,
not this node) asking "why?", "how?", "really?" or "what does that mean?". Typical triggers: a
surprising word, a claim with no reason, a rule with no consequence (what happens if it is
broken?), a figure with no scale, an undefined term.

- Make sure the **content contains the answers**, here or through a link where the concept is
  used. A question that belongs to another node is answered there.
- Write the answers as **prose**, not as questions and answers, and not as one section per
  question: "The cat ate the mouse" answers both "what did the cat eat?" and "what ate the
  mouse?". Asked "what colour was the cat?", write "The grey cat ate the mouse".
- The list of questions is a working tool: keep it neither in the node nor here.

## Sources and certainty

- Say where a fact comes from when it is not obvious: the user, a document (with its section), a
  measurement (what was measured, where, when). A bare figure cannot be checked or reused.
- Statements that were not checked against a source are marked as such, in a final "Sources"
  section or inline, not in the opening.
- Facts that change over time (versions, what is installed) are dated.

## Tables, lists, examples

- Tables for comparisons and mappings; lists for steps and enumerations; prose for explanations.
- The main difficulties get their own sections, not a row in a table next to minor items.
- Examples are real data (a real command, a real output) labelled as such, or are clearly
  marked as made up.
- Code blocks carry a language tag (`sh`, `json`, `yaml`).

## Cross-references

- Refer to another node by its **title** (or path), never by position ("the sibling node",
  "above"), since nodes move.
- Put the "see ..." pointer where the concept is used, not in a list in the opening.
- Every reference in prose has a matching link, with a `note` saying why.
