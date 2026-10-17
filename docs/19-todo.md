# 19 — TODO

The working queue for [18-validation.md](18-validation.md).

**How this document is maintained.** New items are added **on top**, so the
newest candidate is always the first thing read. When an item is done it is
removed from here and **referenced from its place in
[18-validation.md](18-validation.md)** — against the step, artifact or decision
it settled, with the numbers it produced. The consequence is the point: because
finished work is recorded there and only unfinished work lives here,
`18-validation.md` can be read directly to find the next simple candidate —
anything it describes that carries no "done" reference is still open, and the
short ones are the candidates. This document is the queue; that one is the
record.

---

## Open

- [ ] **Find what the viewer spends a sewing frame on, and stop doing it every
      frame.** The wasm solver steps the darted skirt in **17 ms**; the page
      takes **210-440 ms a frame** sewing the same garment. So ~95 % of the
      frame is the viewer, not the physics.

      *Do:* profile the frame part by part in the page -- `wasmSew.step`,
      `mirrorOnto`, `updateClothMesh`, `updateStitchLines`, `updateHUD` -- and
      cut what the screen does not need between one creep of the feed and the
      next. Caching the HUD's `sim.report()` was tried first and **did not
      help**, which is the measurement refusing a hypothesis: do not guess
      again. Known suspects, all self-inflicted: `mirrorOnto` does three
      per-stitch readbacks (gaps, tensions, peaks) every frame and the stall
      check a fourth, each a malloc/ccall/copy/free over 134 stitches, for
      numbers nothing reads until the pass ends.

      *Acceptance:* a sewing frame inside 33 ms in the page on the darted
      four-panel skirt, with the breakdown recorded so the next person does
      not have to re-derive it; and the per-frame path containing nothing that
      is not drawn.

      *Why it is first:* it is the complaint that started this -- "W is still
      slow" -- and it is still true in the only place that counts, which is
      the page.

- [ ] **Verify X headlessly, because it has now broken twice in one session
      and a person found it both times.** Once the drape function was deleted
      by an unrelated edit (`sendToWasm is not defined`, X threw and the
      garment never fell); once the branch that steps it was placed behind
      `stepFrame`'s `if (!(playing && sim)) return;` while the drape path sets
      `playing = false`, so X announced itself and nothing moved. Neither is
      subtle; both survived because nothing in this repository presses X.

      *Do:* a scripted J → W → X in `tools/viewshot.py` that waits for the
      sewing pass to end, presses X, pumps frames, and asserts three things:
      the drape's frame counter ADVANCES, the garment's lowest vertex MOVES,
      and the completion line is printed. Headless Chrome does not fire rAF,
      so it has to drive `__pump` and that is what makes the run slow -- which
      is the reason it keeps being skipped, and the reason it has to exist.

      *Acceptance:* the check runs in `node test/run.mjs`'s neighbourhood or
      as a named tool, and fails if X stops stepping.

- [ ] **Give `sim/blender_show.py` a camera and a light.** It clears to an
      empty factory scene, so Blender reports "no camera found in scene" and
      the file cannot be rendered, only orbited. One camera framed on the
      body, one sun, neither touching the physics.

- [ ] **Look at the 50 % grain strain the weld reports.** The sewing phase
      reports 7.6 % on the same garment and the weld then says 50.4 %, 8.3x
      the fabric's limit. It is a MAXIMUM over edges, so per rule 2 the first
      thing is the distribution -- how many edges, where, and whether they are
      the dart legs that were just merged -- not a fix.

The next two came out of the recovery in
[00-backtotrack.md](00-backtotrack.md) §7–§9 on 2026-10-16 and are ahead of the
validation work, which stays suspended while that document is open. A third —
the sewing feeding for ever on a seam that would not close — was queued here
and then closed on the same day: it was the dart legs being paired by index
instead of by Thales, and with that fixed the garment sews in 88 frames
([00-backtotrack.md](00-backtotrack.md) §8 and §9).

