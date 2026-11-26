// HTTP backend: JSON API over the shared operations + the built React app.
//   POST /api/ops/:name   body = operation input  ->  { result } | { error: { code, message } }
//   GET  /api/ops         list of operations
// Read-only: write operations are refused (403). Content is edited only from Claude
// sessions through the MCP / command line tools.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KnowledgeTree } from './db.js';
import { ops, runOp } from './ops.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

const kt = new KnowledgeTree();
const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/ops', (req, res) => {
  res.json(Object.fromEntries(Object.entries(ops).filter(([, op]) => !op.write && !op.local).map(([k, op]) => [k, op.description])));
});

const STATUS = { NOT_FOUND: 404, UNKNOWN_OP: 404 };

app.post('/api/ops/:name', async (req, res) => {
  if (ops[req.params.name]?.write || ops[req.params.name]?.local) {
    return res.status(403).json({ error: { code: 'READ_ONLY',
      message: 'the web API is read-only: edit content from a Claude session with the MCP / command line tools' } });
  }
  try {
    const result = await runOp(kt, req.params.name, req.body ?? {});
    res.json({ result });
  } catch (e) {
    const status = STATUS[e.code] || (e.code ? 400 : 500);
    res.status(status).json({ error: { code: e.code || 'ERROR', message: e.message } });
  }
});

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, HOST, () => console.log(`knowledge-tree API on http://${HOST}:${PORT}`));
