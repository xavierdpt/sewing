// Fabric physics: XPBD cloth, with mass, time, friction and self-collision.
//
// This is the first module in the project that is a SIMULATION rather than a
// static solver. The distinction matters:
//
//   relax.js            constraint projection with an attraction term pulling
//                       the shell onto the body. Deterministic, quasi-static,
//                       no time. Answers "what shape does the body impose?"
//   patternio.drape()   the same projection with the attraction removed and
//                       the shoulders pinned. Answers "does this pattern fit?"
//   cloth.js (here)     real time integration. Mass from areal density,
//                       gravity as an acceleration, velocity carried between
//                       steps, Coulomb friction at contact, vertex-vertex
//                       self-collision. Answers "where does the cloth GO?"
//
// You need the third one as soon as nothing is pinned. A hollow disc dropped
// over a neck is held up by nothing but friction and the shape of the shoulder:
// if the hole is a little bigger than the neck it catches and becomes a collar,
// and if the hole is much bigger there is nothing to catch on and the whole
// thing slides down the body. Neither outcome can be produced by a solver whose
// gravity is a positional nudge -- the nudge has no momentum to carry the cloth
// past the shoulder, and without friction the cloth would always slide.
//
// XPBD (Macklin et al. 2016), as in docs/07-sources.md:
//   - substep rather than iterate: one Gauss-Seidel sweep per substep, many
//     substeps per frame. Converges far better than many sweeps per step and
//     makes stiffness independent of the step count.
//   - compliance alpha~ = alpha/h^2 makes a constraint's stiffness a physical
//     number instead of a per-iteration fudge factor.
//
// The mesh is an Assembly (assembly.js) and the solver writes straight into
// `asm.verts`, so everything already built on top of an Assembly keeps working:
// edge strains, the OBJ export, the viewer's colour modes. That is also what
// makes this ready for the multi-piece case -- `sew()` already welds several
// pattern panels into one Assembly with seams as ordinary interior edges, so a
// joined garment is simulated by exactly the code below with no changes.

import { sub, add, mul, dot, cross, norm, len, dist, clamp } from './geom.js';
import { SDF } from './sdf.js';

/** cm/s^2. Everything in this project is centimetres, so gravity is 981. */
export const G = 981;

/**
 * Fabric presets. `gsm` is grams per square metre, which is how fabric is
 * actually sold, so these are real numbers rather than solver units.
 *
 * `stretch` and `bend` are XPBD compliances (inverse stiffness): 0 is
 * inextensible, larger is slacker. A woven is nearly inextensible along the
 * grain and bends easily; a knit stretches; an interfaced or coated cloth
 * resists bending, which is what makes a collar stand up instead of flopping.
 *
 * `damp` is the internal viscosity -- see `internalDamping` below -- and it is
 * as much a property of a cloth as its stiffness. A crepe or a heavy twill
 * deadens motion; a silk habotai keeps fluttering after it lands, and does so
 * in the simulation too.
 *
 * `maxStrain` is how far the cloth yields before it would rather tear: two per
 * cent for denim, four for poplin, twenty-five for a jersey. Those numbers are
 * what decide whether a hole can be forced over a shoulder.
 */
export const FABRICS = {
  //                        gsm  stretch   bend    mu   damp  maxStrain
  'cotton poplin':   { gsm: 120, stretch: 2e-7, bend: 4e-3, friction: 0.40, damp: 0.75, maxStrain: 0.04 },
  'linen':           { gsm: 190, stretch: 3e-7, bend: 3e-3, friction: 0.45, damp: 0.80, maxStrain: 0.03 },
  'wool crepe':      { gsm: 220, stretch: 8e-7, bend: 1.2e-2, friction: 0.35, damp: 0.85, maxStrain: 0.06 },
  'silk habotai':    { gsm:  60, stretch: 5e-7, bend: 3e-2, friction: 0.22, damp: 0.55, maxStrain: 0.04 },
  'cotton jersey':   { gsm: 180, stretch: 2e-5, bend: 2e-2, friction: 0.50, damp: 0.75, maxStrain: 0.25 },
  'denim':           { gsm: 340, stretch: 1e-7, bend: 4e-4, friction: 0.55, damp: 0.90, maxStrain: 0.02 },
  'interfaced twill':{ gsm: 260, stretch: 1e-7, bend: 1e-4, friction: 0.50, damp: 0.90, maxStrain: 0.02 },
};

