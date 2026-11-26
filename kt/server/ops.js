// One registry of operations shared by the MCP server, the CLI and the REST API.
// Each op: { description, input (zod raw shape), run(kt, args), write?: true }
// Write ops (write: true) and local file-system ops (local: true) are exposed to MCP and the
// CLI only; the HTTP API (web UI) is read-only.
import { z } from 'zod';
import { KtError, MAX_CHILDREN, MAX_CONTENT, MAX_TAGS, MIN_TAGS } from './db.js';
import { dumpedIds, editClose, editDump, editStart, editStatus } from './edit-session.js';

const id = z.number().int().positive();
const tags = z.array(z.string()).min(MIN_TAGS).max(MAX_TAGS);

export const ops = {
  list_tags: {
    description: 'List the tag vocabulary with usage counts (most used first). Check it before ' +
      'choosing candidate tags so new content reuses existing tags.',
    input: { prefix: z.string().optional().describe('only tags starting with this') },
    run: (kt, a) => kt.listTags(a.prefix ?? ''),
  },

  find_nodes_by_tags: {
    description: 'Find nodes sharing tags with a list of candidate tags, best match first. ' +
      'Returns summaries (id, title, path, tags, child_count, score); read the content with get_node.',
    input: {
      tags: z.array(z.string()).min(1).describe('candidate tags'),
      min_match: z.number().int().min(1).default(1).describe('minimum number of candidates matched'),
      partial: z.boolean().default(false).describe('also match substrings (e.g. "sqlite" ~ "sqlite-fts")'),
      limit: z.number().int().min(1).max(100).default(20),
    },
    run: (kt, a) => kt.findByTags(a.tags, { minMatch: a.min_match ?? 1, partial: a.partial ?? false, limit: a.limit ?? 20 }),
  },

  search_text: {
    description: 'Full-text search over node titles and content (complements tag search).',
    input: { query: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) },
    run: (kt, a) => kt.searchText(a.query, a.limit ?? 20),
  },

  get_node: {
    description: 'Read one node: content, tags, breadcrumb path, children, free child slots, ' +
      'outgoing and incoming links.',
    input: { id, include_content: z.boolean().default(true) },
    run: (kt, a) => kt.getNode(a.id, { includeContent: a.include_content ?? true }),
  },

  get_tree: {
    description: 'Outline of the tree (titles, tags, child counts) from a node (default: the root).',
    input: { root_id: id.optional(), depth: z.number().int().min(0).max(50).optional() },
    run: (kt, a) => kt.getTree(a.root_id ?? null, a.depth ?? Infinity),
  },

  create_node: {
    write: true,
    description: `Create a node under parent_id with ${MIN_TAGS}-${MAX_TAGS} tags and optional links ` +
      `to non-ancestor nodes. Fails with PARENT_FULL if the parent already has ${MAX_CHILDREN} ` +
      `children: split the parent first. Content is at most ${MAX_CONTENT} characters ` +
      '(CONTENT_TOO_LARGE otherwise): keep a summary here and put details in child nodes. Omit parent_id only to create the root of an empty tree.',
    input: {
      parent_id: id.optional(),
      title: z.string().min(1),
      content: z.string().default(''),
      tags,
      links: z.array(z.object({ to: id, note: z.string().optional() })).default([])
        .describe('links to related, non-ancestor nodes'),
    },
    run: (kt, a) => kt.createNode({
      parentId: a.parent_id ?? null, title: a.title, content: a.content ?? '', tags: a.tags, links: a.links ?? [],
    }),
  },

  update_node: {
    write: true,
    description: 'Change the title, content and/or tags (replaces the whole tag set) of a node.',
    input: { id, title: z.string().min(1).optional(), content: z.string().optional(), tags: tags.optional() },
    run: (kt, a) => kt.updateNode(a.id, { title: a.title, content: a.content, tags: a.tags }),
  },

  split_node: {
    write: true,
    description: 'Restructure a node by grouping some of its children under new intermediate ' +
      `nodes, so that it has free child slots again (max ${MAX_CHILDREN} children). Each group ` +
      'gets its own title, summary content and tags. Optionally restate the node itself.',
    input: {
      id,
      groups: z.array(z.object({
        title: z.string().min(1),
        content: z.string().default('').describe('summary of what the group covers'),
        tags,
        children: z.array(id).min(1).max(MAX_CHILDREN).describe('ids of current children to move in'),
      })).min(1),
      parent: z.object({ title: z.string().optional(), content: z.string().optional(), tags: tags.optional() })
        .optional().describe('optional new title/content/tags for the split node'),
    },
    run: (kt, a) => kt.splitNode(a.id, a.groups, a.parent ?? null),
  },

  move_node: {
    write: true,
    description: 'Move a node (with its subtree) under another parent that has a free slot.',
    input: { id, new_parent_id: id },
    run: (kt, a) => kt.moveNode(a.id, a.new_parent_id),
  },

  add_link: {
    write: true,
    description: 'Link a node to a related node that is not one of its ancestors.',
    input: { from_id: id, to_id: id, note: z.string().default('') },
    run: (kt, a) => kt.addLink(a.from_id, a.to_id, a.note ?? ''),
  },

  remove_link: {
    write: true,
    description: 'Remove a link.',
    input: { from_id: id, to_id: id },
    run: (kt, a) => kt.removeLink(a.from_id, a.to_id),
  },

  delete_node: {
    write: true,
    description: 'Delete a leaf node (and its links).',
    input: { id },
    run: (kt, a) => kt.deleteNode(a.id),
  },

  // ---- restructuring helpers: structure and links only, they never change content

  retire_node: {
    write: true,
    description: 'Retire a node once its content has been merged by hand, in an editing session, into ' +
      'another node: moves its children under `into`, re-points its outgoing and incoming links to ' +
      '`into`, then deletes it. Never changes any content. Links that would become self-links or ' +
      'ancestor links, or that already exist, are dropped and listed in links_dropped. `into` may be ' +
      'its parent (to dissolve a hub). Refused while the node is dumped in an open editing session. ' +
      'Use dry_run first to see what would happen.',
    input: {
      id: id.describe('the node to retire'),
      into: id.describe('the node that took over its content'),
      dry_run: z.boolean().default(false).describe('report what would happen, change nothing'),
    },
    run: (kt, a) => {
      if (dumpedIds(kt).includes(a.id)) {
        throw new KtError('EDIT_SESSION_OPEN',
          `node ${a.id} is dumped in the open editing session: close it (edit_close) first`);
      }
      return kt.retireNode(a.id, a.into, { dryRun: a.dry_run ?? false });
    },
  },

  copy_links: {
    write: true,
    description: 'Copy (or, with move: true, move) the links of node `from` to node `to`, keeping their ' +
      'notes. Never changes any content. direction "out": from->X becomes to->X; "in": X->from ' +
      'becomes X->to. ids limits it to those X. Use it after moving a section by hand from one node to ' +
      'another in an editing session. Invalid or existing links are skipped and listed.',
    input: {
      from: id,
      to: id,
      direction: z.enum(['out', 'in']).default('out'),
      ids: z.array(id).optional().describe('only the links with these nodes (default: all)'),
      move: z.boolean().default(false).describe('also remove the original links that were copied'),
      dry_run: z.boolean().default(false).describe('report what would happen, change nothing'),
    },
    run: (kt, a) => kt.copyLinks(a.from, a.to, {
      direction: a.direction ?? 'out', ids: a.ids ?? null, move: a.move ?? false, dryRun: a.dry_run ?? false,
    }),
  },

  snapshot: {
    local: true,
    description: 'Save a consistent copy of the database to <snapshot folder>/<label>.db (data/snapshots/ ' +
      'next to the DB, or KT_SNAPSHOT_DIR), with the SQLite backup API: take one before each ' +
      'restructuring step. Reads the live database only. Restoring is manual (see CLAUDE.md).',
    input: { label: z.string().min(1).describe('file name: letters, digits, ".", "_", "-"') },
    run: (kt, a) => kt.snapshot(a.label),
  },

  list_snapshots: {
    local: true,
    description: 'List the snapshots in the snapshot folder.',
    input: {},
    run: (kt) => kt.listSnapshots(),
  },

  // ---- content-editing session (server/edit-session.js); file-system ops, so not served over HTTP

  edit_start: {
    write: true,
    description: 'Open a content-editing session: clears the edit folder of node contents. Refused ' +
      'with EDIT_SESSION_OPEN if the open session has uncommitted edits, unless discard is true.',
    input: { discard: z.boolean().default(false).describe('drop the uncommitted edits of an open session') },
    run: (kt, a) => editStart(kt, { discard: a.discard ?? false }),
  },

  edit_dump: {
    write: true,
    description: 'Write the content of nodes to <edit folder>/<id>.md (raw content, nothing else) so ' +
      'they can be edited with file tools. Needs an open session; never overwrites a file already modified.',
    input: { ids: z.array(id).min(1).describe('node ids to dump') },
    run: (kt, a) => editDump(kt, a.ids),
  },

  edit_status: {
    local: true,
    description: 'State of the editing session: dumped files, which are modified or over ' +
      `${MAX_CONTENT} characters, and stray files.`,
    input: {},
    run: (kt) => editStatus(kt),
  },

  edit_close: {
    write: true,
    description: 'Close the editing session: checks every dumped file (size, not deleted, node not changed ' +
      'in the database meanwhile, no stray files), writes the modified contents in one transaction, ' +
      'then clears the folder. On any problem nothing is written (EDIT_INVALID) and the session stays ' +
      'open. With discard: true, just clears the folder.',
    input: { discard: z.boolean().default(false).describe('drop all edits instead of committing them') },
    run: (kt, a) => editClose(kt, { discard: a.discard ?? false }),
  },

  check: {
    description: 'Verify every tree invariant; returns the list of problems (empty = healthy).',
    input: {},
    run: (kt) => ({ problems: kt.check() }),
  },
};

/** Validate args against an op's schema, then run it. */
export async function runOp(kt, name, args = {}) {
  const op = ops[name];
  if (!op) {
    const e = new Error(`unknown operation "${name}"`);
    e.code = 'UNKNOWN_OP';
    throw e;
  }
  const parsed = z.object(op.input).strict().safeParse(args);
  if (!parsed.success) {
    const e = new Error(parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
    e.code = 'INVALID_INPUT';
    throw e;
  }
  return op.run(kt, parsed.data);
}
