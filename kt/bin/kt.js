#!/usr/bin/env node
// Command-line access to the knowledge tree: the same operations as the MCP tools.
//
//   kt <op> [--field value ...]      e.g.  kt find_nodes_by_tags --tags sqlite,search --partial
//   kt <op> --json '{"id": 3}'       full JSON input (or --json @file.json)
//   kt help [op]
//
// Array fields take comma-separated values; numbers and booleans are parsed.
// Output is JSON on stdout; errors go to stderr with exit status 1.
import fs from 'node:fs';
import { z } from 'zod';
import { KnowledgeTree } from '../server/db.js';
import { ops, runOp } from '../server/ops.js';

const kebab = (s) => s.replace(/-/g, '_');

function baseType(schema) {
  let s = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodDefault) s = s._def.innerType;
  return s;
}

function coerce(schema, raw) {
  const t = baseType(schema);
  if (raw === true) return true;
  if (t instanceof z.ZodNumber) return Number(raw);
  if (t instanceof z.ZodBoolean) return raw === 'true' || raw === '1';
  if (t instanceof z.ZodArray) {
    if (raw.trim().startsWith('[')) return JSON.parse(raw);
    const item = baseType(t.element);
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    return item instanceof z.ZodNumber ? parts.map(Number) : parts;
  }
  if (t instanceof z.ZodObject) return JSON.parse(raw);
  return raw;
}

function readValue(v) {
  if (v === '-') return fs.readFileSync(0, 'utf8');
  if (typeof v === 'string' && v.startsWith('@')) return fs.readFileSync(v.slice(1), 'utf8');
  return v;
}

function parseArgs(op, argv) {
  let args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}"`);
    const key = kebab(a.slice(2));
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? true : (i++, readValue(next));
    if (key === 'json') { args = { ...args, ...JSON.parse(value) }; continue; }
    if (!(key in op.input)) throw new Error(`unknown option --${a.slice(2)} (see: kt help ${process.argv[2]})`);
    args[key] = coerce(op.input[key], value);
  }
  return args;
}

function help(name) {
  if (name && ops[name]) {
    const op = ops[name];
    console.log(`kt ${name}\n\n${op.description}\n\nOptions:`);
    for (const [k, s] of Object.entries(op.input)) {
      const opt = s.isOptional() ? ' (optional)' : '';
      console.log(`  --${k}${opt}${s.description ? `  ${s.description}` : ''}`);
    }
    console.log('  --json \'{...}\' | @file.json   whole input as JSON; a value of "-" reads stdin, "@path" reads a file');
    return;
  }
  console.log('usage: kt <operation> [--option value ...] | kt help <operation>\n\nOperations:');
  for (const [k, op] of Object.entries(ops)) console.log(`  ${k.padEnd(20)} ${op.description.split('. ')[0]}`);
}

const [name, ...rest] = process.argv.slice(2).map((x, i) => (i === 0 ? kebab(x) : x));
if (!name || name === 'help' || name === '--help') {
  help(rest[0] && kebab(rest[0]));
  process.exit(0);
}
const kt = new KnowledgeTree();
try {
  if (!ops[name]) throw Object.assign(new Error(`unknown operation "${name}" (see: kt help)`), { code: 'UNKNOWN_OP' });
  const result = await runOp(kt, name, parseArgs(ops[name], rest));
  console.log(JSON.stringify(result, (k, v) => (v === Infinity ? null : v), 2));
  if (name === 'check' && result.problems.length) process.exitCode = 1;
} catch (e) {
  console.error(`${e.code || 'ERROR'}: ${e.message}`);
  process.exitCode = 1;
} finally {
  kt.close();
}