- [ ] **Put the sewing in wasm.** X runs in the page at 8.8 ms a frame and W
      does not: **126 ms/frame (7.9 fps)** on the plain four-panel skirt, and
      212 ms/frame with the asymmetric darts in. Profiled
      (`node tools/profile.mjs --scenario sew`), the time is **58.4 %
      `_solveHinges`**, 21.6 % `_substep`, 4.4 % `_dampAlong` — and 0.8 %
      `_solveStitches`. The stitches are not the cost; the bending is.

      *Do:* not a port of the sewing. In order:
      **(1) done 2026-10-17** — `sc_set_hinges`, `sc_hinge_count`,
      `sc_set_bend_sweeps` and the dihedral solve in
      `src/sewcloth/src/sewcloth.c`: the XPBD constraint from `cloth.js`
      line for line, lambdas accumulated across a substep's sweeps and reset
      between them, projected after integration and before contact. Held to
      its gradient by `src/sewcloth/test/test_hinge.c` — flat cloth untouched
      to 1e-4 cm, a 90° fold driven flat from either side and never further
      open, a stiffer hinge measurably ahead of a softer one, and every one of
      the four vertices of a hinge moving towards flat under a finite
      difference of the angle. `capabilities.bending` reports 1 and the smoke
      test fails if it ever stops matching. **Wired to nothing yet**, which is
      step 5;
      **(2) done 2026-10-17** — `sc_set_stitches`, `sc_set_stitch_params`,
      `sc_set_sew_speed`, `sc_arm_stitches`, and `sc_stitch_gaps` /
      `sc_stitch_tensions` / `sc_stitch_peaks` / `sc_feed_left` /
      `sc_is_sewing` reading back **per stitch**, never as a scalar, because
      which seam is open and by how much is the question a fitting asks
      (rule 2). One-sided and force-limited, as in `cloth.js`: slack does
      nothing, and the accumulated multiplier clamps at the gram-force limit so
      a seam that cannot close saturates and stays open. `test_stitch.c` holds
      it to that — a 10 cm seam closed in exactly two seconds at 5 cm/s, the
      same closure at 4 and at 16 substeps (the rate is per second, not per
      iteration), a slack thread moving nothing and pulling nothing, and a
      0.1 gf limit leaving 9.18 cm open with the tension parked at the limit.
      Three faults of my own came out of it: a rest length that crawled to
      2e-6 cm and so never stopped feeding, `sc_is_sewing` answering yes with
      the feed rate at zero, and no way to read the peak tension — which is
      the number a seam report is made of, since the instantaneous one is near
      zero whenever the cloth has caught up;
      **(3) done 2026-10-17** — `app/js/sewwasm.js`: `WasmSewing`, a garment
      being sewn that lives across frames (X is one solve, W is watched), plus
      a headless `sewWasm` for the trace and the tests. `wasmcloth.js` gained
      `setHinges`, `setStitches`, `setStitchParams`, `setSewSpeed`,
      `armStitches` and the per-stitch readback. The hinge topology moved out
      of `cloth.js` into `app/js/bending.js` on the way -- part of step 6, done
      early because both solvers now need the same quadruples and deriving
      them twice would be two chances to disagree;
      **(4) done 2026-10-17** — `node tools/trace.mjs --sew-wasm` sews the
      four-panel skirt through sewcloth in the same table as everything else;
      **(4b) done 2026-10-17** — `sc_set_strain_limit` and
      `sc_strain_residual`: the fabric's measured ceiling, swept until nothing
      is over it, applied last in the substep so a seam that closed by
      stretching the cloth is pulled back. `test_strain.c` holds it — an
      unlimited soft spring stretching the 49 % its load demands, the same
      spring held at **6.1 %** with no residual, jersey's 25 % honoured as
      25 %, and slack cloth untouched because a clamp that also pushes is a
      rod. On the garment, sewn through wasm: peak strain **34.5 % → 6.59 %**,
      and the drape afterwards goes from 0.38 % of the cloth inside the body
      to **0.01 %**, deepest −0.434 cm → **−0.002 cm**, settling in 2.6 s. The
      seam gap loosened from 0.084 to 0.172 cm — the limit now competes with
      the feed, which is the trade `cloth.js` spends sweeps on — and 0.172 is
      still inside the 0.25 cm weld tolerance. It was found like this:
      **(4b, as reported before it was fixed): the wasm sewing stretches the
      cloth.**
      It closes the seams -- 0.084 cm worst gap against the weld tolerance of
      0.25, feed fully taken up, 145 frames at **24.1 ms/frame against
      cloth.js's 126**, which is the 5x the port was for -- but peak strain
      comes out at **34.5 %** where `cloth.js` leaves 1.9 %, and the drape
      afterwards puts 0.38 % of the cloth inside the body instead of 0.11 %.
      The cause is the line of §8's inventory that was already suspected:
      `_clampStrain` enforces the fabric's measured strain limit every substep
      and **sewcloth has no such stage**. This is the same missing piece as
      item 2's 6 %-long hem, now visible on a garment rather than inferred.
      *Do it before step 5* -- wiring W to a solver that stretches the cloth a
      third of its length would be a regression someone would have to report;
      **(5) in hand 2026-10-17** — `params.sewBackend` ('wasm' by default,
      'cloth.js' beside it for comparison), `startWasmPass` / `endWasmPass`,
      and `stepFrame` driving the wasm pass. The stitch records stay `sim`'s
      and `WasmSewing.mirrorOnto` keeps them true, so the HUD, the seam
      report, the stall detector and the weld all read the same objects they
      always did — a backend swap that rewrote those would be a second place
      for the garment's state to live. Two faults found by driving the page:
      the module takes ~1 s to arrive and **cloth.js was sewing in the
      meantime** (4.2 cm of 17.3 taken up by the solver being replaced), fixed
      by holding the garment until the pass exists and by asking for the
      module at startup; and a pass that starts has to SAY which solver is
      sewing, or nobody can report a bug against the right one (rule 9).
      **(5b) NOT A SOLVER FAULT — the pattern was 16.6 cm short.** Reported
      from the screen while this was being written: *"it's normal to not be
      able to close a dart if there's not enough circumference on the body to
      take all the fabric"*, and the arithmetic agrees. A skirt drafted to the
      body's waist holds exactly the cloth the body needs; every centimetre a
      dart removes is a centimetre the waist seam no longer has. Measured, the
      fixture at 2x takes **16.59 cm out of a 78.28 cm waist** against
      **3.76 cm** of give in a woven at its 6.1 % limit. So it could not
      close, and the 1.8 cm of open seam was the pattern, not sewcloth.
      Fixed where the fault was: `dartedSkirt` drafts the skirt **wider by the
      dart allowance** in two passes -- draft at the body's waist to find out
      what the fixture takes, then draft that much wider and cut for real --
      so what is left after the darts still fits the body. In the viewer, the
      same garment now takes up its whole feed with **one** seam 0.3 cm short
      instead of three at 1.1-1.2 cm. `dartAllowanceCm` is the number, and it
      is printed when the darts are cut.
      **(5b, as first diagnosed and wrongly) the wasm pass cannot close a
      DART.** Measured on the asymmetric fixture at 4 cm/s,
      1,170 vertices, 135 stitches: `cloth.js` closes everything in 88 frames
      to a worst gap of 0.324 cm; sewcloth runs the whole feed and leaves
      **1.76 cm** open, far outside the 0.25 cm weld tolerance, so the garment
      comes out unsewn. The plain skirt is fine (0.172 cm), which is what
      names the difference: a seam drags a neighbouring panel, a dart pulls
      against its own. sewcloth's stretch is implicit SPRINGS where cloth.js's
      is a swept distance constraint, so the panel deforms instead of
      travelling and the strain limit then pulls the deformation back out.
      Found by the feed-slack sweep: at 0.5 and 1.0 cm of slack the pass hits
      the 3,000-frame cap with feed still left; at 2.0 it runs the feed out in
      exactly the 260 frames it should and still leaves 1.76 cm. *Do:* give
      sewcloth a swept distance constraint for the stretch, or raise the
      spring stiffness until the panel travels, and decide which by the gap on
      this fixture. Until then `params.sewBackend` defaults to 'cloth.js';
      **(5, as specified) wire W to it** — `toggleSewing` arms the stitches in the wasm
      cloth and `stepFrame` steps *that* instead of `sim.step(dt)`, reading
      the positions back zero-copy each frame and keeping the HUD, the stitch
      lines, the stall detector and the seam report fed from
      `sc_stitch_gaps`. **This is the step that makes the port visible to
      anyone**, and it is deliberately last: nothing above it changes what the
      viewer does, and this changes nothing else;
      **(6)** once the two agree, delete the JS sewing — which is where
      `cloth.js` goes.

      *One design note for (5), because it is not `drapeWasm` again.* X is a
      one-shot solve: create a cloth, step six seconds, hand back the vertices,
      dispose. W is **interactive** — the point is watching the seams close, a
      frame at a time, with the person free to press W again and stop it. So
      the wasm cloth has to **live across frames**: built when the pieces are
      laid out, stepped once per rendered frame, rebuilt when the garment is,
      destroyed when it is cleared. `drapeWasm`'s create-step-dispose shape is
      the wrong one to copy; `WasmCloth` already supports the right one, which
      is the reason `sc_positions()` returns a pointer that never moves.

      *Acceptance:* the four-panel skirt sews at **under 16.7 ms a frame**
      with the same seam gap as `cloth.js` to within the weld tolerance
      (0.25 cm), the constant-rate feed preserved — it closes seams to
      0.024 cm where Blender's own sewing springs leave 9.2 cm, which is why
      it is this project's and not Blender's — and the gate green.

      *What W actually triggers, which is the thing to be ported.* Pressing W
      calls `toggleSewing` → `sim.startSewing(pred)` + `armStitches`, sets the
      phase to `stitching`, and from then on every frame is
      `stepFrame` → `sim.step(dt)` → `_substep` × `substeps`. So the port is
      `_substep`'s chain, stage by stage, and most of it is already there:

      | per substep, in `cloth.js` | in sewcloth? |
      |---|---|
      | integrate + external forces | **yes** |
      | stretch sweeps (XPBD distance) | as *springs* in an implicit solve — a real divergence, and the comparison decides which the sewing phase wants |
      | `_solveHinges` | **no** — `capabilities.bending = 0` |
      | `_projectContacts` (SDF) | **yes**, and it now matches the oracle's clearance |
      | `_solveStitches` + `_feedStitches` | **no** — `capabilities.stitches = 0` |
      | `_readStitchTensions` | **no** — needs gaps and tensions back out, per stitch |
      | self-collision | **yes**, by vertex distance; `cloth.js` does primitive pairs |
      | `_dampAlong` (damping along constraints) | **no** — sewcloth damps globally |
      | `_clampStrain` (the measured strain limit) | **no** |

      The bookkeeping either side — `startSewing`, `stopSewing`,
      `armStitches`, `stitchReport`, `maxStitchGap`, `remainingFeedCm` — can
      stay in JS, provided the gaps and tensions come back from wasm per
      stitch.

      *And one line of that table probably explains the OTHER open item:*
      `_clampStrain` enforces the fabric's measured strain limit, a 6.1 %
      woven floor, and sewcloth has nothing of the kind — while the wasm drape
      settles with a hem **6 % longer** than it was cut. Worth testing before
      anything is tuned: the two items may have one cause.

      *The design, derived 2026-10-17 so it is not re-derived:* sewcloth is a
      **force** solver — backward Euler with a filtered conjugate gradient over
      springs — and both of the pieces it is missing are **constraints** in
      `cloth.js`: an XPBD dihedral hinge with rest angle 0 and a compliance,
      and an XPBD one-sided distance stitch whose accumulated multiplier is
      clamped at `maxTensionGf` so the seam saturates and stays open rather
      than being forced shut. They do not become springs. Blender's own
      sewing springs are the thing this project measured at 9.2 cm against
      0.024 cm, and its bending springs are what `docs/20-fork.md` §9 shows
      allowing 26.6 % strain at p95. So sewcloth gains a **projection stage**
      after integration — lambdas per substep, swept, exactly as
      `_solveHinges` and `_solveStitches` do it — and the two implementations
      are then checkable against each other constraint by constraint, which is
      the only reason to write the second one.

      *Then, and only then:* `BodyCollider` and `FABRICS` move out of
      `cloth.js` into their own modules — they are a collider and a table, not
      solver code, and `clearance.js`, the viewer, the tools and the gate all
      depend on them — and **`cloth.js` is deleted**
      ([16-solvers.md](16-solvers.md) §3b has the inventory). Not before: it
      is the only thing in this project that can sew, so deleting it first
      would leave no way to assemble a garment at all.

      *Why it is first:* W is now the whole wait, it is the last phase that is
      not in wasm, and **`cloth.js` is to be deleted** — so this is not an
      optimisation of it, it is the port that lets it go
      (the drape is already wasm-only in the page, and the side-car is out of it
      as of 2026-10-16). What moves is the *algorithm*, the
      constant-rate feed that beats Blender's sewing springs 0.024 cm to
      9.2 cm; the file it currently lives in is not what won.

