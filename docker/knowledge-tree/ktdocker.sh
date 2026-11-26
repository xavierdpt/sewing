#!/bin/sh
# Build and run the knowledge tree's viewer in docker, so that a machine needs
# docker and nothing else -- no node, no npm, no compiler for the native
# sqlite module.
#
#   ./docker/knowledge-tree/ktdocker.sh build    # both images, build then run
#   ./docker/knowledge-tree/ktdocker.sh start    # the viewer on :3001
#   ./docker/knowledge-tree/ktdocker.sh stop
#   ./docker/knowledge-tree/ktdocker.sh logs
#   ./docker/knowledge-tree/ktdocker.sh status
#
# The tree itself is NOT in the image: docs/knowledge.db is mounted, so the
# container reads the repository's database and the database outlives the
# container.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)

BUILD_IMAGE=${BUILD_IMAGE:-knowledge-tree-build:latest}
RUN_IMAGE=${RUN_IMAGE:-knowledge-tree-run:latest}
NAME=${NAME:-knowledge-tree}
PORT=${PORT:-3001}
db="$root/docs/knowledge.db"

case ${1:-} in
build)
  # The build context is kt/, the tree's source in this repository. What it
  # sends to the daemon is filtered by kt/.dockerignore.
  docker build -t "$BUILD_IMAGE" -f "$here/Dockerfile.build" "$root/kt"
  docker build --build-arg "BUILD_IMAGE=$BUILD_IMAGE" \
    -t "$RUN_IMAGE" -f "$here/Dockerfile.run" "$here"
  ;;
start)
  [ -f "$db" ] || { echo "no database at $db -- the tree is created from a Claude session" >&2; exit 1; }
  # --user: the server opens the database read-write (better-sqlite3 does,
  # even though every write operation is refused over HTTP), so SQLite writes
  # its -wal and -shm beside it. As root those two files come out owned by
  # root in the repository; as the invoking user they do not.
  #
  # 127.0.0.1 on the host side: the viewer is a local tool, and publishing a
  # port without it would put the tree on every interface of the machine.
  docker run -d --name "$NAME" --restart unless-stopped \
    --user "$(id -u):$(id -g)" \
    -p "127.0.0.1:$PORT:3001" \
    -v "$root/docs:/data" \
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
