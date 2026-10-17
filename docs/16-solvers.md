# 16 — Which Solver Does What, and Why

`app/js/cloth.js`, `app/js/clearance.js`, `sim/`; **J**, **W**, **X** in the viewer.

Four things happen to a garment between a flat pattern and a photograph of it
hanging on a body, and they are not all the same kind of problem. Three are
geometry and one is physics with hard contact. This document says which is
which, where each runs, and what was measured to decide.

```
  PATTERN   draft, dart, spread           browser + node   panels.js, skirt.js,
                                                           patternedit.js, table.js
     |
  ARRANGE   rigid placements              browser + node   arrange.js
     |      no physics at all
     |
  SEW       constant-rate feed,           browser + node   cloth.js, assemble.js
     |      force-limited seams
     |
  WELD      union-find on what closed     browser + node   assemble.js
     |
  DRAPE     hard contact, self-collision  WASM, IN THE PAGE src/sewcloth ->
     |                                    (Blender-derived) app/js/drapewasm.js
     |      the oracle, for reference runs  stock Blender    tools/trace.mjs
     |      only -- not in the page         sim/server.py     --sidecar
     |
  MEASURE   clearance to the skin         browser + node   clearance.js
```

---

## 1 — Arranging is geometry, and does not belong to a solver

A piece's position is eight numbers — station, height, radius, the cylinder it
was rolled onto, spin, tilt, swing, whether it is face down — and its vertices
are recomputed from the pattern every time one changes (docs/15-manual-sewing.md
§6). So the piece in the scene is always exactly the piece that was cut.

That is not tidiness. The whole reason the pieces may be moved freely is that
a flat piece moved rigidly in 3D is trivially isometric, so the garment starts
unstrained whatever the arrangement. Measured: 1500 presses of the rigid
transforms drift by **1.3×10⁻¹² %**, and 1200 presses out and back return every
vertex to within **0 cm**. Nothing is simulated, so nothing can go wrong.

## 2 — Sewing stays here, because it measurably wins

Blender has a native sewing primitive — loose edges plus `use_sewing_springs`,
with `sewing_force_max` as a force cap. It is the open-source version of the
Marvelous Designer workflow and it is the obvious thing to use. It was tried,
twice, including once with gravity off and self-collision off as this project's
own `assemble.js` says that phase requires:

| | seams closed | widest gap | hem (cut 160 cm) |
|---|---|---|---|
| Blender sewing springs | 60 / 76 | **9.22 cm** | 177.68 cm |
| Blender, force cap 2 | 56 / 76 | 16.97 cm | 169.72 cm |
| **this project's feed** | **76 / 76** | **0.024 cm** | **160.03 cm** |

So the seams are closed here, by feeding each stitch's rest length down at a
constant `sewSpeedCmPerSec` with the pull force capped at `maxTensionGf`
(docs/15-manual-sewing.md §3, §4). It is a hand-rolled algorithm kept for one
reason: on this problem it beats the ready-made one by a factor of four
hundred. That reason is re-checkable with `node tools/sew_blender.mjs`, and if
it ever stops being true the sewing should move too.

## 3 — Drape goes to a side-car, because this solver cannot do contact

Contact here is a **point query per vertex** against a signed distance field.
It keeps every vertex outside the body and says nothing whatever about the
triangle between them, so a facet spanning a convex bulge dips below it and
the figure shows through the cloth.

This is not a tuning problem and an afternoon was spent establishing that.
Sampling edge midpoints as well narrows the error without bounding it (0.42 cm
to 0.26 cm, not to zero) and, being an extra positional correction in a
Gauss-Seidel loop whose relaxation constants were set by measurement against
the drop test, it costs that test its settle — 3 cm/s rms after 9 s against
0.2 for settled cloth. `edgeCollision` survives as an option, on only while
arranging, where the cloth bridges between a handful of contacts and nothing
depends on settling.

The real technique is proximity on actual primitive pairs — vertex-face and
edge-edge, Bridson & Fedkiw 2002 — or a barrier that guarantees an
intersection-free state (IPC, Li et al. 2020). Blender implements the former:
`cloth_collision` in `source/blender/blenkernel/intern/collision.cc` does
triangle-against-triangle closest point with a BVH broad phase, an epsilon on
both surfaces, and a response spread over the three vertices by the
barycentric coordinates of the contact point. Measured on the same garment and
the same body, with the same instrument:

| | wall | inside the cloth area | deepest | triangles touched |
|---|---|---|---|---|
| this project | 17.4 s | **1.26 %** | −0.525 cm | 117 |
| Blender | 98 s | **0 %** | +0.032 cm clear | **0** |