- [ ] **Map the fabrics onto sewcloth, measured against the oracle.**
      **Every number in this item is void and has to be taken again:** it was
      measured while gravity pulled the cloth along the body's back
      ([00-backtotrack.md](00-backtotrack.md) §7b), so the "6 % long hem" and
      "2 folds instead of 4" describe a garment being dragged sideways rather
      than a fabric. With down pointing down the same drape settles at
      160.04 cm against 160 cut, in 8 folds. Re-measure first; there may be
      nothing left to map. The wasm drape gets **contact** right — 0 % of the cloth inside the body,
      stock Blender's own clearance, in a sixtieth of its time
      ([16-solvers.md](16-solvers.md) §3b) — and gets **stretch** wrong:
      169.68 cm of hem where the pattern was cut at 160 cm and both the oracle
      (160.07) and `cloth.js` (159.99) settle within 0.1 cm. About 6 % long,
      and 2 deep folds where the oracle throws 4, which is the same fact seen
      from the side.

      *Do:* sewcloth takes mass, tension and damping; `FABRICS` carries a
      bending length and a **measured** strain limit, and nothing maps one
      onto the other — the viewer passes friction and thickness and lets the
      rest default. Find the mapping by measurement against the side-car, not
      against `cloth.js`: it is derived from Blender, so the parameters it
      wants are Blender's, and `tools/drape_blender.mjs` already compares the
      two on one metric.

      *Acceptance:* hem length within the weld tolerance of the oracle's on
      the four-panel skirt, fold count equal, for each of the named fabrics
      that has a reference run — or the residual stated as the bound sewcloth
      diverges by, which is the contract its own README claims and does not
      yet quantify.

      *Why it matters:* this is now the only thing between the wasm drape and
      being simply the drape.

