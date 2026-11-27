# 00 — Back on track

This document exists because the project was moving and then stopped. The
work before the stall is recorded in [18-validation.md](../todos/18-validation.md) and
its queue in [19-todo.md](../todos/19-todo.md); neither of them records the stall, because
the stall is not a finding about cloth. It is a finding about how the work was
being done.

Its purpose is to get from "the current state is unusable" back to a state that
can be worked on. It was written before the cause was known, so most of what
follows is a statement of what is observed, a question, or a rule rather than a
conclusion. Ground that has been regained is recorded as it is regained, with
the files that show how, starting at §3.

---

## 1. The report

Written in the user's terms, not mine, and not yet translated into a
hypothesis:

- It was going well.
- Then progress stopped — not slowed, stopped.
- The current state is unusable.

*Answered:* none of them. The expectation was **real-time rendering**, and
the simulation was running at 2.1 fps because it was configured for accuracy
rather than for interaction. §2 has the measurements.

> **Cost:** this question was asked at the top of this document and then left
> open for an entire session, while the work went to a Blender fork, five
> assembly kernels and a wasm solver. All of that is real and measured, and
> none of it was what had been reported. **Ask what the symptom is, and wait
> for the answer, before choosing what to build.**

## 2. What "unusable" means, concretely

**Answered 2026-10-16: the first one was real-time rendering, and driving the
assembly by hand afterwards named three more.** Symptoms 2–4 came from one
pass through the viewer — J, the pieces moved up and out until they englobed
the arms, W, X — and each one is measured in §7 and §8 rather than described.

| # | Symptom | Where seen | Expected | Observed |
|---|---------|------------|----------|----------|
| 1 | The drape is not real-time | watching a skirt fall | interactive, 30–60 fps | **2.1 fps** (469 ms/frame) |
| 2 | The body shows through the cloth | after J, W, X in the viewer | no clipping at all | **7.08 % of the cloth's area inside the body**, 8.97 cm at the deepest |
| 3 | W is too slow | sewing a four-panel skirt | interactive | **126 ms/frame** (7.9 fps), and **438 ms/frame** (2.3 fps) with darts |
| 4 | X is faster now, and X is the one that was fixed | the same pass | — | **8.6 ms/frame**, the wasm backend — now the only one in the page |

Symptom 2 is closed (§7): it was the limbs, and the drape now puts **nothing**
inside the body. Symptoms 3 and 4 are the same fact from both ends — the drape
was moved into wasm and the sewing was not — and §8 is what that costs and
what it takes.

Nothing was broken. `node test/run.mjs` passes **279 checks, 0 failures** on
this checkout, and the solver computes what it is asked to compute. The
settings it was asked to compute at are film settings, not interactive ones:
3,887 vertices, solver quality 14, collision quality 12, self-collision on.

**Measured, on the same scene, by relaxing them one at a time:**

| configuration | verts | ms/frame | fps |
|---|---|---|---|
| film — what was being watched | 3,887 | 469.5 | **2.1** |
| quality 5 / collision 2 | 3,887 | 118.4 | 8.4 |
| + no self-collision | 3,887 | 88.7 | 11.3 |
| **+ 5 cm mesh** | **1,020** | **27.0** | **37** |
| + 8 cm mesh | 424 | 10.4 | 96 |

**Real-time is reachable at 1,020 vertices**, and comfortably so at 424. The
question was never "why is it broken" but "what does interactive cost", and
the answer is: a quarter of the vertices, Blender's default solver quality
instead of fourteen, and no self-collision.

**What that costs, stated rather than glossed.** A 5 cm mesh has a quarter
the vertices, so it carries fewer and coarser folds. Without self-collision
the cloth can pass through itself — visible the moment a skirt folds onto
itself. And lower solver quality means more stretch:
[20-fork.md](20-fork.md) §9 measured strain against quality on this same
scene, and the drape moved 4.6 cm between quality 14 and 30. Interactive
cloth is a different garment from accurate cloth, and the project needs to
decide which it is showing at any moment — not discover the difference by
watching it.

*Caveat on these numbers:* they are the solver headless, not the viewer. The
viewer adds rendering and, if it uses the side-car, a round trip. They
establish that the simulation fits an interactive budget, not that the
current viewer does.

## 3. First ground regained: the solver underneath is sound

**2026-10-16.** The first thing re-established, because everything else is
downstream of it: Blender's cloth solver works, on this machine, driven from
here, and it can be watched rather than taken on trust.

Three drops side by side, deliberately chosen so the right answer is known
before the solve — no project geometry, no job file, factory cloth settings:

| Drop | Expected | Observed |
|------|----------|----------|
| Sheet onto the cube | sets and stays | set, creased at the four top edges, corners hanging free |
| Sheet centred on a sphere | marginal — holds by symmetry | held, draped into a bell with vertical folds |
| Sheet offset 1.2 m in x and y on a sphere | slides off | slid off; sphere bare, sheet crumpled on the floor beside it |

All three as predicted. That is a working solver, a working collider and
working friction, and it means a wrong drape from here is this project's
doing and not Blender's.

**The files.**

- [`sim/blender_drops.py`](../sim/blender_drops.py) builds the three drops and
  saves `out/drops.blend`; [`sim/blender_play.py`](../sim/blender_play.py)
  frames and plays it.

  ```bash
  blender --background --factory-startup --python sim/blender_drops.py
  blender out/drops.blend --python sim/blender_play.py
  ```

- [`sim/blender_show.py`](../sim/blender_show.py) does the same for a *real*
  drape job, reusing [`sim/blender_drape.py`](../sim/blender_drape.py)'s scene
  setup rather than restating it, so what is on screen is what the side-car
  solves (rule 7). It still needs a job file to open; producing one from the
  garment is not yet wired up.

- The source of the solver itself is readable at
  `src/blender-fork/source/blender/blenkernel/intern/cloth.cc`, with
  `collision.cc` beside it — rule 8, and the same version as the installed
  binary.

