import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KnowledgeTree, MAX_CONTENT } from '../server/db.js';
import { runOp } from '../server/ops.js';

function fresh() {
  const kt = new KnowledgeTree(':memory:');
  const root = kt.createNode({ title: 'root', tags: ['root'] });
  return { kt, root: root.id };
}
const add = (kt, parentId, title, tags = ['t']) => kt.createNode({ parentId, title, tags }).id;
const code = (fn) => { try { fn(); } catch (e) { return e.code || e.message; } return 'no error'; };

test('single root', () => {
  const { kt } = fresh();
  assert.equal(code(() => kt.createNode({ title: 'r2', tags: ['x'] })), 'ROOT_EXISTS');
});

test('tags: 1 to 10, normalized', () => {
  const { kt, root } = fresh();
  assert.equal(code(() => kt.createNode({ parentId: root, title: 'a', tags: [] })), 'INVALID_TAGS');
  const many = Array.from({ length: 11 }, (_, i) => `t${i}`);
  assert.equal(code(() => kt.createNode({ parentId: root, title: 'a', tags: many })), 'INVALID_TAGS');
  const n = kt.createNode({ parentId: root, title: 'a', tags: ['Full Text', 'full_text', 'SQLite'] });
  assert.deepEqual(n.tags, ['full-text', 'sqlite']);
});

test('max 5 children, then split', () => {
  const { kt, root } = fresh();
  const kids = [1, 2, 3, 4, 5].map((i) => add(kt, root, `c${i}`));
  assert.equal(code(() => add(kt, root, 'c6')), 'PARENT_FULL');
  const { node, groups } = kt.splitNode(root, [
    { title: 'g1', tags: ['g'], children: kids.slice(0, 3) },
    { title: 'g2', tags: ['g'], children: kids.slice(3) },
  ], { content: 'restructured' });
  assert.equal(node.children.length, 2);
  assert.equal(node.content, 'restructured');
  assert.equal(groups[0].children.length, 3);
  add(kt, root, 'c6');
  assert.deepEqual(kt.check(), []);
});

test('split refuses bad groups and leaves the tree unchanged', () => {
  const { kt, root } = fresh();
  const kids = [1, 2, 3, 4, 5].map((i) => add(kt, root, `c${i}`));
  const other = add(kt, kids[0], 'grandchild');
  assert.equal(code(() => kt.splitNode(root, [{ title: 'g', tags: ['g'], children: [other] }])), 'INVALID_SPLIT');
  // wrapping one child in one group frees no slot
  assert.equal(code(() => kt.splitNode(root, [{ title: 'g', tags: ['g'], children: [kids[0]] }])), 'INVALID_SPLIT');
  assert.equal(kt.childCount(root), 5);
  assert.equal(kt.db.prepare('SELECT count(*) FROM kt_split_in_progress').pluck().get(), 0);
});

test('links only to non-ancestors, also after moves', () => {
  const { kt, root } = fresh();
  const a = add(kt, root, 'a');
  const b = add(kt, a, 'b');
  const c = add(kt, root, 'c');
  assert.equal(code(() => kt.addLink(b, a)), 'INVALID_LINK');
  assert.equal(code(() => kt.addLink(b, root)), 'INVALID_LINK');
  assert.equal(code(() => kt.addLink(b, b)), 'INVALID_LINK');
  kt.addLink(a, b); // descendant is fine
  kt.addLink(b, c);
  assert.equal(code(() => kt.moveNode(a, c)), 'INVALID_LINK'); // c would become b's ancestor
  assert.equal(kt.getNode(a).parent_id, root);
  assert.equal(code(() => kt.moveNode(a, b)), 'INVALID_MOVE');
});

test('find by tags ranks by number of matched candidates', () => {
  const { kt, root } = fresh();
  const x = kt.createNode({ parentId: root, title: 'x', tags: ['sqlite', 'search'] }).id;
  const y = kt.createNode({ parentId: root, title: 'y', tags: ['sqlite-fts'] }).id;
  const exact = kt.findByTags(['sqlite', 'search']);
  assert.deepEqual(exact.map((r) => r.id), [x]);
  const partial = kt.findByTags(['sqlite'], { partial: true });
  assert.deepEqual(partial.map((r) => r.id).sort(), [x, y].sort());
});

