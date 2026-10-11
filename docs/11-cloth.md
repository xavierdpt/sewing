# 11 — Fabric Physics, and the Drop Test

`app/js/cloth.js`, `app/js/sdf.js`, `app/js/testpieces.js`, `app/js/droptest.js`;
`node tools/drop_disc.mjs`; **D** in the viewer.

Everything before this document is a *static* solver. This one has mass, time and
momentum, and the reason is a single question that no static solver can answer:

> Drop a hollow disc of cloth over a neck. Does it stay on the body?

If the hole is a little larger than the neck it cannot pass the shoulders, so it hangs
from them: that is a circular yoke, and it is why a circular yoke works. If the hole is
much larger it clears the shoulders, nothing supports it, and it slides down the bodice
and ends on the floor. Both outcomes are produced here by gravity, contact and friction.
**Nothing tells the simulation where the boundary between them is**, which is what makes
the answer worth having.

---

## 1 — Three solvers, and why there had to be a third (and then a fourth)

| | what it does | what it answers |
|---|---|---|
| `relax.js` | constraint projection *with* an attraction term pulling the shell onto the body | "what shape does the body impose?" |
| `patternio.drape()` | the same, attraction removed, shoulders pinned | "does this pattern fit?" |
| `cloth.js` | real time integration: mass from areal density, gravity as an acceleration, velocity carried between steps, Coulomb friction, self-collision | "where does the cloth **go**?" |
| `sim/` (side-car) | Blender's C solver, over HTTP: triangle-against-triangle contact, edge–edge self-collision | "where does the cloth go **without passing through the body**?" |

The fourth was not planned. `cloth.js` answers its question well — it sews, it
settles, it strains correctly — but its contact is a point query per vertex,
and that is a structural limit rather than a tuning one (§8). Drape therefore
runs elsewhere now; everything up to and including the weld still runs here.
[16-solvers.md](16-solvers.md) sets out which does what, and the measurements
that decided it.

The third is needed the moment nothing is pinned. `drape()` pins the top 2 cm of the
garment because a bodice hangs from the shoulders — a perfectly good assumption when
you already know it is a bodice. It cannot be used to find out *whether* something
hangs from the shoulders, and its gravity is a positional nudge with no momentum, so it
could never carry a hole down over a shoulder even if it were allowed to.

## 2 — The cloth model: elastics and weights

It is as simple as it sounds, and it is about a hundred lines.

- **Mass** from areal density. Each vertex takes a third of each triangle it belongs
  to, so the total is the cloth's real weight: the default disc is 23 g of 120 gsm
  cotton. Fabric is sold by gsm, so the presets are real numbers.
- **Stretch**: one XPBD distance constraint per seam, rest length taken from the
  pattern — what the cut cloth holds the garment to.
- **Bending**: the quadratic (isometric) bending model — see §2a, which is a
  correction of what this section used to say.
- **Strain limiting** (Provot): a hard positional projection at the fabric's yield,
  applied *after* the velocity update and deliberately so. Run before it, the yank
  becomes velocity, the velocity re-stretches the edge, and the cloth buzzes for ever.
- **Self-collision**: vertex against vertex on a spatial hash, excluding mesh
  neighbours. A collar that folds over itself would otherwise pass through itself, and
  folding over itself is most of what a collar does.

Substepped XPBD (Macklin et al. 2016): many substeps per frame, one sweep each, with
stiffness coming from a compliance rather than from the sweep count. The seams get
three sweeps, not one, because a closed ring of edges under tension — the hole of a
disc caught on a neck is exactly that — propagates its error around the ring at one
edge per sweep. With one sweep the hoop lags a substep behind everything else and reads
as 10 % over-stretched.

**The control that proves the cloth model is right:** hang the disc from its own hole
with no body present. It settles to **0.022 cm/s rms** — numerically still — with 2 %
self-weight strain. It is in the test suite. Every difficulty in building this was in
the collision, not in the cloth.

## 2a — Bending, and two models that did not work

> This section replaces the one-line description of bending above. It is
> here because the first two models were wrong in ways that only a
> measurement caught, and the measurement is the useful part.

**The instrument** is `tools/fabric.mjs`: the Peirce cantilever test, which is
how a textile lab measures stiffness. A strip is clamped at one end and
droops under its own weight; the overhang at which the tip's chord reaches
41.5° below horizontal is twice the **bending length** `c`, in centimetres,
and `c` is a number you can look up for real cloth — or measure yourself with
a table edge and a ruler.