**Solve rate, and a question already answered.** Timed off the capture stamps:
the three drops ran at **~5 frames/sec** of simulated time — 7,803 cloth
vertices in total, factory quality, 12-triangle colliders. That is the same
order as the real drape, which [18-validation.md](../todos/18-validation.md) §6.10
measured at 20.7 s for 180 frames (~8.6 frames/sec) on 1,872 cloth vertices
against a 6,144-triangle collider. **Per frame the real drape is the faster of
the two.** So a drape that feels slow is not a slower solver; it is 180 frames
of a 6-second fall at roughly six simulated frames per second of wall clock,
which §6.10 already names as the honest limitation and already answers by
streaming frames as they solve rather than by finishing sooner. The collider
cost table is there too.

> **Cost:** asked why the main program is slow, I started building a new
> timing experiment. §6.10 had measured it on 2026-10-12 — rate, collider
> table and remedy. Rule 5, broken again, in the document about not breaking
> these rules.

**A dialog, and the cost of accuracy measured.**
[`sim/blender_skirt.py`](../sim/blender_skirt.py) puts the main program's own
measurements — waist, length, circle fraction, gather, edge — into a Blender
dialog that cuts the skirt, stands a cone under it, and drops it with a
button. The geometry is [`app/js/skirt.js`](../app/js/skirt.js)'s annular
sector restated in Python, and it agrees with it exactly: 78 cm waist, 55 cm
long, full circle gives a **423.58 cm hem** against the 424 cm that file's
header predicts, lying perfectly flat as a full circle must. Dropped, it
catches the cone at the radius where the cone is as wide as its waist and
throws the flutes `skirt.js` describes.

Because the solver settings are dialog fields rather than constants, what they
cost is now measurable. Same skirt, 3,887 vertices, 40 frames:

| settings | wall |
|---|---|
| quality 14, collision 12, self-collision on — what [`drapejob.js`](../app/js/drapejob.js) sends | 22.9 s |
| quality 5, collision 2, self-collision off — Blender's defaults | 5.2 s |

**4.4×**, on identical geometry. Taken with §6.10's collider table, "the drape
is slow" resolves into two chosen quantities — accuracy and collider density —
and neither is a defect. What it is *not* is a seamed garment: this cuts one
cone, so the sewing the main program exists to do is absent by construction,
which is what makes it a control.

**Two traps, both of which cost an attempt.** A `--python` startup script runs
*before* the UI context exists, so `bpy.context.active_object` — what every
tutorial reaches for — raises `AttributeError`, and the script dies silently
leaving a half-built scene on screen. Meshes are built through `bpy.data`
instead. And Blender shows its splash over the viewport whenever it starts
with no file loaded, which is why the scene is built headless, saved, and
opened.

## 4. The last state known to be good

To be established, not assumed. Candidates are the committed history; the most
recent commit claims a green gate, and that claim is checkable rather than
believable.

- Last commit whose gate was verified green, with the run that verified it:
- Last commit at which the viewer was driven end to end by a person:
- Whether the working tree is clean, and if not, what is in it:

The distinction matters because it decides the shape of the recovery: a
regression in committed code is bisectable, a regression in uncommitted work is
not, and a broken *environment* is neither.

## 5. How progress stopped

The part of the stall that is mine. The project's own working rules
([CLAUDE.md](../CLAUDE.md)) were each written down because they had already been
broken once, and a stall is the predictable result of breaking them again:

- guessing at causes instead of building the measurement (rule 1),
- reading a scalar against a threshold and calling it verification (rule 2),
- throwaway scripts instead of instruments in `tools/` (rule 3),
- proposing a direction without reading this project's documents (rule 5),
- changing a tuned system without a baseline and a regression run (rule 6).

*Open:* which of these actually happened in the sessions before the stall, and
whether the stall has a sixth cause not in that list — for instance a queue
([19-todo.md](../todos/19-todo.md)) whose only remaining item is too large to finish in
one sitting, so that every session starts it and none lands it.

## 6. Recovery

In order, and each step produces an artifact so the next session does not have
to re-derive it.

1. **Name the symptom.** §2 filled in from the user, not from a guess.
2. **Reproduce it in the headless path.** If it only reproduces in the viewer,
   that is itself the finding (rule 7).
3. **Find the last good commit by measurement.** `node test/run.mjs` at the
   candidate, and the trace table (`node tools/trace.mjs`) for the numbers the
   gate does not cover.
4. **Attribute the difference.** Committed code, uncommitted work, environment,
   or the side-car. One of four, decided by data.
5. **Restore usability before improving anything.** The goal of this document is
   a workable state, not a better one. Nothing from §19's queue is picked up
   until §2 is empty.
6. **Record it where it belongs.** The outcome goes to
   [18-validation.md](../todos/18-validation.md) against what it settles; anything that
   must not happen again becomes a rule in [CLAUDE.md](../CLAUDE.md) with its
   cost next to it, and this document is then closed.

## 7. The body came through the cloth, and it was not the solver's accuracy

**2026-10-16. Closed, with the fix measured.** The report was clipping after
J, W and X with the pieces arranged high and wide enough to englobe the arms.
Rule 1: no hypotheses until there is an instrument, and the instrument that
existed (`app/js/clearance.js`) measured the wrong path, because X in the
viewer no longer runs this project's solver. It runs sewcloth in wasm
([20-fork.md](20-fork.md)), and nothing headless could drive that.

So the first thing built was not a fix:

- `node tools/trace.mjs --wasm` — the whole J → W → weld → X table, with X
  draped by **the viewer's own backend**, module and all. `--cell` sets the
  body field's resolution.
- `node tools/wasmclip.mjs` — the same drape measured twice over, against the
  whole body and against the torso alone, so the clipping is **attributed**
  rather than totalled. `--thickness`, `--substeps`, `--edge` and `--cell` are
  the four levers, each sweepable.

**What they said.** Four-panel skirt, 988 vertices, 3 cm triangles:

| drape | inside area % | deepest cm | triangles touched |
|---|---|---|---|
| this project's solver (`cloth.js`) | 0.11 | −0.19 | 19 |
| sewcloth in wasm, as the viewer had it | **7.08** | **−8.97** | 166 |

and then, over the same wasm-draped garment, measured against two bodies:

