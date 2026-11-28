#!/usr/bin/env python3
"""Screenshot the body once per measurement, at a fraction of each range.

A measurement form is a list of numbers with ranges, and the question it
raises -- does the body actually answer the number that was typed, and does
it answer it sensibly -- is not one a single screenshot can settle. This
drives the real page once, through the real controls (set the input, fire
`input`, fire `blur`, which is what lil-gui's `onFinishChange` listens for --
see the knowledge tree, "Body controls update on release"), and writes one
PNG per setting plus an `index.json` of what the page then said it measured.

    python3 tools/body_sweep.py out/sweep                 # every measurement, 1/4 and 3/4
    python3 tools/body_sweep.py out/sweep --only bust,waist --fractions 0.1,0.5,0.9
    python3 tools/body_sweep.py out/sweep --url http://127.0.0.1:8777   # the SERVED page

The ranges are not restated here, and not parsed out of the source either:
the page answers what its own form offers, through `__ranges()`, so a bound
that moves in `measurementRanges()` moves here (rule 9).

**Each setting is measured against a freshly booted page**, because putting a
measurement back does NOT put the body back: `Body.build()` carries state from
the body before it, so one extreme value leaves every body built afterwards
deformed, and a sweep that only restores the number measures the wreckage of
the previous setting. The first run of this tool did exactly that -- after
`bust = 139` every later shot read `bust apex height 4.0 cm` and 0.581 m2 of
surface, including the shots of measurements that cannot touch the torso.
`--chain` keeps the old behaviour, which is the way to reproduce that effect
on purpose. Either way the last shot re-takes the baseline, so the index says
whether the body came back.

Assemble the result with `tools/plate.py`.
"""
import argparse, asyncio, base64, json, pathlib, re, shutil, subprocess, sys, tempfile, time, urllib.parse

from PIL import Image, ImageChops

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from viewshot import CDP, ROOT, APP, chrome_binary, free_port, wait_for   # noqa: E402

import websockets   # noqa: E402

RANGES_JS = 'JSON.stringify(typeof __ranges === "function" ? __ranges() : null)'


def ranges(payload):
    """What the page says its own form offers, in the order it shows it."""
    if not payload:
        sys.exit('the page does not expose __ranges(); it is older than this tool')
    d = json.loads(payload)
    out = []
    for key in d['measurements'] + d['pairs']:
        lo, hi = d['ranges'][key]
        out.append((key, float(lo), float(hi), key in d['pairs']))
    return out


def label(key):
    """The name lil-gui shows, which is how a row is found in the DOM."""
    return re.sub(r'([A-Z])', r' \1', key).lower()


SET_JS = r'''
(() => {
  const dlg = [...document.querySelectorAll('.dlg')]
    .find(d => (d.querySelector('.dlg-title')?.textContent || '').startsWith('measurements'));
  if (!dlg) return 'no measurements dialog';
  const row = [...dlg.querySelectorAll('.controller')]
    .find(c => (c.querySelector('.name')?.textContent || '').trim() === %NAME%);
  if (!row) return 'no row ' + %NAME%;
  const inp = row.querySelector('input');
  if (!inp) return 'no input in ' + %NAME%;
  inp.value = String(%VALUE%);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  // lil-gui finishes an edit on blur, and a headless browser's blur is not
  // reliable on an input it never truly focused (the tree's "Body controls
  // update on release"). One dropped blur is one shot that silently pictures
  // the body of the PREVIOUS setting, so all three are fired.
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  inp.dispatchEvent(new Event('blur'));
  inp.dispatchEvent(new Event('focusout', { bubbles: true }));
  return inp.value;
})()
'''

READ_JS = r'''
(() => {
  const dlg = [...document.querySelectorAll('.dlg')]
    .find(d => (d.querySelector('.dlg-title')?.textContent || '').startsWith('measurements'));
  const out = {};
  for (const c of dlg.querySelectorAll('.controller')) {
    const n = (c.querySelector('.name')?.textContent || '').trim();
    const i = c.querySelector('input');
    if (n && i) out[n] = i.value;
  }
  return JSON.stringify(out);
})()
'''

HUD_JS = r'''
(() => {
  const el = document.querySelector('#hud') || document.querySelector('.hud');
  return el ? el.innerText : '';
})()
'''


def set_js(name, value):
    return SET_JS.replace('%NAME%', json.dumps(name)).replace('%VALUE%', json.dumps(value))