What it found:

| model | poplin | linen | habotai | denim | interfacing | compliance = 0 |
|---|---|---|---|---|---|---|
| cross-edge spring (was) | 0.76 | 0.76 | 0.76 | 0.76 | 0.77 | **0.76** |
| published | 1.5–2.0 | 2.0–2.6 | 0.9–1.4 | 2.8–3.8 | 4.0–6.0 | |
| quadratic bending (is) | **1.76** | **2.02** | **1.00** | 2.27 | 2.27 | |

The old model was **inert**. Every preset, and a compliance of zero, gave the
same answer, limper than the limpest real cloth. A spring between the two
vertices opposite a shared edge has a gradient nearly parallel to the stretch
constraints it shares those vertices with, and stretch is four orders stiffer
and solved first, so it simply undoes the correction. That is what "the drape
creases like paper instead of folding like cloth" *is*: cloth with no bending
resistance creases at the mesh scale rather than folding at a wavelength its
stiffness sets.

The obvious replacement, a **dihedral-angle** constraint, is correct and
unusable here: its gradient carries a 1/sin(angle) that is singular exactly
at the rest state, and the strip never stopped moving — 30 to 340 cm/s of
residual flailing where settled cloth reads 0.2.

What works is the **quadratic (isometric) bending model** (Bergou et al.
2006). For each interior edge there is a vector of four cotangent weights
`K`, fixed by the flat rest shape, with the property that `sum(K_i x_i) = 0`
for every flat arrangement of those four points and nothing else — verified
in the gate to 1e-14 on both test pieces. It is **linear in the positions**:
constant gradients, no trigonometry, nothing singular, and sweeps converge
instead of ringing.

Three things came out of making it work, each measured:

* **The fabric parameter is now a measurable property.** `FABRICS` carries
  `bendLengthCm`, and the flexural rigidity follows: `B = w g c³`. Five of
  the seven presets now measure back in the published range. Denim and
  interfaced twill saturate at 2.27 cm — the solver's ceiling at eight bend
  sweeps — so the stiffest cloths are limper than they should be, by 1.2x and
  1.8x. Raising `bendSweeps` to 24 lifts the ceiling to about 4 cm and costs
  proportionally.
* **Bending belongs in the same sweep as stretch and contact.** Run after
  the contact projection it pushes cloth into the body and has its answer
  undone a substep later, which is an oscillator: the yoke disc plateaued at
  0.99 cm/s for twenty seconds. Solved together it settles in under two.
* **The multiplier has to accumulate across sweeps.** Without it each sweep
  re-applies the whole correction and the pass puts energy in.

**Against Blender.** The side-car mapping in `drapejob.js` used to send our
compliance straight through as Blender's *stiffness* — so denim arrived as
the limpest cloth in the list and habotai as the stiffest, exactly upside
down. It is now scaled from the flexural rigidity and anchored on the one
preset Blender ships as "Cotton" (bending 0.5). Everything else follows from
this project's bending lengths, and lands on Blender's own presets without
being told them:

| | ours, from `c` | Blender's own preset |
|---|---|---|
| cotton poplin | 0.5 (the anchor) | 0.5 |
| denim | 10.4 | 10 |
| silk habotai | 0.068 | 0.05 |

That agreement was not fitted — only the anchor was chosen — and it is the
best available independent check that these bending lengths are real.

## 2b — The accordion drop: does the cloth have thickness?

`tools/accordion.mjs`, `dropAccordion()` in `app/js/droptest.js`.

A strip pleated into a concertina and dropped on the floor must land as a
**stack**. Cloth has thickness, and a fold traps air, so N layers occupy N
times something — and a solver without self-collision answers zero, every
layer in the same plane. It is the most recognisable way simulated cloth
looks wrong.

Nothing in the test imposes the answer: the comparison is against the
solver's own contact distance (`clothThickness`, 0.4 cm) and against the
identical strip with self-collision switched off.

```
silk habotai, 8 pleats of 8 cm        stack    footprint
  self-collision on                   1.61 cm   15.8 cm
  self-collision off                  0.10 cm   16.0 cm
```

Sixteen times taller with the layers talking to each other. It resolves
about four layers' worth of the eight, because contact here is vertex
against vertex and layers can nest between each other's vertices — the same
limitation §4 describes for the body, seen from the other side.

