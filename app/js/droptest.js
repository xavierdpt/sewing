// The drop test: put a flat piece of cloth in the air above the body and let
// go of it.
//
// This is the experiment that cannot be run with a static solver. relax.js and
// drape() both answer "given that the garment is ON the body, what shape does
// it take"; neither can answer "does it stay on the body at all", because both
// start from a placement and one of them pins the shoulders. Here nothing is
// placed and nothing is pinned: the cloth is released horizontally and whether
// it ends up a yoke, a slipped hoop around the waist, or a heap on the floor
// is decided by gravity, contact and friction.
//
// Run it over a range of inner radii and you get the fitting fact the test is
// for: there is a critical hole size, somewhere near the shoulder girth, below
// which the cloth is supported and above which it is not. Nothing tells the
// simulation where that is.

import { Cloth, FABRICS } from './cloth.js';
import { sewFlat } from './patternio.js';
import { annulusPattern, rectanglePattern } from './testpieces.js';

/**
 * Where is the neck, and how high is the body?
 *
 * The cloth has to be centred on the neck AXIS, not on the world origin: a body
 * with `lateralShift` or `rotation` set has its neck somewhere else, and the
 * whole premise of this project is that such bodies are the normal case.
 */
export function neckFrame(surface, { samples = 64 } = {}) {
  const vTop = 0.999;
  let v = vTop;
  try { v = surface.landmarkV ? surface.landmarkV('neck') : vTop; } catch { v = vTop; }
  let cx = 0, cz = 0, cy = 0, girth = 0, prev = null;
  for (let i = 0; i < samples; i++) {
    const p = surface.point(i / samples, v);
    cx += p[0]; cz += p[2]; cy += p[1];
    if (prev) girth += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  if (prev) {
    const p0 = surface.point(0, v);
    girth += Math.hypot(p0[0] - prev[0], p0[1] - prev[1], p0[2] - prev[2]);
  }
  // the top of the body, measured rather than assumed: a neck stub continues
  // above the nape, and the cloth must start clear of it
  let yTop = -Infinity;
  for (let i = 0; i < samples; i++) {
    const p = surface.point(i / samples, 1);
    if (p[1] > yTop) yTop = p[1];
  }
  return {
    center: [cx / samples, cz / samples],
    y: cy / samples,
    girthCm: girth,
    radiusCm: girth / (2 * Math.PI),
    yTop,
  };
}

/** Named heights on the body, for saying WHERE the cloth came to rest. */
function landmarkHeights(surface) {
  const out = {};
  const names = ['neck', 'shoulder', 'chest', 'bust', 'underBust', 'waist', 'highHip', 'lowHip'];
  const H = surface.ringHeights || surface.heights;
  if (!H) return out;
  for (const n of names) if (H[n] !== undefined) out[n] = H[n];
  return out;
}

/**
 * Drop a hollow disc on a body.
 *
 * @param surface  Torso or MeshSurface
 * @param opts.innerR  cm; the number the whole test turns on
 * @param opts.outerR  cm
 * @param opts.edge    cm, target triangle edge
 * @param opts.dropCm  how far above the top of the body to release it
 * @param opts.seconds simulated seconds to run (settles early if it can)
 */
export function dropDisc(surface, {
  innerR = 7.5, outerR = 28, edge = 2.2, dropCm = 4, seconds = 6,
  fabric = 'cotton poplin', cloth: clothOpts = {}, onFrame = null, dt = 1 / 60,
} = {}) {
  const neck = neckFrame(surface);
  const pattern = annulusPattern({ innerR, outerR, edge });
  const asm = sewFlat(pattern, { y: neck.yTop + dropCm, center: neck.center });
  const holeIds = pattern.panels[0].hole.slice();
  const hemIds = pattern.panels[0].loop.slice();

  const sim = new Cloth(asm, surface, { floorY: floorOf(surface), fabric, ...clothOpts });
  const settle = sim.settle({ maxSeconds: seconds, dt, onFrame });

  return {
    pattern, asm, cloth: sim, settle,
    ...dropOutcome(sim, surface, { neck, holeIds, hemIds, pattern }),
  };
}

/**
 * Where the body is standing. A garment that slips off has to land somewhere,
 * and the same floor the viewer draws is the obvious place.
 */
export function floorOf(surface) {
  const legFloor = (surface.heights && surface.heights.knee !== undefined)
    ? surface.heights.knee : Infinity;
  const base = Math.min(surface.yMin !== undefined ? surface.yMin : -24, legFloor);
  return base - 2;
}

/** Same, for the control piece: a plain square with no hole. */
export function dropRectangle(surface, {
  width = 40, height = 40, edge = 2.2, dropCm = 6, seconds = 5,
  fabric = 'cotton poplin', cloth: clothOpts = {}, onFrame = null, dt = 1 / 60,
} = {}) {
  const neck = neckFrame(surface);
  const pattern = rectanglePattern({ width, height, edge });
  const asm = sewFlat(pattern, { y: neck.yTop + dropCm, center: neck.center });
  const sim = new Cloth(asm, surface, { floorY: floorOf(surface), fabric, ...clothOpts });
  const settle = sim.settle({ maxSeconds: seconds, dt, onFrame });
  return {
    pattern, asm, cloth: sim, settle,
    ...dropOutcome(sim, surface, { neck, holeIds: [], hemIds: pattern.panels[0].loop, pattern }),
  };
}

/**
 * Read the outcome off the settled mesh.
 *
 * `restingAt` is the body landmark nearest the height the hole came to rest at,
 * which is the sentence a fitter would say: "it's sitting on the shoulders", or
 * "it's slid to the waist".
 *
 * Exported because the viewer needs the same sentence. A drop watched in the
 * browser and a drop run by `dropDisc` under node are the same experiment, and
 * rule 7 says they must not compute the verdict twice -- the viewer's telemetry
 * calls this on the settled mesh, so `restingAt` and `slipCm` in the log mean
 * exactly what the headless table means by them.
 */
export function dropOutcome(sim, surface, { neck, holeIds, hemIds, pattern }) {
  const V = sim.asm.verts;
  const H = landmarkHeights(surface);
  const mean = (ids, d) => ids.reduce((a, i) => a + V[i][d], 0) / Math.max(1, ids.length);
  const holeY = holeIds.length ? mean(holeIds, 1) : null;
  const hemY = mean(hemIds, 1);
  const ys = V.map((p) => p[1]);
  const bottomY = Math.min(...ys);

  // how far the hole has fallen below the neck ring it was dropped around
  const slipCm = holeY === null ? null : neck.y - holeY;

  let restingAt = null, restErr = Infinity;
  if (holeY !== null) {
    for (const [name, y] of Object.entries(H)) {
      const e = Math.abs(y - holeY);
      if (e < restErr) { restErr = e; restingAt = name; }
    }
  }

  const rep = sim.report();
  // Did it leave the body altogether? The body stops at the crotch, so a piece
  // whose highest vertex is below the lowest landmark is on the floor.
  const lowest = Math.min(...Object.values(H).concat([Infinity]));
  const fellOff = Number.isFinite(lowest) && Math.max(...ys) < lowest;
  if (fellOff) restingAt = 'the floor';

  let verdict;
  if (!sim.healthy()) verdict = 'SOLVER BLEW UP';
  else if (fellOff) verdict = 'slid straight off -- it is on the floor';
  else if (holeY === null) verdict = rep.contactVerts > 0 ? 'draped over the body' : 'not touching the body';
  else if (restingAt === 'neck' || restingAt === 'shoulder') {
    verdict = `caught on the ${restingAt} -- it is a yoke`;
  } else verdict = `slid down to the ${restingAt}`;

  return {
    verdict,
    restingAt,
    holeYcm: holeY === null ? null : +holeY.toFixed(2),
    hemYcm: +hemY.toFixed(2),
    bottomYcm: +bottomY.toFixed(2),
    slipCm: slipCm === null ? null : +slipCm.toFixed(2),
    neckGirthCm: +neck.girthCm.toFixed(2),
    neckRadiusCm: +neck.radiusCm.toFixed(2),
    holeCircumferenceCm: pattern.meta.holeCircumferenceCm ?? null,
    settled: sim.rmsSpeed() < 0.6,
    ...rep,
  };
}

/**
 * Sweep the inner radius and find the critical hole size: the smallest one that
 * no longer catches. Returns one row per radius plus the boundary.
 */
export function slipSweep(surface, {
  radii = [6, 7, 8, 9, 10, 12, 14, 16, 18, 20], outerR = 30, edge = 2.6,
  seconds = 4, fabric = 'cotton poplin', cloth: clothOpts = {}, log = null,
} = {}) {
  const rows = [];
  for (const r of radii) {
    const out = dropDisc(surface, { innerR: r, outerR, edge, seconds, fabric, cloth: clothOpts });
    const row = {
      innerRcm: r,
      holeCircCm: out.holeCircumferenceCm,
      caught: /yoke/.test(out.verdict),
      restingAt: out.restingAt,
      slipCm: out.slipCm,
      maxStretchPct: out.maxStretchPct,
      contactPct: out.contactPct,
      verdict: out.verdict,
    };
    rows.push(row);
    if (log) log(row);
  }
  const lastCaught = [...rows].reverse().find((r) => r.caught);
  const firstSlip = rows.find((r) => !r.caught && rows.indexOf(r) > rows.findIndex((x) => x.caught));
  return {
    rows,
    criticalInnerRcm: lastCaught && firstSlip
      ? +(((lastCaught.innerRcm + firstSlip.innerRcm) / 2)).toFixed(2) : null,
    caughtUpTocm: lastCaught ? lastCaught.innerRcm : null,
    slipsFromcm: firstSlip ? firstSlip.innerRcm : null,
  };
}

export { FABRICS };

/**
 * Where to drop something that is not being dropped ON the body.
 *
 * On the floor beside it, clear of the hips and the legs: the accordion test
 * is about cloth against cloth, and a heap half inside a thigh measures the
 * thigh. Dropped at the origin it landed 7 cm inside the figure, which the
 * clearance columns duly reported as a catastrophe.
 */
export function besideTheBody(surface, widthCm = 20) {
  let maxX = 0;
  for (let i = 0; i < 64; i++) {
    for (const v of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const p = surface.point(i / 64, v);
      if (Math.abs(p[0]) > maxX) maxX = Math.abs(p[0]);
    }
  }
  return [maxX + widthCm * 0.8 + 6, 0];
}

/**
 * The accordion drop: a strip of cloth pleated into a concertina, let go, and
 * caught by the floor.
 *
 * The disc test asks whether cloth stays on a body. This one asks a question
 * the body cannot answer: does the cloth have THICKNESS? A pleated strip that
 * lands in a heap must end up as a stack as tall as the number of layers it
 * has, times what one layer of this cloth occupies -- its own thickness plus
 * the air each fold traps. A solver with no self-collision answers zero: the
 * layers pass through each other and the heap is one layer thick, which is
 * the single most recognisable way simulated cloth looks wrong.
 *
 * Nothing here imposes the answer. The strip is folded, released, and the
 * stack height is measured; what the measurement is compared against is
 * `layers * clothThickness`, which is the solver's own contact distance and
 * not a target the test hands it.
 *
 * The fold is a placement, not a pattern: the strip is cut as one flat
 * rectangle (`rectanglePattern`), exactly as it would be cut in cloth, and
 * then pleated by mapping the cut length onto a zig-zag. So the same piece
 * can be sewn into a garment, printed, or put on the cutting table -- it is
 * an ordinary pattern piece that happens to be folded up before it is
 * dropped.
 *
 * @param pleatCm   the length of cloth in one layer of the concertina
 * @param gapCm     how far apart the layers start, before gravity closes them
 */
export function accordion(pattern, {
  pleatCm = 10, gapCm = 1.2, y0 = 0, center = [0, 0], rowCm = null,
  pleatAngleDeg = 45,
} = {}) {
  const asm = sewFlat(pattern, { y: y0, center });
  const ys = pattern.panels[0].pts.map((q) => q.y);
  const yMin = Math.min(...ys);

  // A FOLD HAS A RADIUS, AND IT COSTS CLOTH.
  //
  // This used to set the height as a step function of the layer -- constant
  // within a layer, jumping by the whole `gapCm` at each crease -- so the two
  // vertex rows straddling a crease sat one row-pitch apart along the strip
  // and a whole gap apart in height. An edge of rest length `ds` was placed
  // at sqrt(ds^2 + gap^2), which at the viewer's edge 1.0 cm and gap 1.2 cm
  // is 56.2 % strain, 19x linen's 3 % yield, BEFORE the solver takes a single
  // step. The strip was released as a loaded spring and threw its own heap
  // open; read as "linen springs back", which linen does not do. It is also
  // why refining the mesh made the test worse rather than better: the height
  // jump is always one edge wide, so the strain grows without bound as the
  // edge shrinks (160 % at edge 0.5).
  //
  // So the crease is now a real semicircle of radius `gapCm / 2` -- the only
  // radius that puts consecutive layers a gap apart -- and the strip pays for
  // it in length. The turn is taken out of `pleatCm` rather than added to it,
  // so `pleatCm` still means the period of the zig-zag and `layers` still
  // comes out as `length / pleatCm`: every existing report stays comparable.
  // The row pitch, measured off the pattern rather than assumed, because the
  // placement has to match the rest lengths the solver will enforce and only
  // the pattern knows what they are.
  const pitch = (() => {
    if (rowCm) return rowCm;
    const uniq = [...new Set(ys.map((v) => +v.toFixed(5)))].sort((a, b) => a - b);
    const d = uniq.slice(1).map((v, i) => v - uniq[i]).sort((a, b) => a - b);
    return d.length ? d[d.length >> 1] : gapCm;
  })();

  // A FOLD CANNOT BE TIGHTER THAN ONE ROW. The fold's diameter IS the spacing
  // between the two layers it joins, so asking for a 1.2 cm gap with 2 cm
  // rows asks for a turn the mesh cannot represent -- and crushing the edge
  // into it is a 40 % compression, which is no better than the 56 % tension
  // this replaced. So the gap opens up to what the mesh can fold, and says
  // so, rather than reporting a stack height for a strip it mangled.
  // THE PLEAT STANDS OPEN. A concertina is not a pressed stack.
  //
  // `pleatAngleDeg` is the angle each flat limb makes with the horizontal, so
  // the crease between two limbs opens by 180 - 2a degrees. At 45 the crease
  // is a right angle and the strip is a zig-zag standing on the floor, which
  // is what a folded length of cloth actually looks like before anyone sits
  // on it. At 0 it reduces exactly to a pressed stack of parallel layers --
  // the previous behaviour -- and that is the trap: with `pleat 10` and `gap
  // 1.2` the implied limb angle was asin(1.2 / 10) = 6.9 degrees, so the
  // layers lay almost flat and every crease had to turn a full 180. The
  // collapse of an open pleat under its own weight is the experiment; a stack
  // that starts pressed has already had it done to it.
  const alpha = Math.max(0, Math.min(85, pleatAngleDeg)) * Math.PI / 180;
  const sinA = Math.sin(alpha), cosA = Math.cos(alpha);
  const turnAngle = Math.PI - 2 * alpha;      // what each crease has to turn

  // A FOLD CANNOT BE TIGHTER THAN ONE ROW -- and how tight that is depends on
  // how far it has to turn. One row spanning a turn of `phi` on a circle of
  // radius r covers a CHORD of 2 r sin(phi/2), not the diameter, so a right-
  // angled crease needs a 1.41x wider gap than a 180-degree one before the
  // mesh can place it without squashing an edge. Clamping against the
  // diameter alone was right only for the pressed stack, and reintroduced a
  // 15 % compression the moment the pleat opened to 45 degrees.
  const gapEff = Math.max(gapCm, pitch / Math.max(1e-6, Math.sin(turnAngle / 2)));
  const r = gapEff / 2;

  // How many rows to spend on the half turn. Points `dTheta` apart on a
  // circle of radius r are 2 r sin(dTheta/2) apart in space, so the choice of
  // n fixes the placed length of a crease edge against its rest length
  // `pitch`; pick whichever n leaves the smaller residual. n = 1 is the
  // degenerate case -- one edge doing the whole 180 degrees -- which is all a
  // mesh coarser than the fold diameter can manage.
  const ideal = turnAngle / (2 * Math.asin(Math.min(1, pitch / (2 * r))));
  const strainAt = (k) => (2 * r * Math.sin(turnAngle / (2 * k))) / pitch - 1;
  const lo = Math.max(1, Math.floor(ideal)), hi = Math.max(1, Math.ceil(ideal));
  const n = Math.abs(strainAt(lo)) <= Math.abs(strainAt(hi)) ? lo : hi;
  const dTheta = turnAngle / n;
  const turnCm = n * pitch;            // strip spent on one crease
  const creaseStrain = strainAt(n);    // what is left over, signed

  if (turnCm >= pleatCm) {
    throw new Error(`a ${pleatCm} cm pleat cannot contain a ${gapCm} cm fold at `
      + `${pitch.toFixed(2)} cm rows: the turn alone needs ${turnCm.toFixed(2)} cm`);
  }
  const flat = pleatCm - turnCm;
  const kappa = dTheta / pitch;        // radians of turn per cm of strip
  // How far a limb carries the strip sideways, and how far one whole pleat
  // lifts it: the limb climbs `flat sin a` and the crease adds `2 r cos a`.
  // At a = 0 that is 2r = the gap, which is the pressed stack again.
  const zSpan = flat * cosA;
  const rise = flat * sinA + 2 * r * cosA;
  const zA = center[1] - zSpan / 2;

  for (let i = 0; i < asm.verts.length; i++) {
    const s = pattern.panels[0].pts[i].y - yMin;      // cm along the strip
    const layer = Math.floor(s / pleatCm);
    const within = s - layer * pleatCm;
    const forward = layer % 2 === 0;
    const sgn = forward ? 1 : -1;
    const yL = y0 + layer * rise;
    if (within <= flat) {
      // a limb, climbing at the pleat angle
      asm.verts[i][2] = forward ? zA + within * cosA : zA + zSpan - within * cosA;
      asm.verts[i][1] = yL + within * sinA;
    } else {
      // the crease: a circular fillet turning the strip back the other way,
      // entered along the limb's own direction so the tangent is continuous
      const tau = alpha + kappa * (within - flat);
      const p1z = forward ? zA + zSpan : zA;
      const p1y = yL + flat * sinA;
      asm.verts[i][2] = (p1z - sgn * r * sinA) + sgn * r * Math.sin(tau);
      asm.verts[i][1] = (p1y + r * cosA) - r * Math.cos(tau);
    }
  }

  // What the fold cost, for whoever is measuring the heap: a stack built on a
  // crease that is still strained is measuring the crease.
  asm.fold = {
    pleatAngleDeg: +(alpha * 180 / Math.PI).toFixed(1),
    creaseOpensDeg: +(turnAngle * 180 / Math.PI).toFixed(1),
    layerRiseCm: +rise.toFixed(3),
    zSpanCm: +zSpan.toFixed(3),
    rowCm: +pitch.toFixed(3),
    gapAskedCm: gapCm,
    gapCm: +gapEff.toFixed(3),
    foldRadiusCm: +r.toFixed(3),
    rowsPerCrease: n,
    turnCm: +turnCm.toFixed(3),
    flatCm: +flat.toFixed(3),
    creaseStrainPct: +(creaseStrain * 100).toFixed(2),
  };
  // A crease that is still strained is a spring, and the heap measured over
  // it is measuring the spring. The residual is zero exactly when the rows
  // divide the turn evenly -- pitch = gap * sin(pi/2n), so edge = gap, gap /
  // sqrt(2), gap / 2, ... -- and `edge = gap / 2` (three rows per crease) is
  // the easy one to hit.
  if (Math.abs(creaseStrain) > 0.03) {
    console.warn(`accordion: the crease is strained ${(creaseStrain * 100).toFixed(1)} %`
      + ` with ${pitch.toFixed(2)} cm rows and a ${gapEff.toFixed(2)} cm gap`
      + ` (${n} row${n === 1 ? '' : 's'} per crease). Use edge = ${(gapEff / 2).toFixed(2)} cm`
      + ' for a crease that costs the cloth nothing.');
  }
  if (gapEff > gapCm + 1e-9) {
    console.warn(`accordion: a ${gapCm} cm gap cannot be folded with ${pitch.toFixed(2)} cm`
      + ` rows; using ${gapEff.toFixed(2)} cm. The stack will start that much taller.`);
  }
  return asm;
}

/**
 * Fold a strip, drop it, and measure the heap.
 *
 * @returns the stack height, the number of layers, and what one layer of this
 *   cloth takes up -- the three numbers the test is about.
 */
export function dropAccordion(surface, {
  widthCm = 20, lengthCm = 60, pleatCm = 10, gapCm = 1.2, edge = 2.0,
  dropCm = 10, seconds = 6, fabric = 'cotton poplin', cloth: clothOpts = {},
  onFrame = null, dt = 1 / 60, center = null, pleatAngleDeg = 45,
} = {}) {
  const floorY = floorOf(surface);
  const pattern = rectanglePattern({ width: widthCm, height: lengthCm, edge });
  const layers = Math.max(1, Math.round(lengthCm / pleatCm));
  const asm = accordion(pattern, {
    pleatCm, gapCm, pleatAngleDeg,
    y0: floorY + dropCm, center: center || besideTheBody(surface, widthCm),
  });
  const sim = new Cloth(asm, surface, {
    floorY, fabric, selfCollision: true, ...clothOpts,
  });
  const settle = sim.settle({ maxSeconds: seconds, dt, onFrame });

  const ys = asm.verts.map((p) => p[1]);
  const topCm = Math.max(...ys);
  const bottomCm = Math.min(...ys);
  const perLayerCm = sim.opts.clothThickness;
  return {
    pattern,
    asm,
    cloth: sim,
    settle,
    layers,
    stackCm: +(topCm - floorY).toFixed(2),
    expectedCm: +(layers * perLayerCm).toFixed(2),
    perLayerCm,
    restingOnFloorCm: +(bottomCm - floorY).toFixed(2),
    // How flat the heap is: a stack that stayed folded covers the pleat's own
    // footprint, one that collapsed sideways covers more.
    footprintCm: +(Math.max(...asm.verts.map((p) => p[2]))
      - Math.min(...asm.verts.map((p) => p[2]))).toFixed(1),
    settled: !!settle.settled,
    seconds: +sim.time.toFixed(2),
  };
}
