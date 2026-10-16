#!/usr/bin/env bash
# Profile the cloth solver on the one fixed workload (bench.py: the circle
# skirt falling on its cone).
#
#   sim/fork/profile.sh callgrind [fork|stock] [frames]   # which functions, exactly
#   sim/fork/profile.sh heaptrack [fork|stock] [frames]   # allocation churn
#   sim/fork/profile.sh perf      [fork|stock] [frames]   # sampled wall clock (needs pkexec)
#   sim/fork/profile.sh time      [fork|stock] [frames]   # just the numbers, no tool
#
# Output lands in out/profile/.
#
# WHY CALLGRIND FIRST. It needs no privileges, and the first question is which
# functions sit inside the three bars the fork's own log already prints
# (collision 41 %, force assembly 35 %, solve 23 % -- docs/20-fork.md step 7b).
# What it costs: it counts INSTRUCTIONS, not time, and runs 20-50x slow, so it
# defaults to a handful of frames and its totals are not comparable with the
# bench's milliseconds. Use it for proportions and call counts, never for "how
# long does this take".
#
# WHY NOT perf BY DEFAULT. kernel.perf_event_paranoid is a system-wide sysctl
# (4 on this machine, perf wants <= 2). Rather than open the machine up, the
# perf mode runs the recorder itself under pkexec against a normally-started
# Blender, so the setting is left alone. See docs/20-fork.md step 8.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"

MODE="${1:-callgrind}"
WHICH="${2:-fork}"
FRAMES="${3:-}"

# WHICH BINARY, AND WHY IT DIFFERS BY MODE.
#
#   time      -> the RELEASE build. Timings must be comparable with the
#                baseline in docs/20-fork.md, and RelWithDebInfo is a
#                different program: different inlining, frame pointers kept.
#                A "faster" number from the wrong binary is the easiest
#                self-deception available here.
#   otherwise -> the PROFILING build, which has the debug info that turns
#                addresses into function names.
RELEASE_BIN="$ROOT/src/blender-fork-build/bin/blender"
PROFILE_BIN="$ROOT/src/blender-fork-build-profile/bin/blender"

if [ "${1:-callgrind}" = "time" ]; then
  BIN="$RELEASE_BIN"
  [ -x "$BIN" ] || { echo "no release build -- run sim/fork/build.sh"; exit 1; }
else
  BIN="$PROFILE_BIN"
  if [ ! -x "$BIN" ]; then
    BIN="$RELEASE_BIN"
    echo "!! no profiling build; using $BIN (Release, thin symbols)" >&2
    echo "!! build one with: PROFILE=1 sim/fork/build.sh" >&2
  fi
fi

case "$WHICH" in
  fork)  FORK=1 ;;
  stock) FORK=0 ;;
  *) echo "second argument is 'fork' or 'stock', not '$WHICH'"; exit 1 ;;
esac

OUT="$ROOT/out/profile"
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M%S)-$WHICH"

# WHICH CODE WAS THIS? A profile that cannot answer that is worse than none,
# because it will be compared against a later one and the difference credited
# to whatever was changed in between. Recorded for every run.
FORK_REV="$(git -C "$ROOT/src/blender-fork" rev-parse --short HEAD 2>/dev/null || echo unknown)"
FORK_DIRTY="$(git -C "$ROOT/src/blender-fork" status --porcelain 2>/dev/null | head -1)"
[ -n "$FORK_DIRTY" ] && FORK_REV="$FORK_REV-dirty"
BIN_AGE="$(date -r "$BIN" +%Y-%m-%d\ %H:%M:%S)"

# The harness asking for one solver and measuring the other is not
# hypothetical -- it happened, and the run reported the solver it ASKED for.
# So every mode checks the log afterwards and says what actually ran.
check_solver_ran() {
  local log="$1"
  local got
  got="$(grep -o "solver for this cloth object: [A-Za-z]*" "$log" 2>/dev/null |
         tail -1 | awk '{print $NF}')"
  if [ -z "$got" ]; then
    echo "!! could not tell which solver ran -- no [simfork] line in $log" >&2
    return
  fi
  local want="stock"; [ "$FORK" = "1" ] && want="FORK"
  if [ "$got" = "$want" ]; then
    echo "== confirmed: the $got solver ran"
  else
    echo "!! ASKED FOR $want BUT $got RAN -- this profile is mislabelled" >&2
  fi
}

provenance() {
  {
    echo "binary   : $BIN"
    echo "built    : $BIN_AGE"
    echo "fork rev : $FORK_REV"
    echo "solver   : $WHICH"
    echo "frames   : $FRAMES"
    echo "mode     : $MODE"
  } | tee "$OUT/$1.provenance"
}

# A profile of a binary older than the source it claims to measure is the
# classic reprofiling mistake: edit, forget to rebuild, measure yesterday.
newest_src="$(find "$ROOT/src/blender-fork/source/blender/simulation" \
  "$ROOT/src/blender-fork/source/blender/blenkernel/intern/cloth.cc" \
  -newer "$BIN" -name '*.cc' -o -newer "$BIN" -name '*.h' 2>/dev/null | head -3)"
if [ -n "$newest_src" ]; then
  echo "!! SOURCE IS NEWER THAN THE BINARY -- you are about to profile stale code:" >&2
  echo "$newest_src" | sed 's/^/!!   /' >&2
  echo "!! rebuild first:  PROFILE=1 sim/fork/build.sh" >&2
  exit 1
fi

# Blender cannot find its own scripts from the build tree (ninja install fails
# here: it wants a Cython that is not installed), so point it at the source.
export BLENDER_SYSTEM_SCRIPTS="$ROOT/src/blender-fork/scripts"
export SEWING_CLOTH_FORK="$FORK"

