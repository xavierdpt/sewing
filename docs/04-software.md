# 04 — The Software

A working prototype is in [`../app/`](../app/). This document explains what is built,
why it is built that way, and what comes next.

## 1. Stack decision

**TypeScript/JavaScript + three.js, no build step.** Reasons, in order of weight:

1. The expensive part of this project is iteration on geometry, not frame rate. A
   browser with a REPL beats a C++ compile cycle every time.
2. Pattern output is 2D vector art, and the browser is natively good at SVG. You get
   printing, PDF and laser-cutter files for free.
3. [FreeSewing](https://freesewing.dev/) is MIT-licensed JavaScript that already does
   parametric drafting, **seam-allowance path offsetting** and pattern layout. Being in
   the same language means you can hand it your panels directly.
4. Sharing a fitting result with a person is a URL.

three.js over Babylon.js: three has the larger ecosystem of geometry-processing
examples and a smaller surface area. Babylon's built-in gizmos and inspector are nicer
but you do not need a scene editor here.

**When to reach for something else:** this held for the geometry and broke for
the physics. Contact resolution written here as a point query per vertex let
the body through the cloth, and no amount of tuning fixed it; drape now goes
over HTTP to a side-car running Blender's C solver (`sim/`, and
[16-solvers.md](16-solvers.md)). The rule that survives is narrower than the
original one: **geometry here, hard contact elsewhere.** Everything up to the
weld — drafting, arranging, sewing, welding, measuring — is still JavaScript
that runs under plain node, and the sewing stayed because it measurably beats
the ready-made alternative.

For geometry specifically, reach for C++ only if you need libigl or
geometry-central directly (for boundary-first flattening, intrinsic
triangulations, or a proper ARAP solver) and the JS ports are not good
enough. Note `libigl-dev` is **not** packaged for this machine —
see [08-local-toolchain.md](08-local-toolchain.md). A Python side-car using
`scipy` plus a hand-rolled LSCM is the cheaper escape hatch, and all the heavy parts
here are sparse linear algebra you can hand to `scipy.sparse.linalg`.

**No npm.** `npm` is not installed and node is 18. The app uses an **import map** with
three.js vendored into `app/vendor/three/`, so it is a static directory: no build, no
`node_modules`, no toolchain rot. Serve it with `python3 -m http.server`.

## 2. Layout

