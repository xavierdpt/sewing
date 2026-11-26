#!/usr/bin/env node
// Load the Markdown seed (default: the seed/ folder) into an empty database, once.
//   node scripts/seed.js [folder]
// The seed loads only into an empty database. If the database already holds content, the script
// refuses and says how to delete the existing data by hand: it never erases anything itself.
// The seed is optional, and import-only: see server/seed-files.js for the format.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, KnowledgeTree } from '../server/db.js';
import { loadSeed } from '../server/seed-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const unknown = args.filter((a) => a.startsWith('--'));
if (unknown.length) {
  console.error(`unknown option(s): ${unknown.join(' ')}. Usage: node scripts/seed.js [folder]`);
  process.exit(1);
}
const dir = args[0] || path.join(ROOT, 'seed');

const kt = new KnowledgeTree();
const count = kt.db.prepare('SELECT count(*) FROM nodes').pluck().get();
if (count > 0) {
  kt.close();
  console.error(
    `NOT_EMPTY: ${DEFAULT_DB_PATH} already holds ${count} node(s). The seed loads only into an empty ` +
    'database, and this script never deletes data.\n' +
    'To start again from the seed, delete the existing data yourself: stop the web server and every ' +
    'Claude session using the MCP server, then delete these files and run the seed again:\n' +
    `  ${DEFAULT_DB_PATH}\n  ${DEFAULT_DB_PATH}-wal\n  ${DEFAULT_DB_PATH}-shm`);
  process.exit(1);
}

let result;
try {
  result = loadSeed(kt, dir);
} catch (e) {
  kt.close();
  console.error(`${e.code || 'ERROR'}: ${e.message}`);
  console.error('Nothing was written: the database is still empty.');
  process.exit(1);
}

const problems = kt.check();
console.log(`seeded ${result.nodes} nodes and ${result.links} links from ${dir} into ${DEFAULT_DB_PATH}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}
kt.close();
