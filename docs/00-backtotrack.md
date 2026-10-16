# 00 — Back on track

This document exists because the project was moving and then stopped. The
work before the stall is recorded in [18-validation.md](18-validation.md) and
its queue in [19-todo.md](19-todo.md); neither of them records the stall, because
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

*Open:* which state. The viewer, the headless path, the side-car, the gate, or
the repository as a whole — these fail in different ways and the word
"unusable" fits all of them. To be filled in from the user's own description
before anything is measured.

## 2. What "unusable" means, concretely

To be filled in. One line per symptom, each with where it is seen and what is
seen instead of the expected thing. No causes in this section.

| # | Symptom | Where seen | Expected | Observed |
|---|---------|------------|----------|----------|
|   |         |            |          |          |

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
order as the real drape, which [18-validation.md](18-validation.md) §6.10
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
([19-todo.md](19-todo.md)) whose only remaining item is too large to finish in
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
   [18-validation.md](18-validation.md) against what it settles; anything that
   must not happen again becomes a rule in [CLAUDE.md](../CLAUDE.md) with its
   cost next to it, and this document is then closed.

## 7. What this document is not

Not a second queue. [19-todo.md](19-todo.md) remains the queue for validation
work and is suspended, not replaced, while this is open. Not a place for
findings about cloth. When §2 is empty and §6.6 is done, this file is deleted
and the one durable thing it produced is the rule in
[CLAUDE.md](../CLAUDE.md).
