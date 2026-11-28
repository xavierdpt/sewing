# 08 — What You Can Install Locally

Checked against this machine: **Linux Mint 22.3** (Ubuntu 24.04 "noble" base),
`inkscape`, `python3-numpy`, `python3-scipy` and `libsdl2-dev` already present.
Everything below is `apt-cache policy` output, not guesswork.

**Node, re-measured 2026-11-28:** `node -v` is **v24.15.0** and `npm -v` is
**11.12.1**, both from `~/.nvm/versions/node/v24.15.0/bin`. Apt's `nodejs` is still
18.19.1 and is no longer what runs. This document said "node v18.19.1, `npm` **not**
installed" until that measurement; nvm has been installed since, and §5 below is
corrected with it.

## 1. Photogrammetry: pictures → 3D mesh

**The one that matters is `colmap` (3.9.1), and it is packaged.** That is the whole
structure-from-motion + multi-view-stereo pipeline, GUI and CLI.

| Package | Version | What it is |
|---|---|---|
| **colmap** | 3.9.1-2build2 | **SfM + MVS. The core tool.** |
| meshlab | 2020.09 | mesh cleanup, Poisson reconstruction, decimation, measurement |
| cloudcompare | 2.11.3 | point-cloud alignment, scaling, cross-sections |
| blender | 4.0.2 | modelling, retopology, **the Export Paper Model unfolder** |
| python3-opencv / libopencv-dev | 4.6.0 | camera calibration, undistortion, marker detection |
| libpcl-dev / pcl-tools | 1.14.0 | point-cloud filtering and surface reconstruction |
| hugin + enblend | 2023.0 | lens calibration; useful for getting intrinsics right |
| ffmpeg | 6.1.1 | pull frames out of a video walk-around |

**Not packaged** (would need building from source or a Flatpak/AppImage): `openmvg`,
`openmvs`, `meshroom`/`alicevision`, `micmac`, `python3-open3d`, `python3-trimesh`,
`python3-pymeshlab`, `libigl-dev`.

Of those, the painful omission is **openmvs** — COLMAP's own dense stage is fine, so
it is not blocking. `libigl-dev` missing is why [04-software.md](04-software.md)
recommends staying in JavaScript rather than planning on libigl.

```bash
sudo apt install colmap meshlab cloudcompare blender python3-opencv ffmpeg
```

### The pipeline for a duct-tape dress form

A dress form is a much better photogrammetry subject than a person: it holds still, you
can mark it, and you can matte it.

1. **Prep.** Matte it — a dusting of talc or a matte spray. Photogrammetry fails on
   anything shiny, and duct tape is shiny. Stick 20–30 asymmetric paper markers
   (circles with different numbers) over it; they give the matcher features on
   otherwise textureless tape. **Put a ruler or two printed ArUco markers of known
   size in frame** — this is how you get real scale, and without it the mesh is
   dimensionless and useless for patternmaking.
2. **Shoot.** Diffuse, even light, no flash, no window behind. Three horizontal
   orbits — low, eye level, high — about 60–80 frames total, 60–70 % overlap between
   consecutive frames. Keep focus and exposure locked. Move the camera, not the form.
3. **Reconstruct.**
   ```bash
   colmap automatic_reconstructor \
     --workspace_path ~/form-scan --image_path ~/form-scan/images \
     --quality high --dense 1
   ```
4. **Clean and scale** in MeshLab: Poisson surface reconstruction if you have a point
   cloud, remove the floor and background, fill holes, then scale so your ruler reads
   true. Decimate to ~20–50 k triangles.
5. **Crop** to the bodice band and shift the waist to `y = 0`.
6. **Export OBJ.** Note that **this project has nothing that reads it** — the body is
   generated from measurements and there is no mesh-import path. The recipe is kept
   because it is correct and the toolchain is installed; using it here would mean
   writing the importer.

The accuracy you need is about **±3 mm**, which is well inside what a phone camera and
COLMAP give you on a textured, marked, ruler-referenced object at 1 m.

