// The viewer's path to the solver, end to end, without a browser.
//
// Builds a sheet and a body-shaped field, drapes it through WasmCloth, and
// checks the thing that matters: nothing ends up inside the body. The module
// is injected rather than imported, because the ESM build is for the browser
// (emscripten 3.1.6 emits __dirname, which Node's ESM scope lacks).
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WasmCloth } from './wasmcloth.js';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const factory = require(join(here, '../../src/sewcloth/build/sewcloth.cjs'));
const wasmBinary = readFileSync(join(here, '../../src/sewcloth/build/sewcloth.wasm'));
const mod = await factory({ wasmBinary });

let bad = 0;
const check = (what, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) bad++;
  console.log(`  ${what.padEnd(40)} ${got.toFixed(4).padStart(10)}  want ` +
              `${want.toFixed(4).padStart(9)}  ${ok ? 'ok' : 'FAIL'}`);
};

// a sheet, as the assembly would hand it over
const N = 15, span = 40;
const verts = [];
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++)
    verts.push([-span / 2 + span * c / (N - 1), -span / 2 + span * r / (N - 1), 25]);
const edges = [];
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++) {
    const v = r * N + c;
    if (c + 1 < N) edges.push({ a: v, b: v + 1 });
    if (r + 1 < N) edges.push({ a: v, b: v + N });
  }

// a field in exactly the shape sdf.js produces: phi, n, lo, cell
const R = 8, cell = 1.0, lo = [-30, -30, -30];
const n = [61, 61, 61];
const phi = new Float32Array(n[0] * n[1] * n[2]);
for (let k = 0; k < n[2]; k++)
  for (let j = 0; j < n[1]; j++)
    for (let i = 0; i < n[0]; i++) {
      const x = lo[0] + i * cell, y = lo[1] + j * cell, z = lo[2] + k * cell;
      phi[(k * n[1] + j) * n[0] + i] = Math.hypot(x, y, z) - R;
    }

const cloth = new WasmCloth(mod, {
  verts, edges, sdf: { phi, n, lo, cell },
  fabric: { mass: 0.5, tension: 50000, damping: 0.995, thickness: 0.5, friction: 0.3 },
});
// A FLOOR. Without it a 40 cm sheet draped over an 8 cm sphere slides off
// and falls for ever -- which it did, and which is correct: nothing holds a
// sheet on a ball that much smaller than itself. The first version of this
// test omitted it and blamed the solver.
cloth.addPlane(0, 0, 1, -20);

console.log(`field uploaded: ${cloth.gridMB.toFixed(2)} MB, ` +
            `${cloth.n} verts, ${cloth.nsprings} springs`);

const t0 = Date.now();
for (let f = 0; f < 240; f++) cloth.step(1 / 60, 4);
const ms = (Date.now() - t0) / 240;

const p = cloth.positions();
let closest = Infinity;
for (let i = 0; i < cloth.n; i++)
  closest = Math.min(closest, Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));

const rep = cloth.report();
console.log(`${ms.toFixed(2)} ms/frame at 4 substeps, ` +
            `${rep.contacts} contacts, deepest ${rep.deepestCm.toFixed(4)} cm, ` +
            `${rep.cgIterations} CG iterations`);

check('closest vertex to the body centre', closest, R + 0.5, 0.2);
check('nothing is inside the body', closest > R ? 1 : 0, 1, 0);
check('the view is live and finite', Number.isFinite(p[0]) ? 1 : 0, 1, 0);

// the view must survive a step: this is the zero-copy promise
const before = p;
cloth.step(1 / 60, 4);
check('same array object after stepping', cloth.positions() === before ? 1 : 0, 1, 0);

cloth.dispose();
console.log(bad ? 'FAILED' : 'the viewer can drive the solver directly');
process.exit(bad ? 1 : 0);
