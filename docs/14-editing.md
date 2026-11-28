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

The tools. Every one of them is a drag, and the drag is the argument:

| | gesture | what it does |
|---|---|---|
| **dart** | drag from the apex outwards | the direction sets the bisector, the intake comes from the field |
| **spread** | the same, from the pivot | the spread angle comes from its field |
| **turn** | drag round the point you press | turns the piece about that point by the angle the drag sweeps |
| **move** | drag the piece | slides it; the cloth is not touched |
| **mirror** | drag the line to reflect about | *cut 2, one reversed* / *open out on the fold* / *flip this piece over*, from the field beside it |
| **cut in two** | drag the line to cut along | two pieces and a new seam where the cut was |
| **join** | press one piece, release on another | one piece, with the seam between them gone |
| **undo** | **U** | the pattern is snapshotted before every operation, fifty deep — commands included |

And the two that are not a gesture, as buttons: **true the darts** and
**replay these edits onto this body**; plus the allowance and grain fields,
which are edits like any other. All of them go through `table.command`, which
is the same machinery a drag goes through — snapshot, operation, `check()`,
report — so **U** undoes them too.

Two more buttons stood here until 2026-11-27 — **measure the darts folded
shut** and **list the edits** — and they were removed, with eight others like
them, because their entire output was a `console.table` nobody at the viewer
sees ([console-readouts-spec.md](../todos/console-readouts-spec.md)). Neither
was an edit: `command('dart-profile')` and `command('edits')` are pure
queries (`table.js:417-418`), which is why they could go while the two above
stay. Both questions are still asked, in the instrument that was always the
better place for them: `node tools/edits.mjs` lists every edit and what it
cost, and `node tools/edits.mjs --darts` measures every dart folded shut.

The tool menu also lists the five gestures that are **planned and not built**
— turn, move, mirror, join, cut — and the folder lists the four planned
commands beside them, each marked *(not built)*. Picking one, or pressing on
the table with one picked, opens a dialog saying what the tool will do and
what it is waiting on; the HUD shows it in the warning colour meanwhile. They
are in the menu on purpose: a tool nobody can find is a tool nobody can ask
for, and listing capabilities in a document while the thing a person presses
does not have them is this project's own recorded mistake (rule 9). The
wording lives in `PLANNED` in `patternedit.js`, so the headless path refuses
them in the same words, and the table refuses the gesture itself rather than
trusting the viewer to — an unknown tool used to fall through to the spread,
because `apply` chose between the two operations with a ternary.

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

## 6 — The tools, and what each one cost

Seamly2D's source is unpacked in `src/seamly2d` and inventoried in
[03-prior-art.md](03-prior-art.md) §12. Nine tools came out of that inventory.
They were in the menu, marked *(not built)*, for about an hour on 2026-10-17;
this section is what they turned out to be once built. `node tools/edits.mjs`
runs every one of them headlessly and prints these numbers.

**The four constraints that decided which of Seamly2D's tools could come over
at all**, stated once because every item below obeys them:

1. a piece is a **triangulated mesh**, not an outline, and every edit goes
   through `splitEdgeAt`, which rewires the triangles on *both* sides — a
   T-junction is a crack the moment the cloth is pulled;
2. **`v3` identity is the seam correspondence.** New points take fresh ids,
   paired points share one;
3. edits are **isometric or explicitly add and remove cloth**, and must
   survive being applied again;
4. the shape comes from a **body, by unfolding** — not from measurements and
   formulas. So Seamly2D's spine (SeamlyMe, the variables table, the
   expression engine) stayed where it was: it would be a second source of
   truth for shape, competing with `body.js`.

### Truing a dart, which is the only one that needed a new measurement

A dart is cut as two rays from an apex, and the legs come out as long as the
cut happened to reach. Sewn shut, the edge the dart crossed — a waist, a hem —
is left with a **step** and a **corner**, by exactly as much as the legs
disagree. `takeOutWedge` has always printed the leg mismatch; what nothing
measured is what that does to the edge, which is the thing a person sees.

