# 09 — From Shell to Pattern

The step that turns the whole exercise into something you can cut out. Built in
`app/js/panels.js` and `app/js/patternsvg.js`; run it with

```bash
node tools/make_pattern.mjs            # 8 gores, writes out/pattern.svg
node tools/make_pattern.mjs 12 40      # 12 gores, finer vertical resolution
```

or press `P` in the viewer.

## 1. What I expected to build, and what the geometry forced instead

The plan in [01-geometry.md](01-geometry.md) §8 was: merge near-coplanar tiles into
large panels, convert the leftover angle defect into darts, flatten, done. The first
implementation did exactly that, and it produced nonsense: nine panels carrying up to
**480° of dart intake** and **93 self-overlapping triangles**. A pattern whose pieces
overlap themselves cannot be cut out of anything.

The reason is a constraint I had not stated:

> **A panel flattens without self-overlap only if the total angle defect it *encloses*
> is near zero.**

A body is not developable, so a wide blobby panel is unflattenable *no matter how many
darts you cut*. Its curvature is spread over dozens of interior vertices, each
individually too small to justify a dart (2–3°), collectively fatal (150°+). Cutting
darts at the big vertices does not help, because there are no big vertices — just a
diffuse haze of curvature.

Measured, on a shell with 836 triangles, varying the merge tolerance:

| normal tolerance | panels | darts | self-overlaps |
|---|---|---|---|
| 8° | 202 | 0 | 12 |
| 16° | 82 | 8 | 163 |
| 20° | 59 | 25 | **260** |
| 32° | 17 | 79 | **607** |

There is no usable setting. Blobby panels do not work.

## 2. The thing that does work: strips with no interior vertices

A strip **one cell wide** has no interior vertices at all — every vertex sits on its
left or right edge. Total enclosed defect is therefore exactly zero, so it flattens
**exactly, with no darts and no overlap**.

That is what a gore is. Gored skirts and princess-seam bodices are built this way
because it is the only panel shape that is honestly flattenable, and the craft
tradition arrived at it centuries before anyone wrote down a Gauss–Bonnet theorem.

And the crucial practical point: **a one-cell-wide strip has no interior vertices
however wide the cell is.** So the gore count is a free choice, not something the
geometry dictates. Build the shell with `cols = (number of gores)` and many rows, and
each column becomes one panel.

| gores | panels | darts | overlaps | median panel area | **body surface captured** |
|---|---|---|---|---|---|
| 4 | 4 | 0 | 0 | 1205 cm² | 80.8 % |
| 6 | 6 | 0 | 0 | 902 cm² | 88.0 % |
| **8** | **8** | **0** | **0** | **737 cm²** | **93.9 %** |
| 10 | 10 | 0 | 0 | 619 cm² | 95.6 % |
| 12 | 12 | 0 | 0 | 498 cm² | 96.2 % |
| 16 | 16 | 0 | 0 | 355 cm² | 97.0 % |

**Area capture** — flat panel area as a fraction of the body's surface — is the fit
metric. Fewer gores means the panels chord across the body's horizontal curvature and
lose area; more gores converges on the body. 4 gores throws away 19 % of the surface
and will fit badly; 8 gores is within 6 %; past 12 you are paying seams for very
little. That curve is the quantitative version of the traditional advice to use 6, 8
or 12 panels.

Widening the strips puts the interior vertices back and everything collapses again —
strip width 2 gives 4 panels, **92 darts and 423 overlaps**. The test suite asserts
this, because it is the property that explains the design.

## 3. Why the flattening is exact

Worst unfold error across all panels: **2.6 × 10⁻¹⁴ cm**. Machine precision.

This is the theoretical payoff claimed in [01-geometry.md](01-geometry.md) §8, and it
is worth being precise about why it holds. Conventional 3D-to-2D pattern flattening —
LSCM, ABF, boundary-first flattening, energy-based methods — must always trade angle
distortion against area distortion, because a smooth doubly-curved panel simply **has
no isometric development**. There is no right answer, only a least-bad one.

