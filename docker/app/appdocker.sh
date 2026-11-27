#!/bin/sh
# Build and run the garment viewer in docker, so that a machine needs docker
# and nothing else -- no emscripten, no gcc, no node, no python.
#
#   ./docker/app/appdocker.sh build    # both images, build then run
#   ./docker/app/appdocker.sh start    # the viewer on :8777
#   ./docker/app/appdocker.sh stop
#   ./docker/app/appdocker.sh logs
#   ./docker/app/appdocker.sh status
#
# `start` warns if the run image is older than app/, because the page is baked
# into the image: a container serves the app/ of whenever it was built. To check
# what is actually being served, rather than what is in the repository:
#
#   python3 tools/viewshot.py out.png --url http://127.0.0.1:8777
#
# Two images, two commands, as docker/knowledge-tree does it: a build image
# with emscripten and gcc that compiles src/sewcloth and runs its tests, and a
# run image with python3 and the page. The wasm the page loads is the build
# image's output, not the committed app/wasm/.
#
# The side-car (python3 sim/server.py) is NOT in either image: it needs
# Blender, and it is no longer in the interactive path -- sewing and drape run
# in the page's wasm. It is still where a reference run belongs (rule 4).
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)

# The fingerprint of the page, used to tell a stale image from a current one.
# CONTENT, not mtimes: `docker build` reuses a cached image and keeps its
# original .Created, so an image can be newer in content and older by the clock,
# and `touch` makes a file newer with no change at all. Both of those made a
# time-based check cry wolf -- measured, 2026-11-27, which is why this exists
# (todos/served-page-spec.md section 3).
#
# app/wasm/ is excluded on purpose: the run image takes its wasm from the BUILD
# image with COPY --from, not from the repository, so app/wasm/ is not what is
# being served and a difference there is not staleness.
app_hash() {
  find "$root/app" -type f -not -path '*/wasm/*' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 cat \
    | sha256sum \
    | cut -d' ' -f1
}

BUILD_IMAGE=${BUILD_IMAGE:-sewing-app-build:latest}
RUN_IMAGE=${RUN_IMAGE:-sewing-app-run:latest}
NAME=${NAME:-sewing-app}
PORT=${PORT:-8777}

case ${1:-} in
build)
  # Two contexts, each the smallest thing that answers: the solver's source
  # for the build image, the page for the run image. The repository root is
  # never a context -- src/ holds 6.5 GB of unpacked upstream source.
  docker build -t "$BUILD_IMAGE" -f "$here/Dockerfile.build" "$root/src/sewcloth"
  docker build --build-arg "BUILD_IMAGE=$BUILD_IMAGE" \
    --build-arg "APP_HASH=$(app_hash)" \
    -t "$RUN_IMAGE" -f "$here/Dockerfile.run" "$root/app"
  ;;
start)
  # WARN WHEN THE IMAGE IS OLDER THAN THE PAGE. The page is baked into the
  # image with COPY . . rather than mounted, so a container serves the app/ of
  # whenever it was built, and an edit since then is simply not there. That has
  # cost real time once: a control removed from app/js/ went on being served on
  # :8777 for 26 hours while the instruments, which serve app/ from the
  # repository, correctly reported it gone (todos/served-page-spec.md).
  #
  # A warning, never a refusal -- serving an older build on purpose is a
  # legitimate thing to do. And never fatal: if docker cannot answer, or the
  # image does not exist yet, `start` must still run, because a diagnostic that
  # breaks the command it diagnoses is worse than no diagnostic. Hence the
  # `|| true` and the `-r` guard rather than `set -e` doing the deciding.
  baked=$(docker image inspect -f '{{index .Config.Labels "app_hash"}}' "$RUN_IMAGE" 2>/dev/null) || true
  if [ -z "${baked:-}" ] || [ "$baked" = "<no value>" ]; then
    echo "note: $RUN_IMAGE carries no app_hash label, so the page it serves cannot be" >&2
    echo "      checked against app/. Rebuild to enable the check." >&2
  elif [ "$baked" != "$(app_hash)" ]; then
    echo "WARNING: the page baked into $RUN_IMAGE is NOT the page in app/." >&2
    echo "         The page is COPYed into the image, not mounted, so this container will" >&2
    echo "         serve the older one and your edits will not be there." >&2
    echo "         run './docker/app/appdocker.sh build' first, or see what is actually" >&2
    echo "         served: 'python3 tools/viewshot.py out.png --url http://127.0.0.1:$PORT'." >&2
  fi

  # 127.0.0.1 on the host side: the viewer is a local tool, and publishing a
  # port without it would put it on every interface of the machine.
  #
  # The page is baked in, so nothing is mounted and the container is
  # read-only. Editing app/js/ and reloading wants the host server instead
  # (cd app && python3 -m http.server 8777), or -v "$root/app:/opt/app" here.
  docker run -d --name "$NAME" --restart unless-stopped \
    --user "$(id -u):$(id -g)" \
    --read-only \
    -p "127.0.0.1:$PORT:8777" \
    "$RUN_IMAGE"
  echo "the viewer is on http://127.0.0.1:$PORT"
  ;;
stop)
  docker rm -f "$NAME" >/dev/null && echo "stopped $NAME"
  ;;
logs)
  docker logs ${2:-} "$NAME"
  ;;
status)
  docker ps -a --filter "name=^/$NAME$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  ;;
*)
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
  ;;
esac