`closedDartProfile` folds every dart shut arithmetically and reports both, per
dart, located. On the asymmetric fixture at 2x:

```
panel      dart  intake   legs (cm)        step    turn
SKIRT-01   0     18.24    12.410 / 12.399  0.011   22.154
SKIRT-01   1      9.12     9.198 /  9.211  0.014   10.425
SKIRT-02   0     18.00    12.225 / 13.032  0.807   20.609
SKIRT-04   0     26.40    15.824 / 15.733  0.090   31.619
```

The step was the expected finding. **The turn was not**: a waistline comes out
of this fixture with a 31.6° corner at a dart mouth, and no instrument in the
repository would have said so.

`trueDart` is Seamly2D's construction (`vtooltruedarts.cpp:102`), adapted:
rotate the far side of the edge about the apex by the dart's own angle so it
lands where it will be once the dart is closed, draw the edge across, and take
the leg to where that line crosses it. Rotating back by the same angle puts the
other leg at the same length **by construction**, which is why the step and the
corner go together. The legs' interior points are rescaled along their rays with
the ends, so the two legs keep the matching fractions `harmoniseLegs` gave them
— without that, truing would fix the edge and quietly break the pairing.

Measured, same fixture: worst step **0.807 → 0 cm**, worst turn
**31.619 → 0°**, total cloth 6898.2 → 6898.5 cm² (the slivers the trued cut
adds), and the pattern still checks out.

### Turn, move, mirror: one operation with three faces

Every point goes through the same affine map, so the cloth is untouched and the
result is isometric by construction. Moving and turning a piece changes its
area by less than 1e-6 cm² and undoes itself exactly.

Mirror is not quite as cheap, and the difference is **not geometric**. A
reflection reverses orientation, so the triangles are re-wound or the piece is
the only thing in the pattern facing the other way. And the three modes differ
only in what happens to the ids:

* **cut 2, one reversed** — a new piece, with *fresh* ids. The left of a body
  and the right of it are different places even when the pieces are the same
  shape; giving the copy the original's ids would weld the two together along
  every point at once. Measured: the copy shares no id with its original, and
  the pattern gains no seam.
* **open out on the fold** — the reflection is welded to the piece along the
  line, and the points **on** the line are the only ones shared. Folding a
  skirt panel about its own side edge gives 11 points on the fold and doubles
  the area exactly, 1468.8 → 2937.5 cm². Two things are refused rather than
  approximated: a piece that straddles the fold, whose halves would overlap;
  and a fold line that only *touches* the piece. The second was found by
  trying it — a line through the leftmost vertex was accepted and doubled the
  piece, joined at a single point, which is a hinge and not anything anyone
  could cut.
* **flip this piece over** — the same cloth the other way up, so the ids are
  untouched.

### Cut in two, and join: moving a seam line

The cut follows mesh edges, every edge it crosses is split on both sides, and
the points along the cut keep their ids and appear in **both** halves — which
is what makes it a seam rather than two unrelated pieces, by the same trick a
dart uses. Measured: a skirt panel cut down the middle keeps every square
centimetre (0 cm² lost), shares 37 points along a 55 cm cut, and the pattern
gains exactly one seam.

**A cut that crosses a piece's edge has to cross its neighbour's too.**
`propagateSplit` makes the same split in the partner, at the same fraction of
the same edge, and gives both points the same id. What that buys, measured on
a cut across a skirt panel's two side seams: **65 stitches with it and 63
without** — two points of a seam that would simply have no partner to be sewn
to. Cheap to state and easy to get wrong: a split *along* a straight edge
costs no length, so nothing about the seam's measurements changes, and

> **`check()` does not notice.** With the propagation disabled it still
> reports `ok`, a worst seam mismatch of 0 cm and no problems, while the
> garment quietly loses two stitches. `check()` compares the two sides of a
> seam by LENGTH and never by which vertex ids they carry — queued in
> [19-todo.md](../todos/19-todo.md).

