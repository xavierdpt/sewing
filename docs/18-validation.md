# 18 — Validation: the methodology this solver is not yet following

Written 2026-10-11, after a session that found four real defects by chasing
them one at a time as they were noticed on screen. Every one of them would
have been caught in a single run by scaffolding that does not exist. This
document is the list of what to build, in order, with the acceptance criterion
for each — so that the next finding is a row in a table rather than an
afternoon of conversation.

It is deliberately written as a standing plan and not a retrospective. The
measurements quoted are the ones taken on 2026-10-11 and are the baseline any
of this work has to beat or preserve.

The working queue lives in [19-todo.md](19-todo.md). Finished items are
removed from there and referenced here, against whatever step, artifact or
decision they settled.

**Every section carries a `**State:**` line directly under its heading**, so
finding the next candidate is `grep -A1 '^###' docs/18-validation.md` and not
a careful read. That line is the index; prose elsewhere in a section is not.
It was informal at first and the audit of it gave both false positives and
false negatives, which defeated the point.

---

## 0. Why this document exists

The work on 2026-10-11 was reactive. The sequence was always: something looks
wrong on screen → build a one-off measurement → find a cause → fix it → move
on. That found:

- a **+56.2 % tensile pre-strain** baked into the accordion's creases by the
  fold generator, matching `√(edge² + gap²)/edge − 1` to the decimal;
- **self-collision that could not see a crossing**, because it was a
  vertex-vertex point query with a 0.4 cm radius on a 2 cm mesh;
- a **cantilever instrument quantised to `edge/2`**, which made every bending
  verdict in the preset table an artifact;
- a **3.5×** performance deficit in the new contact path.

All four are real. None of them needed a conversation. What they needed was a
validation suite, a convergence harness, and parameter identification — the
three things below that are still missing. The cost of not having them is that
the project cannot tell a material property from a mesh artifact without a
human noticing something looks odd, which is exactly the loop CLAUDE.md rule 1
is about, one level up: **the instruments exist for individual questions, but
nothing systematically asks all the questions on every change.**

---

## 1. The methodology, stated

Cloth simulation research separates three axes. Confusing them is the main
source of misdiagnosis, and most of 2026-10-11 was spent disentangling them
after the fact.

| Axis | What it covers | In this repo |
|---|---|---|
| **Constitutive model** | membrane (tensile, shear), bending, plasticity/hysteresis, friction | `FABRICS` presets, `rigidityOf`, hinges, `biasCompliance` |
| **Discretisation** | mesh type and resolution; how energies are discretised | `edge` everywhere, `bendingStencils`, triangle rest sides |
| **Integration & constraints** | time stepping, constraint solving, contact | XPBD in `_substep`, `_clampStrain`, `_solveSelfPrims` |

**Rule: change one axis at a time, and attribute an artifact to the right axis
before touching anything.**

Standing on: Baraff & Witkin 1998 (separate stretch and shear stiffnesses —
the thing this solver still lacks a measured version of); Bridson et al.
2002/2003 (contact, and folds and wrinkles); Grinspun et al. 2003 (discrete
shells — the bending model here); Müller et al. 2007 and Macklin et al. 2016
(PBD/XPBD — what `cloth.js` is); Narain, Samii & O'Brien 2012 (adaptive
anisotropic remeshing — the direct answer to a 1 cm crease on a 2 cm mesh);
Wang, Ramamoorthi & O'Brien 2011 and Miguel et al. 2012 (data-driven parameter
identification); Li, Kaufman & Kim 2021 (C-IPC, already a submodule in `sim/`).

On top sits the validation ladder:

1. **Standard physical benchmarks with published target values.**
2. **Parameter identification by inverse fitting**, with a held-out test.
3. **Convergence studies** — refine the mesh, show the quantity converges.
4. **Energy and stability diagnostics**, including analytic cases.
5. **Performance measured at equal accuracy**, as a cost-vs-accuracy curve
   against a reference solver.

`docs/11-cloth.md:398` already says Kawabata or FAST measurements of a real
cloth should set the presets. That was written before this session and is
still true.

---

## 2. Standard tests the field already uses, and where ours fit

The disc and the accordion were invented for this project. Both turn out to be
close cousins of established tests — which is a good sign about the instincts
behind them, and an opportunity, because the standard versions come with
**published target values, a defined specimen geometry and a scoring formula.**
Ours currently have none of those, which is why their results can only be read
comparatively ("the twill is stiffer than the silk") and never absolutely
("this fabric is wrong by 1.6×").

### 2.1 What the two tests here already are

| This project | The standard it resembles | What the standard adds |
|---|---|---|
| **Disc with a hole, dropped on the form** | **Cusick drape test** (BS 5058 / ISO 9073-9; Cusick 1965, 1968): a circular specimen on a smaller circular support, scored by the projected area of the draped shape | A number — the drape coefficient — with published ranges per fabric class, plus fold/node count and amplitude as secondary measures |
| | *The hole* is not standard. Scored on whether the cloth catches at the shoulder it is a garment **slip/fit** test, which is this project's own contribution and worth keeping as such | — |
| **Pleated strip dropped on the floor** | **Cloth-pile / stacked-sheet self-collision benchmarks** used throughout the contact literature (IPC and C-IPC use stacked sheets and funnel tests) | A pass criterion stated as intersection count rather than heap height |
| | **KES-FB3 compression** (thickness under load) for the "how thick is a stack" half | Thickness at a defined pressure, in mm, against a measured value |
| | **AATCC 66 / ISO 2313 crease-recovery angle** for the "does it spring back" half | A recovery angle in degrees — exactly the linen question of §6.6 |

The accordion is therefore doing **three** jobs at once — self-collision,
compression and crease recovery — which is part of why its result was hard to
read. Splitting it along those lines would make each half comparable with a
published number.

### 2.2 The standard battery for fabric mechanics

What a textile lab or a simulation paper measures, and which axis of §1 each
one constrains:

| Test | Standard / origin | Constrains |
|---|---|---|
| **Cantilever bending length** | ASTM D1388 (option A), BS 3356, Peirce 1930 | bending |
| **Pure bending, moment vs curvature, with hysteresis** | KES-FB2 (Kawabata 1980); reports `B` and `2HB` | bending **and plasticity** |
| **Circular bend / orifice stiffness** | ASTM D4032 | bending, multi-axial |
| **Tensile, low-load region** | KES-FB1; ASTM D5035 strip method for break | membrane tensile |
| **Shear, picture-frame (shear frame)** | composites/textile-forming literature | **shear** |
| **Bias extension (45° off-axis tension)** | same; simplest shear proxy to build | **shear** |
| **Compression / thickness under load** | KES-FB3; FAST-1 | thickness |
| **Surface friction** | KES-FB4; ASTM D1894 | friction |
| **Drape coefficient** | Cusick, BS 5058 / ISO 9073-9 | whole-model validation |
| **Crease recovery angle** | AATCC 66 / ISO 2313 | **bending plasticity** |
| **Hemisphere / dome draw** | composites forming practice | shear + formability |
| **FAST** (cheap alternative to KES-F) | CSIRO: FAST-1 compression, -2 bending, -3 extension, -4 dimensional stability | most of the above, cheaply |

`docs/11-cloth.md:398` already names Kawabata and FAST as the route to giving
the presets a footing. That line predates this document.

Note the hemisphere draw test is exactly the experiment
`docs/06-open-questions.md` §1 specifies (10 cm squares over a 10 cm
hemisphere, largest cap covered before wrinkling, converted via
`2π(1 − cos θ)`). The project independently arrived at a standard composites
forming test — again, good instinct, and worth knowing it has a literature.

