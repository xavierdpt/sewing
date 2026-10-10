# 12 — Flare, Gathers, and How the Pieces Go Together

`app/js/skirt.js`; `node tools/skirt.mjs`; **K** in the viewer.

A bodice pattern is the body's surface flattened: it contains exactly as much
cloth as the body needs. Everything below the waist is the opposite case, and it
is the more common one — **the pattern deliberately contains more cloth than the
body needs, and the design is where the excess goes.**

There are two ways to put it in, and they produce different garments from the
same generator.

| | where the excess is | what it does |
|---|---|---|
| **flare** | at the hem; the waist seam still matches the body exactly | the extra hem length cannot hang straight down, so the cloth stands in waves — flutes |
| **gathers** | at the waist seam itself, which is longer than the body's waist and pulled in | the excess buckles at the waistband and the hem **rides up** |

Neither is faked. The pattern really contains the cloth, both sides of every seam
really are the same length, and the folds are what `cloth.js` finds when it has
nowhere else to put the material.

---

## 1 — Flare is named by how much of a circle it is

Each panel is an **annular sector**. Since the waist edge is fixed at the measured
ring, the fraction of a circle the panels span sets the hem exactly:

```
hem = waist + 2 * pi * circleFraction * length
```

On a 78.3 cm waist ring, 55 cm long:

| `circleFraction` | hem | name |
|---|---|---|
| 0 | 78 cm | straight tube |
| 0.25 | 165 cm | quarter circle, an A-line |
| 0.5 | 251 cm | half circle |
| 1.0 | **424 cm** | full circle skirt |

That last number is the one that surprises people cutting their first circle
skirt, and the reason a full circle rarely fits across the fabric.

## 2 — The assembly is one line

Every point in the pattern carries the id of the 3D vertex it was unfolded from.
In this generator the id is **global and wraps**, so the last column of one panel
and the first column of the next are the same vertex:

```js
const col = (p * nI + i) % nCols;
pts.push({ ..., v3: j * nCols + col });
```

That is the whole of it. From that one line:

- `sewFlat()` and `placeSkirt()` **weld the panels into a single mesh** — verified:
  the vertex count comes out at exactly `panels x colsPerPanel x rows`, and 2624
  of 2752 edges are ordinary interior edges. The seams are not a special case in
  the solver; there is no seam code in `cloth.js` at all.
- `annotateSeams()` works out **which panel joins which**, with no matching
  heuristic and no tolerance — the correspondence is combinatorial. A four-panel
  skirt reports `S01..S04`, each 55 cm on both sides, each panel knowing which of
  its edges is the waist and which the hem.
- `patternSVG()` prints it at true scale with seam allowances, grainlines and
  **balance marks matched by vertex id**, so the marks on both sides of a seam
  are at the same place by construction rather than by measuring along the edge.
  A four-panel quarter-circle skirt nests into 140 x 124 cm of 140 cm fabric.

`node tools/skirt.mjs svg` writes `out/skirt-pattern.json` and `.svg`.

## 3 — How to edit them

Three levels, in increasing order of commitment:

1. **Parametrically**, in the viewer: panels, hem or circle fraction, length,
   gather, waist ease, mesh resolution. **K** re-drafts, re-sews and re-hangs it.
   This is the level at which most pattern decisions actually live.
2. **As a file.** The pattern JSON is the artifact; the SVG is a view of it. Edit
   the JSON — move points, change a seam, delete a panel — import it, and it
   sews and drapes. The format is in docs/09-pattern.md section 11.
3. **Not yet: on the mesh.** Dragging a seam line in the viewer and having the
   pattern follow is the obvious next step and is not built.

## 4 — Measure the seam, then draft to it

A 72 cm waist is a **78.3 cm ring** at 1 cm of ease, because offsetting a closed
curve outward by `d` adds `2*pi*d` to its length. Drafting to the tape
measurement and then pinning to the ring starts the whole garment 8 % stretched,
and every fold measured afterwards is measuring that mistake. It did, in the
first version of this file: peak strain 11 % before gravity had done anything.

Whether the ring is a circle, an ellipse or a rounded rectangle makes no
difference. The cloth is inextensible and intrinsically flat, so it absorbs the
*shape* by bending; only the *length* constrains it.

## 5 — Laying it down without jamming it

An annular sector is developable, so laying the assembled skirt on the matching
cone is an **exact isometry**: every seam, every diagonal, every triangle is the
length it was cut, to machine precision. Measured initial strain: 0.03 % peak.

The cone's waist is a circle, and the body's is not — but that needs no
stretching either, only bending. What there is no closed form for is the
*folded* isometry whose waist follows a particular ring. So the placement does
not guess: it lays the cone down unstrained and **ramps the waistband on over a
third of a second**, letting the solver walk to a folded isometric state. It
finds one — the settled full circle skirt sits at 2.8 % peak strain, which is
the strain limiter's own noise.

### Does it need a construction at all?

