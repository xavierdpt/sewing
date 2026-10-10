# 02 — Joining and Un-joining

Recall the constraint from [01-geometry.md](01-geometry.md) §7: at any tile size that
does useful curvature work, conventional turned seam allowances are impossible — 140 %
fabric overhead at 3/4/5 cm, and twelve layers of fabric converging at a degree-6
vertex. So this is not a question of "which seam"; it is a question of **which
zero-allowance butt or corner joint**.

Second constraint, from §4: a triangulated shell is already rigid. Every join that
*stiffens an edge* makes it worse. The ideal join behaves as a **hinge**: strong in
tension along the seam, free in bending across it.

## Scoring

0 = useless, 5 = excellent. "Registration" is how precisely the joint locates the two
tiles — crucial here, because edge-length error compounds across a tiling.

| Technique | Shear | Peel | Low bulk | Registration | Reversible | Hinge-like | Washable | Tooling | Speed | Cost | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Hook & loop tape (scratch) | 4 | 2 | 1 | 1 | 5 | 1 | 4 | 5 | 4 | 3 | **poor primary, fine for mock-up** |
| 3M Dual Lock (mushroom) | 5 | 4 | 0 | 3 | 4 | 0 | 4 | 5 | 4 | 1 | niche |
| Snaps (KAM plastic) | 4 | 4 | 3 | **5** | 4 | 4 | 5 | 4 | 3 | 4 | **strong** |
| Snaps (metal prong/ring) | 5 | 5 | 3 | 5 | 4 | 4 | 5 | 3 | 3 | 3 | strong, heavier |
| Snap tape (by the metre) | 4 | 4 | 2 | 4 | 5 | 3 | 5 | 2 | **5** | 3 | **best wearable prototype** |
| Corner eyelets + jump rings | 3 | 3 | **5** | 4 | **5** | **5** | 5 | 4 | 4 | 4 | **best geometry kit** |
| Corner eyelets + elastic cord | 2 | 2 | 5 | 3 | 5 | 5 | 4 | 4 | 3 | 5 | **best conforming mesh** |
| Lacing through eyelets | 4 | 3 | 4 | 2* | 5 | 4 | 5 | 4 | 2 | 5 | **best for re-fitting** |
| Laser-cut tab & slot | 3 | 2 | **5** | **5** | **5** | 4 | 4 | 1** | 5 | **5** | **best if you have a laser** |
| Single-thread chainstitch | 5 | 5 | **5** | 4 | **5** | **5** | 3 | 4 | 3 | 5 | **best "unstitch in one pull"** |
| Hand/machine basting | 4 | 4 | 5 | 4 | 4 | 5 | 2 | 5 | 2 | 5 | classic, slow to remove |
| Butted zigzag / flatlock | **5** | 5 | **5** | 4 | 1 | **5** | 5 | 4 | 4 | 5 | **best permanent** |
| Sewing clips / fork pins | 2 | 1 | 3 | 3 | 5 | 4 | 0 | 5 | **5** | 5 | fitting session only |
| Safety pins | 2 | 2 | 2 | 2 | 5 | 4 | 0 | 5 | 4 | 5 | fitting session only |
| Brads / split pins | 3 | 3 | 4 | 4 | 3 | 4 | 3 | 5 | 4 | 5 | used by *Refashion* |
| Rivets / Chicago screws | 5 | 5 | 3 | 5 | 3*** | 3 | 5 | 3 | 2 | 3 | screws are reversible |
| Magnets (sewn-in discs) | 1 | 3 | 2 | 2 | 5 | 4 | 3 | 3 | 5 | 2 | too weak in shear |
| Fidlock magnetic hooks | 5 | 5 | 0 | 4 | 5 | 1 | 4 | 4 | 4 | 0 | strong, bulky, expensive |
| Zips (continuous coil tape) | **5** | 5 | 1 | **5** | 5 | 1 | 5 | 3 | 1 | 1 | great seam, terrible mesh |
| Buttons + buttonholes | 4 | 4 | 3 | 3 | 5 | 4 | 5 | 4 | 1 | 4 | McQuillan's *Hera* dress |
| Fusible / hot-melt seam tape | 4 | 3 | **5** | 3 | 0 | 4 | 4 | 3 | 4 | 4 | permanent, very low bulk |
| Double-sided basting tape | 1 | 1 | 5 | 3 | 2 | 5 | 0 | 5 | 4 | 4 | **you were right to reject it** |
| Printed-on TPU hinges | 4 | 4 | 4 | 5 | 1 | **5** | 4 | 2 | 1 | 4 | the Kinematics route, at home |

