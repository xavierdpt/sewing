#!/usr/bin/env bash
# Build C-IPC, the reference solver this project compares against.
#
# C-IPC (Li, Kaufman, Jiang, SIGGRAPH 2021) is a cloth simulator in which
# interpenetration is impossible by construction rather than unlikely: a
# log-barrier energy between every pair of surfaces, plus a continuous
# collision detection line search that refuses any step which would cross.
#
# It is NOT integrated -- the Blender side-car already reaches zero
# penetration (docs/16-solvers.md). It is here as a second opinion, and for
# its measured fabric parameters (sim/cipc/fabrics.md).
#
# The source is a submodule, on a branch `ubuntu-24.04` carrying the four
# fixes it needs to compile on a 2024 toolchain; see that commit for what and
# why. Nothing is patched at build time.
#
#   sudo apt install -y libeigen3-dev libopenblas-dev python3-dev \
#       python3-pybind11 zlib1g-dev libboost-all-dev libgmp3-dev freeglut3-dev
#   git submodule update --init --depth 1 sim/cipc/Codim-IPC
#   bash sim/cipc/build_cipc.sh
#
# Expect twenty minutes or so. It compiles Kokkos, Kokkos-kernels,
# SuiteSparse, AMGCL and Boost from source, and Kokkos-kernels' several
# hundred generated template instantiations are most of the wall time.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HERE/Codim-IPC"

if [ ! -f "$DIR/CMakeLists.txt" ]; then
  echo "submodule not checked out. Run:" >&2
  echo "  git submodule update --init --depth 1 sim/cipc/Codim-IPC" >&2
  exit 1
fi

for p in Eigen3 pybind11; do :; done
python3 -c 'import pybind11' 2>/dev/null || {
  echo "python3-pybind11 is missing; see the apt line at the top of this file" >&2
  exit 1
}

mkdir -p "$DIR/build"
cd "$DIR/build"
cmake -DCMAKE_BUILD_TYPE=Release \
      -Dpybind11_DIR="$(python3 -c 'import pybind11; print(pybind11.get_cmake_dir())')" ..
make -j"$(nproc)"

SO="$(ls "$DIR"/build/JGSL*.so 2>/dev/null | head -1)"
echo
echo "built: ${SO:-NOTHING}"
echo "check: PYTHONPATH=$DIR/build:$DIR/Python python3 -c 'import JGSL; print(JGSL)'"
