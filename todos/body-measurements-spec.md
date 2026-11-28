# The body answers its measurements — SPEC

Paired with [body-measurements-todo.md](body-measurements-todo.md), which is
its queue (rule 11). This document holds the requirement and the resolved
questions; the todo holds the work they imply.

## 0. The premise

**From the user, 2026-11-28:** *"The measurements (cm) seems strange, so do
some sampling, I suggest taking the initial settings, then for each
measurement, setting 1/4 and 3/4 of the proposed ranges (height, bust, under
bust, etc...) and doing screenshots"*, assembled into plates; and then *"I'm
not sure which kind of methodology we can follow to improve the generator on
that."*

So this pair is about the **body generator as a function**: the measurement
form offers 21 numbers with ranges, and the question is whether the body that
comes out answers them, only them, and the same way every time. The
methodology itself is written down in the knowledge tree, under *Software,
instruments and validation* → *Sweeping the body generator, and how the field
does it*.

## 1. The instruments

Both are new, both live in `tools/` (rule 3), and both drive the real page
(rule 9) rather than reading the source and reasoning about it.

| tool | what it does |
|---|---|
| `tools/body_sweep.py` | drives the page in headless Chrome, sets one row of the measurement form at a fraction of its range through the real control (set the input, fire `input`, fire `blur` — the tree's *Body controls update on release*), shoots a PNG, and writes an `index.json` holding what the HUD then read |
| `tools/plate.py` | crops, scales and captions those shots into contact plates, so a sweep can be looked at instead of opened one file at a time |

Two properties of the sweep matter and are not incidental:

- **The ranges are not restated in the tool.** They are parsed out of the
  `MEASUREMENTS` and `SHAPE_PAIRS` tables in `app/js/main.js` (2529 and 2556),
  so a range that moves there moves here and the sweep cannot drift from the
  form it is sweeping.
- **Every setting is measured against a freshly booted page**, and the last
  shot re-takes the baseline. §2 is why.

## 2. The generator is not a function of its measurements

The first sweep chained its settings — set a value, shoot, set the value back,
go on — and that turned out to measure something other than what its captions
said. **Putting the measurement back does not put the body back.** Measured
2026-11-28, `tools/body_sweep.py --only bust --chain`, the same 21 numbers in
the form at both ends:

| | at boot | after `bust` 139 → back to 92 |
|---|---|---|
| bust / underbust | 92.0 / 76.0 cm | 92.0 / 76.0 cm |
| waist / low hip | 72.0 / 98.0 cm | 72.0 / 98.0 cm |
| **bust apex height** | **22.1 cm above waist** | **4.9 cm above waist** |
| **surface area** | **0.635 m²** | **0.610 m²** |

It is not a one-off. In the chained 43-shot sweep, every body built after
`bust = 139` read `bust apex height 4.0 cm` and `surface area 0.581 m²` —
including the shots of `crotchDepth`, `kneeGirth`, `hipWidth` and
`waistThickness`, which cannot touch the chest. On the plates the torso splits
into a detached slab above a separate lower body in 38 of the 42 cells; the
only intact bodies are the four shot **before** the bust extreme.

**Candidate cause, not yet verified:** `build()` solves its arc-length
measurements by bisection (`app/js/body.js:438`) against bounds computed from
`this.heights.*`, which the *previous* build left behind — `neckFloor()` at
`app/js/body.js:463` reads `this.heights.bust`. That is a guess at a
mechanism, and rule 1 says it stays a guess until an instrument says so; the
todo's item 3 is that measurement.

## 3. The failures this separates into

The point of separating them is that they have different fixes and different
owners, and a single "the measurements are strange" hides all four.

1. **History dependence (§2).** The same input gives different bodies
   depending on what was built before. Nothing downstream can be trusted while
   this holds, including every other finding in this list, because any
   measurement of the generator is a measurement of its history too.
2. **Feasibility: the form offers a box, and the feasible set is not one.**
   Each row in `MEASUREMENTS` carries an independent min and max, so the form
   permits `bust = 139` with `underBust = 76`, or a `backLength` of 65 cm on a
   120 cm body. Nothing in the form knows that measurements constrain each
   other.

   **The reference for both the ranges and the relations was already in this
   file's own neighbourhood and was not used.** `SIZE_CHART`
   (`app/js/body.js:147`) is eleven graded sizes over ten of these very
   measurements, and its own comment states a grading rule — girths 4-6 cm
   per size, lengths about half a centimetre. Against it the form's ranges are
   invented round numbers, and its relations are not represented at all:

   | | the chart | the form allows |
   |---|---|---|
   | `bust` | 80 – 128 | 45 – 170 |
   | `backLength` | 39.2 – 45.2 | 25 – 65 |
   | `lowHip` | 86 – 134 | 30 – 200 |
   | `bust − underBust` | **16 in every row** | −115 … +125 |
   | `lowHip − bust` | **6 in every row** | unconstrained |
   | `bust − waist` | 18 – 20 | unconstrained |

   Every degenerate body on the plates violates a relation the chart holds
   constant. `bust = 139` with `underBust = 76` is a difference of 63 where
   the chart never leaves 16.
3. **Fidelity, which the generator already checks and nobody is told about.**
   `build()` records every measurement its bisection could not reach into
   `this.unmet` (`app/js/body.js:450`, tolerance 0.15 cm) and composes
   `this.warning` — *"these measurements do not fit together: bust off by
   N cm (asked …, model …)"* — at `app/js/body.js:530`. **`grep -rn
   "\.warning" app/js` returns that assignment and nothing else: no reader.**
   The body silently fails to be the body that was asked for, and the HUD
   reports the number that was typed rather than the number the model
   achieved.
4. **`height` barely does anything.** From the two uncontaminated shots of the
   first sweep, 144 cm and 191 cm of total stature give 0.639 m² and 0.631 m²
   of surface — the shorter body has slightly *more* — and look nearly alike
   at a fixed camera. Whether that is right is §4's first question.

## 4. The resolved questions

**Answered by the user, 2026-11-28.** Each answer is recorded with the
reasoning that was put to them, so a later reader sees what was chosen over
what.

1. **Is the history dependence a bug, or a warm start to be made explicit?**
   Carrying the previous solve as the starting point is a legitimate technique
   when it changes only the speed and not the answer. Here it changes the
   answer, so either the solve is reset per build, or it is deliberately
   continuous and the form must say so.
   ***Resolved: reset, and iterate to a tolerance.*** The girth scales are
   cleared at the start of every build and the calibration runs until the
   worst girth residual is within `CALIBRATION_TOL`, capped at
   `CALIBRATION_ROUNDS`, instead of a fixed three rounds — three was enough
   from a warm start near the answer and is not enough from a cold one. Done:
   `todos/body-measurements-todo.md` item 7.
2. **What should an infeasible combination do** — refuse, clamp the field,
   couple the fields (raising `bust` lifts `underBust` with it), or build the
   degenerate body and label it?
   **Recommended, rather than left open:** take both the ranges and the
   relations from `SIZE_CHART`, which is in the repository and graded —
   per-field bounds as the chart's span widened by a stated margin, and the
   constant differences above as couplings with a named tolerance, so a bust
   that moves carries the underbust with it unless the person overrides it.
   A learned shape space (the scan-database lineage in the knowledge tree's
   *Sweeping the body generator, and how the field does it*) is the stronger
   answer and is out of proportion here; the chart gets most of it for the
   price of reading a table this project already ships.
   ***Resolved: soft couplings, and a warning when one is broken.*** Moving
   `bust` carries `underBust` with it by the chart's relation; the person can
   then override the partner, and a relation left broken shows the
   generator's warning rather than blocking the edit. A hard clamp was
   rejected because the project's premise is that standard sizes do not fit,
   and a chart of eleven graded sizes is not the boundary of real bodies.
   Item 11.
3. **Should `torso.warning` be shown**, and should the HUD report the achieved
   measurement next to the asked one when they differ?
   ***Resolved: yes, both.*** Item 8.
4. **Is `height` supposed to move the torso**, or is it stature over a torso
   that is fully determined by `backLength`, `crotchDepth` and `waistToKnee`?
   *Still open.* It was not among the four put to the user, and the sweep's
   answer — 144 cm and 191 cm of stature give 0.639 m² and 0.631 m² of
   surface, 8181 and 9635 pixels of change against the baseline — is a
   measurement, not a verdict.

5. **The breadth and depth pairs take effect only when both halves of a pair
   are non-zero** (`ratioOf`, `app/js/body.js:359`), so moving one alone does
   nothing: measured at 3 changed pixels in three independent sweeps.
   ***Resolved: one value is enough.*** A width set alone applies against the
   default proportion for the depth, so a control that was moved always does
   something. Item 9.

6. **Where do the new checks live?** ***Resolved: in `test/run.mjs`***, as part
   of the gate, not only as instruments in `tools/`. Item 10.

## 5. Acceptance

1. A measurement set in, a measurement set out: building the same numbers
   twice, in any order and after any other body, gives the same `measure()` to
   within the solver's own tolerance.
2. The sweep runs over all 21 rows with the baseline re-shot last, and the
   baseline comes back identical.
3. Every `unmet` measurement reaches the person who typed it.
4. `node test/run.mjs` passes, 306/0, before any of it is committed (rule 6).
