# 15 — Sewing by Hand: Selection, Seam Tension, and the Transform Buttons

`app/js/arrange.js`, `app/js/assemble.js`, `app/js/cloth.js`, `app/js/main.js`;
**J**, then **W**, then **X** in the viewer. Built; this document was written
first, as a proposal, and §§3–6 have been updated to describe what is there.

Today the pieces are laid out around the body and then sewn, all of them, in
one go, by a timer. Three things that a fitting actually requires are missing,
and all three are missing for the same underlying reason:

1. **Sew *these* pieces, not all of them** — a garment is assembled in an order,
   and you look at it between steps.
2. **When a seam will not close, say so** — if the cloth has to be dragged
   tighter than it can go, the seam should **show tension and stay open**, not
   be forced shut and the evidence averaged away.
3. **Move the selection with buttons** — numerically, repeatably, reversibly,
   and on several pieces at once.

The underlying reason is that the stitch has no *force* and the arrangement has
no *transform*. Both are quantities the system currently never computes, and
once it does, all three features are small.

---

## 1 — What the code does now

`startAssembly()` (`main.js:484`) calls `layOut()` (`assemble.js:69`), which
places **every** panel at once, rolled onto a cylinder of radius
`rMax + standoffCm`, each at a station taken from its own `uv` placement hint.
Phase `'arranging'`, `playing = false`.

Mouse drag (`main.js:1558`–`1639`) moves **one** piece, picked by raycast
through `clothMesh` → `faceIndex` → tile → `panelOf`. Three gestures: plain drag
orbits about the body axis and lifts, shift spins about the piece's centroid,
alt pushes radially.

`sewItUp()` (**W**) sets phase `'stitching'`, and the render loop
(`main.js:1694`) ramps `sim.stitchStrength` from 0.05 to 1 over
`params.stitchSeconds` — then, at `frac >= 1`, calls `finishAssembly()`
unconditionally, which welds everything and switches gravity on.

The stitch itself (`cloth.js:768`):

```js
_solveStitches() {
  const k = Math.min(1, this.stitchStrength);
  for (const s of this.stitches) {
    // ... project both ends to the midpoint, scaled by k
  }
}
```

A hard zero-length projection, run inside each of the eight stretch sweeps per
substep, under-relaxed only by the global ramp.

---

## 2 — Four things in the way

### 2.1 The stitch has no force, so it can only win

`stretch` and `bend` are proper XPBD: compliance `alpha/h²`, so stiffness is a
physical number rather than a per-iteration fudge (`cloth.js:565`,
`cloth.js:587`, and the reasoning at the head of the file). The stitch is not.
It has no compliance and no limit, so at `k = 1` it projects the entire residual
every sweep, against stretch constraints that are themselves nearly rigid. Which
of the two wins is settled by **sweep ordering**, not by physics.

And there is no per-stitch force anywhere in the file — nothing to report, and
nothing to draw.

### 2.2 The residual gap is actively hidden

Three places conspire:

- `assemble.js:259` runs 30 extra frames with **all velocities zeroed**,
  explicitly "to take up the slack the seams have left".
- `maxStitchGap()` (`cloth.js:783`) returns a single scalar — a maximum. No
  per-stitch value, no per-seam breakdown.
- The weld is **time-triggered, not gap-triggered**. A seam still 4 cm short at
  `t = stitchSeconds` is welded shut anyway, and `weldStitched`'s union-find
  (`assemble.js:181`) averages the two sides together.

So the one number that matters to a fitting — *this seam could not be closed,
and by how much* — is destroyed at exactly the moment it becomes available.

### 2.3 Sewing is all-or-nothing

`stitchStrength` is one scalar on the `Cloth` instance, and stitches are a flat
array carrying only `{a, b, v3}` (`assemble.js:161`). Nothing in the data model
can address a subset.

### 2.4 Arranging mutates `asm.verts` in place