| measured against | inside area % | deepest cm |
|---|---|---|
| the whole body: torso **and** the arm and leg capsules | 7.08 | −8.97 |
| the torso alone | 0.55 | −0.64 |

**92 % of the clipping was limb.** Not resolution, not substeps, not the
solver: `app/js/drapewasm.js` built its field from `trianglesOf(surface)`,
which walks the parametric torso — and the arms and legs are not on that
surface. They are capsules that `body.js` answers for analytically, and
`cloth.js`'s `BodyCollider` asks them on every query (`_limbQuery`). The wasm
path asked a field that had never heard of them. The cloth was not passing
through the body; **the legs were not in the body the solver was given.**

The obvious hypothesis was the field's resolution, and it was wrong, which is
the reason to sweep rather than assume: at 1.0, 0.5 and 0.25 cm cells the
numbers were 7.08 %, 6.98 % and 7.45 %. Refining a field that does not contain
the legs refines nothing.

**The fix, in two parts, both measured.**

1. `SDF.fromBody` (`app/js/sdf.js`): the torso's level set with the limb
   capsules folded in as `min(phi, capsule)`, exact and analytic, over a grid
   whose bounding box is extended to cover them (`limbExtent`). Min rather
   than re-triangulating the capsules into the mesh, because the sign in that
   class comes from counting ray crossings, which gives the symmetric
   difference of two overlapping closed shells and would have reported a point
   inside both a thigh and the pelvis as **outside**.
2. A floor under the contact thickness, in `drapewasm.js`:
   `max(0.25 × mean edge, 0.8 × cell)`. sewcloth tests points — vertices and
   edge midpoints — so a triangle's interior is never asked about and sags
   between the points that were; and the body is itself a sampled field, whose
   error near the skin is of order its cell. A constant cannot express either.

| | inside area % | deepest cm | ms/frame |
|---|---|---|---|
| torso-only field, 0.35 cm thick | 7.08 | −8.97 | 8.1 |
| whole-body field, 0.35 cm thick | 0.80 | −1.08 | 8.5 |
| **whole-body field, floored thickness** | **0.00** | nothing inside | **8.8** |

Nothing inside the body, at 2 cm, 3 cm and 5 cm triangles, for 0.3 ms a frame.

> **Cost:** none to speak of, and that is the point worth keeping: the
> measurement cost two instruments and the fix cost forty lines, because the
> instruments were built before the hypotheses. The guess that was ready to
> hand — "the field is too coarse" — was measured and was false.

*Candidate rule, for §6.6:* **a solver handed a field has been handed a
body, and it must be the same body the other solver collides against.** Rule
7 says the viewer and the headless path must do the same thing; this is its
sharper form across backends, and three backends is where it bites.

**And then the comparison that should have been run first.** Mid-way through,
the obvious reading of this was that the wasm backend was the suspect one,
because it was the one that had just been measured misbehaving. It is not:
sewcloth is **derived from Blender's own cloth solver and improved on it**
(`src/sewcloth`, [20-fork.md](20-fork.md) §8), so the thing to check it
against is the oracle — stock Blender — and not this project's own `cloth.js`,
whose contact [16-solvers.md](16-solvers.md) §3 already describes as unable to
bound what happens between vertices. Run all three on the same welded garment:

| backend | wall | hem y | inside area % | deepest | hem cm (cut 160) | folds |
|---|---|---|---|---|---|---|
| side-car, stock Blender — **the oracle** | 90.7 s | −55.2 | **0** | +0.03 clear | 160.07 | 4 |
| **sewcloth in wasm**, after this section's fix | **1.5 s** | −55.9 | **0** | +0.13 clear | 169.68 | 2 |
| `cloth.js` | 10.7 s | −55.0 | 0.11 | −0.19 **inside** | 159.99 | 4 |

The hem height difference that looked like a 22 cm disagreement **was the
missing limbs**: with no legs in its field the skirt fell inwards and bunched
at −33 cm. With them, it hangs at −55.9 against the oracle's −55.2, clear of
the body where `cloth.js` is still 0.11 % inside it, in a sixtieth of the
oracle's time. What genuinely remains is **stretch**: 169.68 cm of hem where
the pattern was cut at 160 cm, and 2 deep folds where the oracle throws 4.
That is a parameter question — sewcloth takes mass, tension and damping; the
fabrics here carry a measured strain limit, and nothing maps one onto the
other yet — and it is queued in [19-todo.md](../todos/19-todo.md).

> **Cost:** I wrote the open item as "why does the wasm drape differ from
> `cloth.js`", with `cloth.js` as the implicit reference, and had to be told
> twice that sewcloth is the Blender-derived one and that `cloth.js` is on its
> way out. Both facts were already in this repo —
> `src/sewcloth/README.md` and [20-fork.md](20-fork.md) §8 state the
> provenance and name the oracle — and I had read the first of them **in the
> same session**. Rule 5, and the other half of rule 4: deference to one's own
> code is the same error as deference to someone else's. Which solver is the
> reference for which question is now written where a session reads it:
> [16-solvers.md](16-solvers.md) §3b, and in rule 4 of
> [CLAUDE.md](../CLAUDE.md).

### Down was the wrong way, for every drape this project has ever computed

**2026-10-17, and it is the largest single defect found in this recovery.**
Reported from the screen: *"with that pattern I get a skirt that is flat at
the front and has a big bump at the back, and real fabric doesn't behave like
this"*.

It does not, and the cloth was not behaving like fabric: **gravity was
pointing at the body's back.** This project is Y-up — the body stands along
+y, a skirt's hem sits at y = −55 — and `sewcloth`'s default gravity was
`(0, 0, −981)`, which is Blender's convention and most engines'. `drapewasm`
never overrode it. Measured on one welded skirt, 180 frames each:

| gravity | mean vertex displacement | hem (cut 160) | folds |
|---|---|---|---|
| **(0, 0, −981)** — what X was using | **−12.29 cm in z**, and **+5.86 cm UP in y** | 168.7 cm | 2, 17.5 cm deep |
| (0, −981, 0) | −2.33 cm in y, −0.11 cm in z | 159.2 cm | 5, 5.9 cm deep |

