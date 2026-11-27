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

This document is the **spec** of the pair in `todos/`; its working queue is
[19-todo.md](19-todo.md). Items are taken from here, added on top of the queue
with an identifier, and once done are marked done there and referenced here,
against whatever step, artifact or decision they settled. So an entry here that
carries no "done" reference is work still to be queued, and that is how the
next item is chosen.

**Every section carries a `**State:**` line directly under its heading**, so
finding the next candidate is `grep -A1 '^###' todos/18-validation.md` and not
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
  bending-length ranges. Has `--scan`, `--edge` and, **new 2026-10-17**,
  `--mesh-law`: measured bending length against element size, which is what
  found §6.12. **Its readout is quantised to `edge/2`** (see §6.1); the
  instrument is sound, the reporting is not.
- `tools/accordion.mjs` — the thickness/self-collision heap test. Now reports
  crease strain, pleat angle, layer rise.
- `tools/trace.mjs` — arrange → sew → weld → drape as a table; `--sidecar`.
- `tools/drape_blender.mjs` — this solver against Blender on one metric.
  **Its fixture is sewn by THIS project's solver (§6.15)**, so a change to
  our sewing moves Blender's column too. `BEND_SCALE` is pinned at the
  sewing step since 2026-10-18 and no longer leaks; every other sewing term
  still does, so cross-session comparisons remain suspect until the sewn
  mesh is cached.
  **2026-10-17:** `--fabric`, `--all` and `--edges` sweep the presets by
  stiffness and by mesh, `--settle` sets the budget, and every row reports
  whether it converged.
- `app/js/cantilever.js` — **new 2026-10-18.** `peirce()`, `tipAngle()` and
  `PUBLISHED_BEND`, three.js-free. The single implementation behind
  `tools/fabric.mjs`, `test/run.mjs` and the viewer's
  `tests > cantilever (Peirce)`; the first two previously had one each,
  measuring different quantities (§6.13). All three now report 1.793 cm for
  cotton poplin.
- `app/js/cusick.js` + `tools/drape_coefficient.mjs` — **new 2026-10-17.**
  The Cusick drape test (Step 2), DC on a 0-100 scale against published class
  bands, with per-row `settled` and `starShaped` validity flags, the mesh's
  fold ceiling, `hemDropCm`, and `--trace` / `--bend` / `--stretch` /
  `--sweeps` / `--jitter` / `--no-drag` / `--no-damping` discriminators. Also
  reachable from the viewer as `tests > drape (Cusick)`.
- `tools/profile.mjs` — **new 2026-10-11.** V8 sampling profiler via node's
  inspector; self time per function, plus broad-phase counters. `--scenario`,
  `--cell`, `--mode`, `--edge`.
- `app/js/clearance.js` — distribution and location of cloth against body.
- `Cloth.selfOverlaps()` — **new.** Cloth through itself: `inContact`,
  `deepOverlaps` (past half thickness), `meanOverlapCm`, `worstOverlapCm`.
- `Cloth.report()._shearReport()` — **new.** Strain split grain vs bias.
- `test/run.mjs` — the regression gate. 310 checks, **310 pass, 0 fail** as
  of 2026-10-18 — and for the first time that statement includes bending,
  measured as the material property. **Its cantilever check was a false
  green until that day** (§6.13): it measured with the
  fixed-overhang method §6.9 withdrew, and passed at 1.77 cm while the
  material property read 0.93. It now calls the same `peirce()` the tool
  does, and **is expected to FAIL until the bending repair lands** — which is
  the point. "The gate is green" was not a statement about bending before,
  and cannot be one again until §6.12 is fixed.
- Viewer telemetry → side-car `/log`, with phase metrics on every event.

**What does not exist**

(Two entries left this list on 2026-10-17: the standard drape benchmark, now
`app/js/cusick.js`, and the mesh-convergence trend, now partly covered —
see above.)

- Any **shear measurement**. No bias-extension, no shear frame. The shear
  model shipped on 2026-10-11 has **invented** parameters.
- A **general convergence harness** (Step 1). Two instruments now sweep mesh
  and report the trend — `tools/fabric.mjs --mesh-law` and
  `tools/drape_coefficient.mjs --edges` — but they are per-instrument, not
  the shared harness Step 1 specifies.
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
**State:** **built 2026-10-17** (`app/js/cusick.js` + `tools/drape_coefficient.mjs`).
The acceptance criteria below are partly met: DC and fold count for the presets,
published class bands, a verdict per fabric, and the mesh's fold ceiling printed
beside the count. Not yet done: the three mesh sizes of Step 1, and a viewer
entry in the `tests` menu. First results are in §6.12.

Originally **asked for from the viewer, 2026-10-17**, which raised it
in the queue. The request was for "something we can run that shows whether it
behaves like linen, cardboard, a metal sheet or cotton candy". That is this
test: DC is **1** for a rigid sheet and tends to **0** for a limp one, and
`tools/fabric.mjs` already carries `(80 gsm office paper)` in `PUBLISHED`, so
the cardboard end of the scale is in the repo. It therefore wants a menubar
entry as well as a tool — see [19-todo.md](19-todo.md).

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
**State:** mostly done 2026-10-12 — geometry computed, locking angles from the literature, shear enabled; only `biasCompliance` is unmeasured


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

**The geometric half is answered — 2026-10-12.** `node tools/shearnet.mjs`
computes a pin-jointed net on a sphere and converts a locking angle into the
curvature it absorbs: γ = 15° covers a cap of half-angle **43.8°** carrying
**1.751 sr = 100°** of angle defect, scale-free (verified across R = 5/10/20 cm
and four cell sizes; converges from above). `docs/06-open-questions.md` §1 has
the table.

Two consequences for this step. **`biasStrainFactor` is no longer a guess:**
shearing a cell by γ takes its diagonals to `√(1 ± sin γ)`, so a 15° trellis
needs 12.2 % on a 45° edge, which against the measured 6.1 % grain limit is a
factor of **2.0** — not the 6 it was given. And **the experiment got cheaper**:
the locking angle can be read by shearing a square by hand until it ripples,
instead of moulding over a hemisphere and measuring a cap. `biasCompliance`
still needs force data and remains unmeasured.

**Also record from the physical side:** the observed crease pitch on a draped
disc is **~1 cm**. The doc's protocol asks for cap diameter; the crease
wavelength is the complementary number and it sets the mesh requirement
(`edge ≲ λ/4` → 0.25 cm → ~37,500 vertices on a 28 cm disc, ~77× the present
484). Both belong in §1 of that document, which currently holds a prediction
and no data.

---

### Step 5 — Energy and stability diagnostics `tools/energy.mjs`
**State:** part done 2026-10-11 — impact tracking built and the bounce answered; energy drift and the analytic cases remain


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

**DONE 2026-10-11: the per-frame tracking, and with it the reported bounce.**
`_trackMotion()` runs once per frame and `report()` carries
`peakSpeedCmPerSec`, `impactSpeedCmPerSec`, `reboundCm` and `bounces`. A
bounce is a trough in the centre of mass followed by a crest, with a 0.05 cm
floor — half a cloth thickness — so jitter crossing zero does not count.

The reported denim bounce is **real and measured**. Disc r 15, hole 9.5, drop
4 cm, 10 substeps:

| fabric | weight | rebound | bounces | rigidity | `damp` |
|---|---|---|---|---|---|
| denim | 14.3 g | **1.838 cm** | **6** | 1198.6 | 0.90 |
| interfaced twill | 10.9 g | **2.447 cm** | **8** | 3188.3 | 0.90 |
| silk habotai | 2.5 g | **0** | **0** | 7.8 | 0.55 |

**It tracks flexural rigidity, not damping** — the two that bounce are the two
with the *highest* internal damping, and the limp silk does not bounce at all.
So it is stored bending energy returning, which is what was argued from the
presets earlier and is now measured rather than asserted. "Denim has no
elasticity" is true of its *tensile* behaviour and irrelevant to this: a
cantilever stores energy in curvature.

**And it is partly numerical.** Denim, substeps swept:

| substeps | rebound | bounces | `grainOverLimit` |
|---|---|---|---|
| 10 | 1.838 | 6 | 0.68 |
| 20 | 1.856 | 6 | 0.24 |
| 40 | 1.534 | 5 | 0.06 |
| 80 | **0.918** | **4** | 0.01 |

Eight times the substeps **halves** the rebound but does not remove it, so
there is a genuine elastic component with a solver component on top. Settling
which is which needs the energy-drift half of this step, below.

**`impactSpeedCmPerSec` is not trustworthy** and is marked so in the code: it
is the peak speed at whichever frame contact was first *detected*, and it read
131 / 200 / 140 / 159 cm/s for the same drop across that sweep. `reboundCm`
and `bounces` converge; that one samples. Note also that `peakSpeed` exceeds
`impactSpeed` for every fabric including the silk, which is partly the hem
whipping as the centre decelerates — a real effect — and cannot be read as
energy injection without the drift measurement.

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
**State:** done 2026-10-12 — both fixed; gate 278 pass, 0 fail

Baseline was 277 pass / 1 fail. Now **276 / 2**.

- `test/run.mjs:907` *"and the thickness is the self-collision doing it"* —
  3.11 cm against 1.22 cm with contact off, needing 5×. **This check was
  passing for the wrong reason.** Its control was a limp cloth with a
  zero-radius crease, which had no loft of its own; giving the crease a real
  radius gives the control geometric loft too, so the premise broke, not the
  subject. `docs/11-cloth.md:170` already admitted the old heap "resolves
  about four layers' worth of the eight".
  **FIXED 2026-10-11** (queue item 6): the check now asserts the proposition
  itself — `deepOverlaps`, pairs more than half a thickness through each other
  — instead of inferring it from heap height. In the gate it reads **5 against
  35,206** with contact off (worst 0.329 cm against 0.400, i.e. two surfaces
  exactly coincident), a 7,000× discrimination where the height ratio could
  not separate 3.11 from 1.22. The 5× height threshold was **not** loosened;
  the margin is 20× with a floor of 20, so the test cannot pass vacuously and
  does not assert a convergence tolerance by demanding exactly zero. **Gate:
  277 pass / 1 fail**, back to its pre-session pass count.
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
**State:** done 2026-10-11 — level set refuted, chord error confirmed, and `insidePct` is the metric to compare

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

