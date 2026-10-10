# 03 — Has This Been Tried?

Yes, repeatedly, from several directions that mostly do not cite each other. Nobody
appears to have built exactly what you are describing — *a reusable physical kit of
standard triangles, joined reversibly, used as a fitting instrument for non-standard
bodies* — but every component of it exists somewhere.

## 1. Nervous System — Kinematics (2013–present)

The closest thing to your idea, done digitally.

- The **Kinematics Dress** (2014) is a structure of **2,279 unique triangular panels
  linked by 3,316 hinges**, 3D printed in nylon as a single piece, built directly from
  a body scan. Acquired by MoMA; a later version is in the Museum of Fine Arts, Boston.
- Each panel is rigid; *in aggregate they behave as a continuous fabric*, and the
  textile is deliberately **non-uniform** — rigidity, drape, flex, porosity and pattern
  are all varied across the garment. That is the single most important design idea in
  the whole project and it maps directly onto your tile library: vary tile size and
  type by region.
- Called "4D printing" because a folding algorithm compresses the model to fit the
  print volume and it unfurls when removed.
- **Kinematics Cloth** is a web app where you sketch and sculpt a garment in real time,
  choose the tessellation pattern, and build to your exact measurements, with
  parametric body modelling so designs adapt to any body shape.
- **Kinematic Petals** (2016) replaces flat triangles with imbricating shells —
  petals, feathers, scales — protruding from the underlying triangular framework.

**What to take:** the graded, non-uniform tessellation; the hinge-at-the-vertex
topology; and the fact that the hard part turned out to be fabrication, which they
solved by eliminating assembly entirely. **What they did not do:** make it reversible,
make it fabric, or use it as a fitting tool.

## 2. Refashion — Reconfigurable Garments via Modular Design (UIST 2025)

The closest thing to your idea, done physically. Panels are assembled from smaller
standardised modules with reversible connection interfaces allowing **no-sew
construction and reuse across garments**.

Directly relevant findings:

- They tested **adhesive Velcro dots for rapid prototyping** and **metal snap buttons**
  for the real thing — snap pins stamped on the module exterior, sockets hot-glued
  inside. Also **6 mm brads** pushed through module edges and bent open.
- That is exactly the progression recommended in [02-joining.md](02-joining.md): velcro
  to explore, snaps to wear.
- Their user study is the interesting part: participants built **maternity wear that
  expands through panel swaps**, and added peplums, hoods and detachable sleeves. The
  system's value showed up as *accommodating a changing body*, which is your premise.

arXiv:2510.11941, also in the ACM DL (10.1145/3746059.3747632).

## 3. Issey Miyake — 132 5. with Reality Lab (2010)

Each piece is cut from **a single sheet of fabric**, flat-packed, its surface crossed
with geometric fold lines. Developed with the computational origami researcher
**Professor Jun Mitani**, using an algorithm that generates 3D geometric forms foldable
down to 2D, then heat-pressed into shirts, skirts, trousers and dresses. The name
decodes as: 1 piece of cloth, 3 dimensions worn, 2 dimensions folded, 5 the act of
wearing it in space and time. Recycled PET polyester, ~80 % energy reduction.

**What to take:** geometry as the generator of the garment rather than a correction to
it; and the demonstration that a computational-geometry collaboration produces
something wearable and commercial. **The difference from your system:** 132 5. is
*folding* (isometric, developable, zero Gaussian curvature everywhere) where you are
*faceting* (non-zero curvature concentrated at vertices). They are complementary, not
competing — see [06-open-questions.md](06-open-questions.md) §4.

## 4. Issey Miyake / Dai Fujiwara — A-POC (1999–)

Yarn knitted or woven into fabric tubes with a cavity between layers, so a whole
garment emerges from a continuous bolt and the wearer cuts it out. Not triangulated,
but the same instinct: let the fabrication process encode the garment, not the pattern.

## 5. Zero-waste pattern cutting — Holly McQuillan and others