A skirt pushed backwards flattens against the front of the figure and piles up
behind it, which is the report, exactly.

**Two findings written up earlier in this document were this bug wearing a
disguise.** The "wasm drape stretches — 169.68 cm of hem where the pattern was
cut at 160" was the hem being dragged sideways, not a fabric parameter; and
the "hem sits 22 cm higher, with vertices above the pinned waist" was the same
thing before the limbs were in the field. Both were measured correctly and
attributed to the wrong cause, because the measurement that would have named
it — *which way did the cloth actually move?* — was never taken. A mean
displacement per axis is three numbers and it was not in any instrument.

**And the side-car had it too.** `sim/blender_drape.py` fed the Y-up mesh
straight into a Z-up scene with Blender's own `(0, 0, −9.81)`, so the oracle
has been draping sideways as well — which is why opening a job in Blender's
window showed a body **lying down**. It now rotates into Blender's convention
on the way in and back on the way out (`to_blender` / `from_blender`), rather
than turning the gravity sideways to match the mesh: the window then shows a
body standing up, and every Blender default, its floor and every tutorial
about its cloth solver agree with the scene instead of needing a mental
transform.

> **Cost:** everything downstream of a drape, for as long as the wasm backend
> has existed. The clipping work in §7 is unaffected — contact is contact
> whichever way the cloth is pulled — but every fold count, every hem length
> and every "this settles differently from `cloth.js`" in between was measuring
> a garment being dragged backwards. Two of them are corrected above; the
> fabric-mapping item in [19-todo.md](../todos/19-todo.md) has to be re-measured from
> scratch. **The rule it breaks is rule 1, in the one place nobody thought to
> look: a solver's defaults are an assumption, and an assumption that nothing
> ever states is an assumption nobody ever checks.** `sewcloth`'s default is
> now −Y, the five native tests that really do drop things along −z say so
> explicitly, and `drapewasm` sets it anyway.

## 8. W is the slow one now, and the sewing has to go into wasm

**2026-10-16, named and measured; not yet built.** X became fast because the
drape moved into wasm. W did not move, so W is now the whole wait.

Measured, four panels, 3 cm triangles, substeps 10, gravity off,
self-collision off — exactly what the viewer does:

| what is being sewn | vertices | stitches | ms/frame | fps |
|---|---|---|---|---|
| the plain skirt | 1064 | 76 | 126 | 7.9 |
| the same, with asymmetric darts | 1126 | 105 | 438 | 2.3 |
| with darts, substeps 4 | 1126 | 105 | 174 | 5.8 |
| with darts, edge collision off | 1126 | 105 | 422 | 2.4 |

So it is not the edge collision, and dropping substeps buys a factor of 2.5 at
the cost of accuracy the sewing phase is there to have.

*The darted rows were measured before the dart pairing was fixed (§9), and
half of that cost was the pairing: the same garment now runs at **212
ms/frame** on 1,170 vertices and 129 stitches. The plain row stands, and the
conclusion stands with it — 126 ms a frame is 7.9 fps against a 16.7 ms
budget, so the sewing is two orders of magnitude from interactive whatever the
garment.*

**Where the time goes** — `node tools/profile.mjs --scenario sew`, which is
new, because the profiler could only see the drop tests and the phase that is
slow is the one it could not look at. 2,436 vertices, 1 s simulated in 22.7 s:

| | self ms | % |
|---|---|---|
| `_solveHinges` (cloth.js) | 13,255 | **58.4** |
| `_substep` | 4,891 | 21.6 |
| `_dampAlong` | 1,007 | 4.4 |
| building the body field (`SDF`, `distance2ToTri`) | 1,093 | 4.9 |
| `_solveStitches` | 176 | 0.8 |

**The stitches are not the cost. The bending is.** Which decides the shape of
the wasm work, and it is not "port the sewing": sewcloth already has springs,
an implicit solve, an SDF collider and self-collision. What it does not have
is **hinge constraints** and **stitch constraints with a constant-rate feed** —
the two things `assemble.js` and `cloth.js` were written for, and the second
of which measurably beats Blender's own sewing springs (0.024 cm against
9.2 cm, rule 4). So:

1. `sc_set_hinges` + the bending solve in `src/sewcloth/src/sewcloth.c`. 58 %
   of the frame, and the piece sewcloth lacks that the drape also wants.
2. `sc_set_stitches`, `sc_feed_stitches(cm_per_sec)`, `sc_stitch_gaps` — the
   feed is the measurement (`maxStitchGap`), so the gaps have to come back
   out, per stitch, not as a scalar (rule 2).
3. A `sewWasm` beside `drapeWasm`, same shape, same write-back, so the JS
   sewing stays and the two are comparable (rule 4: decide by measurement).
4. The gate: `tools/trace.mjs` must report the same seam gap from both.

**And a stall, found by the dart fixture — which turned out to be the dart
fixture's own fault.** With asymmetric darts in, the sewing did not terminate:
the feed stopped 0.56 cm short and the worst gap sat at **1.72 cm from frame
~100 to frame 600 without improving**, while `isSewing()` stayed true.
Headless it burned the 3,000-frame cap; in the viewer W never stopped on its
own.