export const DEFAULTS = {
  fabric: 'cotton poplin',
  gsm: null,              // overrides the preset's areal density
  stretch: null,          // overrides the preset's stretch compliance
  bend: null,             // overrides the preset's bend compliance
  friction: null,         // overrides the preset's friction coefficient
  // Internal damping: the fraction of the RELATIVE velocity along each seam
  // and across each fold that is dissipated per substep. Overrides the
  // preset's `damp`.
  //
  // This is the difference between cloth and a trampoline, and leaving it out
  // was the most visible error in the first version of this file. Global
  // velocity damping (`damping`, below) removes bulk motion -- it slows the
  // whole sheet down -- but it does nothing to the RELATIVE motion of
  // neighbouring vertices, which is exactly where a stiff spring network
  // stores an impact and then gives it back. Measured on a disc dropped 4 cm:
  // undamped, the centre of mass rebounded 0.3 cm and individual vertices
  // reached 225 cm/s, twice the 108 cm/s impact speed. Real fabric is strongly
  // viscoelastic -- yarn friction at every crossing, and hysteresis in every
  // fold -- and does not do that.
  internalDamping: null,
  // Air drag, expressed as the terminal speed of 120 gsm cloth falling flat.
  //
  // This is not a numerical fudge and it is not optional: it is most of why
  // fabric does not bounce. Drag acts on AREA and inertia lives in MASS, so a
  // light cloth is slowed far more than a heavy one -- which is the whole
  // difference between a dropped handkerchief and a dropped pair of jeans. For
  // quadratic drag the terminal speed goes as the square root of areal
  // density, so the same disc in denim (340 gsm) falls 1.7 times faster than
  // in habotai (60 gsm), with no extra parameters.
  //
  // Quadratic rather than linear, because that is the regime cloth falls in,
  // and because it is the part that matters here: linear drag calibrated to
  // the same terminal speed barely touches a transient, and the transient is
  // exactly what reads as bouncing. Measured on a disc dropped 4 cm, the hem
  // whips to 2.6 times the impact speed with no drag and 2.5 with linear drag;
  // quadratic drag decelerates it at 3 g on the way.
  terminalCmPerSec: 150,
  // The linear half of the drag, as a rate in 1/s for 120 gsm cloth, scaled
  // inversely with areal density.
  //
  // Quadratic drag goes to zero with the square of the speed, so on its own it
  // says nothing about slow motion: a disc hung from its hole in still air
  // swings for ever, which it does not do in a room. Real drag is the sum of a
  // linear (viscous) and a quadratic (inertial) term, and the linear one is
  // what sets how long a gentle sway lasts: a third of a second here for a
  // poplin, which is about what a hanging cloth does in still air. Measured on
  // the free-hang control, raising it from 1 to 3 takes the residual motion
  // after three seconds from 0.40 cm/s to 0.02.
  linearDragPerSec: 3.0,
  substeps: 10,           // per step(); XPBD wants many substeps, one sweep each
  // Sweeps of the seams and the contact, together, per substep.
  //
  // XPBD needs only one for stiffness. It needs more than one whenever the
  // cloth is inextensible AND in hard contact, because then two nearly rigid
  // constraint sets have to agree and Gauss-Seidel passes information between
  // them one sweep at a time. Two measurements set this number:
  //
  //   a disc caught on a neck is a closed ring under tension, which propagates
  //   its error around the ring at one edge per sweep: with one sweep the hoop
  //   lags a substep behind and reads 10 % over-stretched.
  //
  //   a 78 cm waist seam dragged over 98 cm hips -- which it cannot pass
  //   without 25 % of stretch -- slid clean off the body at three sweeps,
  //   digging 2.6 cm into the figure, because the seams won the argument and
  //   the contact lost it. At eight sweeps the two agree and the skirt wedges
  //   on the hips, which is what it does.
  stretchSweeps: 8,
  // Velocity retained per substep, on top of the drag and the internal
  // damping above. This is pure numerical insurance and should stay close to
  // 1: the dissipation that belongs in the model is in the two terms above.
  damping: 0.999,
  // Strain limit, overriding the fabric preset's own. This is not a safety
  // valve, it is a material property, and
  // it decides the whole experiment: a woven cotton gives a few per cent on
  // the grain and no more. Left at 25% -- a plausible-looking "sanity" number
  // -- a 47 cm hole dropped from 6 cm punches straight over a 58 cm shoulder
  // girth, stretching 23%, and then sits there jammed and buzzing because the
  // limit and the body are asking for incompatible things. At 8% it cannot,
  // so it stops where the girth matches, which is what cloth does.
  maxStrain: null,
  collisionMargin: 0.10,  // cm; half the cloth's thickness, held off the body
  // How far a vertex may be pushed out of the body in one substep.
  //
  // This is the single most delicate number in the file. A positional push is
  // a velocity: at h = 1.7 ms, moving a vertex 0.25 cm is 150 cm/s. The pushed
  // vertex itself is fine -- its normal velocity is cancelled below -- but its
  // neighbours inherit the kick through the stretch constraints, and nothing
  // cancels theirs. Measured: 0.25 cm/substep leaves the drape buzzing at 17
  // cm/s forever; 0.05 cm/substep settles. A vertex deeper in than that takes
  // several substeps to come out, which is the correct behaviour anyway.
  maxPushPerSubstepCm: 0.05,
  // Fraction of the remaining penetration corrected per projection. Correcting
  // all of it sounds better and is worse: the seams are nearly inextensible, so
  // a vertex pinched between the cloth and a shoulder is shoved out by the
  // contact and pulled back by the seams at full strength every substep, and
  // the two never agree -- a 30 cm/s limit cycle with no net motion, which is
  // what a drape that will not stop shimmering looks like. Under-relaxing makes
  // the correction proportional to the residual, so the fight converges.
  contactRelax: 0.35,
  // Extra velocity damping for vertices in contact. A concave crease -- and the
  // neck/shoulder junction is one -- gives a vertex two surfaces to be pushed
  // out of, and projecting them one at a time alternates between them: a small
  // local limit cycle that never dies. Cloth against skin dissipates heavily
  // anyway (friction, hysteresis, air trapped between layers), so damping what
  // is already resting is both honest and effective. It does not touch the
  // free-hanging folds, which is where the drape's character lives.
  contactDamping: 0.5,
  selfCollision: true,
  clothThickness: 0.4,    // cm, vertex-vertex separation enforced
  maxVelocity: 400,       // cm/s, a sanity clamp that keeps a blow-up local
  // Height of the floor, or null for none. A garment whose hole is too big to
  // catch on anything does not hover: it slides off and lands in a heap, and
  // without somewhere to land it falls for ever and the test reports a hole
  // resting "at the low hip", six metres underground.
  floorY: null,
  // Scales gravity. Set to 0 to close a garment's seams quasi-statically
  // before letting it fall -- see assemble.js. A garment that is stitched
  // together while it is also falling fills up with strain it can never work
  // back out: measured, 13.6 % peak against 2.8 % for the same garment closed
  // first and dropped second.
  gravityScale: 1,
  // Pairs of vertices to be drawn together: a seam before it is sewn. Each is
  // { a, b }, optionally with `seam`, `pa`, `pb` (which seam and which pieces),
  // and `active` (false = basting thread not yet put in). `stitchStrength`
  // (0..1, on the instance) ramps the pull.
  stitches: null,
  // How much slacker a stitch is than the cloth it is sewing, as a multiple of
  // the fabric's own stretch compliance.
  //
  // This is the number that decides whether a seam can lie about the body.
  // Before it existed the stitch was an infinitely stiff projection to the
  // midpoint, competing with stretch constraints that are themselves nearly
  // rigid, and which of the two won was settled by Gauss-Seidel sweep ORDER
  // rather than by physics -- so a seam that could not be closed was closed
  // anyway and the fabric took the difference.
  //
  // Softer than the cloth, and the argument comes out the other way: the seam
  // yields first, which is what a seam does. A thread is not stiffer than a
  // woven ground; it is a single yarn against a fabric's worth of them.
  stitchSoftness: 60,
  // An absolute stitch compliance, overriding `stitchSoftness`.
  stitchCompliance: null,
  // What a stitch can pull with before it stops pulling harder, in gram-force.
  //
  // The whole point of the exercise. Past this the constraint SATURATES: the
  // seam stays open, and how far it fell short is the measurement. Without a
  // limit the only outcomes available to an impossible seam are to stretch the
  // cloth past `maxStrain` or to drag the figure through the fabric, and both
  // of those destroy the one number a fitting wants.
  //
  // 250 gf is a reasonable hand-basted seam: ordinary polyester thread breaks
  // somewhere over 1 kgf, but a basting stitch pulls out of the cloth long
  // before the thread parts, and it is the cloth that governs.
  maxTensionGf: 250,
  // Strain limiting is iterated to CONVERGENCE, not run a fixed number of
  // times: up to `strainPasses` sweeps, stopping as soon as no edge is over
  // its limit by more than `strainTol`.
  //
  // A fixed count is enough for a sheet and nowhere near enough for a closed
  // loop. A skirt's waist is a ring of sixty-odd edges, and a ring enforces its
  // length GLOBALLY -- Gauss-Seidel moves that information one edge per sweep,
  // so a few sweeps never tell the ring that it is too short to be where it is.
  // Measured, on a 78 cm waist seam being dragged over 98 cm hips, which it
  // cannot pass without 25 % of stretch: at eight sweeps it stretched to 89 cm
  // and slid off the body, and raising the count to sixty-four only slowed it
  // down. Iterating until the residual is gone is the fix; it costs nothing in
  // the ordinary case, because the ordinary case converges in one sweep.
  strainPasses: 200,
  strainTol: 0.002,
};

