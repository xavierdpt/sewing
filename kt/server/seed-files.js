// The Markdown seed: one file per node, in folders that mirror the tree.
//
//   seed/index.md                    the root
//   seed/10-architecture/index.md    a node with children: a folder with an index.md
//   seed/10-architecture/20-x.md     a leaf: a plain .md file
//
// The numeric prefix (`10-`) only orders the children. A node's key, used by links, is its path
// without the prefixes and without `.md` (`architecture/x`); the root's key is `/`. Each file
// starts with a YAML front matter (title, tags, links: [{to, note}]), then the Markdown content.
// Titles come from the front matter, never from the file names.
//
// Import only: the seed is loaded into an empty database, in one transaction, and nothing is
// ever written back to it.
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { KtError } from './db.js';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const FIELDS = new Set(['title', 'tags', 'links']);

const keyPart = (name) => name.replace(/\.md$/, '').replace(/^\d+[-_.]?/, '');
const normalizeKey = (key) => {
  const k = String(key).trim().replace(/^\/+|\/+$/g, '');
  return k === '' ? '/' : k;
};
const childKey = (parentKey, part) => (parentKey === '/' ? part : `${parentKey}/${part}`);

/** Parse one seed file: front matter + content. `label` names the file in errors. */
export function parseSeedFile(text, label) {
  const bad = (msg) => new KtError('INVALID_SEED', `${label}: ${msg}`);
  const m = FRONT_MATTER.exec(text);
  if (!m) throw bad('the file must start with a front matter between two `---` lines');
  let fm;
  try {
    fm = parseYaml(m[1]) ?? {};
  } catch (e) {
    throw bad(`front matter is not valid YAML: ${e.message}`);
  }
  if (typeof fm !== 'object' || Array.isArray(fm)) throw bad('front matter must be a mapping');
  const unknown = Object.keys(fm).filter((k) => !FIELDS.has(k));
  if (unknown.length) throw bad(`unknown front matter field(s): ${unknown.join(', ')} (allowed: title, tags, links)`);
  if (typeof fm.title !== 'string' || !fm.title.trim()) throw bad('front matter needs a non-empty `title`');
  if (!Array.isArray(fm.tags)) throw bad('front matter needs `tags`, a list');
  const links = fm.links ?? [];
  if (!Array.isArray(links)) throw bad('`links` must be a list of {to, note}');
  for (const l of links) {
    if (!l || typeof l !== 'object' || l.to === undefined || l.to === null) throw bad('each link needs a `to` key');
    if (l.note !== undefined && typeof l.note !== 'string') throw bad('a link `note` must be text');
  }
  return {
    title: fm.title.trim(),
    tags: fm.tags.map(String),
    links: links.map((l) => ({ to: normalizeKey(l.to), note: l.note ?? '' })),
    content: text.slice(m[0].length).replace(/^\s*\n/, '').trimEnd(),
  };
}

/**
 * Read a seed folder into a list of nodes, parents before children:
 * [{key, parentKey, file, title, tags, links, content}]. Touches no database.
 */
export function readSeed(dir) {
  const base = path.basename(path.resolve(dir));
  const label = (abs) => path.join(base, path.relative(dir, abs));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new KtError('INVALID_SEED', `seed folder not found: ${dir}`);
  }
  const nodes = [];
  const byKey = new Map();
  const add = (node) => {
    if (byKey.has(node.key)) {
      throw new KtError('INVALID_SEED', `${node.file}: key "${node.key}" is already used by ${byKey.get(node.key).file}`);
    }
    byKey.set(node.key, node);
    nodes.push(node);
  };

  const walk = (folder, key, parentKey) => {
    const index = path.join(folder, 'index.md');
    if (!fs.existsSync(index)) throw new KtError('INVALID_SEED', `${label(folder)}: a node folder needs an index.md`);
    add({ key, parentKey, file: label(index), ...parseSeedFile(fs.readFileSync(index, 'utf8'), label(index)) });
    const entries = fs.readdirSync(folder, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== 'index.md')
      .filter((e) => e.isDirectory() || e.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    for (const e of entries) {
      const abs = path.join(folder, e.name);
      const k = childKey(key, keyPart(e.name));
      if (!keyPart(e.name)) throw new KtError('INVALID_SEED', `${label(abs)}: the name has no part left once the number prefix is removed`);
      if (e.isDirectory()) walk(abs, k, key);
      else add({ key: k, parentKey: key, file: label(abs), ...parseSeedFile(fs.readFileSync(abs, 'utf8'), label(abs)) });
    }
  };
  walk(dir, '/', null);

  for (const n of nodes) {
    for (const l of n.links) {
      if (!byKey.has(l.to)) throw new KtError('INVALID_SEED', `${n.file}: link to unknown key "${l.to}"`);
    }
  }
  return nodes;
}

/**
 * Load a seed folder into an empty tree, in one transaction: on any error nothing is written.
 * Errors from the tree rules (PARENT_FULL, CONTENT_TOO_LARGE, INVALID_TAGS, INVALID_LINK, ...)
 * keep their code, with the file named in the message.
 */
export function loadSeed(kt, dir) {
  if (kt.root()) throw new KtError('NOT_EMPTY', 'the database is not empty: the seed loads only into an empty one');
  const nodes = readSeed(dir);
  const ids = {};
  const inFile = (file, fn) => {
    try {
      return fn();
    } catch (e) {
      throw new KtError(e.code || 'INVALID_SEED', `${file}: ${e.message}`);
    }
  };
  let links = 0;
  kt.tx(() => {
    for (const n of nodes) {
      ids[n.key] = inFile(n.file, () => kt.createNode({
        parentId: n.parentKey === null ? null : ids[n.parentKey],
        title: n.title,
        content: n.content,
        tags: n.tags,
      }).id);
    }
    for (const n of nodes) {
      for (const l of n.links) {
        inFile(n.file, () => kt.addLink(ids[n.key], ids[l.to], l.note));
        links++;
      }
    }
  });
  return { nodes: nodes.length, links, ids };
}