test('ops validate input', async () => {
  const { kt } = fresh();
  await assert.rejects(runOp(kt, 'get_node', { id: 'x' }), /id/);
  await assert.rejects(runOp(kt, 'nope', {}), /unknown operation/);
  const r = await runOp(kt, 'search_text', { query: 'root' });
  assert.equal(r.length, 1);
});

test(`content is at most ${MAX_CONTENT} characters`, () => {
  const { kt, root } = fresh();
  const big = 'x'.repeat(MAX_CONTENT + 1);
  assert.equal(code(() => kt.createNode({ parentId: root, title: 'a', tags: ['t'], content: big })), 'CONTENT_TOO_LARGE');
  const a = kt.createNode({ parentId: root, title: 'a', tags: ['t'], content: 'x'.repeat(MAX_CONTENT) }).id;
  assert.equal(kt.getNode(a, { includeContent: false }).content_length, MAX_CONTENT);
  assert.equal(code(() => kt.updateNode(a, { content: big })), 'CONTENT_TOO_LARGE');
  // the database itself refuses it too
  assert.match(code(() => kt.db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(big, a)), /SQLITE_CONSTRAINT_CHECK/);
});

test('a database created with another content limit is migrated on open', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-limit-'));
  const file = path.join(dir, 'old.db');
  const kt0 = new KnowledgeTree(file);
  const root = kt0.createNode({ title: 'root', tags: ['root'] }).id;
  // simulate an old database whose CHECK still says 4096
  kt0.db.unsafeMode(true);
  const version = kt0.db.pragma('schema_version', { simple: true });
  kt0.db.pragma('writable_schema = ON');
  kt0.db.prepare("UPDATE sqlite_schema SET sql = replace(sql, ?, 'length(content) <= 4096') WHERE name = 'nodes'")
    .run(`length(content) <= ${MAX_CONTENT}`);
  kt0.db.pragma(`schema_version = ${version + 1}`);
  kt0.db.pragma('writable_schema = OFF');
  kt0.close();

  const kt = new KnowledgeTree(file);
  const sql = kt.db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'nodes'").pluck().get();
  assert.match(sql, new RegExp(`length\\(content\\) <= ${MAX_CONTENT}\\)`));
  kt.db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('x'.repeat(MAX_CONTENT), root);
  assert.match(code(() => kt.db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('x'.repeat(MAX_CONTENT + 1), root)),
    /SQLITE_CONSTRAINT_CHECK/);
  assert.deepEqual(kt.check(), []);
  kt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('retire_node: children and links move, content untouched, bad links reported', async () => {
  const { kt, root } = fresh();
  const hub = kt.createNode({ parentId: root, title: 'hub', tags: ['t'], content: 'hub text' }).id;
  const into = kt.createNode({ parentId: root, title: 'into', tags: ['t'], content: 'into text' }).id;
  const other = add(kt, root, 'other');
  const under = add(kt, into, 'under');
  const k1 = add(kt, hub, 'k1');
  const k2 = add(kt, hub, 'k2');
  kt.addLink(hub, other, 'hub->other');
  kt.addLink(other, hub, 'other->hub');
  kt.addLink(hub, into, 'hub->into');       // would become a self-link
  kt.addLink(k1, into, 'k1->into');         // into becomes k1's parent: dropped
  kt.addLink(into, other, 'already there');
  kt.addLink(under, hub, 'under->hub');     // would become under -> into, its parent: dropped

  // dry run changes nothing
  const dry = kt.retireNode(hub, into, { dryRun: true });
  assert.equal(dry.dry_run, true);
  assert.deepEqual(dry.children_moved, [k1, k2]);
  assert.equal(kt.getNode(hub).children.length, 2);
  assert.equal(kt.getNode(k1).links_out.length, 1);

  const r = kt.retireNode(hub, into);
  assert.equal(code(() => kt.getNode(hub)), 'NOT_FOUND');
  assert.deepEqual(kt.getNode(into).children.map((c) => c.id), [under, k1, k2]);
  assert.equal(kt.getNode(into).content, 'into text'); // content is never changed
  assert.deepEqual(r.links_moved_in, [{ from_id: other, to_id: into, note: 'other->hub' }]);
  assert.deepEqual(r.links_moved_out, []); // into->other already existed
  assert.equal(kt.getNode(into).links_out.find((l) => l.id === other).note, 'already there');
  assert.deepEqual(r.links_dropped.map((d) => [d.was.from_id, d.was.to_id]).sort(),
    [[hub, into], [hub, other], [k1, into], [under, hub]].sort());
  assert.deepEqual(kt.check(), []);

  // dissolving a hub into its parent, which is full: allowed, the hub frees its own slot
  const full = add(kt, root, 'full');
  const hub2 = add(kt, full, 'hub2');
  [1, 2, 3, 4].forEach((i) => add(kt, full, `f${i}`));
  add(kt, hub2, 'h1');
  kt.retireNode(hub2, full);
  assert.equal(kt.getNode(full).children.length, 5);
  // but not when it would overflow
  const hub3 = kt.getNode(full).children[0].id;
  add(kt, hub3, 'x1'); add(kt, hub3, 'x2');
  assert.equal(code(() => kt.retireNode(hub3, full)), 'PARENT_FULL');
  assert.equal(code(() => kt.retireNode(root, full)), 'INVALID_RETIRE');
  assert.equal(code(() => kt.retireNode(full, hub3)), 'INVALID_RETIRE'); // into is a descendant
  assert.deepEqual(kt.check(), []);
});

test('retire_node is refused while the node is dumped in an editing session', async () => {
  const fsm = await import('node:fs');
  const os = await import('node:os');
  const pathm = await import('node:path');
  const { kt, root } = fresh();
  kt.editDir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'kt-edit-'));
  const a = add(kt, root, 'a');
  const b = add(kt, root, 'b');
  await runOp(kt, 'edit_start');
  await runOp(kt, 'edit_dump', { ids: [a, b] });
  await assert.rejects(runOp(kt, 'retire_node', { id: a, into: b }), (e) => e.code === 'EDIT_SESSION_OPEN');
  await runOp(kt, 'edit_close');
  await runOp(kt, 'retire_node', { id: a, into: b });
  fsm.rmSync(kt.editDir, { recursive: true });
});

