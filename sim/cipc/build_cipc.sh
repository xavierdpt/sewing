#!/usr/bin/env bash
# Build C-IPC on Ubuntu 24.04, as a reference solver to compare against.
#
# C-IPC (Li, Kaufman, Jiang, SIGGRAPH 2021) is a cloth simulator that cannot
# produce an interpenetration: a log-barrier energy between every pair of
# surfaces plus a CCD line search that refuses any step which would cross. It
# is NOT integrated into this project -- Blender's side-car already reaches
# zero penetration (docs/16-solvers.md). It is here as a reference oracle, and
# for its table of MEASURED fabric parameters, which this project lacks.
#
# Upstream does not build on a 2024 toolchain. Four things are wrong and all
# four are patched below; none of them touch the solver's mathematics.
#
# Expect a long build: it vendors and compiles Kokkos, Kokkos-kernels,
# SuiteSparse, AMGCL and Boost from source. Kokkos-kernels alone generates
# several hundred explicit template instantiations and is most of the time.
#
#   sudo apt install -y libeigen3-dev libopenblas-dev python3-dev \
#       python3-pybind11 zlib1g-dev libboost-all-dev libgmp3-dev freeglut3-dev
#   bash sim/cipc/build_cipc.sh [checkout-dir]
set -euo pipefail

DIR="${1:-$HOME/src/Codim-IPC}"
REPO="https://github.com/ipc-sim/Codim-IPC.git"

if [ ! -d "$DIR" ]; then
  echo "cloning C-IPC into $DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

py() { python3 - "$@"; }

# ---- 1. MKL. suitesparse.cmake fetches Intel MKL from an anaconda.org URL
# that no longer resolves. SuiteSparse only needs a BLAS and a LAPACK, and
# Ubuntu packages OpenBLAS, which is both.
py <<'PY'
import sys, pathlib
p = pathlib.Path("CMake/suitesparse.cmake"); s = p.read_text()
old = "if (NOT APPLE)\n    include(mkl)\nendif()"
new = """find_package(BLAS REQUIRED)
find_package(LAPACK REQUIRED)
if(NOT TARGET blas)
    add_library(blas INTERFACE IMPORTED GLOBAL)
    target_link_libraries(blas INTERFACE ${BLAS_LIBRARIES})
endif()
if(NOT TARGET lapack)
    add_library(lapack INTERFACE IMPORTED GLOBAL)
    target_link_libraries(lapack INTERFACE ${LAPACK_LIBRARIES})
endif()"""
if old in s:
    s = s.replace(old, new)
old2 = """if (NOT APPLE)
    target_link_libraries(cholmod PUBLIC mkl::mkl)
else()
    find_package(LAPACK)
    target_link_libraries(cholmod PUBLIC LAPACK::LAPACK)
endif()"""
if old2 in s:
    s = s.replace(old2, "target_link_libraries(cholmod PUBLIC ${BLAS_LIBRARIES} ${LAPACK_LIBRARIES})")
p.write_text(s); print("  1. MKL -> system OpenBLAS")
PY

# ---- 2. pybind11. The vendored copy is 2.4, which predates Python 3.11
# making PyFrameObject opaque, so it cannot compile against Python 3.12.
# Ubuntu packages 2.11.1, which can.
py <<'PY'
import pathlib
p = pathlib.Path("CMakeLists.txt"); s = p.read_text()
old = "add_subdirectory(Externals/pybind11-master)"
if old in s:
    s = s.replace(old, "find_package(pybind11 REQUIRED)")
    print("  2. vendored pybind11 2.4 -> system 2.11")
# ---- 3. GCC 13 promoted -Wchanges-meaning to an error, which rejects the
# vendored meta.hpp (2017). A name-lookup pedantry, not a correctness issue.
anchor = "set(CMAKE_CXX_STANDARD 17)"
if anchor in s and "-Wno-changes-meaning" not in s:
    s = s.replace(anchor, anchor + "\nadd_compile_options(-Wno-changes-meaning)")
    print("  3. -Wno-changes-meaning for GCC 13")
p.write_text(s)
PY

# ---- 4. boost::property_tree against pybind11 >= 2.6. pybind11's
# is_copy_constructible is container-aware: for a type with a `value_type` it
# also requires THAT to be copy constructible. ptree is recursive -- its
# value_type is std::pair<const Key, basic_ptree> -- so the trait instantiates
# itself on an incomplete type. Short-circuit it to the plain std:: trait,
# which is the upstream advice for recursive types and is the right answer:
# ptree really is copy and move constructible.
py <<'PY'
import pathlib
p = pathlib.Path("Library/Math/AMGCL_SOLVER.h"); s = p.read_text()
if "is_copy_constructible<boost::property_tree::basic_ptree" not in s:
    block = """namespace pybind11 { namespace detail {
template <typename K, typename D, typename C>
struct is_copy_constructible<boost::property_tree::basic_ptree<K, D, C>>
    : std::is_copy_constructible<boost::property_tree::basic_ptree<K, D, C>> {};
template <typename K, typename D, typename C>
struct is_move_constructible<boost::property_tree::basic_ptree<K, D, C>>
    : std::is_move_constructible<boost::property_tree::basic_ptree<K, D, C>> {};
}} // namespace pybind11::detail

"""
    # GLOBAL scope: inside `namespace JGSL` this silently becomes
    # JGSL::pybind11::detail and specialises nothing.
    s = s.replace("namespace JGSL {", block + "namespace JGSL {", 1)
    p.write_text(s); print("  4. ptree trait short-circuited for pybind11 2.11")
PY

mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Release \
      -Dpybind11_DIR="$(python3 -c 'import pybind11; print(pybind11.get_cmake_dir())')" ..
make -j"$(nproc)"

echo
echo "built: $(ls "$DIR"/build/JGSL*.so)"
echo "check: PYTHONPATH=$DIR/build:$DIR/Python python3 -c 'import JGSL; print(JGSL)'"
