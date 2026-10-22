"""Erzeugt alle Spiel-Sprites nach public/assets/gen + manifest.json.

Aufruf (im Projektordner):  python3 tools/gen_sprites.py
Benoetigt: numpy, pillow
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "assets", "gen")
sys.path.insert(0, HERE)
import trackgen as tg  # noqa: E402

os.makedirs(OUT, exist_ok=True)
manifest = {"sprites": {}, "paths": {}}


def save(name, img, ox, oy):
    """ox/oy: Bildschirm-Offset der Sprite-Ecke (links oben) relativ zum Ankerpunkt."""
    img.save(os.path.join(OUT, name + ".png"))
    manifest["sprites"][name] = {"file": name + ".png", "ox": int(ox), "oy": int(oy),
                                 "w": img.width, "h": img.height}


# ---------------------------------------------------------------- Boden
# Würfel 32x32 im Stil deines Tilesets (assets/tiles.png): Gras oben, Erde an den Seiten.
# 4 Varianten, damit die Wiese nicht gleichförmig wirkt. Anker = obere Ecke der Raute.
GRASS = [(153, 229, 80), (163, 236, 92), (140, 214, 72), (130, 204, 66), (174, 242, 104), (118, 192, 62)]
GRID = (100, 176, 84)
SOIL_L = [(132, 92, 60), (120, 82, 54), (146, 104, 68)]
SOIL_R = [(108, 74, 48), (98, 66, 44), (120, 84, 56)]
LIP_L, LIP_R = (120, 196, 62), (100, 172, 54)
N_GROUND = 8


def ground(variant):
    rng = np.random.default_rng(100 + variant)
    a = np.zeros((32, 32, 4), np.uint8)
    dia = lambda x, y: abs(x + 0.5 - 16) / 16 + abs(y + 0.5 - 8) / 8 <= 1.0
    # grobes Rauschen für Grasflecken (4x4 px Zellen, weich interpoliert)
    coarse = rng.random((6, 10))
    def patch(x, y):
        fx, fy = x / 4, y / 4
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        c = coarse
        v = (c[y0, x0] * (1 - tx) + c[y0, x0 + 1] * tx) * (1 - ty) + (c[y0 + 1, x0] * (1 - tx) + c[y0 + 1, x0 + 1] * tx) * ty
        return v
    for y in range(32):
        for x in range(32):
            if dia(x, y):
                v = patch(x, y) + (rng.random() - 0.5) * 0.35
                c = GRASS[5] if v < 0.18 else GRASS[3] if v < 0.32 else GRASS[2] if v < 0.48 else GRASS[0] if v < 0.72 else GRASS[1] if v < 0.88 else GRASS[4]
                a[y, x] = c + (255,)
            else:
                k = next((k for k in range(1, 17) if dia(x, y - k) and y - k >= 8), None)
                if k is None:
                    continue
                left = x < 16
                if k <= 2:
                    a[y, x] = (LIP_L if left else LIP_R) + (255,)
                else:
                    pal = SOIL_L if left else SOIL_R
                    r = rng.random()
                    a[y, x] = (pal[0] if r < 0.7 else pal[1] if r < 0.88 else pal[2]) + (255,)
                    if k > 6 and rng.random() < 0.04:
                        a[y, x] = (150, 140, 128, 255)  # Steinchen in der Erde
                if k == 16 or not any(dia(x, y + 1 - j) and y + 1 - j >= 8 for j in range(1, 17)):
                    a[y, x] = (70, 48, 34, 255)
    # Grashalme: dunkler Fuß, heller Spitze
    for _ in range(14 + variant * 2):
        x, y = int(rng.integers(3, 29)), int(rng.integers(3, 14))
        if dia(x, y) and dia(x, y - 1) and dia(x, y - 2):
            a[y, x] = GRASS[5] + (255,)
            a[y - 1, x] = GRASS[3] + (255,)
            if rng.random() < 0.5:
                a[y - 2, x] = GRASS[4] + (255,)
    # dezentes Raster: hintere Kanten der Raute
    for x in range(32):
        for y in range(16):
            if dia(x, y) and not dia(x, y - 1):
                a[y, x] = GRID + (255,)
    if variant in (5, 6):
        for _ in range(variant - 3):
            x, y = int(rng.integers(8, 24)), int(rng.integers(5, 11))
            if dia(x, y):
                col = [(246, 206, 72), (240, 238, 226), (232, 120, 170)][int(rng.integers(3))]
                a[y, x] = col + (255,)
    if variant == 7:
        x, y = int(rng.integers(10, 20)), int(rng.integers(6, 10))
        a[y, x] = (150, 150, 142, 255); a[y, x + 1] = (120, 120, 114, 255)
    return Image.fromarray(a, "RGBA")


for v in range(N_GROUND):
    save(f"ground_{v}", ground(v), -16, 0)
manifest["groundVariants"] = N_GROUND

# ---------------------------------------------------------------- Gleise
# Anker = Welt (0,0) des jeweiligen Rechtecks.
img, (sx, sy) = tg.render([(tg.main_path(8, 0, 16), True)], (0, 0, 16, 16))
save("track", img, sx, sy)

def store_path(name, path):
    """Pfad fuer die Simulation, ca. 1 Einheit Abstand"""
    pts = [path[0]]
    for p in path[1:]:
        if np.linalg.norm(p - pts[-1]) >= 1.0:
            pts.append(p)
    pts[-1] = path[-1]
    manifest["paths"][name] = [[round(float(x), 3), round(float(y), 3)] for x, y in pts]


xd, xu = tg.s_path(8, 24), tg.s_path(24, 8)
C = {"c1": tg.curve_c1(), "c2": tg.curve_c2(), "c3": tg.curve_c3(), "c4": tg.curve_c4()}
CS = {"c1": True, "c2": False, "c3": True, "c4": False}   # beginnt gerade?
DD = tg.line((0, 8), (16, 24))
DA = tg.line((0, 24), (16, 8))
for k, v in {"xover_down": xd, "xover_up": xu, **C, "diag_desc": DD, "diag_asc": DA}.items():
    store_path(k, v)


def cv(k, primary):
    off, st = tg.curve_sleepers(C[k], CS[k])
    return (C[k], primary, off, st)


R0, R1 = tg.main_path(8), tg.main_path(24)
PIECES = {
    "xover_down": [(R0, True), (R1, True), (xd, False)],
    "xover_up": [(R0, True), (R1, True), (xu, False)],
    "branch_divDown": [(R0, True), cv("c1", False)],
    "branch_divUp": [(R1, True), cv("c3", False)],
    "branch_mergeAbove": [(R1, True), cv("c2", False)],
    "branch_mergeBelow": [(R0, True), cv("c4", False)],
    "curve_divDown": [cv("c1", True)],
    "curve_divUp": [cv("c3", True)],
    "curve_mergeAbove": [cv("c2", True)],
    "curve_mergeBelow": [cv("c4", True)],
}
for key, tracks in PIECES.items():
    img, (sx, sy) = tg.render(tracks, (0, 0, 48, 32))
    save("piece_" + key, img, sx, sy)
for key, P in (("diag_desc", DD), ("diag_asc", DA)):
    img, (sx, sy) = tg.render([(P, True, tg.DIAG_OFF, tg.DIAG_STEP)], (0, 0, 16, 32))
    save("piece_" + key, img, sx, sy)
# Gleiskreuzungen: Diagonale über ein gerades Gleis (oben oder unten)
for d, P in (("desc", DD), ("asc", DA)):
    for row in (0, 1):
        img, (sx, sy) = tg.render([(tg.main_path(8 + 16 * row, 0, 16), True), (P, False, tg.DIAG_OFF, tg.DIAG_STEP)], (0, 0, 16, 32))
        save(f"piece_cross_{d}{row}", img, sx, sy)

# ---------------------------------------------------------------- Bahnsteig
def platform(line_n, line_s):
    """Erhöhter Bahnsteig mit Pflaster; weiße Sicherheitslinie an der Gleisseite (n = -y, s = +y)."""
    H = 4
    a = np.zeros((16 + H, 32, 4), np.uint8)
    dia = lambda x, y: abs(x + 0.5 - 16) / 16 + abs(y + 0.5 - 8) / 8 <= 1.04
    for y in range(16 + H):
        for x in range(32):
            if dia(x, y):
                sx, sy = x + 0.5 - 16, y + 0.5
                wx, wy = sy + sx / 2, sy - sx / 2
                c = (204, 200, 190)
                if (wx % 8) < 0.9 or (wy % 8) < 0.9:
                    c = (186, 182, 172)
                if (line_n and 1.2 <= wy < 2.6) or (line_s and 13.4 <= wy < 14.8):
                    c = (244, 240, 226)
                a[y, x] = c + (255,)
            elif any(dia(x, y - k) and y - k >= 8 for k in range(1, H + 1)):
                a[y, x] = ((150, 146, 140) if x < 16 else (118, 114, 110)) + (255,)
    return Image.fromarray(a, "RGBA")


for name, n, s_ in (("platform", False, False), ("platform_n", True, False), ("platform_s", False, True), ("platform_ns", True, True)):
    save(name, platform(n, s_), -16, -4)

# ---------------------------------------------------------------- Signal
def signal(color):
    img = Image.new("RGBA", (5, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line([(2, 4), (2, 15)], fill=(70, 70, 76, 255))
    d.rectangle([0, 0, 4, 6], fill=(40, 40, 46, 255))
    d.rectangle([1, 1, 3, 2], fill=color)
    d.point((2, 1), fill=(255, 255, 255, 200))
    d.line([(1, 15), (3, 15)], fill=(70, 70, 76, 255))
    return img
save("signal_red", signal((230, 40, 40, 255)), -2, -15)
save("signal_green", signal((60, 230, 90, 255)), -2, -15)

# ---------------------------------------------------------------- Wagen
CAR_L, CAR_W, CAR_H = 14.5, 9.0, 11
ORIENT = {0: (1.0, 0.0), 1: (0.7071, 0.7071), 2: (0.7071, -0.7071)}


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)


def car(body, roof, kind, accent=None, orient=0):
    t = np.array(ORIENT[orient]); n = np.array([-t[1], t[0]])
    hl, hw = CAR_L / 2, CAR_W / 2
    z_floor = 2
    CAR_H = 9 if kind in ("tank", "steam") else globals()["CAR_H"]
    TOP = CAR_H + (4 if kind == "steam" else 0)

    def P(u, v, z):
        w = u * t + v * n
        return (w[0] - w[1], (w[0] + w[1]) / 2 - z)

    faces = []
    for sgn in (1, -1):  # Stirnseiten
        nrm = sgn * t
        if nrm[0] + nrm[1] > 0.05:
            u = sgn * hl
            faces.append(("end", sgn, [P(u, -hw, z_floor), P(u, hw, z_floor), P(u, hw, CAR_H), P(u, -hw, CAR_H)], nrm))
    for sgn in (1, -1):  # Laengsseiten
        nrm = sgn * n
        if nrm[0] + nrm[1] > 0.05:
            v = sgn * hw
            faces.append(("side", sgn, [P(-hl, v, z_floor), P(hl, v, z_floor), P(hl, v, CAR_H), P(-hl, v, CAR_H)], nrm))
    top = [P(-hl, -hw, CAR_H), P(hl, -hw, CAR_H), P(hl, hw, CAR_H), P(-hl, hw, CAR_H)]
    allp = [p for f in faces for p in f[2]] + top + [P(u, v, 0) for u in (-hl, hl) for v in (-hw, hw)] + \
        [P(u, v, TOP) for u in (-hl, hl) for v in (-hw, hw)]
    xs = [p[0] for p in allp]; ys = [p[1] for p in allp]
    x0, y0 = int(np.floor(min(xs))) - 1, int(np.floor(min(ys))) - 1
    W, H = int(np.ceil(max(xs))) - x0 + 2, int(np.ceil(max(ys))) - y0 + 2
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    S = lambda pts: [(x - x0, y - y0) for x, y in pts]

    # Fahrwerk (dunkel)
    for sgn in (1, -1):
        nrm = sgn * n
        if nrm[0] + nrm[1] > -0.05:
            v = sgn * (hw - 1)
            d.polygon(S([P(-hl + 1, v, 0), P(hl - 1, v, 0), P(hl - 1, v, z_floor), P(-hl + 1, v, z_floor)]),
                      fill=(40, 34, 40, 255))
    for kind_f, sgn, pts, nrm in faces:
        f = 0.82 if nrm[0] > nrm[1] + 0.05 else 1.0
        if abs(nrm[0] - nrm[1]) < 0.05:
            f = 0.9
        d.polygon(S(pts), fill=shade(body, f))
        if kind_f == "side" and kind in ("loco", "coach", "emu", "cab", "pcar"):
            v = sgn * hw
            band = (30, 40, 56, 255) if kind in ("loco", "pcar") else (40, 56, 80, 255)
            if kind == "pcar":
                d.polygon(S([P(-hl + 1, v, 6), P(-hl + 4, v, 6), P(-hl + 4, v, 8.5), P(-hl + 1, v, 8.5)]), fill=band)
                d.polygon(S([P(hl - 4, v, 6), P(hl - 1, v, 6), P(hl - 1, v, 8.5), P(hl - 4, v, 8.5)]), fill=band)
            elif kind != "loco":
                u = -hl + 1.5
                while u + 2.2 <= hl - 1.2:
                    d.polygon(S([P(u, v, 6), P(u + 2.2, v, 6), P(u + 2.2, v, 8.5), P(u, v, 8.5)]), fill=band)
                    u += 3.0
            else:
                for u0 in (-hl + 1, hl - 3.5):
                    d.polygon(S([P(u0, v, 6), P(u0 + 2.5, v, 6), P(u0 + 2.5, v, 8.5), P(u0, v, 8.5)]), fill=band)
            if accent:
                d.polygon(S([P(-hl, v, 3), P(hl, v, 3), P(hl, v, 4.5), P(-hl, v, 4.5)]), fill=accent)
        if kind_f == "side" and kind == "tank":
            v = sgn * hw
            for z in (3.5, 7):
                d.polygon(S([P(-hl, v, z), P(hl, v, z), P(hl, v, z + 0.8), P(-hl, v, z + 0.8)]), fill=shade(body, 0.75))
        if kind_f == "side" and kind == "steam":
            v = sgn * hw
            d.polygon(S([P(-hl, v, 2), P(hl, v, 2), P(hl, v, 3.5), P(-hl, v, 3.5)]), fill=(170, 40, 36, 255))
        if kind_f == "end" and kind in ("loco", "emu", "cab", "pcar"):
            u = sgn * hl
            d.polygon(S([P(u, -hw + 1.5, 6), P(u, hw - 1.5, 6), P(u, hw - 1.5, 8.5), P(u, -hw + 1.5, 8.5)]),
                      fill=(30, 40, 56, 255))
        if kind_f == "end" and accent and kind != "wagon":
            u = sgn * hl
            d.polygon(S([P(u, -hw, 3), P(u, hw, 3), P(u, hw, 4.5), P(u, -hw, 4.5)]), fill=accent)
    d.polygon(S(top), fill=roof)

    def box3(u0, u1, v0, v1, z0, z1, col):
        """kleiner Aufbau (Kessel, Führerhaus, Dom)"""
        for sgn in (1, -1):
            nrm = sgn * t
            if nrm[0] + nrm[1] > 0.05:
                u = u1 if sgn > 0 else u0
                d.polygon(S([P(u, v0, z0), P(u, v1, z0), P(u, v1, z1), P(u, v0, z1)]), fill=shade(col, 0.9))
            nrm = sgn * n
            if nrm[0] + nrm[1] > 0.05:
                v = v1 if sgn > 0 else v0
                f = 0.82 if nrm[0] > nrm[1] + 0.05 else 1.0
                d.polygon(S([P(u0, v, z0), P(u1, v, z0), P(u1, v, z1), P(u0, v, z1)]), fill=shade(col, f))
        d.polygon(S([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)]), fill=shade(col, 1.15))

    if kind == "steam":
        box3(-hl, -hl + 5, -hw, hw, CAR_H, CAR_H + 4, (40, 40, 46))      # Führerhaus
        box3(hl - 3.5, hl - 1.5, -1, 1, CAR_H, CAR_H + 4, (30, 30, 34))   # Schornstein
        box3(-1, 1.5, -1.5, 1.5, CAR_H, CAR_H + 1.5, (176, 140, 60))     # Dom (Messing)
    if kind == "tank":
        box3(-1.2, 1.2, -1.5, 1.5, CAR_H, CAR_H + 1.5, shade(body, 0.85))
    if kind == "wagon":  # Container-Rippen
        for u in np.arange(-hl + 2, hl - 1, 2.5):
            d.line(S([P(u, -hw, CAR_H), P(u, hw, CAR_H)]), fill=shade(roof, 0.85))
    # Anker = Wagenmitte am Boden -> Bildschirm (0,0)
    return img, x0, y0


SCHEMES = {
    "ro": {"loco": ((196, 52, 48), (170, 170, 170), None),
           "coach": ((196, 52, 48), (170, 170, 170), (240, 240, 240, 255))},
    "wx": {"loco": ((232, 232, 226), (150, 156, 164), (36, 86, 170, 255)),
           "coach": ((232, 232, 226), (150, 156, 164), (36, 86, 170, 255))},
    "cd": {"loco": ((232, 138, 36), (120, 120, 120), (40, 40, 40, 255)),
           "wagon0": ((52, 96, 160), (70, 116, 180), None),
           "wagon1": ((170, 60, 50), (190, 80, 66), None),
           "wagon2": ((70, 130, 80), (90, 150, 100), None)},
    "sb": {"emu": ((236, 236, 230), (120, 130, 140), (31, 159, 168, 255))},
    "rx": {"loco": ((63, 143, 58), (140, 146, 150), (240, 240, 230, 255)),
           "coach": ((226, 226, 218), (140, 146, 150), (63, 143, 58, 255)),
           "cab": ((226, 226, 218), (140, 146, 150), (63, 143, 58, 255))},
    "nj": {"loco": ((52, 58, 120), (110, 112, 130), (214, 176, 80, 255)),
           "coach": ((52, 58, 120), (110, 112, 130), (214, 176, 80, 255))},
    "tx": {"loco": ((217, 182, 42), (100, 100, 104), (40, 40, 40, 255)),
           "tank": ((196, 200, 204), (214, 218, 222), None)},
    "cs": {"loco": ((156, 74, 44), (100, 100, 104), (240, 200, 40, 255)),
           "wagon0": ((52, 96, 160), (70, 116, 180), None),
           "wagon1": ((170, 60, 50), (190, 80, 66), None),
           "wagon2": ((70, 130, 80), (90, 150, 100), None)},
    "lb": {"loco": ((240, 196, 40), (110, 116, 124), (47, 127, 184, 255)),
           "coach": ((47, 127, 184), (140, 146, 150), (240, 196, 40, 255)),
           "cab": ((47, 127, 184), (140, 146, 150), (240, 196, 40, 255))},
    "hv": {"loco": ((138, 90, 44), (90, 90, 94), (240, 220, 160, 255)),
           "wagon0": ((120, 84, 48), (160, 116, 70), None),
           "wagon1": ((104, 74, 44), (150, 110, 64), None),
           "wagon2": ((132, 96, 58), (170, 128, 80), None)},
    "hs": {"pcar": ((240, 240, 236), (60, 64, 72), (200, 16, 46, 255)),
           "coach": ((240, 240, 236), (150, 156, 164), (200, 16, 46, 255))},
    "dm": {"steam": ((34, 34, 38), (52, 52, 58), None),
           "coach": ((122, 42, 36), (70, 60, 56), (214, 176, 80, 255))},
}
for sch, kinds in SCHEMES.items():
    for kname, (body, roof, accent) in kinds.items():
        kind = "wagon" if kname.startswith("wagon") else kname
        for o in ORIENT:
            img, x0, y0 = car(body, roof + (255,), kind, accent, o)
            save(f"car_{sch}_{kname}_{o}", img, x0, y0)

# ---------------------------------------------------------------- Menschen
# Spritesheet 3x7 px pro Bild: je Variante 3 Bilder (stehen, gehen A, gehen B)
SHIRTS = [(214, 64, 56), (52, 104, 196), (236, 196, 60), (70, 160, 90), (150, 86, 180), (236, 130, 50),
          (232, 232, 226), (60, 170, 170)]
PANTS = [(40, 48, 80), (90, 90, 96), (96, 70, 50), (34, 34, 38)]
HAIR = [(92, 60, 36), (30, 26, 24), (214, 178, 96), (150, 150, 150)]
SKIN = [(240, 200, 164), (206, 150, 110), (140, 94, 64)]
N_PEOPLE = 16


def person(v, frame):
    rng = np.random.default_rng(500 + v)
    shirt = SHIRTS[v % len(SHIRTS)]
    pants = PANTS[int(rng.integers(len(PANTS)))]
    hair = HAIR[int(rng.integers(len(HAIR)))]
    skin = SKIN[int(rng.integers(len(SKIN)))]
    dark = tuple(int(c * 0.78) for c in shirt)
    a = np.zeros((7, 3, 4), np.uint8)
    put = lambda x, y, c: a.__setitem__((y, x), c + (255,))
    put(1, 0, hair)
    put(1, 1, skin)
    for x, c in ((0, shirt), (1, shirt), (2, dark)):
        put(x, 2, c)
        put(x, 3, c)
    put(1, 4, shirt)
    put(1, 5, pants)
    if frame == 0:
        put(0, 6, pants); put(2, 6, pants)
    elif frame == 1:
        put(0, 6, pants); put(1, 6, pants)
    else:
        put(1, 6, pants); put(2, 6, pants)
    if frame == 1:
        put(0, 3, skin)  # Arm schwingt
    if frame == 2:
        put(2, 3, skin)
    return a


sheet = np.zeros((7 * N_PEOPLE, 9, 4), np.uint8)
for v in range(N_PEOPLE):
    for f in range(3):
        sheet[v * 7:(v + 1) * 7, f * 3:(f + 1) * 3] = person(v, f)
Image.fromarray(sheet, "RGBA").save(os.path.join(OUT, "people.png"))
manifest["people"] = {"file": "people.png", "w": 3, "h": 7, "variants": N_PEOPLE, "frames": 3}

# ---------------------------------------------------------------- Gebäude & Natur
import buildgen as bg  # noqa: E402

BUILDINGS = {
    # Anker = Welt (0,0) der Grundfläche; Bahnsteig-Gebäude stehen 4 px höher
    "bld_station": bg.gable_house(3, 2, (226, 214, 180), (168, 72, 56), H=14, R=8, sign=(40, 70, 130, 255)),
    "bld_houseA": bg.gable_house(2, 2, (236, 232, 222), (90, 96, 110), H=11, R=8),
    "bld_houseB": bg.gable_house(2, 2, (232, 206, 120), (176, 70, 52), H=11, R=7),
    "bld_shelter": bg.shelter(),
    "bld_kiosk": bg.kiosk(),
    "bld_bench": bg.bench(),
}
ON_PLATFORM = {"bld_shelter", "bld_kiosk", "bld_bench"}
for name, (img, ox, oy) in BUILDINGS.items():
    save(name, img, ox, oy - (4 if name in ON_PLATFORM else 0))
NATURE = {}
for i in range(3):
    NATURE[f"bld_tree{i}"] = bg.tree_round(10 + i)
for i in range(2):
    NATURE[f"bld_pine{i}"] = bg.tree_pine(20 + i)
NATURE["bld_bush0"] = bg.bush(30)
for name, (img, ox, oy) in NATURE.items():
    save(name, img, ox, oy + 8)  # Anker = Tile-Ecke, Baum steht in der Tile-Mitte (Bildschirm +8)

# ---------------------------------------------------------------- Läden, Straße, Bahnhofsausbau, Deko
P5 = {
    "bld_cafe": bg.cafe(), "bld_parking": bg.parking(), "bld_bus": bg.bus_terminal(),
    "bld_station2": bg.station_big(2), "bld_station3": bg.station_big(3),
    "bld_fountain": bg.fountain(), "bld_flowers": bg.flowers(5), "bld_statue": bg.statue(),
}
for name, (img, ox, oy) in P5.items():
    save(name, img, ox, oy)
for name, (img, ox, oy) in {"bld_vending": bg.vending(), "bld_lamp": bg.lamp(), "bld_clock": bg.platform_clock()}.items():
    save(name, img, ox, oy - 4)   # stehen auf dem Bahnsteig
for m in range(16):
    img, ox, oy = bg.road(m)
    save(f"road_{m}", img, ox, oy)

# ---------------------------------------------------------------- Landschaft: Wasser, Fels, Berge, Brücke, Tiere
import terraingen as trg  # noqa: E402

for m in range(16):
    save(f"water_{m}", trg.water(m), -16, 0)
for v in range(4):
    save(f"rock_{v}", trg.rock(v), -16, 0)
for name, args in {"bld_mtn0": (3, 3, 50, 71), "bld_mtn1": (2, 2, 30, 72), "bld_mtn2": (3, 3, 38, 73), "bld_mtn3": (2, 2, 22, 74)}.items():
    w, h, height, seed = args
    img, ox, oy = trg.mountain(w, h, height, seed, snow=height >= 30)
    save(name, img, ox, oy)
for i in range(2):
    img, ox, oy = trg.boulder(80 + i)
    save(f"bld_rock{i}", img, ox, oy)
img, ox, oy = trg.rail_bridge()
save("rail_bridge", img, ox, oy)
manifest["animals"] = {}
for name in trg.ANIMALS:
    img, w, h = trg.animal_sheet(name)
    img.save(os.path.join(OUT, f"animal_{name}.png"))
    manifest["animals"][name] = {"file": f"animal_{name}.png", "w": w, "h": h, "frames": 3}

# ---------------------------------------------------------------- Stimmung, Icons, Pfeil
bg.emote_sheet().save(os.path.join(OUT, "emotes.png"))
manifest["emotes"] = {"file": "emotes.png", "w": 9, "h": 10, "names": bg.EMOTES}
os.makedirs(os.path.join(OUT, "ui"), exist_ok=True)
for n in bg.ICONS:
    bg.icon(n).save(os.path.join(OUT, "ui", n + ".png"))
bg.arrow().save(os.path.join(OUT, "arrow.png"))
manifest["sprites"]["arrow"] = {"file": "arrow.png", "ox": -5, "oy": -12, "w": 11, "h": 12}

# ---------------------------------------------------------------- Vorschaubilder fürs Baumenü (48x48)
ICON_DIR = os.path.join(OUT, "icons")
os.makedirs(ICON_DIR, exist_ok=True)
SPR = manifest["sprites"]


def sprite(name):
    return Image.open(os.path.join(OUT, SPR[name]["file"])).convert("RGBA")


def compose(items, tiles):
    """items: (sprite, tx, ty) an Tile-Ankern; tiles: Bodenfelder"""
    canvas = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
    ox, oy = 200, 80
    for tx, ty in sorted(tiles, key=lambda t: t[0] + t[1]):
        g = sprite("ground_0").crop((0, 0, 32, 17))  # nur die Oberseite
        canvas.alpha_composite(g, (ox + 16 * (tx - ty) - 16, oy + 8 * (tx + ty)))
    for name, tx, ty in items:
        s = SPR[name]
        canvas.alpha_composite(sprite(name), (ox + 16 * (tx - ty) + s["ox"], oy + 8 * (tx + ty) + s["oy"]))
    return canvas.crop(canvas.getbbox())


def fit48(img):
    w, h = img.size
    k = 48 / max(w, h)
    k = int(k) if k >= 1 else k
    img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.NEAREST)
    out = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    out.alpha_composite(img, ((48 - img.width) // 2, (48 - img.height) // 2))
    return out


def icon_save(name, img):
    fit48(img).save(os.path.join(ICON_DIR, name + ".png"))


T1 = [(0, 0)]
T32 = [(x, y) for x in range(3) for y in range(2)]
icon_save("platform", compose([("track", 0, 1), ("platform_s", 0, 0), ("platform_s", 1, 0)], [(0, 1), (1, 1)]))
icon_save("track", compose([("track", 0, 0), ("track", 1, 0)], [(0, 0), (1, 0)]))
icon_save("signal_E", compose([("track", 0, 0), ("signal_green", 0, 0)], T1))
icon_save("signal_W", compose([("track", 0, 0), ("signal_green", 0, 0)], T1).transpose(Image.FLIP_LEFT_RIGHT))
for key in ("xover_down", "xover_up", "branch_divDown", "branch_divUp", "branch_mergeAbove", "branch_mergeBelow",
            "curve_divDown", "curve_divUp", "curve_mergeAbove", "curve_mergeBelow"):
    icon_save("piece_" + key, compose([("piece_" + key, 0, 0)], T32))
for key in ("diag_desc", "diag_asc", "cross_desc0", "cross_asc1"):
    icon_save("piece_" + key, compose([("piece_" + key, 0, 0)], [(0, 0), (0, 1)]))
for name in BUILDINGS:
    d = {"bld_station": (3, 2), "bld_houseA": (2, 2), "bld_houseB": (2, 2)}.get(name, (1, 1))
    tiles = [(x, y) for x in range(d[0]) for y in range(d[1])]
    items = [("platform", x, y) for x, y in tiles] if name in ON_PLATFORM else []
    icon_save(name, compose(items + [(name, 0, 0)], tiles))
for name in NATURE:
    icon_save(name, compose([(name, 0, 0)], T1))
for n in ("cursor", "flag", "shovel", "house"):
    ic = Image.open(os.path.join(OUT, "ui", n + ".png"))
    icon_save("tool_" + n, ic.resize((36, 36), Image.NEAREST))
for name, d in (("bld_cafe", (2, 2)), ("bld_parking", (3, 2)), ("bld_bus", (3, 2)), ("bld_station2", (3, 2)), ("bld_station3", (3, 2)),
                ("bld_fountain", (1, 1)), ("bld_flowers", (1, 1)), ("bld_statue", (1, 1))):
    icon_save(name, compose([(name, 0, 0)], [(x, y) for x in range(d[0]) for y in range(d[1])]))
for name in ("bld_vending", "bld_lamp", "bld_clock"):
    icon_save(name, compose([("platform", 0, 0), (name, 0, 0)], T1))
icon_save("tool_road", compose([("road_10", 0, 0), ("road_10", 1, 0), ("road_10", 2, 0)], [(0, 0), (1, 0), (2, 0)]))
icon_save("rail_bridge_icon", compose([("water_10", 0, 0), ("water_10", 1, 0), ("track", 0, 0), ("track", 1, 0), ("rail_bridge", 0, 0), ("rail_bridge", 1, 0)], []))

# ---------------------------------------------------------------- Oberleitung, Prellbock, Zugänge, Anlagen
for name, (img, ox, oy) in {
    "wire_span": bg.wire_span(), "wire_mast": bg.wire_mast(),
    "buffer_E": bg.buffer_stop(True), "buffer_W": bg.buffer_stop(False),
    "tunnel_stairs": bg.tunnel_stairs(), "bridge_deck": bg.bridge_deck(), "bridge_tower": bg.bridge_tower(),
    "bld_remise": bg.shed(5, (176, 92, 70), (110, 70, 60), brick=True),
    "bld_workshop": bg.shed(5, (150, 156, 166), (96, 100, 110), H=20, door=(230, 170, 40, 255)),
    "bld_wash": bg.wash(), "bld_hump": bg.hump(),
    "mark_siding": bg.stripe((240, 200, 40)), "mark_sort0": bg.stripe((52, 96, 160)),
    "mark_sort1": bg.stripe((170, 60, 50)), "mark_sort2": bg.stripe((70, 130, 80)),
    "sign_siding": bg.sign((240, 200, 40)), "sign_sort0": bg.sign((52, 96, 160)),
    "sign_sort1": bg.sign((170, 60, 50)), "sign_sort2": bg.sign((70, 130, 80)),
}.items():
    save(name, img, ox, oy)
bg.warn_icon().save(os.path.join(OUT, "warn.png"))
manifest["sprites"]["warn"] = {"file": "warn.png", "ox": -6, "oy": -11, "w": 12, "h": 11}
# Oberleitung über Gleisteilen
for key in PIECES:
    tracks = PIECES[key]
    pts = [[(float(x), float(y)) for x, y in t[0][::10]] + [(float(t[0][-1][0]), float(t[0][-1][1]))] for t in tracks]
    img, ox, oy = bg.wire_piece(pts, 3, 2)
    save("wire_piece_" + key, img, ox, oy)
for key, P in (("diag_desc", DD), ("diag_asc", DA)):
    img, ox, oy = bg.wire_piece([[(float(x), float(y)) for x, y in P[::10]] + [(float(P[-1][0]), float(P[-1][1]))]], 1, 2)
    save("wire_piece_" + key, img, ox, oy)
bg.tool_icon("wire").save(os.path.join(OUT, "ui", "wire.png"))

# ---------------------------------------------------------------- Vorschaubilder neue Werkzeuge
row3 = [(x, 0) for x in range(3)]
icon_save("tool_wire", compose([("track", 0, 0), ("track", 1, 0), ("wire_span", 0, 0), ("wire_span", 1, 0), ("wire_mast", 0, 0)], [(0, 0), (1, 0)]))
icon_save("access_tunnel", compose([("platform", 0, 0), ("track", 0, 1), ("platform", 0, 2), ("tunnel_stairs", 0, 0), ("tunnel_stairs", 0, 2)], [(0, 0), (0, 1), (0, 2)]))
icon_save("access_bridge", compose([("platform", 0, 0), ("track", 0, 1), ("platform", 0, 2), ("bridge_tower", 0, 0), ("bridge_deck", 0, 1), ("bridge_tower", 0, 2)], [(0, 0), (0, 1), (0, 2)]))
icon_save("mark_siding", compose([("track", 0, 0), ("track", 1, 0), ("mark_siding", 0, 0), ("mark_siding", 1, 0), ("sign_siding", 0, 0), ("buffer_W", 0, 0)], [(0, 0), (1, 0)]))
for d in range(3):
    icon_save(f"mark_sort{d}", compose([("track", 0, 0), ("track", 1, 0), (f"mark_sort{d}", 0, 0), (f"mark_sort{d}", 1, 0), (f"sign_sort{d}", 0, 0)], [(0, 0), (1, 0)]))
for name, w in (("bld_remise", 5), ("bld_workshop", 5), ("bld_wash", 3), ("bld_hump", 2)):
    icon_save(name, compose([("track", x, 0) for x in range(w)] + [(name, 0, 0)], [(x, 0) for x in range(w)]))

# Manifest liegt in src/gen, damit es direkt importiert werden kann
MAN = os.path.join(ROOT, "src", "gen")
os.makedirs(MAN, exist_ok=True)
with open(os.path.join(MAN, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)
print(len(manifest["sprites"]), "Sprites erzeugt")
