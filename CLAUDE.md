# Working rules for this repo

These are not general advice. Each one is here because it was broken in this
repo, and the cost is recorded next to it.

## 1. Instrument before diagnosing. Never guess at a cause.

When something cannot be seen, build the measurement and let it say what is
wrong. `app/js/clearance.js` samples the cloth surface against the body and
reports the distribution; `node tools/trace.mjs` prints the whole
arrange→sew→weld→drape sequence as a table.

> **Cost:** asked why the dress form showed through the cloth, I asked for a
> screenshot and then guessed — back-face culling, shadows, flipped normals,
> limb capsules — testing four wrong hypotheses with throwaway scripts. The
> clearance field answers it in one run: every vertex outside the body, 40
> edge midpoints inside it. The diagnosis *is* the data.

## 2. A scalar with a threshold is verification. Observation needs a
distribution and a location.

`deepestPenetrationCm` sampled vertices only and read `0.00 cm` while the body
was visibly through the cloth. Report where, how much area, and the tail — not
just the worst number over whichever points were convenient.

## 3. Instruments live in the repo. Throwaway scripts are a smell.

If a question is worth a script, the next question probably is too. Eight
single-use scripts in `/tmp` in one session is a missing tool in `tools/`.

## 4. Prefer a proven library to a hand-rolled algorithm — but decide by
measurement, not by deference.

Both halves bite. Contact resolution was hand-rolled as a point query per
vertex, which is why the body came through; the fix is a real solver
(`sim/`). But Blender's native sewing springs left seams 9.2 cm open where
this project's constant-rate feed closes them to 0.024 cm, so sewing stays
here. Run the comparison (`tools/drape_blender.mjs`) before switching.

> **Cost:** I twice recommended replacing a component that measurably worked,
> because someone suggested it and I did not check first.

## 5. Read this project's own documents before proposing a direction.

`docs/11-cloth.md` already named the vertex-only collision limitation and
already proposed the Blender side-car as the answer. I rediscovered both the
hard way.

## 6. Never change a tuned system without a baseline and a regression run.

The constants in `cloth.js` (`maxPushPerSubstepCm`, `contactRelax`,
`contactDamping`) were set by measurement against the drop test, and the file
says so. Adding a positional correction cost that test its settle.

`node test/run.mjs` is the gate. It takes several minutes. Run it before
committing, not after.

## 7. The viewer and the headless path must do the same thing.

Shared logic goes in `app/js/` (three.js-free, importable by both). Where they
diverged, the viewer sewed with self-collision on — which `assemble.js`
documents as wrong — and its seams stalled at 0.4 cm while the headless path
reached 0.032 cm.

## Commands

```bash
node tools/trace.mjs              # arrange → sew → weld → drape, as numbers
node tools/trace.mjs --sidecar    # the same, draped by the side-car
node tools/trace.mjs --obj bad.obj   # dump the triangles the body comes through
node tools/drape_blender.mjs      # this solver against Blender's, same metric
python3 sim/server.py             # the drape side-car the viewer talks to
node test/run.mjs                 # the gate
python3 tools/viewshot.py out.png --eval 'JS'   # the viewer, headless, as a PNG
cd app && python3 -m http.server 8777
```
