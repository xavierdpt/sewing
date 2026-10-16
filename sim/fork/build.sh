#!/usr/bin/env bash
# Build the forked Blender: the stock 4.0.2 source with the cloth solver
# switch (0001-cloth-solver-switch.patch) applied.
#
#   sudo apt-get build-dep blender      # once, needs root
#   sim/fork/build.sh                   # ~30-60 min on 8 cores
#
# Why a whole Blender and not just the solver: the cloth core compiles
# standalone (proved -- implicit_blender.cc builds clean outside the tree),
# but its COLLISION does not. collision.cc is entangled with DNA, BVH and the
# depsgraph, and collision is the half this project cares about -- it is why
# the drape went to Blender at all (docs/11-cloth.md). Rebuilding keeps the
# fork inside the real cloth modifier, with the real collider, and lets one
# binary run both paths.
#
# WITH_* flags: a deliberately lean build. Cycles, USD, OpenVDB and the media
# stack are nothing to do with cloth and are most of the compile time and the
# disk. The UI stays, because the point is to watch the thing.
#
# Two flags are here because the build failed without them, not by preference:
# PYTHON_VERSION=3.12 (Blender 4.0 pins 3.10, this machine has 3.12 and so does
# Ubuntu's own blender package), and no WITH_OPENIMAGEIO=OFF -- the unix
# platform file looks for OpenImageIO regardless, so switching it off only
# produces a confusing "NOTFOUND" rather than skipping it.
#
# Measured 2026-10-16 on an i7-4790 (8 threads), stock tree, from scratch:
# 4,920 steps, 18m 37s, 688 MB of build tree, 76 MB binary.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"
SRC="$ROOT/src/blender-fork"

# PROFILE=1 builds a SECOND tree rather than switching this one: changing
# CMAKE_BUILD_TYPE in place recompiles everything (19 min) and destroys the
# release baseline that every timing so far was taken against. Two trees cost
# disk; one tree costs the ability to compare.
#
# RelWithDebInfo, not Debug: a Debug build is a different program for timing
# purposes -- no inlining, no optimisation -- and would profile the compiler's
# choices rather than ours. Frame pointers are kept so a sampling profiler can
# walk the stack without guessing.
if [ "${PROFILE:-0}" != "0" ]; then
  BUILD="$ROOT/src/blender-fork-build-profile"
  BUILD_TYPE=RelWithDebInfo
  EXTRA_C_FLAGS="-fno-omit-frame-pointer -g"
else
  BUILD="$ROOT/src/blender-fork-build"
  BUILD_TYPE=Release
  EXTRA_C_FLAGS=""
fi

[ -d "$SRC" ] || { echo "no fork tree at $SRC"; exit 1; }
echo "== $BUILD_TYPE -> $BUILD"

cmake -S "$SRC" -B "$BUILD" -G Ninja \
  -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
  -DCMAKE_C_FLAGS="$EXTRA_C_FLAGS" \
  -DCMAKE_CXX_FLAGS="$EXTRA_C_FLAGS" \
  -DPYTHON_VERSION=3.12 \
  -DWITH_CYCLES=OFF \
  -DWITH_OPENVDB=OFF \
  -DWITH_USD=OFF \
  -DWITH_HYDRA=OFF \
  -DWITH_CODEC_FFMPEG=OFF \
  -DWITH_IMAGE_OPENEXR=OFF \
  -DWITH_OPENCOLORIO=OFF \
  -DWITH_OPENSUBDIV=OFF \
  -DWITH_LIBMV=OFF \
  -DWITH_GTESTS=OFF \
  -DWITH_DRACO=OFF \
  -DWITH_POTRACE=OFF \
  -DWITH_PUGIXML=OFF \
  -DWITH_QUADRIFLOW=OFF \
  -DWITH_INSTALL_PORTABLE=ON

echo "== building"
ninja -C "$BUILD" -j"$(nproc)"

echo
echo "fork binary: $BUILD/bin/blender"
"$BUILD/bin/blender" --version | head -2