Hem 160.03 vs 160.09 cm and the same fold count, so the two agree about the
garment and disagree about the body.

## 3b — Three drape backends, and which one is the reference

**Written down because it had to be said out loud instead.** The drape is no
longer one solver behind one switch, and a session that does not know the
order of authority will reach for the wrong one — or, worse, treat whichever
solver it happens to have measured first as the truth.

| backend | what it is | role |
|---|---|---|
| the side-car | **stock Blender**, triangle-against-triangle through a BVH | **the oracle.** Slow and right. Everything else is checked against it |
| sewcloth, in wasm | **derived from Blender's own solver** and improved on it — `src/sewcloth`, checked against `src/blender-fork` within a stated tolerance ([20-fork.md](20-fork.md) §8) | **the product.** What the page runs. Inherits Blender's springs and its backward-Euler solve; what it does *not* inherit is `collision.cc` |
| `cloth.js` | this project's own, hand-rolled | **to be deleted.** Not the reference for anything a solver is asked: §3 above is why the drape left it — its contact is a point query per vertex and cannot bound what happens between them. It still runs the sewing, and only until that is ported |

**So when two of them disagree about a drape, `cloth.js` is not the side that
is right by default — and neither is the one that was measured first.** The
side-car settles it, because it is the only one of the three whose contact is
not an approximation of something else. Rule 4 cuts both ways: deference to a
library is as wrong as deference to one's own code, and the comparison exists
precisely so neither is needed (`tools/drape_blender.mjs`,
`tools/trace.mjs --sidecar`, `tools/trace.mjs --wasm`).

**The three-way comparison, run 2026-10-16.** Same pattern, same body, same
welded garment, same waist pins, six seconds; clearance measured by the same
instrument over the cloth surface, not at its corners:

| backend | wall | top y | hem y | inside area % | deepest | hem cm (cut 160) | folds |
|---|---|---|---|---|---|---|---|
| side-car, **stock Blender — the oracle** | 90.7 s | −0.6 | −55.2 | **0** | +0.03 clear | 160.07 | 4 |
| **sewcloth in wasm** | **1.5 s** | +1.2 | −55.9 | **0** | +0.13 clear | 169.68 | 2 |
| `cloth.js` | 10.7 s | −0.6 | −55.0 | 0.11 | −0.19 **inside** | 159.99 | 4 |

Read it in that order. **On contact, sewcloth matches the oracle and
`cloth.js` does not** — the only one of the three that still puts cloth inside
the body is the hand-rolled one, and it does so after the wasm path's own
collision was fixed ([00-backtotrack.md](00-backtotrack.md) §7). Sixty times
faster than the oracle, at the oracle's clearance.

Where sewcloth does diverge is **stretch**, not contact: 169.68 cm of hem
where the pattern was cut at 160 and both others settle within 0.1 cm — about
6 % long, and 2 deep folds instead of 4 shallow ones, which is the same fact
seen from the side. It takes mass, tension and damping where `cloth.js` takes
a named fabric with a measured strain limit, and nothing yet maps one onto the
other. That is the open item, and it is a parameter question with a reference
to check against rather than a defect in the solver.

What this does *not* say is that sewcloth is right about everything. Its
inherited gap is the collider: points and edge midpoints against a sampled
field rather than a BVH over primitive pairs, so the cloth must stand off far
enough to cover what a facet can do between the sampled points. That is a
stated bound, measured, not a hope — see `app/js/drapewasm.js`'s thickness
floor and [00-backtotrack.md](00-backtotrack.md) §7.

And sewing is the opposite case, which is why it is §2 and not here: there the
hand-rolled constant-rate feed measurably beats Blender's own sewing springs,
0.024 cm against 9.2 cm. The reference depends on the question, not on who
wrote the code.

### The side-car is no longer in the page, and `cloth.js` is next

**Removed 2026-10-16.** The viewer had three drape backends behind a switch
(`params.drapeBackend`, defaulting to `'sidecar'`) and streamed Blender's
frames back over HTTP as they solved. All of that is gone: `X` drapes in wasm,
in the page, and nothing else does. What went with it — `sendToSidecar`,
`pollFrames`, `stepPlayback`, the frame queue and the backend switch — was
there to make a 90 s round trip watchable, and a 1.5 s in-page drape at the
same clearance does not need it. `sim/server.py` stays, for two reasons that
are not the interactive path: it is **the oracle** for reference runs, and it
serves telemetry.