- [ ] **Validate the time integration against two closed forms.** The
      remaining analytic half of [18-validation.md](18-validation.md) Step 5.
      Nothing in this project checks the integrator itself: every finding so
      far has been about a constitutive model or an instrument, and the
      stepping has never been compared with an answer known in advance.

      *Do:* two cases, both cheap and both exact.
      **Free fall** — a disc with no body, no pins and `linearDragPerSec: 0`:
      the centre of mass must fall `½gt²` and every vertex must stay at the
      same relative position. This checks gravity, the integration, and
      whether the velocity clamp (`maxVelocity: 400`) silently truncates a
      real fall. **Rest** — the same disc fully pinned, and separately laid on
      the floor: nothing may move, and `kinetic()` must stay at zero rather
      than drifting.

      *Acceptance:* free-fall displacement within 1 % of `½gt²` over 1 s at
      the default substep count, with the deviation reported rather than
      asserted away; `kinetic()` bounded below a stated floor over 5 s at
      rest for all seven presets.

      *Why it is first:* it is the cheapest unexamined layer left, and it
      bears directly on a known open question — the denim bounce is **half
      numerical** (8× the substeps halves the rebound without removing it,
      §6.7/Step 5), and separating the solver's contribution from the cloth's
      needs an energy measure that does not yet exist. A drift number also
      tells us whether the 4-substep catastrophe was energy injection or
      merely under-resolution.

