# 01 — The Geometry

> **Superseded, 2026-11-26.** This document describes the project's initial idea — a
> garment assembled from a library of standard triangles — and **the project has
> deviated from it**, per the user. It is kept as history, and as the reason the
> repository is called a triangulated garment system; it is not a description of what
> the software does. The current line is cloth pattern pieces drafted, edited on the
> cutting table, sewn and draped: [13-assembly.md](13-assembly.md),
> [14-editing.md](14-editing.md), [16-solvers.md](16-solvers.md). Nothing below has
> been re-measured against the current code.

## 1. The tile library

Start from the 3-4-5 right triangle. Let

- `α = arctan(3/4) = 36.8699°`
- `β = arctan(4/3) = 53.1301°`
- `γ = 90°`, and `α + β = 90°` exactly.

Pick a module `u` (I will argue for `u = 2 cm` later) so edges are `3u, 4u, 5u`.
Everything else in the library is built to share those edge lengths, which is what
makes tiles interchangeable:

| Tile | Sides (×u) | Angles | Area (×u²) | Note |
|---|---|---|---|---|
| Right | 3, 4, 5 | 36.87, 53.13, 90 | 6.00 | the generator |
| Right (scaled) | 6, 8, 10 | same | 24.0 | coarse regions |
| Equilateral E3 | 3, 3, 3 | 60, 60, 60 | 3.90 | |
| Equilateral E4 | 4, 4, 4 | 60, 60, 60 | 6.93 | |
| Equilateral E5 | 5, 5, 5 | 60, 60, 60 | 10.8 | |
| Isoceles I(3,3,4) | 3, 3, 4 | 48.19, 48.19, 83.62 | 4.47 | |
| Isoceles I(4,4,3) | 4, 4, 3 | 67.98, 67.98, 44.05 | 5.56 | |
| Isoceles I(5,5,3) | 5, 5, 3 | 72.54, 72.54, 34.92 | 7.15 | |
| Isoceles I(5,5,4) | 5, 5, 4 | 66.42, 66.42, 47.16 | 9.17 | |
| Isoceles I(5,5,6) | 5, 5, 6 | 53.13, 53.13, 73.74 | 12.0 | = two 3-4-5 joined on the 4-side |
| Isoceles I(5,5,8) | 5, 5, 8 | 36.87, 36.87, 106.26 | 12.0 | = two 3-4-5 joined on the 3-side |
| Isoceles I(4,4,5) | 4, 4, 5 | 51.32, 51.32, 77.36 | 6.25 | |
| Isoceles I(3,3,5) | 3, 3, 5 | 33.56, 33.56, 112.89 | 4.15 | |

Two observations worth keeping:

- The last two isoceles tiles are **compositions** of the 3-4-5, so the library is
  internally consistent: `I(5,5,6)` is a 3-4-5 mirrored across its short leg, and
  `I(5,5,8)` across its long leg. Two 3-4-5s on the hypotenuse give a 3×4 rectangle.
  A coarsening pass in software can therefore always dissolve pairs back into larger
  faces (see §7).
- Every angle in the 3-4-5-derived part of the library is an integer combination
  `mα + nβ`. The equilaterals are the only outsiders, contributing 60°.

## 2. Angle closure: which vertices can be flat

This is the first non-obvious result, and it constrains the whole system.

A vertex where the surface is locally flat requires the incident face angles to sum
to exactly 360°. Ask: which multisets of library angles do that?

`arctan(3/4)` is **not** a rational multiple of π. (Standard argument: a rational
multiple of π would make `(4+3i)/5` a root of unity; it is not, since its minimal
polynomial over ℚ is not cyclotomic. Equivalently, Niven's theorem rules out the
corresponding cosine value.) So β is not a rational multiple of 90°.

Suppose a vertex uses `a` copies of α, `b` copies of β, `c` right angles, and `d`
copies of 60°. Substituting `α = 90° − β`:

```
aα + bβ + 90c + 60d = 360
(90a − aβ) + bβ + 90c + 60d = 360
(b − a)β  =  360 − 90a − 90c − 60d
```