**The floor was a statistic, not a defect — tested 2026-10-11.**
`penetration()` now returns the distribution behind its maxima (`insidePct`,
`medianInsideCm`, `p95InsideCm`, `meanInsideCm`), and with it the answer is
plain:

| cloth edge | samples | worst | p95 | median | mean | **insidePct** |
|---|---|---|---|---|---|---|
| 2.2 | 2,684 | 0.29 | 0.224 | 0.079 | 0.090 | **4.55** |
| 1.5 | 6,016 | 0.14 | 0.070 | 0.032 | 0.034 | **1.16** |
| 1.1 | 10,912 | 0.22 | 0.168 | 0.047 | 0.060 | **0.31** |

**The EXTENT of penetration converges monotonically and strongly — 4.55 % →
1.16 % → 0.31 % of sampled points inside, a 15× reduction.** Contact is doing
its job and getting better with refinement, exactly as it should.

The *depths* do not converge, and my sampling-count hypothesis was only half
right: it is not merely that more points are looked at, but that **fewer and
fewer are inside at all** — 0.31 % of 10,912 is about 34 points — so a p95
over that set is essentially its second-worst member. Depth maxima *and*
percentiles over a shrinking inside-set are tail statistics of a handful of
points at the highest-curvature feature, and they are not comparable across
mesh sizes.

**So: compare `insidePct`; do not compare `deepestEdgeCm`, `p95InsideCm` or
`worstCm` across meshes.** The chord-error mechanism above stands for the
coarse end, where penetration is widespread rather than confined to a few
points.

### 6.10 The viewer ran two simulations of one fall, and showed the wrong one
**State:** done 2026-10-12 — the side-car's own frames are streamed and played; one simulation

Pressing **X** welded the garment and then ran the LOCAL solver's fall so
there was something to animate, while the side-car draped the same garment in
Blender. Two simulations of one event — and the one on screen was the one
whose contact is a point query per vertex, which `docs/16-solvers.md` §3
measures at 1.26 % of the cloth area inside the body against Blender's 0 %.
When the side-car's answer arrived it was pasted straight over whatever the
local fall had reached, so the view **snapped backwards**: reported as "I saw
gravity, but then it teleported back up".

From the telemetry of that session:

```
10:11:41  welded         playing=True   weldedPct 73.7   seam gap 2.698
10:11:42  sidecar-start  playing=True
10:12:10  sidecar-done   playing=False  simSeconds 1.32  seam gap 3.172
```

The job was despatched 0.6 s after the weld, so Blender draped the garment as
it was *before* the fall; the result landed 28 s later over a local state that
had moved on for 1.32 s of simulated time. The seam gap going 2.698 → 3.172
across the swap is that mismatch, not an improvement. The guard in
`sendToSidecar` checked whether the garment had been *rebuilt*
(`if (asm !== target)`) and not whether it had **moved**.

**Fixed by deleting the second simulation rather than reconciling it.**
`bake()` in `sim/blender_drape.py` was stepping all 180 frames and reading the
mesh once, at the end; it now flushes each captured frame as a JSON line while
it solves, `GET /frames?session=…&from=N` reads whatever has landed — the same
append-and-tail pattern the side-car already used for its log — and the viewer
plays those frames instead of stepping anything. `playing = !params.useSidecar`
at the weld, and `stepFrame()` hands the vertices to the playback, so the two
can never both be writing them. The settled pose is applied as the last frame
rather than mid-fall, which removes the race by construction.

Verified end to end: frames arrive **during** the solve — first at 8.0 s
(Blender startup), then one every ~1.4 s, done at 28.7 s.

**The honest limitation.** Blender solves about **6 frames of simulated time
per second of wall clock**, so a 6-second fall cannot be watched in under
~30 s. It plays in slow motion, interpolated up to the render rate so it is
continuous rather than six jumps a second. There is no way round that without
a faster solver; the alternative was smooth motion that was a different and
wrong computation.

**The collider was the biggest cost term, and is now measured.** It was
96 × 64 = 12,288 triangles against a garment of 1,872, tested every frame.
Difference from that drape on a four-panel skirt:

| collider | wall | median | p95 | max | beyond one cloth thickness |
|---|---|---|---|---|---|
| 12,288 (96×64) | 30.8 s | — reference — |
| **6,144 (64×48)** | **20.7 s** | **0.154 cm** | **0.38** | 0.742 | **4.4 %** |
| 3,072 (48×32) | 14.9 s | 0.288 | 0.496 | 0.970 | 14.7 % |

64 × 48 is the new default in `drapejob.js`: p95 inside the cloth's own 0.4 cm
thickness for a third off the wall time. **Caveat kept in the code:** that is
difference from the previous default, not from truth — whether 96 × 64 was
itself converged has never been checked, and doing so needs a 128 × 96 run.

**A claim withdrawn.** I reported a "14 s client timeout discarding a
completed 53 s job". There is no timeout in that path: only `health` (2 s) and
the new `drapeFrames` (4 s) abort, and the server's subprocess limit is 600 s.
The event order settles it — `sidecar-failed` at 10:09:17.782 with Firefox's
`NetworkError when attempting to fetch resource`, then `session-start` 0.6 s
later. The page was reloaded mid-job. Nothing to fix.

### 6.11 ANSWERED: the presets are not the fault; bending is

**Reported 2026-10-17 from the screen; measured the same day.** The answer is
below the original report, which is kept because the shape of the report is
the lesson.

`node tools/drape_blender.mjs --all` — the same sewn four-panel skirt, the
same body, the same 52 pinned waist vertices, only the fabric changing, this
solver against the oracle:

| fabric | bend cm | fold depth, ours | fold depth, Blender | ratio |
|---|---|---|---|---|
| silk habotai | 1.1 | 10.42 | 9.55 | **0.92** |
| cotton jersey | 1.4 | 11.14 | 10.15 | **0.91** |
| cotton poplin | 1.7 | 3.48 | 7.07 | 2.03 |
| wool crepe | 1.9 | 2.54 | 8.90 | 3.50 |
| linen | 2.3 | 1.06 | 7.03 | 6.63 |
| denim | 3.3 | 0.50 | 6.25 | 12.5 |
| interfaced twill | 5.0 | 0.20 | 5.82 | **29.1** |

**Blender's fold depth moves by a factor of 1.6 across the whole range of
stiffness. Ours moves by a factor of 52.** The two agree at the limp end and
diverge monotonically with bending length.

That rules the data out. A wrong strain limit — the thing §8.6 adopted from
Wang et al. — shifts every fabric together; it cannot produce a gap that is
absent at 1.1 cm and 29× at 5.0 cm. What varies with bending length is the
bending.

Checked against the per-fold distribution rather than the `max - min` scalar,
because one fold standing out would produce the same number for a different
reason. Interfaced twill:

- ours: **2** folds, `0.20  0.19` cm
- Blender: **4** folds, `5.66  5.43  3.95  3.69` cm

Uniform at both ends, so the collapse is the whole hem and not an outlier.
On the per-fold mean the ratio is 23.4×.

**What this costs, stated plainly:** every preset stiffer than cotton poplin
is unusable for judging drape by eye. At interfaced twill the garment hangs as
a smooth cone with two 2 mm undulations. Any impression of the fabric
parameters formed by looking at linen, denim or twill on screen was formed
through a solver that cannot render them — which is precisely why the report
that opened this section could not be acted on as a fabric problem.

This is §6.8 (bending miscalibrated and mesh-dependent) and §8.5 (the deficit
accepted and named), measured on a garment instead of a cantilever strip, with
the practical consequence attached. **Nothing in `FABRICS` changes on the
strength of it.** The fix is in the bending; Step 7 is where that lives.

**And it is not simply "too stiff", which is what the table above looks like
on its own.** `node tools/fabric.mjs --fabric denim`, run the same day:

```
denim   2.24 cm  (asked 3.3, published 2.8-3.8)   1.2x too limp
```

On the Peirce cantilever, at **0.275 cm** rows, denim bends *too easily*. On
the skirt, at **3.0 cm** triangles, the same denim at the same nominal bending
length folds 12.5x too little. **Same fabric, same parameter, opposite
errors, meshes a factor of ten apart.** A single compliance correction that
fixed either reading would worsen the other.

That is the mesh-dependence of §6.8 caught with a sign change rather than
inferred, and it is the most useful thing in this section: it says what the
repair is not. The quantity to go after is how the solver's *effective*
bending length varies with edge length, measured with both instruments on the
same fabric at both scales.

#### The mesh sweep, and why it did not settle the question

`node tools/drape_blender.mjs --edges 1.5,3,4.5 --fabric denim`:

| edge cm | ours, mean fold | Blender | ratio | folds, ours / Blender | settled |
|---|---|---|---|---|---|
| 1.5 | 1.56 | 4.71 | 3.02 | 4 / 4 | **false** |
| 3.0 | 0.47 | 4.34 | 9.23 | 2 / 4 | true |
| 4.5 | 0.82 | 3.09 | 3.77 | 2 / 4 | true |

**The 1.5 cm row is not a measurement.** `settle({ maxSeconds: 6 })` was
hard-coded; at 4104 vertices that budget expired with the cloth still moving,
after 319 s of wall time. The non-monotonic ratio — 3.02, 9.23, 3.77 — may be
nothing but an unconverged run being compared against converged ones. It was
written up as a trend before that was noticed, which is the same error as
quoting a scalar without its distribution: a number was taken at face value
without the one field that says whether it means anything. `settled` now
prints beside every row, spelled out as `NOT SETTLED -- not a measurement`.

Two things the sweep does establish:

- **Blender is mesh-dependent too**, 4.71 → 4.34 → 3.09, a factor of 1.5. So
  the *ratio* conflates two mesh dependencies and is the wrong statistic for
  this question. Each solver's own variation is the readable one: between the
  two converged points, ours moves 1.7× (0.47 → 0.82) and Blender's 1.4×.
  Comparable.
- **Therefore the deficit is mostly not the mesh.** At every resolution tested
  the garment folds 3–9× too little, and that is larger than the variation
  with resolution.

And one symptom sharper than any of the depths: **Blender finds 4 folds at all
three resolutions; we find 2 at both coarse ones.** A shallower version of the
same drape would keep the count and lose the depth. Landing on half the folds
is a different buckling mode, which points at mode selection rather than at a
scalar being mis-scaled. That is a hypothesis and is not yet tested.