A triangulated surface has no such problem. Every triangle is already flat, so its 2D
copy is congruent to its 3D original, and the unfold is a sequence of exact rigid
placements along a spanning tree of the triangles. All of the approximation was spent
earlier — on faceting, and on the chord error of §6 of doc 01 — where it is visible and
controllable. None of it leaks into the pattern.

## 4. The pipeline

```
surface (parametric torso, or any OBJ)
  │
  ├─ buildGridShell(cols = gores, rows = 36)     fine triangulation, vertices on the ease offset
  │
  ├─ coarsenStrips(stripWidth = 1)               one panel per grid column
  │
  ├─ cutPaths()                                  darts, if the strips are wider than 1
  │     shortest edge path from each defect-carrying interior vertex out to the
  │     panel boundary; the slit opens into a wedge with its APEX at that vertex,
  │     widening to the panel edge -- which is exactly the shape of a bust dart
  │
  ├─ flatten()                                   spanning-tree unfold, exact
  │     tree-adjacent triangles SHARE their corner point objects, so a seam that
  │     is not cut welds exactly; a cut edge duplicates the point and the dart
  │     opens by itself. Triangle winding is read back off the 2D coordinates,
  │     so nothing depends on how a tile happened to be wound in 3D.
  │
  ├─ alignPanel()                                PCA: long axis vertical, top up
  │     the unfold starts from an arbitrary seed triangle, so panels otherwise
  │     come out at random angles -- which puts the grainline wrong and wrecks
  │     the nesting
  │
  ├─ nest()                                      shelf-pack onto fabric of a given width
  │
  └─ patternSVG()                                true scale, 1 cm = 10 mm
```

## 5. What the SVG contains

- **Solid black** — the cutting line (stitch line plus seam allowance, offset along the
  angle bisector at each vertex with a miter clamp).
- **Dashed red** — the stitch line, i.e. the actual panel.
- **Notches** every 8 cm along the stitch line, for matching neighbouring gores.
- **Grainline** with an arrow, vertical, which is the body's vertical because the shell
  is laid out with `v` running up the torso.
- **Panel name, tile count, area, dart count and intake.**
- **Faint blue A4 page grid**, labelled A1, A2, B1… so the sheet can be printed tiled
  and taped together.
- **A 10 cm calibration rectangle.** Measure it before cutting anything. Printers lie.

Open it in Inkscape (`inkscape` is installed), or print directly.

## 6. Measured output, default settings

```
body     : waist 72.2 cm, bust 92 cm, surface 0.588 m2
shell    : 8 x 36 grid, 576 triangles, mean |defect| 4.17 deg, total 257 deg

 panel  tiles   area cm2   w@top  w@mid  w@bot   len   darts  unfold err  overlaps
  P01     72        744   12.5   11.1   15.4  60.6       0     1.8e-14         0
  ...
  P08     72        744   12.5   11.1   15.4  60.6       0     2.6e-14         0

flat area 0.553 m2 vs body 0.588 m2  -> 93.9% of the body surface captured
total seam to sew  : 5.8 m
fabric needed      : 140 cm wide x 133 cm
```

The gores are 10–15 cm wide and 60 cm long, narrowest at the waist and flaring at both
hip and bust — the correct shape, arrived at from a body rather than a size chart. The
symmetry (P01 = P08, P04 = P05) is a free sanity check: the parametric torso is
symmetric unless you ask for asymmetry, and the pattern reflects that.

**5.8 m of seam, against 28 m for the tiled shell.** That ratio is the entire argument
for coarsening.

## 7. A bug this work exposed

`Assembly.angleDefects()` was computing curvature from the **nominal library angles**
rather than the actual triangle geometry. Since the quantiser leaves several per cent
of seam strain, and that strain is summed around a vertex, the reported curvature was
wrong — and so was the viewer's defect colouring.

