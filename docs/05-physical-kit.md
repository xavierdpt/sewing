# 05 — The Physical Kit and the Fitting Protocol

Written against the actual motivation: **ready-made patterns assume standard bodies,
and for an unusual body a hands-on method is worth more than a better size chart.**

The fitting literature already agrees with you, in one sentence: *draped slopers are the
most straightforward way to fit an asymmetrical body, because you drape both sides.*
Everything below is a way of making draping repeatable, measurable and reversible.

## 1. Why a triangle kit beats a toile for this

A calico toile is a one-shot artefact. You cut it, pin it, mark it, unpick it, and the
information lives in pencil marks you then have to interpret. Three toiles is a normal
number for a difficult fit.

A reconfigurable tile shell is a **reusable instrument**:

| | Toile | Duct-tape form | Triangle shell |
|---|---|---|---|
| Reusable | no | no | **yes** |
| Adjustable after the fact | barely | no | **yes** |
| Records asymmetry | by marking | by shape | **as data** |
| Machine-readable output | no | only if scanned | **vertex coordinates** |
| Fits the back without a helper | no | no | partly (build it on the form) |
| Cost per iteration | fabric + hours | a roll of tape, destroyed | zero |

The last row is the real argument. Once you own the tiles, iteration is free.

## 2. Build order

### Stage 0 — the body double (do this first)

You cannot fit your own back. Make a duct-tape form: a close-fitting old T-shirt,
neck wrapped in cling film, then three layers of tape — horizontal, vertical,
horizontal — with a "cross-your-heart" pass from each shoulder under the opposite
breast to define the bust. Wrap *snugly* and start under the bust, or the form comes
out bigger than you. Keep your normal posture throughout or it will be permanently
slouched. Cut it off up the back, tape the seam, stuff with polyfill, add a hanger
taped to a cardboard tube before stuffing, mount on a base.

Two rolls of tape and three bags of polyfill. Half a day. Everything afterwards happens
on the form, at a table, at your own pace.

Then **photograph it for a mesh** — see [08-local-toolchain.md](08-local-toolchain.md)
for the COLMAP pipeline. A form is a far better photogrammetry subject than a person:
it holds still, you can put markers on it, and you can matte-spray it.

### Stage 1 — the geometry kit (the instrument)

| Item | Spec | Qty for a bodice | Cost |
|---|---|---|---|
| Tiles | 2–3 mm wool felt, laser or die cut, `u = 2 cm` → edges 6/8/10 cm | ~200, plus 30 % spares | €25–40 of felt |
| Corner eyelets | 4 mm, 6–8 mm in from each point | ~600 | €12 |
| Jump rings | 6–8 mm, or split rings | ~300 | €8 |
| Eyelet press | hand press or pliers | 1 | €15–40 |
| Flat-nose pliers | ×2 | | €10 |
| Marker | tile ID + edge numbers on every tile | | — |

Why felt: non-fraying cut edge (so **zero seam allowance**, which
[01-geometry.md](01-geometry.md) §7 shows is mandatory), stiff enough to hold the facet,
cheap, and takes an eyelet without tearing.

Why corner eyelets and rings rather than edge joins: the join then **implements the
vertex**, which is where all your mathematics lives. You can add and remove one tile at
a time, at a vertex, while the shell is on the form, and feel the angle budget close up.

**Label every tile.** `R345-017`, with its three edges numbered. Without labels you
cannot reconstruct what you built, and reconstruction is the entire point.

Tile mix for a first kit (from the measured histogram the solver actually produces at
`u = 2 cm`): roughly 40 % R345, 25 % I553, 15 % I445, 15 % I554/I558, 5 % equilaterals.
Cut 260 total.

### Stage 2 — refit and record

Add lacing where you want continuous adjustment. [02-joining.md](02-joining.md) §3:
eyelets along the edge and a cord zig-zagged between neighbours lets you tune edge
*length* on the body, which is the one thing a fixed tile library cannot do. For an
asymmetric body, lace left and right differently — **the difference is the
measurement**.

### Stage 3 — wearable prototype

Snap tape along the edges, or KAM size-20 snaps at ~20 mm spacing (3 per 60 mm edge).
Budget ~750 snaps for a bodice; a table press pays for itself past about 200. Always
set snaps through a reinforced edge — fabric tears at fasteners, not between them.