A stiff cloth is a different measurement: poplin keeps its loft and stands
4.75 cm tall whether or not self-collision is on, because the bending model
now holds the folds open. That is physical, and it is why the test uses a
limp silk to isolate the contact.

The strip is cut by `rectanglePattern()` and pleated by a *placement*, so it
is an ordinary pattern piece that happens to be folded before it is dropped:
the viewer's "cut it as a pattern piece instead" puts the same piece on the
cutting table.

## 3 — Why fabric does not bounce

The first version bounced, visibly. Two things were missing, and both are material
properties rather than solver tuning.

**Internal viscosity.** Fabric dissipates heavily: yarn friction at every crossing,
hysteresis in every fold. A sheet of undamped springs is a trampoline — it stores an
impact and gives it back. Global velocity damping does not help, because it removes
*bulk* motion while the energy is stored in the *relative* motion of neighbours. So
each seam and each fold gets a dashpot in parallel with its spring, dissipating a
fraction of the relative velocity along it, momentum-conserving, so a falling disc
still falls at g and merely stops ringing when it lands. The fraction is a per-fabric
number: 0.55 for a habotai that keeps fluttering, 0.90 for a heavy twill that deadens.

**Air drag.** Drag acts on **area**, inertia lives in **mass**, which is the entire
difference between a dropped handkerchief and a dropped pair of jeans. Real drag is the
sum of two terms and both are needed, for different reasons:

- the **quadratic** term, expressed as the terminal speed of 120 gsm cloth falling flat
  (150 cm/s) and scaled as the square root of areal density, so denim falls 2.4 times
  faster than habotai with no extra parameters. This is the term that kills the
  *transient*, which is what reads as bouncing: linear drag calibrated to the same
  terminal speed barely touches it.
- the **linear** (viscous) term, a rate of 3/s for a poplin, scaled inversely with
  areal density. Quadratic drag vanishes with the square of the speed, so on its own it
  says nothing about slow motion and a hanging disc sways for ever. This term sets how
  long a gentle sway lasts — a third of a second, which is about right for cloth in
  still air. On the free-hang control it takes the residual motion after three seconds
  from 0.40 cm/s to 0.02.

Measured, on a disc dropped 4 cm:

| | rebound of the centre of mass | fastest vertex / impact speed |
|---|---|---|
| both | **0.10 cm** | **1.93** |
| no air drag | 0.01 cm | 2.08 |
| neither | 0.29 cm | 2.12 |

That table is weaker than it was, and the reason is worth recording. It used to read
0.001 / 0.313 / 0.407 cm, which made air drag look like the whole story. Then
`stretchSweeps` went from 3 to 8 — for an unrelated reason, a skirt sliding over hips
it cannot pass (docs/13-assembly.md §6) — and with the solver actually converged the
rebound fell below a millimetre in **every** variant, including with both terms
removed. So on this metric the two terms now barely register: the bounce was mostly a
solver that had not converged, and the dissipation terms were covering for it.

What survives is the whip ratio, and the ordering is still right. The residual 1.93 is
the hem: the middle is stopped by the shoulders while the hem is still falling, and it
snaps. That one is real, and both terms reduce it.

Both are one slider each in the viewer, and `terminalCmPerSec: 0` turns drag off
entirely. The reasons to keep them are no longer "it bounces otherwise" but the two
they were argued from in the first place: a terminal speed that scales with areal
density is how cloth actually falls, and a dashpot per seam is how cloth actually
dissipates.

## 4 — The hard part: what "inside the body" means

Every single problem in building this was in the contact, and all of them had one
cause. The body had been answering collision queries by returning **the nearest of a
grid of sample points** and that sample's tangent plane. For a static fit solver that
is fine. For a time-stepped one it fails twice:

1. **Distance to the nearest sample's tangent plane is not an inside test.** A
   shoulder's normal tilts towards vertical, so a vertex hanging in free air just past
   the shoulder point lies behind the plane of the sample on top of the shoulder, and is
   reported **1 to 2 cm inside the body**. Fifty vertices did this. The solver shoved
   each one out every substep while gravity pulled it back: at a 1.7 ms substep that is
   an 80 cm/s oscillation, injected for as long as you care to run.
2. **The nearest sample jumps.** As a vertex creeps the answer hops to the next sample
   and the normal hops with it, fifteen degrees or more over a shoulder. The solver
   cancels the wrong component of velocity each time and gravity refills the rest.

