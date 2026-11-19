"""Textur-Atlas (RM-FR-PERF-02): alle Einzelbilder aus src/gen/manifest.json in ein Bild packen.

Aufruf: npm run atlas  (nach jeder Änderung an den Sprites)
Ergebnis: public/assets/atlas/gen.png + gen.json (Phaser-Atlas, JSON-Hash)
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, 'public', 'assets', 'gen')
OUT = os.path.join(ROOT, 'public', 'assets', 'atlas')
PAD = 2
WIDTH = 1024


def main():
    m = json.load(open(os.path.join(ROOT, 'src', 'gen', 'manifest.json'), encoding='utf-8'))
    items = []
    for name, s in m['sprites'].items():
        im = Image.open(os.path.join(GEN, s['file'])).convert('RGBA')
        items.append((name, im))
    # Regale: nach Höhe sortiert, Zeile für Zeile
    items.sort(key=lambda t: (-t[1].height, -t[1].width, t[0]))
    x = y = row = 0
    pos = {}
    for name, im in items:
        w, h = im.size
        if x + w + PAD > WIDTH:
            x, y, row = 0, y + row + PAD, 0
        pos[name] = (x, y)
        x += w + PAD
        row = max(row, h)
    height = 1
    while height < y + row:
        height *= 2
    sheet = Image.new('RGBA', (WIDTH, height), (0, 0, 0, 0))
    frames = {}
    for name, im in items:
        px, py = pos[name]
        sheet.paste(im, (px, py))
        w, h = im.size
        frames[name] = {
            'frame': {'x': px, 'y': py, 'w': w, 'h': h},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h},
            'sourceSize': {'w': w, 'h': h},
        }
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, 'gen.png'), optimize=True)
    meta = {'image': 'gen.png', 'format': 'RGBA8888', 'size': {'w': WIDTH, 'h': height}, 'scale': '1'}
    with open(os.path.join(OUT, 'gen.json'), 'w', encoding='utf-8') as f:
        json.dump({'frames': dict(sorted(frames.items())), 'meta': meta}, f, separators=(',', ':'))
    print(f'Atlas: {len(frames)} Bilder, {WIDTH}x{height}')


if __name__ == '__main__':
    main()
