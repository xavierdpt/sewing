# 15 — Sewing by Hand: Selection, Seam Tension, and the Transform Buttons

`app/js/assemble.js`, `app/js/cloth.js`, `app/js/main.js`; **J** then **W** in
the viewer. A proposal, not yet built. Written against commit `6d023d1`.

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

## 3 — Tension instead of forcing: a force-limited seam

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

## 4 — Selection, and sewing progressively

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

## 5 — The transform buttons

The refinement that makes this tractable: **store a rigid placement per piece and
rebuild its vertices from the pattern**, rather than accumulating onto
`asm.verts`.

```js
piece.placement = {
  station,   // angle around the body axis, rad
  y,         // height, cm
  radius,    // distance from the axis, cm
  spin,      // in the piece's own tangent plane   (laid on upside down)
  tilt,      // about the local horizontal          (lean the top in or out)
  roll,      // about the local radial              (swing it sideways)
  flip,      // mirrored: the piece face down
  wrap,      // rolled onto the cylinder, or flat on the tangent plane
}
```

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
| in / out | `radius` |
| spin ± | rotation in the piece's own plane |
| tilt ± | lean the top in or out |
| roll ± | swing it sideways |
| flip | mirror, face down |
| mirror across the body | `station → −station`, `spin → −spin` |
| distribute evenly | equal stations around the body — the one-click fix for the common mess |
| face the body | re-point the piece's normal at the axis |
| reset piece / reset all | back to the placement hints |

### The multi-select question

With several pieces selected, two of the transforms are genuinely ambiguous, and
the answer differs by transform:

- `station`, `y`, `radius` — move each piece about the **body** axis. This
  preserves the relative arrangement, which is what you want.
- `spin`, `tilt`, `roll` — two honest readings: each piece about **its own**
  centre, or the selection as **one rigid body** about its common centroid.

Ship both, and default to **group-rigid**: moving the arrangement as a unit is
the entire point of select-all.

---

## 6 — Where the code goes

| file | change |
|---|---|
| `app/js/cloth.js` | compliant force-limited stitches; per-stitch `lambda`, `gap`, `tension`, `active`; `stitchReport()` |
| `app/js/assemble.js` | `layOut` returns placements; new `place(pattern, placements, surface)`; seam and panel tags on stitches; partial-weld path; drop the squeeze |
| **new** `app/js/arrange.js` | the placement model, the transform operators, the selection set, distribute / mirror / reset. **three.js-free**, so `test/run.mjs` can assert on it — the project's standing rule |
| `app/js/main.js` | selection picking; the button panel; `clothColour: 'selection'` and `'tension'`; the per-seam HUD table; and the one-line fix so `startAssembly` takes whatever pattern is in hand |
| `test/run.mjs` | the three assertions below |
| `docs/13-assembly.md` | cross-reference the force-limited seam and the placement model |

### The three assertions worth having

1. **Every transform is an isometry.** Panel edge lengths unchanged to 1e-9
   after any sequence of button presses. This is the claim the whole arrangement
   phase rests on (`assemble.js:40`, and §1 of docs/13-assembly.md measures it at
   2×10⁻¹³ %), and it is the thing a stored placement protects and an accumulated
   mutation does not.
2. **An impossible seam stays open.** A seam that is geometrically too short
   reports tension and gap rather than taking the cloth past `maxStrain`.
3. **A partial weld is clean.** Welding a subset leaves the un-welded seams'
   constraints intact and addressable.

---

## 7 — Build order

The risk is concentrated in one number, so take it first.

1. **The compliant, force-limited stitch** and the `alphaStitch` / `alphaStretch`
   sweep. Everything else is scaffolding; this is the part that can be wrong.
2. **Gap-triggered welding** and `stitchReport()` — the payoff from step 1, and
   independently useful even with the sewing still all-at-once.
3. **The placement model** in `arrange.js`, with the isometry test, and the
   existing mouse gestures rewritten on top of it.
4. **Selection, the buttons, and progressive sewing**, which by then is mostly
   wiring.
