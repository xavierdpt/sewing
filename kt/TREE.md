# Knowledge Tree

A tree of knowledge nodes, indexed by tags, stored in SQLite (`data/knowledge.db`). You (Claude)
add and reorganise content through the `knowledge-tree` MCP tools, or the `kt` command line,
following the rules and workflows below. The web viewer is read-only: all changes go through the
tools. How the project is built and run is in `README.md`; how the optional initial content is
loaded is in `seed.md`. You don't need either to work on the tree.

## Rules of the tree

All rules are enforced by the database, so the tools cannot bypass them. **Never write to the
database with raw SQL**: go through the MCP tools or `kt`.

| rule | limit | error code when violated |
|---|---|---|
| Each node has **exactly one parent**; there is a single root | — | `ROOT_EXISTS` |
| A node has **between 1 and 10 tags** (normalized to lowercase kebab-case) | 1–10 | `INVALID_TAGS` |
| A node has **at most 5 child nodes** | 5 | `PARENT_FULL` |
| Node **content is at most 8192 characters** | 8192 | `CONTENT_TOO_LARGE` |
| A node can **link to any node that is not one of its ancestors** (nor itself); moves and splits that would turn a link target into an ancestor are refused | — | `INVALID_LINK` |
| A split must **reduce** the number of children of the split node | — | `INVALID_SPLIT` |
| Only leaf nodes can be deleted; the root cannot be moved | — | `HAS_CHILDREN`, `INVALID_MOVE` |
| A node is retired only into a node outside its own subtree, with room for its children; the root cannot be retired | 5 | `INVALID_RETIRE`, `PARENT_FULL` |

On an empty tree, the first node created (`kt_create_node` without `parent_id`) becomes the root.

## Stick to what is asked for

