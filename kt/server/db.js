// Knowledge tree storage layer (SQLite).
//
// Every rule of the tree is enforced here, so the REST API, the MCP server and
// the CLI cannot diverge:
//   - a single root; every other node has exactly one parent
//   - at most MAX_CHILDREN children per node (also enforced by triggers)
//   - between MIN_TAGS and MAX_TAGS tags per node
//   - links only to nodes that are not ancestors of the source (nor itself)
//   - adding a child to a full node is refused: split the node first
//   - content is at most MAX_CONTENT characters (also a CHECK constraint):
//     larger content must be split into child nodes
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_CHILDREN, MIN_TAGS, MAX_TAGS, MAX_CONTENT } from './limits.js';

export { MAX_CHILDREN, MIN_TAGS, MAX_TAGS, MAX_CONTENT };

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DB_PATH = process.env.KT_DB || path.join(ROOT_DIR, 'data', 'knowledge.db');

export class KtError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id         INTEGER PRIMARY KEY,
  parent_id  INTEGER REFERENCES nodes(id) ON DELETE RESTRICT,
  title      TEXT NOT NULL CHECK (length(trim(title)) > 0),
  content    TEXT NOT NULL DEFAULT '' CHECK (length(content) <= ${MAX_CONTENT}),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent_id);
-- only one node may have no parent
CREATE UNIQUE INDEX IF NOT EXISTS nodes_single_root ON nodes((parent_id IS NULL)) WHERE parent_id IS NULL;

CREATE TABLE IF NOT EXISTS node_tags (
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  PRIMARY KEY (node_id, tag)
);
CREATE INDEX IF NOT EXISTS node_tags_tag ON node_tags(tag);

CREATE TABLE IF NOT EXISTS links (
  from_id    INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
);
CREATE INDEX IF NOT EXISTS links_to ON links(to_id);

-- Set only inside a split transaction, never committed: lets the split create
-- its group nodes under a full parent before moving the children into them.
CREATE TABLE IF NOT EXISTS kt_split_in_progress (flag INTEGER PRIMARY KEY);

-- Safety nets: the code checks these first and gives better messages.
CREATE TRIGGER IF NOT EXISTS nodes_max_children_ins
BEFORE INSERT ON nodes WHEN NEW.parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM kt_split_in_progress)
  AND (SELECT count(*) FROM nodes WHERE parent_id = NEW.parent_id) >= ${MAX_CHILDREN}
BEGIN SELECT RAISE(ABORT, 'parent already has ${MAX_CHILDREN} children: split it first'); END;

CREATE TRIGGER IF NOT EXISTS nodes_max_children_upd
BEFORE UPDATE OF parent_id ON nodes WHEN NEW.parent_id IS NOT NULL
  AND NEW.parent_id IS NOT OLD.parent_id
  AND NOT EXISTS (SELECT 1 FROM kt_split_in_progress)
  AND (SELECT count(*) FROM nodes WHERE parent_id = NEW.parent_id) >= ${MAX_CHILDREN}
BEGIN SELECT RAISE(ABORT, 'parent already has ${MAX_CHILDREN} children: split it first'); END;

CREATE TRIGGER IF NOT EXISTS node_tags_max
BEFORE INSERT ON node_tags
  WHEN (SELECT count(*) FROM node_tags WHERE node_id = NEW.node_id) >= ${MAX_TAGS}
BEGIN SELECT RAISE(ABORT, 'a node cannot have more than ${MAX_TAGS} tags'); END;

-- Full-text index over title + content
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(title, content, content='nodes', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS nodes_fts_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, title, content) VALUES (NEW.id, NEW.title, NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS nodes_fts_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, content) VALUES ('delete', OLD.id, OLD.title, OLD.content);
END;
CREATE TRIGGER IF NOT EXISTS nodes_fts_au AFTER UPDATE OF title, content ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, content) VALUES ('delete', OLD.id, OLD.title, OLD.content);
  INSERT INTO nodes_fts(rowid, title, content) VALUES (NEW.id, NEW.title, NEW.content);