With the fix, the numbers behave the way the theory says they must:

| | mean &#124;defect&#124; per vertex | total defect |
|---|---|---|
| u = 2 cm | 9.98° | 209° |
| u = 1 cm | 2.96° | 251° |

Per-vertex defect falls as the mesh is refined, while the **total** stays put — because
total curvature is a property of the body, not of how finely you chop it up. That is
discrete Gauss–Bonnet, and it is now asserted in the test suite.

It also explains why the first coarsening attempt failed so badly: the shell I was
trying to coarsen was reporting 37° of defect per vertex at every resolution, which is
the signature of a crumpled surface, not a smooth one.

## 8. Limits

- **The gores assume a tube.** Neck, armholes and shoulder seams are not cut out; the
  shell runs from the high hip to the base of the neck and the gores run the full
  height. Adding armholes means trimming the panels against a curve, which is a
  2D boolean operation (`python3-shapely` is the tool, see
  [08-local-toolchain.md](08-local-toolchain.md)).
- **No fabric shear**, so the gore count needed is higher than a skilled cutter would
  use. See [06-open-questions.md](06-open-questions.md) §1 — this remains the first
  experiment worth running.
- **No seam take-up.** The bias-stretch correction from the gored-skirt tradition
  (roughly 0.5–1 cm per panel depending on count) is not applied. Add it as a per-seam
  parameter.
- **Shelf nesting is naive.** It leaves a lot of fabric empty. Real nesting would rotate
  and interleave the gores head-to-tail, which for tapered panels saves a great deal.
- **Seam allowance offsetting can self-intersect** on a sharply concave boundary. The
  gores are convex enough that it does not bite, but a panel with a deep dart notch
  would need a proper polygon offset.

---

# 10 — Trying a Pattern On

`app/js/patternio.js`, plus `node tools/try_pattern.mjs`, and `I` / `T` in the viewer.

Draping a pattern back onto the body it was drafted for only proves the round trip.
Draping it onto a **different** body is the useful operation, and it is the thing a
bought pattern can never tell you: not what size you are, but *where exactly this
piece of paper stops matching you.*

## 1. The format

`exportPatternJSON()` writes panels as 2D points and triangles, and each point carries

- `v3` — the id of the 3D vertex it was unfolded from. **Points sharing a `v3` are the
  ones that get stitched to each other**, so seam correspondence is exact and needs no
  matching heuristic.
- `uv` — where on the body it was drafted to sit. This is a placement hint, and it is
  the digital equivalent of the balance marks on a paper pattern.

## 2. Sewing

`sew()` welds every group of points sharing a `v3` into one vertex, and gives each
triangle the side lengths it has **on the pattern** — because that is what the cut
fabric will hold the garment to, whatever body you then put it on. The pieces are
offered up to the body at their `uv` hints, the way a fitter lays pieces against a
form before pinning.

Verified: sewn back onto its own body, the pattern reproduces the drafted shape to
**0.0006 % maximum seam strain.**

## 3. Draping

`drape()` is static constraint projection again, but with the sign of the problem
reversed. There is **no attraction to the body.** The garment is held only by its own
seam lengths, pushed outward by a body it cannot pass through, pulled down by gravity,
and supported at the shoulders. Where the pattern is too small it stretches; where it
is too big it stands away.

Seams resist stretching about twice as hard as they resist going slack, because fabric
buckles rather than compressing.

## 4. Reading the result

- **gap** — how far the cloth stands off the body. On its own body the median gap
  equals the ease it was drafted with (measured: 0.98 cm against 1.0 cm asked for).
- **tension** — fraction of seam length being stretched past what was cut.
- Colour mode `fit` in the viewer: **red = stretched (too small here), blue = stands off
  (too big here)**, green = as drafted.

`node tools/try_pattern.mjs` drafts for the default body and then tries it on thirteen
others:

```
body                             min gap   p10  median   p90   tension  tight  verdict
the body it was drafted for        0.64   0.83   0.98    1.20     0.28      0  good fit
bust +6 cm                         0.02   0.33   0.89    1.15     0.28      0  good fit
bust +16 cm                       -0.00   0.00   0.85    1.31     1.84     29  TOO SMALL
bust +26 cm                       -0.00  -0.00   0.85    1.65     3.64     40  TOO SMALL
bust -10 cm                        0.55   0.82   1.00    2.16     0.27      0  good fit
waist +16 cm                      -0.00  -0.00   0.87    1.23     0.73     21  tight
hip +18 cm                        -0.00   0.79   1.00    1.15     0.11      0  good fit
one shoulder 5 cm lower           -0.00   0.38   0.92    1.53     0.48      0  good fit
6 cm lateral spine deviation      -0.00  -0.00   0.65    2.34     0.81     21  tight
two sizes larger all over         -0.00  -0.00   0.00    1.00     1.79     44  TOO SMALL
two sizes smaller all over         0.60   0.90   2.08    2.85     0.28      0  good fit
```

Worth reading carefully, because the numbers say something a size chart does not:

- **+6 cm of bust girth is only +0.95 cm of radius**, so it is absorbed almost exactly
  by 1 cm of ease: the gap closes from 0.83 to 0.33 cm and nothing strains. Girth
  differences are nine times less dramatic than they sound.
- **Too small shows as tension; too big shows as gap.** Two sizes smaller does not
  strain at all (0.28 %), it just stands 2 cm off. That asymmetry is why a too-large
  garment merely looks bad and a too-small one is unwearable.
- **A 6 cm lateral spine deviation binds** (21 tight spots) while a 5 cm shoulder drop
  does not. A bodice tolerates a dropped shoulder because the gores can slide; it
  cannot tolerate the torso moving sideways out of the tube. For an asymmetric body
  that is the fitting problem, stated quantitatively.

## 5. Three bugs this exposed

1. **`shoulderDrop` had never worked.** `Torso.point()` declared `y` with `const` and
   then tried to modify it, so the field threw the moment it was non-zero. Nothing had
   ever set it, so nothing had ever caught it. It is now in the test suite, along with
   the other three asymmetry fields.
2. **The first placement heuristic started the garment 15 % stretched**, and no amount
   of relaxation recovered, a triangulated shell being nearly rigid. The cause: using
   the x coordinate within the panel's bounding box as the across-gore fraction. A gore
   is 10 cm wide at the waist and 15 cm at the hip, so its left seam *wanders across
   the box*. Chasing it with arc-length and seam-chain heuristics made it worse (21 %)
   before I gave up guessing and had the pattern carry the `uv` hint, which took it to
   0.0000 %.
3. **Face clearance inflated the garment.** Lifting a whole tile out whenever one of its
   interior samples dipped below the surface fights the edge constraints, and the
   equilibrium is a stretched, ballooned garment: a perfectly fitting shell went from
   0 % to 31 % peak strain, and to **207 %** when the offset being cleared was the same
   one the garment had been drafted to sit on. It earns its keep on the coarse tiled
   shell, where a 10 cm tile sags over a centimetre; a pattern mesh has ~1 cm triangles
   whose sag is under half a millimetre, so vertex collision is enough. It is now off
   by default in `drape()` and on by default in `relax()`.

## 6. Limits

- **No friction and no self-collision**, so a too-small garment slides and rides up
  rather than binding as hard as it should. Tension is therefore a lower bound.
- **No fabric shear**, again, so a woven would absorb more than this model says.
- **Gravity is a nudge, not a force**: there is no mass, no inertia, no fabric weight.
  Changing it rescales the hang but does not model a heavy crepe against a light lawn.
- **The verdict thresholds are calibrated against one baseline** (0.28 % mean tension on
  its own body) and one garment type. Treat the words as a hint and the numbers as the
  result.

---

# 11 — The Pattern File