Each gesture happens to be a rigid motion, so rigidity holds by construction of
each individual gesture — which is what the comment at `main.js:1510` claims,
and it is true as far as it goes. But no transform is stored, so there is no
undo, no numeric readout, no reset, no mirroring, and no way to compose a
hundred button presses without float drift.

### 2.5 And one gap to fix first

`startAssembly` calls `currentSkirtPattern()` (`main.js:487`), which **discards**
any loaded pattern that is not `meta.test === 'flared-skirt'` and drafts a skirt
instead; `finishAssembly` then stamps `meta.skirt = true`. Arranging a **bodice**
pattern by hand is therefore not wired up at all, even though `currentPattern()`
(`main.js:937`) drafts one. A one-line fix, but everything below depends on it.

---

## 3 — Sewing is a rate, not an event

The first thing building this got wrong, and it is worth stating before the
force limit because it is the part you actually watch.

A force-limited stitch pulling towards zero is, for a seam with nothing
resisting it, **a constant force over the whole 20–40 cm of travel**. So the
pieces accelerate the entire way and arrive at speed. That is a catapult, not a
seam: the gesture it models is letting go of two pieces and having them snap
together, when what is wanted is a seam being closed *at a rate*.

So each stitch carries a `rest` length instead. It starts at the gap the seam
was armed with and is **fed down at `sewSpeedCmPerSec`**, so the cloth is drawn
together at a constant speed and never accelerates: the target moves at `v`,
the cloth follows at `v`, and there is no transient to work out afterwards.
Measured on a 19.9 cm seam at 4 cm/s — **4.09 cm/s at the start, 4.04 cm/s at
the end**, peak 4.74 — and the duration is the gap divided by the rate to
within 0.03 s at 2, 4 and 10 cm/s.

The force limit still does its job, because the moment the cloth cannot keep up
with the feed the constraint is violated and the tension rises. Nothing in §4
changes; the feed decides *how fast*, the limit decides *how hard*.

### Three things this needed that were not obvious

**The rate limiter has to work in both directions.** The first version clamped
`rest` to `gap + slack` to stop a jammed seam accumulating closure it could
never deliver. But that *lowers* `rest` whenever the gap is already small, so
the feed could leap ahead of itself and shut a seam at 19 cm/s on a 4 cm/s
command — the very lurch it was supposed to remove. It now holds the feed when
the cloth has fallen more than `sewSlackCm` behind, and never advances by more
than one step.

**Damping has to come after the substeps.** Sewing is meant to be
quasi-static — that is the whole argument for closing seams with gravity off
(assemble.js). But XPBD derives velocity from the positions it just projected,
so damping the stored velocity on the way *in* is immediately overwritten and
achieves nothing: vertices still reached **26 cm/s** on a 4 cm/s feed. Damping
what comes *out* drops that to **6.6 cm/s**, which is about 1.5× the feed and
is simply a panel rotating about its far edge.

**Stopping has to tie off and halt the cloth.** A seam stopped at 9.8 cm
drifted on to 1.6 cm over the next three seconds, for two reasons. The thread
was holding at the gap last *commanded* rather than the gap actually
*achieved*, which left the seam free to spring back; and the cloth was still
travelling at the feed rate with nothing to stop it. Putting the needle down
means the cloth stops too.

There is a residual effect here worth knowing about, because it is real rather
than a bug: a partly sewn assembly is **not in equilibrium**. The cloth is held
strained by the feed, and if the simulation keeps running after the feed stops,
that stored energy relaxes and closes the seam further on its own — at zero
thread tension. The viewer freezes the simulation when you stop, so what you
see is where the sewing got to; the relaxation happens on the next press of W,
where the sewing damping absorbs it.

---

## 4 — Tension instead of forcing: a force-limited seam

Replace the midpoint projection with a compliant XPBD distance constraint, the
same shape as `stretch` and `bend`:

```js
const aT = this.alphaStitch / h2;
const dl = -(L - 0) / (wsum + aT);
s.lambda += dl;                 // the accumulated multiplier IS the force
```

