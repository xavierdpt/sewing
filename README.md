# Triangulated Garment System

A design study and software plan for building garments out of a small library of
standard triangles (the 3-4-5 right triangle, isoceles and equilateral triangles)
that are joined reversibly, fitted on a real body, and only then converted into a
conventional sewing pattern.

The motivating problem: **commercial patterns encode an average body.** For a body
that is asymmetric, differently proportioned, post-surgical, pregnant, wheelchair-
seated, or simply not near the size chart, grading a standard pattern is the wrong
starting point. A reconfigurable physical tiling is a *measuring instrument* — you
build the surface on the body, read the geometry off it, and derive the pattern from
what you measured rather than from a table.

## Documents

| File | Contents |
|---|---|
| [docs/01-geometry.md](docs/01-geometry.md) | The mathematics. Why these triangles, the angle-closure result, Gaussian curvature and darts, why bodices want triangles and skirts want quads, resolution and seam-allowance economics, the hard limits. |
| [docs/02-joining.md](docs/02-joining.md) | Twenty joining techniques scored against eleven criteria. Why hook-and-loop is the wrong default, what to use instead at each stage, and the "elastic mesh" idea done properly. |
| [docs/03-prior-art.md](docs/03-prior-art.md) | What has been attempted: Nervous System's Kinematics, Refashion (2025), Issey Miyake's 132 5. and A-POC, zero-waste cutting, kirigami shape-programming, embroidered Langer lines, computational pattern making, architectural panelization. |
| [docs/04-software.md](docs/04-software.md) | Concrete architecture for the 3D test program. Stack recommendation, the five layers, the tile-snapping solver written out, XPBD seam model, export pipeline, 12-week build order. |
| [docs/05-physical-kit.md](docs/05-physical-kit.md) | A buildable first kit: materials, tile sizes, counts, cost, the fitting session protocol, and the coarsening step that turns 200 triangles into 9 sewable panels. |
| [docs/06-open-questions.md](docs/06-open-questions.md) | What I am not sure about, the experiments that would settle it, and the failure modes to watch for. |
| [docs/07-sources.md](docs/07-sources.md) | Annotated bibliography with links. |
| [docs/09-pattern.md](docs/09-pattern.md) | **Shell to printable pattern**, **trying a pattern on**, and **the pattern file format**. Why blobby panels cannot be flattened and gores can; the exact unfold; sewing a pattern onto a body it was *not* drafted for, and reading the fit. |
| [docs/10-body.md](docs/10-body.md) | **The body, from tape measurements** — the full parameter set, what solves exactly, arms and shoulders as jointed capsules, the found armscye, and the predefined poses. |
| [docs/11-cloth.md](docs/11-cloth.md) | **Fabric physics, and the drop test** — XPBD cloth with real mass, air drag and friction; why fabric does not bounce; the signed distance field that made contact work at all; and the hollow-disc experiment that finds the yoke/slip boundary on its own. |
| [docs/12-flare.md](docs/12-flare.md) | **Flare, gathers, and how the pieces go together** — more cloth at the hem than the waist; the circle-skirt family by the fraction of a circle it spans; how shared vertex ids make four panels one mesh with no seam code; and how to edit a pattern. |
| [docs/13-assembly.md](docs/13-assembly.md) | **Arrange, stitch, drop** — lay the pattern pieces around the body, pull the seams together with gravity off, then weld and let it fall. Why that beats placing the finished garment, and why it works for any number of pieces of any shape. |
| [docs/14-editing.md](docs/14-editing.md) | **Editing the pattern** — taking a wedge out and letting a wedge in, the two operations most of pattern making is made of; why a dart is a seam inside a piece; and the cutting table, a 2D editor inside the 3D scene. |
| [docs/08-local-toolchain.md](docs/08-local-toolchain.md) | What is actually installable on this machine: `colmap` for photogrammetry, what is missing, and the pictures-to-mesh pipeline for a duct-tape dress form. |

## The code

A working prototype is in [`app/`](app/) — a 3D viewer, a static, physics-free engine
that joins library tiles by *relation* and settles the resulting shell onto a bodice,
and an XPBD cloth simulation for the questions that a static solver cannot answer.

```bash
cd app && python3 -m http.server 8777     # then open http://127.0.0.1:8777/
node test/run.mjs                          # headless checks of the whole pipeline
node tools/sweep.mjs                       # module size vs seam length vs fit
node tools/ease_sweep.mjs                  # how much ease chord sag forces on you
node tools/make_pattern.mjs                # -> out/pattern.svg, a printable 8-gore pattern
node tools/try_pattern.mjs                 # draft for one body, try it on thirteen others
node tools/poses.mjs                       # range of motion: one pattern, six poses
node tools/drop_disc.mjs                   # drop a hollow disc on the body: yoke, or on the floor?
node tools/drop_disc.mjs sweep             # the yoke/slip boundary, found by the physics
node tools/drop_disc.mjs fabrics           # the same disc in seven real fabrics
node tools/skirt.mjs                       # a 4-panel flared skirt: assembly, then drape
node tools/skirt.mjs sweep                 # tube to full circle, and gathers, against folds
node tools/skirt.mjs svg                   # -> out/skirt-pattern.svg, four panels on 140 cm cloth
node tools/assemble.mjs                    # arrange the pieces, stitch them, then drop it
node tools/assemble.mjs compare            # arranged-and-stitched vs placed on its cone
node tools/assemble.mjs waistband          # with a waistband, and without
```

