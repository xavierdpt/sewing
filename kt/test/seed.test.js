import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KnowledgeTree, MAX_CONTENT } from '../server/db.js';
import { loadSeed, readSeed } from '../server/seed-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Write a seed folder from {relative path: text} into a fresh temporary folder named `seed`. */
function seedDir(files) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kt-seed-')), 'seed');
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const md = (title, tags, body = '', links = '') =>
  `---\ntitle: ${title}\ntags: [${tags.join(', ')}]\n${links}---\n${body}\n`;

const sample = () => ({
  'index.md': md('Sample root', ['sample', 'root'], 'Root content.'),
  '10-zeta/index.md': md('First group', ['sample', 'group'], 'Group content.',
    'links:\n  - to: alpha\n    note: sibling\n'),
  '10-zeta/10-leaf-b.md': md('Leaf B', ['sample'], 'B'),
  '10-zeta/20-leaf-a.md': md('Leaf A', ['Sample Tag'], 'A', 'links:\n  - to: alpha\n    note: cross-link\n'),
  '20-alpha.md': md('Second, a leaf', ['sample'], '# Heading\n\nText.'),
  'notes.txt': 'not a node',
});

function failsWith(files, codeWanted, fileWanted) {
  const kt = new KnowledgeTree(':memory:');
  let err;
  try { loadSeed(kt, seedDir(files)); } catch (e) { err = e; }
  assert.ok(err, 'the seed should fail');
  assert.equal(err.code, codeWanted, err.message);
  if (fileWanted) assert.match(err.message, new RegExp(fileWanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(kt.root(), null, 'nothing is written');
  assert.equal(kt.db.prepare('SELECT count(*) FROM nodes').pluck().get(), 0);
}

test('seed: loads folders and files, titles from the front matter, order from the prefixes', () => {
  const kt = new KnowledgeTree(':memory:');
  const { nodes, links, ids } = loadSeed(kt, seedDir(sample()));
  assert.equal(nodes, 5);
  assert.equal(links, 2);
  const root = kt.getNode(ids['/']);
  assert.equal(root.title, 'Sample root');
  assert.equal(root.content, 'Root content.');
  assert.deepEqual(root.children.map((c) => c.title), ['First group', 'Second, a leaf']);
  const group = kt.getNode(ids.zeta);
  assert.deepEqual(group.children.map((c) => c.title), ['Leaf B', 'Leaf A']);
  assert.deepEqual(kt.getNode(ids['zeta/leaf-a']).tags, ['sample-tag']);
  assert.equal(kt.getNode(ids.alpha).content, '# Heading\n\nText.');
  assert.deepEqual(group.links_out.map((l) => [l.id ?? l.to_id, l.note]), [[ids.alpha, 'sibling']]);
  assert.deepEqual(kt.check(), []);
});

test('seed: keys strip the number prefix and .md; the root is /', () => {
  const keys = readSeed(seedDir(sample())).map((n) => n.key);
  assert.deepEqual(keys, ['/', 'zeta', 'zeta/leaf-b', 'zeta/leaf-a', 'alpha']);
});

test('seed: a folder with 6 children fails, naming the 6th file', () => {
  const files = { 'index.md': md('r', ['r']) };
  for (let i = 1; i <= 6; i++) files[`${i}0-c${i}.md`] = md(`c${i}`, ['c']);
  failsWith(files, 'PARENT_FULL', 'seed/60-c6.md');
});

test('seed: content over the limit fails, naming the file', () => {
  failsWith({ 'index.md': md('r', ['r']), 'big.md': md('big', ['b'], 'x'.repeat(MAX_CONTENT + 1)) },
    'CONTENT_TOO_LARGE', 'seed/big.md');
});

test('seed: a link to an ancestor fails, naming the file', () => {
  failsWith({
    'index.md': md('r', ['r']),
    'a/index.md': md('a', ['a']),
    'a/b.md': md('b', ['b'], '', 'links:\n  - to: a\n'),
  }, 'INVALID_LINK', 'seed/a/b.md');
});

test('seed: an unknown link key fails, naming the file', () => {
  failsWith({ 'index.md': md('r', ['r'], '', 'links:\n  - to: nowhere\n') }, 'INVALID_SEED', 'seed/index.md');
});

test('seed: a missing title, bad tags or an unknown field fails, naming the file', () => {
  failsWith({ 'index.md': md('r', ['r']), 'x.md': '---\ntags: [x]\n---\nbody\n' }, 'INVALID_SEED', 'seed/x.md');
  failsWith({ 'index.md': md('r', ['r']), 'x.md': '---\ntitle: x\ntags: []\n---\n' }, 'INVALID_TAGS', 'seed/x.md');
  failsWith({ 'index.md': md('r', ['r']), 'x.md': '---\ntitle: x\ntag: [x]\n---\n' }, 'INVALID_SEED', 'seed/x.md');
  failsWith({ 'index.md': md('r', ['r']), 'x.md': 'no front matter' }, 'INVALID_SEED', 'seed/x.md');
});

test('seed: structure errors (no index.md, duplicate key, missing folder)', () => {
  failsWith({ 'index.md': md('r', ['r']), 'a/b.md': md('b', ['b']) }, 'INVALID_SEED', 'seed/a');
  failsWith({ 'index.md': md('r', ['r']), '10-a.md': md('a', ['a']), '20-a.md': md('a2', ['a']) }, 'INVALID_SEED', 'seed/20-a.md');
  const kt = new KnowledgeTree(':memory:');
  assert.throws(() => loadSeed(kt, path.join(os.tmpdir(), 'kt-no-such-seed')), { code: 'INVALID_SEED' });
});

test('seed: refuses a non-empty database', () => {
  const kt = new KnowledgeTree(':memory:');
  kt.createNode({ title: 'existing', tags: ['x'] });
  assert.throws(() => loadSeed(kt, seedDir(sample())), { code: 'NOT_EMPTY' });
  assert.equal(kt.db.prepare('SELECT count(*) FROM nodes').pluck().get(), 1);
});

test('seed script: seeds once, then refuses and asks to delete the data by hand', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-seed-db-'));
  const env = { ...process.env, KT_DB: path.join(tmp, 'k.db') };
  const run = (...argv) => {
    try {
      return { status: 0, out: execFileSync('node', [path.join(ROOT, 'scripts', 'seed.js'), ...argv],
        { env, stdio: 'pipe' }).toString() };
    } catch (e) {
      return { status: e.status, out: e.stderr.toString() };
    }
  };
  // a broken seed on an empty database writes nothing
  const broken = seedDir({ 'index.md': md('r', ['r'], '', 'links:\n  - to: nowhere\n') });
  let r = run(broken);
  assert.equal(r.status, 1);
  assert.match(r.out, /unknown key[\s\S]*Nothing was written/);
  // the first load works
  r = run(seedDir(sample()));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /seeded 5 nodes and 2 links/);
  // a second load is refused: the data must be deleted by hand, and stays untouched
  r = run(seedDir(sample()));
  assert.equal(r.status, 1);
  assert.match(r.out, /already holds 5 node\(s\)[\s\S]*delete the existing data yourself[\s\S]*k\.db-wal/);
  // there is no --reset
  r = run(seedDir(sample()), '--reset');
  assert.equal(r.status, 1);
  assert.match(r.out, /unknown option/);
  const kt = new KnowledgeTree(env.KT_DB);
  assert.equal(kt.db.prepare('SELECT count(*) FROM nodes').pluck().get(), 5, 'the data is untouched');
  kt.close();
  // once deleted by hand, the seed loads again
  for (const f of ['k.db', 'k.db-wal', 'k.db-shm']) fs.rmSync(path.join(tmp, f), { force: true });
  assert.equal(run(seedDir(sample())).status, 0);
});

test('the project seed loads: root plus 2 levels, 16 nodes, no problem', () => {
  const kt = new KnowledgeTree(':memory:');
  const { nodes, links, ids } = loadSeed(kt, path.join(ROOT, 'seed'));
  assert.equal(nodes, 16);
  assert.ok(links >= 8, `links: ${links}`);
  const depthOf = (id) => kt.getNode(id).path.length - 1;
  assert.equal(Math.max(...Object.values(ids).map(depthOf)), 2);
  assert.deepEqual(kt.check(), []);
  const hits = kt.searchText('spec todo methodology').map((h) => h.title);
  assert.ok(hits.includes('Spec + todo methodology'), `CLAUDE.md's search finds the node: ${hits}`);
});