Three properties follow, and they are the three the job needs.

**A force in real units.** Masses are already real grams, from areal density
(`cloth.js:400`), so `lambda` converts to gram-force. That makes seam tension a
*measured* quantity, in the same sense as everything else in this project.

**Saturation.** Each stitch gets a `maxTensionGf` — a thread and seam strength.
Past that the constraint stops pulling harder. This is the whole mechanism: an
impossible seam **stays open and reports how far short it was**, instead of
either stretching the cloth past `maxStrain` or dragging the figure through the
fabric.

**The stiffness ordering is the experiment.** `alphaStitch` must be *softer*
than `alphaStretch`, or the stitch still wins and the fabric stretches to meet
it. It is one number and it decides the entire behaviour — so it gets a sweep in
`tools/`, the way `ease_sweep.mjs` and `drop_disc.mjs sweep` do.

Then make it visible:

| | |
|---|---|
| **tension on the ribbons** | the stitch lines already exist and are already coloured per stitch (`main.js:685`). Swap the seam-id palette for `STRETCH_RAMP` (`main.js:582`) behind a toggle: a seam that cannot close glows red and stays visibly open. |
| **the weld becomes conditional** | `finishAssembly` welds only stitches with `gap < weldTolCm`; the rest stay live. `weldStitched` already takes `stitches` as a parameter and union-finds only over what it is given, so partial welds work as written. |
| **drop the squeeze** | delete, or gate, the velocity-zeroing pass at `assemble.js:259`. It exists to hide the residual. |
| **puckering comes free** | tension at the stitch plus *negative* strain in the cloth is what a real fitting shows, and `field().slack` (`cloth.js:988`) already computes the second half. |

### `stitchReport()`

One row per seam: length, per cent closed, max gap, mean and peak tension,
verdict. That is the fitting diagnosis —

> `S03` is 4 cm short: ease it, or take the difference out as a dart

— and it hands straight to the cutting table, where `patternedit.js` already
implements both dart and spread (docs/14-editing.md).

---

## 5 — Selection, and sewing progressively

Tag each stitch with its **seam id** and **panel pair** at `layOut` time.
`main.js:692` already derives `seamOfV3` from `pattern.runs`; move that into
`assemble.js` and attach it to the stitch. Replace the scalar with a per-stitch
`active` flag, which an optional global ramp then backs.

`assembling` gains `selected: Set<pieceIndex>`, and the rule is:

> **a stitch is active iff both of its panels are selected.**

That gives garment-making order for free — sew the two centre-front panels, look
at it, add the sides, add the waistband — each pass with its own ramp and its own
gap and tension report.

Selection actions: **all**, none, invert, click to toggle, click a stitch ribbon
to take both its panels, and **select-adjacent** (every piece sharing a seam with
the current selection). The last one turns progressive assembly into a single
repeated keystroke.

### Baste, do not weld, until the end

Welding mid-session means rebuilding the `Assembly` and the `Cloth`, reindexing
vertices and re-binding the drag code, N times over. It is doable — factor
`finishAssembly`'s rebuild into `reweld(subset)`, and turn `panelOf` into a
union-find-backed `pieceOf` so a welded cluster drags as one rigid piece.

But the better answer is to **baste**: keep closed seams as live compliant
constraints throughout arranging, and weld everything once on the way to drape.
The reason is already written down at `assemble.js:170` — an unwelded seam is a
**hinge**, because the bending constraint across it never existed, the two
triangles having never been neighbours. Basting confines that hinge to the phase
where drape is not yet being looked at, and keeps the rebuild to one.

---

## 6 — The transform buttons

The refinement that makes this tractable: **store a rigid placement per piece and
rebuild its vertices from the pattern**, rather than accumulating onto
`asm.verts`.

