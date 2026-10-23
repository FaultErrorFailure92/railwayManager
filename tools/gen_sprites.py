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
# Retro-Look: wenige, gedeckte Grüntöne, geordnetes 2x2-Dithering wie in alten Aufbauspielen.
# 8 Varianten, damit die Wiese nicht gleichförmig wirkt. Anker = obere Ecke der Raute.
GRASS = [(104, 156, 60), (116, 168, 66), (92, 142, 54), (82, 128, 48), (134, 182, 78), (70, 112, 42)]
GRID = (84, 128, 48)
SOIL_L = [(126, 90, 58), (112, 78, 50), (140, 100, 64)]
SOIL_R = [(100, 70, 46), (90, 62, 40), (112, 80, 52)]
LIP_L, LIP_R = (96, 146, 54), (80, 126, 46)
N_GROUND = 8
BAYER = np.array([[0, 2], [3, 1]]) / 4.0


def ground(variant):
    rng = np.random.default_rng(100 + variant)
    a = np.zeros((32, 32, 4), np.uint8)
    dia = lambda x, y: abs(x + 0.5 - 16) / 16 + abs(y + 0.5 - 8) / 8 <= 1.0
    # grobe Flecken (8x8 px), hart abgestuft und gedithert statt weich
    coarse = rng.random((4, 6))
    for y in range(32):
        for x in range(32):
            if dia(x, y):
                v = coarse[y // 8 + (x // 8) % 2 * 0, x // 8 % 6] if y < 32 else 0
                base, alt = (GRASS[0], GRASS[2]) if v < 0.55 else (GRASS[1], GRASS[0])
                c = alt if BAYER[y % 2, x % 2] < 0.5 else base
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
                    # Erdschichten in Streifen, leicht gedithert
                    band = (k // 4) % 2
                    a[y, x] = (pal[band] if (x + y) % 2 else pal[0]) + (255,)
                    if k > 6 and rng.random() < 0.03:
                        a[y, x] = (150, 140, 128, 255)  # Steinchen in der Erde
                if k == 16 or not any(dia(x, y + 1 - j) and y + 1 - j >= 8 for j in range(1, 17)):
                    a[y, x] = (58, 40, 28, 255)
    # Grasbüschel: kleine dunkle "v"-Muster in festem Raster (alt-typisch)
    for _ in range(6 + variant):
        x, y = int(rng.integers(4, 28)), int(rng.integers(3, 13))
        if dia(x - 1, y) and dia(x + 1, y) and dia(x, y + 1):
            a[y, x - 1] = GRASS[3] + (255,)
            a[y, x + 1] = GRASS[3] + (255,)
            a[y + 1, x] = GRASS[5] + (255,)
            a[y - 1 if dia(x, y - 1) else y, x] = GRASS[4] + (255,)
    # Raster: hintere Kanten der Raute
    for x in range(32):
        for y in range(16):
            if dia(x, y) and not dia(x, y - 1):
                a[y, x] = GRID + (255,)
    if variant in (5, 6):
        for _ in range(variant - 3):
            x, y = int(rng.integers(8, 24)), int(rng.integers(5, 11))
            if dia(x, y):
                col = [(232, 200, 64), (214, 96, 140)][int(rng.integers(2))]
                a[y, x] = col + (255,)
    if variant == 7:
        x, y = int(rng.integers(10, 20)), int(rng.integers(6, 10))
        a[y, x] = (140, 138, 128, 255); a[y, x + 1] = (108, 106, 98, 255)
    return Image.fromarray(a, "RGBA")


for v in range(N_GROUND):
    save(f"ground_{v}", ground(v), -16, 0)
manifest["groundVariants"] = N_GROUND

# Themen-Böden (Wüste, Schnee): gleiche Muster, andere Farben, keine Blumen
THEMES = {
    "sand": dict(GRASS=[(222, 190, 120), (230, 200, 130), (210, 176, 108), (196, 162, 98), (240, 214, 150), (178, 146, 86)],
                 GRID=(200, 166, 102), LIP_L=(214, 180, 112), LIP_R=(194, 160, 98),
                 SOIL_L=[(186, 132, 80), (170, 118, 70), (198, 144, 88)], SOIL_R=[(156, 108, 64), (142, 98, 58), (168, 118, 70)]),
    "snow": dict(GRASS=[(230, 236, 246), (240, 245, 252), (216, 224, 238), (196, 208, 226), (252, 254, 255), (180, 194, 216)],
                 GRID=(200, 210, 228), LIP_L=(222, 230, 242), LIP_R=(198, 208, 226),
                 SOIL_L=[(118, 96, 82), (104, 84, 72), (130, 108, 92)], SOIL_R=[(92, 74, 62), (82, 66, 56), (102, 84, 70)]),
}
_saved = dict(GRASS=GRASS, GRID=GRID, LIP_L=LIP_L, LIP_R=LIP_R, SOIL_L=SOIL_L, SOIL_R=SOIL_R)
for theme, pal in THEMES.items():
    globals().update(pal)
    for v in range(N_GROUND):
        save(f"ground_{theme}_{v}", ground(v if v < 5 else v % 5), -16, 0)
globals().update(_saved)

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
xdf, xuf = tg.s_path_long(8, 24), tg.s_path_long(24, 8)
C = {"c1": tg.curve_c1(), "c2": tg.curve_c2(), "c3": tg.curve_c3(), "c4": tg.curve_c4()}
CS = {"c1": True, "c2": False, "c3": True, "c4": False}   # beginnt gerade?
DD = tg.line((0, 8), (16, 24))
DA = tg.line((0, 24), (16, 8))
for k, v in {"xover_down": xd, "xover_up": xu, "xover_down_fast": xdf, "xover_up_fast": xuf, **C, "diag_desc": DD, "diag_asc": DA}.items():
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
R0L, R1L = tg.main_path(8, 0, 96), tg.main_path(24, 0, 96)
for key, tracks in {"xover_down_fast": [(R0L, True), (R1L, True), (xdf, False)], "xover_up_fast": [(R0L, True), (R1L, True), (xuf, False)]}.items():
    img, (sx, sy) = tg.render(tracks, (0, 0, 96, 32))
    save("piece_" + key, img, sx, sy)
for key, P in (("diag_desc", DD), ("diag_asc", DA)):
    img, (sx, sy) = tg.render([(P, True, tg.DIAG_OFF, tg.DIAG_STEP)], (0, 0, 16, 32))
    save("piece_" + key, img, sx, sy)
# Schräge Weichen: Diagonale über 3 Felder, gerader Abzweig (raus oder rein)
DD3, DA3 = tg.line((0, 8), (48, 56)), tg.line((0, 56), (48, 8))
_sh = lambda P, dy: np.array(P, float) + np.array([0.0, dy])
C1S, C4S = _sh(C["c1"], 32), _sh(C["c4"], 32)
for k, v in {"dd3": DD3, "da3": DA3, "c1s": C1S, "c4s": C4S}.items():
    store_path(k, v)
DSW = {
    "dsw_desc_out": [(DD3, True, tg.DIAG_OFF, tg.DIAG_STEP), cv("c2", False)],
    "dsw_desc_in": [(DD3, True, tg.DIAG_OFF, tg.DIAG_STEP), (C1S, False) + tuple(tg.curve_sleepers(C1S, True))],
    "dsw_asc_out": [(DA3, True, tg.DIAG_OFF, tg.DIAG_STEP), (C4S, False) + tuple(tg.curve_sleepers(C4S, False))],
    "dsw_asc_in": [(DA3, True, tg.DIAG_OFF, tg.DIAG_STEP), cv("c3", False)],
}
for key, tracks in DSW.items():
    img, (sx, sy) = tg.render(tracks, (0, 0, 48, 64))
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


def late_icon():
    """rote Uhr über verspäteten Zügen"""
    img = Image.new("RGBA", (9, 9), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, 8, 8], fill=(220, 50, 40, 255), outline=(90, 20, 16, 255))
    d.ellipse([2, 2, 6, 6], fill=(250, 246, 236, 255))
    d.line([(4, 4), (4, 2)], fill=(40, 30, 30, 255))
    d.line([(4, 4), (6, 4)], fill=(40, 30, 30, 255))
    return img
save("late_icon", late_icon(), -4, -9)


def shunt_signal(color):
    """Rangiersignal: niedriges Zwergsignal am Boden"""
    img = Image.new("RGBA", (5, 6), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 4, 4], fill=(40, 40, 46, 255))
    d.rectangle([1, 1, 3, 2], fill=color)
    d.point((2, 1), fill=(255, 255, 255, 200))
    d.line([(1, 5), (3, 5)], fill=(70, 70, 76, 255))
    return img
