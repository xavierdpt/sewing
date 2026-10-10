# 13 — Arrange, Stitch, Drop

`app/js/assemble.js`; `node tools/assemble.mjs`; **J** in the viewer.

Three phases, and the order is the whole idea:

1. **Arrange.** Every pattern piece is placed in 3D, vertically around the body,
   one at each station, each piece centred on the part of the body it belongs
   to. Nothing is joined.
2. **Stitch.** With **gravity off**, the seams are drawn closed. Each pair of
   points that are the same point of the garment but were cut on different
   pieces is pulled together, while the body stops the cloth passing through the
   figure. The pieces wrap onto the body as they close.
3. **Drop.** The closed seams are welded into one mesh, gravity comes on, and
   the garment falls.

This is how commercial drape software works — arrange on the avatar, then
simulate — and it is arrived at here for reasons that can be measured.

---

## 1 — Why not just put the garment where it goes?

`skirt.js` can lay a skirt straight onto the cone it belongs on, exactly and
unstrained. That works because a flared skirt panel is an annular sector, and
there is a closed form for the cone it lies on. Two things kill it as a general
method.

**Most garments have no such closed form.** The placement has to be an embedding
that is isometric *and* closed, and below a full circle of flare no planar one
exists at all: four quarter-circle panels laid flat leave a 270° gap and the
closing seam has to stretch 3430 % across it (docs/12-flare.md §5). Arranging
separate pieces sidesteps the question entirely — a flat piece moved rigidly in
3D is trivially isometric, whatever the garment. Measured arrangement strain, on
a four-panel skirt and on an eight-gore bodice: **2×10⁻¹³ %** and **8×10⁻¹³ %**.

**And sewing while falling fills the cloth with strain.** A full circle skirt
dropped from its flat layout settles at 13.6 % peak strain even though it
*started* at 0.2 %, because the hem has 90 cm to travel and a nearly
inextensible mesh cannot work a transient back out. Closing the seams
quasi-statically means the garment never has that transient.

It works. The same pattern, both ways:

| cut | laid on its cone | arranged, stitched, dropped | seams closed to |
|---|---|---|---|
| quarter circle | 1.6 % | **1.2 %** | 0.005 cm |
| half circle | 2.2 % | **2.6 %** | 0.032 cm |
| full circle | 2.8 % | **3.5 %** | 0.025 cm |

The general route is as good as the purpose-built one, and needs nothing derived.

## 2 — Arranging: vertical, one per side, rolled, and allowed to overlap

Three details, each of which was wrong first.

**Rolled onto a cylinder, not laid flat on tangent planes to it.** Rolling a
flat sheet is a bending, not a stretching, so the piece is still the shape it
was cut — to the mesh's chord-versus-arc error, `edge²/24R²`, under a tenth of a
per cent here. Flat planes work while pieces are narrow and fail when they are
not: the four panels of a full circle skirt are 106 cm across, so as flat planes
they stick straight out through their neighbours and the garment comes out of
the stitching phase tangled. Measured: **32 % peak strain**, against 2.8 % for
the same skirt laid on its cone.

**One piece per station, centred where it belongs** — not packed side by side
into slots around the cylinder. Packing keeps pieces from overlapping but moves
them away from where they are going: the seams then start 100 cm apart instead
of 44 cm, and close to 0.4 cm instead of 0.025 cm.

**Wide pieces are allowed to overlap each other.** A full circle skirt has 424 cm
of hem and the body is 78 cm around, so there is no arrangement near the figure
without overlap. Self-collision is therefore **off during stitching and on from
the weld onwards**. That is a statement about what a pile of cut pieces is, not a
numerical dodge: the pieces are not a garment yet.

## 3 — Stitching: a set, not a sequence

A stitch is a zero-length constraint between two vertices that are the same
point of the garment. Every stitch is solved in the same Gauss–Seidel sweep,
every substep, with the pull ramped from 0.05 to 1 — so **no piece goes first
and no piece is the reference**. The pieces are drawn together iteratively, all
at once.