**`cloth.js` is to go the same way, and cannot go yet.** What still runs in it,
and what each one needs before the file can be deleted:

| in `cloth.js` | used by | what has to happen |
|---|---|---|
| the sewing: constant-rate feed, force-limited stitches, hinge bending | **W** | `sc_set_hinges` + a bending solve and `sc_set_stitches` + `sc_feed_stitches` in `src/sewcloth`. sewcloth has springs, an implicit solve, SDF contact and vertex self-collision — it has **no bending and no stitches at all**, so W cannot move today. [19-todo.md](19-todo.md) item 2 |
| `BodyCollider` | `clearance.js`, the viewer, the tools, the gate | it is not solver code. It moves to its own module, unchanged |
| `FABRICS`, `rigidityOf` | everything that names a fabric | likewise — a table, not a solver. And see the open item on mapping them onto sewcloth's mass/tension/damping |
| `penetration()`, `report()`, `settle()` | the viewer's HUD and the gate | the parts worth keeping are instruments; they follow `BodyCollider` out |

So the order is: **port the sewing, move the two non-solver pieces out, then
delete the file.** Deleting it before the first of those would leave the
project with no way to sew at all, which is why it is still here.

**That is a statement about the *algorithm*, not about the file.** The
constant-rate feed is what wins; `cloth.js` is merely where it currently
lives. The direction of this project is that it stops living there: the feed
and the hinge solve move into `src/sewcloth` ([19-todo.md](19-todo.md)), and
`cloth.js` goes. Nothing new should be built in it.

## 4 — The transport

`sim/server.py` is a standard-library HTTP service. `POST /drape` takes a mesh
and returns a mesh; `GET /health` says which backends can run. The viewer
posts to it on **X** (`app/js/remote.js`) and the local fall keeps playing
underneath, so nothing blocks: you watch the preview drop, and a minute later
it is replaced by the real thing.

`app/js/drapejob.js` builds the job and is imported by the browser client
*and* the node driver (`sim/drape.mjs`), so a drape from the viewer and the
same drape run headlessly cannot quietly differ. It lives in `app/js` with the
other three.js-free modules because the browser has to be able to fetch it.

**Units.** Everything here is centimetres; Blender's physics is metres at
9.81 m/s². The conversion is in `blender_drape.py` and it is not cosmetic —
feeding centimetres in simulates a garment thirty metres tall, which falls
like treacle. Areal density is carried across exactly, so the garment weighs
the same 78.6 g in both solvers; the stiffnesses are *not* a conversion and
are not claimed to be, because XPBD compliance and Blender's spring constants
are not the same kind of number.

The endpoint is deliberately backend-agnostic. Which engine ran comes back in
the response.

## 5 — Measuring it

`app/js/clearance.js` samples the cloth **surface** — a barycentric grid over
every triangle — against the body, and reports the distribution: what fraction
of the cloth *area* is inside, how deep, which triangles, and the median
clearance.

The thing it replaces was a single worst case over vertices, which read
**0.00 cm** while the dress form was plainly visible through a half-sewn
skirt. Both halves of that were true. A scalar with a threshold is
verification; seeing what is happening needs a distribution and a location.

### What the viewer reports back

It used to report nothing: the viewer posted a mesh to the side-car and every
measurement and exception stayed in a browser console. Two bugs this session
were found only because a person pasted console output by hand, and one of
them had already appeared in an automated run as "nothing happened" and been
written off as a timeout.

`app/js/telemetry.js` now batches events to `POST /log`; the server appends
JSON lines to `sim/logs/viewer-DATE.jsonl` and `GET /log` returns the tail.
The payload at each phase boundary is deliberately the same set of numbers
`tools/trace.mjs` prints, because **parity is the point**: a browser session
and a headless run should agree about the same garment, and when they do not,
the difference is the bug. That is how the viewer was caught sewing with
self-collision on.

Four clocks, and mixing them is a trap:

| | |
|---|---|
| `t` | wall clock in the browser, ISO. Readable, but it can **jump** — an NTP correction mid-session makes a phase look instantaneous. |
| `ms` | monotonic ms since session start (`performance.now()`). What any **duration** should come from. |
| `dtMs` | monotonic ms since the previous event, so a phase duration is a field rather than a subtraction. |
| `simSeconds` | the **simulation's** clock. Measured: a sewing pass of 4.27 simulated seconds inside 300 ms of wall time. Conflating the two is how "it is slow" and "it is sewing slowly" get confused. |