### Stage 4 — the actual garment

**Coarsen.** Merge near-coplanar tiles into large panels, convert residual angle defect
into darts, flatten (exactly — see [01-geometry.md](01-geometry.md) §8), add real seam
allowances, cut in real fabric, sew conventionally. Six to nine panels, not two hundred.

Unless faceting is the look you want, in which case stay at stage 3, use laser-cut felt
with tab-and-slot edges, and design a structured bodice rather than a flowing dress —
because a triangulated shell will not drape ([01-geometry.md](01-geometry.md) §4).

## 3. The fitting session

1. Dress the form in the base layer you will actually wear under the garment.
2. Mark the datum lines on the form in contrasting tape: **centre front, centre back,
   waist, bust level, shoulder seam line, armhole**. Everything is measured from these.
3. Start at the **centre front at the waist** and build upward and outward. The waist is
   the most stable landmark and the least curved region.
4. At every vertex, watch the angle budget. The closure rule is
   [01-geometry.md](01-geometry.md) §2: around a flat vertex, **the 3-4-5 acute corners
   must be used in matched pairs**, and (pairs) + (right angles) = 4. If you find
   yourself with an unmatched acute corner at a flat spot, you have made an error you
   will pay for three tiles later.
5. Where the shell wants to lift off the form, you need **positive curvature** —
   remove angle: use fewer or narrower corners at that vertex. This is the bust, the
   shoulder cap, the shoulder blade.
6. Where it buckles and ripples, you need **negative curvature** — insert a triangle.
   This is the side seam at the waist, the underarm, the small of the back.
7. **Do both sides independently.** Never mirror. If you mirror, you have thrown away
   the only information this exercise exists to capture.
8. Photograph from eight angles with the datum tapes visible, then take the shell off
   and photograph it flat.
9. Record: for each tile, its ID and its three neighbours. A phone voice note while you
   work beats writing. Or just photograph the labelled shell at high resolution and
   read the IDs off afterwards.

## 4. Getting the result into the software

Three routes, cheapest first:

1. **Type the measurements in.** The parametric torso in `app/js/torso.js` takes girths
   and heights plus `shoulderDrop`, `lateralShift`, `bustAsym` and `rotation`. For many
   bodies this is enough, and it takes ten minutes.
2. **Photogrammetry of the duct-tape form** → OBJ → `MeshSurface`. See
   [08-local-toolchain.md](08-local-toolchain.md); `colmap` is one `apt install` away.
   Scale with a ruler in frame. This is the accurate route.
3. **Reconstruct from the shell's own combinatorics** — you know every tile type and
   every adjacency, so the shell's 3D shape is determined up to the fold angles. This
   is the elegant route and it is not built yet; see
   [06-open-questions.md](06-open-questions.md) §2.

## 5. Costs and time, honestly

| | Money | Time |
|---|---|---|
| Duct-tape form | €15 | 4 h (needs a helper for 1 h) |
| 260 felt tiles, laser cut at a makerspace | €40 felt + €30 machine | 2 h design, 1 h cutting |
| 600 eyelets set | €12 + €25 press | **4–6 h** (this is the slow part) |
| First shell built on the form | — | 3–5 h |
| Refit iterations | — | 30 min each |
| Coarsen, draft, cut, sew the real garment | fabric | a normal garment's worth |

Total to first fitted bodice pattern: roughly **€120 and two weekends**, of which the
eyelets are the single most tedious item. If you can get a laser cutter, the
tab-and-slot tiles of [02-joining.md](02-joining.md) delete the eyelet step entirely and
that is worth more than any other optimisation here.

## 6. Where this will disappoint you

- **The shell is rigid.** It will tell you the truth about the body's surface and
  nothing about how fabric will hang on it.
- **Faceting at the bust.** You need `u ≤ 1.5 cm` tiles there for a smooth read, and
  that triples the tile count locally. Plan a mixed kit.
- **2.5 cm of ease is forced on you** at `u = 2 cm` by chord sag (measured — see
  [04-software.md](04-software.md) §6). A close-fitted moulage wants *zero* ease, so for
  a true second-skin fit you must go to small tiles at the apex. There is no way around
  this; it is geometry.
- **Eyelets are slow** and the shell will be heavier than you expect.
- **Your back is still hard.** Build on the form, not on yourself.