That makes the result independent of the order of the pieces, which is testable:
reversing the order of a six-panel skirt gives a hem of 235.61 cm against
235.60 cm, and fold depths of 7.59 cm against 7.65 cm. The remaining difference
is Gauss–Seidel sweep order, i.e. solver noise.

The pull is ramped rather than snapped for the same reason a pin is ramped and a
contact is under-relaxed: closing a 44 cm seam in one step is an arbitrarily
large velocity (docs/11-cloth.md §4).

## 4 — Welding, and why not just leave the stitches in

Once the seams are closed the vertices are **welded** — merged by union-find,
positions and velocities averaged, rest lengths taken from the pattern rather
than from the welded geometry so nothing stitched slightly imperfectly is baked
in as the cloth's new idea of its own size.

Leaving the seams as zero-length point constraints instead would make every seam
a **hinge**: the bending constraint across it never existed, because the two
triangles were never neighbours. A welded seam has the same bending stiffness as
the cloth either side of it, which is what a sewn seam has — rather more, in
fact, since a real seam has two or four layers and a line of thread in it.

## 5 — It does not care how many pieces, or what shape they are

Nothing in the arrangement, the stitching or the weld knows the piece count, and
nothing assumes the pieces are alike. Verified:

| pattern | pieces | seams | stitches | vertices in pieces → sewn |
|---|---|---|---|---|
| skirt | 2 | 2 | 22 | 550 → 528 |
| skirt | 12 | 12 | 132 | 660 → 528 |
| skirt | 24 | 24 | 264 | 792 → 528 |
| **8-gore bodice** | 8, all different shapes | 8 | 296 | 592 → **296** |

The bodice is the interesting row: it comes from a different generator
(`panels.js`, by flattening a tiled shell), its pieces are 12.5 to 17 cm wide and
no two are the same, and it goes through the identical code. Its vertex count
halves exactly on welding, because a gore is one cell wide — every point is on
one of its two long edges, so every point is on a seam.

Two-piece garments also exposed a labelling bug worth recording: a front joined
to a back **down both sides** is two seams, and `annotateSeams` was keying seams
by the pair of panels, so both came out as `S01`. A pattern would have printed
one id on two different seams. Seams are now keyed by the panel pair *and* the
vertex ids of the run.

## 6 — A waistband is not a simplification

With the waist seam pinned, the skirt stays at the waist. Without it, gravity
slides the garment down the body until the waist seam **wedges on the hips** and
stops — 78 cm of seam against 98 cm of hip, which it cannot pass without 25 % of
stretch. That is correct, it is what happens, and it is why skirts have
waistbands.

Getting that right needed more strain-limiting passes than a sheet does:

> A ring enforces its length **globally**. Gauss–Seidel moves that information
> one edge per pass, so with two passes a 64-edge waist ring never learns that
> it is too short to be where it is. Measured: it stretched to 96 cm — 41 % — and
> slid off a body it cannot physically pass. `strainPasses` is now 8.

Even at 8 the unpinned case reads 31 % peak strain while it wedges, so treat
that number as an upper bound: the ring is being asked for something
unsatisfiable and the limiter does not fully converge against it.

## 7 — Limits

- **The hem's cyclic order must come from the mesh, not from a list.** Taking the
  hem vertices in the order the panels were visited gives a zigzag that walks
  back and forth between pieces: a 251 cm hem measured 385 cm. `boundaryLoops()`
  walks the actual boundary, which needs no knowledge of the pattern.
- **Stitching cost is per seam point.** The eight-gore bodice has 296 stitches
  and every one is solved every substep. A 50-piece pattern at fine resolution
  would want the stitches welded progressively rather than all held to the end.
- **Overlapping pieces pass through each other during stitching**, by design — so
  a garment whose pieces must *interleave* (a wrap, a pleated underlay) may
  close into the wrong configuration. There is no layer ordering.
- **The arrangement needs placement hints.** A pattern with no `uv` on its points
  falls back to spacing the pieces evenly, which will put them in the wrong order
  around the body if the file order is not the garment order.
- **Nothing is validated against a real toile.**