The right-hand side is a rational multiple of 90°; the left is irrational unless
`b = a`. Therefore:

> **Closure rule.** `b = a`, and `90a + 90c + 60d = 360`, i.e.
> **`3(a + c) + 2d = 12`.**

(This is verified computationally in `test/run.mjs`, which enumerates all 89 flat-vertex
multisets of degree ≤ 8 available to the library and confirms that **none** of the pure
3-4-5 ones uses the two acute angles in unequal numbers.)

Enumerating all flat vertices available to this library:

| a = b | c (90°) | d (60°) | Degree (faces at vertex) | Example |
|---|---|---|---|---|
| 0 | 4 | 0 | 4 | four right angles — a flat square grid of 3-4-5s |
| 1 | 3 | 0 | 5 | one acute pair + three right angles |
| 2 | 2 | 0 | 6 | two acute pairs + two right angles |
| 3 | 1 | 0 | 7 | |
| 4 | 0 | 0 | 8 | all acute, in matched pairs |
| 0 | 2 | 3 | 5 | two right angles + three equilaterals |
| 1 | 1 | 3 | 6 | |
| 2 | 0 | 3 | 7 | |
| 0 | 0 | 6 | 6 | six equilaterals — the classic flat triangular lattice |

Read practically: **the acute angles of the 3-4-5 must be used in matched pairs around
any flat vertex.** That is a hard combinatorial rule your solver can exploit as a
constraint, and it is also a nice physical rule a human can follow at the table: every
time you put a "36.87 corner" into a vertex you owe it a "53.13 corner".

Generalised to the whole 3-4-5-derived family (where each tile corner contributes some
`mα + nβ`): **the total α-multiplicity around a vertex must equal the total
β-multiplicity**, and then `(that common value) + (number of right angles) + ⅔·(number
of 60° corners) = 4`.

## 3. Curvature is the point of the whole exercise

For a triangulated surface the **angle defect** at an interior vertex v is

```
K(v) = 2π − Σ θᵢ
```

and this is *exactly* the integrated Gaussian curvature there (not an approximation —
it is the discrete definition, and it satisfies a discrete Gauss–Bonnet theorem). So:

- `K > 0` (angles sum to **less** than 360°): a **dome**. Bust apex, shoulder cap,
  shoulder blade, buttock, belly, elbow, knee.
- `K = 0`: **developable**. Cylinders, cones, anything you can roll a flat sheet into.
- `K < 0` (angles sum to **more** than 360°): a **saddle**. The side seam at the waist
  between ribcage and hip, the hollow under the arm, the small of the back, the
  inside of the shoulder near the neck, and the flare of a trumpet skirt.

A dart is nothing but a device for removing angle at a vertex. Triangulation makes the
bookkeeping explicit: **positive curvature is created by using fewer / narrower
corners at a vertex, negative curvature by inserting an extra triangle.**

Discrete Gauss–Bonnet ties it together. For a surface patch,

```
Σ_interior K(v)  +  Σ_boundary (π − θ_boundary)  =  2π·χ
```

with χ the Euler characteristic. Consequences you can use:

- A **tube** (skirt, sleeve, bodice ignoring armholes) has χ = 0, so the *total*
  interior curvature plus boundary turning must be zero. A cylinder achieves it with
  everything zero. A cone achieves it with all the action at the boundary.
- A **bodice** with neck hole, waist hole and two armholes is a sphere with four holes:
  χ = 2 − 4 = −2, so interior curvature plus boundary turning totals −4π. There is a
  large *negative* budget, which is why underarm and waist saddles dominate a bodice
  and why a tightly fitted bodice fights you.
- A **bust cap** of half-angle θ on a sphere carries total curvature `2π(1 − cos θ)`.
  At θ = 30° that is 0.84 rad ≈ **48°** — which agrees nicely with real practice,
  where a bust is typically shaped by a side dart plus a waist dart of roughly 20–30°
  each. The maths is not telling you anything a patternmaker does not know; it is
  telling you the same thing in a form a computer can optimise.

### Fabric is not paper