### 2.3 How simulation papers validate against these

- **Bhat et al. 2003**, *Estimating cloth simulation parameters from video* —
  identification from footage of real cloth in motion.
- **Wang, Ramamoorthi & O'Brien 2011**, *Data-driven elastic models for cloth*
  — a measurement protocol plus fitting; **this is the dataset C-IPC ships and
  therefore the one already sitting in `sim/cipc/fabrics.md`.**
- **Miguel et al. 2012**, *Data-driven estimation of cloth simulation models*
  — nonlinear models fitted to measured force–displacement from custom
  tensile, shear and bending rigs.
- **Clyde, Teran & Tamstorf 2017**, *Modeling and data-driven parameter
  estimation for woven fabrics* — orthotropic model identification.
- **Sperl et al. 2022**, *Estimation of yarn-level simulation models for
  production fabrics* — fitting at yarn level.
- **Narain, Samii & O'Brien 2012** (ARCSim) — adaptive anisotropic remeshing;
  also widely used as a reference implementation to compare against.
- **Li, Kaufman & Kim 2021** (C-IPC) — guaranteed intersection-free contact,
  and the source of the measured table above.

The common shape of all of them: **measure a curve, fit the model to it, then
validate on an experiment that was not used in the fit.** None of this project's
presets has been through that loop.

### 2.4 Standard dynamic scenes, for regression

Beyond material tests, the literature has a set of scenes used so often they
function as a shared benchmark, and they are cheap to add as gate cases:

- a square sheet draped over a sphere (the canonical drape scene);
- a sheet dropped on a flat surface and allowed to buckle;
- stacked sheets or a cloth pile — the self-collision case, which the
  accordion already is;
- a sheet pulled through a funnel or over an edge, for contact robustness;
- a flag or a swinging curtain, for dynamics and damping;
- a twisted or inverted cylinder of cloth, for severe self-contact.

---

## 3. Answers this project already had

Everything in this section was written down **before** 2026-10-11 and would
have prevented a specific piece of that day's work. CLAUDE.md rule 5 says to
read these before proposing a direction; it was broken repeatedly, and this is
the index that makes it harder to break next time.

### 3.1 Self-collision passing through itself

- **`docs/11-cloth.md:56`** — *"Self-collision: vertex against vertex on a
  spatial hash, excluding mesh neighbours."* The mechanism, stated plainly.
- **`docs/11-cloth.md:377`** — *"**Self-collision is vertex–vertex, not
  edge–edge.** Two folds can cross if they do it between vertices. For deep
  folds in a coarse mesh that happens. The side-car does this properly too."*
- **`docs/11-cloth.md:164–170`** — the recorded baseline (1.61 cm with
  self-collision on, 0.10 cm off) **and** the admission that the heap
  *"resolves about four layers' worth of the eight… because contact here is
  vertex against vertex and layers can nest between each other's vertices."*
- **`docs/11-cloth.md:27`** — the side-car *"does triangle-against-triangle
  contact, edge–edge self-collision"*.

**Would have prevented:** the entire investigation of why the accordion
crossed itself. The answer, the mechanism and the magnitude were all on file.
A single read would have gone straight to the fix.

### 3.2 No shear, and what its absence costs

- **`docs/01-geometry.md:142–147`** — *"a woven fabric is not an isometric
  sheet: the warp and weft can **shear** (trellis) by roughly 15–25° before
  locking. That shear absorbs Gaussian curvature for free… **Any solver that
  ignores shear will over-segment.**"*
- **`docs/01-geometry.md:189`** — the quad formulation *"**is** a quad mesh
  with one shear DOF per cell"*.
- **`docs/01-geometry.md:427–429`** and **`docs/04-software.md:318–325`** —
  fabric shear does much of the work for free; add a per-tile shear allowance;
  *"build quads and let them shear."*
- **`docs/09-pattern.md:192` and `:312`** — *"**No fabric shear**"*, twice,
  as a known limitation.
- **`docs/11-cloth.md:383`** — *"**No shear and no anisotropy.** A woven is
  stiff on the grain and soft on the bias."*
- **`docs/12-flare.md:143`** — *"a twist is a shear"*, in the flare analysis.
- **`docs/06-open-questions.md` §1** — the experiment, the conversion formula
  and the prediction (felt ≈ 5–10°, cotton ≈ 15°, knit ≈ 40°+).
- **`docs/06-open-questions.md` §8** — *"**§1 — the shear experiment.** It is
  an afternoon with four fabric scraps and a bowl, it needs no software, and
  its answer changes the required tile count by a factor of two or more.
  **Every other number in this project is downstream of it.**"*

**Would have prevented:** deriving the need for shear from first principles
over several exchanges, and then implementing it with invented constants when
the document that names it also specifies the experiment that would have
calibrated it.

### 3.3 Fold wavelength, and "creases like paper"

- **`docs/11-cloth.md:96–100`** — *"That is what 'the drape creases like paper
  instead of folding like cloth' **is**: cloth with no bending resistance
  creases at the mesh scale rather than folding at a wavelength its stiffness
  sets."*

**Would have prevented:** re-deriving the fold-wavelength-versus-mesh argument
(`λ ≈ 2πc` against a `4 × edge` floor). The project had already framed
wrinkle wavelength as a function of stiffness and warned that the mesh scale
competes with it.

### 3.4 Measured fabric parameters — already in the repo

- **`sim/cipc/fabrics.md`** (written 2026-10-10) — five **measured** cloths
  from Wang et al.'s dataset via C-IPC: 150–240 gsm, with thickness, Young's
  modulus, Poisson's ratio and strain limits of **0.5–13.4 %**. Its own
  opening line: *"`docs/11-cloth.md` §8 has always said: 'Nothing is validated
  against real fabric. The presets are plausible, not measured.' These are
  measured."* It also states why they are recorded and not adopted: mapping a
  Young's modulus and a Poisson's ratio onto XPBD compliances *"is a real
  piece of work and not a lookup."*
- **`docs/11-cloth.md:400–405`** — *"**Those measured wovens stretch 6–13 %
  where the presets here assume 2–4 %**, and if that is right then… the
  yoke/slip boundary — which turns entirely on the cloth refusing to stretch
  past the shoulder girth — was found with too stiff a cloth and should be
  re-run."*

**Would have prevented:** logging "why does max strain pin at the yield limit"
as an open mystery. The presets' strain limits are **guesses that are 2–3×
tighter than measured wovens**, and the project had already said so and
already predicted the consequence. See the correction in §6.6.

### 3.5 Where the solver's responsibilities already lie

- **`docs/16-solvers.md`** — *"Which Solver Does What, and Why"*, with §3
  *"Drape goes to a side-car, because this solver cannot do contact"* and §6
  *"What was evaluated and not adopted"*, which states that C-IPC is *"the
  better answer in principle: guaranteed intersection-free by construction,
  native point-on-edge stitching… and a table of measured fabric parameters"*,
  **and that it builds**, as a submodule with four recorded fixes.

**Would have prevented:** proposing the "hand it to the side-car versus fix it
here" decision as though it were open. It is already decided and documented,
including the build status. *This document's author had not read
`docs/16-solvers.md` at all when writing §5 Step 7.*

### 3.6 The working rules themselves

`CLAUDE.md` rules 1, 2, 5, 6 and 7 each name a failure that recurred on
2026-10-11: guessing instead of instrumenting; reporting a scalar where a
distribution was needed; not reading the project's documents first; changing
tuned defaults without a clean baseline (four at once); and letting the viewer
and the headless path diverge (`__pump` lacked the settle test; `withBusy`
never fired headless). Rules 5 and 6 are the two to re-read before the next
change.