---

## Decisions outstanding

Live entries from [18-validation.md](18-validation.md) §8. Listed here so this
file is the only place that has to be read to know what is next.

- **§8.3 — Step 7: remesh, side-car, or a documented ceiling?** Partly
  pre-empted: `docs/16-solvers.md` §3 already sends drape to the side-car and
  §6 records that C-IPC builds. What is open is the *boundary* — which mesh
  densities stay in `cloth.js` and which go over the wire.
- **§8.4 — which physical measurements will actually be made?** **Largely
  dissolved 2026-10-12.** It was being treated as a blocker when most of what
  it blocked was either computable or already published. The shear geometry is
  computed (`tools/shearnet.mjs`), the locking angles are literature values in
  `FABRICS.shearLockDeg`, the strain limits came from `sim/cipc/fabrics.md`,
  and the bending lengths were always published ranges. What a physical
  measurement would still *refine*, rather than unblock: the locking angle of
  a specific cloth (one square and a protractor — shear it until it ripples),
  and the crease pitch on a draped disc, which is the only number in the
  project that came from looking at real fabric and currently sits at ~1 cm
  from a single observation.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

- **Stop running two simulations of one fall; stream the side-car's frames** —
  done 2026-10-12, from the report that the garment "teleported back up" after
  X. The local solver was animating a fall whose contact lets the body
  through, while Blender draped the pre-fall pose and then overwrote it.
  Blender now flushes each solved frame as a JSON line, `GET /frames` reads
  them mid-solve, and the viewer plays those instead of simulating: one
  computation, by the solver that gets contact right. Frames verified arriving
  during the solve (first at 8.0 s, then every ~1.4 s). Collider cut from
  12,288 to 6,144 triangles on measurement — p95 difference 0.38 cm, inside
  the cloth's thickness, for a third off the wall time. Recorded at
  [18-validation.md](18-validation.md) §6.10.