One correction to all of the above. A woven fabric is not an isometric sheet: the warp
and weft can **shear** (trellis) by roughly 15–25° before locking. That shear absorbs
Gaussian curvature for free. It is why a bias-cut panel moulds to a hip with no darts
at all, and why a good cutter needs fewer seams than a naive algorithm would propose.

So the honest statement of the problem is: *triangulation discretises the curvature
that fabric's own shear compliance cannot absorb.* Any solver that ignores shear will
over-segment. Budget around 10–15° of defect per 10 cm patch as "free", and only spend
tiles on the remainder. Knits absorb far more and need far fewer tiles; stiff
non-fraying materials (felt, neoprene, Tyvek, coated canvas) absorb almost none and are
where triangulation earns its keep.

## 4. Rigidity: why triangles and skirts are a bad match

Treat the mesh as a bar-and-joint framework: vertices are ball joints, edges are rigid
bars (a sewn seam resists stretch along its length rather well).

For a **triangulated disc** with V vertices of which B are on the boundary, Euler's
formula and the face-edge count give `E = 3V − B − 3`, so

```
DOF = 3V − E − 6 = B − 3
```

All the freedom lives on the boundary. The interior is **locked**. For a closed
triangulated surface (`E = 3V − 6`) you get `DOF = 0` — Cauchy's rigidity theorem in
its engineering dress.

For a **quadrilateral** mesh disc, the same accounting gives `E = 2V − 2 − B/2` and

```
DOF = 3V − E − 6 = V + B/2 − 4
```

which grows linearly in the number of vertices: roughly **one degree of freedom per
quad**.

> **Triangulate for structure. Quadrangulate for drape.**

This single inequality answers most of your question about skirts and dresses:

- A **fitted bodice, corset, jacket shell, bra cup, structured bustier, armour,
  hat, shoe upper**: you *want* rigidity. Triangles are correct and excellent.
- A **skirt, a flowing dress, a sleeve head you want to ease, anything whose
  appearance is its folds**: you want 1 DOF per cell. Triangles destroy exactly the
  property you are designing for. A fully triangulated circle skirt will hang like a
  lampshade.
- Bias cut is the traditional craft answer to the same equation: a woven on the bias
  *is* a quad mesh with one shear DOF per cell.

Mitigations if you want triangles in a flowing region anyway: leave some edges
unjoined (slits), join only at corners rather than along full edges (a hinge mesh —
see [02-joining.md](02-joining.md) §Jump rings), or make a fraction of edges elastic.
Each of these is a way of putting DOF back.

## 5. Can triangulation do skirts?

Taking the cases honestly, one at a time.

**Full / half / quarter circle skirt.** This is an annulus (or sector) in the plane.
`K = 0` everywhere, including at the waist and hem; all the flare is *boundary*
geodesic curvature. You can tile it with the library — the closure rule above gives you
plenty of flat vertices — and you will have achieved nothing except adding ~20 m of
seams to a shape you could have cut with a piece of string and a pencil. The classical
construction (waist radius `r = C/2π` for a full circle, `C/π` for a half circle) is
already optimal. **Verdict: no.**

**Gored / panelled skirt (4, 6, 8, 12, 16 gores).** Each gore is a developable cone
patch. Again `K = 0` in the interior. Gores exist to control grain direction, fabric
economy and the *hem-to-waist ratio*, not curvature. Triangulating a gore is pure
overhead. The one thing worth stealing from the gored tradition: panel count is a
design knob (2, 3, 4, 6, 8, 12, 16), and bias stretch means you remove roughly
0.5–1 cm per panel at the waist depending on count — an empirical correction your
software should expose as a per-seam "take-up" parameter, because it is exactly the
kind of thing geometry alone will get wrong.

**Trumpet / mermaid / fishtail / godet flare.** *Here triangles win.* The flare region
is genuinely hyperbolic: you need `Σθ > 360°` at vertices along a band. In conventional
drafting this is done by slashing and inserting godets — discrete, ad hoc, and hard to
grade. With a tile library it becomes continuous and controllable: seed one extra
equilateral per vertex along a ring and you have added a measured amount of negative
curvature. You can grade flare smoothly from nothing at the knee to extreme at the hem
by varying the insertion density. Hyperbolic crochet ruffles are the craft precedent and
they are *exactly* this construction. **Verdict: yes, and better than the traditional
method.**