I tried to patch around this twice — a radial inside test, then an adaptive search over
a parametric grid — and both were wrong in the same way, because the representation was
wrong, not the search. **The fix was to stop asking the parametric surface anything**:
tessellate the body once and build a signed distance field (`sdf.js`), Bridson's
`makelevelset3`: exact point–triangle distances in a band around each triangle, sign
from counting ray crossings along each grid line, the open neck and crotch capped so the
crossing count cannot leak.

A level set is a **field**, so trilinear interpolation makes both the distance and its
gradient — the way out — continuous, with no parametric assumptions anywhere.

| | before (nearest sample) | after (level set) |
|---|---|---|
| residual motion of a settled drape | 17 cm/s, for ever | 0.1 cm/s |
| vertices left inside the body | 92, up to 4.4 cm deep | 0, 0.00 cm |
| cost per query | 5–25 µs | **0.6 µs** |

Accuracy, measured against the parametric torso it was built from: 0.09 cm mean error
on the surface, 0.30 cm worst, at the 0.6 cm default spacing, and it scales with the
spacing. The worst case is always the crease where the neck meets the shoulder, the
sharpest feature on a torso. That is a quarter of the cloth's triangle edge, so it sits
below the resolution of the thing being simulated. Building it costs about 1.5 s, and it
is cached on the body and invalidated when a measurement changes.

Three further contact details earn their place, each for a measured reason:

- **Contact is solved in the same sweep as the seams**, against planes cached once per
  substep. Applied after the sweeps instead, every substep resolves a penetration that
  the seams then undo, and the seams' answer arrives a substep later — a one-substep
  lag is an oscillator.
- **The correction is under-relaxed** (0.35 of the residual). The seams are nearly
  inextensible, so a vertex pinched between the cloth and a shoulder is shoved out and
  pulled back at full strength every substep and the two never agree: a 30 cm/s limit
  cycle with no net motion, which is what a drape that will not stop shimmering looks
  like.
- **Friction is applied to velocity, not to position.** Coulomb friction is µ times the
  normal impulse, and at a resting contact the normal impulse is exactly the inward
  velocity gravity just produced and the contact just cancelled — m·g·h per substep —
  so µ·|Δv_n| gives µ·m·g·cos θ out of the integrator with no tuning. The
  position-level version (cap the tangential displacement at µ times the penetration
  depth) looks equivalent and is not: with a realistic fabric thickness the depth is a
  few microns, the cap goes to zero with it, and the cloth creeps down the body with no
  friction at all.

## 5 — The test piece

`annulusPattern()` emits a hollow disc **in the ordinary pattern format** of
`patternio.js`, so it can be exported to SVG and cut out like anything else.

Resolution is driven by a target edge length, not by ring and sector counts, because a
disc's circumference grows with radius: a constant sector count right at the hem is
four times too coarse at the hole. So the sector count **doubles outward** whenever the
circumferential edge grows too long, joined by a 2:1 transition row of three triangles
per inner segment. Triangles stay near-equilateral from hole to hem — measured worst
edge ratio 1.68 — which is what "triangulated enough" has to mean for a physics mesh:
slivers make the stretch constraints ill-conditioned and give the drape a direction
bias. No vertex is left T-shaped, which would be a crack the cloth tears along.

`rectanglePattern()` is the control: a square has no hole to catch on anything, so it
must always slide off.

## 6 — Ready for pattern pieces joined into one mesh

The disc goes `annulusPattern()` → `sewFlat()` → `Cloth`, and **`sewFlat()` welds every
group of points sharing a `v3` id**, exactly as `sew()` already does. So a multi-panel
pattern arrives as one mesh whose seams are ordinary interior edges, and the solver has
no 2D special case in it. The two entry points differ only in where they put the cloth
before letting go:

- `sew()` offers each piece up to the place on the body it was drafted for, the way a
  fitter lays pieces against a form before pinning. That is what a fit test wants.
- `sewFlat()` refuses to place it at all: the pieces lie in a horizontal plane, in the
  shape they were cut, and gravity and contact decide the rest.

Both return an `Assembly`, so edge strains, the OBJ export and the viewer's colour
modes work unchanged on a simulated garment.

## 7 — The result

`node tools/drop_disc.mjs sweep`, on the default body (36 cm neck, 39 cm shoulders):