save("shsig_red", shunt_signal((230, 40, 40, 255)), -2, -5)
save("shsig_green", shunt_signal((240, 240, 232, 255)), -2, -5)

# ---------------------------------------------------------------- Wagen
CAR_L, CAR_W, CAR_H = 14.5, 9.0, 11
ORIENT = {0: (1.0, 0.0), 1: (0.7071, 0.7071), 2: (0.7071, -0.7071)}


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)


def car(body, roof, kind, accent=None, orient=0):
    t = np.array(ORIENT[orient]); n = np.array([-t[1], t[0]])
    # Triebwagen mit Führerstand: Nase an einem Ende (+u = Osten bzw. -u = Westen)
    nose = 1 if kind == "ecabE" else -1 if kind == "ecabW" else 0
    if nose:
        kind = "emu"
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
        if kind_f == "side" and kind == "bag":
            # Gepäckwagen: zwei Schiebetüren, kleine hohe Fenster
            v = sgn * hw
            for uc in (-hl / 2, hl / 2):
                d.polygon(S([P(uc - 1.6, v, z_floor + 0.5), P(uc + 1.6, v, z_floor + 0.5), P(uc + 1.6, v, 8.8), P(uc - 1.6, v, 8.8)]), fill=shade(body, 0.72))
                d.line(S([P(uc, v, z_floor + 0.5), P(uc, v, 8.8)]), fill=shade(body, 0.55))
            for uw in (-hl + 1.2, hl - 2.4):
                d.polygon(S([P(uw, v, 7.2), P(uw + 1.2, v, 7.2), P(uw + 1.2, v, 8.6), P(uw, v, 8.6)]), fill=(40, 56, 80, 255))
            if accent:
                d.polygon(S([P(-hl, v, 3), P(hl, v, 3), P(hl, v, 4.5), P(-hl, v, 4.5)]), fill=accent)
        if kind_f == "side" and kind == "dine":
            # Speisewagen: breites Fensterband mit warmem Licht, Tischlampen
            v = sgn * hw
            d.polygon(S([P(-hl + 1.2, v, 5.6), P(hl - 1.2, v, 5.6), P(hl - 1.2, v, 8.8), P(-hl + 1.2, v, 8.8)]), fill=(60, 52, 40, 255))
            u = -hl + 1.6
            while u + 2.6 <= hl - 1.4:
                d.polygon(S([P(u, v, 6), P(u + 2.6, v, 6), P(u + 2.6, v, 8.5), P(u, v, 8.5)]), fill=(250, 214, 140, 255))
                d.polygon(S([P(u + 1.1, v, 6), P(u + 1.5, v, 6), P(u + 1.5, v, 7), P(u + 1.1, v, 7)]), fill=(200, 60, 50, 255))
                u += 3.0
            d.polygon(S([P(-hl, v, 3), P(hl, v, 3), P(hl, v, 4.5), P(-hl, v, 4.5)]), fill=(170, 30, 40, 255))
            d.polygon(S([P(-hl, v, 4.5), P(hl, v, 4.5), P(hl, v, 5.0), P(-hl, v, 5.0)]), fill=(230, 190, 80, 255))
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
        if kind_f == "side" and nose:
            v = sgn * hw
            un, ui = nose * hl, nose * (hl - 3.4)
            a0, a1 = min(un, ui), max(un, ui)
            d.polygon(S([P(a0, v, 5.4), P(a1, v, 5.4), P(a1, v, 9.4), P(a0, v, 9.4)]), fill=(22, 30, 44, 255))
            if accent:
                d.polygon(S([P(a0, v, 2.2), P(a1, v, 2.2), P(a1, v, 5.0), P(a0, v, 5.0)]), fill=accent)
        if kind_f == "end" and nose and sgn == nose:
            u = sgn * hl
            d.polygon(S([P(u, -hw + 0.6, 5.2), P(u, hw - 0.6, 5.2), P(u, hw - 0.6, 9.6), P(u, -hw + 0.6, 9.6)]), fill=(22, 30, 44, 255))
            if accent:
                d.polygon(S([P(u, -hw, 2.2), P(u, hw, 2.2), P(u, hw, 5.0), P(u, -hw, 5.0)]), fill=accent)
            for vv in (-hw + 1.6, hw - 2.4):
                d.polygon(S([P(u, vv, 3.0), P(u, vv + 0.9, 3.0), P(u, vv + 0.9, 4.0), P(u, vv, 4.0)]), fill=(255, 244, 190, 255))
        elif kind_f == "end" and nose:
            pass
        elif kind_f == "end" and kind in ("loco", "emu", "cab", "pcar"):
            u = sgn * hl
            d.polygon(S([P(u, -hw + 1.5, 6), P(u, hw - 1.5, 6), P(u, hw - 1.5, 8.5), P(u, -hw + 1.5, 8.5)]),
                      fill=(30, 40, 56, 255))
        if kind_f == "end" and accent and kind != "wagon":
            u = sgn * hl
            d.polygon(S([P(u, -hw, 3), P(u, hw, 3), P(u, hw, 4.5), P(u, -hw, 4.5)]), fill=accent)
    d.polygon(S(top), fill=roof)
    if nose:  # abgerundete Dachkante über dem Führerstand
        un, ui = nose * hl, nose * (hl - 2.6)
        a0, a1 = min(un, ui), max(un, ui)
        d.polygon(S([P(a0, -hw, CAR_H), P(a1, -hw, CAR_H), P(a1, hw, CAR_H), P(a0, hw, CAR_H)]), fill=shade(roof, 0.8))

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
    "sb": {"emu": ((236, 236, 230), (120, 130, 140), (31, 159, 168, 255)),
           "ecabE": ((236, 236, 230), (120, 130, 140), (31, 159, 168, 255)),
           "ecabW": ((236, 236, 230), (120, 130, 140), (31, 159, 168, 255))},
    "tt": {"emu": ((226, 222, 232), (124, 118, 136), (123, 79, 160, 255)),
           "ecabE": ((226, 222, 232), (124, 118, 136), (123, 79, 160, 255)),
           "ecabW": ((226, 222, 232), (124, 118, 136), (123, 79, 160, 255))},
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
    "fx": {"loco": ((224, 90, 154), (90, 90, 96), (250, 240, 120, 255)),
           "coach": ((236, 226, 232), (140, 140, 150), (224, 90, 154, 255))},
    "sw": {"loco": ((168, 116, 60), (90, 90, 94), (240, 220, 160, 255)),
           "wagon0": ((132, 90, 52), (176, 128, 76), None),
           "wagon1": ((120, 82, 48), (166, 118, 70), None),
           "wagon2": ((140, 98, 58), (182, 134, 80), None)},
    "mn": {"loco": ((108, 111, 120), (70, 70, 76), (230, 190, 60, 255)),
           "wagon0": ((70, 66, 64), (52, 48, 46), None),
           "wagon1": ((82, 76, 72), (58, 54, 50), None),
           "wagon2": ((64, 60, 58), (46, 44, 42), None)},
    "dm": {"steam": ((34, 34, 38), (52, 52, 58), None),
           "coach": ((122, 42, 36), (70, 60, 56), (214, 176, 80, 255))},
}
# Gepäck- und Speisewagen für lange Personenzüge (Farben wie die Reisezugwagen)
for sch in ("wx", "nj", "rx", "hs", "dm", "ro", "lb", "fx"):
    cb, cr, ca = SCHEMES[sch]["coach"]
    SCHEMES[sch]["bag"] = (tuple(int(v * 0.9) for v in cb), cr, ca)
    SCHEMES[sch]["dine"] = (cb, cr, ca)
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