**Peplum, ruffle, flounce, cowl, leaf-hem, tiered skirt.** Same as above — all negative
curvature, all well served.

**Yoke / hip region of a fitted skirt or trousers.** Positive curvature over the
buttock and hip spring, `K ≈ +20–40°` total. Triangles handle this correctly but a
single well-placed dart does the same job with one seam. **Verdict: triangles are
legitimate but not advantageous.**

**Dresses.** The practical answer is a hybrid, which is also how couture is built:

```
neck ─┐
      │  TRIANGULATED SHELL      (bodice, 3-4-5 + isoceles, rigid, measured on the body)
waist ─┤  ←── curvature bookkeeping is closed off at this seam
      │  DEVELOPABLE / QUAD SKIRT (cones, gores, bias quads; triangles only in flare bands)
hem  ─┘
```

The waist seam is a *curvature firewall*: above it you are solving a doubly-curved
fitting problem, below it you are solving a drape problem, and they want opposite
discretisations. Dropping the join to the high hip gives you the princess-line /
sheath variant; raising it gives empire.

## 6. Resolution: how big should the tiles be?

A flat triangle chord across a surface of radius of curvature `R` with edge length `h`
sags by about `h²/(8R)`. Inverting for an acceptable sag `δ`: `h ≈ √(8Rδ)`.

| Region | R (mm) | Tolerable sag δ | Max edge h |
|---|---|---|---|
| Bust apex, small cup | 60 | 1.0 mm | 22 mm |
| Bust apex, large cup | 110 | 1.0 mm | 30 mm |
| Shoulder cap | 70 | 1.5 mm | 29 mm |
| Shoulder blade | 150 | 2.0 mm | 49 mm |
| Waist / ribcage | 150 | 2.5 mm | 55 mm |
| Hip | 200 | 3.0 mm | 69 mm |
| Mid-back, flat panels | 400 | 4.0 mm | 113 mm |

**This formula has a consequence I did not anticipate until the code was running.** The
sag is not only a cosmetic faceting error — it is a *clearance* problem. A flat tile
spanning a curved region sinks `h²/(8R)` below the surface it spans, so unless the
wearing ease exceeds that sag, the tile faces cut into the body however well the
corners fit. Measured on the parametric torso at `u = 2 cm`
([`tools/ease_sweep.mjs`](../tools/ease_sweep.mjs)):

| ease | tiles whose faces cut into the body | deepest |
|---|---|---|
| 0.4 cm | 84 | 2.65 cm |
| 0.8 cm | 42 | 2.13 cm |
| 1.2 cm | 20 | 1.94 cm |
| 1.6 cm | 8 | 1.50 cm |
| 2.0 cm | 2 | 0.53 cm |
| **2.5 cm** | **0** | **0.00 cm** |

So **the ease is set by your tile size, not by comfort.** A moulage wants *zero* ease;
a 2 cm module forces 2.5 cm. The only way to have both a close fit and a manageable
tile count is **adaptive sizing** — small tiles at the bust and shoulder, large ones
over the back.

So an *adaptive* tiling is essential: ~25 mm edges at the bust and shoulder, 60–110 mm
over the back and midriff. This is precisely why the library needs the 3-4-5 at two
scales (`3u/4u/5u` and `6u/8u/10u`) and why `u = 1 cm` (fine) and `u = 2 cm` (coarse)
is the right pair of modules — the coarse tile is exactly four fine tiles in area, so
regions can be refined by subdivision without leaving the library.

Tile counts for a bodice shell. The parametric torso in `app/js/body.js` measures
**0.60 m²** from hip to neck, and the tiled shell comes out at 0.62–0.67 m² depending
on ease. The hand estimates below were made before the code existed; the **measured**
column is what `tools/sweep.mjs` actually produces.

