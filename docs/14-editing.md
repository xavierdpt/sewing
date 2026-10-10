# 14 — Editing the Pattern: Darts, Spreads, and the Cutting Table

`app/js/patternedit.js`, `app/js/table.js`; **T** in the viewer.

Generating a pattern is the easy half. The useful half is changing it — and the
two changes that most of pattern making is made of are the same operation with
opposite sign:

| | what you do | what it does |
|---|---|---|
| **take a wedge out** | cut a triangle of cloth away and sew the two cuts to each other | the piece loses area and gains **shape**: it can no longer lie flat |
| **let a wedge in** | cut the piece and insert a triangle of cloth between the two cuts | the piece gains area and loses shape: it **spreads** |

The first is a dart. The second is slash-and-spread. Move fullness from one to
the other and you have the manoeuvre most of drafting consists of.

---

## 1 — A dart is a hole in the cloth, not a fold in the model

Taking a wedge out **moves nothing**. The triangles inside the wedge are
deleted and the material either side is untouched — that is the whole reason a
dart works: nothing is stretched, cloth is simply missing, and the consequence
only appears when the gap is sewn shut.

Stated as geometry, which is the project's own language (docs/01-geometry.md):

> A flat piece has 360° of cloth around every interior point. Take a 20° wedge
> out and 340° are left, and **340° of cloth around a point cannot lie flat.**

Measured, on a 20° dart with 15.31 cm legs:

```
cloth around the dart apex: 340.00 deg
angle defect created:        20.00 deg      intake asked for: 20
cloth removed:               39.85 cm2      a wedge of 1/2 r^2 theta: 40.9
the two legs:                15.308 / 15.308 cm, 0.000 cm apart
```

The legs come out equal to the micron because both are straight rays from the
apex and the cut follows mesh edges — which is the condition for a dart that
closes cleanly, and the thing a sewer achieves by truing the legs with a ruler.

## 2 — A dart is a seam that happens to be inside a piece

The two legs are given **the same vertex ids**, which is exactly what a seam
between two pieces is. So `assemble.js` sews a dart with no knowledge that it is
a dart — there is no dart code in the solver, the stitching, or the weld.
Verified, on a four-panel skirt with one dart:

```
stitches by seam: { S01: 11, S02: 11, S03: 11, S04: 11, dart: 7 }
```

The dart falls out as "no named seam", because `annotateSeams` identifies seams
by the pair of **pieces** they join and a dart joins a piece to itself. That is
a labelling gap, not a sewing one; it gets its own colour in the viewer.

## 3 — Letting a wedge in has to move something

The inverse cannot be as cheap. To make room for the gusset, one side of the cut
has to move, and it moves by a **rigid rotation about the pivot** — so that half
of the piece is still exactly the shape it was cut, and the gap is filled with
new cloth. Measured: a 25° spread on a 50 cm cut adds 528 cm² against a
predicted ½r²θ of 545, and the piece grows by exactly what was let in
(1997.0 cm² against 1997.0).

Two bugs found while getting there, both of the kind that is silent until
something looks odd much later:

- **the angle wrap only handled negatives.** Deciding which side of the cut a
  triangle is on means wrapping an angle into [0, 2π); wrapping only the
  negative case leaves angles above 2π unwrapped, so nothing was ever
  classified as turning and the spread **silently did nothing at all** — it
  reported 0 cm² added and no error.
- **splitting an edge did not preserve winding.** Cutting a triangle in two in
  the wrong cyclic direction leaves the halves wound against the rest of the
  mesh. Nothing notices until something asks the pattern which way is up.

`check()` now reports both: degenerate triangles, triangles wound against the
rest, and seams whose two sides are no longer the same length. That last one is
the classic silent error of hand-editing a pattern — change one side of a seam
and not its partner — and it is one line of UI to make it loud.

## 4 — The cutting table

The 2D editor lives **inside the 3D scene**: a table beside the body with the
pieces lying flat on it at true scale, on a 10 cm grid.