**So the framing in the item that prompted this sweep — "flat ratio means a
stiffness error, varying ratio means mesh-dependence" — is too clean and
should not be used.** It is neither, on this evidence.

#### The fine mesh, converged as far as it goes: THE FOLDS DECAY

`--edges 1.5 --fabric denim --settle 30`, 1682 s of wall clock, and **still
`NOT SETTLED`**. What it did with the extra budget is the finding:

| | mean fold | every fold, cm | folds |
|---|---|---|---|
| ours, 6 s budget | 1.56 | — | 4 |
| ours, 30 s budget | **0.64** | `0.75 0.72 0.56 0.53` | 4 |
| Blender | 4.71 | `5.88 5.55 5.06 2.37` | 4 |

**Simulating longer makes the garment flatter.** 1.56 → 0.64 cm as the budget
went 6 s → 30 s, while Blender holds its folds indefinitely. That is not "too
stiff to fold": the cloth *does* buckle, and then the buckled state bleeds
away. Energy is leaving the system — damping, drag, or a bending constraint
that does not hold its rest state — and the longer it runs the less garment
there is.

**And the fold count converges to Blender's.** 4 folds at 1.5 cm against 2 at
3.0 and 4.5 cm, where Blender finds 4 at every resolution. So the question
asked of this sweep — does the count reach 4 as the mesh refines? — answers
**yes**.

That splits the defect in two, and they are not the same repair:

- **mode selection is discretisation** and improves with mesh;
- **depth is not**, and at the resolution where the modes agree it is still 7×
  short *and shrinking with simulated time*.

The second is the one to chase, and "folds that decay" is a much sharper
symptom than "folds too shallow" — it says to look at what removes energy
between substeps, not at the bending compliance.

**CORRECTION, same day: damping is exonerated and the decay framing above is
wrong.** `tools/drape_coefficient.mjs --trace` shows the Cusick specimen
reaching a *static* equilibrium in 4 s — `rms 0.00 cm/s`, DC 97.7, unchanged
through 24 s. Run again with `--no-drag --no-damping`, removing the drag terms
and internal damping entirely: **DC 97.7, identical.** A static equilibrium is
set by forces; what removes energy governs the path to it, not the
destination. So nothing in the damping or drag can be the cause, and the
skirt's 1.56 → 0.64 cm was slow convergence toward the same too-flat
equilibrium rather than energy leaking out of a buckled state. The sentence
above stands only as a record of a hypothesis that measurement killed.

Two instruments were wrong and were fixed to get this far, both recorded here
because they are why the answer took three runs:

- **`tools/drape_blender.mjs` was hard-coded to cotton poplin.** The single
  most informative property of this defect is that it varies with stiffness,
  and a comparison that cannot change the fabric cannot see it. Now `--fabric`
  and `--all`, with a sweep table sorted by bending length and the ratio per
  fabric, so the distinction that matters — a constant ratio (one calibration
  error) versus a ratio that tracks stiffness (the mesh-dependence) — is read
  off the output rather than argued.
- **`tools/fabric.mjs` printed nothing for thirty minutes.** Not slowness, and
  not the end-of-run `console.table`: **Node's stdout is asynchronous when it
  is a pipe.** Writes buffer and flush when the event loop turns, the
  measurement loop is synchronous and CPU-bound from the first fabric to the
  last, so no line ever reached the pipe until the process exited. One run was
  abandoned at ten minutes as hung. Moving the print statements does not fix
  it — the first attempt did exactly that and failed again. It needs
  `fs.writeSync(1, ...)`, a synchronous write to the descriptor. Straight to a
  terminal it would always have worked, which is how it survived this long.

#### The original report, as made



**Observed 2026-10-17, from the screen, not from an instrument.** (Answered
above; this is what was said before anything was measured.) The
parameters adopted from Wang et al.'s dataset (§8.6, the flat 6.1 % woven
strain floor) "do not seem very realistic when applied in the tool", with
Blender's cloth simulation taken as the reference for what realistic looks
like.

**This is recorded as an open question, not as a defect in the data, and
deliberately so.** `CLAUDE.md` rule 1 carries the cost of the same shape of
report twice: findings written up as fabric-parameter problems whose cause was
the gravity axis. An observation that cloth looks wrong does not name the
component that is wrong, and three candidates are live:

1. the preset values themselves;
2. the solver's bending, which §6.8 already records as miscalibrated **and
   mesh-dependent**, and §8.5 accepts as a known deficit — so a preset that is
   correct can still look wrong on screen;
3. the mapping in `drapejob.js` that turns a bending length into what Blender
   is told, which `tools/fabric.mjs --blender` prints beside Blender's own
   presets precisely so it can be checked.

Note that (2) is already written down as true. A preset cannot be judged by
eye through a solver that is known to bend wrong, which is why the first move
is the comparison and not an edit.

**What settled it:** §3b of [16-solvers.md](../docs/16-solvers.md) makes the side-car
the oracle. The same specimen and the same nominal cloth through both solvers
gives a statement of the form *"we read N× too stiff and Blender reads the
same"* (the data is wrong) or *"Blender reproduces the published band and we
do not"* (the solver is wrong). The second sentence is the one that came out.

Worth noting which of the three candidates listed below was right: **(2), the
one already written down in this document as true.** The observation was
reported as a fabric problem, the fabric was the one component that had
recently changed, and the defect was in the component that had been known to
be broken for five days. That is the whole argument for comparing against the
oracle before editing anything.

---

### 6.12 Cusick: the cloth behaves like card, on the standard scale

**First results, 2026-10-17**, `node tools/drape_coefficient.mjs`. 30 cm
specimen on an 18 cm support, the standard geometry, 1 cm triangles, 20 s
settle. DC is a percentage: **100 is a sheet of card, 0 is a cloth with no
stiffness at all.**

| fabric | DC | published class band | folds |
|---|---|---|---|
| cotton poplin | 96.4 | 40–65 | 0 |
| linen | 98.1 | 50–75 | 0 |
| wool crepe | 97.0 | 35–60 | 0 |
| silk habotai | 87.4 | 15–35 | 4 |

(Partial — the sweep was restarted with a corrected fold counter; the DC
figures above are from the first run and the fold figures from the second.)

**Every preset is reading as card.** Not "stiffer than it should be" — at the
top of a scale whose ceiling is a rigid sheet, with no folds at all in three
of the four. A habotai, the limpest cloth in the table, reads 87 where its
class sits at 15–35.

This is the skirt result of §6.11 on an independent scale with published
bands, and it is the strongest statement available of the problem the viewer
was reported to have: the cloth does not drape. The two instruments share a
solver but nothing else — different geometry, different support, different
metric, different literature — and they agree.

**The instrument's own defect, found and fixed in the first hour, recorded
because it is the more instructive half:** the fold counter reported **30 and
32 folds against a mesh ceiling of 23.** A count above what the triangles can
represent is not a fold count; it was discretisation noise on an outline that
is very nearly a circle, read as peaks. And it failed in the worst possible
direction — a specimen that *barely drapes* has an almost constant radius, so
noise is all there is, and the count came out high, reading as "lots of folds"
when the truth was "no drape at all". A fold must now exceed `edge / 4` in
prominence to count, which is a property of the mesh rather than a tuning
constant. Poplin went from 30 folds to **0**, with DC unchanged at 96.4 —
which is the self-consistent answer, because no folds and a 96 % shadow are
the same statement.

The ceiling was printed beside the count from the first version precisely so
that a mesh-limited result could not be mistaken for a material one. It earned
its place within the hour, on its own author's code.

**The viewer and the headless path agree, checked rather than assumed.** The
`drape (Cusick)` menu entry and `tools/drape_coefficient.mjs` both report
**DC 97.2, 0 folds, not settled** for cotton poplin at 1.2 cm triangles. They
share `app/js/cusick.js` — `setupCusick` and `measureCusick` are split out of
the settle precisely so the page cannot drift into a second implementation,
which is how the two paths diverged before. The agreement extends to the
failure: both decline to call 97.2 a measurement.

A loose end worth recording rather than chasing: poplin settles at 1.0 cm and
at 1.5 cm but **not at 1.2 cm** within 20 s. Non-monotonic in the mesh, and
unexplained.

#### What the drape coefficient says across the presets

All seven at 1 cm triangles, 20 s budget:

| fabric | DC | published class | |
|---|---|---|---|
| silk habotai | 87.4 | 15–35 | 2.5× too stiff |
| cotton jersey | 93.3 | 20–40 | 2.3× |
| wool crepe | 97.0 | 35–60 | 1.6× |
| cotton poplin | 96.4 | 40–65 | 1.5× |
| linen | 98.1 | 50–75 | 1.3× |
| denim | 90.1 | 65–90 | 1.0× — **not settled** (2257 s) |
| interfaced twill | 89.1 | 80–97 | in band — **not settled** (2547 s) |

**Every preset lands between 87 and 98 where the published bands span 15 to
97.** An 82-point range compressed into eleven points. Interfaced twill reads
"in band" only because its band sits at the top of the scale; it is not right,
it is lucky.

So the statement is not "the cloth is too stiff" but **"the drape barely
responds to the fabric at all"** on this test. Note that this sits awkwardly
against §6.11's skirt result, where our fold depth varied **52×** across the
same presets while Blender's varied 1.6× — hypersensitive there, insensitive
here. No account covering both is offered, because none has been measured.

`hemDropCm` discriminates where DC cannot: poplin's hem falls 1.14 cm of a
6 cm overhang, silk's 3.53 cm. When nothing drapes, every DC is near 100 by
construction, so a high DC is ambiguous between "too stiff to fold" and "not
bending at all" — which is why the hem drop was added to the result.

#### THE ANSWER, as far as today's evidence reaches: bending in double curvature

The drape responds violently to the bending length and then **saturates**.
Cotton poplin, 1.5 cm triangles, `--bend` overriding the preset:

| bend length | DC | hem fell | folds |
|---|---|---|---|
| 1.7 cm (its asked value) | 97.7 | 1.14 / 6 cm | 0 |
| 0.8 cm | 69.9 | 4.93 | 9 |
| 0.3 cm | 35.0 | 5.37 | 0 |
| 0.05 cm | 18.2 | 5.64 | 2 |

So "the drape barely responds to the fabric" — written two sections above — is
wrong. It responds enormously, and saturates above about 1.5 cm of bending
length, which is where **all seven presets sit** (1.1 to 5.0 cm). The 87-98
range they produce is saturation, not insensitivity.