Plus `sentT`/`sentMs` when the batch left and `srvT` when it **arrived** —
which is not when the event happened. Measured at 57 s behind on a slow page,
long enough to reorder events against the server's own lines if anyone
trusted `srvT` to sort them. Keeping all of them means queue delay
(`sentMs − ms`), transport and clock skew (`srvT − sentT`) are each
measurable instead of guessed. The browser and the server clocks were 10 s
apart in testing.

```bash
curl -s localhost:8778/log | python3 -m json.tool   # the tail, as JSON
tail -f sim/logs/viewer-*.jsonl                      # live
node tools/trace.mjs               # arrange -> sew -> weld -> drape, as a table
node tools/trace.mjs --sidecar     # the same, draped by the side-car
node tools/trace.mjs --obj bad.obj # the triangles the body comes through
node tools/check_sidecar.mjs       # round-trip a garment over HTTP
node tools/drape_blender.mjs       # this solver against Blender's
node tools/sew_blender.mjs         # this project's sewing against Blender's
```

## 6 — What was evaluated and not adopted

**C-IPC** (`ipc-sim/Codim-IPC`) is the better answer in principle: guaranteed
intersection-free by construction, native **point-on-edge** stitching — more
general than vertex pairs, which is what easing a seam needs — and a table of
*measured* fabric parameters, which §8 of docs/11-cloth.md admits this project
does not have.

**It builds.** The source is a **git submodule** at
`sim/cipc/Codim-IPC`, checked out on a branch `ubuntu-24.04` that carries the
four fixes it needs, as commits rather than as a patch script — so the delta
from upstream is a reviewable `git diff` and can be rebased when upstream
moves. Three files, 45 lines, none of which touch the solver's mathematics:

1. **MKL** is fetched from an anaconda.org URL that no longer resolves.
   SuiteSparse needs only a BLAS and a LAPACK; system OpenBLAS is both.
2. **The vendored pybind11 is 2.4**, which predates `PyFrameObject` becoming
   opaque in Python 3.11 and so cannot compile against 3.12. Ubuntu's 2.11.1
   can.
3. **GCC 13 promoted `-Wchanges-meaning` to an error**, which rejects the
   vendored `meta.hpp`. A name-lookup pedantry; warn instead.
4. **`boost::property_tree` against pybind11 ≥ 2.6.** pybind11's
   `is_copy_constructible` is container-aware: given a `value_type` it also
   requires *that* to be copy-constructible. `ptree` is recursive — its
   `value_type` is `std::pair<const Key, basic_ptree>` — so the trait
   instantiates itself on a type that is still incomplete. Short-circuiting it
   to the plain `std::` trait is the upstream advice for recursive types, and
   is the right answer: `ptree` really is copy and move constructible. The
   specialisation must go at **global** scope; inside `namespace JGSL` it
   silently becomes `JGSL::pybind11::detail` and specialises nothing.

```bash
git submodule update --init --depth 1 sim/cipc/Codim-IPC
bash sim/cipc/build_cipc.sh
```

Expect twenty minutes or so — it compiles Kokkos, Kokkos-kernels, SuiteSparse,
AMGCL and Boost from source, and Kokkos-kernels' several hundred generated
template instantiations are most of the wall time.

**One caveat about the submodule.** The parent records a commit that exists
only in this checkout, because the fixes are committed locally and there is
no fork to push them to. `git submodule update --init` on another machine will
fetch upstream and fail to find it. Push the branch to a fork and change the
`url` in `.gitmodules` if this needs to leave this machine.

It is **not integrated**, because Blender already reaches zero penetration, so
there is nothing left on that axis to win. It is here as a reference oracle —
a second opinion from a solver that cannot interpenetrate by construction —
and for its fabric table, which is recorded in
[`sim/cipc/fabrics.md`](../sim/cipc/fabrics.md): five real cloths at
150–240 gsm with measured Young's moduli, Poisson's ratios and strain limits
of 0.5–13.4 %, against this project's plausible-but-invented presets. Those
measured wovens stretch 6–13 % where this project assumes 2–4 %, which if
right undercuts the yoke/slip boundary in docs/11-cloth.md.

**FCL** (`libfcl-dev`) does mesh-mesh proximity with a BVH, and does it fast —
342 contacts between a 1872-triangle garment and a 12288-triangle body in
**5.2 ms**, confirming the 94 offending triangles independently. But detection
is the easy half; the response is the hard one, so building on FCL would mean
hand-writing Bridson-Fedkiw after all. Its honest role here is as a referee,
not a component.

**Embree, CGAL, Bullet** — Embree and CGAL solve closest-point, which is the
same half FCL solves. Bullet's soft bodies are not built for garments.