\* lacing registers *loosely by design* — that is its virtue, see below.
\*\* needs laser-cutter access, but then tooling cost per join is zero.
\*\*\* Chicago screws / binding screws unscrew; rivets do not.

## Why hook-and-loop is the wrong default

You named scratch first, so it deserves a straight answer: **it is the right tool for
exactly one stage and the wrong tool everywhere else.**

1. **It cannot butt-join.** Hook and loop needs the two pieces to *overlap* by the tape
   width. So a 60 mm tile edge joined with 20 mm tape has an effective edge of 40–60 mm
   depending on how you land it. In a tiling, that error is not local: it propagates.
   Edge length *is* the geometry, and velcro refuses to pin it down.
2. **Registration slop of ±2 mm** on a 60 mm edge is 3 % — and the errors do not
   cancel, they accumulate around a vertex loop. The closure rule of
   [01-geometry.md](01-geometry.md) §2 becomes unenforceable.
3. **It stiffens every edge.** Two tapes plus adhesive or stitching gives ~3 mm of
   near-rigid laminate along every seam. You have just welded the hinges of the one
   mechanism whose compliance you were trying to study. The shell becomes a plate
   structure.
4. Lint, pilling of the loop side, snagging on knits, and a hard scratchy surface
   against skin.
5. Peel strength is its weak axis, and a garment edge under body movement loads
   precisely in peel.

**Use it for:** the very first throwaway mock-up where you want to try 30 arrangements
in an hour and do not care about dimensional accuracy. Self-adhesive velcro dots on
card or craft foam triangles, exactly as the *Refashion* team used them for rapid
prototyping before switching to snaps.

## The four joins actually worth building around

### 1. Corner eyelets + jump rings — the geometry kit

Put a 4 mm eyelet in each corner of each tile, 6–8 mm in from the point. Join tiles by
threading a 6–8 mm jump ring (or split ring, or a short loop of beading wire, or a
small cable tie) through all the corner eyelets that meet at a vertex.

This is a **hinge mesh** — structurally it is chainmail, and it is what Nervous System
built digitally: tessellated triangular panels linked by hinges, rigid individually,
continuous in aggregate.

Why it is the best thing to build first:

- **Zero seam allowance, zero bulk.** The join adds nothing but a ring.
- **It implements the vertex, not the edge.** Your whole mathematics is about what
  happens at vertices (angle sums, closure, defect). This join makes the vertex a
  physical object you can add tiles to and remove tiles from, one at a time, while the
  shell is on the body.
- **Reconfiguration in seconds**, hundreds of cycles, no tool but a pair of pliers.
- **It is a perfect hinge.** Edges fold freely; the mesh can be flat-packed and will
  drape better than any edge-joined version.
- It makes the `B − 3` boundary degrees of freedom of §4 *visible* — you can feel the
  shell lock up as you close a region.

Cost: eyelets ~€0.02 each, rings ~€0.01, 3 eyelets per tile. For 165 tiles: ~500
eyelets, ~250 rings, under €20, plus an eyelet press (€15–40).

Downside: gaps at the edges (the tiles touch only at corners), so it is a *geometry
instrument*, not a garment. Which is fine — that is its job.

### 2. Snap tape — the wearable prototype

Sew-in snap tape (poppers pre-mounted on twill tape, sold by the metre for duvet covers
and babygrows) stitched along the tile edges once, then tiles snap to each other.
Alternatively set KAM size-20 plastic snaps directly, 3 per 60 mm edge, ~20 mm apart.

- **Registration is excellent** — a snap is a *point constraint*, which is exactly the
  right boundary condition, and it cannot creep the way velcro does.