```js
piece.placement = {
  station,     // angle around the body axis, rad
  y,           // height of the piece's top edge, cm
  radius,      // where the piece SITS: distance from the axis, cm
  wrapRadius,  // the cylinder it was ROLLED ONTO, cm -- its curvature
  spin,        // in the piece's own surface        (laid on upside down)
  tilt,        // about the local horizontal        (lean the top in or out)
  swing,       // about the local vertical          (turn it like a door)
  flip,        // mirrored: the piece face down
  wrap,        // rolled onto the cylinder, or flat on the tangent plane
}
```

**Why `radius` and `wrapRadius` are two fields.** Collapsing them was a bug, and
the pre-existing arranging test caught it. Pushing a piece out should carry it
bodily outwards and keep the shape it was cut — a translation. Re-rolling it onto
a *wider* cylinder instead flattens it, and a flatter piece of the same cloth
spans a smaller angle: push two neighbouring pieces out by different amounts and
their shared seam no longer lines up. Measured, four-panel skirt with the pieces
shoved in and out a few cm each: re-rolling took the sewn hem from 235 cm to
**79 cm**, the garment wringing itself out. Translating leaves it at 235 cm.
`reroll()` is there for when changing the curvature *is* what is wanted.

**One correction from building it.** The proposal listed a third rotation,
`roll`, about the piece's local *radial* direction. There is no such thing: a
piece facing outwards lies in the plane spanned by its local horizontal and
vertical, so turning it about the outward normal is a rotation *within its own
surface* — which is what `spin` already is. The only difference would be when
it happens, and doing it after wrapping peels the piece off the cylinder for no
gain. The three independent rotations are the in-surface one (`spin`) and the
two that tip the piece out of its plane (`tilt` about the horizontal, `swing`
about the vertical), so that is what is implemented.

Why this beats mutation:

1. **Exact rigidity.** The piece is the pattern, placed — not the pattern plus a
   hundred composed float rotations.
2. **Undo, reset, numeric readout, copy-placement, and mirror-to-the-other-side
   all become trivial** rather than each being its own problem.
3. `layOut`'s hint becomes merely the *initial* placement, so "reset the
   arrangement" costs nothing.

### The subtlety: rolled, not flat

`layOut` **rolls** pieces onto the cylinder rather than laying them on tangent
planes — a bending and not a stretching, strain-free to `edge²/24R²`
(`assemble.js:40`) — and it has to, because a full circle skirt's 106 cm panels
stick straight through their neighbours as flat planes. So the order of
operations matters:

- **spin** is applied **in pattern space, before rolling**, so the piece keeps
  conforming to the cylinder.
- **tilt** and **roll** are rigid 3D rotations **after rolling**, about the
  piece centroid. These lift the piece off the cylinder — which is exactly what
  tilt is *for*: leaning a bodice front out over a bust.

### The buttons

Each acts on the whole selection, with a step size, shift for ×5 and alt for ÷5.

| button | what it changes |
|---|---|
| around the body ± | `station` |
| up / down | `y` |
| out / in | `radius` — a rigid translation; the curvature is left alone |
| spin ± | rotation in the piece's own surface |
| tilt ± | lean the top in or out |
| swing ± | turn it like a door on its hinge |
| flip | mirror, face down |
| mirror across the body | `station → −station`, `spin → −spin` |
| distribute evenly | equal stations around the body — the one-click fix for the common mess |
| face the body | re-point the piece's normal at the axis |
| re-roll to hug the body here | `wrapRadius := radius` — the one action that changes a piece's curvature |
| reset piece / reset all | back to the placement hints |

### The multi-select question

With several pieces selected, two of the transforms are genuinely ambiguous, and
the answer differs by transform:

- `station`, `y`, `radius` — move each piece about the **body** axis. This
  preserves the relative arrangement, which is what you want.
- `spin`, `tilt`, `swing` — two honest readings: each piece about **its own**
  centre, or the selection as **one rigid body** about its common centroid.