def _cactus(seed):
    rng = np.random.default_rng(seed)
    a = np.zeros((26, 16, 4), np.uint8)
    for y in range(23, 26):
        for x in range(2, 14):
            if ((x - 8) / 6) ** 2 + ((y - 24) / 1.6) ** 2 <= 1:
                a[y, x] = (120, 96, 50, 110)
    cols = [(52, 110, 60), (74, 138, 72), (104, 164, 88)]
    def col(x0, y0, y1, w=3):
        for y in range(y0, y1):
            for x in range(x0, x0 + w):
                a[y, x] = cols[0 if x == x0 + w - 1 else 2 if x == x0 else 1] + (255,)
    col(6, 2, 24, 4)
    arm = int(rng.integers(8, 12))
    col(2, arm - 5, arm + 1); a[arm, 2:6] = cols[1] + (255,); a[arm + 1, 2:6] = cols[0] + (255,)
    arm2 = int(rng.integers(6, 10))
    col(11, arm2 - 4, arm2 + 1); a[arm2, 9:13] = cols[1] + (255,); a[arm2 + 1, 9:13] = cols[0] + (255,)
    for _ in range(10):
        x, y = int(rng.integers(2, 14)), int(rng.integers(2, 22))
        if a[y, x, 3] == 255:
            a[y, x] = (226, 226, 190, 255)
    return Image.fromarray(bg._outline(a, (30, 60, 36))), -8, -23