END;
`;

/** Tags are lowercase kebab-case: "Full Text" -> "full-text". */
export function normalizeTag(tag) {
  return String(tag)
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9.+#-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) throw new KtError('INVALID_TAGS', 'tags must be an array of strings');
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

function checkTagCount(tags) {
  if (tags.length < MIN_TAGS || tags.length > MAX_TAGS) {
    throw new KtError('INVALID_TAGS',
      `a node must have between ${MIN_TAGS} and ${MAX_TAGS} distinct tags (got ${tags.length})`);
  }
}

function checkContent(content, what = 'content') {
  if (typeof content !== 'string') throw new KtError('INVALID_CONTENT', `${what} must be a string`);
  if (content.length > MAX_CONTENT) {
    throw new KtError('CONTENT_TOO_LARGE',
      `${what} is ${content.length} characters, the maximum is ${MAX_CONTENT}: split it -- keep a ` +
      'summary in this node and move the details into child nodes (or sibling nodes linked to it)');
  }
  return content;
}

export class KnowledgeTree {
  constructor(dbPath = DEFAULT_DB_PATH, { editDir, snapshotDir } = {}) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    // folder of the snapshots (snapshot op): data/snapshots/ next to the DB, or KT_SNAPSHOT_DIR
    this.snapshotDir = snapshotDir ?? process.env.KT_SNAPSHOT_DIR
      ?? (dbPath === ':memory:' ? null : path.join(path.dirname(path.resolve(dbPath)), 'snapshots'));
    // folder of the content-editing session (server/edit-session.js)
    this.editDir = editDir ?? process.env.KT_EDIT_DIR
      ?? (dbPath === ':memory:' ? null : path.join(path.dirname(path.resolve(dbPath)), 'edit'));
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this._migrateContentLimit();
  }

  /**
   * The CHECK on nodes.content is part of the table's SQL, so a database created with another
   * MAX_CONTENT keeps the old limit. Rewrite that constant in the stored schema (the documented
   * writable_schema procedure: a CHECK change does not touch the on-disk format).
   */
  _migrateContentLimit() {
    const sql = this.db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'nodes'").pluck().get();
    const m = /length\(content\) <= (\d+)/.exec(sql ?? '');
    if (!m || Number(m[1]) === MAX_CONTENT) return;
    const longest = this.db.prepare('SELECT coalesce(max(length(content)), 0) FROM nodes').pluck().get();
    if (longest > MAX_CONTENT) {
      throw new KtError('CONTENT_TOO_LARGE',
        `cannot lower the content limit to ${MAX_CONTENT}: a node has ${longest} characters`);
    }
    const newSql = sql.replace(m[0], `length(content) <= ${MAX_CONTENT}`);
    this.db.unsafeMode(true); // allow writable_schema (better-sqlite3 runs in defensive mode)
    try {
      this.tx(() => {
        const version = this.db.pragma('schema_version', { simple: true });
        this.db.pragma('writable_schema = ON');
        this.db.prepare("UPDATE sqlite_schema SET sql = ? WHERE type = 'table' AND name = 'nodes'").run(newSql);
        this.db.pragma(`schema_version = ${version + 1}`);
        this.db.pragma('writable_schema = OFF');
      });
    } finally {
      this.db.unsafeMode(false);
    }
    const ok = this.db.pragma('quick_check', { simple: true });
    if (ok !== 'ok') throw new Error(`schema migration of the content limit: quick_check says ${ok}`);
  }

  close() { this.db.close(); }

  tx(fn) { return this.db.transaction(fn)(); }

  /** Run fn in a transaction; with dryRun, return its result and roll everything back. */
  _txMaybeDry(fn, dryRun) {
    if (!dryRun) return this.tx(fn);
    const rollback = new Error('dry run');
    let result;
    try {
      this.tx(() => { result = fn(); throw rollback; });
    } catch (e) {
      if (e !== rollback) throw e;
    }
    return { dry_run: true, ...result };
  }

  // ---------- reads ----------

  _row(id) {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    if (!row) throw new KtError('NOT_FOUND', `node ${id} does not exist`);
    return row;
  }

  tagsOf(id) {
    return this.db.prepare('SELECT tag FROM node_tags WHERE node_id = ? ORDER BY tag').pluck().all(id);
  }

  childCount(id) {
    return this.db.prepare('SELECT count(*) FROM nodes WHERE parent_id = ?').pluck().get(id);
  }

  /** Ancestor ids, nearest first (parent, grand-parent, ..., root). */
  ancestorIds(id) {
    return this.db.prepare(`
      WITH RECURSIVE up(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM nodes WHERE id = ?
        UNION ALL
        SELECT n.id, n.parent_id, up.depth + 1 FROM nodes n JOIN up ON n.id = up.parent_id
      )
      SELECT id FROM up WHERE depth > 0 ORDER BY depth`).pluck().all(id);
  }

  /** Root-to-node breadcrumb: [{id, title}, ...]. */
  path(id) {
    const ids = [id, ...this.ancestorIds(id)].reverse();
    const get = this.db.prepare('SELECT id, title FROM nodes WHERE id = ?');
    return ids.map((i) => get.get(i));
  }

  descendantIds(id) {
    return this.db.prepare(`
      WITH RECURSIVE down(id) AS (
        SELECT id FROM nodes WHERE parent_id = ?
        UNION ALL
        SELECT n.id FROM nodes n JOIN down ON n.parent_id = down.id
      )
      SELECT id FROM down`).pluck().all(id);
  }

  root() {
    return this.db.prepare('SELECT id, title FROM nodes WHERE parent_id IS NULL').get() || null;
  }

  summary(id) {
    const row = this._row(id);
    return {
      id: row.id,
      title: row.title,
      parent_id: row.parent_id,
      tags: this.tagsOf(id),
      child_count: this.childCount(id),
      path: this.path(id).map((p) => p.title).join(' > '),
    };
  }

  getNode(id, { includeContent = true } = {}) {
    const row = this._row(id);
    const children = this.db.prepare(
      'SELECT id, title FROM nodes WHERE parent_id = ? ORDER BY position, id').all(id)
      .map((c) => ({ ...c, tags: this.tagsOf(c.id), child_count: this.childCount(c.id) }));
    const linksOut = this.db.prepare(`
      SELECT l.to_id AS id, n.title, l.note FROM links l JOIN nodes n ON n.id = l.to_id
      WHERE l.from_id = ? ORDER BY n.title`).all(id);
    const linksIn = this.db.prepare(`
      SELECT l.from_id AS id, n.title, l.note FROM links l JOIN nodes n ON n.id = l.from_id
      WHERE l.to_id = ? ORDER BY n.title`).all(id);
    return {
      id: row.id,
      title: row.title,
      parent_id: row.parent_id,
      path: this.path(id),
      tags: this.tagsOf(id),
      ...(includeContent ? { content: row.content } : {}),
      content_length: row.content.length,
      max_content: MAX_CONTENT,
      children,
      free_child_slots: MAX_CHILDREN - children.length,
      links_out: linksOut,
      links_in: linksIn,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /** Nested tree (titles, tags, child counts) from rootId (default: the root). */
  getTree(rootId = null, depth = Infinity) {
    const start = rootId ?? this.root()?.id;
    if (start == null) return null;
    const kids = this.db.prepare('SELECT id FROM nodes WHERE parent_id = ? ORDER BY position, id').pluck();
    const build = (id, d) => {
      const row = this._row(id);
      const childIds = kids.all(id);
      return {
        id,
        title: row.title,
        tags: this.tagsOf(id),
        child_count: childIds.length,
        ...(d < depth ? { children: childIds.map((c) => build(c, d + 1)) } : {}),
      };
    };
    return build(start, 0);
  }

  /** All tags with their usage count, most used first. */
  listTags(prefix = '') {
    return this.db.prepare(`
      SELECT tag, count(*) AS count FROM node_tags
      WHERE tag LIKE ? ESCAPE '\\' GROUP BY tag ORDER BY count DESC, tag`)
      .all(normalizeTag(prefix).replace(/[%_\\]/g, '\\$&') + '%');
  }

  /**
   * Nodes sharing tags with the candidates, best match first.
   * partial: also match a candidate as a substring of a stored tag (and vice versa).
   */
  findByTags(tags, { minMatch = 1, partial = false, limit = 20 } = {}) {
    const cands = normalizeTags(tags);
    if (!cands.length) throw new KtError('INVALID_TAGS', 'give at least one tag');
    const allTags = this.db.prepare('SELECT DISTINCT tag FROM node_tags').pluck().all();
    // stored tag -> candidates it answers to
    const hits = new Map();
    for (const t of allTags) {
      for (const c of cands) {
        if (t === c || (partial && (t.includes(c) || c.includes(t)))) {
          if (!hits.has(t)) hits.set(t, new Set());
          hits.get(t).add(c);
        }
      }
    }
    if (!hits.size) return [];
    const stored = [...hits.keys()];
    const rows = this.db.prepare(`
      SELECT node_id, group_concat(tag, '\u0001') AS tags FROM node_tags
      WHERE tag IN (${stored.map(() => '?').join(',')}) GROUP BY node_id`).all(...stored);
    return rows
      .map((r) => {
        const matchedTags = r.tags.split('\u0001');
        const matchedCands = new Set(matchedTags.flatMap((t) => [...hits.get(t)]));
        const exact = matchedTags.filter((t) => cands.includes(t)).length;
        return { node_id: r.node_id, matched_tags: matchedTags.sort(), score: matchedCands.size, exact };
      })
      .filter((r) => r.score >= minMatch)
      .sort((a, b) => b.score - a.score || b.exact - a.exact || a.node_id - b.node_id)
      .slice(0, limit)
      .map((r) => ({ ...this.summary(r.node_id), score: r.score, matched_tags: r.matched_tags }));
  }

  searchText(query, limit = 20) {
    const q = String(query).trim();
    if (!q) throw new KtError('INVALID_QUERY', 'empty query');
    // quote each word so user input is never parsed as FTS syntax
    const fts = q.split(/\s+/).map((w) => `"${w.replace(/"/g, '""')}"`).join(' ');
    return this.db.prepare(`
      SELECT rowid AS id, snippet(nodes_fts, 1, '[', ']', '…', 12) AS snippet
      FROM nodes_fts WHERE nodes_fts MATCH ? ORDER BY rank LIMIT ?`).all(fts, limit)
      .map((r) => ({ ...this.summary(r.id), snippet: r.snippet }));
  }

  // ---------- writes ----------

  _setTags(id, tags) {
    const norm = normalizeTags(tags);
    checkTagCount(norm);
    this.db.prepare('DELETE FROM node_tags WHERE node_id = ?').run(id);
    const ins = this.db.prepare('INSERT INTO node_tags(node_id, tag) VALUES (?, ?)');
    for (const t of norm) ins.run(id, t);
    return norm;
  }

  _assertCanLink(fromId, toId) {
    this._row(fromId);
    this._row(toId);
    if (fromId === toId) throw new KtError('INVALID_LINK', 'a node cannot link to itself');
    if (this.ancestorIds(fromId).includes(toId)) {
      throw new KtError('INVALID_LINK',
        `node ${toId} is an ancestor of node ${fromId}: links may only target non-ancestor nodes`);
    }
  }

  _assertHasRoom(parentId) {
    const n = this.childCount(parentId);
    if (n >= MAX_CHILDREN) {
      throw new KtError('PARENT_FULL',
        `node ${parentId} already has ${n}/${MAX_CHILDREN} children: split it first ` +
        '(kt_split_node) to restructure its content, then add the node under the right group');
    }
  }

  _nextPosition(parentId) {
    return this.db.prepare('SELECT coalesce(max(position), -1) + 1 FROM nodes WHERE parent_id IS ?')
      .pluck().get(parentId);
  }

  /** Create a node. parentId null creates the root (only when the tree is empty). */
  createNode({ parentId = null, title, content = '', tags, links = [] }) {
    return this.tx(() => {
      if (parentId == null) {
        if (this.root()) throw new KtError('ROOT_EXISTS', 'the tree already has a root: give a parent_id');
      } else {
        this._row(parentId);
        this._assertHasRoom(parentId);
      }
      checkContent(content);
      const { lastInsertRowid } = this.db.prepare(
        'INSERT INTO nodes(parent_id, title, content, position) VALUES (?, ?, ?, ?)')
        .run(parentId, String(title).trim(), content, this._nextPosition(parentId));
      const id = Number(lastInsertRowid);
      this._setTags(id, tags);
      for (const l of links) {
        const { to, note = '' } = typeof l === 'object' ? l : { to: l };
        this.addLink(id, to, note);
      }
      return this.getNode(id);
    });
  }

  updateNode(id, { title, content, tags }) {
    return this.tx(() => {
      this._row(id);
      if (title !== undefined) {
        this.db.prepare("UPDATE nodes SET title = ?, updated_at = datetime('now') WHERE id = ?")
          .run(String(title).trim(), id);
      }
      if (content !== undefined) {
        checkContent(content);
        this.db.prepare("UPDATE nodes SET content = ?, updated_at = datetime('now') WHERE id = ?")
          .run(content, id);
      }
      if (tags !== undefined) this._setTags(id, tags);
      return this.getNode(id);
    });
  }

  /** Re-parent a node (its whole subtree moves with it). */
  moveNode(id, newParentId) {
    return this.tx(() => {
      const row = this._row(id);
      this._row(newParentId);
      if (row.parent_id == null) throw new KtError('INVALID_MOVE', 'the root cannot be moved');
      if (row.parent_id === newParentId) return this.getNode(id);
      if (id === newParentId || this.descendantIds(id).includes(newParentId)) {
        throw new KtError('INVALID_MOVE', 'a node cannot be moved under itself or its own descendant');
      }
      this._assertHasRoom(newParentId);
      this.db.prepare("UPDATE nodes SET parent_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newParentId, this._nextPosition(newParentId), id);
      this._assertLinksValid();
      return this.getNode(id);
    });
  }

  /**
   * Split a node: create intermediate group nodes under it and move some of its
   * current children into them, so the node has room again.
   * groups: [{ title, content?, tags, children: [childId, ...] }]
   * parentUpdate: optional { title?, content?, tags? } to restate the node's own content.
   */
  splitNode(id, groups, parentUpdate = null) {
    return this.tx(() => {
      this._row(id);
      if (!Array.isArray(groups) || !groups.length) {
        throw new KtError('INVALID_SPLIT', 'give at least one group');
      }
      const current = new Set(this.db.prepare('SELECT id FROM nodes WHERE parent_id = ?').pluck().all(id));
      const seen = new Set();
      for (const g of groups) {
        checkContent(g.content ?? '', `content of group "${g.title}"`);
        if (!Array.isArray(g.children) || !g.children.length) {
          throw new KtError('INVALID_SPLIT', `group "${g.title}" must take at least one existing child`);
        }
        if (g.children.length > MAX_CHILDREN) {
          throw new KtError('INVALID_SPLIT', `group "${g.title}" would have more than ${MAX_CHILDREN} children`);
        }
        for (const c of g.children) {
          if (!current.has(c)) throw new KtError('INVALID_SPLIT', `node ${c} is not a child of node ${id}`);
          if (seen.has(c)) throw new KtError('INVALID_SPLIT', `node ${c} is listed in two groups`);
          seen.add(c);
        }
      }
      const finalCount = current.size - seen.size + groups.length;
      if (finalCount >= current.size) {
        throw new KtError('INVALID_SPLIT',
          `the split must reduce the number of children of node ${id} (${current.size} -> ${finalCount}): ` +
          'put several children in at least one group');
      }
      if (finalCount > MAX_CHILDREN) {
        throw new KtError('INVALID_SPLIT',
          `after the split node ${id} would still have ${finalCount} children (max ${MAX_CHILDREN})`);
      }
      this.db.prepare('INSERT INTO kt_split_in_progress(flag) VALUES (1)').run();
      const move = this.db.prepare('UPDATE nodes SET parent_id = ?, position = ? WHERE id = ?');
      const created = [];
      for (const g of groups) {
        const { lastInsertRowid } = this.db.prepare(
          'INSERT INTO nodes(parent_id, title, content, position) VALUES (?, ?, ?, ?)')
          .run(id, String(g.title).trim(), g.content ?? '', this._nextPosition(id));
        const gid = Number(lastInsertRowid);
        g.children.forEach((c, i) => move.run(gid, i, c));
        this._setTags(gid, g.tags);
        created.push(gid);
      }
      this.db.prepare('DELETE FROM kt_split_in_progress').run();
      if (this.childCount(id) > MAX_CHILDREN) {
        throw new KtError('INVALID_SPLIT', `split left node ${id} with more than ${MAX_CHILDREN} children`);
      }
      if (parentUpdate) this.updateNode(id, parentUpdate);
      this._assertLinksValid();
      return { node: this.getNode(id), groups: created.map((g) => this.getNode(g, { includeContent: false })) };
    });
  }

  addLink(fromId, toId, note = '') {
    return this.tx(() => {
      this._assertCanLink(fromId, toId);
      this.db.prepare('INSERT OR IGNORE INTO links(from_id, to_id, note) VALUES (?, ?, ?)').run(fromId, toId, note);
      return { from_id: fromId, to_id: toId, note };
    });
  }

  removeLink(fromId, toId) {
    const { changes } = this.db.prepare('DELETE FROM links WHERE from_id = ? AND to_id = ?').run(fromId, toId);
    if (!changes) throw new KtError('NOT_FOUND', `no link ${fromId} -> ${toId}`);
    return { removed: true };
  }

  /** Delete a leaf node (its links go with it). */
  deleteNode(id) {
    return this.tx(() => {
      const row = this._row(id);
      if (this.childCount(id)) throw new KtError('HAS_CHILDREN', `node ${id} has children: move or delete them first`);
      if (row.parent_id == null && this.db.prepare('SELECT count(*) FROM nodes').pluck().get() > 1) {
        throw new KtError('INVALID_DELETE', 'the root cannot be deleted');
      }
      this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
      return { deleted: id };
    });
  }

  /**
   * Retire a node after its content has been merged by hand (editing session) into another
   * node. Structure and links only, **never content**: the children of `fromId` move under
   * `intoId`, its outgoing and incoming links are re-pointed to `intoId`, then `fromId` is
   * deleted. Links that would become self-links or ancestor links, or that `intoId` already
   * has, are dropped and reported. `intoId` may be the parent (or any ancestor) of `fromId`:
   * that is how a hub is dissolved into its parent.
   */
  retireNode(fromId, intoId, { dryRun = false } = {}) {
    return this._txMaybeDry(() => {
      const from = this._row(fromId);
      this._row(intoId);
      if (from.parent_id == null) throw new KtError('INVALID_RETIRE', 'the root cannot be retired');
      if (fromId === intoId) throw new KtError('INVALID_RETIRE', 'a node cannot be retired into itself');
      if (this.descendantIds(fromId).includes(intoId)) {
        throw new KtError('INVALID_RETIRE',
          `node ${intoId} is a descendant of node ${fromId}: move it out first, or retire into another node`);
      }
      const children = this.db.prepare('SELECT id FROM nodes WHERE parent_id = ? ORDER BY position, id')
        .pluck().all(fromId);
      const finalCount = this.childCount(intoId) - (from.parent_id === intoId ? 1 : 0) + children.length;
      if (finalCount > MAX_CHILDREN) {
        throw new KtError('PARENT_FULL',
          `node ${intoId} would have ${finalCount} children (max ${MAX_CHILDREN}): make room first`);
      }
      const linksOut = this.db.prepare('SELECT to_id, note FROM links WHERE from_id = ?').all(fromId);
      const linksIn = this.db.prepare('SELECT from_id, note FROM links WHERE to_id = ?').all(fromId);

      // move the children (the flag lets them pass a full parent: the count is checked above
      // and again once fromId is gone)
      this.db.prepare('INSERT INTO kt_split_in_progress(flag) VALUES (1)').run();
      const move = this.db.prepare("UPDATE nodes SET parent_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?");
      for (const c of children) move.run(intoId, this._nextPosition(intoId), c);
      this.db.prepare('DELETE FROM links WHERE from_id = ? OR to_id = ?').run(fromId, fromId);
      this.db.prepare('DELETE FROM nodes WHERE id = ?').run(fromId);
      this.db.prepare('DELETE FROM kt_split_in_progress').run();
      if (this.childCount(intoId) > MAX_CHILDREN) {
        throw new KtError('PARENT_FULL', `node ${intoId} would have more than ${MAX_CHILDREN} children`);
      }

      // links of the moved subtrees that now target one of their new ancestors (e.g. a child of
      // fromId that linked to intoId, now its parent) are dropped and reported
      const dropped = [];
      const noteOf = this.db.prepare('SELECT note FROM links WHERE from_id = ? AND to_id = ?');
      for (const b of this.invalidLinks()) {
        dropped.push({ was: { ...b, note: noteOf.get(b.from_id, b.to_id).note },
          reason: `node ${b.to_id} became an ancestor of node ${b.from_id}` });
        this.db.prepare('DELETE FROM links WHERE from_id = ? AND to_id = ?').run(b.from_id, b.to_id);
      }

      // re-point the links, now that the tree has its final shape
      const intoAncestors = new Set(this.ancestorIds(intoId));
      const exists = this.db.prepare('SELECT note FROM links WHERE from_id = ? AND to_id = ?');
      const ins = this.db.prepare('INSERT INTO links(from_id, to_id, note) VALUES (?, ?, ?)');
      const moved = { out: [], in: [] };
      for (const l of linksOut) {
        const link = { from_id: intoId, to_id: l.to_id, note: l.note };
        let reason = null;
        if (l.to_id === intoId) reason = 'would link the node to itself';
        else if (intoAncestors.has(l.to_id)) reason = `node ${l.to_id} is an ancestor of node ${intoId}`;
        else if (exists.get(intoId, l.to_id)) reason = `node ${intoId} already links to node ${l.to_id}`;
        if (reason) { dropped.push({ was: { from_id: fromId, to_id: l.to_id, note: l.note }, reason }); continue; }
        ins.run(link.from_id, link.to_id, link.note);
        moved.out.push(link);
      }
      for (const l of linksIn) {
        const link = { from_id: l.from_id, to_id: intoId, note: l.note };
        let reason = null;
        if (l.from_id === intoId) reason = 'would link the node to itself';
        else if (this.ancestorIds(l.from_id).includes(intoId)) reason = `node ${intoId} is an ancestor of node ${l.from_id}`;
        else if (exists.get(l.from_id, intoId)) reason = `node ${l.from_id} already links to node ${intoId}`;
        if (reason) { dropped.push({ was: { from_id: l.from_id, to_id: fromId, note: l.note }, reason }); continue; }
        ins.run(link.from_id, link.to_id, link.note);
        moved.in.push(link);
      }
      this._assertLinksValid();
      return {
        retired: fromId,
        into: intoId,
        children_moved: children,
        links_moved_out: moved.out,
        links_moved_in: moved.in,
        links_dropped: dropped,
      };
    }, dryRun);
  }

  /**
   * Copy (or move) links of `fromId` to `toId`, keeping their notes; no content change. For the
   * links that served a section moved by hand from one node to another.
   * direction 'out': fromId -> X becomes toId -> X; 'in': X -> fromId becomes X -> toId.
   * ids: limit to these X (default: all). move: also remove the original links that were copied
   * (or that toId already had). Invalid ones are skipped and reported, and the originals kept.
   */
  copyLinks(fromId, toId, { direction = 'out', ids = null, move = false, dryRun = false } = {}) {
    return this._txMaybeDry(() => {
      this._row(fromId);
      this._row(toId);
      if (fromId === toId) throw new KtError('INVALID_LINK', 'from and to are the same node');
      const out = direction === 'out';
      let links = out
        ? this.db.prepare('SELECT to_id AS other, note FROM links WHERE from_id = ?').all(fromId)
        : this.db.prepare('SELECT from_id AS other, note FROM links WHERE to_id = ?').all(fromId);
      if (ids) {
        const known = new Set(links.map((l) => l.other));
        const missing = ids.filter((i) => !known.has(i));
        if (missing.length) {
          throw new KtError('NOT_FOUND', `node ${fromId} has no ${direction} link with node(s) ${missing.join(', ')}`);
        }
        links = links.filter((l) => ids.includes(l.other));
      }
      const exists = this.db.prepare('SELECT 1 FROM links WHERE from_id = ? AND to_id = ?');
      const ins = this.db.prepare('INSERT INTO links(from_id, to_id, note) VALUES (?, ?, ?)');
      const del = this.db.prepare('DELETE FROM links WHERE from_id = ? AND to_id = ?');
      const copied = [];
      const skipped = [];
      for (const l of links) {
        const [f, t] = out ? [toId, l.other] : [l.other, toId];
        const original = out ? [fromId, l.other] : [l.other, fromId];
        let reason = null;
        if (f === t) reason = 'would link a node to itself';
        else if (this.ancestorIds(f).includes(t)) reason = `node ${t} is an ancestor of node ${f}`;
        if (reason) { skipped.push({ from_id: f, to_id: t, reason }); continue; }
        if (exists.get(f, t)) skipped.push({ from_id: f, to_id: t, reason: 'already exists' });
        else { ins.run(f, t, l.note); copied.push({ from_id: f, to_id: t, note: l.note }); }
        if (move) del.run(...original);
      }
      return { copied, skipped, moved: move };
    }, dryRun);
  }

  /**
   * Write a consistent copy of the database to <snapshotDir>/<label>.db with SQLite's backup
   * API (a plain file copy misses what is still in the -wal file). Read-only on the live DB.
   */
  async snapshot(label) {
    if (!this.snapshotDir) throw new KtError('SNAPSHOT_NO_DIR', 'no snapshot folder (in-memory database?)');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(label)) {
      throw new KtError('INVALID_LABEL', 'label: letters, digits, ".", "_" and "-" only (max 80)');
    }
    fs.mkdirSync(this.snapshotDir, { recursive: true });
    const file = path.join(this.snapshotDir, `${label}.db`);
    if (fs.existsSync(file)) throw new KtError('SNAPSHOT_EXISTS', `${file} already exists: choose another label`);
    await this.db.backup(file);
    const count = (t) => this.db.prepare(`SELECT count(*) FROM ${t}`).pluck().get();
    return { file, nodes: count('nodes'), links: count('links'), created_at: new Date().toISOString() };
  }

  listSnapshots() {
    if (!this.snapshotDir || !fs.existsSync(this.snapshotDir)) return [];
    return fs.readdirSync(this.snapshotDir).filter((f) => f.endsWith('.db')).sort().map((f) => {
      const st = fs.statSync(path.join(this.snapshotDir, f));
      return { label: f.replace(/\.db$/, ''), file: path.join(this.snapshotDir, f), size: st.size, modified_at: st.mtime.toISOString() };
    });
  }

  _assertLinksValid() {
    const bad = this.invalidLinks();
    if (bad.length) {
      const b = bad[0];
      throw new KtError('INVALID_LINK',
        `operation would make node ${b.to_id} an ancestor of node ${b.from_id}, which links to it ` +
        '(links must target non-ancestor nodes): remove the link first');
    }
  }

  invalidLinks() {
    return this.db.prepare(`
      WITH RECURSIVE anc(node, ancestor) AS (
        SELECT id, parent_id FROM nodes WHERE parent_id IS NOT NULL
        UNION
        SELECT anc.node, n.parent_id FROM anc JOIN nodes n ON n.id = anc.ancestor WHERE n.parent_id IS NOT NULL
      )
      SELECT l.from_id, l.to_id FROM links l JOIN anc ON anc.node = l.from_id AND anc.ancestor = l.to_id`).all();
  }

  /** Full invariant check, for `kt check`. Returns a list of problems (empty = healthy). */
  check() {
    const problems = [];
    const roots = this.db.prepare('SELECT id FROM nodes WHERE parent_id IS NULL').pluck().all();
    const total = this.db.prepare('SELECT count(*) FROM nodes').pluck().get();
    if (total && roots.length !== 1) problems.push(`expected exactly one root, found ${roots.length}`);
    for (const r of this.db.prepare(
      `SELECT parent_id, count(*) n FROM nodes WHERE parent_id IS NOT NULL GROUP BY parent_id HAVING n > ${MAX_CHILDREN}`).all()) {
      problems.push(`node ${r.parent_id} has ${r.n} children (max ${MAX_CHILDREN})`);
    }
    for (const r of this.db.prepare(`
      SELECT n.id, count(t.tag) c FROM nodes n LEFT JOIN node_tags t ON t.node_id = n.id
      GROUP BY n.id HAVING c < ${MIN_TAGS} OR c > ${MAX_TAGS}`).all()) {
      problems.push(`node ${r.id} has ${r.c} tags (must be ${MIN_TAGS}-${MAX_TAGS})`);
    }
    if (roots.length === 1) {
      const reachable = 1 + this.descendantIds(roots[0]).length;
      if (reachable !== total) problems.push(`${total - reachable} node(s) not reachable from the root (cycle?)`);
    }
    for (const l of this.invalidLinks()) problems.push(`link ${l.from_id} -> ${l.to_id} targets an ancestor`);
    return problems;
  }
}