**What was built, and why only one of them.** `station`, `y` and `radius` move
every selected piece by the same amount, and for `station` that *is* a rotation
of the whole selection about the body's axis, so the group case is exact and
free. The rotations act on each piece about its own centre.

Group-rigid rotation about a shared centroid is deliberately **not** offered.
It cannot be written back into per-piece placements exactly — a rigid rotation
of a group couples each piece's position and its orientation — so supporting it
would mean storing a second, accumulated rotation alongside the named
parameters, which is exactly the drift this module exists to remove. Shipping
an approximation of the one property the module guarantees would be a poor
trade for a transform with no clear fitting use.

---

## 7 — Where the code goes

| file | change |
|---|---|
| `app/js/cloth.js` | compliant force-limited stitches; per-stitch `lambda`, `gap`, `tension`, `active`; `stitchReport()` |
| `app/js/assemble.js` | `layOut` returns placements; new `place(pattern, placements, surface)`; seam and panel tags on stitches; partial-weld path; drop the squeeze |
| **new** `app/js/arrange.js` | the placement model, the transform operators, the selection set, distribute / mirror / reset. **three.js-free**, so `test/run.mjs` can assert on it — the project's standing rule |
| `app/js/main.js` | selection picking; the button panel; `clothColour: 'selection'` and `'tension'`; the per-seam HUD table; and the one-line fix so `startAssembly` takes whatever pattern is in hand |
| `test/run.mjs` | the three assertions below |
| `docs/13-assembly.md` | cross-reference the force-limited seam and the placement model |

### The three assertions, and what they measured

All three are in `test/run.mjs`, in three new sections.

**1. Every transform is an isometry.** Split into four checks, because building
it showed the claim is not uniform:

| | |
|---|---|
| a flat placement | exactly isometric, **1.6×10⁻¹⁵** |
| rolled onto the body | **0.236 %**, the chord-versus-arc error `edge²/24R²` and nothing else |
| 1500 presses of `station`, `y`, `radius`, `tilt`, `swing` | **1.3×10⁻¹² %** of drift — these are rigid motions of the already-wrapped piece, so they cannot change its measurements at all |
| 1200 presses out and back | every vertex within **0 cm** of where it started |

That last one is the real no-drift claim, and it is stronger than the one the
proposal asked for: a placement *is* its numbers, so the path taken to them
cannot matter. An accumulated mutation could not promise that.

**`spin` is the exception, and it is not drift.** Spin happens in pattern space
*before* the piece is wrapped, so it changes how the piece's edges lie against
the cylinder's curvature and therefore changes the wrap error: 0.236 % upright,
0.357 % at 45°. It is bounded by the mesh rather than by the number of presses,
and `wrap: false` removes it entirely whatever the spin. This is a real
property of rolling a flat sheet, not a defect — but it does mean "every
transform is an isometry" is true of the rigid four and true only up to the
mesh's wrap error of the fifth.

**2. An impossible seam stays open.** Twenty per cent taken out of one panel's
length, four-panel skirt, linen:

| seam | verdict | tension |
|---|---|---|
| S01 (pieces 0+1) | short by 0.6 cm (the cloth is at its limit) | 64 gf |
| S02 (pieces 0+3) | short by 0.5 cm (the cloth is at its limit) | 67 gf |
| S03 (pieces 1+2) | closed | 0 gf |
| S04 (pieces 2+3) | closed | 1 gf |

The two seams that touch the shortened piece are exactly the two that fail, the
cloth never passes **3.3 %** against linen's 3 % limit, and **59 %** of the
stitches weld. With a 4 gf thread instead of 250, the same two seams fail with
7 stitches saturated and the verdict changes to *the thread is at its limit* —
the two failure modes are distinguished, which matters because the remedies
differ.

**3. A partial weld is clean.** Sewing only pieces 0+1 arms **11 of 44**
stitches; their seam closes to 0.001 cm while the untouched seams are still
37.9 cm open; inactive stitches carry exactly zero tension; and the weld takes
11 and leaves 33 basted, dropping the vertex count by exactly the 11 welds.

