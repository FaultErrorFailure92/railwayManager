"""Landschaft: Wasser, Fels, Berge, Eisenbahnbrücke, Tiere (Pixel-Art, isometrisch 2:1)."""
import numpy as np
from PIL import Image

from buildgen import Iso, shade

DIA = lambda x, y: abs(x + 0.5 - 16) / 16 + abs(y + 0.5 - 8) / 8 <= 1.0


def _cube(top_fn, side_l, side_r, seed):
    """32x32 Würfel wie das Gras: Oberseite per Funktion, Seiten in Erdfarben."""
    rng = np.random.default_rng(seed)
    a = np.zeros((32, 32, 4), np.uint8)
    for y in range(32):
        for x in range(32):
            if DIA(x, y):
                c = top_fn(x, y, rng)
                if c is not None:
                    a[y, x] = tuple(c) + (255,)
            else:
                k = next((k for k in range(1, 17) if DIA(x, y - k) and y - k >= 8), None)
                if k is None:
                    continue
                pal = side_l if x < 16 else side_r
                r = rng.random()
                a[y, x] = (pal[0] if r < 0.7 else pal[1] if r < 0.9 else pal[2]) + (255,)
                if k == 16 or not any(DIA(x, y + 1 - j) and y + 1 - j >= 8 for j in range(1, 17)):
                    a[y, x] = (52, 40, 34, 255)
    return a


# ---------------------------------------------------------------- Wasser
WATER = [(58, 120, 196), (66, 132, 206), (80, 150, 220), (150, 200, 240)]
SAND, WET = (214, 200, 150), (150, 160, 140)
SIDE_WL = [(70, 92, 120), (64, 84, 110), (80, 104, 132)]
SIDE_WR = [(56, 74, 98), (50, 68, 90), (64, 84, 108)]


def edge_dist(x, y):
    """Abstand eines Pixels zu den vier Rautenkanten (in Pixeln, ungefähr)."""
    u, v = (x + 0.5 - 16) / 16, (y + 0.5 - 8) / 8
    # Kanten: oben-rechts (Nachbar y-1), oben-links (x-1), unten-rechts (x+1), unten-links (y+1)
    return {
        "N": (1 - (u - v)) * 8 if u - v > -1 else 99,   # oben rechts: u - v = 1
        "W": (1 - (-u - v)) * 8,                        # oben links: -u - v = 1
        "E": (1 - (u + v)) * 8,                         # unten rechts
        "S": (1 - (v - u)) * 8,                         # unten links
    }


def water(mask, seed=0):
    """mask Bits: 1=N (y-1) Land, 2=E (x+1), 4=S (y+1), 8=W (x-1)"""
    land = {"N": mask & 1, "E": mask & 2, "S": mask & 4, "W": mask & 8}

    def top(x, y, rng):
        d = edge_dist(x, y)
        near = min((d[k] for k in d if land[k]), default=99)
        if near < 1.6:
            return SAND
        if near < 2.8:
            return WET
        r = rng.random()
        if (x * 3 + y * 7 + seed) % 23 == 0 and r < 0.6:
            return WATER[3]
        return WATER[0] if r < 0.25 else WATER[1] if r < 0.8 else WATER[2]

    a = _cube(top, SIDE_WL, SIDE_WR, 300 + mask + seed * 17)
    # Wellen: kurze helle Striche
    rng = np.random.default_rng(400 + mask + seed)
    for _ in range(3):
        x, y = int(rng.integers(8, 22)), int(rng.integers(4, 12))
        for i in range(3):
            if DIA(x + i, y) and tuple(a[y, x + i][:3]) in WATER[:3]:
                a[y, x + i] = WATER[3] + (255,)
    return Image.fromarray(a, "RGBA")


# ---------------------------------------------------------------- Fels
ROCK = [(150, 142, 128), (136, 128, 116), (166, 158, 144), (118, 110, 100), (186, 178, 162)]
SIDE_RL = [(120, 112, 102), (110, 102, 94), (132, 124, 112)]
SIDE_RR = [(96, 90, 82), (88, 82, 76), (106, 100, 90)]