No — it needs a starting mesh that is **isometric and closed**, and for one case
the pattern's own 2D coordinates already are. Laid out flat, with no formula of
any kind, a **full circle** skirt is an exact isometry: measured 0.2 % peak
strain. That layout is literally the hollow disc of docs/11-cloth.md with its
hole pinned — the drop test and the circle skirt are the same object.

Below a full circle it fails, and for a geometric reason rather than a numerical
one. Four quarter-circle panels span 90 degrees; laid flat they leave a 270
degree gap, and the closing seam has to stretch across it. **A closed garment
spanning less than 360 degrees cannot lie in a plane**, so it has to leave it,
and the cone is the simplest place to put it — two lines of trigonometry rather
than a derivation. Measured:

| start | cut | initial strain (mean / peak) | settled peak stretch |
|---|---|---|---|
| cone | full circle | 0.00 % / 0.0 % | 2.8 % |
| flat | full circle | 0.00 % / **0.2 %** | 13.6 % |
| cone | quarter circle | 0.05 % / 0.1 % | 1.6 % |
| flat | quarter circle | 46 % / **3430 %** | 21.3 % |

Note the third column against the fourth: even where the flat start is perfectly
isometric it is a *worse* start, because the hem has 90 cm to travel and the
transient locks strain in. Both are available as `start: 'cone' | 'flat'`.

Two cleverer-looking placements were tried, and both are worse because both
guess at the embedding:

| placement | mean strain | peak | why it fails |
|---|---|---|---|
| blend the ring towards a circle at the hem | 6 % | 19 % | the ring's points are spaced by equal **arc**, the circle's by equal **angle**; blending twists the mesh by a different amount at every column, and a twist is a shear |
| push the ring out along its own normals | 6 % | 40 % | offsetting lengthens a closed curve by exactly `2*pi*d` — true of the **total**, false of every **part**: local arc length grows as `(1 + curvature * d)`, so the sharp sides of a waist grow several times as much as the flat front |
| lay it on its own cone, ramp the waistband | **0.0003 %** | **0.03 %** | it is an isometry, and it does not pretend to know where the folds go |

Teleporting a pinned vertex is not a shortcut either: it is an arbitrarily large
velocity imposed on its neighbours, the same mistake as resolving a contact too
fast (docs/11-cloth.md section 4).

## 6 — The result

`node tools/skirt.mjs sweep`, four panels, 55 cm long, linen, on a 78.3 cm waist:

```
 cut              hem  | folds  depth   hem drop   hem length   stretch
 tube              79  |   2     3.7      -54.1     79 -> 79      6.5%
 quarter circle   165  |   4     7.2      -54.9    165 -> 165      1.7%
 half circle      251  |   5    23.6      -54.4    252 -> 252      2.2%
 full circle      424  |   8    20.0      -54.8    424 -> 424      2.8%
 gathered 1.5x    118  |   2     9.1      -52.2    118 -> 118      7.0%
 gathered 2.5x    196  |   2    14.7      -50.6    196 -> 196     10.8%
```

- **More circle, more and deeper folds**: 2 shallow folds on a tube, 8 folds 20 cm
  deep on a full circle. Nothing counts folds for the solver; the fold count is
  read off the settled hem afterwards as the local maxima of its radius.
- **The hem keeps the length it was cut**, to the centimetre, folds and all. That
  is the inextensibility of the cloth showing up as a conservation law, and it is
  the cheapest available check that the simulation is not quietly stretching.
- **Flare does not strain; a tube does.** A quarter circle reads 1.7 %, a straight
  tube 6.5 % — because a tube drafted to the waist has to be *forced over the
  hips*, which are 96 cm against its 79 cm. That is the oldest reason skirts are
  flared or vented, arrived at here from the physics.
- **Gathers ride up.** Flare hangs to −54.8 cm; 2.5x gathers hang to −50.6 cm from
  the same 55 cm panel, because the fullness is consumed at the waist instead of
  released at the hem. The 10.8 % strain there is the honest cost: cramming 196 cm
  of cloth into a 78 cm ring is a hard constraint, and the strain limiter does not
  fully converge against it.

## 7 — Limits

- **Gathers are harder on the solver than flare.** The waist seam is compressed by
  the full fullness ratio against pinned vertices, and a few per cent of tension
  survives at the pins. Treat the gathered strain figures as an upper bound.
- **The fold count is not stable to the mesh.** Flutes are a buckling pattern, and
  which mode you land in depends on the mesh and the path. Expect the count to
  move by one or two between resolutions; the depth is more reliable.
- **Panels are identical.** Real skirts have different front and back panels, and
  the waist dart intake differs between them. This generator makes `n` of one
  shape.
- **No waistband, no hem allowance, no seam finish** — the pattern is the panels
  and nothing else.
- **Nothing is cut and sewn.** The hem length conservation and the fold counts are
  internally consistent; they have not been checked against cloth on a form.
