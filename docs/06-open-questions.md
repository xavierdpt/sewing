# 06 — Open Questions and Failure Modes

Things I am not sure about, with the experiment that would settle each.

## 1. How much curvature does fabric shear absorb for free?

Everything in [01-geometry.md](01-geometry.md) treats tiles as rigid, but a woven shears
15–25° before locking, and that absorbs Gaussian curvature at no cost. This is why a
skilled cutter needs fewer seams than any algorithm proposes, and the current solver
almost certainly **over-segments**.

**Experiment.** Cut 10 cm squares of (a) quilting cotton, (b) a stable knit, (c) 2 mm
wool felt, (d) 4-way swimwear knit. Mould each over a 10 cm hemisphere and measure the
largest cap diameter it covers before wrinkling. Convert the covered cap to its
Gaussian curvature `2π(1 − cos θ)`. That number is the "free" angle defect per patch,
and it goes straight into the solver as a per-tile shear allowance.

Prediction: felt ≈ 5–10°, cotton ≈ 15°, knit ≈ 40°+. If cotton really gives 15° per
10 cm patch, the required tile count drops by roughly half.

## 2. Can the shell be reconstructed from its combinatorics alone?

You know every tile type and every adjacency. A triangulated surface with fixed edge
lengths and known topology has only `B − 3` degrees of freedom (boundary vertices). So
in principle the 3D shape is determined by the tiling plus a handful of measurements,
and you would not need photogrammetry at all — you could type in the adjacency list and
recover the body.

**Experiment.** Build a 30-tile patch over a known sphere, record only the adjacency
list and tile IDs, and try to recover the shape by minimising `Σ(|edge| − target)²`
from a random start. If it converges to the sphere, the whole scanning problem
disappears and the method becomes genuinely cheap. Watch for the flexible-polyhedron
failure case (Connelly) — rigidity is generic, not guaranteed.

This is the most interesting unbuilt idea in the project.

## 3. Is the library the right library?

Thirteen tiles was a guess, inherited from the premise. The real question is a
**rate–distortion** one: how much fit error does each additional tile type buy you?

**Experiment.** Run `tools/sweep.mjs` with `allow` restricted to subsets: {R345} alone,
{R345, E4}, {R345 + all isoceles}, the whole library. Plot settled strain against
library size. My guess is the curve is nearly flat past about six tiles, which would
mean you should cut **fewer types and more of each** — a much cheaper kit.

Counter-consideration from the architectural panelization literature: mould cost
dominates and reuse matters enormously. Your "mould cost" is the die or the laser file,
which is near zero, so you may be freer than they are.

## 4. Folding versus faceting

Issey Miyake's 132 5. is pure *folding*: isometric, developable, zero Gaussian
curvature, one piece of cloth, no seams. This project is *faceting*: curvature
concentrated at vertices, many pieces, many seams.

These are duals and nobody seems to have combined them. A hybrid — large developable
folded regions over the back and midriff, faceted tiles only where curvature is
genuinely positive (bust, shoulder) — would cut the seam count enormously. The
curvature-defect colouring already in the viewer tells you exactly which regions are
which: anything grey can be folded instead of tiled.

## 5. Should skirts be kirigami instead?

[01-geometry.md](01-geometry.md) §4 says triangulation gives rigidity and skirts need
drape. Kirigami — slits cut into a single sheet — produces the same negative curvature
*without* adding seams, keeps the sheet continuous, and leaves the shear DOF intact.
One laser pass, no joins.

**Experiment.** Cut a half-circle skirt in paper, then a second with a boundary-curved
kirigami slit pattern in the flare region, and compare hang. The *Nature Communications*
2022 boundary-curvature method gives you the inverse design.

## 6. Known defects in the current code

- **A tile or two inverts near the shoulder dome.** Visible as a dark facet in the
  viewer at the chest/shoulder transition. It is a genuine local fold where the
  quantised tiles cannot resolve the curvature at `vHi = 0.94`, not a rendering bug.
  Fix: adaptive refinement, or stop the shell at the armhole instead of closing a dome
  over the shoulders.
- **Greedy growth wanders.** `growOntoSurface()` holds edges to 0.4 % strain but has no
  global overlap test, so it will not reliably close a tube. It is for exploring local
  patches.
- **6 edge-length conflicts remain** at `u = 2 cm` after the consistent quantiser (down
  from 22). These are vertices where no library assignment satisfies all neighbours.
  Properly this is an integer program; the current three-phase heuristic gets most of
  the way.
- **`MeshSurface.point(u,v)` ray-casts over all triangles** — O(n) per call, fine for
  3,000 triangles and occasional seeding, too slow for a dense scan. Needs the BVH it
  does not have.
- **Signed distance uses the nearest triangle's normal**, which is wrong near thin
  features and sharp concavities (the armpit). A proper generalised winding number
  would fix it.
- **No self-collision.** Tiles can pass through each other. Nothing currently prevents
  it and nothing currently needs it, but a draping extension would.

## 7. Things that will bite you physically

1. **Fasteners are stress concentrators.** Fabric tears *at* the snap, not between
   snaps. Reinforce every join site.
2. **Error accumulates around vertex loops.** A ±2 mm registration slop on a 60 mm edge
   does not cancel as you go around a vertex; it compounds. This is the real reason
   hook-and-loop fails here and snaps succeed.
3. **Edge-length quantisation quantises size.** A shell from `3u/4u/5u` tiles cannot
   have an arbitrary bust girth — it comes in steps. Lacing is the fix.
4. **Weight.** 200 felt tiles plus 600 eyelets plus 300 rings is not light. Weigh a
   10-tile sample before committing to 200.
5. **The faceted look is not neutral.** 25 mm tiles over a bust read as faceted under
   raking light. Decide early whether that is the design or a defect.

## 8. The question I would answer first

**§1 — the shear experiment.** It is an afternoon with four fabric scraps and a bowl,
it needs no software, and its answer changes the required tile count by a factor of two
or more. Every other number in this project is downstream of it.