def _palm(seed):
    rng = np.random.default_rng(seed)
    a = np.zeros((30, 24, 4), np.uint8)
    for y in range(26, 30):
        for x in range(4, 20):
            if ((x - 12) / 8) ** 2 + ((y - 27.5) / 2) ** 2 <= 1:
                a[y, x] = (120, 96, 50, 110)
    for y in range(8, 28):
        x = 12 + int((28 - y) * 0.12)
        c = (138, 100, 62) if y % 3 else (110, 78, 48)
        a[y, x] = c + (255,); a[y, x + 1] = (100, 72, 44, 255)
    cx, cy = 14, 8
    leaf = [(46, 112, 52), (70, 140, 64), (100, 168, 80)]
    for ang in np.linspace(0, 2 * np.pi, 7, endpoint=False) + rng.random() * 0.4:
        for r in range(1, 10):
            x = int(round(cx + np.cos(ang) * r))
            y = int(round(cy + np.sin(ang) * r * 0.55 + (r / 9) ** 2 * 4))
            for dy in (0, 1):
                if 0 <= x < 24 and 0 <= y + dy < 30:
                    a[y + dy, x] = leaf[2 if dy == 0 and np.sin(ang) < 0 else 1 if dy == 0 else 0] + (255,)
    a[cy:cy + 2, cx - 1:cx + 1] = (120, 86, 40, 255)
    return Image.fromarray(bg._outline(a, (24, 56, 30))), -12, -27