```
r=  6 cm  hole  37.4 cm  CAUGHT  at neck      slip  0.6 cm   stretch 8%
r=  7 cm  hole  43.7 cm  CAUGHT  at neck      slip  1.2 cm   stretch 6.5%
r=  8 cm  hole  50.0 cm  CAUGHT  at neck      slip  1.6 cm   stretch 4.5%
r=  9 cm  hole  56.3 cm  CAUGHT  at neck      slip  2.0 cm   stretch 4.7%
r= 10 cm  hole  62.6 cm  CAUGHT  at shoulder  slip  2.4 cm   stretch 4.3%
r= 12 cm  hole  75.2 cm  CAUGHT  at shoulder  slip  3.3 cm   stretch 5.1%
r= 14 cm  hole  87.8 cm  slipped to the bust  slip 13.1 cm   stretch 11.6%
r= 16 cm  hole 100.4 cm  slipped -- on the floor
r= 18 cm  hole 113.0 cm  slipped -- on the floor
r= 20 cm  hole 125.6 cm  slipped -- on the floor
```

Read it carefully, because it says three things a pattern book states as rules:

1. **The critical hole is set by the shoulder girth, not the neck girth.** The boundary
   is at a hole circumference near 80 cm, against a 36 cm neck. A neckline that *fits*
   the neck is nowhere near the size that *stays on* it — there is more than a factor
   of two of slack in between, and that factor is the entire design space of a yoke.
2. **Where it stops is where the girth matches.** At r = 14 cm the hole is 88 cm round
   and it slides to the bust, which is 90 cm round, and stops there straining 11.6 %.
   Nothing in the code knows about the bust.
3. **Strain falls as the hole grows, until it doesn't.** A small hole hangs from the
   neck and carries the whole weight on a short seam, so it strains most (8 %). A big
   hole carries nothing and strains nothing (0 %) — because it is on the floor.

## 8 — Limits

The first two of these are why drape no longer runs here at all. See
[16-solvers.md](16-solvers.md).

- **Contact is a point query per VERTEX.** This is the big one, and it was
  mis-stated for a long time as being only about self-collision. The solver
  keeps every vertex outside the body and says nothing about the triangle
  between them, so a facet spanning a convex bulge dips below it and the body
  shows through the cloth. Measured on a half-sewn skirt: 0 vertices inside,
  40 edge midpoints inside at up to 0.42 cm; on a settled skirt, 1.26 % of the
  cloth area. Sampling more points narrows it without bounding it, and costs
  the drop test its settle. **Drape is therefore handed to a side-car**
  (`sim/`), which does triangle-against-triangle contact and reaches zero.
- **Self-collision is vertex–vertex, not edge–edge.** Two folds can cross if they do it
  between vertices. For deep folds in a coarse mesh that happens. The side-car
  does this properly too.
- **The level set is as sharp as its grid.** 0.3 cm at the neck/shoulder crease; halve
  `cell` and pay for it as the cube in build time.
- **Drag is isotropic.** Real drag on a sheet is mostly normal to the surface, so a
  disc falling flat should be slowed more than one falling edge-on. It is not.
- **No shear and no anisotropy.** A woven is stiff on the grain and soft on the bias,
  and the bias is half of what makes garments hang. Every triangle here is isotropic,
  which means the simulation cannot tell a bias-cut cowl from a straight-grain one — a
  serious limit for the thing this project is ultimately for.
- **No hysteresis in the fold.** Damping dissipates but the fold does not *remember*;
  real cloth creases.
- **A stiff heavy cloth rocks as it settles.** Denim on a shoulder registers 0.7 cm of
  centre-of-mass rise, which is a nearly rigid plate finding its three contact points
  rather than an elastic rebound. Soft cloths do not do it.
- **Nothing is validated against real fabric.** The presets are plausible, not
  measured. The side-car proposed here has since been built (`sim/`, and
  [16-solvers.md](16-solvers.md)) — and it turned out to be needed as a
  *replacement* for the drape rather than only as a check on it, because the
  vertex-only contact above is not fixable by tuning. It does not fix the
  presets, though. Kawabata or FAST measurements of a real cloth would give
  them a footing; failing that, C-IPC ships a table of five measured cloths
  (150–240 gsm, with Young's moduli, Poisson's ratios and strain limits of
  0.5–13.4 %), recorded in [`sim/cipc/fabrics.md`](../sim/cipc/fabrics.md).
  **Those measured wovens stretch 6–13 % where the presets here assume 2–4 %**,
  and if that is right then §7's yoke/slip boundary — which turns entirely on
  the cloth refusing to stretch past the shoulder girth — was found with too
  stiff a cloth and should be re-run.