**And the offset is not the mesh.** The bending length that puts poplin in its
published 40-65 band, measured at three resolutions:

| bend length asked | DC @ 2.0 cm | DC @ 1.5 cm | DC @ 1.0 cm |
|---|---|---|---|
| 0.4 | 18.4 | **50.5** | 26.7 |
| 0.8 | **62.3** | 69.9 | 73.6 |
| 1.2 | 90.8 | 90.5 | 91.1 |
| 1.7 | 97.6 | 97.7 | 96.4 |

The curve is the same at all three. Poplin behaves correctly when told its
bending length is **0.4-0.8 cm against a nominal 1.7** — a factor of 2-4 that
does not move with resolution.

Set beside the cantilever, which measures **1.77 cm against 1.7 asked**, the
statement is:

> The solver's effective bending is correct in SINGLE curvature and 2-4x too
> stiff in DOUBLE curvature.

**The mechanism is `BEND_SCALE`, and the arithmetic is exact.**
`app/js/bending.js` carries

```js
export const BEND_SCALE = 30.0;
// In theory it is 1 -- the energy IS (B|e|^2/A) theta^2 -- and in practice
// the solver reaches a fraction of the stiffness it is asked for... Fixed by
// measurement: `tools/fabric.mjs --scan` asks for a bending length and reads
// one back, and this is the value that makes those two the same number.
```

and `cloth.js:856` applies it as `alpha = area / (BEND_SCALE * rigidity *
len^2)` — a **30x stiffening, fitted on the cantilever.** So the cantilever
reads 1.77 against 1.7 *by construction*: the constant was chosen to make it.

Flexural rigidity goes as the cube of bending length, so the correction the
drape asks for is:

| drape wants | implied factor |
|---|---|
| 0.80 cm | 9.6x |
| **0.55 cm** (mid-band) | **29.5x** |
| 0.40 cm | 76.8x |

**`BEND_SCALE = 30` sits on the required correction.** The drape is too stiff
by the factor that constant introduces, and the disc wants `BEND_SCALE ~ 1`,
the theoretical value.

**And it is not under-convergence on this rig.** DC is 97.7 at 4, 8, 16 and 32
bend sweeps — identical. Whatever `BEND_SCALE` compensates for on the
cantilever, bending here is fully converged at four sweeps, so the 30x is
applied in full and nothing absorbs it.

**THIRD AND CURRENT READING, measured after the above: it is the MESH, and
the cantilever hides it by refining.** The cantilever was run at a fixed edge
length instead of its own auto-sized one:

| cantilever mesh | measured c | asked | too stiff (length) | (rigidity) |
|---|---|---|---|---|
| auto-sized (`peirce()` default) | 1.77 | 1.7 | 1.04x | 1.1x |
| fixed 0.3 cm | 2.44 | 1.7 | 1.4x | 3.0x |
| **fixed 1.5 cm** (garment scale) | **3.93** | 1.7 | **2.3x** | **12x** |

**The cantilever is also far too stiff at garment resolution.** It only reads
correctly because `peirce()` sizes the mesh to the specimen — roughly twelve
rows across whatever free length it solves for, which is sub-millimetre for
these fabrics. So "correct in single curvature, wrong in double" was an
artifact of the instrument's auto-refinement, not a property of curvature.
Curvature was never the variable; **mesh was**, which is §6.8 and has been on
the record since 2026-10-12.

The chain, corrected:

1. effective bending stiffness **rises with edge length** (§6.8);
2. `peirce()` **auto-refines**, so the cantilever never sees it;
3. `BEND_SCALE = 30` was fitted under that auto-refinement;
4. garments run at **1.5-3 cm**, where the error is **12-30x**;
5. so they do not drape.

That the drape's required correction (29.5x at 1.5 cm) and the cantilever's
measured excess at the same mesh (12x) are the same order is the consistency
check. They are not equal, and the gap between them is not yet explained.

**The drape rig shows the same dependence, independently.** The full Cusick
mesh sweep for cotton poplin at its own nominal 1.7 cm:

| edge | DC | folds | |
|---|---|---|---|
| 2.5 cm | 96.3 | 0 | settled |
| 2.0 cm | 97.6 | 0 | settled |
| 1.5 cm | 97.7 | 0 | settled |
| 1.0 cm | 96.4 | 0 | settled |
| 0.7 cm | 94.1 | 5 | not settled (230 s) |
| **0.5 cm** | **74.8** | 5 | not settled (2409 s) |

Refine the mesh and the cloth begins to drape, DC falling toward the 40-65
band with no change to the fabric. Two rigs that share only the solver — a
clamped strip and a supported disc — now show the same dependence in the same
direction, which is what moves this from an explanation to a finding.

Note also the cost: 2409 s to not settle at 0.5 cm on a 30 cm specimen. If
the repair turns out to be "use a finer mesh", it is not a repair the viewer
can afford, which is §6.5 again.

#### The mesh law, measured: a plateau, not a clean function

`tools/fabric.mjs --mesh-law` (new 2026-10-17) sweeps the cantilever across
element sizes and reports the measured bending length against the asked one,
and the same excess as rigidity, which is what the solver is handed since
`B = w g c^3`. Cotton poplin, asked 1.7 cm, every row `bracketed: true`:

| edge cm | edge / c | measured c | ratio | as rigidity |
|---|---|---|---|---|
| 0.142 (the tool's own auto mesh) | 0.083 | 0.93 | **0.55x** | 0.16x |
| 0.15 | 0.088 | 0.974 | **0.57x** | 0.19x |
| 0.3 | 0.176 | 2.44 | 1.44x | 3.0x |
| 0.6 | 0.353 | 4.272 | 2.51x | 15.9x |
| 1.2 | 0.706 | 4.354 | 2.56x | 16.8x |
| 1.5 | 0.88 | 3.93 | 2.31x | 12.2x |
| 2.4 | 1.412 | 3.909 | 2.30x | 12.2x |

**It is monotonic and fittable** — a rise to a plateau:

- **fine (edge/c below ~0.1): too LIMP**, 0.55x. This is §6.8's "a finer mesh
  gives a limper cloth", which `peirce()`'s own comment already records as the
  reason it fixes the element size.
- **a rise** through edge/c 0.09 to 0.35, crossing correct (ratio 1) near
  **0.13** — an element of about 0.22 cm for this fabric.
- **coarse (edge/c above ~0.35): a PLATEAU** at 2.3-2.6x in length, 12-17x in
  rigidity, flat from 0.35 to 1.41 with about 10 % scatter.

The plateau is the useful part, because **every garment lives on it**: a 1.5
to 3 cm triangle against a 1.1 to 5 cm bending length is edge/c from 0.3 to
2.7. So a single correction of roughly 14x in rigidity would serve the whole
garment regime — which is what `BEND_SCALE` is, fitted at the wrong end of
the curve. That is a cheaper repair than remeshing and a worse one than a
real law, and it should be chosen deliberately rather than by default.

#### The law is in `edge / c`, and the curves collapse

**Measured 2026-10-18**, silk habotai (c = 1.1) and interfaced twill
(c = 5.0) swept at element sizes chosen to cover the SAME `edge/c` range as
poplin despite a 4.5x spread in bending length:

| edge/c | silk (1.1) | poplin (1.7) | twill (5.0) |
|---|---|---|---|
| ~0.09 | 0.50 | 0.55 | 0.82 |
| ~0.18 | 1.27 | 1.44 | 1.91 |
| ~0.36 | 2.59 | 2.51 | 2.74 |
| ~0.70 | 2.40 | 2.56 | 2.54 |
| ~1.4 | 2.36 | 2.30 | 2.27 |

**On the plateau the three agree to within 8 %**, and those rows are 0.4, 0.6
and 1.8 cm in absolute element size — a 4.5x spread. The error therefore
scales with the element RELATIVE TO THE CLOTH, not with the element alone.
Twill runs high on the rising part (0.82 and 1.91 against ~0.5 and ~1.35),
so the collapse is good rather than exact below edge/c ~0.2.

**This is the cheap outcome.** A correction expressed as a function of
`edge / c` can be applied analytically inside the compliance, and
`BEND_SCALE` — one constant fitted at one point of this curve — can be
deleted rather than retuned. The expensive branch, remeshing (Step 7), is not
required for this defect.

Shape of the function, for whoever fits it: ratio rises from about 0.5 at
edge/c = 0.09, crosses 1 near **0.13-0.15**, and flattens to **2.3-2.6**
above 0.36. In rigidity (the cube) that is 0.12x to about 13x.

**Before fitting it, re-run at `--calibrated`'s 160 substeps.** Every number
in this section is at substeps 20, and poplin moves 63 % between 10 and 20.
Fitting a correction to a curve that is not converged in substeps would make
it a constant tuned to one solver configuration, which is exactly what
`BEND_SCALE` is.

#### Re-run at 160 substeps: THERE IS NO MESH LAW. It is a constant.

**Measured 2026-10-18.** Cotton poplin, the same element sizes, substeps 160:

| edge/c | ratio @ substeps 20 | ratio @ substeps 160 |
|---|---|---|
| 0.088 | 0.57 | **2.12** |
| 0.176 | 1.44 | **2.84** |
| 0.353 | 2.51 | 2.81 |
| 0.706 | 2.56 | 2.56 |
| 1.412 | 2.30 | 2.29 |

**The coarse end does not move; the fine end moves by 4x.** So the rising
part of the curve — the "too limp at fine mesh" regime, the crossing at
edge/c 0.13, the entire shape the previous section fitted — was **substep
under-convergence, not mesh dependence.** That is physically what one expects:
a finer element has a higher stiffness-to-mass ratio and needs more substeps,
so at 20 the fine meshes were simply not converged.

Converged, the ratio is **2.1 to 2.8 across a 16x range of `edge/c`**. It is
not a function of the mesh. It is a near-constant over-stiffness of about
**2.5x in bending length, ~15x in flexural rigidity**.

That makes the repair simpler than either branch considered so far, and it
points at the obvious place: `BEND_SCALE = 30` is precisely the sort of thing
that produces a constant factor. `30 / 15.6 ~ 1.9`, so a `BEND_SCALE` near 2
is the first value to test — against the theoretical 1 that `bending.js` says
the energy implies.

**Note the cost of measuring this.** The 0.15 cm point at 160 substeps took
**4943 s** — 82 minutes for one bisection. Converged fine-mesh cantilever
readings are an overnight measurement, not an interactive one, which is
itself worth knowing before anyone plans a sweep.

#### The repair: `BEND_SCALE` 30 -> ~1.8, and the cantilever comes right

**Measured 2026-10-18.** `bendScale` is an input on `Cloth` now (null keeps
the 30), threaded through `peirce()`, so the constant can be tested instead
of edited. Cotton poplin at 160 substeps:

| bendScale | c @ edge 0.6 | ratio |
|---|---|---|
| **30** (current) | 4.768 | 2.80 |
| 4 | 2.399 | 1.41 |
| 2 | 1.875 | 1.10 |
| **1.8** | **1.849** | **1.09** |
| 1 (theory) | 1.203 | 0.71 |

and at 1.8 across element sizes:

| element | c | ratio | rows across L |
|---|---|---|---|
| 0.15 cm | 1.826 | 1.07 | 24.3 |
| 0.30 cm | 1.738 | **1.02** | 11.6 |
| 0.60 cm | 1.849 | 1.09 | 6.2 |

**One constant, 30 to 1.8, puts the cantilever within 7 % of its asked
bending length across a 4x range of element size**, with the residual spread
non-monotonic and at noise level. `bendScale 2` runs ~6 % high throughout, so
1.8 is the better value. The theoretical 1 overshoots to 0.71, so the
surviving 1.8x is a real solver deficit — but a far cry from 30.

**An instrument limit found here, worth knowing before anyone repeats the
test:** at `bendScale` below 30 the measurement returns `bracketed: false` at
a 1.2 cm element. With bending corrected the Peirce length falls to
`L = 2c ~ 3.4 cm`, which is under three rows at that element, and `tipAngle`
returns null below three. **A coarse mesh cannot measure a limp cloth.** The
earlier reasoning that coarse elements are safe to verify at held only
because the over-stiff cloth needed a long specimen; it does not survive the
repair. `rowsSpanningL` is the guard and should be quoted with every reading.

**CONFIRMED ON THE DRAPE, 2026-10-18.** `tools/drape_coefficient.mjs
--bend-scale 1.8`, all seven presets, 1 cm elements, the viewer's own substep
count — not `--calibrated`:

| fabric | DC at 30 | DC at 1.8 | published | |
|---|---|---|---|---|
| silk habotai | 87.4 | **32.6** | 15-35 | **in band** |
| cotton jersey | 93.3 | 46.0 | 20-40 | 1.1x |
| cotton poplin | 96.4 | **56.9** | 40-65 | **in band** |
| wool crepe | 97.0 | 66.6 | 35-60 | 1.1x |
| linen | 98.1 | 80.9 | 50-75 | 1.1x |
| denim | 90.1 | 93.1 | 65-90 | 1.0x, **not settled** |
| interfaced twill | 89.1 | 97.3 | 80-97 | 1.0x |

**Before, every preset read 87-98 where the bands span 15-97** — an 82-point
range compressed into eleven. After, they spread across **32.6 to 97.3, in
the right order**, two inside their bands and the rest within ~15 % of a band
edge. Poplin's hem falls **5.38 cm of its 6 cm overhang** against 1.14 cm
before, and finds **8 folds against 0**.

So one constant, measured on one rig and checked on another, moves the whole
table. The cantilever and the drape agree on it, which is the thing that was
missing when 30 was chosen.

**What is left, and why no further tuning was done:** five of seven sit
slightly stiff (1.0-1.1x past a band edge). It would be easy to drop the
scale to ~1.5 and centre them, and it would be wrong — `PUBLISHED_DC` is
**class ranges from the literature, not measurements of these cloths**, so
fitting a solver constant to their midpoints is fitting to numbers that were
never about this fabric. 1.8 is what the cantilever gives at ratio 1.02
against a quantity that IS defined for a specific cloth; that is the better
anchor, and the drape agreeing to within a band edge is the corroboration,
not the fit.

Denim did not settle in 20 s and its row is not a measurement. Interfaced
twill at 97.3 against a band ending at 97 is at the top of the scale, where
DC discriminates poorly by construction — `hemDropCm` (1.25 of 6 cm) is the
more informative number for it and still says the stiffest cloth barely
drapes.

#### LANDED 2026-10-18: `BEND_SCALE` is 1.8, and the gate is green on it

`app/js/bending.js` now carries **1.8**, with the old constant's comment
replaced — it documented a calibration procedure that was itself the source
of the error, so leaving it would have been worse than no comment.

```
cotton poplin: asked for 1.7 cm of bending length, measured 1.793 cm
               (overhang 3.59 cm, element 0.6 cm, 6 rows, 5 settles)
PASS  a fabric bends by as much as it was asked to
ALL CHECKS PASSED            310 pass, 0 fail
```

Yesterday that check passed at 1.77 cm on a quantity that was not the bending
length (§6.13). It now passes at 1.793 on the real one.

**One line changed in the solver.** Everything else below was instruments and
tests catching up with it, and each was diagnosed rather than tuned away:

1. **The gate measured at the wrong mesh.** `peirce()`'s auto element is
   `asked / 12` = 0.142 cm, which suited a 16x stiffer cloth and is now too
   FINE to converge at 20 substeps — it read 0.855 where 0.3 and 0.6 cm read
   1.07 and 1.05. Moved to a stated 0.6 cm element: converged (160 substeps
   gives 1.815 against 20's 1.793), 6 rows across the specimen, and **10 s
   instead of 200**. This also retires a claim made earlier the same day,
   that the cantilever cannot be measured at interactive substep counts —
   true of the over-stiff cloth, false of the repaired one.

2. **The free-hang settle budget was tuned to the stiff cloth.** `rms < 0.3`
   after 3 s failed at 1.578. Measured on the same rig: 1.663 cm/s at 3 s,
   1.541 at 5 s, **0.002 at 8 s**. It settles hard, just later. The run went
   to 10 s and **the threshold was not touched** — widening it would have
   hidden a real settle failure later.

3. **A genuine bug in stall detection, which the repair exposed** — see
   §6.14.

#### 6.14 A stuck seam reported "being sewn", for ever

**Found 2026-10-18**, as a gate failure after `BEND_SCALE` changed. The
weak-thread seam in `test/run.mjs`:

```
S01  stitches 11  waiting 2  sat 8  toGo 0.49  gap 2.16  -> "being sewn, 0.5 cm to go"
S02  stitches 11  waiting 1  sat 9  toGo 0.49  gap 1.96  -> "being sewn, 0.5 cm to go"
```

The feed had commanded the seam to within **0.49 cm**; the actual gap was
**2.16 cm**, with 8 of 11 stitches at the thread's limit. Unchanged at
`fallSeconds` 1, 3 and 6 — permanently stuck, and reported as in progress.

That is the exact failure `cloth.js`'s own comment forbids: *"A thread that
cannot drag its seam together stalls the feed here for ever, and reporting
that as 'being sewn' hides exactly the failure the force limit exists to
show."* The `stalled` test required `waiting > half the stitches`, and only
1-2 of 11 were flagged waiting.

**`waiting` was always a proxy. The direct evidence is ARREARS** — `maxGap`
minus `toGo`. A seam genuinely being sewn has them close together, because
the cloth follows the feed; a seam that has lost has the feed nearly
finished and the gap still open. `stalled` now fires on `waiting > half` OR
`saturated > half AND arrears > closedCm`. Verified both ways before the
gate: the weak-thread seams report `short by 2.2 cm (the thread is at its
limit)`, and a sound garment still closes all four with no false positives.

**A wrong fix of mine, reverted:** I first dropped the test's thread from
4 gf to 2 gf, believing the stimulus had gone stale against a limper cloth.
Halving the thread moved the gap by 0.1 cm and changed nothing — the verdict
logic was wrong, not the test. Leaving that edit in would have credited a
product bug to a test adjustment. The thread is back at 4 gf.

**Three distinct faults came out of one failing check** — a measurement at
the wrong mesh, a budget tuned to the old cloth, and a real defect in stall
detection. Only the second was what it first appeared to be.

#### 6.15 The oracle comparison is NOT a pure comparison

**Found 2026-10-18**, re-running `tools/drape_blender.mjs --all` after the
`BEND_SCALE` repair:

| fabric | ours | Blender | ratio | |
|---|---|---|---|---|
| cotton poplin | 6.20 | 2.23 | 0.36 | |
| linen | 3.97 | 1.39 | 0.35 | **not settled** |
| wool crepe | 4.83 | 2.07 | 0.43 | **not settled** |
| silk habotai | 2.47 | 2.65 | 1.07 | |
| cotton jersey | 2.91 | 2.08 | 0.71 | |
| denim | 6.94 | 1.32 | 0.19 | |
| interfaced twill | 2.47 | 1.65 | 0.67 | |

**Blender's column moved, and Blender was not changed.** Denim read 4.34
yesterday and 1.32 today. That cannot be a property of the oracle, so it is a
property of the harness — and it is:

> `buildGarment()` **sews the garment with THIS project's solver** and hands
> the sewn mesh to Blender. `BEND_SCALE` affects the sewing. So changing our
> constant changed the starting state that BOTH solvers drape from.

**`drape_blender.mjs` therefore compares two drapes of a garment whose shape
depends on one of the two solvers.** It is sound as a same-day A/B — both
columns start from the same mesh — and it is NOT sound across a change to
our sewing, which is exactly when it was most wanted. Every cross-session
comparison in §6.11 is subject to this.

Two further problems with our column, which make it unusable as it stands:

- **No ordering with stiffness.** Denim (3.3 cm bending length) gives the
  DEEPEST folds at 6.94, interfaced twill (5.0 cm) gives 2.47, poplin (1.7)
  gives 6.20. A stiffer cloth folding more is not physical, and the Cusick
  rig at 1 cm shows the correct ordering for the same seven fabrics, so this
  is the garment path and not the fabrics.
- **Two of seven did not settle**, so they are not measurements.

**What this does NOT overturn.** The repair is validated on the cantilever
(1.793 against 1.7 asked, mesh-independent), on the Cusick disc (seven
presets spread across their published bands, correctly ordered), and by the
gate (310/310). Those three share no harness with this one. The skirt
comparison is now a question about `drape_blender.mjs` and about the garment
path at a 3 cm element, not about `BEND_SCALE`.

**FIXED, partly, 2026-10-18.** The sewing already pinned `fabric: 'cotton
poplin'` — the fixture was always meant to be fixed, and `BEND_SCALE` escaped
it only by being a module constant rather than an option. It is now passed
explicitly as `SEW_BEND_SCALE` in the tool.

Verified by flipping the shipped constant to 9.9 and back:

| | BEND_SCALE 1.8 | BEND_SCALE 9.9 |
|---|---|---|
| ours | 6.2 | 6.8 |
| **Blender** | **2.23** | **2.23** |

Blender's column is identical to the digit while ours moves, which is the
acceptance criterion. The tool can answer its question again.

**Still partial.** This pins the one term known to have moved the fixture.
Any other change to sewing — stretch compliance, the feed rate, the stitch
model — would move it again, silently, in exactly the same way. The complete
answer is to cache the welded assembly to a file and drape THAT in both
solvers, with the fabric and element size recorded in the file so a stale
cache cannot be used without noticing. Still queued.

#### 6.16 After the repair, the GARMENT path over-folds and is unordered

**Measured 2026-10-18**, the first valid oracle comparison since
`BEND_SCALE` changed (the fixture is pinned, §6.15; two consecutive runs
agree to the digit, so this is deterministic and not noise):

| fabric | bend cm | ours | Blender | ratio |
|---|---|---|---|---|
| silk habotai | 1.1 | 2.47 | 2.65 | 1.07 |
| cotton jersey | 1.4 | 2.91 | 2.08 | 0.71 |
| cotton poplin | 1.7 | 6.20 | 2.23 | 0.36 |
| wool crepe | 1.9 | 4.83 | 2.07 | 0.43, **not settled** |
| linen | 2.3 | 3.97 | 1.39 | 0.35, **not settled** |
| denim | 3.3 | 6.94 | 1.32 | 0.19 |
| interfaced twill | 5.0 | 2.47 | 1.65 | 0.67 |

**Blender's column decreases sensibly with stiffness**, 2.65 down to 1.65.
**Ours is scattered** — poplin 6.20, denim 6.94, twill 2.47 — with no
relationship to bending length. And the sign has flipped: we now fold MORE
than the oracle on every fabric but silk, where before the repair we folded
far less.

**This does not contradict the repair.** The cantilever is mesh-independent
and correct (§6.12), and the Cusick disc orders the same seven fabrics
properly at a 1 cm element. What differs here is the path: a **3 cm
element**, a sewn garment, waist pins and body collision. Two of seven
failing to settle points the same way — a cloth now 16x limper is harder to
resolve on a coarse mesh, and large-amplitude buckling on too few elements
is a numerical fold, not a physical one.

**Answered the same day: PARTLY the mesh, and partly not.** Denim:

| element | ours | Blender | ratio |
|---|---|---|---|
| 3.0 cm | 6.94 | 1.32 | 0.19 |
| 1.5 cm | 8.94 | 3.91 | **0.44** |

Halving the element more than doubles the ratio, and both rows settle. So the
3 cm default IS too coarse for the repaired cloth — the first time in this
investigation that something genuinely turned out to be the mesh, after it
was wrongly blamed twice. But **we remain 2.3x deeper than the oracle at
1.5 cm**, so refinement does not close it.

Note also that BOTH solvers fold more on the finer mesh — ours 1.3x, Blender
3.0x. Blender is the more mesh-sensitive of the two here, so part of the
3 cm gap was the oracle under-folding rather than this solver over-folding,
and a comparison at 3 cm flatters neither.

**Where the residual points.** The Cusick disc at 1 cm shows the repaired
cloth slightly UNDER-draping; the skirt at 1.5 cm shows it OVER-folding.
Opposite directions on the same solver and the same fabrics. The two rigs
differ in exactly two things: the skirt **hangs from waist pins over a body
with collision**, and its panels are **sewn**. The disc has neither.

**Both candidates eliminated, 2026-10-18.**

**Seams: not applicable.** Established by reading, not running — the garment
is WELDED after sewing, so no seam constraints exist at drape time. Seams can
only matter through the irregular topology they leave behind. The
"seamless cone" test would not have isolated what it was queued to isolate.

**Contact: exonerated, in the opposite direction.** Denim at 3 cm, our
column with and without the body collider:

```
with collider:     ours 6.94   blender 1.32   ratio 0.19
without collider:  ours 8.81   blender 1.32   ratio 0.15
```

Removing contact makes our folds DEEPER. Contact was suppressing them by
holding the cloth out against the body, so it is not what drives the
over-folding.

**What that leaves is worse than either candidate: NEITHER SOLVER IS
CONVERGED AT GARMENT MESHES.**

| element | ours | Blender |
|---|---|---|
| 3.0 cm | 6.94 | 1.32 |
| 1.5 cm | 8.94 | 3.91 |

Ours moves 1.3x on halving the element; **Blender moves 3.0x**. Neither has
flattened. So the 0.19 at 3 cm and the 0.44 at 1.5 cm are comparisons between
two unconverged results, and the ratio is a property of the mesh both are
being run on rather than of either solver. The oracle is only an oracle where
it has converged, and nobody has established where that is.

*Do:* halve the element until BOTH columns stabilise — 1.5, 0.75, and
0.4 cm if it is affordable — on one fabric, and report the element at which
each flattens. Only then is a ratio meaningful. Budget for it: 1.5 cm already
costs 313 s per fabric, so this is an overnight run, and it may show that a
converged garment comparison is simply out of reach at interactive cost,
which is itself the answer to several open questions.

#### This is the fourth revision of the mechanism (cotangent weights,
`BEND_SCALE` as a free fudge, mesh dependence, now a constant with the mesh
dependence explained away as a substep artifact). Each followed a measurement
that contradicted the one before. The pattern across all four: **every reading
taken at a setting nobody questioned turned out to be the thing that mattered**
— the instrument's auto-mesh, then its substep count.

**And a second finding: at its own calibration mesh the cantilever reads
1.6x TOO LIMP.** `node tools/fabric.mjs --fabric 'cotton poplin'` returns
**0.93 cm against 1.7 asked**, published range 1.5-2.0. So `BEND_SCALE = 30`
does not currently make this instrument correct for poplin — whatever it was
fitted to produce, it does not produce it now. That also contradicts
[11-cloth.md](../docs/11-cloth.md)'s "five of the seven presets now measure back in
the published range", which should be re-measured before it is quoted again.

The calibration mesh sits at edge/c = 0.083, just below the crossing at
~0.13, on the rising part of the curve rather than the plateau — so the
constant is anchored where the answer is most sensitive to the element size.

**A mistake in reading this table, caught and corrected:** the auto-mesh
reading of **1.77 cm** quoted in the paragraphs above comes from the gate's
own cantilever in `test/run.mjs`, not from `tools/fabric.mjs`. Two different
harnesses in one column produced an apparent 1.8x contradiction from a 5 %
change in mesh, and a false conclusion — "not a clean function" — that
survived into this document for twenty minutes. The tool's own auto point is
0.93, which agrees with the 0.15 cm point's 0.974 and makes the curve
monotonic. **The gate's cantilever and `tools/fabric.mjs` disagree by 1.9x on
the same fabric at the same nominal mesh** — and the cause is below.

#### 6.13 The gate measures bending with the method §6.9 condemned

**Found 2026-10-18.** `test/run.mjs:811` clamps a **fixed 16 cm overhang**,
walks the centre line accumulating arclength, finds where the chord from the
clamp first reaches 41.5 deg and reports `c = sLen / 2`.

That is the fixed-overhang reading §6.9 withdrew on 2026-10-11: *"the second
quantity is a material property; the first is not, because the strip's whole
shape depends on how much of it is hanging."* `tools/fabric.mjs` was fixed
that day — `peirce()` bisects the free length — and the old method was kept
behind `--fixed`, labelled in its own header as not a material property.

**The gate was never updated, and its comment still claims otherwise:**
"tools/fabric.mjs is the same measurement over every preset". It has not been
since 2026-10-11.

So the 1.9x is not a disagreement about a measurement; it is two different
quantities:

| | method | poplin |
|---|---|---|
| `test/run.mjs:811` | fixed 16 cm overhang, chord crossing | 1.77 cm |
| `tools/fabric.mjs` `peirce()` | overhang bisected to a 41.5 deg TIP | 0.93 cm |

**The consequence is a false green.** The check `a fabric bends by as much as
it was asked to` asserts `|c - 1.7| < 0.4` and passes at 1.77 — on a quantity
this document says is not the bending length. The gate has therefore been
reporting bending as calibrated for a week while the material property it
stands for reads 0.93 against an asked 1.7 and a published 1.5-2.0.

**Fixing it turns the gate red**, and that is the point: §6.12's defect is
real and the gate cannot currently see it. Importing `peirce()` into
`test/run.mjs` — rather than keeping a second implementation of a measurement
at all, which is rule 7 one level out — is the repair, and the threshold has
to be set against what the solver actually does rather than against what the
old reading happened to give.

**In progress 2026-10-18.** `app/js/cantilever.js` now holds `peirce()` and
`tipAngle()`, three.js-free so both the tool and the gate can import them, and
`tools/fabric.mjs` has been switched to it with its local copy deleted. The
extraction is being re-measured against the tool's own 0.93 cm before
`test/run.mjs` is touched: swapping the gate onto an unverified third
implementation would repeat the error this item exists to fix.

**DONE 2026-10-18.** `test/run.mjs` calls `peirce()` from the shared module.
The extraction was verified behaviour-preserving before the gate was touched:
`tools/fabric.mjs` still returns **0.93 cm**, identical to before the move.

The swap forced a cost decision, since the gate's cantilever was one settle on
a fixed strip while `peirce()` bisects at **197 s** per fabric. Resolved by
measuring the ABSOLUTE check at auto mesh — the material property, as the tool
reports it — and the limp-versus-stiff ORDERING check at a fixed 0.5 cm
element, where it costs seconds. Measuring both cheaply would have had the
gate assert a different point on the mesh-dependence curve than the tool
reports, which recreates the two-numbers-for-one-measurement fault rather
than ending it.

**The threshold was not widened.** `|c - ask| < 0.4` stands, and the check is
expected to fail at 0.93 against 1.7 until the bending repair lands. A gate
tuned to pass the solver it is meant to audit is the same false green with
different numbers, and the comment in `test/run.mjs` says so at the point
where someone would be tempted.

A check came free with the change: **`and the bisection converged`**. The
withdrawn fixed-overhang reading could not fail to converge because it never
iterated; a bisection can, and `bracketed: false` has appeared in real runs
this session.

**First honest run, 2026-10-18** — final count **309 pass, 1 fail**, the one
failure being this check and nothing else:

```
cotton poplin: asked for 1.7 cm of bending length, measured 0.926 cm
               (overhang 1.85 cm, element 0.142 cm, 9 settles)
FAIL  a fabric bends by as much as it was asked to   0.926 cm against 1.7
PASS  and the bisection converged                    bracket 0.017 cm, 9 settles
PASS  a limper fabric droops sooner than a stiffer one   2.832 vs 4.325 cm
```

The gate now sees §6.12. The bisection converges cleanly and the ordering
still holds, so the failure is specifically the absolute calibration and
nothing else — which is the whole point of making the check measure the
material property.

**Two faults in `test/run.mjs` found by making this change, both mine:**

- The edit deleted `const edge = 0.5, overhang = 16, clamp = 4, width = 2`,
  which a LATER block still read. `ReferenceError`, 144 checks in, after the
  slowest section had already run. Removing shared state without checking its
  readers; `node --check` cannot catch a runtime reference. The constants are
  now scoped to the block that uses them. A stale `poplin.c` in the same
  block would have printed the wrong branch silently rather than failing.

- **That block's own check was a second weak one — FIXED 2026-10-18.** It
  asserted *"the same cloth on a coarser mesh is still the same cloth"* with
  a tolerance window of **2.0 to 6.0 cm of tip reach, a 3x spread**, on a
  proxy, while §6.12 measures the bending length itself moving 0.93 to
  3.93 cm across the element sizes garments use. **A check whose tolerance is
  wider than the defect it is named after passes through the defect**, and
  this one did for as long as the defect existed.

  It now measures the bending length at **0.3 and 0.6 cm elements** and
  asserts they agree within **10 %** — measured at 1.4 % apart after the
  repair, so the threshold is seven times the observed margin. It could not
  have been written before the repair: there was no baseline to tighten
  towards while the quantity itself was wrong.

Writing the module surfaced two things the old code buried.

**One: `rows = 12` holds `edge / c` constant across every fabric.** The
element is sized as `asked / 12`, so the cantilever samples the
mesh-dependence curve of §6.12 at exactly one point, by construction, and
could never have seen the dependence it was being used to calibrate against.
Now stated in the parameter's own doc comment rather than inferable only from
a cost note.

**Two: the measurement is not converged in SUBSTEPS either, by 63 %.**
`tools/fabric.mjs` defaults to `substeps: 20`; the extracted module was first
written with the solver's own default of 10. Same fabric, same auto mesh:

| substeps | measured c |
|---|---|
| 10 | **0.571 cm** |
| 20 | **0.930 cm** |

A material property that moves 63 % on a solver setting. 20 is what the tool
has always used, so it is what every bending figure in this document was
taken at and it is now the module's default — a library whose default
silently differed from the instrument's would make the two disagree again,
which is precisely the fault the extraction exists to end. It is **not** a
claim that 20 is sufficient: `--calibrated` uses 160, and §8.5 already
accepts the non-convergence as a known deficit. It does mean that the 12x
and 29.5x excesses of §6.12 are quoted at substeps 20 and would be different
numbers at 160.

**This section has now been revised three times in one day** — cotangent
weights, then `BEND_SCALE` as a free-standing fudge, now mesh with
`BEND_SCALE` as the constant that conceals it. Each revision followed a
measurement that contradicted the one before, and each earlier reading is
left standing above rather than deleted, because the sequence is the useful
part: every one of them was plausible, internally consistent with the
evidence available, and wrong.

#### The earlier reading, superseded

That reverses the burden of proof. **The suspect is the cantilever, not the
drape.** A fudge fitted on one experiment and applied globally will make that
experiment right whatever is wrong with it; the question now is why the
solver needs 30x to reproduce a Peirce bending length, because that deficit
is the actual defect and `BEND_SCALE` has been hiding it since it was
introduced.

**A correction to this section as first written, within the hour:** it
attributed the stiffness to the quadratic isometric bending model's cotangent
weights being fixed to the flat rest shape. That model is **not in use.**
`app/js/bending.js` records it as model 2 of three, measured and discarded —
"only valid for SMALL deflections... a dropped denim disc landed like a thin
metal plate". The model in use is a dihedral-angle constraint. The error came
from reading `docs/11-cloth.md`, which still presents the quadratic model as
what works and is **stale relative to `bending.js`** — see the note in that
document.

Two numbers that do not fit and are left open rather than explained away:
folds appear at 0.7 cm triangles where 1.0 and coarser give none at the same
nominal bending; and softening the membrane 1000x (stretch 2e-7 to 2e-4) moves
the hem drop 1.14 to 2.12 cm, so membrane locking contributes something and is
not the main term.

#### What has been ruled out, and what has not

Each by measurement, 2026-10-17:

| candidate | verdict | evidence |
|---|---|---|
| the fabric data | **ruled out** | matches Blender at the limp end, diverges with stiffness; wrong data shifts all fabrics equally (§6.11) |
| damping and drag | **ruled out** | `--no-drag --no-damping` gives an identical DC; the equilibrium is static at rms 0.00 |
| symmetry of the specimen | **ruled out** | a 0.5 mm jitter changes nothing; the disc is not stuck in an unstable flat state |
| mesh resolution | **demoted** | the DC-against-bending curve is the same at 1.0, 1.5 and 2.0 cm; one unexplained fold onset at 0.7 cm |
| membrane locking | **contributes, minor** | softening stretch 1000x moves the hem drop 1.14 to 2.12 cm of a needed ~5 cm |
| under-convergence of the bend sweeps | **ruled out** | DC identical at 4, 8, 16 and 32 sweeps |
| `BEND_SCALE = 30` as a free-standing fudge | **superseded** | it is the constant that conceals the mesh dependence, not an independent fault |
| **mesh dependence of the bending stiffness (§6.8)** | **THE ANSWER** | the cantilever reads 1.77 auto-refined, 2.44 at 0.3 cm and **3.93 at 1.5 cm** for the same 1.7 cm fabric; garments run at 1.5-3 cm |

**A premature dismissal, recorded so the next person does not repeat it:** the
mesh hypothesis was written off here after sampling 2.5, 2.0, 1.5 and 1.0 cm
and finding DC flat. Folds first appear at **0.7 cm**, below everything
sampled. The coarse half of a sweep is not the sweep.

---

### 6.7 A run with `substeps: 4` slid off the body
**State:** done 2026-10-11 — `grainOverLimit` warns; floor measured at 6, trustworthy from 10

Wool crepe, `slipCm 96.97`, `hemYcm −59.29`, `contactPct 63.9`. Swept on a
wool crepe disc at edge 2.2, where `maxStrain` is 6 %:

| substeps | verdict | grain % | body through cloth | settled |
|---|---|---|---|---|
| 2 | **slid off, 97.05 cm** | 3.2 | 0 | **no** |
| 4 | shoulder — **wrong** | **11.29** | **2.3 cm** | yes |
| 6 | neck | 9.8 | 0.23 cm | yes |
| 8 | neck | 7.1 | 0.21 cm | yes |
| 10 | neck | 4.79 | 0.17 cm | yes |
| 16 | neck | 2.15 | 0.17 cm | yes |

**So 6 is the floor for a qualitatively right answer and 10 is the floor for
the fabric's own strain limit to hold.** At 4 substeps the run is confidently
wrong: it names the shoulder instead of the neck, stretches the grain to 1.9×
the fabric's tear limit, and lets the body 2.3 cm through the cloth — while
`healthy()` returns **true**, because that only looks for NaN.

**Two diagnostics were tried, and the first one failed**, which is worth
recording because it was the obvious one. The strain limiter's own residual is
**zero at every substep count**: it converges to its per-edge ceiling every
time. What it cannot do is stop the cloth *arriving* at that ceiling. So the
signal is the ceiling being reached on **grain** edges — warp and weft are the
inextensible part of a woven, which is the whole premise of `maxStrain`.
`report().grainOverLimit` is that ratio, and it fires once with a specific
message above 1.2: **1.88 at 4 substeps, 0.80 at 10, 0.36 at 16.**

Note the shear defaults masked this. With `biasCompliance: 25` the per-edge
ceiling is 6× looser on bias edges, so at 4 substeps `maxStretchPct` read 16.6
while the limiter reported itself converged; with the defaults inert it reads
6.12, pinned exactly at the limit. The instability is the same either way —
the wrong verdict appears at 4 substeps regardless — but the *measurement* of
it only works on the grain split. One more reason for §8 decision 1.
### 6.8 Bending is miscalibrated, and mesh-dependent
**State:** done 2026-10-11 — cause and cost both measured; the remedy is a decision (§8.6)

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

**CAUSE FOUND 2026-10-11: the discrete bending model is correct and so is
`BEND_SCALE`. The defaults do not converge it.**

Driven to convergence, the solver reproduces closed-form beam theory. Denim,
asked `c` = 3.3 cm, specimen 1.5 cm, row 0.125 cm, `c_eff = c / dropRatio^⅓`:

| substeps | bend sweeps | dropRatio | δ/L | **c_eff** | vs asked |
|---|---|---|---|---|---|
| 20 | 8 — `tools/fabric.mjs` default | 49.2 | 0.58 | **0.90** | 3.7× too limp |
| 20 | 32 | 18.1 | 0.21 | 1.26 | 2.6× too limp |
| 80 | 8 | 4.81 | 0.056 | 1.96 | 1.7× too limp |
| 80 | 32 | 1.13 | 0.013 | **3.17** | **0.96× — right** |

At the converged cell the drop is within **13 %** of the closed form and the
bending length within **4 %** of the value asked for, with `BEND_SCALE = 30`
unchanged. So `k = BEND_SCALE·D·|e|²/A_e` is correct, the stencil's `len` and
`area` are the right quantities, and nothing needs re-fitting.

**`cloth.js`'s own comment on `BEND_SCALE` was right about the mechanism** —
*"the solver reaches a fraction of the stiffness it is asked for, because the
bending pass gets a fixed number of sweeps and shares its vertices with
constraints four orders stiffer"* — and wrong only in implying the fit made
asked and achieved equal. It cannot have, because the instrument it was fitted
against (`--scan`) returned `edge/2`.

**This reframes most of today's bending numbers.** Everything measured at the
default 20 substeps / 8 sweeps was reading a cloth roughly 3.7× limper than
the preset asked for — including the Peirce values (silk 0.500, denim 2.105)
and the whole "the solver is limper than it is told" direction. And the
apparent mesh-dependence follows: convergence quality falls as the element
count rises, so a finer mesh at a fixed sweep budget is limper. It was never a
normalisation error.

**The cost, measured 2026-10-11.** Work per frame is
`substeps × (stretchSweeps + bendSweeps)`; the defaults spend **160**.

| substeps | stretch | bend | work | dropRatio | c_eff |
|---|---|---|---|---|---|
| 10 | 8 | 8 — **the defaults** | 160 | 71.2 | 0.796 |
| 20 | 4 | 4 | 160 | 62.5 | 0.832 |
| 40 | 2 | 2 | 160 | 48.4 | 0.906 |
| 80 | 1 | 1 | 160 | **30.9** | **1.051** |
| 20 | 8 | 8 | 320 | 49.2 | 0.90 |
| 40 | 8 | 8 | 640 | 18.2 | 1.255 |
| 80 | 8 | 8 | 1280 | 4.81 | 1.955 |
| 40 | 8 | 32 | 1600 | 4.77 | 1.96 |
| 80 | 8 | 16 | 1920 | 1.65 | 2.794 |
| **160** | **8** | **8** | **2560** | **1.151** | **3.149** |
| 80 | 8 | 32 | 3200 | 1.128 | 3.17 |

**Substeps dominate sweeps at equal cost** — 80/8/8 (1280) beats 40/8/32
(1600) for the same answer, and 160/8/8 (2560) beats 80/8/32 (3200). An
earlier note in this document claimed the reverse, reading "cheaper" off the
sweep count without converting to work; that was wrong and is corrected here.

**Two conclusions.**

1. **Reallocating the existing budget buys 2.3× for free.** `cloth.js:142`
   says *"XPBD wants many substeps, one sweep each"*, and the defaults ship
   the opposite allocation; 80/1/1 is 2.3× more accurate than 10/8/8 at
   identical work. **But this must not be adopted on this evidence**: the beam
   is a flat strip with no closed rings and no contact, and `cloth.js:872`
   records that `stretchSweeps: 8` exists precisely because *"a closed ring of
   edges under tension — the hole of a disc caught on a neck is exactly that —
   propagates its error around the ring at one edge per sweep"*. It needs the
   disc, the skirt and the gate before it is a default.
2. **Calibrated bending costs 16× the default budget.** 10 % accuracy needs
   `dropRatio ≤ 1.33`; the cheapest cell reaching it is 160/8/8 at 2560
   against the defaults' 160. §6.5 already records that the viewer cannot
   afford what it currently spends, so this is not available interactively.

So the remedy is **not** a tuning change, and the honest position is §8.6: at
interactive settings this solver's bending is about **4× limper than its
presets ask for** (`c_eff` 0.80 against 3.3), and no drape number taken there
is quantitative. The long-term fix is a solve that converges without 16× the
work — implicit or hierarchical bending rather than more Gauss-Seidel — which
is a substantial piece of work and not a constant.

---

*The investigation below is what led here, retained for its eliminations.*

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

The decision register. Decided entries are struck through with the date and
the outcome; the rest are live and are listed in
[19-todo.md](19-todo.md) under **Decisions outstanding**, so the queue stays
the single place to look for what is next.

1. ~~**Disable the shear defaults pending identification?**~~ **DECIDED
   2026-10-12, then REVISED the same day: ON, with the constants grounded.**
   The decision below was right about the numbers it was given and wrong about
   what it concluded. "Blocked on a physical measurement" turned out to be
   three things, two of which were not: the **geometry** of what a shear
   allowance buys was pure computation nobody had attempted
   (`tools/shearnet.mjs`), and the **locking angle** is a literature quantity
   per fabric class — stated in this project's own documents as 15–25° — now
   in `FABRICS` as `shearLockDeg` on the same footing as the published
   bending-length ranges the project already uses. Taking every other constant
   from the literature while demanding a hand measurement for this one was
   simply inconsistent.

   So `biasStrainFactor` is no longer a constant: it is derived per fabric
   from `√(1 + sin γ)` over the grain limit — **0.70 for bonded interfacing to
   2.83 for crepe**, where the flat 6 had the interfacing wrong by a factor of
   nine *and in the wrong direction*, letting an interfacing shear six times
   more freely than its own grain. With that fixed the measured harm is gone:
   grain strain 3.65 % off against 4.03 % on, two thirds of the 6.1 % limit
   where the flat 6 reached 1.88× it, every run settles, penetration
   unchanged. **Gate 278 pass, 0 fail.**

   What remains unmeasured is `biasCompliance` alone — how *soft* the bias is
   rather than how far it may go — and the thing that settles it is the Cusick
   coefficient (Step 2), which is a simulation against published values and
   not a lab. 25 sits inside the two-to-three orders a woven's shear modulus
   runs under its tensile; 100 measured barely different.

   *The original decision, kept because its reasoning was sound given what it
   was given:* **inert.** `biasCompliance: 1`, `biasStrainFactor: 1`; the
   mechanism and the reporting stay and two values bring the behaviour back.
   Three measured reasons, not one: it makes *yarn* strain worse at fine
   meshes (4.5 → 11.4 %) and stops the drop settling; it changes nothing
   measurable at coarse meshes, because the length it frees has nowhere to go
   until the mesh can carry a ~1 cm crease; and it loosened the per-edge
   strain ceiling 6× on bias edges, which hid an under-resolved substep count
   behind a limiter reporting itself converged (§6.7). Shear is real and
   wanted — `docs/01-geometry.md:142` and the observed "pulls and pushes the
   fabric around" into ~1 cm creases are the same fact — but an unfitted
   constant is not that mechanism working. Gate unchanged at 277/1.
2. ~~**Swap the accordion gate check to `deepOverlaps`?**~~ **Done
   2026-10-11** — see §6.3. 277 pass / 1 fail.
3. **Step 7: remesh, side-car, or documented ceiling?** The side-car is the
   cheapest and the repo already points at it; adaptive remeshing is the
   literature's answer and a large piece of work.
4. **Which physical measurements will actually be made?** Everything in Step 4
   and most of Step 2's calibration depends on it. The two that unblock the
   most: the hemisphere cap diameter before wrinkling (shear), and the crease
   pitch plus fold count on a draped disc (drape and resolution).
5. ~~**Adopt the measured strain limits from `sim/cipc/fabrics.md`?**~~
   **DECIDED 2026-10-12: adopted, as a flat 6.1 % floor for the wovens.**
   `sim/cipc/fabrics.md` declined to adopt its own numbers because mapping a
   Young's modulus and a Poisson's ratio onto XPBD compliances *"is a real
   piece of work and not a lookup"* — true, but **`maxStrain` is
   dimensionless**, so a strain limit needs no mapping and transfers directly.
   The modulus work remains outstanding; this one value did not have to wait
   for it.
   Flat floor rather than a scaled spread, because the old ordering (denim
   2 %, poplin 4 %) was invented too and the data gives a *range*, not
   per-fabric values. Jersey stays at 25 % as a knit outside that woven set.
   **Gate: 278 pass, 0 fail — green for the first time.** The dart closed at
   0.185 cm, exactly as predicted, and seam closure improved across three
   independent checks (`0.021 → 0.007 cm` left, `52.3 → 56.8 %` welded).
   **Still owed: the yoke/slip sweep must be re-run**, because
   `docs/11-cloth.md:400` is right that it "turns entirely on the cloth
   refusing to stretch past the shoulder girth" and it was found on a cloth
   2–3× too stiff.

   *The evidence that decided it:* it is the root cause of
   the dart-closing gate failure (§6.3) *and* of the disc's strain pinning
   (§6.6), and at the most conservative measured value (6.1 %) the failing
   check passes. The presets assume 2–4 % where the measured wovens are
   6–13.4 %, and `docs/11-cloth.md:400–405` already says the yoke/slip
   boundary should be re-run if so. This changes the headline result of the disc test, so it is a
   decision and not a cleanup. It also requires the modulus-to-compliance
   mapping, which is the largest single piece of modelling work on this list.
6. ~~**Bending at interactive settings is ~4× too limp. Accept, pay, or
   rewrite?**~~ **DECIDED 2026-10-12: accept, and make the deficit
   explicit.** Paying is unavailable — §6.5 already records that the viewer
   cannot afford what it currently spends, and calibration costs 16× that.
   Rewriting (implicit or hierarchical bending) is the right long-term answer
   and a substantial piece of work, not something to begin at the end of a
   session. So: `tools/fabric.mjs --calibrated` sets 160 substeps, the point
   at which the solver reproduces closed-form beam theory to 13 % and the
   asked bending length to 4 %, and **any figure quoted against a published
   range must come from a run with it.** Interactive bending stays ~4× limper
   than its presets and is not quantitative; that is now a documented
   property rather than a surprise. The free 2.3× from reallocating the budget
   toward substeps remains available and unlicensed — it needs the disc, the
   skirt and the gate, because the beam cannot see the closed-ring case
   `stretchSweeps: 8` exists for.

---

## 9. What not to do

- **Do not tune constants to match a screenshot.** The interfaced twill
  reading as sheet metal is a modelling and resolution result; pushing
  `bendLengthCm` away from its measured range to fix the look would corrupt
  the one axis that is calibrated.
- **Do not compare performance across models of different accuracy.** See
  Step 8.
- **A check whose name states a RELATION must not contain a constant.** Two
  gate assertions had to be repaired on 2026-10-11/12, and both had the same
  defect: an absolute threshold standing in for a relative property, tuned
  against a guessed value and therefore encoding the guess. The accordion
  control compared heap height when it meant *"the layers do not pass through
  each other"* (now `deepOverlaps`); the assembly check hardcoded
  `maxStretchPct <= 4.0` when it meant *"past what it can take"* (now
  `grainOverLimit <= 1.05`, against the fabric's own `maxStrain`). Both were
  made **stricter**, not looser: the new forms still fail at 35,206 crossings
  and at 1.88× the tear limit respectively, where a raised constant would have
  passed. The tell is in the wording — if the name says "past what it can
  take" or "the self-collision doing it", the threshold belongs in terms of
  the thing being compared against.
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