## 2. There is no human body mesh in apt

I checked with `apt-file`. Searching every packaged `.obj`/`.stl`/`.ply`/`.off`/`.glb`
for human-shaped content returns: the **Atlas humanoid *robot*'s** torso STLs in
`dart-doc` and `libsimbody-dev`, a `Body_Hip.obj` from the same robotics data, some
glTF game avatars in `castle-game-engine-doc`, and the Stanford bunny in `glmark2-data`.
Nothing usable.

**The project does not need one.** The body is the parametric torso in
`app/js/body.js`, driven by tape measurements — which the premise demands anyway,
since the whole point is that standard bodies do not apply. So the absence above
costs nothing.

If you ever do want a mesh body rather than a generated one, check the licence first:
SMPL/SMPL-X is research-only.

## 3. Pattern output and fabrication

| Package | Version | Use |
|---|---|---|
| inkscape | 1.2.2 (**installed**) | final SVG tidy-up, tiling a pattern across A4 sheets |
| python3-ezdxf | 1.1.3 | DXF for laser cutters and plotters |
| librecad | 2.2.0 | 2D CAD if you want to check a draft |
| potrace | 1.16 | bitmap → vector, if you ever trace a scanned pattern |
| python3-shapely | 2.0.3 | polygon offsetting (seam allowances), boolean ops, nesting |
| gmsh | 4.12.1 | meshing, if you want a proper 2D triangulator |
| **blender** | 4.0.2 | **Export Paper Model** add-on: unfolds any mesh to a PDF/SVG net with seam marks and thickness compensation — a day-one stand-in for your own unfolder |

`python3-shapely` is the quiet workhorse here: `polygon.buffer(0.7)` is a seam
allowance, and that is most of what FreeSewing's offsetting does.

## 4. Solvers, if you go beyond the browser

| Package | Use |
|---|---|
| libeigen3-dev, libsuitesparse-dev | sparse linear algebra for LSCM/ARAP in C++ |
| libceres-dev (2.2.0) | non-linear least squares — the natural home for the fitting objective |
| libcgal-dev (5.6) | robust geometry predicates, mesh processing |
| python3-pulp, glpk-utils, coinor-libcbc-dev | integer programming, if you ever want to solve tile assignment exactly instead of by the three-phase heuristic |
| libnlopt-dev | gradient-free optimisation |
| python3-scipy (**installed**) | `scipy.sparse.linalg` does everything LSCM needs |

Tile assignment really is an integer program (choose a tile per face such that shared
edges agree), and `python3-pulp` + CBC would solve it exactly on a 200-tile shell. The
heuristic in `lattice.js` gets conflicts from 22 down to 6; an exact solve would get
them to 0 or prove it impossible. That is a good weekend project and a satisfying one.

## 5. Node

`app/` is built as a **static import-map directory with three.js vendored in** — no
build step, no `node_modules`, nothing to rot. It runs from `python3 -m http.server`
and the geometry modules run directly under `node`.

That started as a constraint: the machine had Node 18 from apt and no `npm` at all.
The constraint is gone — there is nvm-managed **Node 24.15.0 and npm 11.12.1** here
since 2026-11-28 — and **the decision stands anyway**, on the reasons that outlived
it: nothing to install before the page runs, nothing to rebuild after an edit, and no
dependency tree to go stale between sessions. It is a choice now rather than a
limitation, which is worth knowing before someone "fixes" it by adding a bundler.

The one place a toolchain *is* required is `kt/`, which is a real npm project with a
native module. It does not borrow the host's: its docker image installs the current
LTS from nodejs.org (v26.13.1 as of 2026-11-28, checksum-verified), so the tree builds
the same way on a machine that has no Node at all.

If you later want a bundler, install node 22 via `nvm` rather than apt; do not fight
the distro node.

## 6. One-line install for everything useful here

```bash
sudo apt install colmap meshlab cloudcompare blender python3-opencv ffmpeg \
                 python3-shapely python3-ezdxf python3-scipy inkscape
```