---
## 4. What exists today

Honest inventory, so the plan does not rebuild what is there.

**Instruments that exist and work**

- `tools/fabric.mjs` — Peirce cantilever, per preset, against published
  bending-length ranges. Has `--scan` and `--edge`. **Its readout is quantised
  to `edge/2`** (see §6.1); the instrument is sound, the reporting is not.
- `tools/accordion.mjs` — the thickness/self-collision heap test. Now reports
  crease strain, pleat angle, layer rise.
- `tools/trace.mjs` — arrange → sew → weld → drape as a table; `--sidecar`.
- `tools/drape_blender.mjs` — this solver against Blender on one metric.
- `tools/profile.mjs` — **new 2026-10-11.** V8 sampling profiler via node's
  inspector; self time per function, plus broad-phase counters. `--scenario`,
  `--cell`, `--mode`, `--edge`.
- `app/js/clearance.js` — distribution and location of cloth against body.
- `Cloth.selfOverlaps()` — **new.** Cloth through itself: `inContact`,
  `deepOverlaps` (past half thickness), `meanOverlapCm`, `worstOverlapCm`.
- `Cloth.report()._shearReport()` — **new.** Strain split grain vs bias.
- `test/run.mjs` — the regression gate. 277 checks.
- Viewer telemetry → side-car `/log`, with phase metrics on every event.

**What does not exist**

- Any **standard drape benchmark**. No Cusick drape coefficient, despite the
  disc drop being a Cusick test in all but scoring.
- Any **shear measurement**. No bias-extension, no shear frame. The shear
  model shipped on 2026-10-11 has **invented** parameters.
- Any **convergence harness**. Nothing runs a quantity at several mesh sizes
  and reports the trend.
- Any **energy diagnostic**. `Cloth.kinetic()` exists and is unused by any
  instrument.
- Any **analytic validation case** — no catenary, no pinned-sheet deflection.
- Any **parameter identification**. Every preset number is a literature
  look-up or a hand-set value; none is fitted, none is validated on a
  held-out test.
- Any **cost-at-equal-accuracy** comparison. Performance has been quoted as
  raw ratios between models of different correctness.

---

## 5. The work, in order

Ordered so each step makes the next one cheaper. Steps 1–3 are the ones that
convert the session's findings from anecdotes into data.

### Step 1 — Convergence harness `tools/converge.mjs`
**State:** open


**Why first.** Three of the four defects found on 2026-10-11 were
mesh-dependence, and each was found by accident. A quantity that changes with
triangle size is not a material property.

**Build.** A runner that takes a scenario and a list of edge lengths, runs
each, and prints one row per mesh with the quantities and their change against
the finest mesh. Scenarios: cantilever, disc drop, accordion heap.

**Report per row:** `edge`, vertices, the scenario's primary quantities, and
`Δ vs finest %`.

**Acceptance criteria.**
- Bending length converges to within 5 % over a 3× refinement, or the test
  says it does not.
- Accordion crease strain is 0 at every mesh size (it is now, by construction
  — this locks it).
- Disc drop `maxStretchPct` either converges or is flagged as divergent. It
  is currently suspected divergent: it **pinned at 3.6–4.0 % against silk's
  4 % yield** at edge 2.2, and **rose to 11.4 %** with shear on at edge 1.0.
- Any quantity that fails to converge is named in the output, not averaged.

**Known answers it must reproduce.** Finest representable wrinkle is about
`4 × edge`: 8.8 cm at edge 2.2, 4.0 at 1.0, 2.0 at 0.5, 1.0 at 0.25.

---

### Step 2 — Cusick drape test `tools/drape_coefficient.mjs`
**State:** open


**Why.** It is the standard drape benchmark (BS 5058), it has published
values per fabric class, and **it is the test already being run by hand with a
disc of cloth on the dress form.** Scoring it makes those physical
observations comparable with the simulation directly.

**Build.** Circular specimen of known radius on a smaller rigid support disc;
let it drape; measure the projected area of the draped specimen from above.

```
drape coefficient DC = (A_draped − A_support) / (A_specimen − A_support)
```

A rigid sheet gives DC = 1 (no drape); a limp cloth approaches 0. Report node
count of the fold pattern as well: the number of folds around the hem, which
`hemProfile()` already computes from the lowest boundary loop and which is
directly comparable with a count made by eye on a real specimen.

**Acceptance criteria.**
- DC reported for all seven presets at three mesh sizes (uses Step 1).
- Fold count reported alongside, with the mesh's representable ceiling
  (`hem circumference / 4 × edge`) printed next to it so a count limited by
  the mesh is never mistaken for a material result.
- Published DC ranges per fabric class recorded in the file as targets, in the
  style of `PUBLISHED` in `tools/fabric.mjs`.

**Expected to expose:** silk habotai's natural fold wavelength is ~6.9 cm
(`λ ≈ 2πc`), i.e. ~25 folds on a 176 cm hem, against a mesh ceiling of ~20 at
edge 2.2. The twill's is ~31 cm, ~5.6 folds, comfortably representable. So the
silk is expected to read as too stiff for mesh reasons and the twill
honestly — and the test must say which.

---

### Step 3 — Fix the cantilever readout
**State:** done 2026-10-11 — queue item 3


**Why.** Every bending verdict in the preset table is currently an artifact.
The Peirce overhang is found by walking triangle rows, so the readout can only
land on `n × edge/2`.

**Evidence.** At edge 1.5, asked-for bending lengths of 0.8, 1.1 and 1.4 cm
all read back **0.75** — three distinguishable fabrics collapsing onto one
number. Measured values across a sweep were exactly `n × 0.75` for
n = 1, 1, 1, 2, 3, 5, 13, while the continuous `reach` column moved smoothly
from 0.29 to 18.95 cm. And across meshes, silk habotai read 0.50 / 0.75 /
1.13 / 1.50 at edges 1.0 / 1.5 / 2.2 / 3.0 — i.e. `edge/2` every time.

**Build.** Interpolate the 41.5° chord crossing *within* a triangle row
instead of snapping to the row boundary.

**DONE 2026-10-11** (was [19-todo.md](19-todo.md) item 3). The crossing is now
interpolated linearly in chord angle between the two rows that straddle it.

- ✅ *Continuity.* The `--scan` column is monotone with no repeats:
  0.412 / 0.496 / 0.613 / 0.780 / 1.739 / 3.701 / 9.607 for asks of
  0.8 / 1.1 / 1.4 / 1.7 / 2.3 / 3.3 / 5.0 — against the old
  0.75 / 0.75 / 0.75 / 1.50 / 2.25 / 3.76 / 9.76.
- ❌ *Mesh-independence.* **Fails, and the failure now belongs to the solver.**
  Silk habotai measures 0.403 / 0.496 / 0.533 / 0.786 at edges
  1.0 / 1.5 / 2.2 / 3.0 — a 1.95× spread over a 3× refinement, against the 5 %
  the criterion asked for. It was exactly 3.0× before, i.e. pure quantisation;
  what is left is sub-linear and real. See §6.8.
- ✅ *Verdicts rewritten*, and **one earlier withdrawal was itself wrong**:

| fabric | asked | measured | published | verdict |
|---|---|---|---|---|
| cotton poplin | 1.7 | 0.779 | 1.5–2.0 | 1.9× too limp |
| linen | 2.3 | 1.72 | 2.0–2.6 | 1.2× too limp |
| wool crepe | 1.9 | 1.111 | 1.6–2.2 | 1.4× too limp |
| silk habotai | 1.1 | 0.496 | 0.9–1.4 | 1.8× too limp |
| cotton jersey | 1.4 | 0.636 | 1.1–1.8 | 1.7× too limp |
| denim | 3.3 | 3.692 | 2.8–3.8 | **in range** |
| interfaced twill | 5.0 | 9.587 | 4.0–6.0 | 1.6× too stiff |

**All of the above is superseded by §6.9 and §6.8.** The table was measured at
a fixed 30 cm overhang, which is not a Peirce measurement; and on the valid
instrument the readings are mesh-dependent, so no row of it is a verdict. The
two cells measured properly so far, both at `rows 12`: silk habotai
**c = 0.500** (asked 1.1, published 0.9–1.4) and denim **c = 2.105** (asked
3.3, published 2.8–3.8) — both well under their asked values, i.e. the solver
is limper than it is told, which is the same direction the broken instrument
suggested. A full seven-preset table is deliberately **not** recorded here
until the normalisation of §6.8 is fixed, because every row would be
conditioned on one row size and would be the fourth provisional table in a
day.

**Withdrawn, correctly:** silk habotai's "1.2× too limp" / "in range" /
"1.8× too limp" readings of 0.75 / 1.13 — those were `edge/2` at different
edges, and the honest figure at edge 1.5 is 0.496, i.e. **1.8× too limp**.

**Un-withdrawn:** interfaced twill's "1.6× too stiff". Its old 9.76 cm
interpolates to **9.587 cm** — essentially the same number, because
quantisation only bites where the crossing falls inside the first row or two.
At thirteen rows out it is negligible. So that verdict stands, and the
withdrawal of it in this document's first draft was wrong.

**Which changes the sheet-metal conclusion rather than retracting it.** The
preset asks for 5.0 cm, inside its published 4–6 range; the solver *delivers*
9.59 cm, which is in the thin-steel band (8.4 cm for a 0.05 mm shim, 13.4 cm
for 0.1 mm). So the metal look is real, and it is the **solver's calibration
error**, not the preset's value. That is a better answer than either of the
two I gave before.

---

### Step 4 — Shear: measure, then fit, then enable
**State:** open — blocked on a physical measurement (§8.4)


**Status: the mechanism is implemented and the parameters are invented.** This
is the clearest methodological failure of 2026-10-11 and should be corrected
before anything else is built on it.

What is in the tree: `asm.material` carries the flat cut coordinates from
`sewFlat`; `_classifyGrain` gives every edge `bias = sin²(2θ)` in that frame;
both the compliance **and** the yield limit are anisotropic (softening
compliance alone does nothing, because `_clampStrain` holds every edge at
`maxStrain` regardless of stiffness); `report()` splits `grainPct` from
`shearPct`.

What is wrong: `biasCompliance: 25` and `biasStrainFactor: 6` are plausibility
arguments, not measurements, and they are **on by default**. Measured effect:

| | grain % | shear % | contact % | hem Ycm | settled |
|---|---|---|---|---|---|
| edge 2.2, off | 3.65 | 2.45 | 16.3 | 25.83 | yes |
| edge 2.2, on | 4.03 | 2.73 | 16.5 | 25.84 | yes |
| edge 1.0, off | 4.48 | 4.39 | 9.6 | 25.33 | no |
| edge 1.0, on | **11.44** | 16.59 | 10.3 | 25.33 | no |

The trellis does engage at edge 1.0 (shear strain 4.4 → 16.6 %) but it drags
**yarn** strain from 4.5 to 11.4 %, which is the opposite of the intent, and
neither run settles. At edge 2.2 it does nothing at all, as predicted: the
freed length has nowhere to go on a mesh whose finest wrinkle is 8.8 cm.

**Actions, in order.**

1. **Set `biasCompliance: 1` (inert) by default** until identified. The
   mechanism and the reporting stay. *(Needs a decision — see §8.)*
2. **Start from the measured data already in the repo.**
   `sim/cipc/fabrics.md` holds five measured cloths (Wang et al.'s dataset via
   C-IPC) with Young's moduli, Poisson's ratios and strain limits. It is not a
   lookup — that file states the real task plainly: deciding *"how a Young's
   modulus and a Poisson's ratio map onto this project's XPBD compliances."*
   That mapping is a prerequisite for identification of any parameter, shear
   included, and it is the single highest-value piece of modelling work
   outstanding.
3. **Build `tools/shear.mjs`**: bias-extension test (a rectangular specimen
   pulled at 45° to the grain) and/or a picture-frame shear-frame test.
   Report shear angle against force, and the locking angle.
4. **Run the physical experiment** from `docs/06-open-questions.md` §1: 10 cm
   squares of quilting cotton, a stable knit, 2 mm wool felt and a 4-way
   knit, moulded over a 10 cm hemisphere; record the largest cap diameter
   covered before wrinkling; convert to angle defect via `2π(1 − cos θ)`.
   `docs/06-open-questions.md` §8: *"the question I would answer first… every
   other number in this project is downstream of it."* It is still
   unanswered.
5. **Fit** `biasCompliance` and `biasStrainFactor` per preset to the measured
   curves. Hold out the Cusick drape test (Step 2) as validation — do not fit
   to it.
6. Only then enable by default, and re-run the gate.

**Also record from the physical side:** the observed crease pitch on a draped
disc is **~1 cm**. The doc's protocol asks for cap diameter; the crease
wavelength is the complementary number and it sets the mesh requirement
(`edge ≲ λ/4` → 0.25 cm → ~37,500 vertices on a 28 cm disc, ~77× the present
484). Both belong in §1 of that document, which currently holds a prediction
and no data.

---

### Step 5 — Energy and stability diagnostics `tools/energy.mjs`
**State:** open


