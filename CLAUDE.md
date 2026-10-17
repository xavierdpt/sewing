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

**A default nobody states is an assumption nobody checks.** `sewcloth`'s
gravity defaulted to −Z, Blender's convention; this project is Y-up; the
viewer's drape never set it. So every X pulled the cloth along the body's
*back* — 12.3 cm of z and 5.9 cm *upward* per vertex — and the garment came
out flat at the front with the cloth piled up behind. Two separate findings
had already been written up as fabric-parameter problems before a person
looking at the screen said "real fabric doesn't behave like this".

> **Cost:** every fold count, hem length and backend comparison taken between
> the wasm drape existing and 2026-10-17. The measurement that would have
> named it in one run — the mean displacement per axis, three numbers — was in
> no instrument, because nobody asks which way a thing fell when they are sure
> they know.

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
this project's constant-rate feed closes them to 0.024 cm, so the sewing
*algorithm* stays this project's — which is not the same as staying in
`cloth.js`: it moves into `src/sewcloth`, it does not go back to Blender's
springs. Run the comparison (`tools/drape_blender.mjs`) before switching.

> **Cost:** I twice recommended replacing a component that measurably worked,
> because someone suggested it and I did not check first.

**Which solver is the reference for which question** is settled and written
down in `docs/16-solvers.md` §3b. In short, so it is not re-derived:

- the **side-car** is stock Blender and is **the oracle** — it arbitrates;
- **`src/sewcloth`** (wasm, in the page) is **derived from Blender's solver
  and improved on it**, and is the product. It matches the oracle's clearance
  sixty times faster;
- **`cloth.js` is being retired.** It is not the reference for anything, and
  nothing new is built in it. It still runs the sewing, and only until the
  constant-rate feed and the hinge solve are ported.

> **Cost:** I wrote an open item as "why does the wasm drape differ from
> `cloth.js`" — `cloth.js` as the implicit reference — and had to be told
> twice that it is the Blender-derived solver that is the better one and that
> `cloth.js` is on its way out. Both facts were already in the repo, and I had
> read one of them in the same session. Deference to one's own code is the
> same error as deference to someone else's.

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

## 8. A dependency's source is readable. Pull it instead of guessing at it.

`deb-src` is enabled on this machine, so the source of anything installed from
apt can be fetched and read: `apt-get source <pkg>` from `src/`, which is the
folder that holds unpacked upstream source and is not part of this project's
code. Blender, the Python side-car's dependencies and the toolchain are all
readable this way. Rule 1 applies to other people's code too — what a library
actually does is a thing that can be looked up, not inferred from its
documentation or its name.

> **Cost:** none recorded yet; this one is written down before it is broken
> rather than after.

## 9. A capability is not a feature. Follow the path the person presses.

Reading the code tells you what exists. It does not tell you what the program
*does*, because that is decided by default values and by which call the button
is wired to. Press the key and read what it calls — `tools/viewshot.py` drives
the real page headlessly, so this is a thirty-second measurement, not an
opinion.

> **Cost:** three in one session, all the same shape. I said "X drapes in
> wasm" having seen `sendToWasm` in `finishAssembly` and not having read
> `params.drapeBackend`, which still defaulted to `'sidecar'` — so every X in
> the page was going to Blender over HTTP while I described it as in-page.
> I shipped a test fixture reachable only by a button in another folder, and
> J — the key someone actually presses — laid out 0 darts; measured, not
> argued, once I finally drove it. And I wrote the queue item for the sewing
> port as four steps that ended at "a `sewWasm` beside `drapeWasm`, so the two
> can be compared", with no step that makes W call it; the user had to ask
> twice before it was written down. Specifying capabilities and omitting the
> wiring is the house error: rule 7's lesson, one level up.

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
mkdir -p src && cd src && apt-get source blender   # read a dependency's source
```
