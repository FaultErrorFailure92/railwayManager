import numpy as np
from PIL import Image

# --- Palette (aus deinem Gleis-Tile ausgelesen) ---
RAIL_L = (160, 172, 184, 255)
RAIL_M = (132, 128, 136, 255)
RAIL_D = (104, 104, 104, 255)
SLP    = (136, 88, 64, 255)
SLP_D  = (64, 40, 60, 255)

T = 16          # Tile = 16 Welt-Einheiten
GAUGE = 10      # Schienenabstand (Welt)
RAIL_W = 2.1    # Schienenbreite (Welt)
SLP_LEN = 7     # halbe Schwellenlaenge
SLP_W = 1.3     # halbe Schwellenbreite
SLP_STEP = 8    # Schwellenabstand

def line(p0, p1, step=0.1):
    p0, p1 = np.array(p0, float), np.array(p1, float)
    n = max(2, int(np.linalg.norm(p1 - p0) / step))
    return np.linspace(p0, p1, n)

def arc(c, r, a0, a1, step=0.1):
    n = max(2, int(abs(a1 - a0) * r / step))
    a = np.linspace(a0, a1, n)
    return np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], 1)

def join(*parts):
    out = [parts[0]]
    for p in parts[1:]:
        out.append(p[1:] if np.allclose(out[-1][-1], p[0], atol=0.05) else p)
    return np.concatenate(out)

def tangents(P):
    d = np.gradient(P, axis=0)
    return d / np.linalg.norm(d, axis=1, keepdims=True)

def xform(P, f):
    return np.array([f(x, y) for x, y in P])

# --- Basis-Geometrie: Abzweig nach +y, Diagonale y = x - 8 ---
R_BR = 36.0
X0 = 16 - (np.sqrt(2) - 1) * R_BR          # Tangentenpunkt
def branch_path():
    c = (X0, 8 + R_BR)
    a = arc(c, R_BR, -np.pi / 2, -np.pi / 4)
    end = a[-1]
    return join(line((0, 8), (X0, 8)), a, line(end, (40, 32)))

def main_path(y=8, x0=0, x1=48):
    return line((x0, y), (x1, y))

def s_path(y0=8, y1=24, x0=0, x1=48):
    d = y1 - y0
    R = abs(d) / (2 * (1 - np.cos(np.pi / 4)))
    L = 2 * R * np.sin(np.pi / 4)
    xs = (x0 + x1) / 2 - L / 2
    sg = np.sign(d)
    a1 = arc((xs, y0 + sg * R), R, -sg * np.pi / 2, -sg * np.pi / 4)
    m = a1[-1]
    a2 = arc((xs + L, y1 - sg * R), R, sg * (3 * np.pi / 4), sg * np.pi / 2)
    return join(line((x0, y0), (xs, y0)), a1, a2, line(a2[-1], (x1, y1)))

def s_path_long(y0=8, y1=24, x0=0, x1=96, span=80):
    """Schnellfahr-Gleiswechsel: flaches S mit großem Radius über `span` Einheiten"""
    d = y1 - y0
    th = 2 * np.arctan(abs(d) / span)
    R = span / 2 / np.sin(th)
    xs = (x0 + x1) / 2 - span / 2
    sg = np.sign(d)
    a1 = arc((xs, y0 + sg * R), R, -sg * np.pi / 2, -sg * (np.pi / 2 - th))
    a2 = arc((xs + span, y1 - sg * R), R, sg * (np.pi / 2 + th), sg * np.pi / 2)
    return join(line((x0, y0), (xs, y0)), a1, a2, line(a2[-1], (x1, y1)))

# --- Kurven gerade <-> 45 Grad ueber 3x2 Tiles (Ende auf Tile-Port) ---
R_CURVE = 16 / (1 - np.cos(np.pi / 4))           # 54.6
LEAD = 48 - R_CURVE * np.sin(np.pi / 4)          # 9.37

def curve_c1():
    """gerade bei (0,8) -> 45 Grad nach +y, Ende (48,24)"""
    return join(line((0, 8), (LEAD, 8)), arc((LEAD, 8 + R_CURVE), R_CURVE, -np.pi / 2, -np.pi / 4))

def curve_c2():
    """45 Grad von (0,8) kommend -> gerade bei (48,24)"""
    return xform(curve_c1(), lambda x, y: (48 - x, 32 - y))[::-1]

def curve_c3():
    """gerade bei (0,24) -> 45 Grad nach -y, Ende (48,8)"""
    return xform(curve_c1(), lambda x, y: (x, 32 - y))

def curve_c4():
    """45 Grad von (0,24) kommend -> gerade bei (48,8)"""
    return xform(curve_c2(), lambda x, y: (x, 32 - y))

DIAG_OFF = 22.627 / 4        # 5.66
DIAG_STEP = 22.627 / 2       # 11.31

def path_len(P):
    return float(np.sum(np.linalg.norm(np.diff(P, axis=0), axis=1)))

def curve_sleepers(P, starts_straight):
    span = path_len(P) - 4 - DIAG_OFF
    step = span / round(span / 8)
    return (4 if starts_straight else DIAG_OFF), step

# --- Schwellen ---
def sleepers_for(P, offset=4, step=None):
    step = step or SLP_STEP
    tg = tangents(P)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    out = []
    s = offset
    while s <= seg[-1] + 1e-6:
        i = np.searchsorted(seg, s)
        i = min(i, len(P) - 1)
        out.append([P[i], tg[i], -SLP_LEN, SLP_LEN])
        s += step
    return out

