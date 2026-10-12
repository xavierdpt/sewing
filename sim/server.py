"""A small HTTP side-car so the viewer can hand a garment to a real solver.

The browser cannot exec a physics engine, and this project's own solver
resolves contact as a point query per vertex -- it keeps every vertex outside
the body and says nothing about the triangle between them, which is why the
dress form shows through a half-sewn skirt. So drape goes over the wire to
something that does it properly.

Deliberately backend-agnostic: `/drape` takes a mesh and returns a mesh, and
which engine ran is an implementation detail reported back in the response.

It also keeps the log. `POST /log` appends JSON lines from the viewer --
phase timings, clearance, seam tension, and every uncaught exception -- so
what the browser knows stops being trapped in a console that only the person
sitting at it can read. `GET /log` returns the tail.
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
import threading
import time
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
LOGDIR = os.path.join(HERE, "logs")
LOGLOCK = threading.Lock()


def log_path():
    return os.path.join(LOGDIR, f"viewer-{date.today().isoformat()}.jsonl")


def utc_now():
    """ISO 8601, UTC, milliseconds. Not strftime('%H:%M:%S'): whole-second
    stamps with no timezone cannot be compared with the viewer's, which is
    the entire reason both clocks are recorded."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def append_events(session, events, sent_t=None, sent_ms=None):
    """One JSON object per line, so the log can be tailed, grepped and diffed.

    The viewer had no way to tell anyone what it was doing: every measurement
    and every uncaught exception stayed in a browser console. Two bugs this
    session were found only because a human pasted console output by hand.

    Every line gets `srvT`, which is ARRIVAL here -- not when the event
    happened. Events are batched, so arrival lags by up to a flush interval
    (measured at 57 s on a slow page). `sentT`/`sentMs` say when the batch
    left, which separates queue delay from transport, and the viewer's own
    `t`/`ms` say when the event actually occurred. Ordering anything by
    `srvT` alone is wrong; it is here so clock skew between the two machines
    is measurable rather than assumed.
    """
    os.makedirs(LOGDIR, exist_ok=True)
    srv = utc_now()
    with LOGLOCK, open(log_path(), "a") as f:
        for e in events:
            if not isinstance(e, dict):
                continue
            e = {"session": session, "srvT": srv,
                 "sentT": sent_t, "sentMs": sent_ms, **e}
            f.write(json.dumps(e, separators=(",", ":")) + "\n")
    return len(events)

BACKENDS = {}


def backend(name):
    def wrap(fn):
        BACKENDS[name] = fn
        return fn
    return wrap


def frames_path(session):
    """Where a running drape writes its frames, so they can be read mid-solve.

    Not in the job's temp directory: that is deleted when the subprocess
    returns, and the whole point is to read these WHILE it runs. Keyed by
    session so two viewers do not overwrite each other.
    """
    safe = "".join(c for c in str(session or "anon") if c.isalnum() or c in "-_")[:64]
    return os.path.join(LOGDIR, f"frames-{safe}.jsonl")


@backend("blender")
def run_blender(job):
    """Hand the job to Blender's cloth solver, headless."""
    os.makedirs(LOGDIR, exist_ok=True)
    if job.get("captureEvery"):
        job["progressPath"] = frames_path(job.get("session"))
        # start clean, so a reader cannot pick up the previous drape's tail
        open(job["progressPath"], "w").close()
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
        p = self.path.rstrip("/")
        if p in ("", "/health"):
            self._send(200, {"ok": True, "backends": available(),
                             "log": log_path()})
        elif p == "/log":
            # the last little bit of the log, so a tail is one curl away
            try:
                with open(log_path()) as f:
                    tail = f.readlines()[-200:]
                self._send(200, {"path": log_path(),
                                 "events": [json.loads(x) for x in tail]})
            except FileNotFoundError:
                self._send(200, {"path": log_path(), "events": []})
        elif p.split("?")[0] == "/frames":
            # The frames of a drape that is STILL RUNNING. Blender appends one
            # JSON line per captured frame and flushes it, so the viewer can
            # show the fall as it is computed instead of waiting half a minute
            # for a replay -- and instead of running its own fall underneath
            # with the contact model that lets the body through, which was two
            # simulations of one event with the wrong one on screen.
            q = parse_qs(urlparse(self.path).query)
            session = (q.get("session") or [None])[0]
            start = int((q.get("from") or ["0"])[0])
            fp = frames_path(session)
            try:
                with open(fp) as f:
                    lines = f.readlines()
            except FileNotFoundError:
                lines = []
            out, done = [], False
            for ln in lines[start:]:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    rec = json.loads(ln)
                except ValueError:
                    break          # a line still being written; stop here
                if rec.get("done"):
                    done = True
                else:
                    out.append(rec)
            self._send(200, {"from": start, "frames": out,
                             "next": start + len(out) + (1 if done else 0),
                             "done": done})
        else:
            self._send(404, {"error": "no such endpoint"})

    def do_POST(self):
        if self.path.rstrip("/") == "/log":
            try:
                n = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(n))
                written = append_events(body.get("session"),
                                        body.get("events", []),
                                        body.get("sentT"), body.get("sentMs"))
            except Exception as e:
                self._send(400, {"error": f"bad log batch: {e}"})
                return
            self._send(200, {"ok": True, "written": written})
            return
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
        shape = {
            "garmentVerts": len(job.get("garment", {}).get("verts", [])),
            "garmentTris": len(job.get("garment", {}).get("tris", [])),
            "bodyTris": len(job.get("body", {}).get("tris", [])),
            "pinned": len(job.get("pinned", [])),
            "sewEdges": len(job.get("sewEdges", [])),
            "frames": job.get("frames"),
            "gravity": job.get("gravity"),
        }
        try:
            res = fn(job)
        except Exception as e:
            append_events(job.get("session"), [{
                "t": utc_now(), "event": "drape-failed",
                "backend": name, "error": str(e)[:2000], **shape,
            }])
            self._send(500, {"error": str(e)})
            return
        res["backend"] = name
        res["wallSeconds"] = round(time.time() - t0, 1)
        append_events(job.get("session"), [{
            "t": utc_now(), "event": "drape",
            "backend": name, "wallSeconds": res["wallSeconds"], **shape,
        }])
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
    print(f"  log:      {log_path()}")
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
