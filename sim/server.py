"""A small HTTP side-car so the viewer can hand a garment to a real solver.

The browser cannot exec a physics engine, and this project's own solver
resolves contact as a point query per vertex -- it keeps every vertex outside
the body and says nothing about the triangle between them, which is why the
dress form shows through a half-sewn skirt. So drape goes over the wire to
something that does it properly.

Deliberately backend-agnostic: `/drape` takes a mesh and returns a mesh, and
which engine ran is an implementation detail reported back in the response.
Blender is the backend that works today; C-IPC is the one that would also take
over the sewing, and it slots in behind the same endpoint.

No dependencies -- http.server from the standard library. Start it with:

    python3 sim/server.py [--port 8778]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))

BACKENDS = {}


def backend(name):
    def wrap(fn):
        BACKENDS[name] = fn
        return fn
    return wrap


@backend("blender")
def run_blender(job):
    """Hand the job to Blender's cloth solver, headless."""
    with tempfile.TemporaryDirectory(prefix="drape-") as d:
        jp, op = os.path.join(d, "job.json"), os.path.join(d, "out.json")
        with open(jp, "w") as f:
            json.dump(job, f)
        p = subprocess.run(
            ["blender", "--background", "--factory-startup",
             "--python", os.path.join(HERE, "blender_drape.py"), "--", jp, op],
            capture_output=True, text=True, timeout=job.get("timeout", 600),
        )
        if not os.path.exists(op):
            tail = (p.stdout + "\n" + p.stderr)[-2000:]
            raise RuntimeError(f"blender produced no output:\n{tail}")
        with open(op) as f:
            return json.load(f)


def available():
    """Which backends can actually run here, right now."""
    out = {}
    try:
        v = subprocess.run(["blender", "--version"], capture_output=True,
                           text=True, timeout=30)
        out["blender"] = v.stdout.strip().splitlines()[0] if v.returncode == 0 else None
    except Exception:
        out["blender"] = None
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        # the viewer is served from a different port, so it is cross-origin
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_GET(self):
        if self.path.rstrip("/") in ("", "/health"):
            self._send(200, {"ok": True, "backends": available()})
        else:
            self._send(404, {"error": "no such endpoint"})

    def do_POST(self):
        if self.path.rstrip("/") != "/drape":
            self._send(404, {"error": "no such endpoint"})
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            job = json.loads(self.rfile.read(n))
        except Exception as e:
            self._send(400, {"error": f"bad job: {e}"})
            return

        name = job.pop("backend", "blender")
        fn = BACKENDS.get(name)
        if fn is None:
            self._send(400, {"error": f"no backend {name!r}",
                             "have": sorted(BACKENDS)})
            return
        t0 = time.time()
        try:
            res = fn(job)
        except Exception as e:
            self._send(500, {"error": str(e)})
            return
        res["backend"] = name
        res["wallSeconds"] = round(time.time() - t0, 1)
        self._send(200, res)

    def log_message(self, fmt, *args):
        sys.stderr.write(f"  {self.address_string()} {fmt % args}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8778)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    print(f"drape side-car on http://{a.host}:{a.port}")
    print(f"  backends: {available()}")
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