case "$MODE" in
  time)
    FRAMES="${FRAMES:-60}"
    export SEWING_FORK_LOG=1
    "$BIN" --background --factory-startup --python "$ROOT/sim/fork/bench.py" \
      -- "$FRAMES" 2>&1 | grep -E "^\[bench\]|^\[simfork"
    ;;

  callgrind)
    # Few frames on purpose: 20-50x slowdown, and the shape of one frame is
    # the same as the shape of a hundred.
    FRAMES="${FRAMES:-3}"
    provenance "callgrind-$STAMP"
    # COLLECT ONLY INSIDE THE SOLVER. Blender's startup -- OpenImageIO, the
    # dynamic linker, Python -- was 25 % of a short run's instructions, which
    # has nothing to do with cloth and drowns what does. --toggle-collect
    # starts counting when the solver entry point is called and stops when it
    # returns, so the totals are the solve and nothing else.
    TOGGLE="SIM_cloth_solve"
    [ "$FORK" = "1" ] && TOGGLE="SIMFORK_cloth_solve"
    echo "== callgrind, $WHICH solver, $FRAMES frames, collecting inside $TOGGLE"
    echo "   (20-50x slowdown; minutes)"
    valgrind --tool=callgrind \
      --callgrind-out-file="$OUT/callgrind-$STAMP.out" \
      --toggle-collect="$TOGGLE" \
      --separate-threads=no \
      "$BIN" --background --factory-startup \
      --python "$ROOT/sim/fork/bench.py" -- "$FRAMES" \
      > "$OUT/callgrind-$STAMP.log" 2>&1 || true

    check_solver_ran "$OUT/callgrind-$STAMP.log"
    echo "== top functions by self cost"
    callgrind_annotate --auto=no --threshold=85 \
      "$OUT/callgrind-$STAMP.out" 2>/dev/null \
      | sed -n '/PROGRAM TOTALS/,$p' | head -26
    echo
    echo "full: $OUT/callgrind-$STAMP.out   (kcachegrind \"$OUT/callgrind-$STAMP.out\")"
    ;;

  heaptrack)
    FRAMES="${FRAMES:-10}"
    provenance "heaptrack-$STAMP"
    echo "== heaptrack, $WHICH solver, $FRAMES frames"
    heaptrack -o "$OUT/heaptrack-$STAMP" \
      "$BIN" --background --factory-startup \
      --python "$ROOT/sim/fork/bench.py" -- "$FRAMES" \
      > "$OUT/heaptrack-$STAMP.log" 2>&1 || true
    check_solver_ran "$OUT/heaptrack-$STAMP.log"
    # The summary, not the tail: the tail of heaptrack_print is whatever leak
    # backtrace sorts last (usually something in GTK's startup), which says
    # nothing about the solver.
    echo "== totals"
    heaptrack_print "$OUT/heaptrack-$STAMP.zst" 2>/dev/null \
      | grep -iE "total runtime|calls to allocation|temporary allocation|peak heap|peak RSS|bytes allocated in total" \
      || true
    echo
    echo "== biggest allocators"
    heaptrack_print --print-allocators=1 --print-leaks=0 --print-peaks=0 \
      --print-flamegraph="" "$OUT/heaptrack-$STAMP.zst" 2>/dev/null \
      | grep -A12 "MOST CALLS TO ALLOCATION" | head -14 || true
    echo
    echo "visual: heaptrack_gui $OUT/heaptrack-$STAMP.zst"
    ;;

  perf)
    # The sysctl stays where it is: perf runs as root for this one command,
    # the Blender it watches does not.
    FRAMES="${FRAMES:-30}"
    provenance "perf-$STAMP"
    PARANOID="$(cat /proc/sys/kernel/perf_event_paranoid)"
    if [ "$PARANOID" -le 2 ]; then
      echo "== perf, $WHICH solver, $FRAMES frames (paranoid=$PARANOID, no root needed)"
      perf record -F 499 -g --call-graph=fp --output="$OUT/perf-$STAMP.data" -- \
        "$BIN" --background --factory-startup \
        --python "$ROOT/sim/fork/bench.py" -- "$FRAMES" \
        > "$OUT/perf-$STAMP.log" 2>&1 || true
    else
      echo "== perf, $WHICH solver, $FRAMES frames (paranoid=$PARANOID, pkexec will ask)"
      pkexec perf record -F 499 -g --call-graph=fp --output="$OUT/perf-$STAMP.data" -- \
        "$BIN" --background --factory-startup \
        --python "$ROOT/sim/fork/bench.py" -- "$FRAMES" \
        > "$OUT/perf-$STAMP.log" 2>&1 || true
      pkexec chown "$(id -u):$(id -g)" "$OUT/perf-$STAMP.data" || true
    fi
    # FLAT self cost, not the call graph: the first question is which
    # function burns the cycles, and `-g none --no-children` answers exactly
    # that in twenty lines. The call graph is in the file for `perf report -i`
    # or hotspot when the question becomes "called from where".
    check_solver_ran "$OUT/perf-$STAMP.log"
    echo "== self cost (flat)"
    perf report --stdio -g none --no-children --percent-limit=0.7 \
      -i "$OUT/perf-$STAMP.data" 2>/dev/null \
      | grep -E "^ +[0-9]" | head -22
    echo
    echo "callers:  perf report -i $OUT/perf-$STAMP.data"
    echo "visual :  hotspot $OUT/perf-$STAMP.data"
    ;;

  *)
    echo "modes: callgrind | heaptrack | perf | time"
    exit 1
    ;;
esac