### Two things building it turned up

**A sound seam needs almost no force.** The first version of assertion 3 gave a
sound pattern a 4 gf thread and expected it to fail. It did not, and should
not: a seam with nothing resisting it closes at under 1 gf. The force limit only
bites on a seam that actually has to pull, which is why the weak-thread case is
tested on the short pattern.

**"Forced" is a statement about the thread, not the garment.** The first verdict
logic called a seam *forced* whenever the cloth around it was near `maxStrain`,
and so condemned S03 — a sound seam that closed at 0 gf — because a short piece
two seams away had distorted the whole ring. Cloth near its limit is a fact
about the garment; a seam that closed at no tension forced nothing. The verdict
now requires the thread to be working.

**The sewing ramp has to be per-stitch.** `stitchStrength` was one scalar, so
ramping pass two would also ramp every seam pass one had closed. For an easy
seam that turns out not to matter — a *closed* seam needs almost no force, so
even 5 % of the limit holds it, and the A/B is identical to three decimal
places. It matters as soon as a seam needs real force to stay shut: with one
panel 12 % short, a previously-closed seam springs **3.12 cm** open during the
next pass under a global ramp, against **1.12 cm** with a per-stitch one. So
each stitch carries its own `strength`, seams already sewn hold at 1, and only
the pass being sewn now ramps.

**And one real bug, found by the test rather than by reading.** `Cloth` takes
its own copy of the stitch array, so `laid.stitches` and `sim.stitches` are
different objects and the live state — `active`, `tensionGf`, `saturated` —
lives only on the solver's. That also showed that `finishAssembly` was handing
`weldStitched` *every* stitch, which would weld a seam nobody had sewn purely
because its two pieces happened to be parked within the tolerance of each
other. It now passes only the stitches whose seam is in `assembling.sewn`, so
the sewing decides what is joined and the arrangement does not.

---

## 8 — Build order

The risk was concentrated in one number, so it went first.

1. **The compliant, force-limited stitch.** `alphaStitch = stitchSoftness ×
   alphaStretch` with `stitchSoftness` 60, and `maxTensionGf` 250. Both are on
   the GUI, because the balance between them is the whole behaviour.
2. **Gap-triggered welding** and `stitchReport()`.
3. **The placement model** in `arrange.js`, with the isometry tests, and the
   mouse gestures rewritten on top of it — the mouse and the buttons are now
   literally the same operation on the same numbers.
4. **Selection, the buttons, and progressive sewing.**

## 9 — Using it

**J** lays the pieces out, all selected. Then:

| | |
|---|---|
| click / shift-click / ctrl-click | select, add, remove |
| **A** / **N** / **G** | all, none, grow to whatever shares a seam |
| arrow keys | around the body, up and down (shift for the radius) |
| `[` `]` and `;` `'` | spin, tilt |
| **M** / **F** / **0** | mirror, flip, reset to the placement hints |
| drag / shift-drag / alt-drag | the same as the buttons, by hand |
| **W** | start sewing the seams between the selected pieces — **or stop where they have got to** |
| **X** | weld what closed, and drop |

**W is a toggle**, because sewing takes time at a known rate rather than being
an event. Press it and the seams begin closing at `sewSpeedCmPerSec` (the
`sewing speed, cm/s` slider); press it again and they stop exactly where they
are, threads still in and holding. So the loop is: select two pieces, sew,
stop when you have seen enough, look at the report, select the next. A seam
left half closed resumes from where it stopped rather than starting over.

Seams sewn on an earlier pass keep their threads and hold while the rest is
arranged around them — and if you *move* a piece that has already been sewn,
its threads are let out to where the cloth now is, so the next press of W draws
it back gently instead of snapping it.

The stitch ribbons are coloured by tension by default, so a seam being dragged
shut is visible as it happens, and the HUD shows how many cm are left to take
up and how far the cloth is lagging behind the feed.