McQuillan is the most prominent researcher in zero-waste fashion design and explicitly
follows the line opened by Miyake and Fujiwara's A-POC. Relevant specifics:

- Her origami-derived **Hera dress** is pure geometric construction: two squares, a cut
  line through each, joined along the lines, with **buttons fixing the points into
  folds**. That is a reversible, geometric, button-jointed garment — a direct precedent
  for the button entry in [02-joining.md](02-joining.md).
- Her later work weaves garments to shape on a **digital jacquard loom**, making
  fully-fashioned weaving industrially plausible.
- Zero-waste practice cares about *tessellating the pattern pieces on the fabric*, which
  is the same packing problem your nesting/export step solves — and a triangle library
  tessellates perfectly, so your system is accidentally close to zero-waste by
  construction. Worth claiming.

## 6. Textile Encoding Inspired by Langer Lines (Advanced Materials, July 2025)

Zinatullin, Küüts, Aabloo and Must at the University of Tartu embroider **triangularly
tiled zigzag patterns of inextensible thread onto stretch fabric**, in a single machine
pass, the machine knotting each spring around the previously placed one so it cannot
unravel. Zigzags store slack, so each "fibrous spring" has a programmed extension
limit; tiling them encodes **directional, graded compliance at sub-centimetre
resolution**, mimicking the Langer lines of skin. They map directionality, directional
contrast and magnitude into HSV for design, and report 85 % fidelity on the
matrix-to-fibre transition. Demonstrated on restrictor bladder actuators and
feet-conforming shoes.

This is your "elastic mesh wire", realised better than wire: soft, launderable,
zero-bulk, made on a domestic embroidery machine, with elasticity as a designed field.
It is the newest and least-exploited idea in this whole list.

## 7. Kirigami and auxetic shape programming

A large physics/mechanics literature on making flat sheets take doubly-curved shapes by
cutting rather than seaming:

- **Boundary-curvature-guided kirigami** (*Nature Communications* 2022): programming the
  *curvature of the cut boundaries* rather than complex cut patterns lets a stretched
  sheet realise target 3D shapes with positive, negative and zero Gaussian curvature,
  with both forward and inverse design.
- **Lattice kirigami** (Castle et al.) and programmable kirigami: prescribed Gaussian
  curvature by conformally flattening the target mesh and tuning each unit cell's
  expansion so its stable state matches the required local stretch.
- **Body-conformable surfaces by kirigami cutting plus machine learning** (arXiv 2025) —
  explicitly about conforming sheets to bodies.

**Relation to your system:** kirigami is the *subtractive* dual of your *additive*
tiling. You add triangles to create negative curvature; kirigami cuts slits to do the
same. One laser-cutting operation, no joins at all, and the sheet stays one piece.
For a skirt — where [01-geometry.md](01-geometry.md) §4 says triangles destroy drape —
kirigami may simply be the better tool.

## 8. Computational pattern making (the academic mainstream)

A deep and directly reusable literature:

- **Computational Pattern Making from 3D Garment Models** (IGL, ETH Zurich) — segments a
  garment surface and flattens it into panels.
