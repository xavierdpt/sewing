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
// The hinge topology and compliance live in their own module now: the wasm
// sewing needs the same quadruples, and deriving them twice would be two
// chances to disagree about what a hinge is.
import { bendingStencils, BEND_SCALE } from './bending.js';

/** cm/s^2. Everything in this project is centimetres, so gravity is 981. */
export const G = 981;

/**
 * Fabric presets. `gsm` is grams per square metre, which is how fabric is
 * actually sold, so these are real numbers rather than solver units.
 *
 * `stretch` is an XPBD compliance (inverse stiffness): 0 is inextensible,
 * larger is slacker. A woven is nearly inextensible along the grain; a knit
 * stretches.
 *
 * `bendLengthCm` is the PEIRCE BENDING LENGTH -- the measurement a textile lab
 * makes by hanging a strip off a table edge and reading how far it must
 * overhang before its tip droops 41.5 degrees. It is a property of the cloth,
 * published for real fabrics, in centimetres, and `tools/fabric.mjs` measures
 * it back out of the simulation. It replaced an opaque compliance that the
 * same instrument showed was doing NOTHING: every preset, and a compliance of
 * zero, gave the same 0.76 cm -- limper than any real cloth, which is why the
 * drape creased like paper instead of folding.
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
  // `maxStrain` DECIDED 2026-10-12 from measurement, not plausibility.
  //
  // These were 0.02-0.04 for the wovens, guessed. `sim/cipc/fabrics.md` holds
  // five MEASURED cloths of 150-240 gsm (Wang et al.'s dataset, via C-IPC)
  // whose strain limits are 6.1, 6.5, 8.5 and 13.4 % -- plus a 0.5 % near-
  // rigid control that is not a fabric. Not one real woven in that set is
  // under 6.1 %, so every woven here was 2-3x too tight.
  //
  // That file declined to adopt its own numbers because mapping a Young's
  // modulus and a Poisson's ratio onto XPBD compliances "is a real piece of
  // work and not a lookup", which is true -- but `maxStrain` is DIMENSIONLESS.
  // A strain limit needs no mapping; only E and nu do. So this one value
  // transfers directly and the rest of that work is still outstanding.
  //
  // Adopted as a flat 6.1 % floor for the wovens rather than by scaling the
  // old spread, because the old ordering (denim 2 %, poplin 4 %) was invented
  // too, and what the data gives is a RANGE and not per-fabric values. A flat
  // floor is the least this can be changed to and still be measured. Per-
  // fabric limits await a tensile test; docs/18-validation.md Step 4.
  //
  // Cotton jersey stays at 25 %: it is a knit, outside that woven set, and
  // nothing here measures it.
  //
  // What this changes: docs/11-cloth.md:400 predicted it -- the yoke/slip
  // boundary "turns entirely on the cloth refusing to stretch past the
  // shoulder girth" and "was found with too stiff a cloth and should be
  // re-run". It also closes the dart the gate could not: 0.252 cm at 3 %,
  // 0.185 at 6.1 %, against a 0.2 cm threshold.
  // `shearLockDeg` is the TRELLIS LOCKING ANGLE: how far warp and weft rotate
  // against each other before the weave jams. From the literature by fabric
  // class, the same footing as `bendLengthCm`'s published ranges -- a woven
  // shears 15-25 degrees (docs/01-geometry.md:142, docs/06-open-questions.md
  // section 1), tighter and heavier weaves less, bonded interfacing almost
  // none, knits far more. Not measurements of any particular cloth, and
  // marked as such; one square and a protractor refines any of them
  // (docs/06-open-questions.md section 1, "Answered, the geometric half").
  //
  // It is the ONE number shear needs, because the rest is geometry:
  // `tools/shearnet.mjs` converts it to the Gaussian curvature the cloth
  // absorbs for free, and shearing a cell by gamma takes its diagonals to
  // sqrt(1 +/- sin gamma), which is where `biasStrainFactor` comes from
  // instead of being guessed. See `_classifyGrain`.
  //                        gsm  stretch   bendCm  mu   damp  maxStrain  shearLockDeg
  'cotton poplin':   { gsm: 120, stretch: 2e-7, bendLengthCm: 1.7, friction: 0.40, damp: 0.75, maxStrain: 0.061, shearLockDeg: 15 },
  'linen':           { gsm: 190, stretch: 3e-7, bendLengthCm: 2.3, friction: 0.45, damp: 0.80, maxStrain: 0.061, shearLockDeg: 12 },
  'wool crepe':      { gsm: 220, stretch: 8e-7, bendLengthCm: 1.9, friction: 0.35, damp: 0.85, maxStrain: 0.061, shearLockDeg: 22 },
  'silk habotai':    { gsm:  60, stretch: 5e-7, bendLengthCm: 1.1, friction: 0.22, damp: 0.55, maxStrain: 0.061, shearLockDeg: 20 },
  'cotton jersey':   { gsm: 180, stretch: 2e-5, bendLengthCm: 1.4, friction: 0.50, damp: 0.75, maxStrain: 0.25,  shearLockDeg: 40 },
  'denim':           { gsm: 340, stretch: 1e-7, bendLengthCm: 3.3, friction: 0.55, damp: 0.90, maxStrain: 0.061, shearLockDeg: 10 },
  'interfaced twill':{ gsm: 260, stretch: 1e-7, bendLengthCm: 5.0, friction: 0.50, damp: 0.90, maxStrain: 0.061, shearLockDeg: 5 },
};

/**
 * Flexural rigidity in dyn cm, from the bending length a textile lab would
 * measure: B = w g c^3, with w the areal density in g/cm^2 and c the Peirce
 * bending length in cm. This is the whole reason the presets are written as a
 * LENGTH: `c` is a number you can look up for a real cloth, or measure with a
 * ruler and a table edge, and the solver has to reproduce it.
 */