```
app/
  index.html            import map + HUD + key bindings
  package.json          only to declare { "type": "module" } for node
  vendor/three/         three.module.js, OrbitControls, lil-gui  (pinned 0.169.0)
  js/
    geom.js             vectors, Catmull-Rom, triangle trigonometry. No deps.
    tiles.js            the tile library; flat-vertex enumeration
    body.js             parametric measurement-driven body, and the only one
    assembly.js         THE JOINING ENGINE: vertices, tiles, edges, attach(), welding
    lattice.js          grid tiling, library quantisation, greedy growth
    relax.js            static constraint projection ("let it fall")
    sdf.js              signed distance field of the body
    cloth.js            XPBD: mass, gravity, friction, force-limited seams. BEING RETIRED
                        `bendScale` overrides bending.js's BEND_SCALE,
                        which is 1.8 since 2026-10-18, down from 30
                        (todos/18-validation.md 6.12)
    bending.js          the hinge stencils: a property of the mesh, not of a solver
    panels.js           shell -> flattenable panels
    patternio.js        the pattern file format, sew(), drape(), fitReport()
    patternedit.js      darts and spreads
    patternsvg.js       SVG pattern output, true scale, a view of the JSON
    formio.js           saving and loading the dress form
    fabricio.js         making, saving and loading a cloth. PHYSICAL fields
                        (gsm, Peirce bending length, strain limit, trellis
                        angle) with Blender's set derived, not authored --
                        the header says why, from todos/18-validation.md 6.12
    skirt.js            flared and gathered skirts
    skirtdarts.js       asymmetric darts on purpose: a symmetric garment hides mistakes
    testpieces.js       flat shapes whose drape is known in advance (the hollow disc)
    cantilever.js       the Peirce cantilever: bending length by bisecting
                        the free length to a 41.5 deg TIP, plus PUBLISHED_BEND.
                        Shared by tools/fabric.mjs, test/run.mjs and the
                        viewer's `tests > cantilever (Peirce)` -- the first
                        two used to have one each measuring different
                        quantities (docs/18 6.13)
    cusick.js           the Cusick drape test (BS 5058): DC on a 0-100 scale
                        where 100 is card -- the one number comparable with
                        a value a textile lab publishes. setupCusick /
                        measureCusick are split so the viewer and the tool
                        score with the same code; drapeTrace samples DC
                        against time, which is how the static equilibrium
                        was found
    droptest.js         let go of a piece of cloth in mid-air: the dynamic experiment
    assemble.js         arrange -> stitch -> weld
    arrange.js          STORED RIGID PLACEMENTS: the transform buttons
    clearance.js        how far the cloth is from the skin, everywhere
    drapejob.js         builds a side-car job; shared with node
    remote.js           posts the garment to the side-car
    telemetry.js        what the viewer tells the side-car about itself
    wasmcloth.js        src/sewcloth compiled to wasm, driven from the page
    wasmcloth.test.mjs  its own checks
    drapewasm.js        drape in the page: one solve, same shape as drapeRemote
    sewwasm.js          sew in the page: a frame at a time, deliberately not drapewasm
    table.js            the cutting table
    dockui.js           the menubar, its menus and its floating dialogs (docs/17)
    main.js             the only file that imports three.js
sim/                    THE DRAPE SIDE-CAR -- see docs/16-solvers.md
  server.py             stdlib HTTP: POST /drape, GET /health
  blender_drape.py      the job, run inside headless Blender
  drape.mjs             the same, driven from node
  cipc/                 C-IPC, built as a reference oracle, not integrated
    Codim-IPC/          submodule, branch ubuntu-24.04 (four build fixes)
    build_cipc.sh       configure and make
    fabrics.md          its MEASURED fabric parameters vs this project's
src/                    UNPACKED UPSTREAM SOURCE, not this project's code (rule 8)
  sewcloth/             the solver this project ships: Blender-derived, wasm
  blender-fork/         Blender's own source, and two builds of it
  seamly2d/             read for its pattern model
  asm-reference/
tools/
  trace.mjs             arrange -> sew -> weld -> drape, as numbers
  check_sidecar.mjs     round-trip a garment over HTTP
  drape_blender.mjs     this solver against Blender's, same metric. Its
                        fixture is sewn by OUR solver, so sewing changes move
                        Blender's column too; BEND_SCALE is pinned at that
                        step, other terms are not (todos/18-validation.md 6.15)
                        --fabric <name> | --all   sweep the presets by stiffness
                        --edges 1.5,3,4.5         sweep the mesh resolution
                        --no-collider             diagnostic: OURS drapes in
                                                  free air, Blender keeps the
                                                  body. Not a fair comparison
                        --settle <s>              settle budget; 6 is too few
                                                  at a fine mesh, and an
                                                  unsettled row is not a
                                                  measurement
  sew_blender.mjs       this project's sewing against Blender's
  to_blender.mjs        put the garment after W into Blender's own window
  make_pattern.mjs      draft a fitted bodice and write a printable SVG
  try_pattern.mjs       draft for one body, sew onto another, report the fit
  assemble.mjs          arrange, stitch, then drop the pieces
  skirt.mjs             flared and gathered panels, draped and printed
  darts.mjs             do a dart's two legs pair up as a sewer would pair them?
  edits.mjs             every cutting-table edit, and what each costs
  drop_disc.mjs         the drop test from the command line
  accordion.mjs         has the cloth thickness? fold a strip, drop it, measure
  fabric.mjs            what the fabrics in cloth.js actually DO, measured
                        (minutes per fabric; streams a line as each resolves)
                        --mesh-law  measured bending length against element
                                    size: the sweep that showed the excess is
                                    a plateau, not a clean function of edge/c
  shearnet.mjs          how much curvature fabric shear absorbs for free
  poses.mjs             range of motion: draft at rest, then make the body move
  skirt_poses.mjs       can you walk in it? can you sit down in it?
  wasmclip.mjs          where the body comes through when the VIEWER drapes it
  sweep.mjs             module size vs seam length vs fit
  ease_sweep.mjs        how much ease the chord sag forces on you
  drape_coefficient.mjs the Cusick drape test, per preset, against published
                        class bands (todos/18-validation.md Step 2)
                        --trace    DC against time, which is how the static
                                   equilibrium was found
                        --bend / --stretch / --sweeps   override one solver
                                   term at a time: the discriminators that
                                   narrowed the defect down to BEND_SCALE
                        --no-drag / --no-damping / --jitter   the three
                                   candidates these ruled out
                        --bend-scale <x>   test a BEND_SCALE other than the
                                   shipped 1.8
  profile.mjs           where the solver spends its time: ask V8, not a guess
  viewshot.py           drive the real page headlessly, as a PNG (docs/17)
test/
  run.mjs               headless checks of the entire pipeline -- THE GATE
  drape_wasm.mjs        the real garment in wasm: what it costs, and does it
                        stay out of the body
```