Write exactly what the user asks for, nothing more. When asked to add an item, a line or a
sentence, add only that: no figures, details, assessments or follow-ups ("to discuss", "to
decide") that were not requested, even when the tree holds them. If the request is unclear, ask
instead of filling the gap.

Work from the knowledge already in the tree and from what the user provides. Do not search the
web, and do not write or run test programs, scripts or probes to check or extend the content,
unless the user explicitly asks for it, or confirms it when you propose it.

## Writing node content

How node content is written (structure, sentences, titles, tags, links) is defined in
`writing_style.md`. Follow it for every node you create or edit.

## Reporting what you changed

After any change to the tree, list **every node you created, edited, moved, split or retired**,
each with its **full path** from the root and its id, so that the user can find it in the
viewer by unfolding the tree. Write the titles from the root separated by ` > `, e.g.
`Knowledge tree: sample content > How it works inside > Data model and where each rule is
enforced (id 3)`. `kt_get_node` gives the path as a list of `{id, title}`; `kt_find_nodes_by_tags`
gives it already joined with ` > `. For a retired node, give the path of the node it
was retired into; for a move, the new path.

## Adding content: the mandatory workflow

1. **Generate candidate tags.** You produce 3–10 lowercase kebab-case tags for the new content.
   Call `kt_list_tags` first and **reuse existing tags** wherever they fit, so the content can be
   found again.
2. **Find nodes with matching tags** with `kt_find_nodes_by_tags` (try `partial: true` too; add
   `kt_search_text` for words that are not tags).
3. **Examine the content of those nodes** with `kt_get_node`. Then decide:
   - the content is already there → stop, or improve that node with `kt_update_node`;
   - it extends a node → update it, or add it as a child of it;
   - it is new → create it under the most specific relevant parent.
4. **Respect the limits before writing**:
   - content over 8192 characters → split it yourself: keep a summary in one node and put the
     details in child nodes;
   - the target parent has 5 children (`free_child_slots` is 0 in `kt_get_node`) → **split the
     parent first** (see "Splitting a full node"), then create the node under the right group.
5. **Link** the new node to related, non-ancestor nodes found in step 2 (`links` on create, or
   `kt_add_link`), with a short `note` saying why.
6. Run `kt_check` after large changes; it must return no problems.

**Possible improvements** (changes not decided yet) go under the "possible improvements" hub of
the node they improve, e.g. "Full-text search: possible improvements" under "Full-text search".
Several improvements close in subject can share one subnode. Each improvement is **a single
paragraph**: what to change, why, the gain, what to check before deciding. Evidence, measurements
and mechanisms go into the documentation nodes (add them there if missing), and the improvement
links to them.

## Editing node content: the editing session

To change the content of existing nodes, especially several at once, don't retype whole
contents in `kt_update_node`: use an editing session and edit the files with the file tools.

1. `kt_edit_start`: opens a session and clears the edit folder (`data/edit/`). It is refused
   (`EDIT_SESSION_OPEN`) if the open session has uncommitted edits, unless you pass
   `discard: true`.
2. `kt_edit_dump` with `ids[]`: writes each node's raw content to `<edit folder>/<id>.md` and
   returns the file paths. A file already modified is never overwritten.
3. Read the files, then make targeted edits with the Edit tool. Several files can be edited in
   parallel. Don't create or delete `.md` files in the folder.
4. `kt_edit_status` (optional): shows which files are modified or over 8192 characters.
5. `kt_edit_close`: validates **every** file (≤ 8192 characters, not deleted, no stray files, node
   not changed in the database since it was dumped), writes the modified ones in **one
   transaction**, and clears the folder. On any problem, nothing is written (`EDIT_INVALID`
   lists every problem) and the session stays open: fix the files and close again.
   `discard: true` drops all edits instead.

Only content goes through the session: change titles and tags with `kt_update_node`. All
session state lives in the folder, so the MCP tools and `kt` share the same session.

**Content is always edited by you in an editing session**, reading the text and writing it by
hand: merging two nodes, moving a section from one node to another, rewriting an intro, fixing a
cross-reference. No tool merges, appends or cuts content automatically; the restructuring tools
below only handle structure and links.

## Restructuring: merging, moving sections, snapshots

For reorganisations (several moves, merges or splits at once):

1. **`kt_snapshot`** with a label before each step: a consistent copy of the database in
   `data/snapshots/<label>.db`. Never back up with `cp`: the database runs in WAL mode, and a plain
   copy of `knowledge.db` misses the changes still in `knowledge.db-wal`. `kt_list_snapshots`
   lists them.
2. **Merging node A into node B**: in an editing session, dump A and B, move A's useful content
   into B by hand, close the session. Then **`kt_retire_node`** `id: A, into: B`: it moves A's
   children under B, re-points A's links to B and deletes A, without touching any content. Run it
   with `dry_run: true` first and read `links_dropped`: links that would become self-links or
   ancestor links (or already exist) are dropped. Re-create the useful ones elsewhere. To dissolve
   a hub, retire it into its parent. Don't use `kt_delete_node` on a node that has links: deleting
   drops its links silently.
3. **Moving a section from node A to node B**: in an editing session, move the text by hand and
   leave a sentence and a link in A. Then **`kt_copy_links`** `from: A, to: B` (`ids` to pick the
   links that served the section, `direction: "in"` for incoming links, `move: true` to remove
   them from A), with `dry_run: true` first.
4. `kt_check` after each step.

**Restoring a snapshot** is manual, because no other process may have the database open: stop the
web server and every Claude session using the MCP server, then
`cp data/snapshots/<label>.db data/knowledge.db && rm -f data/knowledge.db-wal data/knowledge.db-shm`.
Only on the user's explicit request.

## Splitting a full node

When a parent already has 5 children, restructure it **before** adding the new node:

1. `kt_get_node` on the parent and read its children (and their content if needed).
2. Group the children by theme. Each group becomes a new intermediate node with its own
   title, summary content (≤ 8192) and tags, e.g. 5 children → 2 groups of 3 + 2.
3. Call `kt_split_node` with the groups (and, if useful, a restated `parent` content).
   The parent must end with fewer children than before; ideally leave room for the new node.
4. Create the new node under the parent or under the group it belongs to.

## Spec + todo methodology

The methodology for specifying and carrying out a piece of work with an agent (the specification
and todo files, the questions loop, item ids) is documented **in the knowledge tree**, in the node
"Spec + todo methodology" and its children, loaded from the seed. Before starting a piece of work
that the user frames as a task, read it there (`kt_search_text` with "spec todo methodology", then
`kt_get_node`) and follow it. If the tree was started without the seed, the node is not there:
ask the user how the work should be organised.

## MCP tools (server `knowledge-tree`)

Every tool returns JSON text; on error it returns `isError` with `CODE: message`. Ids are
integers. The read tools (`kt_list_tags`, `kt_find_nodes_by_tags`, `kt_search_text`,
`kt_get_node`, `kt_get_tree`, `kt_check`, `kt_list_snapshots`, `kt_edit_status`) run without a
permission prompt; the others ask.

| tool | input | returns / effect |
|---|---|---|
| `kt_list_tags` | `prefix?` | `[{tag, count}]`, most used first: the tag vocabulary |
| `kt_find_nodes_by_tags` | `tags[]`, `min_match`=1, `partial`=false, `limit`=20 | node summaries `{id, title, path, tags, child_count, score, matched_tags}`, best first (score = number of candidates matched) |
| `kt_search_text` | `query`, `limit`=20 | full-text hits on title + content, with `snippet` |
| `kt_get_node` | `id`, `include_content`=true | `{id, title, parent_id, path[], tags, content, content_length, max_content, children[], free_child_slots, links_out[], links_in[]}` |
| `kt_get_tree` | `root_id?`, `depth?` | nested outline `{id, title, tags, child_count, children}` |
| `kt_create_node` | `parent_id` (omit only for the root of an empty tree), `title`, `content`, `tags[]`, `links[{to, note?}]` | the new node |
| `kt_update_node` | `id`, `title?`, `content?`, `tags?` (replaces the tag set) | the updated node |
| `kt_split_node` | `id`, `groups[{title, content, tags[], children[ids]}]`, `parent?{title?, content?, tags?}` | `{node, groups}` |
| `kt_move_node` | `id`, `new_parent_id` | the moved node (subtree follows) |
| `kt_add_link` | `from_id`, `to_id`, `note`="" | the link |
| `kt_remove_link` | `from_id`, `to_id` | `{removed: true}` |
| `kt_delete_node` | `id` (leaf only) | `{deleted: id}` (its links are deleted too) |
| `kt_retire_node` | `id`, `into`, `dry_run`=false | `{retired, into, children_moved[], links_moved_out[], links_moved_in[], links_dropped[{was, reason}]}`: children moved under `into`, links re-pointed, node deleted; **no content change**. Refused (`EDIT_SESSION_OPEN`) while `id` is dumped in an open editing session |
| `kt_copy_links` | `from`, `to`, `direction`="out" \| "in", `ids?[]`, `move`=false, `dry_run`=false | `{copied[], skipped[{from_id, to_id, reason}], moved}`: copies `from`'s links to `to` with their notes; **no content change** |
| `kt_snapshot` | `label` | `{file, nodes, links, created_at}`: consistent copy in `data/snapshots/<label>.db`; never overwrites |
| `kt_list_snapshots` | — | `[{label, file, size, modified_at}]` |
| `kt_edit_start` | `discard`=false | `{dir, started}`: opens an editing session, clears the edit folder |
| `kt_edit_dump` | `ids[]` | `[{id, title, file, length}]`: writes `<id>.md` per node |
| `kt_edit_status` | — | `{dir, started_at, nodes[{id, title, file, length, modified, too_large}], unknown_files}` |
| `kt_edit_close` | `discard`=false | `{closed, updated[], unchanged[]}`: validates all files, commits in one transaction, clears the folder |
| `kt_check` | — | `{problems: []}` |

## Command line: `bin/kt.js`

When the MCP server is not connected, `node bin/kt.js` runs the same operations, against the same
database, without the `kt_` prefix. Output is JSON on stdout; errors go to stderr as
`CODE: message` with exit status 1 (`check` also exits 1 when it finds problems).

- `node bin/kt.js help` lists the operations; `node bin/kt.js help <operation>` shows its options.
- Options are the tool input fields (`--min_match` or `--min-match`).
- Arrays take comma-separated values: `--tags sqlite,search`; or a JSON array.
- Numbers and booleans are parsed; a bare flag is `true`: `--partial`.
- Object fields and complex input: `--json '{...}'`, `--json @file.json`, or a value of `-` to read
  stdin (handy for long `--content`): `--content @notes.md`, `--content -`.

Examples:

```sh
node bin/kt.js find_nodes_by_tags --tags sqlite,search,fts --min_match 2
node bin/kt.js search_text --query "editing session"
node bin/kt.js get_tree --depth 1
node bin/kt.js create_node --parent_id 3 --title "My note" --tags sqlite,search --content @note.md
node bin/kt.js split_node --json @split.json   # {"id":2,"groups":[{"title":..,"content":..,"tags":[..],"children":[3,4,5]}]}
node bin/kt.js retire_node --id 15 --into 7 --dry_run
node bin/kt.js check
```