- **Decide §8.1, §8.5, §8.6** — done 2026-10-12, all three. Shear defaults
  inert (mechanism kept, two values restore it); bending deficit accepted and
  named, with `--calibrated` for figures quoted against published ranges;
  measured strain limits adopted as a flat 6.1 % woven floor. **Gate 278 pass,
  0 fail — green for the first time**, with the dart closing at 0.185 cm as
  predicted and seam closure improving on three independent checks. One repair
  needed on the way: an assembly check hardcoded `maxStretchPct <= 4.0` where
  its own name said "past what it can take", now `grainOverLimit <= 1.05`
  against the fabric's own limit — the second absolute-threshold-for-relative-
  property defect of the session, now recorded as a rule in §9. Recorded at
  [18-validation.md](18-validation.md) §8.1, §8.5, §8.6 and §6.3.


- **Per-frame impact tracking, and the reported denim bounce** (the small half
  of Step 5) — done 2026-10-11. `_trackMotion()` reports `reboundCm`,
  `bounces`, `peakSpeedCmPerSec`. The bounce is real: denim rebounds 1.84 cm
  over 6 bounces, interfaced twill 2.45 cm over 8, silk habotai **zero**. It
  tracks flexural rigidity (7.8 / 1198 / 3188) and not damping — the two that
  bounce have the *higher* `damp` — so it is bending energy, not tensile
  elasticity. It is also partly numerical: 8× the substeps halves the rebound
  (1.84 → 0.92) without removing it. `impactSpeedCmPerSec` is marked
  untrustworthy in the code (131–200 cm/s for the same drop). The energy-drift
  half and the analytic cases are still open. Recorded at
  [18-validation.md](18-validation.md) Step 5.