This tree had drifted by **26 files** before 2026-10-17 — eleven modules and
fifteen tools that existed and were not written down, including the whole wasm
path (`wasmcloth.js`, `drapewasm.js`, `sewwasm.js`) and `src/`. A map that is
missing a third of the territory is worse than no map, because it is read as
complete: rule 5 says to read this project's own documents before proposing a
direction, and that is only safe while they say what is there.

**The one architectural rule:** every geometry module is plain JavaScript with no
three.js import, so the whole pipeline runs under node. That now includes the
modules the side-car needs (`drapejob.js`, `clearance.js`), which is why they
live in `app/js` rather than in `sim/`: the browser has to fetch them, and the
headless checks have to exercise the same code the viewer does. `test/run.mjs` exercises the
tile library, the closure rule, the body, explicit joining, grid tiling,
relaxation, the settle loop, greedy growth and the exporters — with no browser. That
is what makes the geometry claims in [01-geometry.md](01-geometry.md) checkable rather
than asserted.

```
node test/run.mjs          # the whole pipeline, 259 assertions
node tools/trace.mjs       # arrange -> sew -> weld -> drape, as a table
python3 sim/server.py      # the drape side-car the viewer talks to
node tools/sweep.mjs       # module size trade-off table
node tools/ease_sweep.mjs
```

## 3. The body