// --------------------------------------------------------------- the collider

/**
 * Wraps a Torso/MeshSurface for use in a time-stepped loop.
 *
 * It is a thin wrapper on a signed distance field, plus the limb capsules.
 */
export class BodyCollider {
  /**
   * The body, as something a time-stepped solver can collide with.
   *
   * All the geometry is in the level set (sdf.js); what is left here is the
   * garment-specific part -- the limbs, which are capsules rather than part of
   * the torso's surface, and the broad phase, which is one field lookup.
   *
   * The field is cached on the surface, because building it costs about three
   * quarters of a second and the body only changes when a measurement does.
   */
  constructor(surface, { cell = 0.6, band = 2.0, nu = 128, nv = 96 } = {}) {
    this.surface = surface;
    const key = `__sdf_${cell}_${band}`;
    if (!surface[key]) {
      Object.defineProperty(surface, key, {
        value: SDF.fromSurface(surface, { cell, band, nu, nv }),
        writable: true, configurable: true, enumerable: false,
      });
    }
    this.sdf = surface[key];
    this._limbs();
  }

  /** Discard the cached field; call after the body's measurements change. */
  static invalidate(surface) {
    for (const k of Object.getOwnPropertyNames(surface)) {
      if (k.startsWith('__sdf_')) delete surface[k];
    }
  }

  /** Arms and legs are capsules, not part of the torso's surface. */
  _limbs() {
    const s = this.surface;
    this.hasLimbs = !!((s.includeArms && s.closestArm) || (s.includeLegs && s.closestLeg));
  }

  /** Could a point at p be in contact at all? One field lookup. */
  near(p, skin) {
    const d = this.sdf.at(p);
    return Number.isFinite(d) ? d < skin : this.hasLimbs;
  }

  /**
   * Contact query: { point, normal, signed, depth } for a vertex inside the
   * body or within `margin` of it, else null.
   *
   * The normal is the gradient of the field, which is continuous -- that is
   * the whole reason for the level set. A contact normal that jumps as a
   * vertex creeps along the body makes the solver cancel the wrong component
   * of velocity at every substep, and gravity refills the rest: the drape then
   * buzzes forever instead of settling, which is what every earlier version of
   * this collider did.
   */
  query(p, margin) {
    const d = this.sdf.at(p);
    if (!Number.isFinite(d)) return this._limbQuery(p, margin, null);
    if (d >= margin) return this._limbQuery(p, margin, null);
    const n = this.sdf.gradient(p);
    return this._limbQuery(p, margin, {
      point: [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d],
      normal: n,
      signed: d - margin,
      depth: margin - d,
    });
  }

  /** The deeper of body and limb wins: a garment passes through neither. */
  _limbQuery(p, margin, body) {
    if (!this.hasLimbs) return body;
    const s = this.surface;
    let best = body;
    for (const [on, fn] of [[s.includeArms, s.closestArm], [s.includeLegs, s.closestLeg]]) {
      if (!on || !fn) continue;
      const c = fn.call(s, p);
      if (!c) continue;
      const depth = margin - c.signed;
      if (depth > 0 && (!best || depth > best.depth)) {
        best = { point: c.point, normal: c.normal, signed: -depth, depth };
      }
    }
    return best;
  }
}

// ------------------------------------------------------------- constraints

/**
 * Rest length of the cross-edge of two triangles sharing an edge, measured on
 * the FLAT PATTERN rather than in the mesh's current position.
 *
 * Bending is modelled as a spring between the two vertices opposite a shared
 * edge. The cheap version takes its rest length from wherever the mesh happens
 * to be when the simulation starts, which bakes in whatever curvature the
 * initial placement had -- a garment offered up to a body would then treat the
 * body's curvature as its relaxed state and refuse to lie flat. Unfolding the
 * two triangles from their cut side lengths instead gives the rest length the
 * cloth actually has, independent of where it is standing.
 */
function flatCrossLength(asm, e) {
  if (e.tiles.length !== 2) return null;
  const L = e.target;
  if (!(L > 1e-9)) return null;
  const arm = (ti) => {
    const t = asm.tiles[ti];
    const m = t.v.findIndex((x) => x !== e.a && x !== e.b);
    if (m < 0) return null;
    const c = t.v[m];
    const p = (m + 1) % 3, q = (m + 2) % 3;
    // side s_q is opposite vertex q, i.e. it spans (v_p, v_m) -> |c - v_p|
    const rP = t.sides[q], rQ = t.sides[p];
    const ra = t.v[p] === e.a ? rP : rQ;     // |c - e.a|
    const rb = t.v[p] === e.a ? rQ : rP;     // |c - e.b|
    const x = (ra * ra - rb * rb + L * L) / (2 * L);
    const h2 = ra * ra - x * x;
    if (!(h2 > 0)) return null;
    return { c, x, h: Math.sqrt(h2) };
  };
  const A = arm(e.tiles[0]), B = arm(e.tiles[1]);
  if (!A || !B) return null;
  // unfolded: A's apex at (x, +h), B's apex at (x, -h)
  const dx = A.x - B.x, dy = A.h + B.h;
  return { a: A.c, b: B.c, rest: Math.hypot(dx, dy) };
}

// ------------------------------------------------------------------ the sim

