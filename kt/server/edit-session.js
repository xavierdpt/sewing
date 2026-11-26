// Content-editing session: dump node contents to files, edit them with file tools,
// then commit them all at once.
//
//   start  -> clears the edit folder and opens a session
//   dump   -> writes <id>.md (the raw node content) for each requested node
//   (edit the .md files in place)
//   status -> what is dumped / modified / too large
//   close  -> validates every file, writes the modified contents to the database in one
//             transaction, then clears the folder (or, with discard, just clears it)
//
// All state lives in the folder (kt.editDir: data/edit/ next to the DB, or KT_EDIT_DIR),
// so the MCP server and the kt CLI share the same session.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KtError, MAX_CONTENT } from './db.js';

const MANIFEST = '.session.json';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

function dirOf(kt) {
  if (!kt.editDir) throw new KtError('EDIT_NO_DIR', 'no edit folder configured (set KT_EDIT_DIR)');
  return kt.editDir;
}

function readManifest(dir) {
  const f = path.join(dir, MANIFEST);
  if (!fs.existsSync(f)) {
    throw new KtError('EDIT_NO_SESSION', 'no editing session is open: run edit_start first');
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

const writeManifest = (dir, m) => fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m, null, 2));

/** Remove the session files (only *.md and the manifest: the folder is never wiped recursively). */
function clear(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f === MANIFEST || f.endsWith('.md')) fs.rmSync(path.join(dir, f), { force: true });
  }
}

/** Per-file state of the session, without touching the database. */
function scan(dir, manifest) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  const unknown = files.filter((f) => !(f.replace(/\.md$/, '') in manifest.nodes));
  const nodes = Object.entries(manifest.nodes).map(([id, n]) => {
    const file = path.join(dir, `${id}.md`);
    const exists = fs.existsSync(file);
    const content = exists ? fs.readFileSync(file, 'utf8') : null;
    return {
      id: Number(id),
      title: n.title,
      file,
      exists,
      content,
      length: content?.length ?? null,
      modified: exists && hash(content) !== n.hash,
      too_large: exists && content.length > MAX_CONTENT,
    };
  });
  return { nodes, unknown };
}

const publicState = (n) => {
  const { content, ...rest } = n;
  return rest;
};

/** Ids of the nodes dumped in the open editing session ([] if there is no session). */
export function dumpedIds(kt) {
  if (!kt.editDir || !fs.existsSync(path.join(kt.editDir, MANIFEST))) return [];
  return Object.keys(readManifest(kt.editDir).nodes).map(Number);
}

export function editStart(kt, { discard = false } = {}) {
  const dir = dirOf(kt);
  if (fs.existsSync(path.join(dir, MANIFEST)) && !discard) {
    const pending = scan(dir, readManifest(dir)).nodes.filter((n) => n.modified).map((n) => n.id);
    if (pending.length) {
      throw new KtError('EDIT_SESSION_OPEN',
        `the open session has uncommitted edits (nodes ${pending.join(', ')}): ` +
        'commit them with edit_close, or pass discard: true to drop them');
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  clear(dir);
  writeManifest(dir, { started_at: new Date().toISOString(), nodes: {} });
  return { dir, started: true };
}

export function editDump(kt, ids) {
  const dir = dirOf(kt);
  const manifest = readManifest(dir);
  const state = new Map(scan(dir, manifest).nodes.map((n) => [n.id, n]));
  const rows = ids.map((id) => kt._row(id)); // NOT_FOUND before writing anything
  const out = [];
  for (const row of rows) {
    const file = path.join(dir, `${row.id}.md`);
    if (state.get(row.id)?.modified) {
      // never overwrite edits in progress
      out.push({ id: row.id, title: row.title, file, length: state.get(row.id).length, already_dumped: true, modified: true });
      continue;
    }
    fs.writeFileSync(file, row.content);
    manifest.nodes[row.id] = { title: row.title, hash: hash(row.content) };
    out.push({ id: row.id, title: row.title, file, length: row.content.length });
  }
  writeManifest(dir, manifest);
  return out;
}

export function editStatus(kt) {
  const dir = dirOf(kt);
  const manifest = readManifest(dir);
  const { nodes, unknown } = scan(dir, manifest);
  return { dir, started_at: manifest.started_at, nodes: nodes.map(publicState), unknown_files: unknown };
}

export function editClose(kt, { discard = false } = {}) {
  const dir = dirOf(kt);
  const manifest = readManifest(dir);
  if (discard) {
    clear(dir);
    return { closed: true, discarded: Object.keys(manifest.nodes).map(Number), updated: [] };
  }
  const { nodes, unknown } = scan(dir, manifest);

  // validate everything first: nothing is written unless every file is fine
  const problems = [];
  if (unknown.length) problems.push(`files not dumped by this session: ${unknown.join(', ')}`);
  for (const n of nodes) {
    if (!n.exists) problems.push(`node ${n.id}: ${n.id}.md was deleted (restore it, or close with discard)`);
    if (n.too_large) {
      problems.push(`node ${n.id}: content is ${n.length} characters, the maximum is ${MAX_CONTENT}: ` +
        'shorten it, or keep a summary here and move the details into child nodes');
    }
    if (!n.modified) continue;
    const row = kt.db.prepare('SELECT content FROM nodes WHERE id = ?').get(n.id);
    if (!row) problems.push(`node ${n.id} no longer exists in the database`);
    else if (hash(row.content) !== manifest.nodes[n.id].hash) {
      problems.push(`node ${n.id} was changed in the database since it was dumped: ` +
        'merge by hand, or dump it again in a new session');
    }
  }
  if (problems.length) {
    throw new KtError('EDIT_INVALID', `nothing was written, the session stays open:\n- ${problems.join('\n- ')}`);
  }

  const changed = nodes.filter((n) => n.modified);
  kt.tx(() => { for (const n of changed) kt.updateNode(n.id, { content: n.content }); });
  clear(dir);
  return {
    closed: true,
    updated: changed.map((n) => ({ id: n.id, title: n.title, length: n.length })),
    unchanged: nodes.filter((n) => !n.modified).map((n) => n.id),
  };
}
