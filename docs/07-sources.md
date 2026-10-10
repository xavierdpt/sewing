# 07 — Sources

Annotated. Grouped by how useful I found them.

## Essential — read these four

- **[Paneling Architectural Freeform Surfaces](http://graphics.stanford.edu/~niloy/research/paneling/paper_docs/panelization_sigg10_small.pdf)** — Eigensatz, Kilian, Schiftner, Mitra, Pottmann, Pauly, SIGGRAPH 2010. Approximating a freeform surface with panels drawn from a *limited set of types*, because mould reuse dominates cost. Your problem with the nouns changed. ([SIGGRAPH history page](https://history.siggraph.org/learning/paneling-architectural-freeform-surfaces-by-eigensatz-kilian-schiftner-mitra-pottmann-et-al/), [project page](https://www.architecturalgeometry.at/geom/ig/pottmann/oldpub/2010/panels/panels10.html))
- **[Refashion: Reconfigurable Garments via Modular Design](https://arxiv.org/pdf/2510.11941)** — arXiv 2510.11941, also [ACM DL](https://dl.acm.org/doi/10.1145/3746059.3747632). Standardised modules, reversible snap/velcro/brad interfaces, no-sew assembly, and a user study where people built maternity wear that expands by swapping panels.
- **[Kinematics](https://n-e-r-v-o-u-s.com/projects/kinematics/kinematics-link/)** — Nervous System. 2,279 triangular panels, 3,316 hinges, printed as one piece from a body scan. [Kinematics Cloth app](https://n-e-r-v-o-u-s.com/projects/albums/kinematics-cloth/) builds custom-fit tessellated garments to your measurements. [Kinematic Petals](https://www.designboom.com/design/nervous-system-kinematic-petals-3d-printed-dress-03-02-2016/).
- **[Textile Encoding Inspired by Langer Lines via Elastically Graded Embroidered Tessellations](https://pmc.ncbi.nlm.nih.gov/articles/PMC12447055/)** — Zinatullin et al., *Advanced Materials*, July 2025. Triangularly tiled zigzag embroidery of inextensible thread on stretch fabric, one machine pass, graded directional compliance at sub-cm resolution. ([Wiley](https://advanced.onlinelibrary.wiley.com/doi/10.1002/adma.202500959), [press summary](https://www.eurekalert.org/news-releases/1097461))

## Computational pattern making

- [GarmentCode: Programming Parametric Sewing Patterns](https://arxiv.org/pdf/2306.03642) — Korosteleva & Sorkine-Hornung, *ACM TOG* 42(6), 2023. A DSL for garment construction; [code](https://github.com/maria-korosteleva/GarmentCode).
- [GarmentCodeData](https://arxiv.org/html/2405.17609v3) — 3D made-to-measure garments with sewing patterns.
- [Computational Pattern Making from 3D Garment Models](https://igl.ethz.ch/projects/computational-patternmaking/computational-pattern-making-paper.pdf) — IGL ETH Zurich.
- [Inverse Garment and Pattern Modeling with a Differentiable Simulator](https://arxiv.org/pdf/2403.06841) — *CGF* 2024.
- [Parsing Sewing Patterns into 3D Garments](http://www.cs.columbia.edu/cg/pdfs/1372967728-clopat.pdf) — Berthouzoz, Garg et al.
- [Dress Anyone: Automatic Physically-Based Garment Pattern Refitting](https://arxiv.org/pdf/2405.19148).
- [Least Squares Conformal Maps](https://www.cs.jhu.edu/~misha/Fall09/Levy02.pdf) — Lévy et al. The standard flattening method; [libigl tutorial chapter 4](https://libigl.github.io/libigl-python-bindings/tut-chapter4/) has a working implementation in ~15 lines.

## Discrete differential geometry

- [Discrete Differential Geometry: An Applied Introduction](https://brickisland.net/ddg-web/lectures/DDG-DiscreteCurvatureI.pdf) — Crane. The angle-defect definition of Gaussian curvature, `K(p) = 2π − Σαᵢ`, and discrete Gauss–Bonnet. Chapter on discrete curvature is the one to read.
- [Lectures in Discrete Differential Geometry](https://www.cs.utexas.edu/~evouga/uploads/4/5/6/8/45689883/notes3.pdf) — Vouga.
- [dForms with Constant Discrete Gaussian Curvature](https://thinkshell.fr/wp-content/uploads/2019/10/AAG2020_22_Leduc.pdf) — Leduc, AAG 2020. Directly about making 3D forms from flat pieces with controlled curvature.

## Kirigami / shape programming

- [Boundary curvature guided programmable shape-morphing kirigami sheets](https://www.nature.com/articles/s41467-022-28187-x) — *Nat. Commun.* 2022. Forward and inverse design of 3D curved shapes by programming cut-boundary curvature.
- [Rapid Design and Fabrication of Body Conformable Surfaces with Kirigami Cutting and Machine Learning](https://arxiv.org/pdf/2511.13941).
- [Algorithmic Lattice Kirigami](https://arxiv.org/pdf/1503.07930) — Castle et al.

## Designers and craft

- [132 5. ISSEY MIYAKE](https://eu.isseymiyake.com/blogs/sembacreationspace/18094) — the Reality Lab line; algorithm with Jun Mitani folding 3D forms flat. Also [Design Observer](https://inventionofdesire.com/feature/132-5-issey-miyake/15558), [Cool Hunting](https://coolhunting.com/style/132-5-issey-miyake/), [V&A collection](https://collections.vam.ac.uk/item/O1315230).
- [A-POC](https://www.archiveddreams.com/a-poc-issey-miyakes-genius-technique-to-reduce-textile-waste) — Miyake & Dai Fujiwara.
- [Holly McQuillan](https://en.wikipedia.org/wiki/Holly_McQuillan) — zero-waste pattern cutting; the Hera dress is two squares with a cut line, joined, buttoned into folds. [Zero-waste Pattern Cutting](https://www.academia.edu/1736314/Zero_waste_Pattern_Cutting), [Zero Waste Systems Thinking: Multimorphic Textile-forms](https://www.researchgate.net/publication/346925707_Zero_Waste_Systems_Thinking_Multimorphic_Textile-forms).

## Fitting, moulage, drafting

- [Fitting a Moulage](https://clothhabit.com/fitting-moulage/) — Cloth Habit. What a moulage is, and the distinction from a sloper.
- [Patternmaking: Moulage + Sloper](https://sewpomona.com/patternmaking-moulage-sloper/) — the Guerre-Lavigne system; "infinite variations of shape the human figure can take".
- [Creating a Body Double](https://brooksann.com/creating-a-body-double/) — Brooks Ann Camper, bespoke fitting.
- [Learn to Fit with Your Sloper](https://www.threadsmagazine.com/project-guides/fit-and-sew-tops/fit-with-your-sloper) and [Sloper Solutions](https://www.threadsmagazine.com/2021/11/08/learn-all-about-sloper-solutions-for-a-perfect-fit) — Threads.
- [Close-Fit Duct-Tape Dress Form](https://www.threadsmagazine.com/2008/10/24/close-fit-duct-tape-dress-form) — Threads; and [Making a duct tape dressmaker's dummy, the right way](https://paulaobrien.com/making-a-duct-tape-dressmakers-dummy-the-right-way/); [5 DIY Dress Form Tutorials for Solo Fitting](https://katrinakaycreations.com/5-diy-dress-form-tutorials-solo-fitting/).
- [Conquer circle skirt patterns](https://www.theshapesoffabric.com/2019/04/21/conquer-circle-skirt-patterns/) and [Let's draft some panel-skirts](https://www.theshapesoffabric.com/2018/04/22/lets-draft-some-panel-skirts/) — The Shapes of Fabric. Panel counts and the per-panel bias take-up table.
- [How To Draft A Godet](https://www.thecreativecurator.com/how-to-draft-a-godet/) — gore vs godet.

## Tools

- [FreeSewing](https://freesewing.dev/) — MIT JavaScript parametric patterns; [npm](https://www.npmjs.com/package/@freesewing/core), [site](https://freesewing.eu/), [repo](https://codeberg.org/freesewing/freesewing). Auto-layout, auto seam-allowance offsetting, SVG, browser and node.
- [Seamly2D](https://www.linuxlinks.com/seamly2d-pattern-making/) — open-source pattern CAD, forked from [Valentina](https://en.wikipedia.org/wiki/Valentina_(software)) in 2017.
- [Export Paper Model (Blender add-on)](https://extensions.blender.org/add-ons/export-paper-model/) — mesh → flat net as PDF/SVG with seam marks and thickness compensation.
- [3D to Flat](https://3dtoflat.com/) — browser unfolder, OBJ/STL in, PDF/SVG/DXF out with real-world sizing.
- [MakeHuman base mesh](https://github.com/makehumancommunity/makehuman) — `makehuman/data/3dobjs/base.obj`, **CC0 since September 2020**. The body used in this project.
- [COLMAP](https://colmap.github.io/) — packaged as `colmap` 3.9.1; see [08-local-toolchain.md](08-local-toolchain.md).
- [BodyDigitizer](https://ar5iv.labs.arxiv.org/html/1710.01370) — open-source photogrammetry body scanner, up to 96 Raspberry Pi cameras, if you ever want the serious version.
- [Validation of Smartphone-Based Photogrammetric 3D Body Scanning](https://arxiv.org/pdf/2608.12827) — how well phone photogrammetry actually matches a commercial depth scanner.

## Cloth simulation, for later

- [cloth-sim](https://github.com/FurkanZhlp/cloth-sim) — real-time XPBD cloth in the browser: substepped solver, self-collision, tearing, WebGL2. 10–30 substeps per 1/60 s frame with one Gauss–Seidel sweep each.
- [Real-Time Cloth Simulation Using WebGPU](https://arxiv.org/pdf/2507.11794) — limits of high-resolution browser cloth.
- [An Extended Position Based Dynamics Method for Cloth Simulation](https://www.researchgate.net/publication/342208668_An_Extended_Position_Based_Dynamics_Method_for_Cloth_Simulation) — XPBD with compliance for controlled constraint softness.

## Hardware

- [KAM snaps tutorial](https://blog.treasurie.com/kam-snaps-tutorial/) and [a beginner's guide](https://plushaddictblog.co.uk/2021/05/08/a-beginners-guide-to-kam-snaps/) — size 20 is the default; put snaps on a hem or seam so they do not tear out; longer prongs for thicker stacks.
- [VELCRO Brand sew-on tape](https://www.velcro.com/products/for-fabrics/sew-on-tape/) — the vendor's own durability claims, for what they are worth.