- **GarmentCode** (Korosteleva & Sorkine-Hornung, *ACM TOG* 42(6), 2023) — a
  domain-specific language applying object-oriented programming to garment
  construction, with hierarchical, interchangeable parameterised components and a
  configurator exposing design parameters and body measurements.
  [github.com/maria-korosteleva/GarmentCode](https://github.com/maria-korosteleva/GarmentCode).
  **GarmentCodeData** adds a dataset of 3D made-to-measure garments with patterns.
- **Inverse Garment and Pattern Modeling with a Differentiable Simulator** (*CGF* 2024) —
  recover the flat pattern that drapes into a given 3D shape.
- **Parsing Sewing Patterns into 3D Garments** (Berthouzoz et al., Columbia) — the
  classic on going the other way.
- Surface flattening: Lévy's **LSCM** least-squares conformal maps minimise angular
  distortion; energy-based fabric-deformation flattening updates the energy
  distribution from tensile and shear deformation to find the best 2D pattern; and
  there is work on **global seam-updating strategies** to escape local minima in cutting
  and flattening.
- **Developable approximation**: treat the garment as a developable surface, cut it into
  3D patches and flatten each. Developable triangle meshes capture both flattenability
  and the presence of straight ruling lines.

Note that these projects triangulate panels (often constrained Delaunay, guided by
predicted stitches) *as a computational substrate*. You are triangulating as the
*physical construction*. Different goal, same mathematics — which is why their code is
reusable to you and their conclusions are not.

## 9. Architectural panelization — the best-matched literature nobody in fashion cites

**Paneling Architectural Freeform Surfaces** (Eigensatz, Kilian, Schiftner, Mitra,
Pottmann, Pauly — SIGGRAPH 2010) solves your exact optimisation: approximate a freeform
design surface with panels from a **limited set of types**, because *mould cost
dominates and there is strong incentive to reuse the same mould for many panels*. They
search within controlled deviation from the design surface plus positional and normal
continuity tolerances, using a 6-dimensional metric space for fast inter-panel distance.

Swap "mould" for "triangle tile" and "facade" for "bodice" and the paper is about you.
If you implement one piece of published machinery, make it this one.

## 10. The craft tradition you should not skip

- **Moulage** — the Guerre-Lavigne (Paris) system: measure, calculate, draft a bodice
  that fits like a second skin with no ease, incorporating any of the infinite
  variations of the figure; the moulage then becomes the sloper, which becomes
  everything else.
- **Draped slopers are the most straightforward way to fit an asymmetrical body,
  because you drape both sides.** That sentence, from the fitting literature, is the
  whole argument for your project in one line.
- Couture houses have long kept **padded personal dress forms** mapping a client's body.
  The DIY version is the duct-tape body double: a close T-shirt, three layers of tape
  (horizontal, vertical, horizontal), cross-your-heart taping to define the bust, polyfill,
  a hanger and tube core.
- **Gored skirts and godets**: a gore is a panel, a godet is an inserted wedge adding
  volume at the hem. Panel counts of 2/3/4/6/8/12/16; subtract roughly 0.5 cm per panel
  at 12–16 panels, 0.75 cm at 4–8, 1 cm at 1–3, to compensate bias stretch. That
  empirical take-up table is exactly the kind of correction a pure-geometry solver gets
  wrong, and your software should expose it as a per-seam parameter.

## 11. Tools you can stand on

| Tool | What it gives you | Licence |
|---|---|---|
| [FreeSewing](https://freesewing.dev/) | **Parametric sewing patterns as JavaScript.** Patterns adapt to measurements — explicitly "more inclusive of different body types" than grading. Auto-layout, **auto seam-allowance offsetting**, paperless patterns, SVG render, runs in browser and node. | MIT (code), CC (patterns) |
| [Seamly2D](https://seamly2d.github.io/) | Qt pattern CAD, reusable scalable parametric patterns from custom measurements, PDF/SVG/PNG export, no fees | GPL |
| Valentina | The project Seamly2D forked from in 2017; current builds are subscription | mixed |
| GarmentCode | Programmatic parametric patterns + draping dataset | research |
| Blender + **Export Paper Model** add-on | Unfolds any mesh to a flat net as PDF or SVG, with seam marks and thickness compensation | GPL |
| [3dtoflat.com](https://3dtoflat.com/), PaperMaker | Browser unfolders, OBJ/STL in, PDF/SVG/DXF out with real-world sizing | free/commercial |
| CLO3D / Marvelous Designer | The industry standard for 3D garment simulation | commercial |

FreeSewing deserves emphasis: it is JavaScript, it is MIT, it drafts from measurements
rather than sizes, and **it already solves seam-allowance offsetting and pattern
layout** — the two tedious parts of your export step.