A separate number, and worth keeping apart from that one because it was first
written up as the same fault: driving the page, `check()` reported *"seam S03
differs by 0.26 cm between its sides"* after a cut. That was **not** the
propagation. The cut had separated a dart's two legs into different pieces, so
the dart became a seam between them — and an untrued dart's legs are different
lengths. Truing the darts first and making the same cut gives 0 cm. Two
instruments, one defect: the same leg mismatch §6 opens with, arriving by
another road.

Joining is the inverse and is **not free**. The two pieces were flattened
separately, so their shared edge has two shapes, one in each piece's plane.
`joinPieces` lays one onto the other by best rigid fit (Kabsch, in 2D),
measures the residual **per welded vertex**, and refuses past a tolerance
rather than stretching the cloth to make up the difference — the refusal names
how many points are over, the worst one, and the vertex it is at. Two halves of
a piece that was cut in two join back at a worst residual of 0.000 cm, which is
the case where the answer is known.

### The edit list, and the fit test it makes possible

The pattern now keeps **what was done to it**, not just what it looks like.
Undo keeps whole copies and can say nothing about what changed; `pattern.edits`
can, and — the point of it — can be applied to pieces unfolded for a different
body.

That needs the apex to be a **construction** rather than a coordinate. A dart
apex is an interior point, so a fraction along an edge cannot name it alone; it
is recorded as *so far along that edge, and so far in from it*
(`describeApex`), which is how a dart is actually placed. Measured: replaying
13 edits onto the draft they were cut into, and onto a skirt **6 cm wider in
the waist**, applies all 13 with none skipped and both patterns check out.
Before the construction existed, every dart missed on the wider skirt — the
apex snapped to whatever vertex was nearest its old (x, y) and the legs no
longer reached an edge.

### What a piece is made up as

Allowance is now a property of the **pattern**, per edge kind, with a per-piece
override; `offsetPoly` takes an array, so a hem can take 2.5 cm where the seams
beside it take 1. It was a single number given to the printer, which meant a
pattern saved and reloaded came back with whatever the slider happened to say.
Grain is a per-piece angle that the printed arrow follows, instead of always
pointing up the page.

One claim in an earlier draft of this document was **wrong** and is corrected
here: the SVG's `.notch` class is not a stub. Balance marks *are* drawn, at
points chosen by `v3` identity so both sides of a seam are marked in the same
place — a correspondence Seamly2D has to ask the user for. What is missing is
only its taxonomy of notch *shapes*, which is cosmetic.

## 7 — Limits

- **`check()` is a length test.** It catches a seam whose two sides measure
  differently, a triangle wound against the rest and a degenerate one. It does
  **not** catch a seam whose two sides carry different vertices, which is a
  stitch that will not exist — see the measurement in §6 and the first item in
  [19-todo.md](../todos/19-todo.md).
- **The allowance and the grain reach the whole pattern, or piece 1.** The
  data model is per piece and per edge and the SVG honours it; the viewer has
  three numbers and a slider wired to the first piece, because a piece cannot
  be selected on the table yet.
- **No grading, no truing a curve, no moving a single point.** Point-level
  editing is still the obvious next thing and is still not built. §6 says
  which of a pattern CAD's tools were worth bringing over and which would be
  a second source of truth for shape.
- **Moving a piece moves its own coordinates, and the table re-spaces the
  pieces whenever how many of them there are changes.** So a move survives
  until a mirror, a cut or a join, and then the row is laid out again from
  scratch. Printing re-places everything anyway (`nest`), so a move is a
  convenience for reaching a piece, not a decision about the sheet.
- **A join can be refused and that is the honest answer, not a workaround.**
  Two pieces flattened separately do not share an edge shape, and past the
  tolerance the only ways on are to stretch the cloth or to re-unfold the
  shell with those two panels as one. The second is right and is not wired to
  anything.
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
