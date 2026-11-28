#!/usr/bin/env python3
"""Assemble screenshots into labelled contact plates.

A sweep (`tools/body_sweep.py`) makes dozens of pictures, and dozens of
pictures are not a comparison: they have to be looked at side by side, at the
same scale, with what each one is written on it. This crops every shot to the
part that matters, scales it, lays the cells out in a grid and writes one PNG
per page.

    python3 tools/plate.py out/sweep out/plate          # plate-1.png, plate-2.png, ...
    python3 tools/plate.py out/sweep out/plate --cols 4 --rows 2 --crop 520,30,600,960
    python3 tools/plate.py out/sweep out/plate --first 00-baseline   # repeat a reference cell

Captions come from the sweep's `index.json` when there is one, and from the
file name otherwise.
"""
import argparse, json, pathlib, sys

from PIL import Image, ImageDraw, ImageFont

FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def font(size):
    for f in FONTS:
        if pathlib.Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def captions(src):
    idx = src / 'index.json'
    if not idx.exists():
        return {}
    d = json.loads(idx.read_text())
    return {s['file']: s['note'] for s in d['shots']}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', help='directory of PNGs (a tools/body_sweep.py output)')
    ap.add_argument('out', help='output prefix; pages are <out>-1.png, <out>-2.png, ...')
    ap.add_argument('--crop', default='520,30,600,960', help='x,y,w,h taken from each shot')
    ap.add_argument('--cols', type=int, default=4)
    ap.add_argument('--rows', type=int, default=2)
    ap.add_argument('--scale', type=float, default=0.45)
    ap.add_argument('--first', help='shot name repeated as the first cell of every page')
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    notes = captions(src)
    shots = sorted(p for p in src.glob('*.png'))
    if not shots:
        sys.exit(f'no PNGs in {src}')
    ref = None
    if args.first:
        ref = next((p for p in shots if p.stem == args.first), None)
        if ref is None:
            sys.exit(f'no shot named {args.first}')
        shots = [p for p in shots if p != ref]

    cx, cy, cw, ch = (int(v) for v in args.crop.split(','))
    tw, th = int(cw * args.scale), int(ch * args.scale)
    pad, caph = 8, 34
    f = font(13)
    fb = font(15)
    per = args.cols * args.rows - (1 if ref else 0)
    pages = [shots[i:i + per] for i in range(0, len(shots), per)]

    for n, page in enumerate(pages, 1):
        cells = ([ref] if ref else []) + page
        W = args.cols * (tw + pad) + pad
        H = args.rows * (th + caph + pad) + pad
        sheet = Image.new('RGB', (W, H), (18, 20, 24))
        d = ImageDraw.Draw(sheet)
        for i, p in enumerate(cells):
            col, row = i % args.cols, i // args.cols
            x = pad + col * (tw + pad)
            y = pad + row * (th + caph + pad)
            im = Image.open(p).convert('RGB').crop((cx, cy, cx + cw, cy + ch))
            sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
            note = notes.get(p.name, '')
            head = p.stem if p != ref else f'{p.stem} (reference)'
            d.text((x + 2, y + th + 3), head, font=fb, fill=(235, 235, 240))
            # a caption that runs past its cell labels the next picture, so it
            # is cut to the measured width of the cell, not to a guess at it
            while note and d.textlength(note, font=f) > tw - 4:
                note = note[:-1]
            d.text((x + 2, y + th + 19), note, font=f, fill=(150, 200, 255))
        out = pathlib.Path(f'{args.out}-{n}.png')
        out.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(out)
        print(f'wrote {out} ({W}x{H}, {len(cells)} cells)')


if __name__ == '__main__':
    main()
