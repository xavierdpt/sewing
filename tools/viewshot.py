#!/usr/bin/env python3
"""Screenshot the viewer, after optionally clicking and poking at it.

The UI is the one part of this project with no headless instrument: a layout
question could only be answered by asking for a screenshot by hand, which is
exactly the guessing loop CLAUDE.md rule 1 is about. This drives the real page
in headless Chrome over CDP, runs whatever JS you hand it, pumps frames (the
render loop is requestAnimationFrame, which headless does not fire -- see
`__pump` in app/js/main.js) and writes a PNG.

    python3 tools/viewshot.py out.png
    python3 tools/viewshot.py out.png --eval "document.querySelectorAll('.menubar-item')[0].click()"
    python3 tools/viewshot.py out.png --size 1600x1000 --frames 60

Exits non-zero if the page logged an error, so a broken viewer fails loudly
instead of producing a plausible picture.
"""
import argparse, asyncio, base64, json, os, pathlib, shutil, socket, subprocess, sys, tempfile, time, urllib.request

import websockets

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'app'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def chrome_binary():
    for name in ('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'):
        p = shutil.which(name)
        if p:
            return p
    sys.exit('no chromium/chrome on PATH')


def wait_for(url, tries=100):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=0.5) as r:
                return json.load(r)
        except Exception:
            time.sleep(0.1)
    sys.exit(f'timed out waiting for {url}')


class CDP:
    def __init__(self, ws, settle=15.0):
        self.ws, self.n, self.logs = ws, 0, []
        self.settle = settle
        # alert() blocks the page until someone answers it, and nothing here
        # was answering: with the Page domain enabled, a dialog opened by an
        # --eval would hang the evaluate it came from and the run would time
        # out with no idea why. So dialogs are dismissed as they open and kept
        # here, which also makes them MEASURABLE -- `cdp.dialogs` is what the
        # page said, and a test can assert on it.
        self.dialogs = []
        self.dn = 10_000_000

    async def send(self, method, **params):
        self.n += 1
        await self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get('method') == 'Page.javascriptDialogOpening':
                text = msg['params'].get('message', '')
                self.dialogs.append(text)
                self.logs.append(('dialog', text.replace('\n', ' | ')))
                self.dn += 1
                await self.ws.send(json.dumps({
                    'id': self.dn, 'method': 'Page.handleJavaScriptDialog',
                    'params': {'accept': True},
                }))
            elif msg.get('method') == 'Runtime.consoleAPICalled':
                args = ' '.join(str(a.get('value', a.get('description', ''))) for a in msg['params']['args'])
                self.logs.append((msg['params']['type'], args))
            elif msg.get('method') == 'Runtime.exceptionThrown':
                d = msg['params']['exceptionDetails']
                self.logs.append(('exception', d.get('text', '') + ' ' + str(d.get('exception', {}).get('description', ''))))
            elif msg.get('id') == self.n:
                if 'error' in msg:
                    raise RuntimeError(msg['error'])
                return msg['result']

    async def booted(self, timeout):
        """Wait for main.js to finish its module graph and its first build."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if await self.js('typeof __pump === "function"'):
                return
            await asyncio.sleep(0.2)
        for kind, text in self.logs:
            print(f'  [{kind}] {text}', file=sys.stderr)
        raise RuntimeError('the viewer did not boot')

    async def js(self, expr):
        try:
            r = await self.send('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        except RuntimeError as err:
            # an expression that reloads the page kills its own reply; that is a
            # legitimate thing to ask for (does the UI come back as it was?)
            if 'navigated' not in str(err):
                raise
            # the old context can still answer for a moment after the reload
            # is asked for, so give the navigation a head start
            await asyncio.sleep(2.0)
            await self.booted(self.settle)
            return 'reloaded'
        if r.get('exceptionDetails'):
            raise RuntimeError(r['exceptionDetails'].get('text', '') + ' :: ' + expr)
        return r['result'].get('value')


async def run(args):
    port = free_port()
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--directory', str(APP)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    dbg = free_port()
    profile = tempfile.mkdtemp(prefix='viewshot-')
    w, h = (int(v) for v in args.size.split('x'))
    chrome = subprocess.Popen([
        chrome_binary(), '--headless=new', f'--remote-debugging-port={dbg}',
        f'--user-data-dir={profile}', f'--window-size={w},{h}',
        '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
        # three.js needs a real WebGL context; swiftshader is the software one,
        # and recent Chrome will not use it without being told it is wanted
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for(f'http://127.0.0.1:{dbg}/json/version')
        tabs = wait_for(f'http://127.0.0.1:{dbg}/json/list')
        ws_url = next(t['webSocketDebuggerUrl'] for t in tabs if t['type'] == 'page')
        async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
            cdp = CDP(ws, args.settle)
            await cdp.send('Runtime.enable')
            await cdp.send('Page.enable')
            await cdp.js(f'location.href = "http://127.0.0.1:{port}/index.html"')
            await cdp.booted(args.settle)
            if args.clear_ui_state:
                await cdp.js('localStorage.removeItem("sewing.dockui.v1")')
                await cdp.js('location.reload()')
                await cdp.booted(args.settle)
            for expr in args.eval or []:
                print('eval:', expr, '->', await cdp.js(expr))
            await cdp.js(f'__pump({args.frames})')
            shot = await cdp.send('Page.captureScreenshot', format='png')
            pathlib.Path(args.out).write_bytes(base64.b64decode(shot['data']))
            print(f'wrote {args.out} ({w}x{h})')
            bad = [l for l in cdp.logs if l[0] in ('error', 'exception')]
            for kind, text in cdp.logs:
                print(f'  [{kind}] {text}')
            return 1 if bad else 0
    finally:
        chrome.terminate()
        server.terminate()
        shutil.rmtree(profile, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--size', default='1600x1000')
    ap.add_argument('--frames', type=int, default=1)
    ap.add_argument('--settle', type=float, default=4.0, help='seconds to wait for the page to boot')
    ap.add_argument('--eval', action='append', help='JS to run before the shot; repeatable')
    ap.add_argument('--clear-ui-state', action='store_true', help='forget remembered dialog positions first')
    args = ap.parse_args()
    sys.exit(asyncio.run(run(args)))


if __name__ == '__main__':
    main()
