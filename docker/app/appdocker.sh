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
    -t "$RUN_IMAGE" -f "$here/Dockerfile.run" "$root/app"
  ;;
start)
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