def build(tracks):
    """tracks: Liste von (Pfad, primaer?) """
    tracks = [(t[0], t[1], t[2] if len(t) > 2 else 4, t[3] if len(t) > 3 else None) for t in tracks]
    prim = [p for p, isp, _, _ in tracks if isp]
    sec = [(p, o, st) for p, isp, o, st in tracks if not isp]
    slp = []
    for P, isp, off, st in tracks:
        if not isp:
            continue
        for c, t, a, b in sleepers_for(P, off, st):
            n = np.array([-t[1], t[0]])
            for Q, _, _ in sec:
                d = Q - c
                along = d @ t
                m = np.abs(along) < 0.6
                if m.any():
                    L = (d[m] @ n).mean()
                    if 0.5 < abs(L) < 17:
                        a, b = min(a, L - SLP_LEN), max(b, L + SLP_LEN)
            slp.append([c, t, a, b])
    for Q, off, st in sec:
        for c, t, a, b in sleepers_for(Q, off, st):
            dmin = min(np.min(np.linalg.norm(P - c, axis=1)) for P in prim) if prim else 99
            if dmin > 15:
                slp.append([c, t, a, b])
    rails = []
    for P, *_ in tracks:
        tg = tangents(P)
        n = np.stack([-tg[:, 1], tg[:, 0]], 1)
        rails += [P + n * GAUGE / 2, P - n * GAUGE / 2]
    return slp, rails

# --- Schotter ---
BALLAST = [(126, 118, 108, 255), (140, 132, 120, 255), (112, 105, 97, 255), (150, 142, 130, 255)]
BALLAST_EDGE = (98, 92, 84, 255)
BALLAST_HALF = 7.0


def hash2(a, b):
    """deterministisches Rauschen 0..1 aus ganzzahligen Weltkoordinaten (Periode 16)"""
    a = np.mod(a, 16).astype(np.int64); b = np.mod(b, 16).astype(np.int64)
    h = (a * 374761393 + b * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return (h & 0xFFFF) / 65535.0


# --- Rendern (isometrisch 2:1) ---
def render(tracks, box=(0, 0, 48, 32), pad=6, ballast=True):
    slp, rails = build(tracks)
    x0, y0, x1, y1 = box
    sx_min, sx_max = (x0 - y1) - pad, (x1 - y0) + pad
    sy_min, sy_max = (x0 + y0) / 2 - pad, (x1 + y1) / 2 + pad
    W, H = int(sx_max - sx_min), int(sy_max - sy_min)
    py, px = np.mgrid[0:H, 0:W]
    sx = px + 0.5 + sx_min
    sy = py + 0.5 + sy_min
    wx = sy + sx / 2
    wy = sy - sx / 2
    pts = np.stack([wx, wy], -1)

    S = np.zeros((H, W), bool)
    for c, t, a, b in slp:
        n = np.array([-t[1], t[0]])
        d = pts - c
        u, v = d @ t, d @ n
        S |= (np.abs(u) <= SLP_W) & (v >= a) & (v <= b)

    flat = pts.reshape(-1, 2)
    best = np.full(len(flat), 1e9); vec = np.zeros_like(flat)
    for Rp in rails:
        for k in range(0, len(Rp), 400):
            ch = Rp[k:k + 400]
            d = flat[:, None, :] - ch[None]
            dd = (d ** 2).sum(-1); i = dd.argmin(1)
            m = dd[np.arange(len(flat)), i] < best
            best[m] = dd[np.arange(len(flat)), i][m]
            vec[m] = d[np.arange(len(flat)), i][m]
    Rm = (np.sqrt(best) <= RAIL_W / 2).reshape(H, W)
    # Offset in Bildschirm-Koordinaten, Licht von oben-rechts
    vsx = vec[:, 0] - vec[:, 1]; vsy = (vec[:, 0] + vec[:, 1]) / 2
    lit = ((vsx - 2 * vsy)).reshape(H, W)

    img = np.zeros((H, W, 4), np.uint8)
    up = lambda m: np.r_[np.zeros((1, W), bool), m[:-1]]
    if ballast:
        cd = np.full(len(flat), 1e9)
        for P, *_ in tracks:
            for k in range(0, len(P), 400):
                ch = P[k:k + 400]
                cd = np.minimum(cd, ((flat[:, None, :] - ch[None]) ** 2).sum(-1).min(1))
        cd = np.sqrt(cd).reshape(H, W)
        inbox = (wx >= x0) & (wx < x1) & (wy >= y0) & (wy < y1)
        Bm = (cd <= BALLAST_HALF) & inbox
        n = hash2(np.floor(wx), np.floor(wy))
        shade = np.select([n < 0.45, n < 0.75, n < 0.92], [0, 1, 2], 3)
        for i, c in enumerate(BALLAST):
            img[Bm & (shade == i)] = c
        img[Bm & (cd > BALLAST_HALF - 1.0)] = BALLAST_EDGE
    img[S] = SLP
    img[~S & ~Rm & up(S)] = SLP_D
    img[Rm] = RAIL_M
    img[Rm & (lit > 0.45)] = RAIL_L
    img[Rm & (lit < -0.45)] = RAIL_D
    img[~Rm & up(Rm) & S] = SLP_D
    img[~Rm & up(Rm) & ~S] = RAIL_D
    return Image.fromarray(img, 'RGBA'), (sx_min, sy_min)