export class Cloth {
  /**
   * @param asm      Assembly whose `verts` the solver integrates in place
   * @param surface  Torso or MeshSurface, or null for free fall
   */
  constructor(asm, surface, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const preset = FABRICS[o.fabric] || FABRICS['cotton poplin'];
    this.opts = o;
    this.gsm = o.gsm ?? preset.gsm;
    this.alphaStretch = o.stretch ?? preset.stretch;
    this.alphaBend = o.bend ?? preset.bend;
    this.mu = o.friction ?? preset.friction;
    this.kd = o.internalDamping ?? preset.damp ?? 0.35;
    // terminal speed scales as sqrt(areal density) under quadratic drag
    this.vTerm = o.terminalCmPerSec > 0
      ? o.terminalCmPerSec * Math.sqrt(this.gsm / 120) : 0;
    this.dragK = this.vTerm > 0 ? G / (this.vTerm * this.vTerm) : 0;
    this.dragLin = o.linearDragPerSec * (120 / this.gsm);
    this.maxStrain = o.maxStrain ?? preset.maxStrain ?? 0.08;
    this.asm = asm;
    this.surface = surface;
    this.collider = surface ? new BodyCollider(surface) : null;
    this.time = 0;
    this.steps = 0;

    const N = asm.verts.length;
    this.prev = asm.verts.map((p) => [p[0], p[1], p[2]]);
    this.vel = asm.verts.map(() => [0, 0, 0]);
    this.contact = new Array(N).fill(false);
    this.contactN = asm.verts.map(() => [0, 0, 0]);
    this.contactQ = asm.verts.map(() => [0, 0, 0]);
    // Broad phase results, refreshed once per step() rather than per substep.
    // Within one frame a vertex cannot travel further than maxVelocity * dt, so
    // a skin that wide makes the cached list conservative.
    this.nearBody = new Array(N).fill(true);
    this.pairs = [];

    // ---- mass from areal density. A vertex carries a third of each triangle
    // it belongs to, which is the standard lumped-mass assembly and makes the
    // total exactly the cloth's real weight.
    const gPerCm2 = this.gsm / 10000;
    this.mass = new Array(N).fill(0);
    for (const t of asm.tiles) {
      const [sa, sb, sc] = t.sides;
      const s = (sa + sb + sc) / 2;
      const area = Math.sqrt(Math.max(0, s * (s - sa) * (s - sb) * (s - sc)));
      for (const vi of t.v) this.mass[vi] += area * gPerCm2 / 3;
    }
    this.areaCm2 = this.mass.reduce((a, b) => a + b, 0) / gPerCm2;
    this.weightG = this.areaCm2 * gPerCm2;
    this.invMass = this.mass.map((m, i) =>
      (asm.pinned[i] || m <= 0) ? 0 : 1 / m);

    // ---- constraints
    this.stretch = [...asm.edges.values()]
      .filter((e) => e.target > 1e-9)
      .map((e) => ({ a: e.a, b: e.b, rest: e.target }));
    this.bend = [];
    for (const e of asm.edges.values()) {
      const c = flatCrossLength(asm, e);
      if (c && c.rest > 1e-9) this.bend.push(c);
    }
    // ---- the stitches: a seam before it is sewn.
    //
    // Softer than the cloth by `stitchSoftness`, and force-limited by
    // `maxTensionGf`, so a seam that cannot be closed stays open and says by
    // how much instead of taking the difference out of the fabric.
    this.stitches = (o.stitches || []).map((s) => ({
      ...s,
      active: s.active !== false,
      lambda: 0,          // the XPBD multiplier, accumulated over one substep
      tensionGf: 0,       // |lambda| / h^2, in gram-force
      peakGf: 0,          // the most it has ever pulled with
      saturated: false,   // pulling as hard as it is allowed to, and still open
    }));
    this.alphaStitch = o.stitchCompliance ?? this.alphaStretch * o.stitchSoftness;
    this.maxTensionGf = o.maxTensionGf;
    this.stitchStrength = this.stitches.length ? 0.05 : 0;

    // ---- self-collision hash
    const h = o.clothThickness;
    this.cell = Math.max(h * 2, this._meanEdge() * 1.1);
    this.hash = new Map();
  }

  _meanEdge() {
    if (!this.stretch.length) return 1;
    return this.stretch.reduce((a, c) => a + c.rest, 0) / this.stretch.length;
  }

  /**
   * Move a set of pinned vertices from where they are to where they belong,
   * over `seconds`. This is a waistband being pinned on, or a garment being
   * eased onto a form: the cloth starts in the shape it was cut and is drawn
   * onto the body, instead of being teleported there.
   *
   * Teleporting a pinned vertex is not a shortcut, it is an arbitrarily large
   * velocity imposed on its neighbours, which is the same mistake as pushing a
   * contact out too fast.
   */
  pinRamp(ramp) {
    this._ramp = ramp;
    return this;
  }

  _applyRamp() {
    const r = this._ramp;
    if (!r) return;
    const s = Math.min(1, this.time / r.seconds);
    const e = s * s * (3 - 2 * s);                 // smooth, so it starts and stops gently
    for (let k = 0; k < r.ids.length; k++) {
      const i = r.ids[k], a = r.from[k], b = r.to[k], p = this.asm.verts[i];
      p[0] = a[0] + (b[0] - a[0]) * e;
      p[1] = a[1] + (b[1] - a[1]) * e;
      p[2] = a[2] + (b[2] - a[2]) * e;
    }
    if (s >= 1) this._ramp = null;
  }

  /** Pin every vertex within `cm` of the top of the mesh (a hanger, a clamp). */
  pinTop(cm = 1.0) {
    const yMax = Math.max(...this.asm.verts.map((p) => p[1]));
    this.asm.verts.forEach((p, i) => {
      if (p[1] > yMax - cm) { this.asm.pinned[i] = true; this.invMass[i] = 0; }
    });
    return this;
  }

  /**
   * Advance by dt seconds. 1/60 with the default 10 substeps is stable.
   *
   * Collision DETECTION happens once here, per frame; collision RESPONSE
   * happens every substep against the cached candidates. That is the standard
   * split, and it is what makes the cost bearable: rebuilding a spatial hash
   * ten times per frame cost more than the entire rest of the solver.
   */
  step(dt = 1 / 60) {
    const o = this.opts;
    const n = Math.max(1, o.substeps | 0);
    const h = dt / n;
    // How far can anything travel this frame? Taking the worst case (the
    // velocity clamp, 400 cm/s) would mean a 6.7 cm search radius, which at
    // rest finds tens of thousands of candidate pairs that are all slack --
    // that one line cost more than the whole solver. The actual fastest vertex
    // is the honest bound.
    this._applyRamp();
    const reach = this.maxSpeed() * dt + 0.1;
    if (this.collider) {
      for (let i = 0; i < this.asm.verts.length; i++) {
        this.nearBody[i] = this.invMass[i] !== 0
          && this.collider.near(this.asm.verts[i], o.collisionMargin + reach);
      }
    }
    if (o.selfCollision) this._findPairs(o.clothThickness + reach);
    for (let s = 0; s < n; s++) this._substep(h);
    this.time += dt;
    this.steps++;
    return this;
  }

  /** Run for `seconds` of simulated time. */
  run(seconds = 1.0, dt = 1 / 60, onFrame = null) {
    const frames = Math.max(1, Math.round(seconds / dt));
    for (let f = 0; f < frames; f++) {
      this.step(dt);
      if (onFrame) onFrame(f, this);
    }
    return this;
  }