**T** puts the pieces on a cutting table beside the body, flat and at true
scale, where you can take a dart out or let a godet in and watch what it does to
the garment. A 20 degree dart removes exactly 20 degrees of angle defect, which
is the whole mechanism by which flat cloth is made to fit a body. See
[docs/14-editing.md](docs/14-editing.md).

**J** lays the pattern pieces out around the body, pulls the seams together with
gravity off, then welds them and lets the garment fall — which is how it is
actually made, needs no closed-form placement, and works for any number of
pieces of any shape. See [docs/13-assembly.md](docs/13-assembly.md).

**K** drafts a flared or gathered skirt from two to eight panels, sews the pieces
into one mesh and hangs it from the waist, where it falls into folds — a full
circle skirt settles into eight flutes 20 cm deep, and the hem keeps the 424 cm it
was cut to within a centimetre. See [docs/12-flare.md](docs/12-flare.md).

In the viewer, **D** drops a hollow disc of cloth on the body and you watch it fall:
red where the cloth is being stretched past what was cut, blue where it has gone slack
and will fold. This is the only part of the system that is a *simulation* rather than a
static solver -- nothing is pinned and nothing is placed, so whether the disc becomes a
yoke or ends on the floor is decided by gravity, contact and friction. See
[docs/11-cloth.md](docs/11-cloth.md).

No build step, no `npm`: three.js is vendored and loaded through an import map.
Every geometry module is three.js-free so the whole pipeline runs under plain node,
which is what makes the claims in the documents checkable rather than asserted.

The bodice model is the **MakeHuman base mesh** (CC0, September 2020), cropped to a
torso band by `tools/prep_bodice.py`; the default body is a **parametric torso driven
by tape measurements**, including `shoulderDrop`, `lateralShift`, `bustAsym` and
`rotation`, because the premise is that standard bodies do not apply. Nothing
human-shaped exists in apt — only the Atlas *robot's* torso.

9. **A neckline that fits the neck is nowhere near the size that stays on it.** Dropped
   on a 36 cm neck, a hollow disc is held up by the shoulders until its hole passes
   about 80 cm round — a factor of more than two, and that factor is the whole design
   space of a yoke. The simulation is not told where the boundary is; it falls out of
   gravity, contact and friction (docs/11-cloth.md).

## The short version

1. **Yes, this is literally 3D mesh triangulation.** Your tile library turns it into
   *constrained* remeshing — the same problem architects solve when panelizing a
   freeform facade with a limited set of moulds. That literature is directly reusable.
2. **Triangles are right for bodices and wrong for skirts.** Bodices are doubly
   curved, which is exactly what angle defect at a vertex buys you. Skirts are
   developable (cones and cylinders) — a circle skirt has zero Gaussian curvature
   everywhere, so triangulating it adds seams and buys nothing. Worse, a fully
   triangulated closed surface is *rigid* (0 degrees of freedom); drape requires
   quadrilaterals, slits, or elastic edges. **Triangulate for structure, quadrangulate
   for flow.**
3. **Seam allowance, not geometry, is the binding constraint.** Overhead scales as
   perimeter×allowance ÷ area, i.e. as 1/size. At 3/4/5 cm the seams consume *more*
   fabric than the tiles. Either go big (≥8 cm edges) or use zero-allowance
   butt-joined tiles in a non-fraying material.
4. **Scratch (hook-and-loop) is a bad primary joint** — it needs overlap, has ±2 mm
   registration slop, and stiffens every edge, which destroys exactly the drape you
   are trying to study. Use it only for the throwaway first mock-up. The good
   reversible joints are: corner eyelets + jump rings (for a hinge mesh), snap tape
   (for a wearable prototype), lacing (for anything you want to *re-fit*), and
   single-thread chainstitch (for a seam that unravels completely when you pull one
   end).
5. **Triangulation should be a fitting tool, not a construction method.** Build in
   triangles, freeze the geometry, then merge near-coplanar tiles into large panels
   and convert the leftover angle defect into darts. The output is an ordinary
   sewing pattern that happens to be exactly right for one body.
6. **The ease you need is set by your tile size, not by comfort.** A flat tile sags
   `h²/(8R)` below the surface it spans, so at a 2 cm module you need ~2.5 cm of ease
   before the facets stop cutting into the bust — measured, not estimated. A close
   moulage therefore demands adaptive tile sizing: small at the bust and shoulder,
   large over the back.
7. **A panel only flattens without self-overlap if the curvature it *encloses* is
   near zero** — so darts cannot rescue a wide blobby panel, whose curvature is spread
   over dozens of vertices each too small to dart. A strip one cell wide has no
   interior vertices at all and flattens **exactly, with no darts**. That is what a
   gore is, and the gore count is then a free choice trading seams against how much of
   the body you capture (4 gores: 81 %, 8: 94 %, 12: 96 %).
8. **Build the software in TypeScript + three.js**, with the heavy geometry in a
   WebAssembly or Python side-car only if profiling demands it. Reuse
   [FreeSewing](https://freesewing.dev/) for the final pattern/SVG output and Blender's
   paper-model exporter as a day-one stand-in for your own unfolder.
