# 20 — Forking Blender's cloth solver

A plan, written to be approved step by step rather than discovered afterwards.
Nothing in it happens without a go-ahead on that step.

**Goal.** One Blender binary that carries two cloth solvers — Blender's own,
untouched, and a copy of it we are free to change — and a way to say which one
runs.

**That goal is met, and has since grown a second half.** There are now two
forks with two different contracts: `src/blender-fork`, which must stay
bit-identical to stock and is therefore the **oracle**, and `src/sewcloth`
(§8), which is free of Blender entirely and targets **wasm for three.js**.
The second is only safe to build because the first exists to check it
against.

**Where this stands (2026-10-16).** **The fork runs, says what it is doing,
is measured against stock on the same scene in the same binary, and is
selectable from the skirt dialog.** Ten commits on branch `fork`, working
tree clean. `git diff master` is the fork's definition: **13 files, 7,139
insertions, 9 deletions** against pristine 4.0.2.

**The fork is faster than stock and computes exactly the same cloth** (60
frames, machine idle):

| | ms/frame | vs stock | drape |
|---|---|---|---|
| stock | 536.7 | — | reference |
| **fork** | **448.1** | **16.5 %** | **bit-identical** |

Not "looks the same": every coordinate of all 3,887 vertices hashes to
`36ec79781ddd5da8` on both sides — and to the same value across all three
generations of kernel, so the cloth has not moved at any point in the
optimisation work. §7 has the numbers, the noise floor (~3 %), and the one
early attempt that was faster and quietly moved the drape by a centimetre.

*Earlier baseline, before any divergence: stock 329.7 / fork 335.3 ms/frame
at 20 frames, settling identically. Frame counts are not comparable — later
frames cost more as the cloth folds onto itself.*

**Steps 0–18 are done, except 17b and 17c.** Steps 0–9 built the fork and proved it ran
identically to stock; §2b is the profiling manual and the reprofiling loop,
§6 the first profile. Steps 10–15 then made it faster *without* giving that
identity up: codec sources as an assembly reference (`src/asm-reference/`),
the CPU's real ceiling identified (**AVX2 + FMA3 + BMI2 + F16C**, against a
build that compiles everything at **SSE2**), **five hand-written kernels**,
and a data structure that lets them run on every core without a reduction —
§7.

**Steps 16–17a built the second fork** (§8): `src/sewcloth`, a cloth solver
with no Blender in it, **kept as its own repository because it is meant to be
reusable** — it depends on nothing from this project and can be lifted out of
`src/` without carrying a tail. The public API, the leaf kernels, springs,
both builds and the wasm tests exist and pass. The implicit solve and
collision do not, and `sc_capabilities()` says so rather than letting a
caller find out by watching cloth fall through a body.

**Open, in the order they are worth doing:**

*On `sewcloth` (§8):*

1. **The implicit solve** (17b), then **collision** (17c). Springs are done
   and exact; explicit stepping holds at tension 2000 with two substeps a
   frame, and a real fabric's stiffness will not be so kind — §9 measures
   what the reference needs: tension 1500 at quality 30, converged.
2. **Commit `sim/blender_skirt.py`** — the fabric parameters from step 18 are
   still uncommitted in the sewing repo, as are the strain scripts, which
   belong in `sim/fork/` as instruments rather than in scratch.

*On `blender-fork`:*

3. **Re-profile.** Three kernels have landed since the last profile, so the
   ranking in §7 is already out of date — the rule §2b states about
   measuring after every change applies to this work too.
4. **The three closest-point calls in `compute_collision_point_edge_tri`**
   are still scalar: they test one triangle rather than two, so they do not
   fit the six-lane layout of the kernel written in step 15.
5. **Repack the block struct.** The matvec reads 44 of its 64 bytes, so
   31 % of every cache line fetched is waste — §7.
6. A callgrind pass on **stock**, so the pair can be compared at instruction
   level and not only at wall clock.

**§9 is the newest result, and the most load-bearing for what comes next.**
Asked what strain it actually allows, the reference says: at its default
fabric, 26.6 % at p95 — about 24 cm of the skirt's drop is spring stretch,
not drape. Stiffened and converged, 0.37 %. So cloth *does* become
effectively inextensible, at roughly twice the substeps.

*Disk, which blocked a link earlier at 191 MB free, is clear again (1.1 TB).
One finding from it is worth keeping: the release build gives perfectly
usable symbolised `perf` profiles, so the 5.1 GB profiling tree is only
needed for callgrind source annotation and call graphs.*

---

## 1. The shape of it

Copy the solver's source files, rename the copies' public functions so both
can live in one binary, and dispatch between them at the call site. The stock
files are not edited; the fork diverges in its own files.

| | file | what happens to it |
|---|---|---|
| solver core | `implicit_blender.cc` | **copied** to `implicit_blender_fork.cc` |
| solver driver | `SIM_mass_spring.cc` | **copied** to `SIMFORK_mass_spring.cc` |
| headers | `implicit.h` → `implicit_fork.h`, `SIM_mass_spring.h` → `SIMFORK_mass_spring.h` | **copied**, prefixed |
| caller | `blenkernel/intern/cloth.cc` | **edited** — dispatch, ~30 lines |
| build | `simulation/CMakeLists.txt` | **edited** — two files added |

The one unavoidable complication: two copies of `SIM_cloth_solve` in one
binary is a duplicate-symbol link error, so the copies get their public names
prefixed `SIMFORK_` by a blind `sed`. That is a rename, not a redesign.

## 2. Steps

Each is a single command or edit, and stops for approval.

- [x] **0. Reset the fork tree.** *Done.* `src/blender-fork` carried an
      earlier in-place patch of `SIM_mass_spring.cc` (an env-var switch and
      timing); that approach is abandoned. The file was restored from
      `src/blender-4.0.2+dfsg` and `diff -rq` over both `source/` trees is
      clean — the fork starts from pristine 4.0.2, and
      `sim/fork/0001-cloth-solver-switch.patch` is deleted.

- [x] **0b. Put the fork tree under git.** *Done.* `src/blender-fork` is now
      its own repository — 14,867 files in one commit, `f08e1a4`, tagged
      **`vanilla-4.0.2`**, with work happening on branch **`fork`** and
      `master` left at the baseline. `git diff master` therefore answers
      "what have we changed to Blender" at any moment, which is the only way
      a fork of a 292 MB tree stays reviewable.

      Not a submodule and not visible to the sewing repo: `src/` is ignored
      there (`.gitignore:8`), confirmed with `git check-ignore`. `.git` costs
      138 MB. Identity had to be set locally — this machine configures
      `user.name` per repository rather than globally, so a fresh repo has
      none and the first commit is refused.

      **The fork is 8 files, 4,255 insertions, 9 deletions** against
      `master` — four copies, the dispatch in `cloth.cc`, one runtime field
      in `BKE_cloth.hh`, `CMakeLists.txt`, `.gitignore`.

      > **Cost:** `git add -A` in commit `002a9fc` swept in **145 `.pyc`
      > files** that Blender had written into its own scripts tree, and the
      > fork's diff against master read 153 files instead of 8 — useless for
      > the review this repository exists to support. Untracked in `1013195`,
      > ignored in `1d5ef44`. `git add -A` in someone else's 14,867-file tree
      > adds whatever happens to be lying there; the diff is the deliverable,
      > so it is the thing to check after committing, not the commit message.