- Reversible for a few hundred cycles, washable, cheap, hand-pliers tooling (KAM K3
  starter kit ≈ €25; a table press ≈ €60 is worth it past about 200 snaps).
- Snaps tear out of fabric before they fail themselves. **Always set them through a
  reinforced edge** — a folded hem, a bound edge, or a fused 15 mm disc of interfacing.
  Longer prongs (size 20 long, 5.6 mm+) for thicker stacks.

Budget: 165 tiles × 3 edges ÷ 2 shared × 3 snaps ≈ **750 snaps**. At €0.04 each that is
€30 of hardware and a long evening with a press. This is the realistic "I want to wear
it and wash it and still be able to take it apart" option.

### 3. Lacing — the re-fitting join

Eyelets along each edge (3–4 per 60 mm edge), joined by a continuous cord zig-zagged
between neighbours, corset-fashion.

The others fix edge length. Lacing makes edge length a **continuous variable you can
tune on the body**, which directly solves the quantisation limit of §10.5 — the shell no
longer comes in discrete sizes. Slack the laces over the bust, tighten at the waist,
and you are doing in a few seconds what a fitting normally takes three toiles to do.
Then measure the lace lengths and you have numbers to feed back into the model as
per-seam target lengths.

For an asymmetric body this is the single most useful join, because left and right can
simply be laced differently and the difference *is* the measurement you were trying to
capture. Corsetry has four centuries of accumulated practice here — spiral lacing,
ladder lacing, a waist tape as datum — and all of it applies.

Downside: slow, visually loud, bulky cord, and the laces bed in and need retensioning.

### 4. Single-thread chainstitch — the seam that unravels on purpose

Easily the most underrated answer to "join and un-join easily", and almost nobody
outside industry thinks of it. A **single-thread chainstitch** (ISO 101 class — the
stitch used to close rice and feed sacks, and on the chainstitched hems of selvedge
denim) is a real, strong, low-bulk seam that **completely unravels when you pull the
correct end of the thread.**

- Bulk: one thread. Nothing added. No hardware, no tape, no allowance.
- It is a perfect hinge; a butted zigzag chainstitch across two abutting edges gives
  tension strength along the seam and almost free bending across it.
- Un-joining a whole edge takes about one second.
- Hand equivalent: a crochet-hook chain through punched holes, or a simple hand
  chain-stitch; both unravel the same way.
- Caveat: it unravels if it snags in the wash, so it is a *prototype and fitting* seam,
  not a final one — but for a system whose entire purpose is reconfiguration, that is
  a feature. Backstitch or bartack the terminal end when you want it to stay.

Machines: a dedicated chainstitch machine is specialist, but a hand-crank chainstitch
"sack closer" is cheap, and the hand/crochet version needs no machine at all.

For the **final** garment, the matching permanent join is a **butted zigzag or flatlock
seam** — abutting edges, no allowance, zigzag or 3-thread flatlock across the join,
optionally over a strip of 10 mm bias tape or mesh underneath. This is standard practice
in neoprene (wetsuits), felt, and performance knits, it is flat, strong, low-bulk, and
it is what you should use once the geometry is frozen.

## Laser-cut tab and slot — the dark horse

If you have access to a laser cutter (many makerspaces, ~€10–20/hour), cut the triangles
from 2–3 mm wool felt or 2 mm neoprene **with interlocking tabs cut into the edges** —
dovetails, jigsaw nubs, or mortise-and-tenon slots.

- Zero added hardware, zero bulk, zero cost per join.
- Registration is **exact** — the geometry is in the cut file, so what you modelled is
  what you get.
- Reversible indefinitely; felt and neoprene are tough in that mode.
- Assembly is fast and genuinely pleasant, and the tiles are self-labelling if you
  engrave the tile ID and edge numbers (do this — see
  [04-software.md](04-software.md) §6).
- The cut edge is sealed by the laser, so the "non-fraying material" requirement of
  §7 is satisfied automatically.

The conceptual precedents are cardboard construction kits and FlatFab-style
slot-together fabrication. This is probably the highest-value single move in the whole
project if a laser is available to you, because it collapses materials, edge finishing,
registration, labelling and reversibility into one operation.