**Why.** The denim bounce is unresolved and it is an energy question.
Reported behaviour: a 14.3 g denim disc visibly bounces on impact. The
telemetry cannot speak to it, because `drop-settled` samples at a phase
boundary — `maxSpeedCmPerSec: 0.56` is the speed *at rest*, not at impact.
`cloth.js` already contains the measurement in a comment ("undamped, the
centre of mass rebounded 0.3 cm and individual vertices reached 225 cm/s,
twice the 108 cm/s impact speed") with no instrument that reproduces it.

**Build.**
- Per-frame tracking in `stepFrame`/`settle`: peak speed, centre-of-mass
  minimum and maximum, bounce count, and `kinetic()` drift.
- Report `impactSpeedCmPerSec`, `reboundCm`, `bounces` in `drop-settled`.
- Analytic cases: a hanging catenary (closed form), a pinned sheet's static
  deflection, and free fall (checks gravity and drag integration).

**Acceptance criteria.**
- Energy drift per step bounded and reported for every preset.
- Catenary matched to within a stated tolerance.
- A substep sweep (10 / 20 / 40) on the denim disc, reporting rebound. If
  rebound shrinks with substeps it is numerical; if invariant it is the
  bending energy and the question becomes whether `damp: 0.90` is enough.
  The viewer currently defaults to **10** substeps while `tools/fabric.mjs`
  uses **20** — that divergence is itself worth a row.
- Relevant context: denim's flexural rigidity is **1198.6 dyn·cm**, 153× silk
  habotai's 7.8, so *some* springback is physical. The question is how much.

---

### Step 6 — Plasticity and hysteresis in bending
**State:** open


**Why.** Two separate observations converge on it. Real linen does not spring
back — it creases and keeps the crease — yet at **exactly zero** crease
strain the simulated linen still unfolds: stack 6.71 cm against 2.4 expected,
footprint 33.2 cm, and `settled: false` after 6 s, while the limp control
settles at 1.36 cm. And interfaced twill reads as sheet metal on screen even
though its configured bend (5.0 cm) is inside its published range.

Both are the same gap: a fold in this model is a **perfectly elastic hinge**.
Metal springs; cloth takes a set. `docs/11-cloth.md:383` lists "No shear and
no anisotropy"; plasticity is not even on that list yet.

**Build.** A hinge with a yield angle and a retained rest angle, plus a
hysteresis loop on load/unload.

**Acceptance criteria.**
- A creased strip retains a measurable fold angle after release, per fabric.
- Linen's accordion heap settles, and stacks nearer `layers × thickness`.
- Cusick DC (Step 2) does not regress for the fabrics that already match.
- Add the limitation to `docs/11-cloth.md` whether or not it is implemented.

---

### Step 7 — Resolution: adaptive remeshing, or admit the ceiling
**State:** open


**Why.** A 1 cm crease needs `edge ≈ 0.25 cm`, which is ~37,500 vertices on
the yoke disc against 484 today — roughly 77× the elements, and self-collision
cost grows worse than linearly. Uniform refinement is not the answer.

**Read `docs/16-solvers.md` first — this is largely already decided.** Its §3
is *"Drape goes to a side-car, because this solver cannot do contact"*, and its
§6 records that C-IPC *"is the better answer in principle: guaranteed
intersection-free by construction, native point-on-edge stitching… and a table
of measured fabric parameters"* — **and that it builds**, as a submodule with
four recorded fixes. What is open is the boundary: which densities stay here
and which go over the wire.

**Options, to be decided by measurement.**
- **Adaptive anisotropic remeshing** (Narain et al. 2012): refine only where
  curvature demands it. This is the literature's answer and it is a large
  change.
- **Hand the dense case to the side-car.** `docs/11-cloth.md:27` says `sim/`
  already does triangle-against-triangle and edge–edge contact, and C-IPC is
  carried as a submodule for exactly this. CLAUDE.md rule 4 points here.
- **Accept the ceiling and document it**: the viewer is for coarse meshes you
  can watch; fine-crease work is a headless job.

**Acceptance criterion.** A cost-vs-accuracy curve for all three on the same
scenario, with accuracy measured by Cusick DC and fold count against physical
measurements. **Not** a raw speed comparison — see Step 8.

---

### Step 8 — Performance methodology
**State:** open


**Why.** Performance has been quoted as ratios between models of *different*
correctness, which is not a comparison. "Slab is 1.7× vertex mode" is
meaningless as stated: `vertex` mode lets folds cross, so it is not solving the
same problem. The fair figure is **cost at matched accuracy** — `vertex` mode
on a mesh fine enough to stop crossing, which would be far more than 1.7×.

**Build.** Extend `tools/profile.mjs` to emit a cost-vs-accuracy row: wall
time per simulated second against `deepOverlaps`, Cusick DC error and fold
count error, so variants are plotted rather than ranked.

**Baseline to preserve (2026-10-11, accordion, silk, 8 pleats of 8 cm, 45°,
edge 2.0, 6 s simulated):**

| | wall | stack | layers resolved | deep overlaps | mean overlap |
|---|---|---|---|---|---|
| `vertex` | 5.7 s | 2.10 cm | 5.3 of 8 | 6,529 (41.1 %) | 0.184 cm |
| `slab` | 9.9 s | **3.11 cm** | **7.8 of 8** | **5** (0.1 %) | 0.006 cm |

Expected is 3.20 cm. The `slab` path went 35.0 → 9.9 s over the session via:
integer lattice + counting sort instead of string-keyed hashing; edges hashed
directly instead of reached through triangles; a per-frame distance prune
(candidates 116,710 → 7,353, i.e. 23 % → 1.5 % of all edge pairs); no
allocation in the inner loop; CSR rings with integer stamps instead of
`Set.has` per candidate.

**Cell-size sweeps, for whoever tunes it next.** The optimum is *not*
proportional to element size — it tracks how densely the cloth is packed:

| mesh | cell → wall (1–2 s simulated) |
|---|---|
| edge 2.0 | 2.49 → 23.9 s; 1.5 → 18.9; **1.0 → 16.4**; 0.6 → 20.8 |
| edge 1.0 | 0.80 → 68.5 s; 1.13 → 62.4; 1.70 → 56.2; **2.30 → 55.7** |

Default is now `max(1.2, meanEdge × 0.5)`. The curve is flat over most of the
range and the whole remaining knob is worth about 1.2×, so this is a floor
avoiding the bad end of both, not a fit.

**On a BVH.** Worth doing when a profile at a density that matters shows the
broad phase dominating — at 2,560 triangles it was **37.2 %** of the run, so
the ceiling there is about 1.6×. Its advantage is structural: each element
appears **once**, where the grid inserts every triangle into all 8–27 cells
its box covers. Hand-rolled in `app/js` with per-frame refit over fixed
topology; `three-mesh-bvh` is the proven option but it is three.js-coupled and
rule 7 requires this logic be importable headless. An octree or quadtree is
*not* worth it: still space subdivision, so a dense heap stays dense and
elements still straddle nodes.

---

## 6. Known artifacts and open defects

Carried forward, with their evidence, so none of them is rediscovered.

### 6.1 Cantilever readout quantised to `edge/2`
**State:** done 2026-10-11 — fixed by Step 3, then superseded by §6.9

See Step 3. **Every bending verdict in the preset table is suspect.**

### 6.2 Self-collision was blind to crossings; now fixed, but check the ratio
**State:** done 2026-10-11 — `selfCollisionMode: slab`

`clothThickness` 0.4 cm against a 2.0 cm mesh is a ratio of 0.20, and the
nearest vertices of two stacked layers sit about `edge/√3` = 1.15 cm apart
laterally — **2.9× the old detection radius**. Hence `worstOverlapCm` of
0.400, i.e. two surfaces exactly coincident. The `slab` model fixes it
(`deepOverlaps` 6,529 → 5). Note the proximity model assumes thickness is well
under an edge length; below that, elements two rings apart start reporting
contact and inflate the sheet, which `selfRingExclude` guards. For thickness
comparable to the edge the honest answer is C-IPC.

### 6.3 Gate: 2 failures, both attributed
**State:** open — both failures attributed, neither fixed (see §8.2 and §8.5)

Baseline was 277 pass / 1 fail. Now **276 / 2**.

- `test/run.mjs:907` *"and the thickness is the self-collision doing it"* —
  3.11 cm against 1.22 cm with contact off, needing 5×. **This check was
  passing for the wrong reason.** Its control was a limp cloth with a
  zero-radius crease, which had no loft of its own; giving the crease a real
  radius gives the control geometric loft too, so the premise broke, not the
  subject. `docs/11-cloth.md:170` already admitted the old heap "resolves
  about four layers' worth of the eight".
  **Fix: assert on `deepOverlaps` instead of a stack-height ratio.** It
  discriminates 6,529 against 5. Do *not* loosen the 5× threshold — that
  converts a control into a rubber stamp.
- `test/run.mjs:1885` *"and it closes along with everything else"* — 0.252 cm
  against a `< 0.2` threshold. **Attributed 2026-10-11** (was
  [19-todo.md](19-todo.md) item 1): the gate was run in a clean detached
  worktree at `d9d6f01` with an empty `git status`, and there it is **fully
  green — 268 pass, 0 fail — with this check passing at 0.029 cm**, 8.7×
  inside the threshold. So it is a **regression carried by uncommitted work**,
  not a standing defect in committed code.

  Three facts localise it further:
  - the dart test's code is **byte-identical** between the committed and
    working-tree versions — the whole setup block, not just the assertion —
    so the cause is in the solver, not the test;
  - `app/js/drapejob.js` (17 uncommitted lines) is **ruled out**: nothing on
    this path imports it, it only feeds the Blender side-car;
  - **0.252 cm is identical in all four working-tree gate runs**, including
    the first, which ran before `cloth.js` was touched on 2026-10-11 and
    before the shear and `slab` work existed. A number that does not move
    under those changes is not caused by them.

  **Root cause found 2026-10-11** (was [19-todo.md](19-todo.md) item 2), and it
  is **not a defect in the change that exposed it**. The pre-session work
  replaced cross-spring bending with dihedral hinges anchored on Peirce
  bending lengths — `FABRICS` lost `bend: 3e-3` style compliances and gained
  `bendLengthCm` via `rigidityOf`. Nothing in the stitch or feed code changed
  behaviourally (the only edit there sets a `waiting` flag for reporting).

  The dart gap is driven by bending stiffness, monotonically:

  | bend length | `seamGapEndCm` |
  |---|---|
  | preset (linen, 2.3 cm) | **0.252** |
  | 1.0 cm | 0.097 |
  | 0.3 cm | 0.026 |

  — so the old cross-spring model was behaving like a cloth of ~0.3 cm
  bending length, and the committed tree's 0.029 cm is that. Linen's 2.3 cm
  is *inside* its published 2.0–2.6 range (`tools/fabric.mjs:55`), so the new
  value is the better-founded one.

  **But the thread is not what stops it.** The solver's own log says
  `seamsAtTheLimit: 0` with `peakTensionGf: 28`, and `maxStretchPct: 3`
  against linen's `maxStrain` of **0.03**. The cloth is pinned at its strain
  ceiling. Raising that ceiling to any of the **measured** values in
  `sim/cipc/fabrics.md` closes the dart:

  | `maxStrain` | `seamGapEndCm` | `maxStretchPct` | passes `< 0.2` |
  |---|---|---|---|
  | 0.03 (the preset's guess) | 0.252 | 3.0 | no |
  | 0.061 (C-IPC cloth 0) | 0.185 | 6.1 | **yes** |
  | 0.085 (cloth 1) | 0.134 | 8.5 | yes |
  | 0.134 (cloth 2) | 0.030 | 13.4 | yes |

  `maxStretchPct` equals `maxStrain` in every row: the cloth is at its ceiling
  throughout, and the gap is whatever that ceiling leaves unclosed.

  **So the chain is:** correct (stiffer) bending → closing a 20° dart needs
  the cloth to stretch → it hits a **guessed** 3 % limit that is 2–3× tighter
  than every measured woven → the seam stalls 0.05 cm over the threshold. This
  is the **same root cause as §6.6**, reached from the opposite direction, and
  it means the fix is §8 decision 5 — adopt the measured strain limits — not
  reverting the bending model and **not** loosening the `< 0.2` threshold. At
  the most conservative measured value, 6.1 %, the check already passes.

### 6.4 Four defaults changed in one session
**State:** closed — a lesson, no action outstanding

`pleatAngleDeg` 0 → 45, `selfCollisionMode` → `slab`, `biasCompliance` → 25,
`selfCell` formula. Each was individually gated, but stacking them is why
§6.3's second failure took a clean-tree run to attribute rather than a glance
at a diff. **Rule 6 wants one change per baseline.** The clean-worktree run is
cheap (`git worktree add --detach`, one gate) and should be the first move
whenever provenance is unclear.

### 6.5 The viewer cannot run dense self-collision interactively
**State:** open — accepted limitation, mitigations measured

Measured: 876,556 ms of wall time for 12.82 simulated seconds — **68× real
time** — on a 2,400-triangle accordion at edge 1.0. At that density 1 s of
simulation costs ~60 s after optimisation. Levers, measured: edge 2.0 instead
of 1.0 is ~13× (640 vs 2,560 triangles); `pleat 5–6` instead of 10 is ~6×
fewer frames (a 45° pleat at `pleat 10` builds a 44 cm tower that took 12.82 s
of simulation to collapse, against ~2 s for the old pressed stack); `drop 0`
removes the free fall. **The 45° default multiplied settle time ~6× and that
was not flagged when it shipped.**

### 6.6 Drop-test observations, and which were already answered
**State:** done 2026-10-11 — the level-set explanation is **refuted**; see below

From the disc drops at edge 2.2, hole r 7.5:

| | silk habotai | interfaced twill |
|---|---|---|
| weight | 13.7 g | 59.5 g |
| slip | 1.26 cm | 0.57 cm |
| hem height | 25.83 cm | 31.11 cm |
| contact | 16.5 % (80 verts) | 2.9 % (14 verts) |
| median gap | 1.01 cm | 2.60 cm |
| triangles touched | 103 | 12 |
| max stretch | 3.6 % | 1.4 % |
| hole→hem chord | 28.3° | 17.5° |

The twill is plate-like by every column, and 4.3× heavier yet slipping less
than half as far — stiffness, not weight.

**Max strain pinning at the yield limit is not a mystery — the project already
answered it.** `maxStretchPct` read 3.6–4.0 % against silk's `maxStrain` of
4 %, i.e. the cloth was at its ceiling under nothing but 13.7 g of self-weight.
But that ceiling is a **guess**, and `sim/cipc/fabrics.md` plus
`docs/11-cloth.md:400–405` already record that measured wovens stretch
**6–13.4 %** where these presets assume **2–4 %** — 2–3× too tight — and
already predicted the consequence: *"the yoke/slip boundary — which turns
entirely on the cloth refusing to stretch past the shoulder girth — was found
with too stiff a cloth and should be re-run."* So the cloth is hitting an
invented limit, not a material one. **Adopt the measured strain limits (Step 4
of §5, and the mapping work `sim/cipc/fabrics.md` describes) before reading
anything into a strain figure, and re-run the slip sweep afterwards.**

Two secondary suspects remain for the *concentration* of strain, and Step 1
discriminates them: mesh coarseness at the neck, and the missing shear and
crease outlets leaving tension as the only place for excess length to go.

**`deepestEdgeCm 0.3` with `deepestVertexCm 0`: the documented explanation is
wrong.** `docs/11-cloth.md:379` says *"the level set is as sharp as its grid.
0.3 cm at the neck/shoulder crease; halve `cell` and pay for it as the cube in
build time"*, and the coincidence of numbers made that look conclusive. It is
not. Halving the collider cell changes nothing (`colliderCell` is now
reachable from a drop for exactly this check):

| cloth edge | collider cell | `deepestEdgeCm` |
|---|---|---|
| 2.2 | 0.6 | 0.29 |
| 2.2 | 0.3 (build 7.1 s → 14 s) | **0.29** |

**It is chord error in the cloth mesh.** A straight edge of length `L` chording
across a body of local radius `R` sits `≈ L²/8R` inside it. Fitting `R` on the
coarsest point alone gives 2.1 cm — about right for the neck/shoulder crease —
and the next point then predicts itself to 4 %:

| cloth edge | `deepestEdgeCm` | `L²/8R`, R = 2.1 |
|---|---|---|
| 2.2 | 0.29 | 0.288 |
| 1.5 | **0.14** | **0.134** |
| 1.1 | 0.17 | 0.072 |

So the mechanism is established for coarse meshes and **a floor takes over
near edge 1.1** that is neither the chord error nor the level set: halving the
cell there gives 0.17 → 0.20, i.e. no improvement and slightly worse.

**Leading suspect for the floor, untested:** `deepest*` is a MAX over sampled
edge midpoints, and refining the mesh increases the sample count, so the
maximum can rise even as the typical penetration falls. That is rule 2's
complaint about this very family of statistics, one level in: the fix is to
read `insideAreaPct` and a percentile from `clearance.js` alongside it rather
than a max. Until then, `deepestEdgeCm` should not be compared across mesh
sizes.

### 6.7 A run with `substeps: 4` slid off the body
**State:** open — needs a substep floor or a warning

Wool crepe, `slipCm 96.97`, `hemYcm −59.29`, `contactPct 63.9`,
`maxStretchPct 6.0`. Other runs used 10–17. Worth a stability floor, or a
warning, once Step 5 exists.
### 6.8 Bending is miscalibrated, and mesh-dependent
**State:** open — queue item 1 of [19-todo.md](19-todo.md)

**CONFIRMED 2026-10-11 on a valid measurement.** Once §6.9's Peirce bisection
existed, with width-independence established and convergence checked, the
mesh-dependence survived — on the best-conditioned cell available:

| denim | row size | measured c | overhang L |
|---|---|---|---|
| `--rows 12` | 0.275 cm | **2.105 cm** | 4.21 cm |
| `--rows 18` | 0.183 cm | **1.208 cm** | 2.42 cm |

**1.74× for a 1.5× refinement**, finer being limper. Denim was chosen because
nothing about its geometry is marginal — `L` is 4.2 cm against a 0.4 cm cloth
thickness, where a limp silk converges to `L` = 1.0 cm and every ratio in the
test is strained. Two points do not pin an exponent, so none is quoted.

What this eliminates: **not** the instrument (§6.9 is now valid), **not** the
specimen geometry (the clean cell behaves the same), **not** solver
convergence (3× bend sweeps: 0.403 → 0.403; 3× substeps: 0.403 → 0.412), and
**not obviously the compliance formula**, which is the standard
`k = D·|e|²/A_e` and should be mesh-independent on a regular mesh.

**OPEN — this is item 1 of [19-todo.md](19-todo.md).**

**Measured against an analytic ground truth, 2026-10-11** —
`node tools/fabric.mjs --beam`. For small deflections a cantilever droops
`δ = wL⁴/8D`, and since `D = w·c³` here the weight cancels: **`δ = L⁴/8c³`**,
a purely geometric prediction that inverts to `c_eff = (L⁴/8δ)^⅓`. No
threshold, no bisection, nothing the solver can argue with. Denim, asked
`c` = 3.3 cm:

| span | row | drop | predicted | ratio | δ/L | c_eff | c_eff / asked |
|---|---|---|---|---|---|---|---|
| 3.063 | 0.255 | 1.0699 | 0.3062 | 3.5× | 0.35 | 2.175 | 0.659 |
| 3.063 | 0.170 | 2.4402 | 0.3062 | 8.0× | 0.80 | 1.652 | 0.501 |
| 3.063 | 0.128 | 2.7626 | 0.3062 | 9.0× | 0.90 | 1.585 | 0.480 |
| 1.200 | 0.100 | 0.7596 | **0.0072** | **105×** | 0.63 | 0.699 | 0.212 |
| 1.200 | 0.050 | 1.1357 | **0.0072** | **157×** | 0.95 | 0.611 | 0.185 |

**A 1.2 cm tongue of denim droops 7.6 mm where theory says 0.07 mm** — it
hangs nearly straight down, which is qualitatively wrong for a 3.3 cm bending
length. Large-deflection nonlinearity cannot account for it: that *reduces*
droop relative to linear theory, and the rows with `δ/L` above ~0.2 are
outside the closed form's validity in the direction that makes the solver look
*better*, not worse. `c_eff` moves with **both** the row size and the span, so
this is not a constant calibration error and `BEND_SCALE` is not the whole of
it.

**Candidate mechanisms, in the order worth checking** (none yet established —
this is where the work stops):
1. the quantities `bendingStencils` puts in `g.area` and `g.len` may not be
   what `k = D·|e|²/A_e` assumes (combined area of both incident triangles,
   and the shared edge);
2. the XPBD compliance `α̃ = α/h²` competes against `Σ w|∇C|²`, and for a
   dihedral-angle constraint `|∇C| ~ 1/height`, so the balance between the
   two terms is itself mesh-dependent even when `α` is not;
3. `BEND_SCALE` may be dimensionally inconsistent, which a pure constant
   re-fit would hide rather than fix.

The 2D scaling argument says a constant per-hinge stiffness `k = D` **is**
correct — `N ∝ A/ℓ²` hinges each storing `½k(κℓ)²` gives `½Akκ²`, independent
of `ℓ` — so the formula as written should be right, and the defect is more
likely in (1) or (2) than in the algebra.

**The practical consequence is blunt: no bending verdict in this project means
anything without naming the mesh.** A preset is 1.3× too limp at one row size
and 2.3× at another. `BEND_SCALE` cannot be fitted until this is fixed —
fitting at one mesh would bake that mesh into the presets.

The numbers below were taken at the old 30 cm fixed overhang and are retained
only as the trail that led here; their *absolute* claims are withdrawn.

**Found 2026-10-11, once the cantilever stopped quantising** (Step 3). Two
apparent defects, both now known to be confounded by the instrument:

1. **Asked ≠ achieved, nonlinearly.** measured/asked across the presets:
   0.46, 0.75, 0.58, 0.45, 0.45, 1.12, **1.92**. Limp cloths come out at
   about 0.45× of the bending length they were given, stiff ones at up to
   1.9×, crossing over near 3 cm. Six of the seven presets are now out of
   their published range — five too limp, one too stiff — and only denim is
   in. A single monotone correction on `BEND_SCALE` should move all seven,
   because this is one curve, not seven fabrics.
2. **Achieved appears to depend on the mesh — but it is not the solver.**
   Silk habotai: 0.403 / 0.496 / 0.533 / 0.786 cm at edges 1.0 / 1.5 / 2.2 /
   3.0, and going finer, 0.470 at 0.6, 0.588 at 0.4, 0.442 at 0.25 — a
   non-monotonic scatter that never converges. Three things were eliminated:
   - **not solver convergence**: 3× the bend sweeps gives 0.403 → 0.403, and
     3× the substeps 0.403 → 0.412;
   - **not the hinge compliance formula**:
     `g.area / (BEND_SCALE · rigidity · g.len²)` is the standard
     `k = D·|e|²/A_e` form, which is mesh-independent for a regular mesh;
   - **it is the instrument**, per §6.9, plus the resolution problem below.

   At a 30 cm overhang the 41.5° crossing for a limp cloth falls **inside the
   first row** at every edge from 3.0 down to 1.0 (`s* = 0.81 cm` against a
   1.0 cm pitch), so the reading was tracking where one vertex sat. The tool
   now reports `rowsToCrossing` and `rowPitchCm` and refuses to print a
   stiffness verdict under two rows, saying `UNRESOLVED` and naming the edge
   length that would resolve it. That guard is the lasting part of this entry.

(1) explains the interfaced twill reading as sheet metal on screen, and (2)
means no bending verdict is meaningful without stating the edge length it was
measured at. Both are prerequisites for Step 4 and Step 6: fitting shear or
plasticity on top of a bending model that is 2× out and mesh-dependent would
fit the error.

### 6.9 The cantilever is not the Peirce test
**State:** done 2026-10-11 — queue item 4, `peirce()`

**Found 2026-10-11, chasing §6.8.** `tools/fabric.mjs` clamps a **fixed**
overhang and finds the arclength at which the chord from the clamp crosses
41.5°. The Peirce test does the opposite: it slides the specimen out until
**the tip** droops to 41.5°, and reports `c = L/2` for that overhang. The
second quantity is a material property; the first is not, because the strip's
whole shape depends on how much of it is hanging.

Measured, silk habotai at edge 0.4, varying only the specimen length:

| overhang | measured c | rows to crossing |
|---|---|---|
| 4 cm | no crossing | — |
| 6 cm | **2.423** | 12.1 |
| 10 cm | **1.204** | 6.0 |
| 30 cm | **0.588** | 2.9 |

A 4× spread from a parameter that should not appear in the answer, and the
default is the worst of them: a 30 cm overhang on a ~1 cm bending length
hangs nearly vertical, which is the least sensitive regime for a chord-angle
threshold. Lab practice sizes the overhang to a couple of bending lengths —
for these presets that is 2–10 cm, not 30.

**Consequence: every bending verdict this project has recorded is conditioned
on an arbitrary 30 cm overhang**, including the two that survived the
quantisation fix. Denim's "in range" and interfaced twill's "1.6× too stiff"
are withdrawn along with the rest — not because the readings were noisy, but
because the quantity being read is not the one the published ranges describe.
**And the sheet-metal conclusion goes with them, for the third time**: the
twill's 9.587 cm at a 30 cm overhang cannot be compared with a 4–6 cm
published range or with a steel shim's 8.4–13.4 cm until the instrument
measures the same thing the literature does. What stands is the direct
observation, which never used the cantilever: the twill drapes plate-like on
the disc (2.9 % contact, 2.60 cm median gap, 17.5° chord against the silk's
28.3°).

**Fix:** bisect the overhang until the tip chord is 41.5°, then report
`c = L/2`. Each trial is a short strip and therefore cheap. Keep the
interpolation from Step 3 for locating the tip angle between rows, and keep
`rowsToCrossing` as the resolution guard.

**DONE 2026-10-11** (was [19-todo.md](19-todo.md) item 4). `peirce()` in
`tools/fabric.mjs` solves for the free
length by regula falsi on the tip angle — monotone in `L`, so it brackets from
either end and converges in a handful of settles — and reports `c = L/2`, the
overhang it converged on, the row size, how many rows span the free length,
the settle count, and whether the bracket actually closed. With the initial
bracket centred on the `L = 2c` that Peirce's own definition predicts, denim
converges in **5 settles**. The old fixed-overhang reading is kept behind
`--fixed`, labelled in its own header as not a material property.

| acceptance check | result |
|---|---|
| the bisection converges, and says so | ✅ `converged`, `bracketCm`, `settles` |
| independent of specimen **width** | ✅ 0.501 / 0.500 / 0.498 cm at widths 5 / 2 / 1.5 |
| independent of specimen **length** | ✅ by construction — the length is solved for |
| **mesh-independent** to 5 % over 3× | ❌ see §6.8 — this is the solver |

**Two bugs of my own inside this one fix**, both the same shape as the three
faults above and worth recording as such:
1. **The mesh was sized from the trial length** (`edge = L / rows`), which
   makes the measurement self-referential: a shorter trial gives a finer mesh,
   a finer mesh gives a limper cloth (§6.8), a limper cloth droops at a
   shorter length still. Silk habotai ran away to a 0.45 cm specimen on
   0.037 cm triangles — shorter than the cloth is modelled to be thick — and
   reported `c = 0.225`, "4.0× too limp". The element size now comes off the
   **asked** bending length and is held fixed across the bisection.
2. **The settle budget was silently exhausted.** 12 evaluations was not
   enough; silk spent all of them and a truncated bracket was reported as an
   answer. Hence `--settles` and the `converged` column.


---

## 7. Flexural rigidity table, for reference

`rigidityOf(gsm, bendLengthCm)`, dyn·cm. The 408× spread between habotai and
interfaced twill is the dynamic range any of these tests has to cover.

| fabric | gsm | c (cm) | G (dyn·cm) | damp | maxStrain |
|---|---|---|---|---|---|
| silk habotai | 60 | 1.1 | 7.8 | 0.55 | 0.04 |
| cotton jersey | 180 | 1.4 | 48.5 | 0.75 | 0.25 |
| cotton poplin | 120 | 1.7 | 57.8 | 0.75 | 0.04 |
| wool crepe | 220 | 1.9 | 148.0 | 0.85 | 0.06 |
| linen | 190 | 2.3 | 226.8 | 0.80 | 0.03 |
| denim | 340 | 3.3 | 1198.6 | 0.90 | 0.02 |
| interfaced twill | 260 | 5.0 | 3188.3 | 0.90 | 0.02 |

---

## 8. Decisions needed

These are not mine to make.

1. **Disable the shear defaults pending identification?** Recommended:
   `biasCompliance: 1`. It is an unvalidated change to physics that currently
   makes yarn strain worse at fine meshes. The mechanism and reporting stay.
2. **Swap the accordion gate check to `deepOverlaps`?** Recommended yes. The
   alternative is loosening a threshold to fit new behaviour, which this repo's
   rule 6 exists to prevent.
3. **Step 7: remesh, side-car, or documented ceiling?** The side-car is the
   cheapest and the repo already points at it; adaptive remeshing is the
   literature's answer and a large piece of work.
4. **Which physical measurements will actually be made?** Everything in Step 4
   and most of Step 2's calibration depends on it. The two that unblock the
   most: the hemisphere cap diameter before wrinkling (shear), and the crease
   pitch plus fold count on a draped disc (drape and resolution).
5. **Adopt the measured strain limits from `sim/cipc/fabrics.md`?**
   **Now the strongest-evidenced item on this list:** it is the root cause of
   the dart-closing gate failure (§6.3) *and* of the disc's strain pinning
   (§6.6), and at the most conservative measured value (6.1 %) the failing
   check passes. The presets assume 2–4 % where the measured wovens are
   6–13.4 %, and `docs/11-cloth.md:400–405` already says the yoke/slip
   boundary should be re-run if so. This changes the headline result of the disc test, so it is a
   decision and not a cleanup. It also requires the modulus-to-compliance
   mapping, which is the largest single piece of modelling work on this list.

---

## 9. What not to do

- **Do not tune constants to match a screenshot.** The interfaced twill
  reading as sheet metal is a modelling and resolution result; pushing
  `bendLengthCm` away from its measured range to fix the look would corrupt
  the one axis that is calibrated.
- **Do not compare performance across models of different accuracy.** See
  Step 8.
- **Do not trust a verdict from an instrument whose resolution has not been
  checked.** The cantilever's `edge/2` quantisation produced a spurious
  "in range" for a fabric whose stiffness it could not resolve at all.
- **Do not change a default without a baseline and a regression run**, and
  not more than one at a time — CLAUDE.md rule 6, and §6.4 is the cost.
- **Read `docs/` before proposing a direction.** On 2026-10-11 the project's
  own documents already contained the answer three times:
  `docs/11-cloth.md:377` (self-collision is vertex–vertex, folds can cross),
  `docs/01-geometry.md:142` and `docs/11-cloth.md:383` (no shear and no
  anisotropy), `docs/06-open-questions.md` §8 (the shear experiment is the
  first question to answer). That is rule 5, and it was broken three times in
  one session.