def _snow_pine(seed):
    img, ox, oy = bg.tree_pine(seed)
    a = np.array(img)
    rng = np.random.default_rng(seed + 7)
    h, w = a.shape[:2]
    for x in range(w):
        for y in range(h - 6):
            if a[y, x, 3] == 255 and tuple(a[y, x, :3]) not in ((110, 74, 46), (84, 56, 36)):
                # Schnee auf den Oberkanten der Äste
                above = y == 0 or a[y - 1, x, 3] < 255 or tuple(a[y - 1, x, :3]) == (16, 44, 32)
                if above or rng.random() < 0.18:
                    a[y, x] = (238, 244, 252, 255) if above else (206, 218, 236, 255)
    return Image.fromarray(a), ox, oy


def _dry_bush(seed):
    rng = np.random.default_rng(seed)
    a = np.zeros((10, 14, 4), np.uint8)
    for _ in range(26):
        x0, y0 = 7, 9
        ang = rng.random() * np.pi
        for r in range(int(rng.integers(3, 7))):
            x = int(round(x0 + np.cos(ang) * r * 1.2)); y = int(round(y0 - np.sin(ang) * r))
            if 0 <= x < 14 and 0 <= y < 10:
                a[y, x] = ((150, 120, 70) if r % 2 else (120, 96, 56)) + (255,)
    return Image.fromarray(a), -7, -8


NATURE2 = {"bld_cactus0": _cactus(40), "bld_cactus1": _cactus(41), "bld_palm0": _palm(42), "bld_palm1": _palm(43),
           "bld_snowpine0": _snow_pine(20), "bld_snowpine1": _snow_pine(21), "bld_drybush": _dry_bush(44)}
NATURE.update(NATURE2)
NATURE["bld_xmas"] = bg.xmas()
for name, (img, ox, oy) in NATURE.items():
    save(name, img, ox, oy + 8)  # Anker = Tile-Ecke, Baum steht in der Tile-Mitte (Bildschirm +8)

# ---------------------------------------------------------------- Läden, Straße, Bahnhofsausbau, Deko
P5 = {
    "bld_cafe": bg.cafe(), "bld_parking": bg.parking(), "bld_bus": bg.bus_terminal(),
    "bld_station2": bg.station_big(2), "bld_station3": bg.station_big(3),
    "bld_fountain": bg.fountain(), "bld_flowers": bg.flowers(5), "bld_statue": bg.statue(),
    "bld_wc": bg.wc(), "bld_inn": bg.inn(), "bld_streetlamp": bg.lamp(),
    "bld_sawmill": bg.sawmill(), "bld_mine": bg.mine(),
    "bld_adobeA": bg.adobe(2, 2, (214, 170, 116), H=15, tower=True, seed=1),
    "bld_adobeB": bg.adobe(2, 2, (226, 196, 150), H=13, dome=True, seed=2),
    "bld_adobeC": bg.adobe(1, 1, (204, 156, 104), H=12, seed=3),
    "bld_well": bg.well(), "bld_tent": bg.tent(),
    "bld_billboard": bg.billboard(), "bld_mural": bg.mural(),
}
for name, (img, ox, oy) in P5.items():
    save(name, img, ox, oy)
