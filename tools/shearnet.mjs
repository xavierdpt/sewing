// How much Gaussian curvature does fabric shear absorb for free?
//
//   node tools/shearnet.mjs                     the answer, per locking angle
//   node tools/shearnet.mjs --radius 5          a 10 cm hemisphere is R = 5
//   node tools/shearnet.mjs --cell 0.25         finer net, to check convergence
//
// docs/06-open-questions.md §1 is the question this project says it would
// answer first, and §8 says every other number is downstream of it. Half of it
// needs cloth and a bowl. The other half is geometry, and nobody had computed
// it: §1 asks you to convert the cap a square covers into a free angle defect
// `2π(1 − cos θ)`, but not what defect a given SHEAR ALLOWANCE buys. Without
// that, a measured locking angle cannot be turned into a solver parameter and
// a measured cap cannot be checked against one.
//
// THE MODEL is the pin-jointed net, which is what a woven is to a first
// approximation and what the composites draping literature uses: warp and weft
// are inextensible, every cell is free to shear, and the sheet locks when the
// angle between the two yarn families reaches `gammaMax`. Laid on a sphere
// from a pole with the two families along perpendicular great circles, each
// interior node is then determined -- it is the point at geodesic distance
// `cell` from both of its already-placed neighbours -- so the whole mapping,
// and the shear at every node, follows from the cell size and the radius with
// nothing left to choose.
//
// What comes out is a conversion table: a locking angle in, a free angle
// defect per patch out, in the units §1 predicts in.
import { } from 'node:util';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? +args[args.indexOf(n) + 1] : d);
// A "10 cm hemisphere" in §1's protocol: 10 cm across the dome, so R = 5 cm.
const R = flag('--radius', 5);
const cell = flag('--cell', 0.25);
const patchCm = flag('--patch', 10);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const L = Math.hypot(...a); return [a[0] / L, a[1] / L, a[2] / L]; };

/**
 * The point at angular distance `a` from both A and B, on the far side.
 *
 * Two geodesic circles of equal angular radius on a unit sphere meet in two
 * points, symmetric about the plane of A and B. Writing X = k(A + B) + g(A×B)
 * and imposing X·A = X·B = cos a and |X| = 1 gives k and g in closed form, so
 * there is no iteration here and no tolerance to tune.
 */
function thirdCorner(A, B, a, away) {
  const c = dot(A, B);
  const k = Math.cos(a) / (1 + c);
  const g2 = (1 - 2 * k * k * (1 + c)) / (1 - c * c);
  if (!(g2 > 0)) return null;                 // the circles no longer meet
  const g = Math.sqrt(g2);
  const n = cross(A, B);
  const p = [k * (A[0] + B[0]) + g * n[0], k * (A[1] + B[1]) + g * n[1],
    k * (A[2] + B[2]) + g * n[2]];
  const m = [k * (A[0] + B[0]) - g * n[0], k * (A[1] + B[1]) - g * n[1],
    k * (A[2] + B[2]) - g * n[2]];
  // the root further from the pole is the one the net is growing towards
  return dot(p, away) < dot(m, away) ? norm(p) : norm(m);
}

/** Angle at X between the geodesics to P and to Q. */
function angleAt(X, P, Q) {
  const t = (Y) => norm([Y[0] - X[0] * dot(X, Y), Y[1] - X[1] * dot(X, Y),
    Y[2] - X[2] * dot(X, Y)]);
  const u = t(P), v = t(Q);
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
}

// ---- lay the net on the sphere, from the pole outwards
const a = cell / R;                            // one cell, as an angle
const N = Math.ceil((Math.PI / 2) / a) + 2;    // enough to reach the equator
const pole = [0, 0, 1];
const P = [];                                   // P[i][j]
const shear = [];                               // degrees at each node
for (let i = 0; i <= N; i++) { P.push([]); shear.push([]); }
P[0][0] = pole;
for (let i = 1; i <= N; i++) {
  const t = i * a;
  P[i][0] = [Math.sin(t), 0, Math.cos(t)];      // warp axis, a meridian
  P[0][i] = [0, Math.sin(t), Math.cos(t)];      // weft axis, perpendicular
}
let locked = false;
for (let i = 1; i <= N && !locked; i++) {
  for (let j = 1; j <= N; j++) {
    const A = P[i - 1][j], B = P[i][j - 1];
    if (!A || !B) continue;
    const X = thirdCorner(A, B, a, pole);
    if (!X) { locked = true; break; }
    P[i][j] = X;
    // shear is the departure of the cell's corner angle from a right angle
    shear[i][j] = Math.abs(90 - angleAt(X, A, B) * 180 / Math.PI);
  }
}

/**
 * The cap a net with this locking angle can cover, and the angle defect that
 * represents. `theta` is the cap's half-angle: the largest angular radius
 * inside which no node has yet locked.
 */
function capFor(gammaMax) {
  let worstOk = 0;
  for (let i = 1; i < P.length; i++) {
    for (let j = 1; j < (P[i] || []).length; j++) {
      if (!P[i][j] || shear[i][j] === undefined) continue;
      if (shear[i][j] <= gammaMax) {
        const th = Math.acos(Math.max(-1, Math.min(1, dot(P[i][j], pole))));
        if (th > worstOk) worstOk = th;
      }
    }
  }
  // the first node that exceeds the allowance bounds the cap
  let firstBad = Infinity;
  for (let i = 1; i < P.length; i++) {
    for (let j = 1; j < (P[i] || []).length; j++) {
      if (!P[i][j] || shear[i][j] === undefined) continue;
      if (shear[i][j] > gammaMax) {
        const th = Math.acos(Math.max(-1, Math.min(1, dot(P[i][j], pole))));
        if (th < firstBad) firstBad = th;
      }
    }
  }
  const theta = Math.min(worstOk, Number.isFinite(firstBad) ? firstBad : worstOk);
  const defectSr = 2 * Math.PI * (1 - Math.cos(theta));
  // What the same locking angle means to an EDGE on the bias, which is how
  // this project's solver sees shear. Shear a unit cell by gamma and its two
  // diagonals go to sqrt(1 +/- sin gamma): the 45-degree edge must be free to
  // extend that far or the trellis cannot happen, whatever its compliance
  // says. Against a grain limit of `maxStrain` that ratio IS
  // `biasStrainFactor`, so it stops being a guess.
  const g = gammaMax * Math.PI / 180;
  const biasStrain = Math.sqrt(1 + Math.sin(g)) - 1;
  return {
    'locking angle deg': gammaMax,
    'cap half-angle deg': +(theta * 180 / Math.PI).toFixed(1),
    'defect sr': +defectSr.toFixed(3),
    'defect deg': +(defectSr * 180 / Math.PI).toFixed(1),
    'bias strain %': +(100 * biasStrain).toFixed(1),
    'biasStrainFactor vs 6.1 %': +(biasStrain / 0.061).toFixed(2),
  };
}

console.log(`pin-jointed net on a sphere of R = ${R} cm (a ${2 * R} cm dome),`
  + ` ${cell} cm cells, ${patchCm} cm patch.`);
console.log('The defect column is in the units docs/06-open-questions.md section 1'
  + ' predicts in: felt 5-10, cotton 15, knit 40+.');
console.table([5, 10, 15, 20, 25, 30, 40].map(capFor));