  _substep(h) {
    const V = this.asm.verts;
    const W = this.invMass;
    const N = V.length;
    const o = this.opts;

    // ---- 1. predict. Gravity is an acceleration on a real mass, so a heavy
    // denim and a light habotai fall the same way but strain their seams
    // differently -- the weight shows up in the constraint residuals, which is
    // exactly where fabric weight shows up in a real garment.
    for (let i = 0; i < N; i++) {
      if (!W[i]) { this.prev[i][0] = V[i][0]; this.prev[i][1] = V[i][1]; this.prev[i][2] = V[i][2]; continue; }
      const v = this.vel[i];
      v[1] -= G * o.gravityScale * h;
      if (this.dragK > 0 || this.dragLin > 0) {
        // implicit, so a fast vertex can never be reversed by its own drag
        const sp0 = Math.hypot(v[0], v[1], v[2]);
        const f = 1 / (1 + (this.dragLin + this.dragK * sp0) * h);
        v[0] *= f; v[1] *= f; v[2] *= f;
      }
      const sp = len(v);
      if (sp > o.maxVelocity) { const k = o.maxVelocity / sp; v[0] *= k; v[1] *= k; v[2] *= k; }
      const p = this.prev[i];
      p[0] = V[i][0]; p[1] = V[i][1]; p[2] = V[i][2];
      V[i][0] += v[0] * h; V[i][1] += v[1] * h; V[i][2] += v[2] * h;
    }

    // ---- 2. find the contacts, ONCE, and cache the contact plane of each.
    //
    // Querying the body is the expensive part of a substep, and projecting
    // against a cached plane is nearly free, so the contact can then be solved
    // in the same Gauss-Seidel sweep as the seams. That matters more than the
    // speed: with the contact applied after the sweeps, every substep resolves
    // a penetration that the seams then undo, and the seams' answer only
    // arrives a substep later. That one-substep lag is an oscillator, and it is
    // what was leaving this drape buzzing at 17 cm/s with nothing visibly
    // wrong. Solved together, they agree within the substep.
    const margin = o.collisionMargin;
    const maxPush = o.maxPushPerSubstepCm;
    if (this.collider) {
      for (let i = 0; i < N; i++) {
        this.contact[i] = false;
        if (!W[i] || !this.nearBody[i]) continue;
        const c = this.collider.query(V[i], margin);
        if (!c) continue;
        this.contact[i] = true;
        this.contactQ[i][0] = c.point[0];
        this.contactQ[i][1] = c.point[1];
        this.contactQ[i][2] = c.point[2];
        this.contactN[i][0] = c.normal[0];
        this.contactN[i][1] = c.normal[1];
        this.contactN[i][2] = c.normal[2];
      }
    }

    // ---- 3. seams and contact, swept together. XPBD takes its stiffness from
    // the compliance rather than from the sweep count, but a closed ring of
    // edges under tension -- the hole of a disc caught on a neck is exactly
    // that -- propagates its error around the ring at one edge per sweep, so a
    // single sweep leaves the hoop a substep behind everything else.
    const h2 = h * h;
    const aS = this.alphaStretch / h2;
    for (let sweep = 0; sweep < o.stretchSweeps; sweep++) {
      for (let k = 0; k < this.stretch.length; k++) {
        const c = this.stretch[k];
        const a = V[c.a], b = V[c.b];
        const wa = W[c.a], wb = W[c.b];
        const wsum = wa + wb;
        if (wsum <= 0) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const L = Math.hypot(dx, dy, dz);
        if (L < 1e-12) continue;
        const dl = -(L - c.rest) / (wsum + aS);
        const s = dl / L;
        a[0] -= dx * s * wa; a[1] -= dy * s * wa; a[2] -= dz * s * wa;
        b[0] += dx * s * wb; b[1] += dy * s * wb; b[2] += dz * s * wb;
      }
      this._projectContacts(margin, maxPush, h);
      if (this.stitchStrength > 0) this._solveStitches(h2);
    }
    if (this.stitchStrength > 0) this._readStitchTensions(h2);

    // ---- 4. bending, as a spring across each interior edge with its rest
    // length taken from the flat pattern. Softer than stretch by orders of
    // magnitude, which is the whole character of cloth: it folds rather than
    // stretching, and that is why a disc can drape at all.
    const aB = this.alphaBend / h2;
    for (let k = 0; k < this.bend.length; k++) {
      const c = this.bend[k];
      const a = V[c.a], b = V[c.b];
      const wa = W[c.a], wb = W[c.b];
      const wsum = wa + wb;
      if (wsum <= 0) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-12) continue;
      const dl = -(L - c.rest) / (wsum + aB);
      const s = dl / L;
      a[0] -= dx * s * wa; a[1] -= dy * s * wa; a[2] -= dz * s * wa;
      b[0] += dx * s * wb; b[1] += dy * s * wb; b[2] += dz * s * wb;
    }

    // ---- 4b. the floor.
    if (o.floorY !== null) {
      const f = o.floorY + o.collisionMargin;
      for (let i = 0; i < N; i++) {
        if (!W[i] || V[i][1] >= f) continue;
        V[i][1] = f;
        this.contact[i] = true;
        this.contactN[i][0] = 0; this.contactN[i][1] = 1; this.contactN[i][2] = 0;
        this.contactQ[i][0] = V[i][0];
        this.contactQ[i][1] = o.floorY;
        this.contactQ[i][2] = V[i][2];
      }
    }

    // ---- 5. self-collision, vertex against vertex, on the pairs found at the
    // top of the frame. A collar that folds over itself would otherwise pass
    // through itself, and folding over itself is most of what a collar does.
    if (o.selfCollision) this._solvePairs();

    // ---- 6. a last contact projection, so the substep ends outside the body
    // whatever the bending and self-collision passes did.
    this._projectContacts(margin, maxPush, h);

    // ---- 7. velocities from the actual motion, which is what makes the
    // position-level friction and collision show up as damping rather than
    // being undone on the next predict.
    //
    // Contact is fully inelastic: the normal component of velocity is removed
    // at a contact, both the inward part (which would keep driving the cloth
    // into the body) and the outward part (which is an artefact of the push-out
    // and would make the cloth bounce off a shoulder like a trampoline).
    // Fabric does neither.
    //
    // Friction is applied here rather than on positions, and that is not a
    // detail. Coulomb friction is mu times the NORMAL IMPULSE, and the normal
    // impulse at a resting contact is exactly the inward velocity gravity just
    // produced and the contact just cancelled: m*g*h per substep. So removing
    // up to mu * |dv_n| of tangential velocity gives a friction force of
    // mu*m*g*cos(theta) with no tuning at all -- it comes out of the integrator.
    // The position-level version (cap the tangential displacement at mu times
    // the penetration depth) looks equivalent and is not: once the contact
    // margin is set to a realistic fabric thickness the depth is a few microns,
    // the cap goes to zero with it, and the cloth creeps down the body forever
    // with no friction whatsoever.
    const damp = o.damping;
    for (let i = 0; i < N; i++) {
      if (!W[i]) { this.vel[i][0] = 0; this.vel[i][1] = 0; this.vel[i][2] = 0; continue; }
      const v = this.vel[i], p = V[i], q = this.prev[i];
      v[0] = (p[0] - q[0]) / h * damp;
      v[1] = (p[1] - q[1]) / h * damp;
      v[2] = (p[2] - q[2]) / h * damp;
      if (this.contact[i]) {
        const n = this.contactN[i];
        const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        v[0] -= n[0] * vn; v[1] -= n[1] * vn; v[2] -= n[2] * vn;
        const budget = this.mu * Math.abs(vn);
        const vt = Math.hypot(v[0], v[1], v[2]);
        if (vt > 1e-9) {
          const k = Math.max(0, 1 - budget / vt);   // sticks when the budget covers it
          v[0] *= k; v[1] *= k; v[2] *= k;
        }
        const cd = o.contactDamping;
        if (cd > 0) { v[0] *= (1 - cd); v[1] *= (1 - cd); v[2] *= (1 - cd); }
      }
    }