`out/pattern.json` is the artifact. The SVG is a *view* of it, generated on demand, so
a pattern saved to disk can be loaded, draped on any body, and re-exported — which was
not true of the first version, where SVG export quietly regenerated the pattern from
whatever body happened to be on screen.

```jsonc
{
  "format": "triangulated-bodice-pattern/1",
  "units": "cm",
  "meta": { "gores": 8, "rows": 36, "ease": 1, "vLo": 0.06, "vHi": 0.94,
            "waistV": 0.2857, "body": "parametric", "drafted": "2026-10-08" },
  "panels": [{
    "name": "P01",
    "pts":  [{ "x": -5.97, "y": -31.01, "v3": 0, "uv": [0, 0.06] }, ...],
    "tris": [[0, 1, 2], ...],
    "loop": [...],            // the outline, as indices into pts
    "runs": [                 // the outline split into meaningful edges
      { "kind": "bottom", "pts": [...], "lengthCm": 13.57 },
      { "kind": "seam", "seam": "S01", "partnerName": "P02",
        "pts": [...], "v3": [...], "lengthCm": 63.74 },
      { "kind": "top",  "pts": [...], "lengthCm": 9.47 },
      { "kind": "seam", "seam": "S02", "partnerName": "P08", "lengthCm": 60.22 }
    ],
    "areaCm2": 744, "darts": []
  }, ...],
  "seams": [{ "id": "S01", "a": "P01", "b": "P02", "lengthCm": 63.74 }, ...]
}
```

Two fields on every point carry all the meaning:

- **`v3`** — the 3D vertex this point was unfolded from. Points sharing a `v3` are the
  ones that get stitched together. Seam correspondence is therefore **combinatorial,
  not geometric**: no tolerances, no nearest-point matching, no possibility of drift.
- **`uv`** — where on the body this point was drafted to sit. A placement hint, the
  digital equivalent of a balance mark. It is what lets a pattern be offered up to a
  body it was *not* drafted for, in the right place.

## Which edge joins which

`annotateSeams()` walks each panel's outline and, for every segment, asks which other
panel contains *both* of its endpoint `v3`s. Consecutive segments with the same answer
form a **run**. A run with no partner is a free edge — top or bottom, decided by its
mean `uv.v`. A run with a partner is a seam, and gets a global id.

For the default 8-gore bodice this recovers exactly the closed tube:

```
S01 P01-P02   S02 P01-P08   S03 P02-P03   S04 P03-P04
S05 P04-P05   S06 P05-P06   S07 P06-P07   S08 P07-P08
```

and each gore reports `bottom, seam S01->P02, top, seam S02->P08`. Both sides of every
seam are verified to be the same length **and made of the same vertices**, which is
what makes the balance marks line up.

## What the sheet now tells you

- **TOP (neck)** and **BOTTOM (waist)** printed on the free edges, clear of the cutting
  line.
- **`S01 join to P02`** printed along every seam, on both panels.
- **Balance marks** at 25 / 50 / 75 % of each seam, placed by *vertex identity* rather
  than by distance along the edge — matching by distance drifts, matching by identity
  cannot. Plus a longer dashed **waist mark** wherever a seam crosses `meta.waistV`.
- **Grainline** with the arrow pointing to the neck, labelled `GRAIN / UP`.
- A **sewing order** table in the margin listing every seam and its length.
- The 10 cm calibration square.

## The orientation bug

The first render came out **upside down**, with "TOP (neck)" printed at the bottom of
every panel and the grainline arrow pointing at the floor. `alignPanel()` orients
panels so that +y means up the body; SVG's y axis points *down*. The flip is now done
once, at the top of `patternSVG()`, rather than being compensated for in each of the
half-dozen places that draw something.

It is the cheapest possible mistake to make and an expensive one to find out about
after cutting, which is why the test suite now asserts that the SVG contains both
`TOP (neck)` and `BOTTOM (waist)`, and the viewer and `make_pattern.mjs` both go
through the same code path to produce it.