- [x] **1–2. Copy the four files and rename their symbols.** *Done,
      commit `0ab7e67`* — 4,034 insertions, no stock file touched.

      Naming the copies `SIMFORK_*` rather than `*_fork` paid off: the single
      `sed -i 's/SIM_/SIMFORK_/g'` rewrote their `#include` lines too. Only
      `"implicit.h"` needed a second pass, having no `SIM_` in it to catch.

      Checked rather than assumed, because the whole point of the rename is
      names:

      - the forked core compiles standalone, clean;
      - its **38 exported symbols against the stock core's 38 share not one
        name**;
      - the six globals the stock driver exports — `SIM_cloth_solve`,
        `SIM_cloth_solver_init` / `_free` / `_set_positions` / `_set_volume`,
        `SIM_mass_spring_set_implicit_vertex_mass` — appear **nowhere** in the
        fork copy. Compared against the object file the real build produced,
        not against a reading of the source.
      - both headers use `#pragma once`, so no include-guard clash either.

- [x] **3. Dispatch in `cloth.cc`.** *Done, commit `0a1c321`.* Five static
      wrappers, and `SIM_*` / `SIMFORK_*` named in exactly one place.
      `SEWING_CLOTH_FORK` chooses. **Superseded by step 9** — it was first
      read once per *process* and cached, which is useless to a dialog whose
      point is flipping between the two; it is now read when a cloth object's
      solver state is built and stored on that object. The lifetime rule is
      unchanged and is the reason for both designs: state created by `init` is
      read by `solve`, so an answer that changed mid-fall would hand one
      solver the other's data.

      **Two link errors surfaced here that step 4 structurally could not
      catch**, both because nothing referenced the fork until now:

      - the copies redefined `eMassSpringSolverStatus`, which collides the
        moment `cloth.cc` includes both headers. `SIMFORK_mass_spring.h` now
        includes the stock header and shares the types — the honest
        description of this fork, since both solvers answer the same question
        and return the same struct. That shared result type is *why* either
        can sit behind the same call.
      - `SIMFORK_hair_volume_*` did not exist: `hair_volume.cc` was not
        copied. Hair volume has nothing to do with cloth, so the fork calls
        the stock ones. **Copy less, share more** — every file copied is a
        file that must be re-merged against upstream later.

- [x] **4. Add the two `.cc` files to `simulation/CMakeLists.txt`.** *Done,
      commit `b7c4b8f`* — four lines, each beside the file it copies. Done
      before step 3 on purpose, so that a compile failure would be the copies'
      fault and not the dispatch's.

      Rebuild: **7 steps, 7 seconds**, exit 0. Ninja re-ran CMake itself.
      `libbf_simulation.a` now carries `SIM_cloth_solve` and
      `SIMFORK_cloth_solve` side by side, no duplicate-symbol complaint, and
      the binary still reports 4.0.2.

      **What it does not prove.** `SIMFORK_cloth_solve` is in the archive but
      **not in `bin/blender`** — a static library only yields the objects
      something asks for, and nothing asks yet. "It still builds" is therefore
      weaker than it looks: the copies compile and do not clash, but they have
      never been linked into an executable. Step 3 is the first thing that
      references them, and any remaining link problem surfaces there.

- [x] **5. Install build dependencies.** *Done* via
      `pkexec apt-get build-dep -y blender`. Cost about 3 GB of disk. The one
      that actually blocked the configure was OpenImageIO.