No human torso mesh exists in the Debian/Ubuntu archive (`apt-file` turns up only the
**Atlas humanoid robot's** torso STLs), so the body is generated from measurements
rather than imported.

### Parametric (`body.js`) — the body

A stack of horizontal rings — hip, high hip, waist, underbust, bust, chest, shoulder,
neck — each a **superellipse** in the lateral/front-back plane, solved so its perimeter
matches the measured girth, lofted with Catmull-Rom, plus Gaussian bust apices and
asymmetry fields. Measured output: a 72 cm asked-for waist comes out at 72.2 cm.

This is the right body because the project's premise is that standard sizes do not
fit. It also carries the fields that matter for that premise and that no scan-driven
pipeline will give you as knobs:

```js
shoulderDrop  // one shoulder lower, in cm
lateralShift  // lateral spine deviation
bustAsym      // left/right cup difference
rotation      // shoulder-girdle rotation about the vertical
```

## 4. The joining engine (`assembly.js`)

This is the part you asked for: *specify the relation of the pieces, no physics.*

You never give a tile a position. You give it a **relation**:

```js
asm.attach(edge, 'R345', phiDeg, flip)
```

"take this boundary edge, attach tile `R345` with its matching-length side on that
edge, folded `phi` degrees out of the neighbouring tile's plane."

Because the tile's three side lengths are fixed, that determines the new vertex
exactly. The third vertex lies on a circle about the shared edge:

```
d  = |AB|
t  = (r1² − r2² + d²) / 2d          foot along the edge
h  = √(r1² − t²)                    radius of the circle
C  = A + t·ê + h·(cos φ · p̂₁ + sin φ · p̂₂)
```

with `p̂₁` chosen as the in-plane direction away from the neighbour's apex, so **φ = 0
means flat** (coplanar continuation) and φ is literally the fold angle. One tile, one
degree of freedom — which is the rigidity result of
[01-geometry.md](01-geometry.md) §4 made operational.

New vertices **weld** onto existing ones within `weldTol`. That is how the shell closes
up and how angle defect starts accumulating at a vertex, and it is the only place
exactness is traded away (measured: welding costs ≤ 3.5 % edge strain at
`weldTol = 0.25u`).

Diagnostics come free: `angleDefects()` returns `2π − Σθ` per interior vertex in
degrees, `edgeStrains()` the per-seam error, `stats()` everything including
`dof = 3V − E − 6`.

`attach()` is verified in the test suite to hold every edge at its exact library length
to 3·10⁻¹⁶ relative, at fold 0 and at fold 55°, and six flat equilaterals around one
vertex are verified to give **exactly zero angle defect**.

## 5. Tiling and fitting

> **Superseded, 2026-11-26.** The tile library this section snaps to was the project's
> initial idea and the project has deviated from it (see [01-geometry.md](01-geometry.md)).
> `buildGridShell()` itself is still live, but the pattern path calls it as a plain quad
> grid (`u: 1, cols: gores, rows: patternRows`) and the library tile it assigns to each
> triangle is incidental; the tile shell is reached only by the viewer's shell panel and
> its `R` key, not by the `J`/`W`/`X` workflow.

### The lattice trick

A quad of **4u × 3u split on its diagonal is exactly two 3-4-5 triangles**. So "tile the
bodice in 3-4-5s" means "lay a 4u × 3u grid over the body and split every cell", and
`buildGridShell()` does that: grid in `(u,v)`, pushed out to the ease offset, cells
split with alternating diagonals to keep vertex degrees near 6, each triangle assigned
the best-matching library tile over all 6 vertex correspondences.

Grid size comes from the **mean girth across the band**, not a mid slice — a bodice is
much wider at the bust than the waist and one slice mis-sizes the whole grid.

### Relaxation (`relax.js`) — static, no physics

Constraint projection, Gauss–Seidel, per iteration, in this order (the order matters
and getting it wrong cost me two rounds of debugging):

1. **gravity** — a small downward nudge. This is "let it fall onto the bodice": a
   quasi-static descent that the constraints resist. Deterministic, it settles rather
   than bouncing.
2. **attraction** — pull each corner toward the ease surface.
3. **face clearance** — sample inside each tile and lift the whole tile out if it cuts
   in. Needed because a flat tile sags `h²/(8R)` below the surface it spans, so a shell
   whose *corners* all clear the body can still have its *faces* buried in the bust.
4. **edge lengths**, several passes — late, because a tile that has been lifted must
   still be the exact shape it was cut as.
5. **non-penetration**, last and one-sided — so nothing after it can push a corner back
   inside the body.

### Quantisation and the settle loop

`quantize()` re-assigns every tile to the library member matching its current geometry.
Done naively, per-tile, neighbouring tiles disagree about how long their shared edge
should be: **22 conflicting edges, worst 4 cm**. The fix is a three-phase scheme —
(A) give every edge one target by snapping its length to the nearest library side, so
shared edges *cannot* disagree; (B) choose each tile to agree with its edges' targets,
with fit to the actual geometry as tie-break; (C) re-agree each target as the snapped
mean of what its tiles now want; repeat. **Conflicts drop to 6 at `u = 2 cm`.**

`settle()` alternates relax and quantize until the assignment stops changing — the
local/global loop, and the dithering scheme of [01-geometry.md](01-geometry.md) §9.
Typical convergence on the parametric torso:

```
round 0   strain 9.93%  fit 0.509 cm  reassigned 47
round 1   strain 7.97%  fit 0.517 cm  reassigned 12
round 2   strain 7.25%  fit 0.520 cm  reassigned  9
round 3   strain 6.88%  fit 0.528 cm  reassigned  1
round 4   strain 6.93%  fit 0.530 cm  reassigned  0
```

### Greedy growth

`growOntoSurface()` is the explicit-relation mode scaled up: repeatedly take the
boundary edge hugging the body best, and try every (tile, flip, fold angle) combination,
scoring by distance to the ease surface, with a bonus for welding onto an existing
vertex and a penalty for pushing a vertex past 360°. It holds edges to 0.4 % rms strain
— far better than the grid — but it wanders and will not close a full tube. Use it to
explore local patches; use the grid for whole garments.

## 6. Measured results

Everything below is printed by `node test/run.mjs` and the two sweep tools.

**Module size trade-off** (`tools/sweep.mjs`, parametric torso, settled):

| u (cm) | tile edges | tiles | seam length | strain rms | corner fit | edge conflicts |
|---|---|---|---|---|---|---|
| 1.0 | 3/4/5 | 836 | **56.6 m** | 7.5 % | 0.73 cm | 60 |
| 1.5 | 4.5/6/7.5 | 390 | 38.5 m | 6.7 % | 0.95 cm | 20 |
| **2.0** | **6/8/10** | **198** | **27.4 m** | **6.5 %** | **0.96 cm** | **6** |
| 2.5 | 7.5/10/12.5 | 144 | 23.4 m | 6.0 % | 1.37 cm | 1 |
| 3.0 | 9/12/15 | 84 | 17.2 m | 6.4 % | 1.60 cm | 2 |
| 4.0 | 12/16/20 | 60 | 14.9 m | 5.7 % | 1.47 cm | 0 |

Read it as: **smaller modules fit better but cost seam length superlinearly and create
more edge-length conflicts.** `u = 2 cm` is the knee. The 198-tile, 27 m figure
validates the hand estimate in [01-geometry.md](01-geometry.md) §6.

**Ease is forced by geometry, not comfort** (`tools/ease_sweep.mjs`, `u = 2 cm`):

| ease | tiles whose faces cut into the body | deepest |
|---|---|---|
| 0.4 cm | 84 | 2.65 cm |
| 0.8 cm | 42 | 2.13 cm |
| 1.2 cm | 20 | 1.94 cm |
| 1.6 cm | 8 | 1.50 cm |
| 2.0 cm | 2 | 0.53 cm |
| **2.5 cm** | **0** | **0.00 cm** |

A flat tile spanning a curved region sags `h²/(8R)`; unless the ease exceeds that sag,
the tile faces cut into the body however well the corners fit. **At `u = 2 cm` over a
bust you need about 2.5 cm of ease, or smaller tiles at the apex.** This is a real and
somewhat unwelcome design constraint that I did not anticipate before building it, and
it is the strongest argument in the whole project for **adaptive tile sizing** (§7.1).

Other measured values at `u = 2 cm`, ease 2.2 cm, settled: 198 tiles, 110 vertices, 308
edges, **DOF = 16** (a nearly rigid shell, as the theory demands), 0.67 m² of shell,
28 m of seam, mean |angle defect| 38°, total defect ~200°.

## 7. What to build next, in order

1. **Adaptive tile size.** The single highest-value change, forced by the ease result
   above. Compute principal curvature over the body, subdivide the grid where
   `h²/(8R)` exceeds the ease budget. The library already has the 3-4-5 at two scales
   with an exact 4:1 area ratio precisely so refinement never leaves the library.
2. **Darts and coarsening** — [01-geometry.md](01-geometry.md) §8, the step that turns
   this from a curiosity into a pattern. Greedily merge near-coplanar tiles into
   polygonal panels, convert residual defect to darts, emit 6–9 panels. This is the
   actual deliverable of the whole system.
3. **2D unfold and nest** — trivial for triangles (they are already flat; see §8 of doc
   01: zero stretch distortion), then pack with seam allowances, notches, tile IDs,
   fastener hole positions and an assembly map. Hand the panels to FreeSewing for
   offsetting and layout, emit SVG and DXF.
4. **Seam take-up parameters** — the empirical bias-stretch corrections from the gored
   skirt tradition (0.5–1 cm per panel depending on count). Pure geometry gets this
   wrong; expose it per seam.
5. **Fabric shear.** Currently every tile is rigid. Real woven shears 15–25° and absorbs
   curvature for free, so the solver over-segments. Add a per-tile shear allowance and
   watch the required tile count drop.
6. **Fastener layout** — place snaps/eyelets along every edge at the spacing from
   [02-joining.md](02-joining.md), count them, cost them, and emit their coordinates
   into the cut file.
7. **Quad regions for the skirt** — [01-geometry.md](01-geometry.md) §4/§5. Below the
   waist, build quads and let them shear.
8. ~~Load a real scan and fit the measurements to it.~~ **Withdrawn 2026-11-27** —
   nobody is making scans, and the OBJ adapter is gone
   ([../todos/body-source-spec.md](../todos/body-source-spec.md)).

## 8. Running it

```bash
cd app && python3 -m http.server 8777
# then open http://127.0.0.1:8777/
```

Or in docker, which needs docker and nothing else — no emscripten, no gcc, no Node,
no Python. Two images, two commands: a build image that compiles `src/sewcloth` and
runs its tests, and a run image with `python3` and the page.

```bash
./docker/app/appdocker.sh build    # the build image, then the run image
./docker/app/appdocker.sh start    # the viewer on http://127.0.0.1:8777
./docker/app/appdocker.sh stop     # or logs, or status
```

The page is baked into the run image rather than mounted, so editing `app/js/` and
reloading wants the host server above. The wasm the image serves is compiled in the
build image, not taken from the committed `app/wasm/` — measured byte-identical to it
on 2026-11-26. `docker/knowledge-tree/` is a *different* pair of images, for the
knowledge tree's own browser on `:3001`, and serves none of this.

Keys, read off the handler at `app/js/main.js:3332` rather than off the help strip —
which is wrong about `T`, recorded as an open item in
[19-todo.md](../todos/19-todo.md):

`R` rebuild · `space` relax 20, or play/pause once a simulation exists ·
`Q` requantise · `S` settle · `G` grow · `E` export OBJ · `P` print the pattern ·
`I` import a pattern · `T` open the **cutting table** · `U` undo a table edit ·
`D` drop test · `A` accordion drop · `K` draft and hang a skirt ·
`J` lay the pieces out · `W` sew / stop the seams ·
`C` cycle colour mode (angle defect / seam strain / tile type / plain).

**While pieces are laid out for arranging, a different map is in force** and takes
the key first (`arrangeKey`): `A` select all · `N` select none · `G` select adjacent ·
`M` mirror · `F` flip · `0` reset · `X` finish and weld · arrows nudge ·
`[` `]` spin · `;` `'` tilt, with `shift` ×5 and `alt` ×0.2. So `A` and `G` mean
one thing on the table and another off it.

The controls live in a menubar of floating dialogs and, still, one lil-gui panel —
[17-interface.md](17-interface.md), which also carries how much of that migration is
done. The body left the panel on 2026-11-27: the measurements, the shape and
asymmetry fields, the poses and the limbs are five dialogs under a `body ▾` menu
([body-dialog-spec.md](../todos/body-dialog-spec.md)). The panel still exposes module
size, ease, and every solver weight. `asm`, `torso`, `relax`, `quantize`, `settle` and `LIBRARY`
are on `globalThis` for console work.

**No control in the page answers into the console any more.** Thirteen did — ten of
them rows whose whole effect was a `console.table`, plus the body's three — and all
thirteen were removed on 2026-11-27 at the user's instruction
([console-readouts-spec.md](../todos/console-readouts-spec.md) and
[measure-button-spec.md](../todos/measure-button-spec.md)). The measurements behind
them all remain and are reached from `tools/` or from the console directly; what went
is the button that looked like it did nothing. A handler that does real work and
logs what it did — `true the darts`, `replay these edits onto this body`, the weld
report — is not one of these and stayed.

Colour-by-defect is the view to live in: orange is positive Gaussian curvature (domes —
bust, shoulder), blue is negative (saddles — waist, underarm), grey is flat. It is a
direct readout of where darts would have to go.