    // ---- 8. strain limiting, AFTER the velocity update and deliberately so.
    //
    // Real fabric does not stretch a quarter of its length, and a transient --
    // a disc landing on a shoulder at 100 cm/s and jamming -- will ask it to.
    // But a hard projection that feeds back into the velocity is an energy
    // source: it yanks, the yank becomes velocity, the velocity re-stretches
    // the edge, and the cloth buzzes forever at 15 cm/s and never settles.
    // Running it here makes it a pure positional projection (Provot's strain
    // limiting): it corrects the shape and contributes nothing to momentum.
    // ---- 9. internal damping: dissipate the RELATIVE velocity along each
    // seam and across each fold. See `internalDamping` in DEFAULTS -- without
    // this the sheet is a trampoline.
    if (this.kd > 0) {
      this._dampAlong(this.stretch, this.kd);
      this._dampAlong(this.bend, this.kd * 0.5);
    }

    if (this.maxStrain > 0) {
      this.strainSweeps = 0;
      for (let k = 0; k < o.strainPasses; k++) {
        this.strainSweeps++;
        if (this._clampStrain() <= o.strainTol) break;
      }
    }
  }

  /**
   * Project the cached contact planes: hold every contacting vertex at least
   * `margin` outside the surface it touched, moving it at most `maxPush` this
   * substep. A positional push is a velocity (0.25 cm at h = 1.7 ms is 150
   * cm/s), and while the pushed vertex has its own normal velocity cancelled
   * below, its neighbours inherit the kick through the seams and nothing
   * cancels theirs. Hence the limit.
   */
  _projectContacts(margin, maxPush, h) {
    if (!this.collider) return;
    const V = this.asm.verts, W = this.invMass, vel = this.vel;
    const relax = this.opts.contactRelax;
    for (let i = 0; i < V.length; i++) {
      if (!this.contact[i] || !W[i]) continue;
      const p = V[i], q = this.contactQ[i], n = this.contactN[i];
      const s = (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2] - margin;
      if (s >= 0) continue;
      // The cap exists to stop a resting push from becoming a velocity, but a
      // vertex arriving at 100 cm/s puts 0.17 cm of itself inside the body per
      // substep and a 0.05 cm cap can only retrieve a third of that: the cloth
      // sinks about 3 cm into a shoulder before it stops, and being
      // inextensible it then cannot climb back out. So a vertex is always
      // allowed to undo the motion that caused its own penetration -- that is
      // an inelastic impact, not an injection -- and the cap applies only to
      // the backlog on top of it.
      const v = vel[i];
      const arriving = Math.abs(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) * h;
      const cap = Math.max(maxPush, arriving);
      const d = Math.min(-s * relax, cap);
      p[0] += n[0] * d; p[1] += n[1] * d; p[2] += n[2] * d;
    }
  }

  /**
   * Remove a fraction of the relative velocity along each constraint: a
   * dashpot in parallel with each spring, which is what makes cloth cloth.
   *
   * Momentum-conserving, so it damps internal vibration and leaves the sheet's
   * overall fall alone -- a falling disc still falls at g, it just stops
   * ringing like a drum skin when it lands.
   */
  _dampAlong(constraints, k) {
    const V = this.asm.verts, W = this.invMass, vel = this.vel;
    for (const c of constraints) {
      const wa = W[c.a], wb = W[c.b], wsum = wa + wb;
      if (wsum <= 0) continue;
      const a = V[c.a], b = V[c.b];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-12) continue;
      const nx = dx / L, ny = dy / L, nz = dz / L;
      const va = vel[c.a], vb = vel[c.b];
      const vrel = (vb[0] - va[0]) * nx + (vb[1] - va[1]) * ny + (vb[2] - va[2]) * nz;
      if (vrel === 0) continue;
      const j = (k * vrel) / wsum;          // impulse along the edge
      va[0] += nx * j * wa; va[1] += ny * j * wa; va[2] += nz * j * wa;
      vb[0] -= nx * j * wb; vb[1] -= ny * j * wb; vb[2] -= nz * j * wb;
    }
  }

  /**
   * Draw the seams together. A stitch is a zero-length constraint between two
   * vertices that are the same point of the garment but were cut on different
   * pieces; sewing is the process of making that true -- when it CAN be made
   * true, which is the point of doing it this way.
   *
   * A compliant XPBD distance constraint, exactly like `stretch` and `bend`
   * above, with two differences that are the whole reason for the rewrite:
   *
   *   SOFTER THAN THE CLOTH.  alphaStitch = stitchSoftness * alphaStretch, so
   *   when the seam and the fabric disagree the SEAM yields. The old hard
   *   projection to the midpoint had no compliance at all, so the argument was
   *   settled by sweep order and the fabric lost it.
   *
   *   FORCE-LIMITED.  The accumulated multiplier is clamped at
   *   maxTensionGf, which makes the stitch SATURATE: it pulls as hard as it is
   *   allowed to and then stops, and the seam simply stays open. That residual
   *   is the measurement -- "this seam is 4 cm short" -- and it is exactly what
   *   forcing the seam shut used to throw away.
   *
   * `stitchStrength` (0..1, ramped by the caller) scales the force limit rather
   * than the correction, which is what a seam being drawn closed by hand is:
   * the same thread, pulled progressively harder.
   */
  _solveStitches(h2) {
    const V = this.asm.verts, W = this.invMass;
    const k = Math.min(1, Math.max(0, this.stitchStrength));
    // gram-force -> g*cm/s^2 -> multiplier units (lambda = force * h^2)
    const lamMax = this.maxTensionGf * G * h2 * k;
    const aT = this.alphaStitch / h2;
    for (const s of this.stitches) {
      if (!s.active) continue;
      const wa = W[s.a], wb = W[s.b], wsum = wa + wb;
      if (wsum <= 0) continue;
      const a = V[s.a], b = V[s.b];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-12) continue;
      // C = L (rest length zero), so the stitch only ever pulls: dl <= 0.
      let dl = -L / (wsum + aT);
      // Saturate on the ACCUMULATED multiplier, not on the increment, or the
      // limit would scale with the sweep count instead of being a force.
      if (s.lambda + dl < -lamMax) dl = -lamMax - s.lambda;
      if (dl >= 0) { s.saturated = true; continue; }
      s.lambda += dl;
      const sc = dl / L;
      a[0] -= dx * sc * wa; a[1] -= dy * sc * wa; a[2] -= dz * sc * wa;
      b[0] += dx * sc * wb; b[1] += dy * sc * wb; b[2] += dz * sc * wb;
    }
  }

  /**
   * Turn the substep's accumulated multipliers into a tension, and start the
   * next substep clean.
   *
   * Masses are real grams (from areal density, above) and gravity is real
   * cm/s^2, so lambda/h^2 is a real force and dividing by G puts it in
   * gram-force -- a number a person can weigh against a thread.
   */
  _readStitchTensions(h2) {
    const lamMax = this.maxTensionGf * G * h2 * Math.min(1, Math.max(0, this.stitchStrength));
    for (const s of this.stitches) {
      if (!s.active) { s.tensionGf = 0; s.lambda = 0; s.saturated = false; continue; }
      s.tensionGf = Math.abs(s.lambda) / (h2 * G);
      if (s.tensionGf > s.peakGf) s.peakGf = s.tensionGf;
      s.saturated = lamMax > 0 && Math.abs(s.lambda) >= lamMax * 0.995;
      s.lambda = 0;
    }
  }

  /**
   * The worst stretch in the cloth immediately around a set of stitches.
   *
   * A seam drags on the edges that run into it, so if the fabric is what is
   * stopping the seam closing, this is where it shows. One ring of incident
   * edges is enough and is cheap; the alternative is to search the whole mesh
   * and report a strain that has nothing to do with this seam.
   */
  _seamStrain(list) {
    if (!this._incident) {
      this._incident = new Map();
      for (const c of this.stretch) {
        if (!this._incident.has(c.a)) this._incident.set(c.a, []);
        if (!this._incident.has(c.b)) this._incident.set(c.b, []);
        this._incident.get(c.a).push(c);
        this._incident.get(c.b).push(c);
      }
    }
    const V = this.asm.verts;
    let worst = 0;
    for (const s of list) {
      for (const i of [s.a, s.b]) {
        for (const c of this._incident.get(i) || []) {
          const a = V[c.a], b = V[c.b];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const e = (L - c.rest) / c.rest;
          if (e > worst) worst = e;
        }
      }
    }
    return worst;
  }

  /** How far apart are this stitch's two ends still? cm. */
  stitchGap(s) {
    const a = this.asm.verts[s.a], b = this.asm.verts[s.b];
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }

  /** How far is the furthest ACTIVE seam from being closed? cm. */
  maxStitchGap() {
    let m = 0;
    for (const s of this.stitches) {
      if (!s.active) continue;
      const d = this.stitchGap(s);
      if (d > m) m = d;
    }
    return m;
  }

  /**
   * Turn a predicate into which stitches are being sewn. This is what sewing
   * only SOME of the pieces is, in the solver: the rest of the seams are
   * threads that have not been put in yet.
   */
  setStitchActive(pred) {
    let n = 0;
    for (const s of this.stitches) {
      const was = s.active;
      s.active = !!pred(s);
      if (s.active) n++;
      if (!s.active && was) { s.lambda = 0; s.tensionGf = 0; s.saturated = false; }
    }
    return n;
  }

  /**
   * One row per seam: how much of it closed, how hard the thread had to pull,
   * and the verdict.
   *
   * This is the fitting readout, and it is the thing the old code could not
   * produce. A seam that closes at low tension fits. A seam that closes only
   * at the force limit is being forced, and will pucker. A seam that does not
   * close is short, and the shortfall in centimetres is how much has to be
   * eased in or taken out as a dart on the cutting table (docs/14-editing.md).
   *
   * A seam can fail to close for two different reasons and the report
   * distinguishes them, because the remedy differs:
   *
   *   THE THREAD IS AT ITS LIMIT  (`saturated`) -- the stitch is pulling as
   *   hard as `maxTensionGf` allows. A stronger thread or a slower, eased
   *   seam would close it.
   *
   *   THE CLOTH IS AT ITS LIMIT -- the thread has capacity left but the fabric
   *   has reached `maxStrain` and will not stretch further. No thread will fix
   *   that; the pattern is wrong and the pieces have to be re-cut.
   *
   * Either way the seam stays open and the shortfall is reported, which is the
   * whole difference from forcing it shut and averaging the evidence away.
   *
   * @param closedCm  a stitch within this is counted closed; the weld uses the
   *                  same tolerance, so "closed" here means "will be welded".
   */
  stitchReport({ closedCm = 0.25 } = {}) {
    const bySeam = new Map();
    for (const s of this.stitches) {
      const id = s.seam || (s.pa !== undefined ? `P${s.pa}-P${s.pb}` : 'dart');
      if (!bySeam.has(id)) bySeam.set(id, []);
      bySeam.get(id).push(s);
    }
    const rows = [];
    for (const [id, list] of bySeam) {
      const gaps = list.map((s) => this.stitchGap(s));
      const closed = gaps.filter((g) => g <= closedCm).length;
      const tens = list.map((s) => s.tensionGf);
      const sat = list.filter((s) => s.saturated).length;
      const active = list.filter((s) => s.active).length;
      const maxGap = Math.max(...gaps);
      const pct = 100 * closed / list.length;
      const meanT = tens.reduce((a, b) => a + b, 0) / list.length;
      // Is the seam pulling in earnest? A seam that is open at a tension this
      // low has simply not been given time; one that is open while pulling
      // hard has lost the argument and will not close.
      const pulling = meanT > 0.08 * this.maxTensionGf;
      const strained = this._seamStrain(list);
      const why = sat > 0 ? 'the thread is at its limit'
        : strained >= this.maxStrain * 0.95 ? 'the cloth is at its limit' : null;
      rows.push({
        seam: id,
        pieces: list[0].pa !== undefined ? `${list[0].pa} + ${list[0].pb}` : '-',
        stitches: list.length,
        sewing: active === 0 ? 'no' : active === list.length ? 'yes' : 'part',
        closedPct: +pct.toFixed(0),
        maxGapCm: +maxGap.toFixed(2),
        meanTensionGf: +meanT.toFixed(0),
        peakTensionGf: +Math.max(...list.map((s) => s.peakGf)).toFixed(0),
        clothStrainPct: +(100 * strained).toFixed(1),
        atTheLimit: sat,
        verdict: active === 0 ? 'not sewn'
          : maxGap <= closedCm
            ? (sat > list.length * 0.1 || strained >= this.maxStrain * 0.95
              ? 'closed, but forced -- it will pucker' : 'closed')
            : pulling || sat > 0
              ? `short by ${maxGap.toFixed(1)} cm (${why || 'it has stopped closing'})`
              : 'still closing',
      });
    }
    return rows.sort((a, b) => String(a.seam).localeCompare(String(b.seam)));
  }

  /** One sweep; returns the largest remaining violation, as a strain. */
  _clampStrain() {
    const V = this.asm.verts, W = this.invMass;
    const lim = 1 + this.maxStrain;
    let worst = 0;
    for (const c of this.stretch) {
      const a = V[c.a], b = V[c.b];
      const wa = W[c.a], wb = W[c.b], wsum = wa + wb;
      if (wsum <= 0) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      const max = c.rest * lim;
      if (L <= max || L < 1e-12) continue;
      const over = (L - max) / c.rest;
      if (over > worst) worst = over;
      const s = ((L - max) / L) / wsum;
      a[0] += dx * s * wa; a[1] += dy * s * wa; a[2] += dz * s * wa;
      b[0] -= dx * s * wb; b[1] -= dy * s * wb; b[2] -= dz * s * wb;
    }
    return worst;
  }

  /**
   * Self-collision broad phase: candidate vertex pairs closer than `radius`.
   *
   * Mesh neighbours are excluded -- they are *supposed* to be a rest length
   * apart, and repelling them inflates the cloth into a balloon. One ring of
   * exclusion is enough because the separation enforced is smaller than an
   * edge.
   */
  _findPairs(radius) {
    const V = this.asm.verts;
    if (!this.ring) {
      this.ring = V.map(() => new Set());
      for (const c of this.stretch) { this.ring[c.a].add(c.b); this.ring[c.b].add(c.a); }
      for (const c of this.bend) { this.ring[c.a].add(c.b); this.ring[c.b].add(c.a); }
    }
    const cell = Math.max(radius, this.cell);
    const hash = this.hash;
    hash.clear();
    for (let i = 0; i < V.length; i++) {
      const p = V[i];
      const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
      let b = hash.get(k);
      if (!b) { b = []; hash.set(k, b); }
      b.push(i);
    }
    const pairs = this.pairs;
    pairs.length = 0;
    const r2 = radius * radius;
    for (let i = 0; i < V.length; i++) {
      const p = V[i];
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const bucket = hash.get(`${cx + a},${cy + b},${cz + c}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i || this.ring[i].has(j)) continue;
          const q = V[j];
          const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
          if (d2 < r2) pairs.push(i, j);
        }
      }
    }
    return pairs.length / 2;
  }

  _solvePairs() {
    const V = this.asm.verts, W = this.invMass;
    const h = this.opts.clothThickness;
    const pairs = this.pairs;
    for (let k = 0; k < pairs.length; k += 2) {
      const i = pairs[k], j = pairs[k + 1];
      const wsum = W[i] + W[j];
      if (wsum <= 0) continue;
      const p = V[i], q = V[j];
      const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= h * h || d2 < 1e-16) continue;
      const d = Math.sqrt(d2);
      const s = ((d - h) / d) / wsum;
      p[0] += dx * s * W[i]; p[1] += dy * s * W[i]; p[2] += dz * s * W[i];
      q[0] -= dx * s * W[j]; q[1] -= dy * s * W[j]; q[2] -= dz * s * W[j];
    }
  }

  /** Is the simulation still numerically sane? */
  healthy() {
    for (const p of this.asm.verts) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return false;
    }
    return true;
  }

  /** Fastest vertex, cm/s. */
  maxSpeed() {
    let m = 0;
    for (let i = 0; i < this.vel.length; i++) {
      if (!this.invMass[i]) continue;
      const v = this.vel[i];
      const s2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      if (s2 > m) m = s2;
    }
    return Math.sqrt(m);
  }

  /** RMS speed over the free vertices, cm/s. This is the settling test. */
  rmsSpeed() {
    let s2 = 0, n = 0;
    for (let i = 0; i < this.vel.length; i++) {
      if (!this.invMass[i]) continue;
      const v = this.vel[i];
      s2 += v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      n++;
    }
    return n ? Math.sqrt(s2 / n) : 0;
  }

  /** Kinetic energy, erg. Useful for spotting an injection; not a settle test. */
  kinetic() {
    let e = 0;
    for (let i = 0; i < this.vel.length; i++) {
      if (!this.invMass[i]) continue;
      e += 0.5 * this.mass[i] * dot(this.vel[i], this.vel[i]);
    }
    return e;
  }

  /**
   * Run until the cloth stops moving, or until `maxSeconds`.
   *
   * "Stopped" is an RMS speed in cm/s, which is a number you can picture: 1
   * cm/s is a hem still visibly creeping, 0.2 cm/s is settled cloth.
   */
  settle({ maxSeconds = 6, dt = 1 / 60, quietFor = 0.2, stillCmPerSec = 0.6, onFrame = null } = {}) {
    const frames = Math.round(maxSeconds / dt);
    const need = Math.max(1, Math.round(quietFor / dt));
    let quiet = 0;
    for (let f = 0; f < frames; f++) {
      this.step(dt);
      if (onFrame) onFrame(f, this);
      if (!this.healthy()) return { settled: false, blewUp: true, seconds: this.time };
      if (this.rmsSpeed() < stillCmPerSec) {
        if (++quiet >= need) return { settled: true, seconds: +this.time.toFixed(3) };
      } else quiet = 0;
    }
    return { settled: false, seconds: +this.time.toFixed(3), rmsCmPerSec: +this.rmsSpeed().toFixed(2) };
  }

  /** What the simulation is doing, in numbers you can assert on. */
  report() {
    const V = this.asm.verts;
    const strains = this.asm.edgeStrains();
    const abs = strains.map((s) => Math.abs(s.strain));
    const pos = strains.map((s) => Math.max(0, s.strain));
    const ys = V.map((p) => p[1]);
    let contacts = 0;
    for (const c of this.contact) if (c) contacts++;
    // Penetration is measured against the level set, not against
    // surface.closestPoint: the latter is the unreliable nearest-sample test
    // this module exists to get away from, and it reports vertices resting
    // beside a shoulder as being a centimetre inside the body.
    let deepest = 0;
    if (this.collider) {
      for (const p of V) {
        const d = this.collider.sdf.at(p);
        if (Number.isFinite(d) && d < deepest) deepest = d;
      }
    }
    const com = V.reduce((a, p, i) => {
      const m = this.mass[i];
      return [a[0] + p[0] * m, a[1] + p[1] * m, a[2] + p[2] * m];
    }, [0, 0, 0]).map((x) => x / Math.max(1e-9, this.weightG));
    return {
      seconds: +this.time.toFixed(3),
      weightG: +this.weightG.toFixed(1),
      areaCm2: +this.areaCm2.toFixed(0),
      vertices: V.length,
      rmsSpeedCmPerSec: +this.rmsSpeed().toFixed(2),
      maxSpeedCmPerSec: +this.maxSpeed().toFixed(2),
      comYcm: +com[1].toFixed(2),
      topYcm: +Math.max(...ys).toFixed(2),
      bottomYcm: +Math.min(...ys).toFixed(2),
      meanStrainPct: +(100 * abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2),
      maxStretchPct: +(100 * Math.max(0, ...pos)).toFixed(1),
      stretchedSeamsPct: +(100 * pos.filter((s) => s > 0.02).length / pos.length).toFixed(1),
      contactVerts: contacts,
      contactPct: +(100 * contacts / V.length).toFixed(1),
      deepestPenetrationCm: +(-deepest).toFixed(2),
    };
  }

  /** Per-vertex fields for colouring: stretch, and height fallen. */
  field() {
    const n = this.asm.verts.length;
    const tension = new Array(n).fill(0);
    const slack = new Array(n).fill(0);
    for (const s of this.asm.edgeStrains()) {
      const t = Math.max(0, s.strain), k = Math.max(0, -s.strain);
      tension[s.e.a] = Math.max(tension[s.e.a], t);
      tension[s.e.b] = Math.max(tension[s.e.b], t);
      slack[s.e.a] = Math.max(slack[s.e.a], k);
      slack[s.e.b] = Math.max(slack[s.e.b], k);
    }
    const gap = this.surface
      ? this.asm.verts.map((p) => this.surface.closestPoint(p).signed)
      : this.asm.verts.map(() => 0);
    return { tension, slack, gap, contact: this.contact.slice() };
  }
}