test('copy_links: out and in, move, skips invalid and existing', () => {
  const { kt, root } = fresh();
  const src = add(kt, root, 'src');
  const dst = add(kt, root, 'dst');
  const x = add(kt, root, 'x');
  const y = add(kt, root, 'y');
  const child = add(kt, dst, 'child');
  kt.addLink(src, x, 'about x');
  kt.addLink(src, y, 'about y');
  kt.addLink(src, dst, 'to dst');           // dst -> dst: skipped
  kt.addLink(child, src, 'child->src');     // child -> dst: dst is its parent, skipped
  kt.addLink(y, src, 'y->src');

  const r = kt.copyLinks(src, dst, { ids: [x, dst] });
  assert.deepEqual(r.copied, [{ from_id: dst, to_id: x, note: 'about x' }]);
  assert.equal(r.skipped.length, 1);
  assert.equal(kt.getNode(src).links_out.length, 3); // copy keeps the originals
  assert.equal(code(() => kt.copyLinks(src, dst, { ids: [child] })), 'NOT_FOUND');

  const m = kt.copyLinks(src, dst, { direction: 'in', move: true });
  assert.deepEqual(m.copied, [{ from_id: y, to_id: dst, note: 'y->src' }]);
  assert.equal(m.skipped[0].from_id, child);
  assert.deepEqual(kt.getNode(src).links_in.map((l) => l.id), [child]); // invalid one kept

  const d = kt.copyLinks(src, dst, { ids: [y], move: true, dryRun: true });
  assert.equal(d.dry_run, true);
  assert.ok(kt.getNode(src).links_out.some((l) => l.id === y));
  assert.deepEqual(kt.check(), []);
});