async def run(args):
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    wanted = [k.strip() for k in args.only.split(',')] if args.only else None
    fractions = [float(f) for f in args.fractions.split(',')]

    server = None
    if args.url:
        target = args.url if urllib.parse.urlparse(args.url).path else args.url + '/'
    else:
        port = free_port()
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port),
                                   '--directory', str(APP)],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = f'http://127.0.0.1:{port}/index.html'
    dbg = free_port()
    profile = tempfile.mkdtemp(prefix='bodysweep-')
    w, h = (int(v) for v in args.size.split('x'))
    chrome = subprocess.Popen([
        chrome_binary(), '--headless=new', f'--remote-debugging-port={dbg}',
        f'--user-data-dir={profile}', f'--window-size={w},{h}',
        '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shots = []
    try:
        wait_for(f'http://127.0.0.1:{dbg}/json/version')
        tabs = wait_for(f'http://127.0.0.1:{dbg}/json/list')
        ws_url = next(t['webSocketDebuggerUrl'] for t in tabs if t['type'] == 'page')
        async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
            cdp = CDP(ws, args.settle)
            await cdp.send('Runtime.enable')
            await cdp.send('Page.enable')
            print(f'driving {target}')
            await cdp.js(f'location.href = "{target}"')
            await cdp.booted(args.settle)

            table = ranges(await cdp.js(RANGES_JS))
            if wanted:
                missing = set(wanted) - {r[0] for r in table}
                if missing:
                    sys.exit(f'no such measurement: {", ".join(sorted(missing))}')
                table = [r for r in table if r[0] in wanted]

            base = json.loads(await cdp.js(READ_JS))
            print(f'baseline: {len(base)} rows in the measurement form')

            async def reboot():
                # `booted()` only asks whether __pump exists, and the OLD
                # document still answers yes for a moment after a reload is
                # asked for -- so it can return before the navigation, and the
                # next __pump() then lands in a document that is going away
                # ("Uncaught :: __pump(20)"). A marker that only this document
                # carries is what distinguishes the two.
                await cdp.js('window.__gone = true')
                await cdp.js('location.reload()')
                deadline = time.time() + args.settle + 10
                while time.time() < deadline:
                    if await cdp.js('typeof __gone === "undefined" '
                                    '&& typeof __pump === "function"'):
                        return
                    await asyncio.sleep(0.2)
                raise RuntimeError('the page did not come back after a reload')

            async def shot(name, note):
                await cdp.js(f'__pump({args.frames})')
                png = await cdp.send('Page.captureScreenshot', format='png')
                p = out / f'{name}.png'
                p.write_bytes(base64.b64decode(png['data']))
                hud = await cdp.js(HUD_JS)
                shots.append({'name': name, 'file': p.name, 'note': note, 'hud': hud})
                print(f'  {p.name}: {note}')

            redo = {}
            await shot('00-baseline', 'as the page boots')

            for key, lo, hi, is_pair in table:
                name = label(key)
                if name not in base:
                    print(f'  SKIP {key}: no row named {name!r}', file=sys.stderr)
                    continue
                for frac in fractions:
                    v = round(lo + frac * (hi - lo), 1)
                    if not args.chain:
                        await reboot()
                    got = await cdp.js(set_js(name, v))
                    tag = f'{key}-{str(frac).replace("0.", "p")}'
                    await shot(tag, f'{name} = {got} of {lo}..{hi} (asked {v})')
                    redo[tag] = (name, v)
                if args.chain:
                    # back to the number the page booted with -- which is not
                    # the same as back to the body it booted with
                    await cdp.js(set_js(name, float(base[name])))

            # the control case: does the body come back? (see the module note)
            if not args.chain:
                await reboot()
            await shot('99-baseline-again', 'the baseline, after the whole sweep')

            # How much of the picture moved, against the shot the page booted
            # with. It is the cheap guard on the whole run: a setting that
            # changes NOTHING is either a control with no effect or an event
            # that was dropped, and without this number the two look alike.
            ref = Image.open(out / '00-baseline.png').convert('L')
            for rec in shots:
                diff = ImageChops.difference(Image.open(out / rec['file']).convert('L'), ref)
                rec['changedPx'] = sum(1 for v in diff.getdata() if v > 12)
                rec['changedBox'] = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
            # A shot identical to the baseline is either an inert control or
            # an edit the browser dropped, and roughly one edit per sweep IS
            # dropped however many events are fired at it. Telling the two
            # apart is not the reader's job: every still shot is taken again,
            # and only a setting that is still identical the second time is
            # reported as moving nothing.
            for rec in shots:
                if rec['changedPx'] or rec['name'] not in redo:
                    continue
                name, v = redo[rec['name']]
                print(f'  {rec["name"]}: nothing moved, taking it again')
                await reboot()
                await cdp.js(set_js(name, v))
                await cdp.js(f'__pump({args.frames})')
                png = await cdp.send('Page.captureScreenshot', format='png')
                (out / rec['file']).write_bytes(base64.b64decode(png['data']))
                rec['hud'] = await cdp.js(HUD_JS)
                diff = ImageChops.difference(
                    Image.open(out / rec['file']).convert('L'), ref)
                rec['changedPx'] = sum(1 for x in diff.getdata() if x > 12)
                rec['changedBox'] = diff.point(lambda x: 255 if x > 12 else 0).getbbox()
                rec['retaken'] = True
                print(f'    second take: {rec["changedPx"]} px changed')
            still = [r['name'] for r in shots if r['changedPx'] == 0 and r['name'] in redo]
            if still:
                print(f'NOTHING MOVED, TWICE, in: {", ".join(still)} -- these settings '
                      f'really do change nothing on the page', file=sys.stderr)

            (out / 'index.json').write_text(json.dumps({
                'target': target, 'size': args.size, 'baseline': base,
                'fractions': fractions, 'shots': shots,
            }, indent=2))
            print(f'wrote {len(shots)} shots and index.json to {out}')
            bad = [l for l in cdp.logs if l[0] in ('error', 'exception')]
            for kind, text in cdp.logs:
                print(f'  [{kind}] {text}')
            return 1 if bad else 0
    finally:
        chrome.terminate()
        if server:
            server.terminate()
        shutil.rmtree(profile, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', help='directory for the PNGs and index.json')
    ap.add_argument('--only', help='comma-separated measurement keys (default: all of them)')
    ap.add_argument('--fractions', default='0.25,0.75', help='where in each range to sample')
    ap.add_argument('--size', default='1600x1000')
    ap.add_argument('--frames', type=int, default=20)
    ap.add_argument('--settle', type=float, default=20.0)
    ap.add_argument('--url', help='drive an already-running server instead of serving app/')
    ap.add_argument('--chain', action='store_true',
                    help='do not reload between settings: every body is built on top of the '
                         'previous one, which is how the generator carries state between builds')
    sys.exit(asyncio.run(run(ap.parse_args())))


if __name__ == '__main__':
    main()