| Module | Edges | Tile area | Tiles (est.) | **Tiles (measured)** | **Seam (measured)** |
|---|---|---|---|---|---|
| u = 1 cm | 3/4/5 cm | 6 cm² | ~660 | **836** | **56.6 m** |
| u = 1.5 cm | 4.5/6/7.5 cm | 13.5 cm² | ~290 | **390** | **38.5 m** |
| u = 2 cm | 6/8/10 cm | 24 cm² | ~165 | **198** | **27.4 m** |
| u = 2.5 cm | 7.5/10/12.5 cm | 37.5 cm² | ~105 | **144** | **23.4 m** |
| u = 3 cm | 9/12/15 cm | 54 cm² | ~75 | **84** | **17.2 m** |
| u = 4 cm | 12/16/20 cm | 96 cm² | ~42 | **60** | **14.9 m** |
| conventional | — | — | 6–9 panels | 6–9 | ~3 m |

The estimates were low by 20–40 % because they assumed a 0.4 m² shell; the shape of the
curve is right. **`u = 2 cm` is the knee**: below it the seam length explodes without
improving the fit much, above it the faceting gets coarse. See
[04-software.md](04-software.md) §6 for the full measured table including seam strain.

Nervous System's Kinematics dress, for calibration, used **2,279 panels and 3,316
hinges** — and was 3D printed as one piece precisely because no one was going to
assemble that by hand.

## 7. The economics of seam allowance — the real constraint

This is the finding that should shape the whole project.

For a tile scaled by `k` from 3-4-5 (edges `3k, 4k, 5k`), area is `6k²` and perimeter
is `12k`. With a seam allowance `s` on every edge, the fabric consumed by allowances
per tile is `12k·s`, so

```
overhead ratio = 12ks / 6k² = 2s / k
```

Overhead scales as **1/size**. Numerically, with `s = 0.7 cm`:

| Tile | Overhead | Verdict |
|---|---|---|
| 3/4/5 cm | **140 %** | the seams use more fabric than the garment |
| 6/8/10 cm | 70 % | absurd |
| 9/12/15 cm | 47 % | still absurd |
| 12/16/20 cm | 35 % | bad |
| 18/24/30 cm | 23 % | ≈ a normal pattern piece |
| conventional skirt panel (20×60 cm, s = 1.5) | 20 % | for reference |

And bulk is worse than waste. At a degree-6 vertex, six seams meet; with conventional
turned allowances that is **twelve layers of fabric converging on a point**. It cannot
be pressed, it will not lie flat, it will read as a lump through any fabric, and it
will wear through.

> **Therefore: conventional sewn-and-turned seams are incompatible with tiles small
> enough to do useful curvature work. The tiles must be butt-joined with zero
> allowance, in a material whose cut edge is already finished.**

That single conclusion drives the material choice (felt, needle-punched wool, neoprene,
Tyvek, PU/TPU-coated nylon, heat-sealed polyester, laser-cut and edge-fused synthetics)
and the joining choice ([02-joining.md](02-joining.md)): corner eyelets, snap tape,
lacing, butted zigzag, or bonded edge tape — not seam allowances.

It also means the honest production answer is §8.

## 8. Coarsening: triangulation as a measuring instrument

The resolution of the contradiction is to stop treating the triangulation as the
*garment* and treat it as the *measurement*.

```
1. Build / fit a reconfigurable triangle shell on the actual body.   ← small tiles, reversible joins
2. Freeze the geometry. Export the mesh.
3. Merge near-coplanar tiles into large polygonal panels.             ← dissolve interior edges
4. Convert the residual angle defect on each merged panel into darts.
5. Lay the panels flat (they are now piecewise developable by construction → ZERO stretch distortion).
6. Add real seam allowances, notches, grainlines.
7. Sew a conventional, 6–9 panel garment that happens to fit one body exactly.
```

Step 5 is the hidden prize, and it is worth stating clearly because it is the one place
triangulation beats every alternative on theory rather than convenience:

> A triangulated surface is **piecewise developable by construction**, so flattening it
> is exact. Conventional 3D-to-2D pattern flattening (LSCM, ABF, boundary-first
> flattening, energy-based methods) always trades angle distortion against area
> distortion because a smooth doubly-curved panel simply *has no* isometric
> development. A triangle mesh has no such error. All of the approximation has been
> moved somewhere visible and controllable — into faceting (§6) and into seam count.

Step 3 is a standard operation (variational shape approximation, planar region
segmentation, greedy coplanar face merging with a normal-deviation threshold). Step 4
is the inverse of the usual dart-closing manipulation. Both are implementable in a
weekend. See [04-software.md](04-software.md) §5.

## 9. This *is* 3D mesh triangulation — and here is the exact correspondence

| Your sewing problem | The graphics / geometry problem |
|---|---|
| Choosing tiles to approximate a body | Remeshing / surface approximation |
| A fixed library of triangle shapes | **Constrained** or fabrication-aware remeshing |
| Reusing the same few tile types to save cost | Architectural **panelization** (Eigensatz et al., SIGGRAPH 2010 — covering a freeform facade with a limited set of moulds; the cost model is literally "same mould for many panels") |
| Laying tiles flat to cut them | Mesh **parameterization** / unfolding (LSCM, ABF++, BFF) — but exact here, see §8 |
| The shell holds its shape | **Rigidity theory** (Cauchy, Alexandrov, Gluck, Connelly) |
| Fitting tiles to the body iteratively | **Local–global / projective dynamics** (ShapeUp), ADMM |
| Adapting tile size to curvature | Adaptive / curvature-driven remeshing |
| Cutting the shell into flat pieces to print | Papercraft **unfolding** (Pepakura, Blender's Export Paper Model) |
| Quantising curvature with a finite angle palette | **Dithering with error diffusion** — see below |
| Recovering a flat pattern from a draped 3D garment | Inverse garment modelling, differentiable draping, `GarmentCode` |

The dithering analogy deserves a sentence because it is the implementation key. Your
library offers a *finite palette of angle quanta*. An arbitrary curvature field cannot
be represented exactly, just as an arbitrary grey cannot be represented by black and
white pixels. The fix is the same: **error diffusion.** Assign each vertex the closest
achievable angle sum, carry the residual to neighbouring vertices, and let the error
average out over the surface instead of accumulating. A Floyd–Steinberg-flavoured sweep
over the vertex graph, interleaved with the geometric relaxation of
[04-software.md](04-software.md) §4, is likely to work far better than a global
integer program and is ten times easier to write.

## 10. Honest limits

1. **Seam count.** 19 m of seam for a 165-tile bodice at `u = 2 cm`, versus 3 m
   conventionally. Even at 90 seconds per edge that is 6 hours of assembly. This is the
   reason the method is a prototyping and fitting tool first.
2. **Faceting is visible.** 25 mm tiles over a bust with a 1 mm sag will read as
   faceted in a matte opaque material under raking light. That can be an aesthetic
   (Kinematics, Issey Miyake) but it is not neutral.
3. **Rigidity.** §4. The shell will not drape. Fine for a bodice, fatal for a skirt.
4. **The library quantises curvature.** You cannot hit arbitrary `K`; see §9 dithering.
5. **Edge-length quantisation also quantises size.** A shell built from `3u/4u/5u`
   tiles cannot have an arbitrary bust circumference — it comes in steps. Lacing or
   elastic edges are what restore continuous adjustment, which is another argument for
   those joins specifically.
6. **Point loads.** Every snap, eyelet or ring is a stress concentration. Fabric tears
   at fasteners, not between them. Reinforce every join site (fuse a 15 mm disc of
   interfacing, or use a material that does not propagate tears).
7. **Fabric's own shear** does much of the work for free (§3), so a mesh solver that
   treats fabric as paper will propose far more tiles than a human cutter needs. Model
   the shear.
8. **Asymmetry doubles the work** — but asymmetry is the whole point for an unusual
   body, so the software must never assume a mirror plane. See
   [05-physical-kit.md](05-physical-kit.md).