test('snapshot: consistent copy, labels checked, no overwrite', async () => {
  const fsm = await import('node:fs');
  const os = await import('node:os');
  const pathm = await import('node:path');
  const { KnowledgeTree: KT } = await import('../server/db.js');
  const dir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'kt-snap-'));
  const kt = new KT(pathm.join(dir, 'k.db'));
  const root = kt.createNode({ title: 'root', tags: ['root'] }).id;
  add(kt, root, 'a');
  const s = await runOp(kt, 'snapshot', { label: 'before-x' });
  assert.equal(s.file, pathm.join(dir, 'snapshots', 'before-x.db'));
  assert.equal(s.nodes, 2);
  add(kt, root, 'b'); // after the snapshot, still in the -wal file
  const copy = new KT(s.file);
  assert.equal(copy.getTree().child_count, 1);
  copy.close();
  await assert.rejects(runOp(kt, 'snapshot', { label: 'before-x' }), (e) => e.code === 'SNAPSHOT_EXISTS');
  await assert.rejects(runOp(kt, 'snapshot', { label: '../evil' }), (e) => e.code === 'INVALID_LABEL');
  assert.deepEqual((await runOp(kt, 'list_snapshots')).map((x) => x.label), ['before-x']);
  kt.close();
  fsm.rmSync(dir, { recursive: true });
});

test('edit session: start, dump, edit, close', async () => {
  const fsm = await import('node:fs');
  const os = await import('node:os');
  const pathm = await import('node:path');
  const dir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'kt-edit-'));
  const { kt, root } = fresh();
  kt.editDir = dir;
  const a = kt.createNode({ parentId: root, title: 'a', tags: ['t'], content: 'alpha' }).id;
  const b = kt.createNode({ parentId: root, title: 'b', tags: ['t'], content: 'beta' }).id;
  const c = kt.createNode({ parentId: root, title: 'c', tags: ['t'], content: 'gamma' }).id;
  const op = (name, args = {}) => runOp(kt, name, args);

  await assert.rejects(op('edit_dump', { ids: [a] }), (e) => e.code === 'EDIT_NO_SESSION');
  fsm.writeFileSync(pathm.join(dir, 'stale.md'), 'left over');
  await op('edit_start');
  assert.deepEqual(fsm.readdirSync(dir), ['.session.json']); // folder cleared
  await assert.rejects(op('edit_dump', { ids: [a, 999] }), (e) => e.code === 'NOT_FOUND');
  const dumped = await op('edit_dump', { ids: [a, b, c] });
  assert.equal(fsm.readFileSync(dumped[0].file, 'utf8'), 'alpha');

  fsm.writeFileSync(pathm.join(dir, `${a}.md`), 'ALPHA');
  // re-dumping never overwrites an edit in progress
  assert.equal((await op('edit_dump', { ids: [a] }))[0].modified, true);
  assert.equal(fsm.readFileSync(pathm.join(dir, `${a}.md`), 'utf8'), 'ALPHA');
  // a new session refuses to drop uncommitted edits
  await assert.rejects(op('edit_start'), (e) => e.code === 'EDIT_SESSION_OPEN');

  // any invalid file: nothing is written, the session stays open
  fsm.writeFileSync(pathm.join(dir, `${b}.md`), 'x'.repeat(MAX_CONTENT + 1));
  await assert.rejects(op('edit_close'), (e) => e.code === 'EDIT_INVALID' && e.message.includes(String(MAX_CONTENT + 1)));
  assert.equal(kt.getNode(a).content, 'alpha');
  fsm.writeFileSync(pathm.join(dir, `${b}.md`), 'BETA');
  kt.updateNode(b, { content: 'changed elsewhere' });
  await assert.rejects(op('edit_close'), (e) => e.code === 'EDIT_INVALID' && /changed in the database/.test(e.message));
  kt.updateNode(b, { content: 'beta' });

  const st = await op('edit_status');
  assert.deepEqual(st.nodes.filter((n) => n.modified).map((n) => n.id), [a, b]);
  const r = await op('edit_close');
  assert.deepEqual(r.updated.map((n) => n.id), [a, b]);
  assert.deepEqual(r.unchanged, [c]);
  assert.equal(kt.getNode(a).content, 'ALPHA');
  assert.equal(kt.getNode(b).content, 'BETA');
  assert.deepEqual(fsm.readdirSync(dir), []);
  await assert.rejects(op('edit_status'), (e) => e.code === 'EDIT_NO_SESSION');

  // discard
  await op('edit_start');
  await op('edit_dump', { ids: [c] });
  fsm.writeFileSync(pathm.join(dir, `${c}.md`), 'nope');
  await op('edit_start', { discard: true });
  await op('edit_close', { discard: true });
  assert.equal(kt.getNode(c).content, 'gamma');
  fsm.rmSync(dir, { recursive: true });
});