def rock(variant):
    coarse = np.random.default_rng(500 + variant).random((6, 10))

    def top(x, y, rng):
        v = coarse[min(5, y // 4), min(9, x // 4)] + (rng.random() - 0.5) * 0.5
        c = ROCK[3] if v < 0.2 else ROCK[1] if v < 0.45 else ROCK[0] if v < 0.75 else ROCK[2] if v < 0.92 else ROCK[4]
        if rng.random() < 0.05:
            c = (104, 150, 70)  # Grasbüschel
        return c

    return Image.fromarray(_cube(top, SIDE_RL, SIDE_RR, 600 + variant), "RGBA")


# ---------------------------------------------------------------- Berge
def mountain(w, h, height, seed, snow=True):
    """Berg als Höhenfeld: jede Weltsäule wird von hinten nach vorne gezeichnet (Voxel-Stil)."""
    rng = np.random.default_rng(seed)
    W, D = 16 * w, 16 * h
    iso = Iso(W, D, height + 4)
    a = np.array(iso.img)
    cx, cy = W / 2 + rng.uniform(-2, 2), D / 2 + rng.uniform(-2, 2)
    # Rauschen aus ein paar Sinuswellen
    waves = [(rng.uniform(0.15, 0.45), rng.uniform(0.15, 0.45), rng.uniform(0, 6.3), rng.uniform(0.05, 0.12)) for _ in range(5)]
    hf = np.zeros((D + 1, W + 1))
    for y in range(D + 1):
        for x in range(W + 1):
            dx, dy = (x - cx) / (W / 2), (y - cy) / (D / 2)
            ang = np.arctan2(dy, dx)
            r = np.hypot(dx, dy) * (1 + 0.12 * np.sin(ang * 3 + seed) + 0.08 * np.sin(ang * 5 + seed * 2))
            n = sum(amp * np.sin(x * fx + y * fy + ph) for fx, fy, ph, amp in waves)
            v = max(0.0, 1 - r) ** 1.25 * (1 + n)
            hf[y, x] = height * v
    L = np.array([-0.55, -0.75, 0.6])
    L /= np.linalg.norm(L)
    grass = [(86, 140, 62), (70, 118, 52), (104, 160, 72)]
    rocks = [(150, 140, 128), (128, 120, 110), (108, 100, 94), (172, 162, 148)]
    snows = [(240, 244, 250), (206, 216, 232), (184, 196, 216)]
    for ssum in range(W + D + 1):
        for x in range(max(0, ssum - D), min(W, ssum) + 1):
            y = ssum - x
            z = hf[y, x]
            if z < 0.6:
                continue
            gx = hf[y, min(W, x + 1)] - hf[y, max(0, x - 1)]
            gy = hf[min(D, y + 1), x] - hf[max(0, y - 1), x]
            nrm = np.array([-gx / 2, -gy / 2, 1.0])
            nrm /= np.linalg.norm(nrm)
            lit = float(np.dot(nrm, L)) + rng.uniform(-0.06, 0.06)
            k = 0 if lit > 0.75 else 1 if lit > 0.45 else 2
            rel = z / height + rng.uniform(-0.05, 0.05)
            if snow and rel > 0.62:
                col = snows[k]
            elif rel < 0.16:
                col = grass[k]
            else:
                col = rocks[3] if lit > 0.92 else rocks[k]
            px, py = iso.P(x, y, z)
            px, py = int(round(px)), int(round(py))
            _, py0 = iso.P(x, y, 0)
            for yy in range(py, int(round(py0)) + 1):
                for xx in (px, px + 1):
                    if 0 <= yy < a.shape[0] and 0 <= xx < a.shape[1]:
                        c = col if yy <= py + 1 else shade(col, 0.72)[:3]
                        a[yy, xx] = tuple(c) + (255,)
    return Image.fromarray(a), int(iso.x0), int(iso.y0)


def boulder(seed):
    iso = Iso(16, 16, 10)
    rng = np.random.default_rng(seed)
    cols = [(150, 142, 130), (120, 112, 104), (172, 164, 150)]
    iso.poly([(3, 6, 0), (8, 3, 0), (13, 6, 0), (12, 12, 0), (5, 12, 0)], (90, 130, 64, 160))
    pts_top = (7 + rng.uniform(-1, 1), 7 + rng.uniform(-1, 1), 7 + rng.uniform(0, 2))
    ring = [(4, 7, 0), (8, 4, 0), (12, 7, 0), (11, 11, 0), (6, 11, 0)]
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        face = i in (2, 3)
        iso.poly([a, b, pts_top], (cols[1] if face else cols[0] if i != 4 else cols[2]) + (255,), shade(cols[1], 0.7))
    return iso.result()


# ---------------------------------------------------------------- Eisenbahnbrücke (Gleis über Wasser, entlang x)
def rail_bridge():
    iso = Iso(16, 16, 10)
    steel, dark = (88, 98, 112), (60, 66, 78)
    pier = (150, 140, 124)
    # Pfeiler in der Mitte bis ins Wasser
    iso.box(6, 5, 10, 11, -10, 0, pier)
    # seitliche Träger (hinten und vorne)
    for y in (1.5, 14.5):
        iso.poly([(0, y, 0), (16, y, 0), (16, y, 3), (0, y, 3)], steel + (255,), dark + (255,))
        for x in (0, 8, 16):
            iso.line((x, y, 0), (x, y, 3), dark + (255,))
    return iso.result()


# ---------------------------------------------------------------- Tiere
# Pixelkarten nach rechts schauend; '.' = leer. Pro Tier: Schritt 1, Schritt 2, Grasen
PAL = {
    "w": (244, 242, 234), "k": (40, 36, 34), "b": (120, 80, 50), "B": (92, 60, 38), "p": (232, 170, 160),
    "g": (200, 196, 186), "s": (232, 228, 214), "S": (198, 192, 176), "o": (210, 120, 50), "O": (170, 92, 40),
    "h": (176, 150, 118), "H": (140, 116, 90), "e": (30, 30, 30), "y": (228, 210, 120),
}
ANIMALS = {
    "cow": [
        ["..........", ".kkwwkwwk.", "kwwkwwwkwk", "kwwwwkkwwp", ".kwwwwwww.", ".k.k..k.k.", ".k.k..k.k."],
        ["..........", ".kkwwkwwk.", "kwwkwwwkwk", "kwwwwkkwwp", ".kwwwwwww.", "..k.kk.k..", "..k.kk.k.."],
        ["..........", ".kkwwkwwk.", "kwwkwwwkw.", "kwwwwkkwwk", ".kwwwwwwwp", ".k.k..k.k.", ".k.k..k.k."],
    ],
    "sheep": [
        [".......", ".ssss..", "sssssSk", "sssssSk", ".Ssss..", ".k..k..", ".k..k.."],
        [".......", ".ssss..", "sssssSk", "sssssSk", ".Ssss..", "..kk...", "..kk..."],
        [".......", ".ssss..", "sssssS.", "sssssSk", ".SsssSk", ".k..k..", ".k..k.."],
    ],
    "deer": [
        ["......B.", "......bB", "......be", ".bbbbbb.", "bbbbbbb.", ".hbbbbh.", ".b.b.b..", ".b...b.."],
        ["......B.", "......bB", "......be", ".bbbbbb.", "bbbbbbb.", ".hbbbbh.", "..bb.b..", "..b..b.."],
        ["........", "........", "......B.", ".bbbbbbB", "bbbbbbbb", ".hbbbbhe", ".b.b.b..", ".b...b.."],
    ],
    "hare": [
        ["...H.", "...hH", ".hhhe", "hhhh.", ".h.h."],
        ["...H.", "...hH", ".hhhe", "hhhh.", "..hh."],
        [".....", "...H.", ".hhhh", "hhhhe", ".h.h."],
    ],
    "fox": [
        [".......", ".....oO", "o....oe", "Oooooo.", ".oooo..", ".k..k.."],
        [".......", ".....oO", "o....oe", "Oooooo.", ".oooo..", "..kk..."],
        [".......", ".......", "o....oO", "Ooooooe", ".oooo..", ".k..k.."],
    ],
}


def animal_sheet(name):
    frames = ANIMALS[name]
    h = max(len(f) for f in frames)
    w = max(len(r) for f in frames for r in f)
    sheet = np.zeros((h, w * len(frames), 4), np.uint8)
    for i, f in enumerate(frames):
        off = h - len(f)
        for y, row in enumerate(f):
            for x, ch in enumerate(row):
                if ch in PAL:
                    sheet[y + off, i * w + x] = PAL[ch] + (255,)
    return Image.fromarray(sheet, "RGBA"), w, h