```
        ╭───────╮
        │ body  │
        ╰───────╯
   ┌──────────────────────┐
   │  ▱   ▱   ▱   ▱       │  ← the table
   └──────────────────────┘
```

One scene rather than two panes, and not out of laziness: the pieces on the
table are the same objects that get arranged on the body, so there is one
renderer, one pick path and one set of coordinates. What a separate 2D pane
would buy is precision, and that is available without it — **look down at the
table** snaps the camera to an orthographic view straight down, which *is* a 2D
view, with true distances and no foreshortening.

The tools:

| | gesture |
|---|---|
| **dart** | drag from the apex outwards; the direction sets the bisector, the intake comes from the field |
| **spread** | the same, with the spread angle from its field |
| **undo** | **U** — the pattern is snapshotted before every operation, fifty deep |

Dragging snaps to the nearest pattern point within 2.5 cm, so an apex lands on
a real vertex rather than near one. An operation that cannot be done where it
was asked for — a wedge that reaches no edge, or contains no cloth — leaves the
pattern alone and says why, rather than half-editing it.

The flow is then: edit on the table → **J** lifts the pieces onto the body →
drag them where you want them → **W** sews → it falls. The table's pattern is
the one that gets lifted, so there is no import or round trip in between: what
you cut is what gets sewn.

## 5 — Keeping the work: save and load

Two things in this project are *work* rather than output: the **dress form**,
measured with a tape, and the **pattern as edited**, dart by dart. Everything
else — the shell, the drape, the SVG, the OBJ — is regenerated from them in
seconds. So those two are what the **files** menu saves and loads.

| | file | written by | read by |
|---|---|---|---|
| dress form | `*-bust-waist-hip.json`, `triangulated-bodice-form/1` | `formio.exportFormJSON` | `formio.importFormJSON` → `applyForm` |
| pattern | `*.json`, `triangulated-bodice-pattern/1` | `patternio.exportPatternJSON` | `patternio.importPatternJSON` |

**The form saves the measurement set and nothing derived.** `body.m` is the
small flat object every ring, landmark and vertex is computed from, so a form
saved today still loads after the body model changes — which a saved mesh
would not. A key that `DEFAULT_BODY` does not know is dropped on load and
reported, rather than carried silently into every later save.

**The pattern saves what the table edited.** The cutting table edits the
loaded pattern in place, so "save the pattern" writes the darted pieces, not
the draft they started as. Loading goes back *onto the table* — not onto the
body — because that is where you left off: open it, take another wedge out,
**J**, **W**. Loading a pattern straight onto the body is the separate,
older gesture (**I**), and it is a fit test rather than a resumption.

Files, not browser slots. A saved form is something to mail to the person it
describes, keep in a repo beside the pattern it was drafted for, or still have
after clearing the browser's data, and `localStorage` is none of those. What
*is* in `localStorage` is only where the dialogs were put (docs/17-interface.md).

Round-tripped in the gate: every measurement, the pose, the rebuilt body's
landmarks, and a 15° dart's area through save and load (`test/run.mjs`,
"saving and loading").

## 6 — Limits

- **Only two operations.** No grading, no truing a curve, no moving a single
  point, no adding a seam allowance to an edited edge. Point-level editing is
  the obvious next thing and is not built.
- **The dart apex must be a vertex of the mesh**, and the wedge must reach an
  edge of the piece. Both are checked and refused rather than approximated.
- **A spread's pivot must sit on the boundary** for the operation to be exactly
  isometric. From an interior apex the two sides of the cut are still joined
  through the material beyond it, and something has to give; the code does not
  stop you, and the strain will show up in `check()` as nothing at all, because
  the 2D pattern is perfectly valid — it is the 3D consequence that suffers.
- **No pleats, no gathers as an edit.** Gathering is a parameter of the skirt
  generator, not an operation you can apply to an arbitrary edge.
- **Nothing is cut in cloth.** The angle defect result is exact arithmetic about
  a mesh; it has not been checked against a toile.