- [x] **6. Build.** *Done, and done before the fork code rather than after —
      out of plan order on purpose, so that a failure here would be the
      build's fault and not the fork's.* `sim/fork/build.sh`, lean config,
      `ninja -j8`:

      | | |
      |---|---|
      | steps | 4,920 |
      | wall | **18m 37s** (estimate had been 30–60 min) |
      | build tree | 688 MB (estimate had been 4–6 GB) |
      | binary | `src/blender-fork-build/bin/blender`, 76 MB, reports 4.0.2 |
      | errors | none |

      Two configure fixes were needed, both environmental and both now in
      `build.sh`: `-DPYTHON_VERSION=3.12` (Blender 4.0 pins 3.10; this machine
      and Ubuntu's own package use 3.12), and *not* passing
      `WITH_OPENIMAGEIO=OFF`, since the unix platform file looks for it either
      way. **The disk warning was wrong by an order of magnitude** — 18 GB
      still free afterwards.

      **Running the binary needs one environment variable.** `ninja install`
      fails here (`cmake_install.cmake` wants `/usr/lib/python3/dist-packages/
      Cython`, which is not installed), so the binary has no bundled scripts
      and dies with `ModuleNotFoundError: No module named 'bpy_types'`. The
      fix needs no root and is better for development anyway — point it at the
      source tree's scripts:

      ```bash
      export BLENDER_SYSTEM_SCRIPTS=$PWD/src/blender-fork/scripts
      ```

- [x] **7. Prove both paths run.** *Done.* `sim/fork/bench.py` is the fixed
      workload — the circle skirt on its cone, headless, 3,887 cloth vertices
      against a 1,536-quad collider at the main program's settings. Run twice,
      `SEWING_CLOTH_FORK=0` then `1`: each announces which solver it took,
      both settle to the same `-19.6 .. 30.9 cm`, 329.4 against 332.0
      ms/frame.

      Two things the bench gets right that are easy to get wrong, both learned
      the hard way earlier in this project: frames are stepped **one at a
      time** (cloth only solves on a sequential step; a jump silently leaves
      the mesh where it was), and the mesh is **read back every frame**, so
      the depsgraph cannot skip evaluating what was solved.

      *Still unproven:* that the stock path inside this binary matches the
      **system** Blender's result on the same scene. The A/B above compares
      the two solvers to each other, not this build to Ubuntu's.

- [x] **7b. Make the fork say what it is doing.** *Done, same commit.*
      `SEWING_FORK_LOG=1` gives a line per frame with phase totals, `=2` adds
      one per substep. Timestamps are seconds since the first fork call, from
      a monotonic timer — a wall clock corrected mid-solve can step backwards
      (the point `docs/16-solvers.md` makes about the viewer's four clocks).

      **And it immediately overturned a claim made from reading the source.**
      One frame, 14 substeps, 184 ms:

      | phase | ms | share |
      |---|---|---|
      | collision | 75.6 | **41 %** |
      | force assembly | 64.1 | 35 % |
      | CG solve | 42.6 | 23 % |
      | other | 1.8 | 1 % |

      Earlier in this session I asserted the cost was "mostly a single-threaded
      CG run 14× per frame". It is not: the CG converges in **1–8 iterations
      against a cap of 100**, and is the *smallest* of the three phases. The
      expensive halves are collision and force assembly. Rule 1 — the
      measurement disagreed with the reading, and the measurement wins.

      Also now visible: `init`/`free` pairs repeat several times per setup,
      i.e. the solver is rebuilt more than once. Whether that is ordinary
      depsgraph behaviour or waste is open, and was invisible before.

- [x] **8. Profiling.** *Done* — tooling, a profiling build, verification of
      all four modes, and a first profile. **The how-to and the reprofiling
      loop are §2b; the result is §6.**

      - `valgrind`, `callgrind_annotate`, `kcachegrind`, `perf`, `heaptrack`,
        `hotspot` installed via `pkexec`.
      - **`PROFILE=1 sim/fork/build.sh`** builds a *second* tree at
        `src/blender-fork-build-profile` (22 min), `RelWithDebInfo` with
        `-fno-omit-frame-pointer -g`. Separate because switching
        `CMAKE_BUILD_TYPE` in place costs a full recompile and destroys the
        release baseline every timing so far was taken against;
        `RelWithDebInfo` rather than `Debug` because a `Debug` build is a
        different program for timing purposes — no inlining — and would
        profile the compiler's choices rather than ours.
      - **`sim/fork/profile.sh <mode> [fork|stock] [frames]`** — `time`,
        `perf`, `callgrind`, `heaptrack` — one workload, provenance written
        beside every result, a stale-binary guard, and a check that the
        solver asked for is the solver that ran.
      - **`kernel.perf_event_paranoid` lowered 4 → 1** via `pkexec sysctl -w`,
        on request, so `perf` needs no root. *Runtime only*: nothing was
        written to `/etc/sysctl.d/`, so it returns to 4 on reboot, and
        `profile.sh` detects that and falls back to `pkexec perf record`.
      - **All four modes were run against the fork, not assumed to work.**
        Each found a defect in the harness; they are recorded in §2b beside
        the thing each one changed.

      *Open:* a callgrind pass on **stock** for the record. The fork has one
      (§6); the two have not been put side by side at instruction level,
      though at wall clock they are 329.4 against 332.0 ms/frame.

      **A timing taken during a build is worthless, and this nearly caught
      me.** A smoke test read 1507 ms/frame against the 329 ms measured
      earlier on the same scene and binary — the whole difference being eight
      cores busy compiling. A number that disagrees with the baseline by 4× is
      a question about the measurement before it is a fact about the code.

      **Disk, after all of it: 6.3 GB free on a 100 %-full `/home`.** Not
      blocking any more, but worth keeping in view:

      | | size |
      |---|---|
      | `src/blender-fork-build-profile` | **5.9 GB** (debug binary alone: 852 MB) |
      | `src/blender-fork-build` | 832 MB |
      | `src/blender-fork` (incl. 138 MB `.git`) | 382 MB |
      | `out/profile` | ~1 GB and growing with each run |

      The pristine tree and its tarballs are **deleted** (~350 MB): redundant
      once the baseline lives in the fork repo as `f08e1a4`, tag
      `vanilla-4.0.2`, since `git diff master` answers what the second copy
      was kept for and `apt-get source blender` re-fetches it in seconds.
      References to `src/blender-4.0.2+dfsg` elsewhere are historical; live
      paths point into `src/blender-fork`. The real lever is the 5.9 GB
      profiling tree, which can go and be rebuilt in 22 min when next needed.

      > **Cost:** I estimated 4–6 GB for the *release* build and it took
      > 688 MB — wrong by an order of magnitude, and I said so. Then I did not
      > re-estimate for `RelWithDebInfo`, which is where that figure actually
      > applied: it took 5.9 GB. Being wrong in the cautious direction once is
      > not licence to stop estimating.

- [x] **9. Put the switch in the scene.** *Done, commit `002a9fc` plus the
      sewing repo's `sim/`.* The circle-skirt scene from
      [00-backtotrack.md](00-backtotrack.md) §3 now runs on this build with
      the solver selectable:

      ```bash
      sim/fork/run_skirt.sh [stock|fork]
      ```

      - `Cloth` gains a runtime `use_fork_solver` field. **Not DNA**: `Cloth`
        is rebuilt on every reset and never written to a `.blend`, so this
        changes no file format and needs no versioning — which is what the
        flags bit in §3 would have cost.
      - `sim/blender_skirt.py` gains a **Solver** field in the dialog and
        **Stock / Fork** buttons in the Skirt panel, with the running build
        named so a stock binary cannot silently ignore the choice.
      - The launcher sets `BLENDER_SYSTEM_SCRIPTS` (step 6) and builds the
        scene on startup, so the window opens with skirt and cone ready.

      Verified in one process, four resets, alternating stock/fork/stock/fork:
      each announced the solver it took and **all four settled to an identical
      77.537 cm**.

      **Two rough edges, left honest rather than hidden.** The sidebar opens
      on `Item`, not `Skirt`: `region.active_panel_category` refuses the
      assignment even with a retry loop, so the tab is one click away. And the
      dialog's Solver field *overwrites* what the panel buttons asked for,
      because adding a skirt sets the solver from its own property — defensible
      (the dialog is explicit) but surprising.

      **A note on method.** The first attempt at driving this UI used
      synthetic mouse clicks through `xdotool`. That was slower, depended on
      pixel positions that move with the layout, and stole focus from the
      person's terminal — one "screenshot of Blender" was a screenshot of the
      terminal. Blender's UI is a property tree; it should be set, not
      clicked.

- [x] **10. Pull codec sources as an assembly reference.** *Done.*
      `src/asm-reference/`, 115 MB, **453 hand-written assembly files**:

      | | asm files | licence | note |
      |---|---|---|---|
      | **dav1d** 1.4.1 | 102 | **BSD-2** | the modern reference: SSE/AVX2/AVX-512, clean macros |
      | **x264** 0.164 | 40 | GPL-2+ | the lineage most of this style descends from |
      | **ffmpeg** 6.1.1 | 311 | LGPL/GPL | the largest collection, `libavcodec/x86/` |

      VLC itself is not where the assembly lives — it links the codec
      libraries, and these are they. All three are **NASM, not intrinsics**:
      essentially zero `immintrin.h` across the lot, which is itself the
      lesson about how that world works.

      Assemblers: **`nasm` 2.16.01 and `yasm` 1.3.0 installed** (step 11).

      **Licence matters before any of it is borrowed.** Blender is GPL-2+.
      dav1d's BSD-2 lets technique *and* code cross; x264 (GPL-2+) and
      ffmpeg's GPL parts would need care about what enters the tree, and
      ffmpeg's LGPL parts more still. Reading any of them for technique is
      unrestricted; copying is not.

      **What the profile says about this plan, honestly.** Codec assembly
      wins because its work is dense, regular, fixed-size and branch-free —
      the same operation on every 8×8 block. Our hotspots are mostly not that:

      - `tree_overlap_traverse_cb` (17.7 % of instructions, 9.3 % of cycles)
        is **BVH traversal** — pointer chasing with data-dependent branches.
        SIMD helps little and hand assembly can only shave what the compiler
        already does well.
      - `mul_bfmatrix_lfvector` (1.8 % of instructions, **7.9 % of cycles**)
        is **memory-bound**. It is waiting on cache, not on arithmetic;
        faster instructions will not move it, and layout might.
      - What *does* fit: `create_kdop_hull` (7.8 % of instructions — computing
        14-DOP bounds is exactly the regular batchable work SIMD likes),
        `isect_seg_seg_v3` (5.0 % of cycles) and
        `closest_on_tri_to_point_v3` (2.6 %).

      So the reference is worth having, and dav1d is the right model for the
      three candidates above — but "optimise the hotspots with assembly" is
      not what the top of the profile is asking for. The top of the profile is
      asking about data structures and memory layout.

- [x] **11. Identify what this CPU can actually be told to use.** *Done.*

      **i7-4790 (Haswell).** Ceiling is **AVX2 + FMA3 + BMI2 + F16C** —
      256-bit integer and float vectors, fused multiply-add. **No AVX-512**;
      Haswell predates it. Full relevant set: `sse` `sse2` `sse3` `ssse3`
      `sse4_1` `sse4_2` `avx` `avx2` `fma` `bmi1` `bmi2` `f16c` `aes`
      `popcnt` `movbe` `abm` `erms` `rdrand` `xsave`. `gcc -march=native`
      agrees.

      **The gap, and it is the whole point of this step.** The solver is
      compiled with:

      ```
      -msse -msse2 -O2 -ffp-contract=off
      ```

      **No `-mavx` anywhere in the build** — 4,920 compile commands, not one
      above SSE2. That is not our configuration's doing: Blender's own
      `WITH_CPU_SIMD` (`CMakeLists.txt:1284`) tests for SSE and SSE2 **and
      nothing higher**. Cycles carries its own per-kernel AVX2 dispatch and
      Cycles is off in this build. So every hotspot in §6 —
      `create_kdop_hull`, `isect_seg_seg_v3`, `closest_on_tri_to_point_v3`,
      `mul_bfmatrix_lfvector` — runs 128-bit code on a 256-bit machine.

      **Two facts that protect the "same answer" requirement:**

      - `-ffp-contract=off` is deliberate in Blender's build, so `-mfma`
        alone changes no result: the compiler will not fuse multiply-add.
        Allowing contraction *would* change results slightly, and is a
        separate decision from widening the vectors.
      - `-ffast-math` is **not** applied to the solver (only to
        `libc_compat`). Without `-fassociative-math` the compiler may not
        reorder floating-point reductions, so widening to AVX2 should stay
        bit-identical for element-wise work — and the bench's settled-`z`
        check catches it if it does not.

      **`nasm` 2.16.01 and `yasm` 1.3.0 installed**, closing step 10's gap.

      *Open — the proposed change, not yet made:* per-file compile options on
      the **fork's two files only**, leaving stock at SSE2, so the A/B
      measures exactly what changed, in one binary, with no third build tree:

      ```cmake
      set_source_files_properties(
        intern/SIMFORK_mass_spring.cc intern/implicit_blender_fork.cc
        PROPERTIES COMPILE_OPTIONS "-mavx2;-mfma;-mbmi2;-mf16c")
      ```

      Rejected for now: `-march=native` globally (recompiles everything,
      invalidates every timing taken so far, and changes stock as well as
      fork, so the comparison would measure the compiler rather than us).
      Noted as the portable alternative, and what dav1d and ffmpeg actually
      do: runtime CPUID dispatch via `target_clones` /
      `__attribute__((target("avx2")))`, which matters only if the binary has
      to run on another machine.

- [x] **12. Optimise the hot spots with hand-written assembly.** *Done,
      measured, committed `19125c9`.* Two kernels, both validated standalone
      before going near Blender, and §7 is the result.

      **12a. The matrix-vector product** (`SIMFORK_matvec_x86.asm`), the
      hotspot §6 named. Two AVX2 kernels for the 3x3-block multiply, plus the
      loop over blocks split into one chunk per hardware thread — the stock
      code is `#pragma omp parallel sections`, which is **two threads on an
      eight-thread machine**.

      Standalone, against the C it replaces: **bit-identical**, forward
      1.22x, transposed 1.54x. End to end: **2.3 %**, which does not clear
      this machine's ~3 % run-to-run noise. Amdahl — the part fixed was 8 %
      of the frame.

      > **A denormal, and a 7x slowdown.** The transposed kernel first came
      > out **0.14x** — seven times *slower* than the C. `fmatrix3x3` is 64
      > bytes with `m[3][3]` first and `c` at offset 36, so a 16-byte load of
      > row 2 pulls `c` — a vertex *index* — into lane 3. A small integer's
      > bit pattern read as a float is a **denormal** (1000 becomes 1.4e-42),
      > and multiplying denormals takes a microcode assist. Zeroing that lane
      > turned 0.14x into 1.54x. The forward kernel never hit it because
      > `VDPPS`'s mask does not multiply lane 3 at all.

      **12b. The collision narrow phase** (`SIMFORK_segseg_x86.asm`), which
      is where the time actually was once the cloth is in contact. Eight
      segment-to-segment solves at once in structure-of-arrays layout: a
      triangle-triangle test runs **nine** of them, independent, with the
      reduction afterwards — so the work arrives in exactly the bundles AVX2
      wants.

      Standalone: **bit-identical across all 32,768 test lanes**, **2.43x
      including the packing** the caller must pay for. End to end this took
      the fork from 529.5 to **509.6 ms/frame, 8.4 % faster than stock** —
      which does clear the noise.

      **Both kernels are bit-exact by construction, not by luck.** `VDPPS`
      with lane 3 masked computes `(p0+p1)+p2`, which is what `dot_v3v3` does
      left to right; `VDIVPS` rather than `VRCPPS`, whose 12-bit
      approximation would differ; and no FMA anywhere, matching the build's
      `-ffp-contract=off` (step 11).

      **The fork now owns a copy of `collision.cc`.** `SIMFORK_collision.cc`
      is the whole file inside `namespace simfork_collision`, with one
      `extern "C"` entry point. A namespace rather than renaming a dozen
      symbols: the includes stay outside it, so unqualified calls still find
      Blender's own functions. The catch was **ADL** — arguments like
      `Object *` live in the global namespace, so argument-dependent lookup
      drags the stock declarations in beside the copies and six call sites
      became ambiguous. They are qualified explicitly.

      *Open:* **the packing is now the cost.** The profile has
      `simfork_collision::compute_collision_point_tri_tri` at 22.08 % with
      `isect_seg_seg_v3` gone from the top entirely — and that 22 % includes
      the scalar transpose into SoA, which is still C. Doing the transpose in
      assembly is the next increment.

      *Open:* `closest_on_tri_to_point_v3` (9.54 %) is the same shape and is
      not batched yet.

- [x] **13. Group the matrix blocks by output row.** *Done, and it was not a
      trade.* The chunked version from step 12a was 2.3 % faster and moved
      the drape. Grouping by output row is **8.5 % faster and bit-identical**
      — both halves, from one change.

      Two row-oriented kernels (`simfork_row_fwd_avx2`, `simfork_row_T_avx2`)
      take a list of blocks that share an output row, accumulate the whole
      row in a register and store once. The C side builds that list by
      counting sort, once per solver state: the sparsity pattern is fixed for
      a solve — springs do not appear or vanish mid-fall, only their values
      change — so it is reused by every CG iteration of every substep.

      **Why it is exact.** Stock computes `to[v]` as (sum of transposed
      contributions) + (sum of forward contributions), each in ascending
      block order. Each thread here owns whole rows and keeps those two sums
      separate in that same order, so the sequence of roundings is
      unchanged. No reduction exists to perturb it — which is also why it is
      faster: one store per row instead of a read-modify-write per block, and
      all eight threads instead of the stock code's two OpenMP sections.

      **The cache key is not just the pointer.** A freed matrix and a new one
      can share an address, so three sampled blocks are checked against the
      index that claims to describe them before it is reused.

      > **An instrument that should have existed first.** The divergence in
      > step 12a was found through a z-range printed to one decimal place,
      > which cannot tell "same drape" from "same bits". `bench.py` now
      > prints an FNV-1a checksum over every coordinate of every vertex.
      > Stock and fork both give `18a1be65f6d9fffd` after 40 frames. Had that
      > existed before the first parallel attempt, the divergence would have
      > been caught on the first run rather than argued about afterwards.

- [x] **14. Build the eight lanes with VPERMPS instead of transposing in C.**
      *Done, commit `61513eb`.* The nine edge pairs of a triangle-triangle
      test are every combination of three a-edges with three b-edges, so lane
      `l` is simply `(a[l/3], b[l%3])` — a **fixed permutation of six
      vertices, not a gather**. Four `VPERMPS` per component, from two
      registers.

      The scalar transpose it replaced was 96 loads and 96 stores per test,
      and step 12 had left it inside the 22 % that
      `compute_collision_point_tri_tri` cost: staging data the hardware could
      permute in four instructions.

      **4.13x standalone** against pack-in-C plus the previous kernel, and
      **bit-identical across 20,000 triangles** — the arithmetic is
      untouched, only where the lanes come from. End to end: 487.0 →
      **472.7 ms/frame, 11.5 % faster than stock**.

- [x] **15. Six closest-point-on-triangle queries at once, branchlessly.**
      *Done, commit `0cac90b`.* The last of the three narrow-phase hotspots,
      9.54 % of cycles.

      This one does not look like SIMD work at first: the scalar version
      returns early from one of **seven Voronoi regions** — three vertices,
      three edges, the face. Lanes cannot branch independently, so the kernel
      evaluates all seven and selects with `VBLENDVPS` **applied in reverse
      priority**, leaving standing the region the scalar code would have
      returned from first. Each lane's arithmetic is then exactly what the
      scalar code performs for that lane, in the same order.

      Six useful lanes of eight: A's three vertices against triangle B, then
      B's three against A. Inactive lanes divide by zero and produce
      infinities, which are blended away and never stored.

      Verified on 20,000 random triangles: **0 of 360,000 values differ**,
      **2.59x** standalone. End to end: 472.7 → **448.1 ms/frame, 16.5 %
      faster than stock**, both sides hashing to `36ec79781ddd5da8`.

- [x] **16. Start the wasm fork.** *Done as a skeleton, commit `5683e2c` in
      `src/sewcloth`.* §8 is the detail. The observation that prompted it:
      **adherence to Blender is what blocks the remaining optimisations**,
      and for a browser target it blocks everything.

      Measured, not asserted — each of these is a constraint Blender imposes
      that the second fork simply does not have:

      | constraint | imposed by | what it blocks |
      |---|---|---|
      | `-msse -msse2` | `WITH_CPU_SIMD` stops at SSE2 | the compiler cannot emit AVX2 at all; five kernels were hand-written to get round it |
      | `-ffp-contract=off` | Blender's build | no FMA — which is both faster *and* more accurate |
      | 64-byte `fmatrix3x3` | a struct shared with the rest of Blender | 31 % of every fetched cache line is dead fields |
      | bit-identity | our own A/B discipline | no reordering, no better summation, no layout change |
      | DNA / Depsgraph / Object | Blender's architecture | the `init`/`free` churn in step 7b, and the whole awkwardness of a wasm build |

      **The feasibility probe came first.** `implicit_blender_fork.cc`
      compiles to wasm with **one** `-D` (for `CLOTH_OPENMP_LIMIT`, which
      exists only when Blender defines `_OPENMP`) and produces a 40 KB
      object. So the numerical core is portable; it is the plumbing that is
      not.

- [x] **17a. Springs.** *Done, commit `16a6be8`.* The first third of the
      middle, checked against two answers known in advance rather than
      against a previous run of itself:

      | | measured | exact |
      |---|---|---|
      | hanging extension = `mg/k` | 0.49050 cm | 0.49050 |
      | period = `2π√(m/k)` | 0.14050 s | 0.14050 |

      and the first of those again **through the wasm boundary**, which is
      what proves `sc_set_springs`, the fabric parameters and the force path
      all cross intact rather than merely compiling.

      Each spring writes equal and opposite force to both ends, so momentum
      is conserved however the loop is ordered — which is what will allow
      parallelising by partitioning springs later, the same property step 13
      needed for the matrix-vector product.

      **`sc_max_stable_step()` publishes the explicit integrator's limit**,
      `h < 2/ω`. The smoke test asks for it and derives 2 substeps per frame
      at tension 2000, rather than a number that happened to work. That
      figure is also the argument for what comes next: a real fabric's
      stiffness is thousands and the limit falls below a frame.

      > **The period test failed first, and the solver was right.** Counting
      > integer zero-crossings over 2 s quantises the answer — 14.23 periods
      > give 28 countable crossings where 28.47 occur, so it read 0.1429
      > against a true 0.1405, a 1.7 % "error" that was entirely the ruler.
      > Crossing times are now interpolated. Second test this session that
      > was wrong rather than the code, and both times **the tolerance was
      > the tell**: one too wide to exclude damping, one too coarse to
      > resolve a period.

- [x] **18. Expose the fabric, and ask the reference what it does.** *Done;
      `sim/blender_skirt.py` uncommitted in the sewing repo.* §9 is the
      result.

      The dialog had geometry and three cost knobs and **no fabric
      parameters at all** — tension, compression, shear, bending, mass and
      air damping were silently Blender's defaults. It now exposes Blender's
      own settings, named as Blender names them, defaulting to Blender's
      defaults, and verified to reach the modifier (asked 15 / 150 / 1500,
      modifier reports 15 / 150 / 1500).

      > **A parameter cited from the wrong place.** I pointed at
      > `shearLockDeg` as the shear control. It is not in the dialog, it is
      > not Blender's, and it comes from this repo's own fabric data — which
      > is outside the reference. Blender's counterpart is
      > `shear_stiffness`. **The reference is Blender's solver and nothing
      > else**; figures from this project's own measurements are not
      > evidence here, and I had quoted two of them in the same argument.

- [ ] **17b. The implicit solve.** What makes stiff cloth behave. Here the
      Blender fork stops being a constraint and becomes the reference: its
      CG and matrix structure are the thing to port, with the oracle to check
      against.

- [ ] **17c. Collision.** A BVH and the narrow-phase math — the half
      [11-cloth.md](11-cloth.md) says is the whole reason this project went
      to Blender in the first place.

## 2b. Profiling: how, and how to do it again

Everything below was run, not reasoned about. Four defects in the harness
turned up in the running of it, each noted where it bit.

### The commands

```bash
sim/fork/profile.sh time      [fork|stock] [frames]   # wall clock, release build
sim/fork/profile.sh perf      [fork|stock] [frames]   # sampled, where the time goes
sim/fork/profile.sh callgrind [fork|stock] [frames]   # exact, where the instructions go
sim/fork/profile.sh heaptrack [fork|stock] [frames]   # allocation churn
```

All four drive one workload — `sim/fork/bench.py`, the circle skirt on its
cone — and write to `out/profile/` with a `.provenance` file beside each
result naming the binary, its build time, the fork revision (`-dirty` if the
tree has uncommitted changes), the solver and the frame count.

### Which binary, and why it differs by mode

| mode | binary | because |
|---|---|---|
| `time` | **release** (`src/blender-fork-build`) | timings must be comparable with the baseline; `RelWithDebInfo` is a different program — different inlining, frame pointers kept |
| everything else | **profiling** (`src/blender-fork-build-profile`) | needs the debug info that turns addresses into function names |

> **Defect found:** `time` mode originally used the profiling binary, so its
> numbers would have been quietly incomparable with the 329 ms/frame baseline.
> A "faster" number from the wrong binary is the easiest self-deception here.

### Frame counts

| mode | frames | why |
|---|---|---|
| `time` | 60+ | averages over the fall; short runs are dominated by the first frames |
| `perf` | 12–60 | sampling needs enough samples; 12 gives ~3k |
| `callgrind` | 2–3 | 20–50× slowdown, and one frame has the same shape as a hundred |
| `heaptrack` | 5–10 | allocation pattern repeats per frame |

### Reprofiling after a change to the fork — the whole loop

1. **Edit** under `src/blender-fork/source/blender/simulation/` (or
   `cloth.cc`). Commit, or at least know the tree is dirty — the provenance
   file will say `-dirty` and that is a warning, not a label.
2. **Rebuild both trees.** Incremental, seconds to a couple of minutes:

   ```bash
   sim/fork/build.sh              # release  -- for timings
   PROFILE=1 sim/fork/build.sh    # profiling -- for profiles
   ```

   Forgetting one is the classic reprofiling mistake: edit, forget to
   rebuild, measure yesterday's code, credit the difference to the change.
   `profile.sh` **refuses to run** if any solver source is newer than the
   binary it is about to profile, and says which file.
3. **Quiet the machine.** No builds, no other Blender. A timing taken while
   eight cores were compiling read 1507 ms/frame against a true 329.
4. **Timing first, both solvers**, on the release build:

   ```bash
   sim/fork/profile.sh time stock 60
   sim/fork/profile.sh time fork 60
   ```

   The question a change has to answer is "faster, same answer" — so compare
   both the ms/frame *and* the settled `z` range the bench prints. A speed-up
   that moves the cloth is not a speed-up.
5. **Then the profile**, to see where the remaining time went:

   ```bash
   sim/fork/profile.sh perf fork 30        # fast, sampled, flat self-cost
   sim/fork/profile.sh callgrind fork 3    # slow, exact, instruction counts
   ```
6. **Compare against the previous run** by reading the two `.provenance`
   files, not by memory. Callgrind counts *instructions*, so its numbers are
   stable across machine noise and are the better before/after comparison;
   `perf` counts *cycles*, so it reflects cache and threading but wobbles
   run to run.

### What the tools do and do not tell you

- **callgrind** counts instructions exactly, serialises threads, and runs
  20–50× slow. Proportions and call counts, never "how long".
- **perf** samples real cycles on real threads. Needs
  `kernel.perf_event_paranoid ≤ 2` (now 1, runtime only — back to 4 on
  reboot; `profile.sh` falls back to `pkexec` automatically if it finds it
  raised).
- **heaptrack** is about allocation, not time. Its text output buries the
  summary; `heaptrack_gui` on the `.zst` is the real tool.

> **Defect found:** callgrind at 2 frames spent **18 % of its instructions in
> OpenImageIO's startup and 6 % in the dynamic linker** — process startup
> swamping the thing being measured. It now collects only between entry and
> exit of `SIM_cloth_solve` / `SIMFORK_cloth_solve` (`--toggle-collect`), so
> the totals are the solve and nothing else.

> **Defect found, and the worst of the four:** `profile.sh perf fork` ran the
> **stock** solver while printing `solver : fork` in its own header. The add
> operator has a `solver` property of its own, and an unset property still
> has a value, so every scripted `circle_skirt_add()` reset the choice to
> `STOCK` after the harness had asked for the fork. Fixed on both ends — the
> operator only imposes a solver when one was explicitly set, and the bench
> passes it explicitly — and **every mode now greps its own log afterwards**
> and prints `confirmed: the FORK solver ran`, or complains that the profile
> is mislabelled. A harness that cannot prove what it measured is worth less
> than no harness.

## 3. How the solver is chosen

`SEWING_CLOTH_FORK` says what is *wanted*; `Cloth::use_fork_solver` records
what a given cloth object is *running*, fixed when its solver state is built.
A change therefore lands on the next init — Reset in the UI — and never
mid-fall. The dialog and the panel buttons set the environment variable; the
launcher sets it from the command line; `bench.py` and `profile.sh` set it per
run.

**Still rejected, and why.** A flag bit in `ClothSimSettings.flags` (bit 16 is
free) with an RNA property and a checkbox in Blender's Physics panel. It buys
a setting saved in the `.blend` — worth having once the fork computes
something different, not before — and costs three more patched files to rebase
on every change. The runtime field in step 9 gets the per-object behaviour
without touching the file format at all.

## 4. Also rejected earlier, recorded so it is not revisited

- **Loading a fork as a plugin.** Blender has no C plugin ABI; add-ons are
  Python only.
- **An FFI `.so` linked against this Blender's internals.** `/usr/bin/blender`
  is stripped and exports 89 dynamic symbols, none of them `BLI_*` or `MEM_*`;
  no `blender-dbgsym` is available from the configured repos.
- **A self-contained `.so` driven by ctypes.** Feasible — `implicit_blender.cc`
  compiles standalone and clean outside the tree, needing only `MEM_callocN` /
  `MEM_freeN` shims — but it leaves Blender's `collision.cc` behind, and
  collision is the reason this project uses Blender at all
  ([11-cloth.md](11-cloth.md)). Rebuilding keeps the real collider.

## 5. What this does not do

It does not change what the fork computes. The two solvers are the same code
under two names, which is the point: a baseline from the same binary, on the
same scene, before anything diverges.

**What to change first is now a measured question, and §6 answers it with
names.** The candidates, in the order the profile puts them: the BVH broad
phase (~36 %), bending-spring force assembly (~8 %), then everything else.
Which of those is *worth* changing is a separate judgement — Blender's BVH is
shared with the rest of the program and the collision it feeds is the reason
this project uses Blender at all ([11-cloth.md](11-cloth.md)).

## 6. The first profile — where the time actually goes

Both profiles below are of the **fork**, at `002a9fc`, 2026-10-16, on
the one workload (`bench.py`: the circle skirt on its cone, 3,887 cloth
vertices, quality 14 / collision 12 / self-collision on). Raw output and
provenance are in `out/profile/`.

> The provenance files from these runs say `002a9fc-dirty`. The source was
> **not** dirty: `profile.sh` derives that flag from `git status
> --porcelain`, and Blender had left `__pycache__` directories in its own
> scripts tree — untracked junk, counted as a change. Fixed in `1d5ef44` by
> ignoring them, so the flag means something from here on.

### Instruction counts (callgrind, 2 frames, collected only inside `SIMFORK_cloth_solve`)

| share | function | file |
|---|---|---|
| 17.7 % | `tree_overlap_traverse_cb'2` | `BLI_kdopbvh.c` |
| 8.2 % | (libgomp — OpenMP runtime) | |
| 7.8 % | `create_kdop_hull` | `BLI_kdopbvh.c` |
| 5.3 % | `BLI_bvhtree_update_tree` | `BLI_kdopbvh.c` |
| 4.8 % | (libgomp) | |
| 4.7 % | `cloth_bvh_self_overlap_cb` | `collision.cc` |
| 4.5 % + 3.8 % | `SIMFORK_mass_spring_force_spring_angular` | `implicit_blender_fork.cc` |
| 3.1 % | `isect_seg_seg_v3` | inlined math |
| 3.1 % | `bvhtree_node_inflate` | `BLI_kdopbvh.c` |
| 2.8 % | `SIMFORK_mass_spring_solve_velocities` | `implicit_blender_fork.cc` |
| 1.8 % | `mul_bfmatrix_lfvector` `._omp_fn.0` | `implicit_blender_fork.cc` |

**The BVH is the single biggest cost: ~36 % across
`tree_overlap_traverse_cb`, `create_kdop_hull`, `BLI_bvhtree_update_tree` and
`bvhtree_node_inflate`** — building and traversing bounding-volume hierarchies,
not solving anything. That is consistent with step 7b's phase timings
(collision 41 %) and sharpens them: the cost is in the broad phase, before any
triangle pair is tested.

### The same run, sampled (perf, 12 frames, cycles)

Callgrind counts instructions with threads serialised; `perf` counts cycles on
the threads as they really run. They rank differently, and the difference is
itself information:

| self | symbol |
|---|---|
| 9.3 % | `tree_overlap_traverse_cb` |
| 7.9 % | `mul_bfmatrix_lfvector` `._omp_fn.0` |
| 5.0 % | `isect_seg_seg_v3` |
| 4.2 % | (kernel) |
| 3.9 % | `compute_collision_point_tri_tri` |
| 3.8 % | `SIMFORK_mass_spring_force_spring_angular` |
| 2.7 % | `create_kdop_hull` |
| 2.7 % | `BLI_bvhtree_update_tree` |
| 2.6 % | `closest_on_tri_to_point_v3` |
| 2.1 % | `SIMFORK_mass_spring_solve_velocities` |
| 1.8 % | `cloth_bvh_self_overlap_cb` |

plus **~13 % spread across libgomp** — the OpenMP runtime itself, i.e. the
cost of threading rather than of work. `mul_bfmatrix_lfvector` rises from
1.8 % of instructions to 7.9 % of cycles, which is what a memory-bound sparse
matrix-vector product looks like: few instructions, much waiting.

**Read the two together.** Callgrind says where the *work* is (BVH, ~36 %);
perf says where the *time* is (BVH still first, but the parallel
matrix-vector product and the OpenMP runtime take a much larger share once
real threads and cache are in play). A change that reduced instructions in
`mul_bfmatrix_lfvector` would look small to callgrind and matter to the clock.

### What this suggests, and what it does not

**Bending springs are the largest single solver cost**, at 8.3 % combined for
`force_spring_angular` — which connects to this project's own finding that the
bending model needs 16× the default budget to converge
([18-validation.md](18-validation.md) §6.8).

**A third correction to the same claim.** `perf` shows
`mul_bfmatrix_lfvector ._omp_fn.0` and ~13 % of samples inside libgomp: the CG
solve **is** OpenMP-parallel in this build. I said earlier the pragmas were
commented out and the solve was single-threaded. One pragma survives at
`implicit_blender.cc:595`, the build carries `-fopenmp`, and the profile shows
it running. That is the third time this session a claim read off the source
has been corrected by a measurement, which is rule 1 stated as a pattern
rather than a maxim.

## 7. What the assembly bought

Same scene, same binary, 60 frames, machine otherwise idle:

| step | ms/frame | vs stock | drape |
|---|---|---|---|
| stock | 536.7 | — | reference |
| 12a matvec chunked + all cores | 529.5 | 2.3 % | **diverged ~1 cm** |
| 12b + batched segment-segment | 509.6 | 8.4 % | diverged ~1 cm |
| 13 + blocks grouped by output row | 487.0 | 8.5 % | **bit-identical** |
| 14 + packing fused into the kernel | 472.7 | 11.5 % | bit-identical |
| **15 + closest-point batched** | **448.1** | **16.5 %** | **bit-identical** |

(Each row was measured against a stock run taken the same afternoon; stock's
own spread across runs is ~3 %, which is why early percentages move less than
the times do.)

**Read the noise before reading the win.** Stock measured 542.0 ms/frame on
one run and 556.5 on another — about 3 % apart on identical code. The 2.3 %
from the matvec work therefore proves nothing on its own; the 8.4 % does.
This is why the bench reports the settled `z` range alongside the time: a
change has to be *faster* and *the same*, and only one of those is visible in
a stopwatch.

**The divergence in rows 2 and 3, and why it was never the assembly.** Those
two settled to −5.2 .. 47.9 cm where stock gives −6.1 .. 46.8 — about a
centimetre after only 60 frames. Every kernel was bit-identical to the C it
replaced, verified lane by lane; the culprit was the **parallel reduction**
in the matvec, summing eight partial vectors instead of one running total.
A different sequence of roundings, and cloth is chaotic enough to amplify it.
What pinned the cause was that rows 2 and 3 settled *identically to each
other*: adding the collision kernel changed the time and not the result.

**That was fixed by step 13, and the fix was also the faster option.**
Grouping the blocks by output row gives each thread a disjoint set of output
vertices, so there is no reduction at all and the summation order is the
serial one again. Bit-identity and a further speed-up turned out to be the
same piece of work — which is worth remembering the next time a change seems
to demand trading one for the other.

*Still unexploited:* the block struct is 64 bytes of which the matvec reads
44 (`n1..n3`, `vcount` and `scount` are never touched), so **31 % of every
cache line fetched is waste**. Repacking the hot fields would cut the
streamed bytes by a third.

### Where the time was, at the last profile

Taken after step 12 and **before steps 13–15**, so it is already out of date
— re-profiling is the first open item:

| | before | after step 12 |
|---|---|---|
| `isect_seg_seg_v3` | 14.95 % | — (absorbed into the batched kernel) |
| `compute_collision_point_tri_tri` | 13.42 % | 22.08 % — **including the scalar SoA packing**, which step 14 then removed |
| `closest_on_tri_to_point_v3` | 9.09 % | 9.54 % — batched in step 15 |
| `tree_overlap_traverse_cb` | 4.33 % | 4.58 % |
| matvec kernels | 7.9 % (`mul_bfmatrix_lfvector`) | 3.07 % + ~2 % |
| libgomp | ~13 % | gone — TBB replaced the OpenMP sections |

### The five kernels

| file | what it does | standalone | exact |
|---|---|---|---|
| `SIMFORK_matvec_x86.asm` | 3x3 block multiply, two directions | 1.22x / 1.54x | yes |
| ″ (row form) | a whole output row, accumulated in a register | — | yes |
| `SIMFORK_segseg_x86.asm` | 8 segment-segment solves, SoA | 2.43x | yes |
| ″ (fused) | the same, lanes built with `VPERMPS` | 4.13x | yes |
| `SIMFORK_closest_x86.asm` | 6 closest-point-on-triangle, branchless | 2.59x | yes |

Every one was validated against the C it replaces **before** being wired into
Blender — a standalone harness with random inputs, compared bit for bit. Two
of them were wrong on the first run (a denormal; two NASM operand forms), and
both were caught in seconds rather than inside a 500 ms/frame simulation.

**A profile is of a moment, not of a program.** These rankings move with the
frame count, because the frame count decides what the cloth is *doing*:
profiled at 12 frames the skirt is still falling and the BVH broad phase
leads; at 20 frames it has landed and the narrow phase does. §6's ordering
was taken during the fall. Compare like with like, or compare nothing.

## 8. sewcloth — the second fork, for the browser

`src/sewcloth`, **its own git repository on purpose** — it is meant to be
reusable, depends on nothing else in this project, and can be moved out of
`src/` without carrying a tail. Two commits: `5683e2c` the skeleton,
`16a6be8` springs.

### The contract, which is the opposite of the first fork's

| | `src/blender-fork` | `src/sewcloth` |
|---|---|---|
| contract | **bit-identical to stock** | **as fast as the hardware allows** |
| role | the oracle | the product |
| target | x86-64, inside Blender | x86-64 **and wasm32**, standalone |
| checked against | stock, in the same binary | the oracle, within a stated tolerance |

Breaking bit-identity is safe here for one reason only: **there is now
something to diverge from**. A standalone solver with nothing to check it
against is exactly the position this project was in when
[11-cloth.md](11-cloth.md) was written.

### Built top-down and bottom-up, meeting in the middle later

- **Top** — `include/sewcloth.h`, what three.js calls. `sc_positions()`
  returns a pointer into the module's memory that never moves, so the JS side
  builds one `Float32Array` view and feeds a `BufferGeometry` attribute with
  no marshalling per frame. That is the only real reason to put a solver in
  wasm rather than write one in JS.
- **Bottom** — `src/kernels.h`, leaf operations in structure-of-arrays
  layout, each small enough to check exactly. SoA because nothing here is
  shared with another program's struct.
- **Middle** — **springs are in** (step 17a) and exact against two closed
  forms. The implicit solve and collision are **missing**, and
  `sc_capabilities()` reports that rather than letting a caller find out by
  watching cloth fall through a body.

`./build.sh` runs the native kernel tests, emits both wasm flavours and runs
the smoke test. **13,702 bytes** of wasm.

### Everything it claims is checked against a closed form

Not against a previous run of itself, which is the trap a solver with no
reference falls into:

| | measured | exact |
|---|---|---|
| free fall, 1 s, 64 substeps | −490.63 cm | −490.50 |
| hanging extension `mg/k` | 0.49050 cm | 0.49050 |
| period `2π√(m/k)` | 0.14050 s | 0.14050 |
| the extension again, via wasm | 0.491 cm | 0.490 |

The last row is the one that matters for the port: it proves the parameters
and the force path survive the module boundary, not merely that the C
compiles for a second target.

**`sc_max_stable_step()`** publishes `h < 2/ω`, the explicit integrator's
limit, so a caller derives substeps from the fabric rather than from a
number that once worked. At tension 2000 it gives 4.47e-2 s — two substeps a
frame. A real fabric's stiffness is thousands, the limit falls below a
frame, and that is precisely the case for 17b.

### It answered an item this project has carried open for weeks

[19-todo.md](19-todo.md)'s one remaining queue entry is "validate the time
integration against two closed forms", unanswered because nothing here ever
checked the integrator itself. For *this* integrator it is answered on day
one — 1 s of free fall, stepped exactly as the solver steps:

| substeps | fallen (cm) | exact |
|---|---|---|
| 1 | −498.67 | −490.50 |
| 8 | −491.52 | −490.50 |
| 64 | −490.63 | −490.50 |

Semi-implicit Euler's bias, shrinking with `dt` as it must. This says nothing
about Blender's integrator; that half of the queue item stands.

> **And a second test that was wrong rather than the code.** The period check
> counted integer zero-crossings over 2 s: 14.23 periods offer 28 countable
> crossings where 28.47 occur, so it read 0.1429 against a true 0.1405 — a
> 1.7 % discrepancy that was entirely the ruler. Crossing times are
> interpolated now. Both of this section's bad tests were caught by the same
> smell: **the tolerance**, once too wide to exclude an effect and once too
> coarse to resolve one.

> **A test that passed for the wrong reason.** The one-second check first sat
> inside a tolerance wide enough to also swallow the default 0.999 damping —
> 6 % of velocity over 60 substeps, about 2 cm. It looked fine, and only
> failed when the run was extended to two seconds and the loss compounded to
> 62 cm. Free fall has no drag, so the test now asks for none and the
> tolerance covers the integrator's bias and nothing else. A tolerance wide
> enough to hide an effect is not a test of the thing its name claims.

### What does not come across from the first fork

- **The assembly.** wasm has SIMD128 — four-wide — not AVX2's eight. The
  kernels would be rewritten as `wasm_simd128` intrinsics at half width.
  Per-operation bit-identity is still reachable (wasm float ops are
  IEEE-754); the *speedups* are not.
- **The threads.** The row-grouped matvec's win came from eight cores. In
  wasm that means pthreads → `SharedArrayBuffer` → the page must be
  cross-origin isolated (COOP/COEP). `python3 -m http.server`, which this
  project uses, sends neither. Single-threaded is the realistic default.
- **The collider.** `collision.cc` is the entangled half and the reason this
  project uses Blender at all. Porting it means porting the BVH too.

### Environment notes, met and worked around

Ubuntu's emscripten is **3.1.6** (2022). Its ES6 output references
`__dirname`, which Node's ESM scope does not define, and Node 18's global
`fetch` makes it take the browser path when loading its own `.wasm`. So the
build emits **two flavours** — ESM for the browser, CommonJS for the tests —
and the test hands the module its `wasmBinary` directly rather than letting
it locate the file.

### Licence

Derived from Blender's solver, so GPL-2.0-or-later. A `.wasm` served from a
page is distribution: the source has to be offered with it. That follows the
file wherever it goes.

## 9. What strain the reference actually allows

Measured from Blender, on the standard scene, 7,605 edges, 60 frames. Rest
length is the edge **as cut** — the base mesh before anything moves, checked
against the frame-1 evaluated mesh and drifting **0.0000 %**, so the baseline
is the geometry and not an artefact of the first step.

### At Blender's default fabric, the cloth is not stiff at all

| | strain |
|---|---|
| median | −0.019 % |
| p95 | **26.6 %** |
| p99 | 65.4 % |
| max | 81.6 % |

Bimodal, and the shape is the finding: nine edges in ten hold their length to
within a fiftieth of a percent, while **676 edges stretch past 10 % and every
one of them is circumferential** — not one radial. That is the waist hole
being dragged down and stretched over the widening cone by the weight below
it. About 24 cm of the skirt's apparent drop at this stiffness is spring
stretch rather than drape.

### Stiffen it and it becomes nearly inextensible — but only once converged

| tension | quality | p95 | max | over 10 % | hem z |
|---|---|---|---|---|---|
| 15 (default) | 14 | 26.6 % | 81.6 % | 8.89 % | −6.1 cm |
| 150 | 14 | 3.04 % | 28.4 % | 1.80 % | 18.1 cm |
| 1500 | 14 | 1.85 % | **162 %** | 0.87 % | 16.9 cm |
| 1500 | **30** | **0.37 %** | 12.6 % | 0.05 % | 21.5 cm |
| 1500 | 60 | 0.37 % | 12.6 % | 0.05 % | 21.5 cm |

**The 162 % maximum at quality 14 was the solver, not the material.** p95 was
still improving while the worst edge got five times worse — the signature of
local under-resolution — and doubling the substeps removed it. Quality 30 and
60 agree **exactly**, so the result is converged at 30, and the drape moved
4.6 cm between 14 and 30: at quality 14 the stiff cloth was not merely ragged
in a few edges, it was hanging in the wrong place.

### What that settles about rigid rods

The intuition — that past some point springs stop stretching and behave like
rods — **is what the reference does**, at a stiffness that is converged:
p95 0.37 %, and the few edges past 10 % are a handful out of 7,605. It did
not look that way at first only because Blender's default tension of 15 is
soft.

So the choice is now between two measured things rather than two arguments:

1. **Stiffen and raise quality.** Reference behaviour, nearly inextensible,
   at about **2x the substeps** (14 → 30). Implicit integration is what makes
   that affordable; explicit at the same stiffness would need hundreds.
2. **Rigid constraints or strain limiting.** Cheaper per step, and reaches
   near-inextensibility by a different mechanism — so its agreement with
   Blender would have to be stated as a measured difference, not assumed.

The second is worth building only if the first proves too slow in a browser.
That is now a number to go and get, not a judgement call.