export function rigidityOf(gsm, bendLengthCm) {
  return (gsm / 10000) * G * bendLengthCm ** 3;
}

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
  // Sweeps of the bending pass per substep. One is what the first version
  // did, and one is not enough to be a stiffness: measured on the cantilever
  // (tools/fabric.mjs), every preset and even a compliance of ZERO gave the
  // same 0.76 cm bending length -- the parameter was inert and the cloth had
  // no bending resistance at all, which is what creases like paper instead of
  // folding like cloth.
  bendSweeps: 8,
  // Override `BEND_SCALE` from bending.js, which multiplies the bending
  // stiffness by 30. An INPUT since 2026-10-18 because it is the leading
  // candidate for the over-stiffness of docs/18-validation.md 6.12 --
  // converged, the solver reads ~2.5x too high a bending length on every
  // fabric at every mesh, which is ~15x in rigidity, and a constant factor
  // needs a constant to blame. null keeps the 30.
  bendScale: null,
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
  // ---- SHEAR (the trellis), as anisotropy between grain and bias.
  //
  // A woven is not an isotropic sheet. Warp and weft are nearly inextensible,
  // but they can ROTATE against each other -- shear, the trellis mode -- by
  // 15-25 degrees before locking, and that absorbs Gaussian curvature for
  // free. docs/01-geometry.md:142 says so, docs/09-pattern.md:192 and
  // docs/04-software.md:318 both list its absence as a known limitation, and
  // docs/06-open-questions.md calls measuring it "the question I would answer
  // first... every other number in this project is downstream of it".
  //
  // Without it the cloth has only two outlets for excess length, stretch and
  // large-scale bending, and it takes the first: measured on a dropped disc,
  // max strain pinned at 3.6-4.0 % against silk's 4 % yield, i.e. the cloth
  // tore rather than creased. Real cloth answers the same disc with ~1 cm
  // creases, redistributing cloth in-plane instead of straining.
  //
  // So an edge lying on the bias is made both more compliant and allowed to
  // yield further than one lying on the grain, interpolated by sin^2(2 theta)
  // -- 0 along warp or weft, 1 at 45 degrees. It needs a material frame
  // (`asm.material`, from `sewFlat`); an assembly without one gets today's
  // isotropic behaviour exactly.
  //
  // BOTH NUMBERS ARE ESTIMATES AWAITING THE MEASUREMENT. A woven's bias
  // modulus is one to two orders of magnitude under its on-grain modulus,
  // hence 25x; a 20-degree trellis shear lengthens a 45-degree diagonal by
  // about 17 %, which against a 3 % grain limit is ~6x. Replace them with
  // docs/06-open-questions.md section 1 once the scraps-and-a-bowl experiment
  // has been run -- and note that shear alone cannot produce a 1 cm crease on
  // a mesh whose finest representable wrinkle is 8.8 cm (edge 2.2).
  // REVISED 2026-10-12, second pass: ON, and no longer invented.
  //
  // `biasStrainFactor` is gone as a constant: it is derived per fabric from
  // `shearLockDeg` via sqrt(1 + sin gamma), the extension a cell's diagonal
  // needs for its trellis, over the fabric's own grain limit. That gives 0.70
  // for bonded interfacing up to 2.83 for crepe -- where the flat 6 had the
  // interfacing wrong by a factor of nine and in the wrong direction.
  //
  // With that in place the harm measured below is gone. Silk habotai on the
  // yoke disc, derived factor 2.60: grain strain 3.65 % off, 4.03 % on,
  // against a 6.1 % limit -- two thirds of the ceiling where the flat 6
  // reached 1.88x it -- and every run settles. The trellis engages (shear
  // strain 2.45 -> 2.73 %) and body penetration is unchanged (4.69 -> 4.55 %
  // of samples inside).
  //
  // `biasCompliance` is the one quantity neither geometry nor a locking angle
  // fixes: how SOFT the bias is, not how far it may go. A woven's shear
  // modulus runs two to three orders under its tensile, so 25 sits inside the
  // range; 100 measured barely different (shear strain 2.98 % against 2.73).
  // It should be settled against the Cusick drape coefficient
  // (docs/18-validation.md Step 2), not against a lab.
  //
  // THE EARLIER DECISION, kept because the reasoning was right at the time:
  // inert, because 25 and 6 were plausibility arguments and three
  // measurements said shipping them on was wrong --
  //
  //   * at edge 1.0 the trellis engages (bias strain 4.4 -> 16.6 %) but drags
  //     YARN strain from 4.5 to 11.4 % and neither run settles, which is the
  //     opposite of the intent;
  //   * at edge 2.2 it changes nothing measurable, because the freed length
  //     has nowhere to go on a mesh whose finest wrinkle is 8.8 cm against
  //     the ~1 cm creases real cloth makes;
  //   * it loosened the per-edge strain ceiling 6x on bias edges, which hid
  //     an under-resolved substep count behind a limiter that reported itself
  //     converged (section 6.7).
  //
  // Shear is real and this project needs it -- docs/01-geometry.md:142 and
  // the observation that cloth "pulls and pushes the fabric around" into
  // ~1 cm creases are the same fact. But an unfitted constant is not that
  // mechanism working, and the experiment that would calibrate it is one
  // afternoon with four scraps and a bowl
  // (docs/06-open-questions.md section 1) -- which turned out to be half
  // answerable from the literature and the geometry, like every other
  // parameter in this file. Set `biasCompliance: 1` to make shear inert
  // again.
  biasCompliance: 25,
  // null = derive it from the fabric's `shearLockDeg`, which is the only way
  // it is not a guess. A number here overrides, for experiments. 1 means "the
  // bias may stretch no further than the grain", which forbids the trellis
  // entirely -- and the strain clamp then holds everything at `maxStrain`
  // whatever the compliance says, which is why a run with `biasCompliance:
  // 25` and this at 1 measured identically to shear being off.
  biasStrainFactor: null,
  collisionMargin: 0.10,  // cm; half the cloth's thickness, held off the body
  // Collide the MIDPOINT of each edge as well as the vertices.
  //
  // Contact is a point query per vertex, so without this the cloth is held off
  // the body at its vertices and nowhere else, and a flat triangle spanning a
  // convex bulge dips below the surface in between -- the chord sag s^2/8R
  // that docs/01-geometry.md section 6 computes for ease, showing up here as
  // the body visibly poking through the cloth.
  //
  // It matters most exactly when the garment is least settled. Measured on a
  // half-sewn four-panel skirt, where only 12 of ~1000 vertices are touching
  // and the cloth bridges between them: every vertex correctly outside, and
  // 40 edge midpoints up to 0.42 cm INSIDE the body. One triangle's own sag is
  // only about 0.07 cm at a 3 cm edge, so this is not really per-triangle --
  // it is the unsupported span between the few vertices in contact.
  //
  // The midpoint is not a real degree of freedom: pushing both endpoints out
  // by d moves the midpoint out by d, so the correction is shared between them
  // and the triangle is lifted off as a whole.
  //
  // OFF by default, and that is an admission rather than a preference. Sampling
  // more points is not how this problem is solved -- the standard treatment is
  // proximity and continuous detection on the real primitive pairs, vertex-face
  // and edge-edge (Bridson & Fedkiw 2002), or a barrier formulation that
  // guarantees an intersection-free state (IPC, Li et al. 2020). Midpoints
  // reduce the error without bounding it: measured on a half-sewn skirt, 40
  // edge midpoints inside the body at 0.42 cm became 4 at 0.26 cm, not 0.
  //
  // And it is a positional correction added to a Gauss-Seidel loop whose
  // relaxation constants above were tuned by measurement against the drop
  // test, so switching it on globally costs that test its settle: 3 cm/s rms
  // after 9 s against 0.2 for settled cloth.
  //
  // So it is on only where it earns its keep and nothing depends on settling
  // -- arranging and sewing by hand, where the cloth bridges between a handful
  // of contacts and the body visibly comes through. Drape belongs to a solver
  // that does this properly; see docs/11-cloth.md on the Blender side-car.
  edgeCollision: false,
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
  clothThickness: 0.4,    // cm, the cloth's thickness: see `selfCollisionMode`
  // HOW THICKNESS IS MODELLED.
  //
  // 'slab' -- the cloth is a sheet of real thickness, so its two surfaces are
  // half a thickness either side of the mesh, and two pieces of cloth are in
  // contact when their SURFACES touch. That is a distance between primitives:
  // a vertex against a triangle, and an edge against an edge. It is the only
  // one of the two that can stop a fold crossing another fold.
  //
  // 'vertex' -- the original: push apart pairs of VERTICES closer than
  // `clothThickness`. It cannot see the triangle between two vertices, so with
  // 0.4 cm of thickness on a 2 cm mesh two layers can lie 0.05 cm apart and
  // interpenetrate completely, as long as no vertex of one lands within 0.4 cm
  // of a vertex of the other -- and the nearest vertices of two stacked layers
  // are typically edge/sqrt(3) = 1.15 cm apart laterally, which is 2.9x the
  // detection radius. docs/11-cloth.md:377 records the symptom ("two folds can
  // cross if they do it between vertices"), and the accordion heap it measures
  // "resolves about four layers' worth of the eight" for this reason. It is
  // kept for comparison, and because every recorded number was taken with it.
  //
  // The proximity model assumes thickness is not much more than a mesh edge;
  // below that, elements two rings apart start reporting contact with each
  // other and inflate the sheet, which is what `selfRingExclude` guards. For
  // thickness comparable to the edge, the honest answer is a solver built for
  // it -- C-IPC, carried in `sim/` -- not a bigger margin here.
  // Cell size of the body's level set, cm, or null for BodyCollider's own
  // default. docs/11-cloth.md:379 records that the level set "is as sharp as
  // its grid. 0.3 cm at the neck/shoulder crease; halve `cell` and pay for it
  // as the cube in build time" -- and a disc drop reports exactly 0.24-0.30 cm
  // of edge penetration at the neck, with every vertex clean. Confirming that
  // those are the same 0.3 cm means varying this, which was not reachable
  // from a drop.
  colliderCell: null,
  selfCollisionMode: 'slab',
  // Broad-phase cell, cm, or null for `max(2 * thickness, mean edge * 1.1)`.
  //
  // Cloth is a THIN SHEET, and a cell sized to its edge length is the wrong
  // shape for it: measured on the settled accordion, eight layers inside 3 cm
  // of height all fell into the same 2.49 cm cell, so the grid separated
  // nothing in the one direction where the layers actually are. The candidate
  // count was 23 % of every possible edge pair on a 640-triangle mesh, which
  // is a grid doing almost no work. Exposed so it can be swept
  // (`node tools/profile.mjs --cell 1.0`) rather than guessed at.
  selfCell: null,
  // How many rings of mesh neighbourhood are exempt from self-contact. One is
  // right while the thickness is well under an edge length.
  selfRingExclude: 1,
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
  // How fast a seam is drawn closed, cm/s of gap taken up.
  //
  // A seam is SEWN AT A RATE, and that is not a presentational detail. The
  // first version made the stitch pull towards zero with a force limit, which
  // for a seam with nothing resisting it is a constant force over 20-40 cm of
  // travel -- so the pieces accelerated the whole way and arrived at speed.
  // That is a catapult, not a seam.
  //
  // Here each stitch carries a rest length that starts at the gap it was armed
  // with and is fed down at this rate, so the cloth is drawn together at a
  // CONSTANT speed and never accelerates: the target moves at `v`, the cloth
  // follows at `v`, and there is no transient to work out afterwards. The
  // force limit still does its job, because the moment the cloth cannot keep
  // up with the feed the constraint is violated and the tension rises.
  //
  // It also makes the sewing watchable and interruptible, which is the whole
  // point of doing it by hand: stop half way and the seam is half sewn.
  sewSpeedCmPerSec: 4,
  // How far the commanded closure may run ahead of what the cloth has actually
  // delivered, cm. See `_feedStitches`.
  sewSlackCm: 1.0,
  // Velocity retained per frame while a seam is being sewn.
  //
  // Drawing the seams closed is meant to be QUASI-STATIC -- that is the whole
  // argument for doing it with gravity off before letting the garment fall
  // (see the head of assemble.js). Quasi-static means the cloth has no
  // momentum of its own: it goes where the feed takes it and stops. Without
  // this the pieces keep whatever speed the first few frames of contact
  // de-penetration gave them, which on a fresh layout is tens of cm/s, and
  // the sewing reads as a lurch that has nothing to do with the thread.
  //
  // It applies only while feeding, so it cannot touch the drape.
  sewDamping: 0.25,
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
  /**
   * Broad phase: is this point worth a full contact query?
   *
   * It has to ask the LIMBS as well as the torso. The level set covers the
   * torso only, so a point sitting a long way from the torso surface -- beside
   * a thigh, say -- gives a large positive distance and used to be rejected
   * here, which meant `query` was never called for it and the capsule it was
   * actually inside never got a chance to push it out. A capsule distance is a
   * few arithmetic operations, so asking is cheap; being wrong is a limb
   * silently passing through the cloth.
   */
  near(p, skin) {
    const d = this.sdf.at(p);
    if (Number.isFinite(d) && d < skin) return true;
    if (!this.hasLimbs) return false;
    const s = this.surface;
    for (const [on, fn] of [[s.includeArms, s.closestArm], [s.includeLegs, s.closestLeg]]) {
      if (!on || !fn) continue;
      const c = fn.call(s, p);
      if (c && c.signed < skin) return true;
    }
    return false;
  }

  /** Signed distance to the WHOLE body: the torso level set and the limbs. */
  signedAt(p) {
    let d = this.sdf.at(p);
    if (!Number.isFinite(d)) d = Infinity;
    if (this.hasLimbs) {
      const s = this.surface;
      for (const [on, fn] of [[s.includeArms, s.closestArm], [s.includeLegs, s.closestLeg]]) {
        if (!on || !fn) continue;
        const c = fn.call(s, p);
        if (c && c.signed < d) d = c.signed;
      }
    }
    return d;
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

/**
 * Closest point on a triangle to p, with its barycentric weights.
 *
 * Ericson's region test, in full: a point over an edge or a corner of the
 * triangle has its closest point THERE, not on the plane, and projecting onto
 * the plane regardless is how a fold resting on a triangle's rim ends up
 * reported as a centimetre away from it. The weights come back because the
 * correction has to be shared out over the three vertices in proportion to
 * how much each of them owns the contact.
 */
// Scratch for the two closest-point routines. They are called once per
// candidate pair per substep -- on the accordion heap that was about 140
// million calls, each returning a fresh object, and the profiler put 15.4 %
// of the run in closestSegs alone with another 2.8 % in the collector. A
// module-level buffer costs nothing and the callers are strictly sequential.
const _BARY = new Float64Array(3);
const _ST = new Float64Array(2);

function closestOnTri(p, a, b, c) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { _BARY[0] = 1; _BARY[1] = 0; _BARY[2] = 0; return _BARY; }
  const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { _BARY[0] = 0; _BARY[1] = 1; _BARY[2] = 0; return _BARY; }
  const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { _BARY[0] = 0; _BARY[1] = 0; _BARY[2] = 1; return _BARY; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    _BARY[0] = 1 - t; _BARY[1] = t; _BARY[2] = 0; return _BARY;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    _BARY[0] = 1 - t; _BARY[1] = 0; _BARY[2] = t; return _BARY;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const t = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    _BARY[0] = 0; _BARY[1] = 1 - t; _BARY[2] = t; return _BARY;
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  _BARY[0] = 1 - v - w; _BARY[1] = v; _BARY[2] = w; return _BARY;
}

/**
 * Closest approach of two segments, as the parameters along each.
 *
 * Parallel and degenerate cases are handled rather than divided by: two
 * layers of an accordion lying face to face ARE parallel, which is exactly
 * the configuration this has to get right.
 */
function closestSegs(p1, p2, q1, q2) {
  const dx1 = p2[0] - p1[0], dy1 = p2[1] - p1[1], dz1 = p2[2] - p1[2];
  const dx2 = q2[0] - q1[0], dy2 = q2[1] - q1[1], dz2 = q2[2] - q1[2];
  const rx = p1[0] - q1[0], ry = p1[1] - q1[1], rz = p1[2] - q1[2];
  const a = dx1 * dx1 + dy1 * dy1 + dz1 * dz1;
  const e = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
  const f = dx2 * rx + dy2 * ry + dz2 * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { _ST[0] = 0; _ST[1] = 0; return _ST; }
  if (a <= 1e-12) { _ST[0] = 0; _ST[1] = Math.min(1, Math.max(0, f / e)); return _ST; }
  const c = dx1 * rx + dy1 * ry + dz1 * rz;
  if (e <= 1e-12) { _ST[0] = Math.min(1, Math.max(0, -c / a)); _ST[1] = 0; return _ST; }
  const b = dx1 * dx2 + dy1 * dy2 + dz1 * dz2;
  const den = a * e - b * b;
  s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
  else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  _ST[0] = s; _ST[1] = t; return _ST;
}


// Re-exported so nothing that imported it from here has to change; it is
// defined in bending.js.
export { BEND_SCALE };

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
    // Flexural rigidity, dyn cm. `bend` stays as a direct override in the
    // same units as the presets -- a bending length in centimetres -- because
    // that is the number anyone tuning this has in their hand.
    this.bendLengthCm = o.bend ?? preset.bendLengthCm ?? 1.7;
    this.rigidity = rigidityOf(this.gsm, this.bendLengthCm);
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
    this.collider = surface
      ? new BodyCollider(surface, o.colliderCell ? { cell: o.colliderCell } : {})
      : null;
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
    // Edge-midpoint contacts, found once per substep like the vertex ones and
    // then projected against the cached plane in every sweep.
    this.edgeContact = [];
    this.edgeN = [];
    this.edgeQ = [];
    // the indices of the edges actually in contact, rebuilt once per frame, so
    // the eighty projection sweeps iterate a handful rather than thousands
    this.edgeHits = [];
    this._edgeDx = null;
    this._edgeCount = null;
    this._edgeTouched = [];

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
    this.edgeContact = new Array(this.stretch.length).fill(false);
    this.edgeN = this.stretch.map(() => [0, 0, 0]);
    this.edgeQ = this.stretch.map(() => [0, 0, 0]);
    this._edgeDx = new Float64Array(N * 3);
    this._edgeCount = new Int32Array(N);
    // Bending. The dihedral hinges are the model; the cross-springs are kept
    // because the damping pass uses them as a cheap list of "pairs that move
    // relative to each other when the cloth folds", which is what internal
    // viscosity acts on.
    this.hinges = bendingStencils(asm);
    this.hingeLambda = new Float64Array(this.hinges.length);
    const bendScale = o.bendScale ?? BEND_SCALE;
    for (const g of this.hinges) {
      g.alpha = g.area / (bendScale * this.rigidity * g.len * g.len);
    }
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
    // A stitch is ARMED -- the thread is in -- exactly when it has a `rest`
    // length. `active` mirrors that and nothing else; keeping them as two
    // independent flags was a bug, because every stitch started active and so
    // every unsewn seam counted towards maxStitchGap() and the reports, which
    // made a seam nobody had touched look like a seam that would not close.
    this.stitches = (o.stitches || []).map((s) => ({
      ...s,
      active: (s.rest ?? null) !== null,
      // Per-stitch share of the force limit, 0..1. A seam already sewn holds
      // at 1 while a new pass ramps from nearly nothing, which a single global
      // ramp cannot express: ramping it would slacken every seam already
      // closed and the garment would sag open on every pass.
      strength: s.strength ?? 1,
      // The gap the thread is currently holding the seam at. null = not yet
      // armed; the thread is not in. Feeding takes it down to zero.
      rest: s.rest ?? null,
      feeding: false,     // is the rest length being taken up right now?
      lambda: 0,          // the XPBD multiplier, accumulated over one substep
      tensionGf: 0,       // |lambda| / h^2, in gram-force
      peakGf: 0,          // the most it has ever pulled with
      saturated: false,   // pulling as hard as it is allowed to, and still open
    }));
    this.alphaStitch = o.stitchCompliance ?? this.alphaStretch * o.stitchSoftness;
    this.maxTensionGf = o.maxTensionGf;
    this.stitchStrength = this.stitches.length ? 0.05 : 0;

    this._classifyGrain(o);

    // ---- self-collision hash
    const h = o.clothThickness;
    this.cell = Math.max(h * 2, this._meanEdge() * 1.1);
    this.hash = new Map();
    // candidate primitive pairs for the 'slab' thickness model
    this.vtPairs = [];
    this.eePairs = [];
    // which stretch constraints are the three sides of each triangle, so an
    // edge-edge test can be driven off the same grid the triangles are in
    const eIndex = new Map();
    for (let k = 0; k < this.stretch.length; k++) {
      const c = this.stretch[k];
      eIndex.set(c.a < c.b ? `${c.a}_${c.b}` : `${c.b}_${c.a}`, k);
    }
    this.triEdges = this.asm.tiles.map((t) => {
      const [i, j, k2] = t.v;
      return [[i, j], [j, k2], [k2, i]]
        .map(([x, y]) => eIndex.get(x < y ? `${x}_${y}` : `${y}_${x}`))
        .filter((m) => m !== undefined);
    });
  }

  /**
   * How far each edge lies off the grain, and what that costs it.
   *
   * `bias` is sin^2(2 theta) of the edge's direction in the MATERIAL frame:
   * zero along warp or weft, one at 45 degrees. Which axis is called warp
   * does not matter -- sin^2(2 theta) is symmetric about 45 degrees -- so
   * this cannot be got wrong by picking the wrong one.
   *
   * Two things follow from it, and both are needed. Softening the compliance
   * alone achieves nothing, because `_clampStrain` holds every edge at
   * `maxStrain` regardless of how compliant it is -- a 2 % hard limit on a
   * bias edge forbids the trellis whatever the stiffness says, which is how
   * an anisotropic solver can still behave isotropically.
   */
  _classifyGrain(o) {
    const M = this.asm.material;
    const f = o.biasCompliance ?? 1;
    // How far a bias edge must be free to stretch, DERIVED rather than given:
    // a trellis of `shearLockDeg` takes a cell's diagonals to
    // sqrt(1 +/- sin gamma), so that extension is what the shear needs, and
    // the ratio against the fabric's own grain limit is the factor. A 15
    // degree cotton against a 6.1 % grain limit gives 2.0, where this was
    // originally handed a flat 6. An explicit `biasStrainFactor` still wins,
    // for experiments.
    const lock = o.shearLockDeg ?? (FABRICS[o.fabric] || {}).shearLockDeg ?? null;
    const derived = lock
      ? (Math.sqrt(1 + Math.sin(lock * Math.PI / 180)) - 1) / Math.max(1e-6, this.maxStrain)
      : 1;
    const g = o.biasStrainFactor ?? Math.max(1, derived);
    this.biasStrainFactorUsed = g;
    this.shearLockDeg = lock;
    this.grainAware = !!M && f !== 1;
    for (const c of this.stretch) {
      let bias = 0;
      if (M && M[c.a] && M[c.b]) {
        const du = M[c.b][0] - M[c.a][0], dv = M[c.b][1] - M[c.a][1];
        const l2 = du * du + dv * dv;
        if (l2 > 1e-12) {
          const s2 = (2 * du * dv) / l2;        // sin(2 theta)
          bias = s2 * s2;
        }
      }
      c.bias = bias;
      c.aMul = 1 + (f - 1) * bias;
      c.maxLen = c.rest * (1 + this.maxStrain * (1 + (g - 1) * bias));
    }
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
    const feeding = this._feedStitches(dt) > 0;
    const reach = this.maxSpeed() * dt + 0.1;
    if (this.collider) {
      for (let i = 0; i < this.asm.verts.length; i++) {
        this.nearBody[i] = this.invMass[i] !== 0
          && this.collider.near(this.asm.verts[i], o.collisionMargin + reach);
      }
    }
    if (o.selfCollision) {
      if (o.selfCollisionMode === 'slab') {
        this._findSelfPrims(o.clothThickness + reach);
        this._pruneSelfPrims(o.clothThickness + 2 * reach);
      } else this._findPairs(o.clothThickness + reach);
    }
    this._findEdgeContacts(o.collisionMargin + reach);
    for (let s = 0; s < n; s++) this._substep(h);
    // Quasi-static sewing: the cloth follows the feed and carries no momentum
    // of its own.
    //
    // This has to happen AFTER the substeps, not before. XPBD derives velocity
    // from the positions it just projected (`(x - prev)/h`, step 7 of
    // _substep), so damping the stored velocity on the way in is immediately
    // overwritten and achieves nothing -- measured, vertices still reached 26
    // cm/s on a 4 cm/s feed. Damping what came out is what actually stops the
    // motion being carried into the next frame.
    if (feeding) {
      const k = this.opts.sewDamping;
      for (const v of this.vel) { v[0] *= k; v[1] *= k; v[2] *= k; }
    }
    this.time += dt;
    this.steps++;
    this._trackMotion();
    return this;
  }

  /**
   * What happened DURING the fall, not just where it ended up.
   *
   * A reported bounce could not be checked against anything: `drop-settled`
   * samples at a phase boundary, so its `maxSpeedCmPerSec` is the speed at
   * REST, and the impact had been over for seconds. `cloth.js` already
   * contained the measurement that matters -- "undamped, the centre of mass
   * rebounded 0.3 cm and individual vertices reached 225 cm/s, twice the
   * 108 cm/s impact speed" -- as a comment, with no instrument that
   * reproduces it.
   *
   * Once per frame, not per substep: the peak and the centre of mass are both
   * O(N) and the question is about frames.
   *
   * A bounce is a trough in the centre of mass followed by a crest: falling,
   * then rising, then falling again. `reboundCm` is the largest such rise.
   * The threshold exists because numerical jitter crosses zero constantly and
   * a real rebound does not have to be large to be visible -- 0.05 cm is half
   * a cloth thickness.
   */
  _trackMotion() {
    const m = this._motion || (this._motion = {
      peakSpeed: 0, impactSpeed: 0, touched: false,
      bounces: 0, reboundCm: 0, trough: null, prev: null, rising: false,
    });
    const sp = this.maxSpeed();
    if (sp > m.peakSpeed) m.peakSpeed = sp;
    // the speed it was doing when it first met something is the impact speed
    if (!m.touched) {
      let any = 0;
      for (const c of this.contact) if (c) { any = 1; break; }
      if (any) { m.touched = true; m.impactSpeed = m.peakSpeed; }
    }
    let com = 0, mass = 0;
    const V = this.asm.verts;
    for (let i = 0; i < V.length; i++) { com += V[i][1] * this.mass[i]; mass += this.mass[i]; }
    com /= Math.max(1e-9, mass);
    if (m.prev !== null) {
      const up = com > m.prev + 1e-6, down = com < m.prev - 1e-6;
      if (!m.rising && up) { m.rising = true; m.trough = m.prev; }
      else if (m.rising && down) {
        m.rising = false;
        const rise = m.prev - (m.trough ?? m.prev);
        if (rise > 0.05) {
          m.bounces++;
          if (rise > m.reboundCm) m.reboundCm = rise;
        }
      }
    }
    m.prev = com;
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
    this.hingeLambda.fill(0);          // XPBD: one multiplier per substep
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
        const dl = -(L - c.rest) / (wsum + (c.aMul > 1 ? aS * c.aMul : aS));
        const s = dl / L;
        a[0] -= dx * s * wa; a[1] -= dy * s * wa; a[2] -= dz * s * wa;
        b[0] += dx * s * wb; b[1] += dy * s * wb; b[2] += dz * s * wb;
      }
      // Bending in the same sweep as stretch and contact, for the reason the
      // comment above gives: a pass that runs after the contact projection
      // pushes cloth into the body and has its answer undone a substep later,
      // and that lag is an oscillator. Measured on the yoke disc, with the
      // bending pass outside this loop the drop never settled -- it plateaued
      // at 0.99 cm/s for twenty seconds, a limit cycle rather than a drape.
      if (sweep < o.bendSweeps) this._solveHinges(h2);
      this._projectContacts(margin, maxPush, h);
      if (this.stitchStrength > 0) this._solveStitches(h2);
    }
    if (this.stitchStrength > 0) this._readStitchTensions(h2);

    // ---- 4. bending, as the dihedral angle across each interior edge, whose
    // rest value is flat because the pattern is flat. Softer than stretch by
    // orders of magnitude, which is the whole character of cloth: it folds
    // rather than stretching, and that is why a disc can drape at all.
    for (let sweep = o.stretchSweeps; sweep < o.bendSweeps; sweep++) {
      this._solveHinges(h2);           // if more bending sweeps were asked for
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
    if (o.selfCollision) {
      if (o.selfCollisionMode === 'slab') this._solveSelfPrims();
      else this._solvePairs();
    }

    // ---- 6. a last contact projection, so the substep ends outside the body
    // whatever the bending and self-collision passes did.
    this._projectContacts(margin, maxPush, h);
    // Edge midpoints once per substep, not inside every sweep. The vertex
    // contact has to be in the sweep because it argues with the seams and the
    // two must agree within the substep; the edge pass has nothing to argue
    // with -- it only lifts a triangle whose corners are already outside. Run
    // nine times a substep it injects nine times the motion, and the drop test
    // stopped settling (3 cm/s rms after 9 s against 0.2 for settled cloth).
    this._projectEdgeContacts(margin, maxPush);

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
      // How far the strain limiter still was from its own limit when it
      // stopped. Reported because it is cheap and because its ANSWER was
      // informative: it is zero at every substep count tested, so the
      // limiter always converges -- which rules it out as the mechanism
      // behind an under-resolved step, and the obvious diagnostic with it.
      // See `_grainOverLimit` for the signal that does work.
      this.strainSweeps = 0;
      let worst = 0;
      for (let k = 0; k < o.strainPasses; k++) {
        this.strainSweeps++;
        worst = this._clampStrain();
        if (worst <= o.strainTol) break;
      }
      this.strainResidual = worst;
      if (worst > o.strainTol) this.strainUnconverged = (this.strainUnconverged || 0) + 1;
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
  /**
   * Which edge midpoints are against the body, and which way is out.
   *
   * Once per FRAME, not per substep, and that is the difference between this
   * costing something and costing too much: there are about three times as
   * many edges as vertices, and every contact query walks the limb capsules as
   * well as the level set, so searching them ten times a frame made the whole
   * solver 2.3x slower. A vertex cannot travel further than maxSpeed*dt within
   * a frame, so widening the search skin by that much makes the cached planes
   * conservative for the whole frame -- exactly the argument the vertex broad
   * phase and the self-collision hash already use.
   */
  _findEdgeContacts(skin) {
    this.edgeHits.length = 0;
    if (!this.collider || !this.opts.edgeCollision) return;
    const V = this.asm.verts, W = this.invMass;
    for (let k = 0; k < this.stretch.length; k++) {
      const e = this.stretch[k];
      this.edgeContact[k] = false;
      if (!W[e.a] && !W[e.b]) continue;
      // an edge is worth asking about only if one of its ends is near the body
      if (!this.nearBody[e.a] && !this.nearBody[e.b]) continue;
      const a = V[e.a], b = V[e.b];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const c = this.collider.query(m, skin);
      if (!c) continue;
      this.edgeContact[k] = true;
      this.edgeQ[k][0] = c.point[0];
      this.edgeQ[k][1] = c.point[1];
      this.edgeQ[k][2] = c.point[2];
      this.edgeN[k][0] = c.normal[0];
      this.edgeN[k][1] = c.normal[1];
      this.edgeN[k][2] = c.normal[2];
      this.edgeHits.push(k);
      // `skin` only widens the SEARCH. `c.point` is the point on the body
      // itself, so the projection below measures against the real surface and
      // holds the midpoint `collisionMargin` off it, exactly as it would have
      // with a tight search. Shifting the cached plane out by the extra skin
      // instead -- which is what the first version did -- asks the cloth to
      // stand off by a distance that grows with its own speed, and that is a
      // positive feedback loop: measured, it took the drape to 10 % stretch
      // and 4 cm of penetration, and the solve from 14 s to 211 s.
    }
  }

  /**
   * Lift the middles of the edges out of the body by moving their ends.
   *
   * The midpoint is the average of the endpoints, so displacing both by `d`
   * along the normal displaces the midpoint by `d` -- the correction is shared
   * rather than doubled. Mass weighting keeps that true when one end is
   * pinned: the free end takes the whole of it, and the midpoint still moves
   * by `d` rather than half of it.
   *
   * AVERAGED PER VERTEX, not accumulated, and that is not a refinement -- the
   * Gauss-Seidel version destabilised the whole solver. A vertex belongs to
   * about six edges, so applying each edge's push in turn moved it roughly
   * seven times as far as its own contact asked for. Measured: the drop test
   * stopped settling (0.89 cm/s rms after 9 s, against 0.2 for settled cloth),
   * a disc rebounded twice as far, and a skirt's folds came out 18.6 cm deep
   * instead of 24.8. Collecting the corrections and applying the mean puts the
   * vertex where the edges jointly ask for, which is what they mean.
   *
   * It deliberately does NOT mark the endpoints as being in contact. Contact
   * carries friction and contact damping (step 7), and those belong to a
   * vertex genuinely resting on the body, which the vertex pass already
   * detects. Adding them here changes the drape rather than the penetration.
   */
  _projectEdgeContacts(margin, maxPush) {
    if (!this.collider || !this.edgeHits.length) return;
    const V = this.asm.verts, W = this.invMass;
    const relax = this.opts.contactRelax;
    const dx = this._edgeDx, cnt = this._edgeCount;
    const touched = this._edgeTouched;
    touched.length = 0;

    for (let h = 0; h < this.edgeHits.length; h++) {
      const k = this.edgeHits[h];
      const e = this.stretch[k];
      const wa = W[e.a], wb = W[e.b], wsum = wa + wb;
      if (wsum <= 0) continue;
      const a = V[e.a], b = V[e.b];
      const q = this.edgeQ[k], n = this.edgeN[k];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
      const sgn = (mx - q[0]) * n[0] + (my - q[1]) * n[1] + (mz - q[2]) * n[2] - margin;
      if (sgn >= 0) continue;
      const d = Math.min(-sgn * relax, maxPush);
      const ka = 2 * wa / wsum, kb = 2 * wb / wsum;
      for (const [i, kk] of [[e.a, ka], [e.b, kb]]) {
        if (!W[i]) continue;
        if (cnt[i] === 0) touched.push(i);
        cnt[i]++;
        dx[i * 3] += n[0] * d * kk;
        dx[i * 3 + 1] += n[1] * d * kk;
        dx[i * 3 + 2] += n[2] * d * kk;
      }
    }

    for (let t = 0; t < touched.length; t++) {
      const i = touched[t];
      const c = cnt[i];
      const p = V[i];
      let ex = dx[i * 3] / c, ey = dx[i * 3 + 1] / c, ez = dx[i * 3 + 2] / c;
      const m = Math.hypot(ex, ey, ez);
      if (m > maxPush) { const f = maxPush / m; ex *= f; ey *= f; ez *= f; }
      p[0] += ex; p[1] += ey; p[2] += ez;
      cnt[i] = 0;
      dx[i * 3] = 0; dx[i * 3 + 1] = 0; dx[i * 3 + 2] = 0;
    }
  }

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
   * One Gauss-Seidel pass of the bending constraints.
   *
   * C = theta, the signed angle between the two faces, zero when flat. The
   * gradients are the discrete-shells ones: the face normal over the
   * triangle's height for each apex, and a weighted combination of the two
   * for the shared edge's ends. They are finite everywhere a triangle has
   * area -- in particular at theta = 0, where the textbook dihedral gradient
   * divides by sin(theta) and the solver comes apart -- and they sum to zero,
   * so the pass cannot translate the cloth.
   *
   * Written out rather than called through a vector library because this is
   * the inner loop: every interior edge of the garment, eight times a
   * substep, ten substeps a frame.
   */
  _solveHinges(h2) {
    const V = this.asm.verts;
    const W = this.invMass;
    const lam = this.hingeLambda;
    for (let k = 0; k < this.hinges.length; k++) {
      const g = this.hinges[k];
      const [ia, ib, i1, i2] = g.v;           // apex A, apex B, edge, edge
      const wa = W[ia], wb = W[ib], w1 = W[i1], w2 = W[i2];
      if (wa + wb + w1 + w2 <= 0) continue;
      const pa = V[ia], pb = V[ib], p1 = V[i1], p2 = V[i2];

      // the shared edge
      const ex = p2[0] - p1[0], ey = p2[1] - p1[1], ez = p2[2] - p1[2];
      const eLen = Math.hypot(ex, ey, ez);
      if (eLen < 1e-12) continue;
      const ux = ex / eLen, uy = ey / eLen, uz = ez / eLen;

      // face normals, oriented so that a FLAT pair gives theta = 0
      const a1x = pa[0] - p1[0], a1y = pa[1] - p1[1], a1z = pa[2] - p1[2];
      const b1x = pb[0] - p1[0], b1y = pb[1] - p1[1], b1z = pb[2] - p1[2];
      let nax = ey * a1z - ez * a1y;
      let nay = ez * a1x - ex * a1z;
      let naz = ex * a1y - ey * a1x;
      let nbx = b1y * ez - b1z * ey;
      let nby = b1z * ex - b1x * ez;
      let nbz = b1x * ey - b1y * ex;
      const naLen = Math.hypot(nax, nay, naz);
      const nbLen = Math.hypot(nbx, nby, nbz);
      if (naLen < 1e-12 || nbLen < 1e-12) continue;      // a sliver
      // the heights of the two triangles over the shared edge, which is what
      // turns a normal into an angle gradient
      const hA = naLen / eLen;
      const hB = nbLen / eLen;
      nax /= naLen; nay /= naLen; naz /= naLen;
      nbx /= nbLen; nby /= nbLen; nbz /= nbLen;

      const cosT = nax * nbx + nay * nby + naz * nbz;
      // sin from the component of n_a x n_b along the edge, which carries the
      // SIGN of the fold -- a hinge that folds the other way must be pushed
      // back the other way
      const cx = nay * nbz - naz * nby;
      const cy = naz * nbx - nax * nbz;
      const cz = nax * nby - nay * nbx;
      const sinT = cx * ux + cy * uy + cz * uz;
      const C = Math.atan2(sinT, cosT);                   // rest angle is 0
      if (C === 0) continue;

      // where each apex projects onto the shared edge, 0 at p1 and 1 at p2
      const ta = ((pa[0] - p1[0]) * ux + (pa[1] - p1[1]) * uy + (pa[2] - p1[2]) * uz) / eLen;
      const tb = ((pb[0] - p1[0]) * ux + (pb[1] - p1[1]) * uy + (pb[2] - p1[2]) * uz) / eLen;

      // dtheta/dp. The sign is the one finite differences give: the test
      // suite checks these gradients against a numerical derivative, because
      // a sign flip here is invisible in the algebra and unmistakable in the
      // cloth -- it drives every fold further open instead of closing it.
      const gax = -nax / hA, gay = -nay / hA, gaz = -naz / hA;
      const gbx = -nbx / hB, gby = -nby / hB, gbz = -nbz / hB;
      const g1x = -(1 - ta) * gax - (1 - tb) * gbx;
      const g1y = -(1 - ta) * gay - (1 - tb) * gby;
      const g1z = -(1 - ta) * gaz - (1 - tb) * gbz;
      const g2x = -ta * gax - tb * gbx;
      const g2y = -ta * gay - tb * gby;
      const g2z = -ta * gaz - tb * gbz;

      const sum = wa * (gax * gax + gay * gay + gaz * gaz)
                + wb * (gbx * gbx + gby * gby + gbz * gbz)
                + w1 * (g1x * g1x + g1y * g1y + g1z * g1z)
                + w2 * (g2x * g2x + g2y * g2y + g2z * g2z);
      if (sum < 1e-20) continue;

      // XPBD, with the multiplier accumulated across this substep's sweeps.
      // Without the accumulation each sweep re-applies the whole correction
      // and the pass feeds energy in -- measured as a cantilever that never
      // stopped moving.
      const a2 = g.alpha / h2;
      const dLam = (-C - a2 * lam[k]) / (sum + a2);
      lam[k] += dLam;
      pa[0] += wa * gax * dLam; pa[1] += wa * gay * dLam; pa[2] += wa * gaz * dLam;
      pb[0] += wb * gbx * dLam; pb[1] += wb * gby * dLam; pb[2] += wb * gbz * dLam;
      p1[0] += w1 * g1x * dLam; p1[1] += w1 * g1y * dLam; p1[2] += w1 * g1z * dLam;
      p2[0] += w2 * g2x * dLam; p2[1] += w2 * g2y * dLam; p2[2] += w2 * g2z * dLam;
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
   * The constraint is to the stitch's own `rest` length, not to zero. `rest`
   * starts at the gap the seam was armed with and is fed down at
   * `sewSpeedCmPerSec` (see `_feedStitches`), so the cloth is drawn together at
   * a constant speed. Pulling straight to zero instead applies a constant
   * force over the whole 20-40 cm of travel, which accelerates the pieces the
   * entire way -- a catapult rather than a seam.
   *
   * A thread pushes nothing, so the constraint is one-sided: slack does
   * nothing, and only `L > rest` pulls.
   *
   * `stitchStrength` (0..1) and each stitch's own `strength` scale the force
   * LIMIT, so a seam already sewn can hold at full strength while another is
   * still being worked on.
   */
  _solveStitches(h2) {
    const V = this.asm.verts, W = this.invMass;
    const k = Math.min(1, Math.max(0, this.stitchStrength));
    // gram-force -> g*cm/s^2 -> multiplier units (lambda = force * h^2)
    const lamBase = this.maxTensionGf * G * h2 * k;
    const aT = this.alphaStitch / h2;
    for (const s of this.stitches) {
      if (!s.active || s.rest === null) continue;
      const lamMax = lamBase * Math.min(1, Math.max(0, s.strength));
      if (lamMax <= 0) continue;
      const wa = W[s.a], wb = W[s.b], wsum = wa + wb;
      if (wsum <= 0) continue;
      const a = V[s.a], b = V[s.b];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-12) continue;
      const C = L - s.rest;
      if (C <= 0) continue;            // a thread pushes nothing
      let dl = -C / (wsum + aT);
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
   * Take up `dt` worth of each feeding seam's remaining gap.
   *
   * Once per frame rather than per substep: this is a kinematic target moving
   * at a known speed, and advancing it ten times inside one frame would make
   * the feed rate depend on the substep count.
   *
   * The feed HOLDS whenever the cloth has fallen more than `sewSlackCm`
   * behind, and this is a rate limiter in both directions, which matters:
   *
   *   it never advances faster than `step`, so the closing speed is capped at
   *   the commanded rate however eager the cloth is. The first version clamped
   *   `rest` to `gap + slack` instead, which LOWERS it whenever the gap is
   *   already small -- so the feed could jump ahead of itself and the seam
   *   shut at 19 cm/s on a 4 cm/s command, which is the lurch this is all
   *   supposed to remove.
   *
   *   and it never gets further than `slack` ahead of the cloth, so a seam
   *   jammed against the body cannot accumulate commanded closure it has no
   *   way to deliver and then snap shut when it comes free.
   */
  _feedStitches(dt) {
    const step = this.opts.sewSpeedCmPerSec * dt;
    const slack = this.opts.sewSlackCm;
    let feeding = 0;
    for (const s of this.stitches) {
      if (!s.active || !s.feeding || s.rest === null) continue;
      if (s.rest <= 0) { s.rest = 0; s.feeding = false; continue; }
      feeding++;
      // has the cloth kept up? if not, wait for it rather than demanding more
      if (this.stitchGap(s) - s.rest > slack) { s.waiting = true; continue; }
      s.waiting = false;
      s.rest = Math.max(0, s.rest - step);
    }
    return feeding;
  }

  /**
   * Put the thread in: arm these stitches at the gap they are at now, and
   * start taking it up. Seams already armed keep whatever they have closed and
   * carry on from there, so stopping and restarting is seamless.
   */
  startSewing(pred = () => true) {
    let n = 0;
    for (const s of this.stitches) {
      if (!pred(s)) continue;
      if (s.rest === null) s.rest = this.stitchGap(s);
      s.active = true;
      s.feeding = true;
      n++;
    }
    if (n && this.stitchStrength <= 0) this.stitchStrength = 1;
    return n;
  }

  /**
   * Stop feeding, leaving every seam exactly where it has got to. The threads
   * stay in and keep holding, which is what a half-sewn seam is.
   *
   * Two things have to happen for "where it has got to" to be true, and
   * leaving either out means the seam carries on closing after you have
   * stopped it:
   *
   *   the thread is tied off at the gap actually ACHIEVED, not at the gap last
   *   commanded. Those differ by however far the cloth was lagging, and
   *   holding at the commanded one leaves the seam free to spring back open to
   *   it later.
   *
   *   and the cloth is brought to rest. It was travelling at the feed rate,
   *   and with nothing to stop it, it coasts: measured, a seam stopped at 9.8
   *   cm drifted on to 1.6 cm over the next three seconds. Putting the needle
   *   down means the cloth stops too.
   */
  stopSewing() {
    let n = 0;
    for (const s of this.stitches) {
      if (!s.feeding) continue;
      s.feeding = false;
      s.rest = Math.min(s.rest, this.stitchGap(s));
      n++;
    }
    if (n) for (const v of this.vel) { v[0] = 0; v[1] = 0; v[2] = 0; }
    return n;
  }

  /**
   * Let the thread out to wherever the cloth now is, without unthreading it.
   *
   * This is what a piece being MOVED after it has been sewn needs. The thread
   * is holding at the gap the seam reached; move the piece and the gap is
   * suddenly large again, so resuming would hit the seam with the full force
   * limit at once and snap it back -- the exact lurch the feed exists to
   * prevent. Re-tying leaves the seam needing to be sewn again from where it
   * now is, which is both gentler and a truer account of what was done to it.
   */
  retieStitches(pred = () => true) {
    let n = 0;
    for (const s of this.stitches) {
      if (!s.active || s.rest === null || !pred(s)) continue;
      const gap = this.stitchGap(s);
      if (gap > s.rest) { s.rest = gap; s.feeding = false; n++; }
    }
    return n;
  }

  /** How much gap is still waiting to be taken up, cm, over all seams. */
  remainingFeedCm() {
    let m = 0;
    for (const s of this.stitches) {
      if (s.active && s.rest !== null && s.rest > m) m = s.rest;
    }
    return m;
  }

  /** Is anything still being sewn? */
  isSewing() {
    return this.stitches.some((s) => s.feeding);
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
    const lamBase = this.maxTensionGf * G * h2 * Math.min(1, Math.max(0, this.stitchStrength));
    for (const s of this.stitches) {
      if (!s.active) { s.tensionGf = 0; s.lambda = 0; s.saturated = false; continue; }
      const lamMax = lamBase * Math.min(1, Math.max(0, s.strength));
      s.tensionGf = Math.abs(s.lambda) / (h2 * G);
      if (s.tensionGf > s.peakGf) s.peakGf = s.tensionGf;
      s.saturated = lamMax > 0 && Math.abs(s.lambda) >= lamMax * 0.995;
      s.lambda = 0;
    }
  }

  /**
   * Set each stitch's share of the force limit. The caller ramps a new pass
   * while leaving the seams it has already sewn at full strength.
   */
  setStitchStrength(fn) {
    for (const s of this.stitches) s.strength = fn(s);
    return this;
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
      if (pred(s)) {
        // arming at the CURRENT gap, so a seam resumes from where it was left
        // rather than starting over
        if (s.rest === null) s.rest = this.stitchGap(s);
        s.active = true;
        n++;
      } else {
        s.active = false;
        s.rest = null;
        s.lambda = 0; s.tensionGf = 0; s.saturated = false; s.feeding = false;
      }
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
        : strained >= this.maxStrain * 0.95 ? 'the cloth is at its limit'
          : 'it has stopped closing';
      // How much of the seam has not been commanded closed yet. With the feed
      // driving the rest length down at a known rate, this is what separates
      // "not finished sewing" from "sewn as far as it will go" -- a
      // distinction the old force-to-zero model could only guess at from the
      // tension, and guessed wrong on a seam that had simply not had time.
      const armed = list.filter((x) => x.rest !== null);
      const toGo = armed.length ? Math.max(...armed.map((x) => x.rest)) : null;
      const feeding = list.filter((x) => x.feeding).length;
      // Feeding, but held: the machine is still running and the cloth is not
      // coming. A thread that cannot drag its seam together stalls the feed
      // here for ever, and reporting that as "being sewn" hides exactly the
      // failure the force limit exists to show. Found when the bending model
      // started working: stiffer cloth needs more thread tension to pull
      // together, so a seam that used to finish now stalls at 2.4 cm to go.
      const waiting = list.filter((x) => x.feeding && x.waiting).length;
      // ARREARS: how far the cloth is behind where the thread is pulling it.
      // A seam genuinely being sewn has `maxGap` close to `toGo`, because the
      // cloth follows the feed. A seam that has lost has the feed almost
      // finished and the gap still wide open.
      //
      // This second test was added 2026-10-18, when BEND_SCALE came down from
      // 30 to 1.8 and the `waiting` count stopped catching the case it was
      // written for. Measured on the gate's own weak-thread seam: 11
      // stitches, **8 at the thread's limit**, feed down to 0.49 cm to go,
      // and an actual gap of 2.16 cm -- the cloth 1.7 cm behind and not
      // moving at fallSeconds 1, 3 or 6. Only 2 of 11 were flagged `waiting`,
      // against a threshold of half, so the seam reported "being sewn,
      // 0.5 cm to go" for ever. That is the exact failure the comment above
      // says this must not hide, and `waiting` was always a proxy for it.
      const arrears = toGo === null ? 0 : maxGap - toGo;
      const stalled = sat > 0
        && (waiting > list.length * 0.5
          || (sat > list.length * 0.5 && arrears > closedCm));
      rows.push({
        seam: id,
        pieces: list[0].pa !== undefined ? `${list[0].pa} + ${list[0].pb}` : '-',
        stitches: list.length,
        sewing: !armed.length ? 'no'
          : stalled ? 'stalled'
            : feeding ? 'now' : (toGo > closedCm ? 'paused' : 'done'),
        closedPct: +pct.toFixed(0),
        toGoCm: toGo === null ? '-' : +toGo.toFixed(2),
        maxGapCm: +maxGap.toFixed(2),
        meanTensionGf: +meanT.toFixed(0),
        peakTensionGf: +Math.max(...list.map((s) => s.peakGf)).toFixed(0),
        clothStrainPct: +(100 * strained).toFixed(1),
        atTheLimit: sat,
        // "Forced" is a statement about THIS seam's thread, so it needs the
        // thread to be working. Cloth near its strain limit is a fact about
        // the garment -- a short piece elsewhere distorts the whole ring --
        // and a seam that closed at no tension at all did not force anything,
        // whatever its neighbours are doing.
        waiting,
        verdict: !armed.length ? 'not sewn'
          : stalled ? `short by ${maxGap.toFixed(1)} cm (${why})`
            : toGo > closedCm
              ? (feeding ? `being sewn, ${toGo.toFixed(1)} cm to go`
                : `half sewn, ${toGo.toFixed(1)} cm to go`)
              : maxGap <= closedCm
                ? (sat > list.length * 0.1
                  || (pulling && strained >= this.maxStrain * 0.95)
                  ? 'closed, but forced -- it will pucker' : 'closed')
                : `short by ${maxGap.toFixed(1)} cm (${why})`,
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
      const max = c.maxLen ?? c.rest * lim;
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

  /**
   * The ring neighbourhood, to `depth` rings, as a set per vertex.
   *
   * Self-contact between elements that share mesh neighbours is not contact,
   * it is the sheet being asked to hold itself apart, and enforcing it
   * inflates the cloth into a balloon.
   */
  _buildRings(depth) {
    if (this.ringCSR && this.ringCSRDepth === depth) return this.ringCSR;
    const V = this.asm.verts;
    const adj = V.map(() => new Set());
    for (const c of this.stretch) { adj[c.a].add(c.b); adj[c.b].add(c.a); }
    // Flattened to CSR -- offsets plus a single items array -- because the
    // per-vertex Set this replaced was consulted once per CANDIDATE PAIR, and
    // at 2560 triangles that is 100k hash lookups a frame inside the function
    // the profiler put 37 % of the run in. A stamp compare against a typed
    // array is an integer load; Set.has is not.
    const off = new Int32Array(V.length + 1);
    for (let i = 0; i < V.length; i++) {
      const seen = new Set([i]);
      let front = [i];
      for (let d = 0; d < depth; d++) {
        const next = [];
        for (const u of front) for (const w of adj[u]) if (!seen.has(w)) { seen.add(w); next.push(w); }
        front = next;
      }
      off[i + 1] = off[i] + seen.size;
      adj[i] = seen;                   // reuse the slot to hold the closure
    }
    const items = new Int32Array(off[V.length]);
    for (let i = 0; i < V.length; i++) {
      let q = off[i];
      for (const w of adj[i]) items[q++] = w;
    }
    this.ringCSR = { off, items };
    this.ringCSRDepth = depth;
    this.ringStamp = new Int32Array(V.length).fill(-1);
    return this.ringCSR;
  }

  /**
   * A bounded lattice over the cloth, sized so a cell index is arithmetic.
   *
   * Not a hash of string keys: that allocated a string per element per cell
   * per frame -- about 5k of them, with the Map churn and the garbage
   * collector behind it -- and the profiler put 27 % of the run in here.
   * An integer lattice needs no keys at all, and the cell count is capped so
   * a blown-up mesh widens the cells instead of allocating a grid the size of
   * its own explosion.
   */
  _selfGrid(margin) {
    const V = this.asm.verts;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < V.length; i++) {
      const p = V[i];
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null;
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
    }
    // Half a mean edge, floored at twice the thickness. Measured on the
    // accordion heap with the counting-sort grid: 2.49 cm (one mean edge, the
    // old default) took 23.9 s, 1.5 took 18.9, 1.0 took 16.4 and 0.6 turned
    // back up to 20.8 as each element started landing in more cells than it
    // saved in comparisons. Cloth is a thin sheet, so a cell sized to its
    // edge length cannot separate the layers in the one direction they are
    // stacked in -- eight of them shared a single 2.49 cm cell.
    // Measured both ways, and the optimum is NOT proportional to the element
    // size -- it tracks how densely the cloth is packed, which is a property
    // of the heap and not of the mesh. On the accordion: at 2 cm triangles
    // 1.0 cm was best (16.4 s against 23.9 at 2.49), while at 1 cm triangles
    // bigger cells won (68.5 s at 0.80, 56.2 at 1.70, 55.7 at 2.30) because
    // insertion multiplicity beat candidate count. Two scenarios is not a law,
    // the curve is flat over most of the range, and the whole remaining knob
    // is worth about 1.2x -- so this is a floor that avoids the bad end of
    // both, not a fit. Use `--cell` (tools/profile.mjs) per scenario.
    let c = this.opts.selfCell || Math.max(1.2, this._meanEdge() * 0.5);
    let nx, ny, nz, pad;
    for (;;) {
      pad = margin + c;
      nx = Math.max(1, Math.ceil((x1 - x0 + 2 * pad) / c));
      ny = Math.max(1, Math.ceil((y1 - y0 + 2 * pad) / c));
      nz = Math.max(1, Math.ceil((z1 - z0 + 2 * pad) / c));
      if (nx * ny * nz <= (1 << 20)) break;
      c *= 1.5;
    }
    // what the grid ACTUALLY used, for the profiler to report: the asked-for
    // cell and the used one differ whenever the cap widens it
    this.selfCellUsed = c;
    this.selfCells = nx * ny * nz;
    return { c, ox: x0 - pad, oy: y0 - pad, oz: z0 - pad, nx, ny, nz, nCells: nx * ny * nz };
  }

  /**
   * Counting sort of elements into cells: two passes, typed arrays, no
   * allocation after the first frame.
   *
   * `boxes` is 6 floats per element. Each element goes into every cell its
   * box covers, which is what keeps the cell size a performance choice rather
   * than a correctness one -- a triangle wider than a cell is still found.
   */
  _bucketise(role, boxes, n, G) {
    const bp = this._bp || (this._bp = {});
    const slot = bp[role] || (bp[role] = {});
    const { c, ox, oy, oz, nx, ny, nz, nCells } = G;
    let start = slot.start;
    if (!start || start.length < nCells + 1) start = slot.start = new Int32Array(nCells + 1);
    else start.fill(0, 0, nCells + 1);
    const ranges = slot.ranges && slot.ranges.length >= n * 6
      ? slot.ranges : (slot.ranges = new Int32Array(Math.max(6, n * 6)));
    let total = 0;
    for (let i = 0; i < n; i++) {
      const b = i * 6, q = i * 6;
      const ax = Math.min(nx - 1, Math.max(0, ((boxes[b] - ox) / c) | 0));
      const bx = Math.min(nx - 1, Math.max(0, ((boxes[b + 3] - ox) / c) | 0));
      const ay = Math.min(ny - 1, Math.max(0, ((boxes[b + 1] - oy) / c) | 0));
      const by = Math.min(ny - 1, Math.max(0, ((boxes[b + 4] - oy) / c) | 0));
      const az = Math.min(nz - 1, Math.max(0, ((boxes[b + 2] - oz) / c) | 0));
      const bz = Math.min(nz - 1, Math.max(0, ((boxes[b + 5] - oz) / c) | 0));
      ranges[q] = ax; ranges[q + 1] = bx; ranges[q + 2] = ay;
      ranges[q + 3] = by; ranges[q + 4] = az; ranges[q + 5] = bz;
      for (let z = az; z <= bz; z++) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
        start[(x + nx * (y + ny * z)) + 1]++; total++;
      }
    }
    for (let k = 0; k < nCells; k++) start[k + 1] += start[k];
    let items = slot.items;
    if (!items || items.length < total) items = slot.items = new Int32Array(Math.max(16, total * 2));
    let cur = slot.cur;
    if (!cur || cur.length < nCells + 1) cur = slot.cur = new Int32Array(nCells + 1);
    cur.set(start.subarray(0, nCells + 1));
    for (let i = 0; i < n; i++) {
      const q = i * 6;
      for (let z = ranges[q + 4]; z <= ranges[q + 5]; z++) {
        for (let y = ranges[q + 2]; y <= ranges[q + 3]; y++) {
          for (let x = ranges[q]; x <= ranges[q + 1]; x++) {
            items[cur[x + nx * (y + ny * z)]++] = i;
          }
        }
      }
    }
    slot.n = n;
    return slot;
  }

  _findSelfPrims(margin) {
    const V = this.asm.verts, tris = this.asm.tiles, st = this.stretch;
    const { off: rOff, items: rItems } = this._buildRings(this.opts.selfRingExclude);
    const stamp = this.ringStamp;
    const vt = this.vtPairs; vt.length = 0;
    const ee = this.eePairs; ee.length = 0;
    if (!V.length || !tris.length) return;
    const G = this._selfGrid(margin);
    if (!G) return;
    const { nx, ny, nz, c, ox, oy, oz } = G;

    // ---- element boxes, expanded by the margin
    const bx = this._bp && this._bp.triBox && this._bp.triBox.length >= tris.length * 6
      ? this._bp.triBox : ((this._bp || (this._bp = {})).triBox = new Float64Array(tris.length * 6));
    for (let t = 0; t < tris.length; t++) {
      const v = tris[t].v, a = V[v[0]], b = V[v[1]], d = V[v[2]], o = t * 6;
      bx[o] = Math.min(a[0], b[0], d[0]) - margin;
      bx[o + 1] = Math.min(a[1], b[1], d[1]) - margin;
      bx[o + 2] = Math.min(a[2], b[2], d[2]) - margin;
      bx[o + 3] = Math.max(a[0], b[0], d[0]) + margin;
      bx[o + 4] = Math.max(a[1], b[1], d[1]) + margin;
      bx[o + 5] = Math.max(a[2], b[2], d[2]) + margin;
    }
    const triG = this._bucketise('tri', bx, tris.length, G);

    // ---- vertex against triangle: one cell lookup per vertex, because a
    // triangle sits in every cell its own box covers
    for (let i = 0; i < V.length; i++) {
      const p = V[i];
      const cx = Math.min(nx - 1, Math.max(0, ((p[0] - ox) / c) | 0));
      const cy = Math.min(ny - 1, Math.max(0, ((p[1] - oy) / c) | 0));
      const cz = Math.min(nz - 1, Math.max(0, ((p[2] - oz) / c) | 0));
      const k = cx + nx * (cy + ny * cz);
      // stamp this vertex's ring, then exclude by integer compare
      for (let q = rOff[i]; q < rOff[i + 1]; q++) stamp[rItems[q]] = i;
      for (let q = triG.start[k]; q < triG.start[k + 1]; q++) {
        const t = triG.items[q];
        const v = tris[t].v;
        if (stamp[v[0]] === i || stamp[v[1]] === i || stamp[v[2]] === i) continue;
        vt.push(i, t);
      }
    }

    // ---- edge against edge, off the EDGES' own grid.
    //
    // This used to reach edges through triangles -- edge, to cells, to the
    // triangles there, to each triangle's three edges -- which produced every
    // pair up to three times over and then de-duplicated 116k of them through
    // a Set of boxed integers. Hashing the edges themselves removes the
    // factor of three and the Set; the `mark` stamp removes what is left,
    // since a pair found in two shared cells is caught by an integer compare
    // rather than a hash insert.
    if (!st.length) return;
    const ebx = this._bp.edgeBox && this._bp.edgeBox.length >= st.length * 6
      ? this._bp.edgeBox : (this._bp.edgeBox = new Float64Array(st.length * 6));
    for (let k = 0; k < st.length; k++) {
      const a = V[st[k].a], b = V[st[k].b], o = k * 6;
      ebx[o] = Math.min(a[0], b[0]) - margin;
      ebx[o + 1] = Math.min(a[1], b[1]) - margin;
      ebx[o + 2] = Math.min(a[2], b[2]) - margin;
      ebx[o + 3] = Math.max(a[0], b[0]) + margin;
      ebx[o + 4] = Math.max(a[1], b[1]) + margin;
      ebx[o + 5] = Math.max(a[2], b[2]) + margin;
    }
    const edgeG = this._bucketise('edge', ebx, st.length, G);
    let mark = this._bp.mark;
    if (!mark || mark.length < st.length) mark = this._bp.mark = new Int32Array(st.length).fill(-1);
    const R = edgeG.ranges;
    // the edge pass stamps with a value that cannot collide with the vertex
    // pass above
    const base = V.length + 1;
    for (let k = 0; k < st.length; k++) {
      const q = k * 6, ca = st[k].a, cb = st[k].b;
      const sk = base + k;
      for (let z = rOff[ca]; z < rOff[ca + 1]; z++) stamp[rItems[z]] = sk;
      for (let z = rOff[cb]; z < rOff[cb + 1]; z++) stamp[rItems[z]] = sk;
      for (let z = R[q + 4]; z <= R[q + 5]; z++) {
        for (let y = R[q + 2]; y <= R[q + 3]; y++) {
          for (let x = R[q]; x <= R[q + 1]; x++) {
            const cellK = x + nx * (y + ny * z);
            for (let j = edgeG.start[cellK]; j < edgeG.start[cellK + 1]; j++) {
              const m = edgeG.items[j];
              if (m <= k || mark[m] === k) continue;
              mark[m] = k;
              const d = st[m];
              if (stamp[d.a] === sk || stamp[d.b] === sk) continue;
              ee.push(k, m);
            }
          }
        }
      }
    }
  }

  /**
   * Throw away the candidates that are not actually near, once per frame.
   *
   * The broad phase answers with BOX overlap, which for 2 cm elements is a
   * far looser question than "are these within a thickness": two edges whose
   * expanded boxes touch can be a whole element apart. Those pairs were then
   * re-tested every substep -- ten times a frame, forty million closest-point
   * calls on the accordion heap, 36 % of the run. One pass of real distances
   * here replaces ten passes there.
   *
   * The threshold carries twice `reach` because both elements may be moving
   * toward each other, where the box expansion assumed one of them.
   */
  _pruneSelfPrims(near) {
    const V = this.asm.verts, tris = this.asm.tiles, st = this.stretch;
    const n2 = near * near;
    const vt = this.vtPairs;
    let w = 0;
    for (let k = 0; k < vt.length; k += 2) {
      const i = vt[k], t = vt[k + 1];
      const v = tris[t].v, p = V[i];
      const bary = closestOnTri(p, V[v[0]], V[v[1]], V[v[2]]);
      const dx = p[0] - (bary[0] * V[v[0]][0] + bary[1] * V[v[1]][0] + bary[2] * V[v[2]][0]);
      const dy = p[1] - (bary[0] * V[v[0]][1] + bary[1] * V[v[1]][1] + bary[2] * V[v[2]][1]);
      const dz = p[2] - (bary[0] * V[v[0]][2] + bary[1] * V[v[1]][2] + bary[2] * V[v[2]][2]);
      if (dx * dx + dy * dy + dz * dz <= n2) { vt[w++] = i; vt[w++] = t; }
    }
    vt.length = w;

    const ee = this.eePairs;
    w = 0;
    for (let k = 0; k < ee.length; k += 2) {
      const c1 = st[ee[k]], c2 = st[ee[k + 1]];
      const p1 = V[c1.a], p2 = V[c1.b], q1 = V[c2.a], q2 = V[c2.b];
      const stp = closestSegs(p1, p2, q1, q2);
      const sp = stp[0], tq = stp[1];
      const dx = (p1[0] + (p2[0] - p1[0]) * sp) - (q1[0] + (q2[0] - q1[0]) * tq);
      const dy = (p1[1] + (p2[1] - p1[1]) * sp) - (q1[1] + (q2[1] - q1[1]) * tq);
      const dz = (p1[2] + (p2[2] - p1[2]) * sp) - (q1[2] + (q2[2] - q1[2]) * tq);
      if (dx * dx + dy * dy + dz * dz <= n2) { ee[w++] = ee[k]; ee[w++] = ee[k + 1]; }
    }
    ee.length = w;
  }

  /**
   * Hold the cloth's own surfaces `clothThickness` apart.
   *
   * The correction is shared over the primitive's vertices by their
   * barycentric / parametric weights, which is what makes this a constraint
   * on the SURFACE rather than on whichever vertex happened to be nearest,
   * and it is limited per substep for the reason `_projectContacts` gives: a
   * positional push is a velocity, and an unlimited one is an explosion.
   */
  _solveSelfPrims() {
    const V = this.asm.verts, W = this.invMass;
    const o = this.opts;
    const h = o.clothThickness;
    const maxPush = o.maxPushPerSubstepCm;
    const tris = this.asm.tiles;

    const vt = this.vtPairs;
    for (let k = 0; k < vt.length; k += 2) {
      const i = vt[k], t = vt[k + 1];
      const v = tris[vt[k + 1]].v;
      const p = V[i], a = V[v[0]], b = V[v[1]], c = V[v[2]];
      const bary = closestOnTri(p, a, b, c);
      const u = bary[0], bv = bary[1], w = bary[2];
      const cx = u * a[0] + bv * b[0] + w * c[0];
      const cy = u * a[1] + bv * b[1] + w * c[1];
      const cz = u * a[2] + bv * b[2] + w * c[2];
      let nx = p[0] - cx, ny = p[1] - cy, nz = p[2] - cz;
      let d = Math.hypot(nx, ny, nz);
      if (d >= h) continue;
      if (d < 1e-9) {
        // exactly on the triangle: push along its normal, the only direction
        // that is defined there
        const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
        const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
        nx = e1y * e2z - e1z * e2y; ny = e1z * e2x - e1x * e2z; nz = e1x * e2y - e1y * e2x;
        d = Math.hypot(nx, ny, nz);
        if (d < 1e-12) continue;
      }
      nx /= d; ny /= d; nz /= d;
      const wsum = W[i] + u * u * W[v[0]] + bv * bv * W[v[1]] + w * w * W[v[2]];
      if (wsum <= 0) continue;
      const lam = Math.min((h - d) / wsum, maxPush / Math.max(1e-9, wsum));
      p[0] += nx * lam * W[i]; p[1] += ny * lam * W[i]; p[2] += nz * lam * W[i];
      // unrolled: the array-of-pairs this replaced allocated two arrays per
      // contact per substep
      const g0 = lam * u * W[v[0]], g1 = lam * bv * W[v[1]], g2 = lam * w * W[v[2]];
      a[0] -= nx * g0; a[1] -= ny * g0; a[2] -= nz * g0;
      b[0] -= nx * g1; b[1] -= ny * g1; b[2] -= nz * g1;
      c[0] -= nx * g2; c[1] -= ny * g2; c[2] -= nz * g2;
    }

    const ee = this.eePairs;
    for (let k = 0; k < ee.length; k += 2) {
      const c1 = this.stretch[ee[k]], c2 = this.stretch[ee[k + 1]];
      const p1 = V[c1.a], p2 = V[c1.b], q1 = V[c2.a], q2 = V[c2.b];
      const stp = closestSegs(p1, p2, q1, q2);
      const sp = stp[0], tq = stp[1];
      const ax = p1[0] + (p2[0] - p1[0]) * sp, ay = p1[1] + (p2[1] - p1[1]) * sp,
        az = p1[2] + (p2[2] - p1[2]) * sp;
      const bx = q1[0] + (q2[0] - q1[0]) * tq, by = q1[1] + (q2[1] - q1[1]) * tq,
        bz = q1[2] + (q2[2] - q1[2]) * tq;
      let nx = ax - bx, ny = ay - by, nz = az - bz;
      const d = Math.hypot(nx, ny, nz);
      if (d >= h || d < 1e-9) continue;
      nx /= d; ny /= d; nz /= d;
      const w1 = (1 - sp) * (1 - sp) * W[c1.a] + sp * sp * W[c1.b];
      const w2 = (1 - tq) * (1 - tq) * W[c2.a] + tq * tq * W[c2.b];
      const wsum = w1 + w2;
      if (wsum <= 0) continue;
      const lam = Math.min((h - d) / wsum, maxPush / Math.max(1e-9, wsum));
      const apply = (idx, bw, sign) => {
        const g = lam * bw * W[idx] * sign;
        V[idx][0] += nx * g; V[idx][1] += ny * g; V[idx][2] += nz * g;
      };
      apply(c1.a, 1 - sp, 1); apply(c1.b, sp, 1);
      apply(c2.a, 1 - tq, -1); apply(c2.b, tq, -1);
    }
  }

  /**
   * How far the cloth is through itself, as a count and a worst case.
   *
   * The scalar-with-a-threshold version of this question was `stackCm`, which
   * is a proxy: a heap can be the right height with every layer crossing. So
   * this reports WHERE the surfaces are inside each other and by how much,
   * over the same primitive pairs the solver sees.
   */
  selfOverlaps() {
    const V = this.asm.verts, tris = this.asm.tiles;
    const h = this.opts.clothThickness;
    if (!this.vtPairs.length && !this.eePairs.length) {
      this._findSelfPrims(h + 0.1);
    }
    // A pair at 0.39 cm of a 0.40 cm thickness is in CONTACT, not through
    // itself, and counting those made a settled stack look catastrophic. What
    // matters is how deep: `deep` counts surfaces more than half way through
    // each other, which no amount of contact convergence produces.
    let n = 0, worst = 0, sum = 0, deep = 0;
    for (let k = 0; k < this.vtPairs.length; k += 2) {
      const v = tris[this.vtPairs[k + 1]].v;
      const p = V[this.vtPairs[k]];
      const bary = closestOnTri(p, V[v[0]], V[v[1]], V[v[2]]);
      const u = bary[0], bv = bary[1], w = bary[2];
      const d = Math.hypot(
        p[0] - (u * V[v[0]][0] + bv * V[v[1]][0] + w * V[v[2]][0]),
        p[1] - (u * V[v[0]][1] + bv * V[v[1]][1] + w * V[v[2]][1]),
        p[2] - (u * V[v[0]][2] + bv * V[v[1]][2] + w * V[v[2]][2]));
      if (d < h) { n++; sum += h - d; if (d < h / 2) deep++; if (h - d > worst) worst = h - d; }
    }
    for (let k = 0; k < this.eePairs.length; k += 2) {
      const c1 = this.stretch[this.eePairs[k]], c2 = this.stretch[this.eePairs[k + 1]];
      const stp = closestSegs(V[c1.a], V[c1.b], V[c2.a], V[c2.b]);
      const sp = stp[0], tq = stp[1];
      const d = Math.hypot(
        (V[c1.a][0] + (V[c1.b][0] - V[c1.a][0]) * sp) - (V[c2.a][0] + (V[c2.b][0] - V[c2.a][0]) * tq),
        (V[c1.a][1] + (V[c1.b][1] - V[c1.a][1]) * sp) - (V[c2.a][1] + (V[c2.b][1] - V[c2.a][1]) * tq),
        (V[c1.a][2] + (V[c1.b][2] - V[c1.a][2]) * sp) - (V[c2.a][2] + (V[c2.b][2] - V[c2.a][2]) * tq));
      if (d < h) { n++; sum += h - d; if (d < h / 2) deep++; if (h - d > worst) worst = h - d; }
    }
    return {
      inContact: n,
      deepOverlaps: deep,
      deepOverlapPct: +(100 * deep / Math.max(1, n)).toFixed(1),
      worstOverlapCm: +worst.toFixed(3),
      meanOverlapCm: +(n ? sum / n : 0).toFixed(3),
    };
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
    const pen = this.penetration();
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
      // Grain against bias, because one number over all the edges cannot say
      // whether the cloth is shearing or tearing. A woven answers excess
      // length by rotating its yarns -- strain on the bias, none on the grain
      // -- and the whole point of the shear mode is to let it. If these two
      // move together, the cloth is still being stretched isotropically and
      // the anisotropy is not doing anything.
      // Did the integration actually resolve this garment? `healthy()` only
      // looks for NaN, and a run can slide off the body or stretch to three
      // times its tear limit while staying finite.
      strainResidualPct: +(100 * (this.strainResidual || 0)).toFixed(2),
      strainUnconvergedSubsteps: this.strainUnconverged || 0,
      grainOverLimit: this._grainOverLimit(),
      ...this._shearReport(),
      // The cloth through ITSELF, which stack height cannot tell you: a heap
      // can be the right height with every layer crossing.
      ...(this.opts.selfCollision ? this.selfOverlaps() : {}),
      deepestPenetrationCm: pen.worstCm,
      deepestVertexCm: pen.vertexCm,
      deepestEdgeCm: pen.edgeCm,
      // what happened during the fall -- see `_trackMotion()`
      peakSpeedCmPerSec: +((this._motion && this._motion.peakSpeed) || 0).toFixed(1),
      // NOT a reliable number: it is the peak speed at whichever frame contact
      // was first DETECTED, so it moves with the sampling. Measured 131, 200,
      // 140, 159 cm/s for the same denim drop at 10/20/40/80 substeps. Use
      // `reboundCm` and `bounces`, which converge.
      impactSpeedCmPerSec: +((this._motion && this._motion.impactSpeed) || 0).toFixed(1),
      reboundCm: +((this._motion && this._motion.reboundCm) || 0).toFixed(3),
      bounces: (this._motion && this._motion.bounces) || 0,
      // the distribution behind those maxima -- see `penetration()`
      insidePct: pen.insidePct,
      medianInsideCm: pen.medianInsideCm,
      p95InsideCm: pen.p95InsideCm,
      meanInsideCm: pen.meanInsideCm,
    };
  }

  /**
   * Are the YARNS past the fabric's own tear limit, and by how much?
   *
   * Too few substeps does not announce itself, and nothing in the solver was
   * catching it. Measured on a wool crepe disc (edge 2.2, `maxStrain` 6 %):
   *
   *   substeps  2 -- slid off the body entirely, 97 cm, never settled
   *   substeps  4 -- grain strain 11.3 % (1.9x the limit), body 2.3 cm
   *                  through the cloth, and a confident "caught on the
   *                  shoulder -- it is a yoke"
   *   substeps  6 -- qualitatively right (the neck), grain 9.8 %
   *   substeps 10 -- grain 4.8 %, body 0.17 cm through
   *   substeps 16 -- grain 2.2 %, body 0.17 cm through
   *
   * `healthy()` returned true for all of them, because it only looks for NaN,
   * and the strain limiter's own residual was zero throughout -- it converges
   * to its per-edge ceiling every substep. What it cannot do is stop the
   * cloth arriving at that ceiling, so the ceiling being REACHED on grain
   * edges is the signal. Grain yarns do not stretch 11 %: a woven's warp and
   * weft are the inextensible part, which is the whole premise of `maxStrain`.
   *
   * Ratio against the fabric's own limit, so it reads the same for a denim at
   * 2 % and a jersey at 25 %. Over about 1.2 the run is not trustworthy
   * whatever its verdict says.
   */
  _grainOverLimit() {
    if (!(this.maxStrain > 0)) return null;
    const V = this.asm.verts;
    let worst = 0;
    for (const c of this.stretch) {
      if ((c.bias || 0) > 0.5) continue;           // bias edges may shear
      const a = V[c.a], b = V[c.b];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const e = (L - c.rest) / c.rest;
      if (e > worst) worst = e;
    }
    const ratio = +(worst / this.maxStrain).toFixed(2);
    if (ratio > 1.2 && !this._warnedGrain) {
      this._warnedGrain = true;
      console.warn(`cloth: the grain is stretched ${(100 * worst).toFixed(1)} %,`
        + ` ${ratio}x this fabric's ${(100 * this.maxStrain).toFixed(0)} % limit,`
        + ` at ${this.opts.substeps} substeps. Yarns do not stretch that far:`
        + ' the step is under-resolved. Raise `substeps` -- 6 is a floor and'
        + ' 10+ held the limit on a coarse disc -- and do not trust this'
        + ' run\'s verdict.');
    }
    return ratio;
  }

  /**
   * The strain split by direction: along the yarns, and across them.
   *
   * `shearPct` is the trellis -- a bias edge lengthening because warp and
   * weft rotated apart -- and `grainPct` is the yarns themselves being
   * pulled, which real cloth barely does. The ratio is the diagnostic: cloth
   * should answer a drape mostly in the first column.
   */
  _shearReport() {
    const V = this.asm.verts;
    let gN = 0, gMax = 0, gSum = 0, bN = 0, bMax = 0, bSum = 0;
    for (const c of this.stretch) {
      const a = V[c.a], b = V[c.b];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const e = Math.max(0, (L - c.rest) / c.rest);
      if ((c.bias || 0) > 0.5) { bN++; bSum += e; if (e > bMax) bMax = e; }
      else { gN++; gSum += e; if (e > gMax) gMax = e; }
    }
    return {
      grainAware: !!this.grainAware,
      biasEdgesPct: +(100 * bN / Math.max(1, gN + bN)).toFixed(0),
      grainPct: +(100 * gMax).toFixed(2),
      shearPct: +(100 * bMax).toFixed(2),
      meanGrainPct: +(100 * gSum / Math.max(1, gN)).toFixed(3),
      meanShearPct: +(100 * bSum / Math.max(1, bN)).toFixed(3),
    };
  }

  /**
   * How far the cloth is inside the body -- measured where it actually is,
   * not only where its vertices are.
   *
   * Sampling vertices alone is what made the viewer report "inside the body:
   * 0.00 cm" while the dress form was plainly visible through a half-sewn
   * skirt: every vertex WAS outside, and the triangles between them were not.
   * Measured on that case, before edge collision existed -- 0 vertices inside,
   * 40 edge midpoints inside, deepest 0.42 cm, and 10 face centroids inside,
   * deepest 0.45 cm.
   *
   * It is also measured against the whole body rather than the torso level set
   * alone, so a limb passing through the cloth is counted too.
   */
  penetration() {
    const out = {
      vertexCm: 0, edgeCm: 0, faceCm: 0, worstCm: 0,
      insideSamples: 0, samples: 0,
    };
    if (!this.collider) return out;
    const V = this.asm.verts;
    // THE DISTRIBUTION, not only the worst of it.
    //
    // `worstCm` is a maximum over sampled points, and the sample count grows
    // as the mesh refines -- so the maximum can RISE while the cloth gets
    // better, purely because more places were looked at. Measured on a disc
    // over a neck: 0.29 cm at edge 2.2, 0.14 at 1.5 (both matching the
    // chord-error prediction L^2/8R to 4 %), then 0.17 at edge 1.1, which
    // breaks the trend. That is the suspect §6.6 recorded, and a max cannot
    // settle it. CLAUDE.md rule 2 is about exactly this: a scalar with a
    // threshold is verification, observation needs a distribution.
    const depths = [];
    const worst = (p) => {
      out.samples++;
      const d = this.collider.signedAt(p);
      if (!Number.isFinite(d) || d >= 0) return 0;
      out.insideSamples++;
      depths.push(-d);
      return -d;
    };
    for (const p of V) out.vertexCm = Math.max(out.vertexCm, worst(p));
    for (const c of this.stretch) {
      const a = V[c.a], b = V[c.b];
      out.edgeCm = Math.max(out.edgeCm,
        worst([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]));
    }
    for (const t of this.asm.tiles) {
      const [a, b, c] = t.v.map((i) => V[i]);
      out.faceCm = Math.max(out.faceCm, worst([
        (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]));
    }
    out.vertexCm = +out.vertexCm.toFixed(2);
    out.edgeCm = +out.edgeCm.toFixed(2);
    out.faceCm = +out.faceCm.toFixed(2);
    out.worstCm = +Math.max(out.vertexCm, out.edgeCm, out.faceCm).toFixed(2);
    depths.sort((a, b) => a - b);
    const at = (q) => (depths.length
      ? depths[Math.min(depths.length - 1, Math.floor(q * depths.length))] : 0);
    out.insidePct = +(100 * out.insideSamples / Math.max(1, out.samples)).toFixed(2);
    out.medianInsideCm = +at(0.5).toFixed(3);
    out.p95InsideCm = +at(0.95).toFixed(3);
    out.meanInsideCm = +(depths.reduce((a, b) => a + b, 0)
      / Math.max(1, depths.length)).toFixed(3);
    return out;
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