for name, (img, ox, oy) in {"bld_vending": bg.vending(), "bld_lamp": bg.lamp(), "bld_clock": bg.platform_clock(),
                            "bld_lockers": bg.lockers(), "bld_souvenir": bg.souvenir()}.items():
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
for key in ("xover_down_fast", "xover_up_fast"):
    icon_save("piece_" + key, compose([("piece_" + key, 0, 0)], [(x, y) for x in range(6) for y in range(2)]))
for key in ("xover_down", "xover_up", "branch_divDown", "branch_divUp", "branch_mergeAbove", "branch_mergeBelow",
            "curve_divDown", "curve_divUp", "curve_mergeAbove", "curve_mergeBelow"):
    icon_save("piece_" + key, compose([("piece_" + key, 0, 0)], T32))
for key in DSW:
    icon_save("piece_" + key, compose([("piece_" + key, 0, 0)], [(x, y) for x in range(3) for y in range(4)]))
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
                ("bld_fountain", (1, 1)), ("bld_flowers", (1, 1)), ("bld_statue", (1, 1)), ("bld_wc", (1, 1)), ("bld_inn", (2, 2)), ("bld_streetlamp", (1, 1)), ("bld_sawmill", (3, 2)), ("bld_mine", (3, 2)),
                ("bld_adobeA", (2, 2)), ("bld_adobeB", (2, 2)), ("bld_adobeC", (1, 1)), ("bld_well", (1, 1)), ("bld_tent", (1, 1)),
                ("bld_billboard", (1, 1)), ("bld_mural", (1, 1))):
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
    "mark_shunt": bg.stripe((230, 120, 30)), "sign_shunt": bg.sign((230, 120, 30)),
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
for key, tracks in DSW.items():
    pts = [[(float(x), float(y)) for x, y in t[0][::10]] + [(float(t[0][-1][0]), float(t[0][-1][1]))] for t in tracks]
    img, ox, oy = bg.wire_piece(pts, 3, 4)
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
icon_save("mark_shunt", compose([("track", 0, 0), ("track", 1, 0), ("mark_shunt", 0, 0), ("mark_shunt", 1, 0), ("sign_shunt", 0, 0), ("shsig_red", 1, 0)], [(0, 0), (1, 0)]))
icon_save("shsig_E", compose([("track", 0, 0), ("shsig_red", 0, 0)], [(0, 0)]))
icon_save("shsig_W", compose([("track", 0, 0), ("shsig_red", 0, 0)], [(0, 0)]).transpose(Image.FLIP_LEFT_RIGHT))
icon_save("mark_siding", compose([("track", 0, 0), ("track", 1, 0), ("mark_siding", 0, 0), ("mark_siding", 1, 0), ("sign_siding", 0, 0), ("buffer_W", 0, 0)], [(0, 0), (1, 0)]))
for d in range(3):
    icon_save(f"mark_sort{d}", compose([("track", 0, 0), ("track", 1, 0), (f"mark_sort{d}", 0, 0), (f"mark_sort{d}", 1, 0), (f"sign_sort{d}", 0, 0)], [(0, 0), (1, 0)]))
for name, w in (("bld_remise", 5), ("bld_workshop", 5), ("bld_wash", 3), ("bld_hump", 2)):
    icon_save(name, compose([("track", x, 0) for x in range(w)] + [(name, 0, 0)], [(x, 0) for x in range(w)]))

# Manifest liegt in src/gen, damit es direkt importiert werden kann
MAN = os.path.join(ROOT, "src", "gen")
os.makedirs(MAN, exist_ok=True)
# ---------------------------------------------------------------- Forschungs-Symbole und Bahnhofskatze
for k in ("whistle", "estw", "haggle", "specials"):
    icon_save("ri_" + k, bg.ri_icon(k))
for name in ("bld_lockers", "bld_souvenir"):
    icon_save(name, compose([("platform", 0, 0), (name, 0, 0)], T1))
_cat = Image.open(os.path.join(OUT, "animal_cat.png"))
_cw = manifest["animals"]["cat"]["w"]
icon_save("bld_cat", _cat.crop((0, 0, _cw, _cat.height)).resize((_cw * 4, _cat.height * 4), Image.NEAREST))

with open(os.path.join(MAN, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)
print(len(manifest["sprites"]), "Sprites erzeugt")