- **Converge the bending solve, or make it converge cheaply** — done
  2026-10-11: the cost is measured and the answer is that it cannot be made
  cheap by tuning. Work per frame is `substeps × (stretch + bend sweeps)` and
  the defaults spend 160. Reaching 10 % accuracy needs 2560 — **16×** — at
  160 substeps. Substeps dominate sweeps at equal cost (160/8/8 at 2560 beats
  80/8/32 at 3200), correcting an earlier note here that said the reverse.
  Reallocating the existing 160 toward substeps gives 2.3× for free but not
  the 30× needed. So the remedy is a decision, now §8.6, and the long-term
  answer is an implicit solve rather than a constant. Recorded at
  [18-validation.md](18-validation.md) §6.8.


- **Fix the discrete bending model's normalisation against element size** —
  done 2026-10-11, and **there was nothing wrong with the normalisation.**
  Driven to 80 substeps and 32 sweeps the solver matches closed-form beam
  theory to 13 % and the asked bending length to 4 %, `BEND_SCALE = 30`
  unchanged — so `k = BEND_SCALE·D·|e|²/A_e` is right and the stencil's `len`
  and `area` are the right quantities. The deficit is **under-convergence**:
  `c_eff` goes 0.90 → 1.26 → 1.96 → 3.17 as substeps and sweeps rise, against
  an asked 3.3. The apparent mesh-dependence follows, since convergence
  quality falls as the element count rises. `cloth.js`'s own comment on
  `BEND_SCALE` had named the mechanism; what it could not know was that the
  instrument it was fitted against returned `edge/2`. Recorded at
  [18-validation.md](18-validation.md) §6.8; the remaining cost decision is
  item 1.


- **Settle whether the fine-mesh penetration floor is real or a statistic** —
  done 2026-10-11. `penetration()` now reports the distribution behind its
  maxima. The extent converges monotonically — 4.55 % → 1.16 % → 0.31 % of
  sampled points inside the body at edges 2.2 / 1.5 / 1.1, a 15× reduction —
  so contact is converging and the "floor" was not a defect. The depths do
  not converge, because at the fine end only ~34 points are inside at all and
  a p95 over those is its second-worst member. Rule: compare `insidePct`,
  never `deepestEdgeCm` or a percentile, across mesh sizes. Recorded at
  [18-validation.md](18-validation.md) §6.6.

- **Swap the accordion gate check from a stack-height ratio to
  `deepOverlaps`** — done 2026-10-11. The old control wanted contact-on to
  stack 5× taller than contact-off, which only worked while a crease had no
  radius; a real fillet gives the limp control loft of its own and the ratio
  fell to 2.5× *while the thickness model got better*. The check now asserts
  the proposition — pairs more than half a thickness through each other — and
  reads 5 against 35,206, a 7,000× discrimination. Threshold not loosened:
  20× margin with a floor of 20. **Gate 277 pass / 1 fail**, back to its
  pre-session count, the remaining failure being the dart's guessed strain
  limits (§8.5). Recorded at [18-validation.md](18-validation.md) §6.3.