**It was the dart pairing, not the solver** (§9's Thales section). Stitches
were pulling points 2.5 cm from where they belonged and four points on one
dart were sewn to nothing, which is a tug-of-war the feed can never satisfy.
With the legs harmonised, the same garment sews in **88 frames** — feed fully
taken up, `isSewing()` false, worst gap **0.324 cm** — and the frame cost
falls from 438 to 212 ms as well, because the solver is no longer fighting
itself. 0.324 cm is still outside the 0.25 cm weld tolerance, so that seam is
reported and left open by X rather than welded, which is the intended
behaviour and not a stall.

The viewer keeps a **stall detector** regardless (`stepFrame`): a pass whose
widest gap stops improving for 120 frames while the cloth is no longer moving
ends and reports, rather than feeding into a wall. A solver that can wedge
once can wedge again, and the next one will not have a fixture to blame.

## 9. Asymmetric darts, as a fixture

**2026-10-16.** Everything assembled up to now was four identical panels, and
a symmetric garment hides a whole class of mistake: a mirrored piece, a seam
paired to the wrong side, a dart closed against its neighbour. They all look
like no mistake at all.

`app/js/skirtdarts.js` cuts darts that differ on purpose — two unequal darts
on one panel, one leaning 10° off the radial on the next, one panel with none,
one wide deep dart on the last, and a deterministic nudge so an eight-panel
skirt is not two identical halves. It is a test fixture and says so; nobody
would draft it. It adds no dart mechanism: `patternedit.js` already takes a
wedge out exactly and gives the two cut edges matching vertex ids, so
`assemble.js` sews a dart without knowing it is one.

- in the viewer: **they are in the skirt J and K draft**, controlled by *cut
  the test darts in* in "flare and gathers" and on by default. The button
  beside it, *cut asymmetric darts into it*, puts a freshly darted pattern on
  the cutting table instead, where the darts can be seen flat before J lifts
  them.
- headless: `node tools/trace.mjs --darts`.

**Twice reported as invisible after J, and twice for a different reason.**

*The second time it was not visibility at all: there were no darts.* Measured
on a fresh page, J laid out 1,064 vertices and 1,872 triangles with **0
darts** — because the fixture was reachable only by first pressing a button in
another folder, and J drafts its own skirt. A fixture that has to be found is
a fixture nobody tests with, so `currentSkirtPattern` cuts them now and J
reports what it laid out: *"4 seams and 4 darts (31 of the stitches)"*, 1,129
vertices, 1,892 triangles. The lesson is older than this document: **the
instrument has to be on the path the person actually walks.** Rule 3's
neighbour.

*The first time it was size, and that fix stands.* Reported from the screen:
the darts were not visible after J. They were there — 1,129
vertices and 1,892 triangles against 1,064 and 1,872 plain — and measurably
too small to see: the drafted intakes of 4.6–13.2° make a notch **3.96 cm**
across at its widest, on a 106 cm panel, with the next panel standing behind
it. The viewer's *test dart size* slider defaults to 2, which is a 7.20 cm
notch, and at that size the V reads immediately with the dart's threads marked
at its ends. Measured, scale 1 / 2 / 3: notch 3.96 / 7.20 / 11.12 cm, cloth
removed 54.5 / 110.5 / 169.3 cm². A fixture nobody can see is not a fixture,
and the knob says that out loud rather than letting the number pretend to be a
drafted dart.

On the four-panel skirt it takes out 54.5 cm² in four darts (9.1°, 4.6°, 9.0°
and 13.2° intake), leaves leg mismatches of 0.007 to 0.418 cm — the leaning
one is the worst, as it should be — and adds 29 dart stitches to the 76 seam
ones. It has already paid for itself twice: §8's stall, and the 3.5× sewing
slowdown that no symmetric skirt showed.

### The dart legs were paired by index, and should have been paired by Thales

**2026-10-16, reported from the screen and fixed.** "The dart connection
points between two triangle edges do not make much sense" — and they did not.

A dart is two straight legs leaving a common apex and sewn to each other, so
the correspondence is the intercept theorem: the point at fraction *t* of one
leg belongs to the point at fraction *t* of the other, and the stitches are
parallel chords across the wedge. The vertices on a leg are not chosen,
though: `splitAlongRay` puts them where the cut crossed the mesh, the two rays
cross different edges, and `takeOutWedge` then paired them **by index** —
first to first, second to second — which is only Thales' if both legs happen
to be split the same way.

`node tools/darts.mjs` is the instrument, and it says what was wrong in the
terms the pairing is supposed to satisfy: `dt`, the difference between the two
fractions a stitch joins, which should be zero.

| dart | points on leg 1 / 2 | pairs | worst `dt` | worst offset | sewn to nothing |
|---|---|---|---|---|---|
| 9.1°, SKIRT-01 | 7 / 7 | 7 | 0.0083 | 0.10 cm | 0 |
| 4.6°, SKIRT-01 | 5 / 5 | 5 | 0.033 | 0.30 cm | 0 |
| 9.0° **tilted**, SKIRT-02 | 7 / **11** | 7 | 0.119 | 1.46 cm | **4** |
| 13.2°, SKIRT-04 | 10 / 10 | 10 | 0.161 | **2.49 cm** | 0 |

The tilted dart is the one the fixture exists for: eleven vertices on one leg
against seven on the other, seven pairs, and **four points sewn to nothing**.
The worst stitch on the deep dart joined two points that start 2.49 cm apart
along the seam they are meant to be.

**The fix is not a better correspondence, it is no choice at all.** Rather
than pick which vertex matches which, `harmoniseLegs` makes the two legs carry
the same fractions: take every fraction either leg has, split the other leg
where it is missing one — while the triangles either side still exist, so the
mesh stays a mesh and no T-junction is left behind — and the pairing is then
forced, one to one, in order.

| dart | points on leg 1 / 2 | pairs | worst `dt` | worst offset | sewn to nothing |
|---|---|---|---|---|---|
| all four | **equal** | all of them | **0** | 0.001 cm | 0 |

Zero by construction rather than small by luck, which is the difference
between a dart that closes and a dart that happens to close.

> **Cost:** the fixture was built, used to find two other faults, and shipped
> with its own pairing wrong — and the thing that found it was a person
> looking at the screen, not the instrument, because `tools/darts.mjs` did not
> exist until after the report. Rule 2: `legMismatchCm` was being reported all
> along and read 0.007 cm on the dart whose stitches were 2.49 cm out of
> place. It measures the legs' *lengths*, not their *correspondence*, and a
> number that is right about the wrong quantity is worse than no number.

## 10. Where this stands

The ledger, so a session can start here and know what is left without
re-reading the rest. Finished work is named with the file that holds it;
unfinished work is in [19-todo.md](../todos/19-todo.md), because this document is not a
queue (§11).

**Done, 2026-10-16 and 17.** In the order the sections tell it:

| | what | where it lives |
|---|---|---|
| §2.1 | real-time named and costed: interactive at 1,020 vertices, 37 fps | §2's two tables |
| §3 | the solver underneath is sound — three drops predicted before they were run | `sim/blender_drops.py`, `sim/blender_skirt.py` |
| §7 | **the body no longer comes through X**: 7.08 % of the cloth's area inside the figure → **0.00 %**, which is stock Blender's own clearance on the same garment, in a sixtieth of its time, for 0.3 ms a frame | `SDF.fromBody` and `limbExtent` in [`app/js/sdf.js`](../app/js/sdf.js), the thickness floor in [`app/js/drapewasm.js`](../app/js/drapewasm.js) |
| §7 | the viewer's own drape backend, measurable headlessly at last | `node tools/trace.mjs --wasm [--cell]` |
| §7 | clipping **attributed** rather than totalled — 92 % of it was limb the solver had never been told about | `node tools/wasmclip.mjs [--thickness --substeps --edge --cell]` |
| §7 | the three backends compared on one garment with the oracle arbitrating, and **which is the reference for which question written down** where a session reads it | [16-solvers.md](16-solvers.md) §3b, rule 4 of [CLAUDE.md](../CLAUDE.md) |
| §7 | **the side-car is out of the page.** X drapes in wasm and nothing else does; the backend switch, `sendToSidecar`, the frame polling and the playback are deleted. `sim/server.py` stays as the oracle and the telemetry sink | [`app/js/main.js`](../app/js/main.js), [16-solvers.md](16-solvers.md) §3b |
| §8 | W's cost measured, and where it goes: **58 % `_solveHinges`**, 22 % `_substep`, 0.8 % stitches | `node tools/profile.mjs --scenario sew [--darts]` |
| §8 | **the sewing stall is gone** — and it was the dart pairing, not the solver: the darted skirt sews in **88 frames** to a 0.324 cm worst gap where it used to feed for ever at 1.72 cm, at 212 ms/frame instead of 438 | §9's fix; the stall detector in `stepFrame` stays as a guard, [`app/js/main.js`](../app/js/main.js) |
| §9 | an asymmetric garment to test with at all | [`app/js/skirtdarts.js`](../app/js/skirtdarts.js), `node tools/trace.mjs --darts` |
| §9 | one you can **see**: the fixture defaults to 2× intake, a 7.20 cm notch against 3.96 cm as drafted | the viewer's *test dart size* slider |
| §9 | and one that is **on the path a person walks**: the test darts are in the skirt J and K draft, where a fresh page used to lay out 0 darts | `currentSkirtPattern` in [`app/js/main.js`](../app/js/main.js), *cut the test darts in* |
| §9 | **the dart legs pair by Thales**, not by index: worst fraction error 0.161 → **0**, four points sewn to nothing → none, worst stitch offset 2.49 cm → 0.001 | `harmoniseLegs` in [`app/js/patternedit.js`](../app/js/patternedit.js), measured by `node tools/darts.mjs [--pairs]` |
| §8 | **sewcloth now says what it cannot do.** `sc_capabilities` gained `bending` and `stitches`, both **0**, the header opens with *IT DOES NOT SEW* and why the name misleads, and the smoke test throws if either ever reports 1 while the JS sewing is still doing the work | `src/sewcloth/include/sewcloth.h`, `src/sewcloth/src/sewcloth.c`, `src/sewcloth/test/smoke.mjs`, and [20-fork.md](20-fork.md) §8, whose "complete" is now "complete for a drape" |
| §8 | **the port is specified in W's own terms**, not the solver's: what pressing W calls, a stage-by-stage inventory of `_substep` against what sewcloth has, and six steps ending in *wire W to it* and *delete the JS sewing* | [19-todo.md](../todos/19-todo.md) item 1 |
| — | **rule 9**, written because it was broken three times in one session: a capability is not a feature; follow the path the person presses | [CLAUDE.md](../CLAUDE.md) §9 |
| §8 | **steps 3 and 4: the garment sews in wasm, and both sewings are in one table.** `app/js/sewwasm.js` (`WasmSewing` lives across frames, because W is watched where X is one solve), the hinge topology moved out to `app/js/bending.js`, and `node tools/trace.mjs --sew-wasm`. On the four-panel skirt: seams closed to **0.084 cm** with the feed spent, 145 frames at **24.1 ms/frame against cloth.js's 126** — the 5× the port was for | [`app/js/sewwasm.js`](../app/js/sewwasm.js), [`app/js/bending.js`](../app/js/bending.js), `tools/trace.mjs --sew-wasm` |
| §8 | **and the comparison immediately earned itself**: the wasm sewing left **34.5 % peak strain** where `cloth.js` leaves 1.9 %. The missing stage was `_clampStrain`, already the suspect for item 2's 6 %-long hem | found by `tools/trace.mjs --sew-wasm` the hour it existed |
| §7b | **down was the wrong way.** `sewcloth` defaulted to Blender's −Z gravity in a Y-up project and `drapewasm` never said otherwise, so every X pulled the cloth along the body's back: −12.3 cm of z and 5.9 cm *up* per vertex, against −2.3 cm of y when it is pointed down. Fixed in the library's default, stated again at the call site, and the five native tests that really do drop along −z now say so | `src/sewcloth/src/sewcloth.c`, [`app/js/drapewasm.js`](../app/js/drapewasm.js) |
| §7b | **the side-car had it too**, which is why Blender's window showed a body lying down. The mesh is rotated into Blender's convention on the way in and back on the way out | `to_blender` / `from_blender` in [`sim/blender_drape.py`](../sim/blender_drape.py) |
| §7b | **the garment as it stands after W, in Blender's own window**, to be looked at rather than scored — the half `sim/blender_show.py`'s header said was missing | `node tools/to_blender.mjs --open [--play]` |
| §8 | **and then X announced a drape that never stepped.** The fix above put the drape's branch *after* `stepFrame`'s `if (!(playing && sim)) return;`, and `sendToWasm` sets `playing = false` — correctly, because the local solver must not run while the wasm drape owns the vertices. So the loop returned before reaching the drape and X printed "stepped from the render loop so it can be watched" into a page where nothing moved. The branch now runs **ahead of** that guard, with the distinction written beside it: `playing` means *the local solver may run*, and the fall still has to be driven when it may not | `stepFrame` in [`app/js/main.js`](../app/js/main.js) |
| §8 | **X animates the fall instead of freezing the page.** It ran all 180 frames inside one call — 13.3 s at 73.8 ms/frame — so the HUD froze and the settled garment appeared without anyone seeing it drop. The drape now lives across frames and is stepped from the render loop, one simulated frame per rendered one, with the HUD measured only when it lands. `drapeWasm` keeps its loop for the headless callers, because nothing is watching those | `buildDrapeCloth` / `readBack` in [`app/js/drapewasm.js`](../app/js/drapewasm.js), `stepWasmDrape` in [`app/js/main.js`](../app/js/main.js) |
| §8 | **X was deleted by my own edit and restored.** Taking the side-car out of the viewer cut from the comment above `sendToSidecar` to the next definition, and `sendToWasm` sat between them: X threw `sendToWasm is not defined` and the garment never fell. The gate does not load `main.js`, and every headless check I ran after that edit drove J and W | [`app/js/main.js`](../app/js/main.js) |
| §8 | **W sews in wasm now, at 17 ms a frame against `cloth.js`'s 126.** No switch and no fallback: one solver, which is also what stops a bug report being about whichever backend happened to be selected. The sewing's own budget was measured rather than inherited from the drop test — substeps 8, 4 bend sweeps, 20 strain passes — and the cheaper settings close the seams **better**, because 200 strain passes and 8 bend sweeps are the cloth fighting the thread | [`app/js/sewwasm.js`](../app/js/sewwasm.js), [`app/js/main.js`](../app/js/main.js) |
| §8 | **it stops when the seams stop getting closer**, and leaves them open where they are, naming them: *"dart@P3 short by 0.3 cm (the cloth is at its limit)"*. A dart the body has no room for cannot close however much thread is fed at it, so the pass ends and the garment stays on screen showing where | `WasmSewing.stalled()`, the seam table |
| §8 | **and the dart that would not close was the PATTERN, not the solver.** A skirt drafted to the body's waist holds exactly the cloth the body needs, so every centimetre a dart takes out is one the waist seam no longer has: the fixture at 2× removed **16.59 cm from a 78.28 cm waist** against 3.76 cm of give. `dartedSkirt` now drafts the allowance in, and three seams 1.1–1.2 cm short became one at 0.3 | `dartAllowanceCm` / `dartedSkirt` in [`app/js/skirtdarts.js`](../app/js/skirtdarts.js) |
| §8 | **step 4b: the strain limit, and the best drape this project has produced.** `sc_set_strain_limit` applied last in the substep. Peak strain 34.5 % → **6.59 %**, the fabric's own 6.1 % ceiling; and the drape after it puts **0.01 %** of the cloth inside the body at **−0.002 cm** deepest, settling in 2.6 s — against 0.11 % and −0.188 for the `cloth.js`-sewn garment | `src/sewcloth/src/sewcloth.c`, `test/test_strain.c` |
| §8 | **step 2: sewcloth sews.** The constant-rate feed — one-sided, force-limited, saturating — with gaps, tensions and peaks out per stitch. A 10 cm seam closes in exactly two seconds at 5 cm/s, identically at 4 and 16 substeps; a 0.1 gf limit leaves 9.18 cm open with the tension at the limit, which is the measurement the whole algorithm exists to produce | `src/sewcloth/src/sewcloth.c`, `test/test_stitch.c` |
| §8 | **step 1 of the port is built: sewcloth bends.** `sc_set_hinges` and the dihedral XPBD constraint, taken from `cloth.js` line for line — 58 % of W's frame, and the piece the drape wants too. Flat cloth untouched to 1e-4 cm, a 90° fold driven flat from either side and never further open, and all four vertices of a hinge checked against a finite difference of the angle. `capabilities.bending` = 1 | `src/sewcloth/src/sewcloth.c`, `test/test_hinge.c`, `include/sewcloth.h` |

**The gate, which is the only reason any of that may be believed (rule 6).**
`node test/run.mjs` was run after the collision fix, after the side-car came
out of the page, and after the dart pairing changed shared code — and again against the
rebuilt wasm with bending in it: **278 checks, 0 failures** every time, with
every dart check passing. `src/sewcloth/build.sh` passes too: now six native
test binaries, including the new hinge test, and a smoke test that prints
`bending=1 stitches=0`. The drape is unchanged by the new code, as it should
be while nothing sets a hinge — `tools/wasmclip.mjs` still reports 0 % of the
cloth inside the body at 8.2 ms a frame. The
viewer was driven headlessly after each change (`tools/viewshot.py`): that is
how the darts were confirmed cut, the page confirmed to boot with the side-car
gone, and J confirmed to lay out 1,129 vertices and 4 darts where it had laid
out 1,064 and none.

**Three instruments were built before any of the fixes**, which is the only
part of this worth copying: `tools/wasmclip.mjs`, `tools/darts.mjs`, and
`--scenario sew` in `tools/profile.mjs`. Each was written because a question
could not be answered, and each then answered it in one run — the limbs, the
pairing, and where W's time goes.

**Open, in the order it should be taken.** Both are queued in
[19-todo.md](../todos/19-todo.md) with acceptance criteria, item 1 in six steps of
which the last two are *wire W to it* and *delete the JS sewing*. What they serve is one
sentence: **everything runs on `src/sewcloth` in the page, and `cloth.js` is
deleted.**

1. **The sewing in wasm, and then `cloth.js` goes.** Six steps,
   [19-todo.md](../todos/19-todo.md) item 1 for the detail of each:

   | | step | state |
   |---|---|---|
   | 1 | `sc_set_hinges` + the dihedral solve, 58 % of W's frame | **done 2026-10-17**, held by `test_hinge.c`, `capabilities.bending` = 1 |
   | 2 | the stitch feed: one-sided, force-limited, per-stitch gaps, tensions and peaks out | **done 2026-10-17**, held by `test_stitch.c`, `capabilities.stitches` = 1 |
   | 3 | `sewWasm` + `WasmSewing`, living across frames, beside `drapeWasm` | **done 2026-10-17** |
   | 4 | `tools/trace.mjs --sew-wasm`, both sewings in one table | **done 2026-10-17** |
   | 4b | the strain limit: the fabric's measured ceiling, swept | **done 2026-10-17**, held by `test_strain.c`, `capabilities.strain_limit` = 1 |
   | 5 | **W sews in wasm**, and in nothing else: no backend switch, no silent fallback | **done 2026-10-17** |
   | 5b | the dart that would not close — **the pattern was 16.6 cm short, not the solver** | **done**: `dartedSkirt` drafts the dart allowance in |
   | 5c | W stops when the seams stop getting closer, and leaves them open where they are | **done**: `WasmSewing.stalled()` |
   | 6 | delete the JS sewing, move `BodyCollider` and `FABRICS` out, **delete `cloth.js`** | |

   Step 5 has to come last because nothing before it changes what the viewer
   does, and it is not `drapeWasm` again: X is one solve, W is interactive, so
   the wasm cloth lives across frames rather than being created and disposed
   per solve. **Then** `BodyCollider` and
   `FABRICS` move out of `cloth.js` — a collider and a table, not solver code,
   and `clearance.js`, the viewer, every tool and the gate depend on them —
   and the file is deleted. In that order, because sewcloth has springs, an
   implicit solve, SDF contact and vertex self-collision and **no bending and
   no stitches at all**: today `cloth.js` is the only thing here that can sew.
   §8, and [16-solvers.md](16-solvers.md) §3b for the inventory. The toolchain
   is present — emcc 3.1.6, gcc, `src/sewcloth/build.sh`.
2. **The wasm drape stretches — RE-MEASURE, the old numbers are void.** They
   were taken while gravity pulled the cloth along the body's back (§7b), so
   the hem length and fold count below describe a garment being dragged
   sideways, not a fabric. Kept here only so the next session knows not to
   trust them. Measured against the oracle, not against `cloth.js`: 169.68 cm of hem where the pattern was cut at 160 cm and
   Blender settles at 160.07, and 2 deep folds where it throws 4. Contact is
   now the oracle's; this is the fabric parameters, and nothing yet maps
   `FABRICS`' bending lengths and measured strain limits onto sewcloth's mass,
   tension and damping. §7. **It may share item 1's cause:** `cloth.js` clamps
   strain to the fabric's measured limit — a 6.1 % woven floor — every
   substep, sewcloth has no such stage, and the hem is 6 % long.

**Open, found while the above was being built:**

- **W is not actually faster in the page.** The solver steps in 17 ms and the
  viewer takes **210–440 ms a frame**, so something in the frame around it
  costs twenty times the physics. Caching the HUD's measurements was the first
  guess and it did not help, which is the measurement saying *stop guessing*: a
  part-by-part profile of the frame (`step`, `mirrorOnto`, `updateClothMesh`,
  `updateStitchLines`, `updateHUD`) is the next thing, not another hypothesis.
  The candidates are all mine — `mirrorOnto` does three per-stitch readbacks
  every frame and the stall check a fourth, for numbers nobody reads until the
  pass ends.
- **`sim/blender_show.py` opens a scene with no camera and no light**, because
  it clears to an empty factory scene. The viewport works; Blender says so
  anyway, and a scene you cannot render is a scene half-opened.
- **The welded garment reports 50 % grain strain** just before X, where the
  sewing phase reported 7.6 %. It is a maximum over edges, which this project
  has a rule about (rule 2), so the first thing is the distribution.
- **The fabric mapping has to be re-measured from scratch.** Everything
  compared against the oracle before §7b was comparing two garments being
  dragged sideways.
- **X's stepping is still not verified headlessly, and it has now been wrong
  twice.** First the function that drapes was deleted outright; then the
  branch that steps it sat behind a guard that was false by construction.
  Both were found by a person pressing the key, not by anything in this
  repository — and both would have been caught by one scripted J → W → X that
  watches the frame counter advance. The run is slow enough that it was still
  going when this was written, which is not the same as passing. **Until it
  exists, X is believed and not shown**, and that is the honest state of the
  most-used key in the viewer.

**Not done, and not forgotten:**

- **§2's symptom 3 — W is too slow — is measured, not fixed.** 126 ms/frame on
  the plain skirt, 7.9 fps against a 16.7 ms budget. It is open item 1, and it
  is the last symptom from §2 still standing.
- **A seam that still will not close.** The darted skirt sews to a 0.324 cm
  worst gap against a 0.25 cm weld tolerance, so X reports that seam and
  leaves it open rather than welding it. That is the intended behaviour and
  the honest answer about the pattern, not a bug — but it is a number someone
  should decide about, either by easing the fixture or by accepting it.
- **§4, the last state known to be good**, was never filled in. Nothing since
  has needed it: every symptom reproduced in the current checkout and was
  attributable without a bisect. It stays open rather than being quietly
  deleted, for the first symptom that does *not* reproduce headlessly.
- **Nothing here is committed, in either repository.** In this one: three new
  files (`app/js/skirtdarts.js`, `tools/darts.mjs`, `tools/wasmclip.mjs`) and
  thirteen changed — `app/js/main.js`, `sdf.js`, `drapewasm.js`,
  `patternedit.js`, both of `app/wasm/sewcloth.{mjs,wasm}` (rebuilt with
  bending in them), `tools/trace.mjs`, `tools/profile.mjs`, `CLAUDE.md`, and
  the documents [00](00-backtotrack.md), [16](16-solvers.md),
  [19](../todos/19-todo.md), [20](20-fork.md). **And in `src/sewcloth`, which is its own
  git repository and is excluded from this one by `.gitignore`:** one new file
  (`test/test_hinge.c`) and four changed (`include/sewcloth.h`,
  `src/sewcloth.c`, `test/smoke.mjs`, `build.sh`). A session that commits here
  and stops has committed half of it — the hinge solver and the binary that
  carries it are on opposite sides of that boundary.

## 11. What this document is not

Not a second queue. [19-todo.md](../todos/19-todo.md) remains the queue for validation
work and is suspended, not replaced, while this is open. Not a place for
findings about cloth. When §2 and §10's open list are empty and §6.6 is done, this file is deleted
and the one durable thing it produced is the rule in
[CLAUDE.md](../CLAUDE.md).
