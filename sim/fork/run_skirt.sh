#!/usr/bin/env bash
# The circle-skirt scene, on the FORKED Blender, with the solver switch live.
#
#   sim/fork/run_skirt.sh            # opens the dialog, stock solver selected
#   sim/fork/run_skirt.sh fork       # same, but asking for the forked solver
#
# Two things this does that `blender --python sim/blender_skirt.py` cannot:
# it runs the build that actually contains the fork, and it sets
# BLENDER_SYSTEM_SCRIPTS, without which that build cannot find bpy_types and
# dies on startup (`ninja install` fails here -- it wants a Cython that is not
# installed).
#
# Inside the window: the Skirt tab (N panel) shows which build is running and
# which solver the next drop will use, with Stock/Fork buttons. The choice
# lands when the solver state is next built, i.e. on Reset -- never mid-fall,
# because the state is created by one solver and read by the same one.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"

BIN="$ROOT/src/blender-fork-build/bin/blender"
[ -x "$BIN" ] || { echo "no forked build at $BIN -- run sim/fork/build.sh"; exit 1; }

case "${1:-stock}" in
  fork)  export SEWING_CLOTH_FORK=1 ;;
  stock) export SEWING_CLOTH_FORK=0 ;;
  *) echo "argument is 'fork' or 'stock'"; exit 1 ;;
esac

# Per-frame phase timings from the fork, in the terminal that launched this.
export SEWING_FORK_LOG="${SEWING_FORK_LOG:-1}"
export SEWING_SKIRT_AUTOBUILD=1
export BLENDER_SYSTEM_SCRIPTS="$ROOT/src/blender-fork/scripts"

echo "== $BIN"
echo "== solver asked for: ${SEWING_CLOTH_FORK}  (0 = stock, 1 = fork)"
exec "$BIN" --python "$ROOT/sim/blender_skirt.py"