- **A substep floor, or a warning, for the run that slid off the body** —
  done 2026-10-11. Swept a wool crepe disc: 2 substeps slides off entirely
  (97 cm, never settles), 4 is confidently wrong (names the shoulder instead
  of the neck, grain at 1.9× the tear limit, body 2.3 cm through the cloth),
  6 is the floor for a right answer and 10 for the strain limit to hold.
  `healthy()` catches none of it — it only looks for NaN. The obvious
  diagnostic failed: the strain limiter's residual is zero at every substep
  count, since it converges to its ceiling every time. The signal that works
  is `report().grainOverLimit`, the grain strain against the fabric's own
  `maxStrain`, which warns once above 1.2 — 1.88 at 4 substeps, 0.80 at 10,
  0.36 at 16. Recorded at [18-validation.md](18-validation.md) §6.7.

- **Make the cantilever an actual Peirce test: bisect the overhang** — done
  2026-10-11. `peirce()` solves for the free length by regula falsi on the tip
  angle and reports `c = L/2` with its convergence state. Width-independent
  (0.501 / 0.500 / 0.498 at widths 5 / 2 / 1.5), converges in 5 settles on
  denim with the bracket centred on `L = 2c`, and the specimen-length
  dependence that invalidated every earlier verdict is gone by construction.
  **Mesh-independence fails** — 1.74× over a 1.5× refinement — and that
  failure is now attributable to the solver, which is the handoff this item
  existed to produce. Two bugs of mine fixed inside it: the mesh sized from
  the trial length (self-referential runaway to a 0.45 cm specimen), and a
  silently exhausted settle budget. Recorded at
  [18-validation.md](18-validation.md) §6.9, §6.8 and Step 3.


- **Fix the cantilever readout so it stops quantising to `edge/2`** — done
  2026-10-11, and it uncovered two deeper faults. The interpolation works: the
  scan is monotone and repeat-free (0.412 … 9.607 against the old
  0.75 / 0.75 / 0.75 / 1.50 …). The tool now also reports `rowsToCrossing`,
  `rowPitchCm` and `resolved`, and refuses a stiffness verdict when the
  crossing falls inside fewer than two rows — the limp presets were all in
  that state at the default settings. But mesh-independence still fails and
  does not converge (0.403 / 0.470 / 0.588 / 0.442 at edges 1.0 / 0.6 / 0.4 /
  0.25), and the cause is §6.9: the test is not Peirce's, and its answer
  depends on the specimen length. Carried as item 1. Recorded at
  [18-validation.md](18-validation.md) Step 3, §6.8 and §6.9.


- **Find which pre-session `cloth.js` change regressed the dart seam
  closure** — done 2026-10-11. It was the replacement of cross-spring bending
  with dihedral hinges on Peirce bending lengths, and **it is not a defect**:
  linen's 2.3 cm is inside its published 2.0–2.6 range, and the dart gap
  tracks bending stiffness monotonically (0.252 cm at 2.3, 0.097 at 1.0,
  0.026 at 0.3 — the old model behaved like 0.3). What actually stops the
  seam is the cloth's **guessed** 3 % strain ceiling: `seamsAtTheLimit: 0`,
  `peakTensionGf: 28`, `maxStretchPct: 3`. Raising it to any measured value
  from `sim/cipc/fabrics.md` closes the dart (0.185 cm at 6.1 %, 0.030 at
  13.4 %). Same root cause as §6.6. Recorded at
  [18-validation.md](18-validation.md) §6.3; the fix is §8 decision 5.

- **Attribute the dart-closing gate failure against a pristine checkout** —
  done 2026-10-11. Clean worktree at `d9d6f01`: **268 pass, 0 fail**, dart
  check **0.029 cm**. Working tree: 0.252 cm. Therefore a regression from
  uncommitted work, not committed code. Recorded at
  [18-validation.md](18-validation.md) §6.3.