## The "elastic mesh wire" idea — three real versions

Your instinct here is good, and it splits into three genuinely different systems.

### (a) Elastic cord through corner eyelets

Replace the jump rings of §1 with 1.5–2 mm shock cord threaded as a continuous net.
The mesh becomes **self-tensioning**: it pulls itself onto the body and the tiles find
their own equilibrium angles. Tiles can shift slightly, so it is a worse *measuring*
instrument than rings, but a much better *garment* — it conforms, it accommodates
breathing and movement, and it is forgiving of the curvature quantisation error of
§9. Think of it as adding a soft spring to every edge, which converts the rigid
`DOF = B − 3` framework into a compliant mechanism.

### (b) Armature wire along the edges — the shape-retaining gauge

Run 1–1.6 mm millinery or aluminium armature wire along tile edges (in a narrow casing,
or simply through the corner eyelets). Now the shell is **plastically deformable and
shape-retaining**: you mould it on the body, take it off, and it holds the shape. It is
a three-dimensional contour gauge.

This is a different and, for your stated goal, possibly better instrument than any
fabric mock-up: it stays put while you photograph it, measure it, scan it, and compare
it to the model. A padded duct-tape body double does the same job but is a one-shot,
non-adjustable, slightly-too-big artefact; a wire mesh shell is reusable and adjustable.
Combine the two: make the duct-tape form *first* as a stable mannequin, then develop the
wire-triangle shell on the form rather than on yourself, which solves the "you cannot
fit your own back" problem.

### (c) Embroidered elastic tessellation — the state of the art

The most elegant realisation of "elastic mesh" is not hardware at all. A 2025 *Advanced
Materials* paper from the University of Tartu embroiders **triangularly tiled zigzag
patterns of inextensible thread onto stretch fabric**, in a single machine pass, with
knots formed automatically where springs meet. The zigzag stores slack, so each "fibrous
spring" has a programmed extension limit; tiling them produces *directional, graded*
stiffness at sub-centimetre resolution — mimicking the Langer lines of skin. They encode
direction, directional contrast and magnitude as hue/saturation/value for design, and
report 85 % fidelity on the transition from matrix-defined to fibre-defined behaviour.

Why this matters for you: it is your triangulated mesh, made **continuous, launderable,
soft, zero-bulk, and manufacturable on a domestic embroidery machine** (a Brother
PE-series or similar, ~€400 used), with elasticity as a designed field rather than an
accident. If the project's ambition is "an elastic triangulated garment", this is the
technique to copy, and it is recent enough that very little has been built on it.

A cheaper first experiment in the same direction: stitch the triangle edge network onto
power mesh or swimwear knit with a narrow zigzag using ordinary polyester thread, then
test how much the tiling restricts stretch in each direction.

## Recommended progression

| Stage | Purpose | Material | Join |
|---|---|---|---|
| 0 | Body double | duct tape over a close T-shirt, polyfill, hanger+tube core | tape |
| 1 | Geometry play, 30 arrangements/hour | 3 mm craft foam or card triangles | self-adhesive velcro dots |
| 2 | **The instrument** — measure the body | 2–3 mm wool felt, laser or die cut | corner eyelets + jump rings (+ wire if you want it shape-retaining) |
| 3 | Re-fittable toile | calico / felt tiles | lacing, or clips during the session then chainstitch |
| 4 | Wearable, washable, demountable | felt / neoprene / coated nylon | snap tape or KAM snaps |
| 5 | Frozen geometry, final garment | real fabric, **coarsened panels** ([01](01-geometry.md) §8) | butted zigzag/flatlock, or conventional seams on the merged panels |
| 6 | Soft/elastic variant | power mesh + embroidered tessellation | machine embroidery, no fasteners at all |

The important discipline: **stages 2–3 are measurement, stage 5 is the garment.** Do not
try to make the triangulated object be the finished clothing unless faceting is the
aesthetic you want. If it *is* the aesthetic you want, go to stage 4 with laser-cut felt
and tab-and-slot joins, accept the rigidity, and design a structured bodice rather than
a flowing dress.
