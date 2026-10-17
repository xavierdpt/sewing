// The bending stencils: which quadruples of vertices form a hinge, and how
// compliant each one is.
//
// Lifted out of cloth.js unchanged, because it is not solver code -- it is a
// property of the MESH, read off the assembly's own topology and the side
// lengths the pieces were cut to. Two solvers need it now: cloth.js, which has
// always had it, and the wasm sewing (app/js/sewwasm.js), which hands the same
// quadruples and the same compliance to `sc_set_hinges`. Deriving them twice
// would be two chances to disagree about what a hinge is.
//
// This is also one of the pieces docs/19-todo.md item 1 step 6 moves out of
// cloth.js before that file is deleted; it moved early because the port needed
// it.

/**
 * Bending, as the HINGE ANGLE across each interior edge, with the gradients
 * of Bridson et al. 2003 / Grinspun's discrete shells.
 *
 * Three models were measured and two thrown away, and the instrument that
 * caught each is in the repo:
 *
 *   1. a spring between the two vertices opposite the shared edge, rest
 *   length from the flat pattern. The cantilever (tools/fabric.mjs) gave
 *   every preset AND a compliance of zero the same 0.76 cm of bending
 *   length -- limper than any real cloth. A cross-spring's gradient is
 *   nearly parallel to the stretch constraints it shares vertices with, and
 *   stretch is four orders stiffer and solved first, so it simply undid the
 *   correction. Cloth with no bending stiffness creases at the mesh scale
 *   instead of folding at a wavelength its stiffness sets, which is what
 *   "it looks like paper" is.
 *
 *   2. the quadratic (isometric) bending model, Bergou et al. 2006: a fixed
 *   stencil of four cotangent weights whose sum against the positions
 *   vanishes on a flat patch. It is linear, it is stable, it calibrated
 *   beautifully against the cantilever -- and it is only valid for SMALL
 *   deflections, because being linear in the positions it is not invariant
 *   to rotation. A fold large enough to rotate a triangle is scored as if
 *   it were a stretch, so a stiff cloth stops behaving like cloth: a dropped
 *   denim disc landed like a thin metal plate and bounced back off its rim,
 *   storing energy in folds that should have cost nothing to hold.
 *
 *   3. this one. The constraint is the angle between the two faces and
 *   nothing else, so rotating the pair rigidly costs exactly zero however
 *   far it is folded. The angle is taken with atan2 and the gradients are
 *   the normals over the triangle heights, which is what makes it usable
 *   where the naive dihedral form is not: the 1/sin(angle) that blows up at
 *   the flat rest state never appears.
 *
 * Energy is (B |e|^2 / A) (theta - theta0)^2 with B the fabric's flexural
 * rigidity, |e| the shared edge and A the area of the two triangles, so the
 * compliance per edge is A / (B |e|^2) and the stiffness is
 * resolution-independent. theta0 is zero: the pattern is flat.
 */
export function bendingStencils(asm) {
  const out = [];
  for (const e of asm.edges.values()) {
    if (e.tiles.length !== 2 || !(e.target > 1e-9)) continue;
    const apexOf = (ti) => {
      const t = asm.tiles[ti];
      const m = t.v.findIndex((x) => x !== e.a && x !== e.b);
      if (m < 0) return null;
      const ia = t.v.indexOf(e.a), ib = t.v.indexOf(e.b);
      if (ia < 0 || ib < 0) return null;
      // side i is opposite vertex i, so the two sides meeting at the apex
      // are the ones opposite the shared edge's two ends
      return { v: t.v[m], toA: t.sides[ib], toB: t.sides[ia] };
    };
    const A = apexOf(e.tiles[0]), B = apexOf(e.tiles[1]);
    if (!A || !B || A.v === B.v) continue;
    // Areas from the CUT side lengths, not from where the mesh is standing:
    // the compliance is a property of the cloth, not of its current pose.
    const heron = (x, y, z) => {
      const p = (x + y + z) / 2;
      return Math.sqrt(Math.max(0, p * (p - x) * (p - y) * (p - z)));
    };
    const L = e.target;
    const area = heron(L, A.toA, A.toB) + heron(L, B.toA, B.toB);
    if (!(area > 1e-9)) continue;
    out.push({ v: [A.v, B.v, e.a, e.b], len: L, area });
  }
  return out;
}

/**
 * The one number relating the model's stiffness to the fabric's. In theory
 * it is 1 -- the energy IS (B|e|^2/A) theta^2 -- and in practice the solver
 * reaches a fraction of the stiffness it is asked for, because the bending
 * pass gets a fixed number of sweeps and shares its vertices with
 * constraints four orders stiffer. Fixed by measurement: `tools/fabric.mjs
 * --scan` asks for a bending length and reads one back, and this is the
 * value that makes those two the same number. See docs/11-cloth.md.
 */
export const BEND_SCALE = 30.0;
