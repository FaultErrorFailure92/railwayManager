"""Gebäude, Bäume, Stimmungs-Symbole und UI-Icons (Pixel-Art, isometrisch 2:1)."""
import numpy as np
from PIL import Image, ImageDraw


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)


class Iso:
    """Zeichnet Polygone in Weltkoordinaten (x, y, z) -> Bildschirm, ohne Antialiasing."""

    def __init__(self, w_world, h_world, z_max, pad=3):
        self.x0 = -h_world - pad
        self.y0 = -z_max - pad
        W = int(w_world + h_world + 2 * pad)
        H = int((w_world + h_world) / 2 + z_max + 2 * pad)
        self.img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def P(self, x, y, z):
        return (x - y - self.x0, (x + y) / 2 - z - self.y0)

    def poly(self, pts, fill, outline=None):
        self.d.polygon([self.P(*p) for p in pts], fill=fill, outline=outline)

    def line(self, a, b, fill):
        self.d.line([self.P(*a), self.P(*b)], fill=fill)

    def wall_rect_y(self, y, xa, xb, za, zb, fill):
        """Rechteck auf einer Wand mit konstantem y (Vorderseite links)"""
        self.poly([(xa, y, za), (xb, y, za), (xb, y, zb), (xa, y, zb)], fill)

    def wall_rect_x(self, x, ya, yb, za, zb, fill):
        """Rechteck auf einer Wand mit konstantem x (Vorderseite rechts)"""
        self.poly([(x, ya, za), (x, yb, za), (x, yb, zb), (x, ya, zb)], fill)

    def box(self, x0, y0, x1, y1, z0, z1, col, top=None, outline=True):
        o = shade(col, 0.55) if outline else None
        self.poly([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], shade(col, 1.0), o)
        self.poly([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], shade(col, 0.8), o)
        self.poly([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top or shade(col, 1.12), o)

    def result(self):
        """Bild + Offset (Sprite-Ecke relativ zum Anker Welt (0,0,0))"""
        return self.img, int(self.x0), int(self.y0)


WIN = (54, 72, 104, 255)
WIN_L = (120, 160, 200, 255)


def gable_house(w, h, wall, roof, H=12, R=7, m=1.5, door=True, windows=True, sign=None):
    """Haus mit Satteldach, First entlang x. w/h in Tiles."""
    W, D = 16 * w, 16 * h
    x0, y0, x1, y1 = m, m, W - m, D - m
    ym = (y0 + y1) / 2
    iso = Iso(W, D, H + R + 2)
    ol = shade(wall, 0.55)
    iso.poly([(x0, y1, 0), (x1, y1, 0), (x1, y1, H), (x0, y1, H)], shade(wall, 1.0), ol)
    iso.poly([(x1, y0, 0), (x1, y1, 0), (x1, y1, H), (x1, y0, H)], shade(wall, 0.8), ol)
    if windows:
        n = max(1, int((x1 - x0) // 7))
        for i in range(n):
            xa = x0 + 2.5 + i * (x1 - x0 - 3) / n
            if door and i == n // 2:
                iso.wall_rect_y(y1, xa, xa + 3, 0, 7, (92, 60, 40, 255))
                continue
            iso.wall_rect_y(y1, xa, xa + 3, 5, 9, WIN)
            iso.wall_rect_y(y1, xa, xa + 1, 8, 9, WIN_L)
        k = max(1, int((y1 - y0) // 8))
        for i in range(k):
            ya = y0 + 2.5 + i * (y1 - y0 - 3) / k
            iso.wall_rect_x(x1, ya, ya + 3, 5, 9, shade(WIN, 0.85))
    if sign:
        iso.wall_rect_y(y1, x0 + 2, x1 - 2, H - 3, H - 1, sign)
    o = 1.5
    iso.poly([(x0 - o, y0 - o, H), (x1 + o, y0 - o, H), (x1 + o, ym, H + R), (x0 - o, ym, H + R)], shade(roof, 0.75))
    iso.poly([(x1, y0, H), (x1, y1, H), (x1, ym, H + R)], shade(wall, 0.72), ol)
    iso.poly([(x0 - o, y1 + o, H), (x1 + o, y1 + o, H), (x1 + o, ym, H + R), (x0 - o, ym, H + R)], shade(roof, 1.0), shade(roof, 0.6))
    # Dachziegel-Linien
    for t in np.arange(0.25, 1.0, 0.25):
        za = H + R * t
        ya = y1 + o - (y1 + o - ym) * t
        iso.line((x0 - o, ya, za), (x1 + o, ya, za), shade(roof, 0.85))
    return iso.result()


def shelter():
    """Wartehalle auf dem Bahnsteig: Glasdach auf Stützen, Rückwand"""
    iso = Iso(16, 16, 18)
    post = (70, 76, 86, 255)
    for x, y in ((3, 3), (13, 3)):
        iso.line((x, y, 0), (x, y, 11), post)
    iso.poly([(3, 3, 0), (13, 3, 0), (13, 3, 10), (3, 3, 10)], (150, 196, 220, 150))
    for x, y in ((3, 9), (13, 9)):
        iso.line((x, y, 0), (x, y, 11), post)
    iso.poly([(4, 6, 3), (12, 6, 3), (12, 8, 3), (4, 8, 3)], (140, 96, 60, 255))  # Sitzbank
    iso.poly([(1, 1, 11), (15, 1, 11), (15, 11, 12), (1, 11, 12)], (176, 216, 236, 210), (90, 110, 130, 255))
    return iso.result()


def kiosk():
    iso = Iso(16, 16, 18)
    iso.box(3, 3, 13, 12, 0, 9, (64, 120, 92))
    iso.wall_rect_y(12, 5, 11, 4, 7, (240, 220, 160, 255))
    # gestreifte Markise
    for i in range(6):
        c = (220, 60, 50, 255) if i % 2 == 0 else (245, 240, 230, 255)
        xa = 2 + i * 2
        iso.poly([(xa, 12, 9), (xa + 2, 12, 9), (xa + 2, 14.5, 7), (xa, 14.5, 7)], c)
    iso.poly([(3, 3, 9), (13, 3, 9), (13, 12, 9), (3, 12, 9)], (90, 150, 116, 255), (40, 80, 60, 255))
    return iso.result()


def bench():
    iso = Iso(16, 16, 8)
    wood, leg = (150, 100, 62), (60, 60, 66, 255)
    for x in (4, 12):
        iso.line((x, 8, 0), (x, 8, 3), leg)
    iso.box(3, 6, 13, 9, 3, 4, wood, outline=False)
    iso.box(3, 5, 13, 6, 4, 7, shade(wood, 0.9), outline=False)
    return iso.result()


def _outline(a, col=(22, 50, 30)):
    """Retro-Look: dunkle Kontur um das Laub (nur grüne Pixel am Rand)"""
    h, w = a.shape[:2]
    src = a.copy()
    for y in range(h):
        for x in range(w):
            r, g, b, al = src[y, x]
            if al < 255 or g <= r:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h or src[ny, nx][3] < 200:
                    a[y, x] = col + (255,)
                    break
    return a


def tree_round(seed):
    rng = np.random.default_rng(seed)
    img = Image.new("RGBA", (20, 26), (0, 0, 0, 0))
    a = np.array(img)
    # Schatten
    for y in range(22, 26):
        for x in range(2, 18):
            if ((x - 10) / 8) ** 2 + ((y - 23.5) / 2.2) ** 2 <= 1:
                a[y, x] = (40, 70, 30, 110)
    for y in range(15, 24):
        for x in (9, 10):
            a[y, x] = (110, 74, 46, 255) if x == 9 else (84, 56, 36, 255)
    cols = [(40, 92, 44), (58, 116, 52), (80, 140, 60), (112, 164, 76)]
    cx, cy, r = 10, 9, 8.2 + rng.random() * 0.8
    for y in range(0, 19):
        for x in range(0, 20):
            d = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.95)) ** 2
            if d <= 1 + (rng.random() - 0.5) * 0.25:
                light = -((x - cx) * 0.6 + (y - cy)) / r + (rng.random() - 0.5) * 0.7
                i = 0 if light < -0.6 else 1 if light < 0.1 else 2 if light < 0.7 else 3
                a[y, x] = cols[i] + (255,)
    return Image.fromarray(_outline(a)), -10, -23


def tree_pine(seed):
    rng = np.random.default_rng(seed)
    a = np.zeros((28, 18, 4), np.uint8)
    for y in range(24, 28):
        for x in range(2, 16):
            if ((x - 9) / 7) ** 2 + ((y - 25.5) / 2) ** 2 <= 1:
                a[y, x] = (40, 70, 30, 110)
    for y in range(20, 26):
        a[y, 8] = (110, 74, 46, 255); a[y, 9] = (84, 56, 36, 255)
    cols = [(28, 74, 52), (40, 96, 60), (58, 120, 70)]
    for layer, (top, bot, half) in enumerate(((0, 9, 4), (5, 15, 6), (10, 21, 8))):
        for y in range(top, bot):
            wdt = half * (y - top + 1) / (bot - top)
            for x in range(18):
                dx = x + 0.5 - 9
                if abs(dx) <= wdt:
                    i = 2 if dx < -wdt * 0.3 else 1 if dx < wdt * 0.4 else 0
                    if rng.random() < 0.08:
                        i = max(0, i - 1)
                    a[y, x] = cols[i] + (255,)
    return Image.fromarray(_outline(a, (16, 44, 32))), -9, -25


def bush(seed):
    rng = np.random.default_rng(seed)
    a = np.zeros((10, 14, 4), np.uint8)
    cols = [(46, 104, 48), (66, 128, 56), (92, 154, 68)]
    for y in range(10):
        for x in range(14):
            d = ((x - 7) / 6.5) ** 2 + ((y - 5.5) / 4.5) ** 2
            if d <= 1 + (rng.random() - 0.5) * 0.3:
                light = -((x - 7) * 0.5 + (y - 5)) / 5 + (rng.random() - 0.5) * 0.6
                a[y, x] = cols[0 if light < -0.4 else 1 if light < 0.5 else 2] + (255,)
    return Image.fromarray(_outline(a)), -7, -8


# ---------------------------------------------------------------- Stimmungs-Symbole
EMOTES = ["dots", "excl", "angry", "heart", "happy"]


def emote_sheet():
    W, H = 9, 10
    sheet = np.zeros((H, W * len(EMOTES), 4), np.uint8)
    for i, name in enumerate(EMOTES):
        a = np.zeros((H, W, 4), np.uint8)
        dark, white = (40, 40, 48, 255), (250, 250, 246, 255)
        for y in range(8):
            for x in range(9):
                edge = x in (0, 8) or y in (0, 7)
                corner = (x in (0, 8)) and (y in (0, 7))
                if corner:
                    continue
                a[y, x] = dark if edge else white
        a[8, 3] = dark; a[8, 4] = dark; a[9, 4] = dark; a[7, 4] = white; a[7, 3] = white
        put = lambda x, y, c: a.__setitem__((y + 1, x + 2), c + (255,))
        if name == "dots":
            for x in (0, 2, 4):
                put(x, 3, (110, 110, 120))
        elif name == "excl":
            for y in range(0, 4):
                put(2, y, (232, 150, 30))
            put(2, 5, (232, 150, 30))
        elif name == "angry":
            r = (220, 40, 40)
            for (x, y) in ((0, 1), (1, 2), (3, 2), (4, 1), (1, 4), (0, 5), (3, 4), (4, 5), (2, 3)):
                put(x, y, r)
        elif name == "heart":
            p = (232, 76, 120)
            for (x, y) in ((0, 1), (1, 1), (3, 1), (4, 1), (0, 2), (1, 2), (2, 2), (3, 2), (4, 2), (1, 3), (2, 3), (3, 3), (2, 4)):
                put(x, y, p)
        elif name == "happy":
            g = (60, 160, 70)
            put(1, 1, g); put(3, 1, g)
            for (x, y) in ((0, 3), (1, 4), (2, 4), (3, 4), (4, 3)):
                put(x, y, g)
        sheet[:, i * W:(i + 1) * W] = a
    return Image.fromarray(sheet, "RGBA")


# ---------------------------------------------------------------- UI-Icons (12x12)
def icon(name):
    a = np.zeros((12, 12, 4), np.uint8)
    put = lambda x, y, c: a.__setitem__((y, x), tuple(c) + (255,))
    if name == "coin":
        for y in range(12):
            for x in range(12):
                d = ((x - 5.5) / 5.2) ** 2 + ((y - 5.5) / 5.2) ** 2
                if d <= 1:
                    put(x, y, (246, 196, 52) if d < 0.55 else (214, 150, 30))
        for y in range(3, 9):
            put(5, y, (170, 110, 20)); put(6, y, (255, 230, 120))
    elif name == "clock":
        for y in range(12):
            for x in range(12):
                d = ((x - 5.5) / 5.4) ** 2 + ((y - 5.5) / 5.4) ** 2
                if d <= 1:
                    put(x, y, (240, 240, 230) if d < 0.7 else (60, 60, 70))
        for y in range(2, 6):
            put(5, y, (40, 40, 50))
        for x in range(6, 9):
            put(x, 6, (40, 40, 50))
    elif name == "person":
        c = (80, 140, 220)
        for y in range(1, 4):
            for x in range(4, 8):
                put(x, y, (240, 200, 164))
        for y in range(5, 11):
            for x in range(3, 9):
                if not (y > 8 and x in (5, 6)):
                    put(x, y, c if y < 9 else (40, 48, 80))
    elif name == "check":
        g = (90, 210, 90)
        for (x, y) in ((1, 6), (2, 7), (3, 8), (4, 9), (5, 8), (6, 7), (7, 6), (8, 5), (9, 4), (10, 3)):
            put(x, y, g); put(x, y - 1, g)
    elif name == "lock":
        for y in range(5, 11):
            for x in range(2, 10):
                put(x, y, (200, 160, 60) if y > 5 else (150, 110, 40))
        for y in range(1, 5):
            put(3, y, (150, 150, 160)); put(8, y, (150, 150, 160))
        for x in range(3, 9):
            put(x, 1, (150, 150, 160))
        put(5, 7, (70, 50, 20)); put(6, 7, (70, 50, 20)); put(5, 8, (70, 50, 20))
    elif name == "quest":
        for y in range(1, 11):
            for x in range(2, 10):
                put(x, y, (236, 216, 160))
        for x in range(2, 10):
            put(x, 1, (180, 140, 80)); put(x, 10, (180, 140, 80))
        for y in range(3, 8):
            put(5, y, (200, 60, 40)); put(6, y, (200, 60, 40))
        put(5, 9, (200, 60, 40)); put(6, 9, (200, 60, 40))
    elif name == "smile":
        for y in range(12):
            for x in range(12):
                d = ((x - 5.5) / 5.4) ** 2 + ((y - 5.5) / 5.4) ** 2
                if d <= 1:
                    put(x, y, (250, 210, 70) if d < 0.75 else (190, 140, 30))
        put(4, 4, (60, 40, 20)); put(7, 4, (60, 40, 20))
        for (x, y) in ((3, 7), (4, 8), (5, 8), (6, 8), (7, 8), (8, 7)):
            put(x, y, (60, 40, 20))
    elif name == "train":
        for y in range(2, 9):
            for x in range(1, 11):
                put(x, y, (200, 56, 48))
        for x in range(2, 10, 3):
            put(x, 4, (54, 72, 104)); put(x + 1, 4, (54, 72, 104))
        for x in (3, 8):
            put(x, 9, (40, 40, 40)); put(x + 1, 9, (40, 40, 40))
    elif name == "cursor":
        pts = [(2, y) for y in range(1, 10)] + [(3, 2), (4, 3), (5, 4), (6, 5), (7, 6), (8, 7), (5, 7), (6, 9), (7, 10), (3, 8), (4, 7)]
        fill = [(3, y) for y in range(3, 8)] + [(4, y) for y in range(4, 7)] + [(5, 5), (5, 6), (6, 6)]
        for p in fill:
            put(*p, (250, 250, 250))
        for p in pts:
            put(*p, (30, 30, 36))
    elif name == "shovel":
        for i in range(6):
            put(2 + i, 2 + i, (140, 96, 56)); put(3 + i, 2 + i, (110, 74, 44))
        for y in range(7, 11):
            for x in range(7, 11):
                if x + y >= 15 and x + y <= 19:
                    put(x, y, (170, 176, 186))
    elif name == "flag":
        for y in range(1, 11):
            put(3, y, (90, 70, 50))
        for y in range(1, 6):
            for x in range(4, 10 - (y % 2)):
                put(x, y, (220, 60, 50))
        for x in range(1, 7):
            put(x, 11, (60, 140, 60))
    elif name == "house":
        for y in range(6, 11):
            for x in range(2, 10):
                put(x, y, (226, 214, 180))
        for y in range(2, 6):
            for x in range(6 - y, 6 + y):
                if 0 <= x < 12:
                    put(x, y + 1, (168, 72, 56))
        put(5, 8, (92, 60, 40)); put(5, 9, (92, 60, 40)); put(6, 9, (92, 60, 40)); put(6, 8, (92, 60, 40))
    elif name == "flask":
        glass, liquid, dark = (210, 230, 240), (110, 220, 140), (40, 60, 70)
        for y in range(0, 4):
            put(5, y, glass); put(6, y, glass)
        put(4, 0, dark); put(7, 0, dark)
        for y in range(4, 11):
            half = 1 + (y - 4) * 0.7
            for x in range(12):
                if abs(x - 5.5) <= half:
                    put(x, y, liquid if y >= 7 else glass)
        for x in range(1, 11):
            put(x, 11, dark)
        put(5, 8, (200, 255, 210)); put(7, 9, (200, 255, 210))
    elif name == "contract":
        for y in range(1, 11):
            for x in range(2, 10):
                put(x, y, (240, 232, 210))
        for y in (3, 5, 7):
            for x in range(3, 9):
                put(x, y, (120, 110, 100))
        for x in range(5, 10):
            put(x, 9, (40, 70, 160))
        put(9, 8, (40, 70, 160))
    return Image.fromarray(a, "RGBA")


ICONS = ["flask", "contract", "coin", "clock", "person", "check", "lock", "quest", "smile", "train", "cursor", "shovel", "flag", "house"]


def arrow():
    """Hüpfender Hinweispfeil für Aufträge (11x12)"""
    a = np.zeros((12, 11, 4), np.uint8)
    out, fill = (60, 30, 0, 255), (255, 206, 40, 255)
    shape = ["....###....", "....#@#....", "....#@#....", "....#@#....", "....#@#....", "#####@#####",
             ".#@@@@@@@#.", "..#@@@@@#..", "...#@@@#...", "....#@#....", ".....#.....", "..........."]
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "#":
                a[y, x] = out
            elif ch == "@":
                a[y, x] = fill
    return Image.fromarray(a, "RGBA")


# ---------------------------------------------------------------- Oberleitung
WIRE = (52, 52, 58, 255)
MAST = (96, 100, 108, 255)
MAST_D = (64, 66, 72, 255)
WIRE_Z = 15


def wire_lines(paths, w_world, h_world):
    """Fahrdraht entlang der Gleisachsen (Liste von Punktlisten in Weltkoordinaten)"""
    iso = Iso(w_world, h_world, 24)
    for pts in paths:
        for a, b in zip(pts[:-1], pts[1:]):
            iso.line((a[0], a[1], WIRE_Z), (b[0], b[1], WIRE_Z), WIRE)
    return iso


def wire_span():
    iso = wire_lines([[(0, 8), (16, 8)]], 16, 16)
    return iso.result()


def wire_mast():
    """Mast auf der hinteren Seite (y=1) mit Ausleger über das Gleis"""
    iso = Iso(16, 16, 24)
    iso.line((1, 0.5, 0), (1, 0.5, 19), MAST_D)
    iso.line((1.6, 0.5, 0), (1.6, 0.5, 19), MAST)
    iso.line((1, 0.5, 18), (1, 9, 18), MAST)      # Ausleger
    iso.line((1, 8, 18), (1, 8, WIRE_Z), MAST_D)  # Hänger
    return iso.result()


def wire_piece(paths, w, h):
    iso = wire_lines(paths, 16 * w, 16 * h)
    for x in (1, 16 * w - 2):
        iso.line((x, 0.5, 0), (x, 0.5, 19), MAST_D)
        iso.line((x, 0.5, 18), (x, 8, 18), MAST)
    return iso.result()


# ---------------------------------------------------------------- Prellbock
def buffer_stop(east):
    iso = Iso(16, 16, 10)
    x = 14 if east else 2
    red, white = (200, 50, 40), (240, 236, 226)
    iso.box(x - 1.5, 2.5, x + 1.5, 13.5, 0, 4, (120, 84, 56))
    iso.poly([(x + (1.6 if east else -1.6), 3, 4), (x + (1.6 if east else -1.6), 13, 4),
              (x + (1.6 if east else -1.6), 13, 7), (x + (1.6 if east else -1.6), 3, 7)], shade(red, 1.0))
    iso.box(x - 1.5, 3, x + 1.5, 13, 4, 7, red)
    iso.box(x - 1.5, 7, x + 1.5, 9, 4, 7.1, white, outline=False)
    return iso.result()


# ---------------------------------------------------------------- Zugänge
def tunnel_stairs():
    """Treppenabgang einer Unterführung auf dem Bahnsteig (Bahnsteighöhe +4)"""
    iso = Iso(16, 16, 12)
    z = 4
    iso.poly([(4, 4, z), (12, 4, z), (12, 12, z), (4, 12, z)], (54, 52, 60, 255))
    for i in range(4):
        iso.poly([(5, 5 + i * 2, z - 0.01), (11, 5 + i * 2, z - 0.01), (11, 6 + i * 2, z - 0.01), (5, 6 + i * 2, z - 0.01)], (90, 88, 96, 255))
    for (x0, y0, x1, y1) in ((4, 4, 12, 4), (4, 4, 4, 12), (12, 4, 12, 12)):
        iso.line((x0, y0, z + 4), (x1, y1, z + 4), (200, 180, 60, 255))
        iso.line((x0, y0, z), (x0, y0, z + 4), (120, 120, 126, 255))
    iso.line((12, 12, z), (12, 12, z + 4), (120, 120, 126, 255))
    return iso.result()


BRIDGE_Z = 24


def bridge_deck():
    """Fußgängerbrücke, ein Feld lang (quer zu den Gleisen = y-Richtung)"""
    iso = Iso(16, 16, BRIDGE_Z + 8)
    z = BRIDGE_Z
    iso.box(5, 0, 11, 16, z - 2, z, (150, 150, 156))
    iso.box(5, 0, 6, 16, z, z + 4, (70, 120, 170))   # Geländer/Seitenwand
    iso.box(10, 0, 11, 16, z, z + 4, (70, 120, 170))
    iso.poly([(5, 0, z + 6), (11, 0, z + 6), (11, 16, z + 6), (5, 16, z + 6)], (190, 210, 228, 160))
    return iso.result()


def bridge_tower():
    """Treppenturm am Bahnsteig"""
    iso = Iso(16, 16, BRIDGE_Z + 8)
    iso.box(4, 3, 12, 13, 4, BRIDGE_Z + 6, (180, 176, 168))
    iso.wall_rect_y(13, 6, 10, 6, 14, (60, 70, 90, 255))
    iso.box(3.5, 2.5, 12.5, 13.5, BRIDGE_Z + 6, BRIDGE_Z + 7, (120, 120, 126))
    return iso.result()


# ---------------------------------------------------------------- Anlagen auf Gleisen
def shed(w, wall, roof, H=18, R=6, door=None, brick=False):
    """Halle über einem Gleis (w Felder lang, 1 Feld tief), vorne offen sichtbar ist nur die Rückwand"""
    W, D = 16 * w, 16
    iso = Iso(W, D, H + R + 2)
    ol = shade(wall, 0.55)
    # Rückwand und Stirnseite rechts (offen: halbe Höhe sichtbar)
    iso.poly([(0, 0, 0), (W, 0, 0), (W, 0, H), (0, 0, H)], shade(wall, 0.7), ol)
    iso.poly([(W, 0, 0), (W, D, 0), (W, D, H), (W, 0, H)], shade(wall, 0.8), ol)
    iso.poly([(W, 3, 0), (W, 13, 0), (W, 13, 13), (W, 3, 13)], (40, 40, 46, 255))  # Tor
    # Vorderwand (verdeckt den Zug)
    iso.poly([(0, D, 0), (W, D, 0), (W, D, H), (0, D, H)], shade(wall, 1.0), ol)
    if brick:
        for z in range(3, H, 3):
            iso.line((0, D, z), (W, D, z), shade(wall, 0.85))
    for i in range(w):
        iso.wall_rect_y(D, 16 * i + 4, 16 * i + 12, 9, 14, (120, 160, 200, 255))
    if door:
        iso.wall_rect_y(D, W / 2 - 4, W / 2 + 4, 0, 12, door)
    o = 1.5
    ym = D / 2
    iso.poly([(-o, -o, H), (W + o, -o, H), (W + o, ym, H + R), (-o, ym, H + R)], shade(roof, 0.75))
    iso.poly([(W, 0, H), (W, D, H), (W, ym, H + R)], shade(wall, 0.72), ol)
    iso.poly([(-o, D + o, H), (W + o, D + o, H), (W + o, ym, H + R), (-o, ym, H + R)], shade(roof, 1.0), shade(roof, 0.6))
    return iso.result()


def wash():
    W, D = 48, 16
    iso = Iso(W, D, 24)
    frame = (70, 110, 170)
    for x in (2, 46):
        iso.box(x - 1, 0, x + 1, 2, 0, 18, frame)
        iso.box(x - 1, 14, x + 1, 16, 0, 18, frame)
        iso.box(x - 1, 0, x + 1, 16, 18, 20, frame)
    iso.box(1, 0, 47, 2, 18, 20, frame)
    iso.box(1, 14, 47, 16, 18, 20, frame)
    # Bürsten
    for x in (14, 24, 34):
        iso.box(x - 1.5, 1, x + 1.5, 3, 2, 17, (60, 150, 220))
        iso.box(x - 1.5, 13, x + 1.5, 15, 2, 17, (60, 150, 220))
    iso.poly([(1, 0, 20), (47, 0, 20), (47, 16, 20), (1, 16, 20)], (220, 230, 240, 120))
    return iso.result()


def hump():
    """Abrollberg: Rampe neben dem Gleis + Stellwerkshäuschen"""
    W, D = 32, 16
    iso = Iso(W, D, 24)
    earth = (150, 120, 84)
    iso.poly([(0, 14, 0), (16, 14, 4), (32, 14, 0), (32, 16, 0), (0, 16, 0)], shade(earth, 0.9))
    iso.poly([(0, 0, 0), (16, 0, 4), (32, 0, 0)], shade(earth, 0.7))
    iso.box(10, -6, 20, 0, 0, 12, (200, 196, 180))
    iso.box(9, -7, 21, 1, 12, 13.5, (160, 60, 50))
    iso.wall_rect_y(0, 11, 19, 6, 10, (100, 150, 200, 255))
    # Schild
    iso.line((26, 15.5, 0), (26, 15.5, 10), (80, 80, 86, 255))
    iso.box(24, 15, 28, 16, 10, 14, (240, 200, 40))
    return iso.result()


def stripe(color):
    """farbige Markierung an der Gleisseite (Abstell-/Richtungsgleis)"""
    iso = Iso(16, 16, 4)
    iso.poly([(0, 14, 0.2), (16, 14, 0.2), (16, 15.5, 0.2), (0, 15.5, 0.2)], color + (255,))
    return iso.result()


def sign(color, text_color=(255, 255, 255)):
    iso = Iso(16, 16, 16)
    iso.line((8, 15, 0), (8, 15, 10), (80, 80, 86, 255))
    iso.box(5.5, 14.5, 10.5, 15.5, 10, 15, color)
    return iso.result()


def warn_icon():
    a = np.zeros((11, 12, 4), np.uint8)
    shape = ["....##......", "...#@@#.....", "...#@@#.....", "..#@##@#....", "..#@##@#....", ".#@@##@@#...",
             ".#@@@@@@#...", "#@@@##@@@#..", "#@@@@@@@@#..", "##########..", "............"]
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "#":
                a[y, x] = (60, 30, 0, 255)
            elif ch == "@":
                a[y, x] = (255, 206, 40, 255)
    return Image.fromarray(a, "RGBA")


def tool_icon(name):
    a = np.zeros((12, 12, 4), np.uint8)
    put = lambda x, y, c: a.__setitem__((y, x), tuple(c) + (255,))
    if name == "wire":
        for y in range(1, 12):
            put(2, y, (110, 110, 118))
        for x in range(2, 11):
            put(x, 2, (110, 110, 118))
        for x in range(0, 12):
            put(x, 5, (40, 40, 46))
        put(9, 3, (110, 110, 118)); put(9, 4, (110, 110, 118))
        for (x, y) in ((6, 7), (7, 8), (6, 9), (7, 10)):
            put(x, y, (250, 210, 60))
    return Image.fromarray(a, "RGBA")


# ---------------------------------------------------------------- Paket 5: Läden, Straße, Bahnhofsausbau, Deko
def cafe():
    """Café 2x2 mit Markise und Tischen davor"""
    img, ox, oy = gable_house(2, 2, (238, 226, 200), (120, 70, 50), H=11, R=6, sign=(110, 60, 40, 255))
    iso = Iso(32, 32, 20)
    iso.img.paste(img, (int(ox - iso.x0), int(oy - iso.y0)), img)
    for i in range(8):
        c = (40, 120, 90, 255) if i % 2 == 0 else (240, 236, 220, 255)
        xa = 2 + i * 3.5
        iso.poly([(xa, 30.5, 9), (xa + 3.5, 30.5, 9), (xa + 3.5, 34, 6.5), (xa, 34, 6.5)], c)
    return iso.result()


def wc():
    """kleines WC-Häuschen mit zwei Türen"""
    iso = Iso(16, 16, 18)
    iso.box(3, 4, 13, 12, 0, 10, (214, 208, 196))
    iso.box(2, 3, 14, 13, 10, 11.5, (96, 100, 112))
    iso.wall_rect_y(12, 4.5, 7.5, 0, 7, (60, 110, 190, 255))
    iso.wall_rect_y(12, 8.5, 11.5, 0, 7, (200, 70, 70, 255))
    iso.wall_rect_y(12, 5.5, 10.5, 8, 9.5, (250, 250, 246, 255))
    return iso.result()


def inn():
    """Gasthaus 2x2: Fachwerk-Look, grünes Schild, Biertische davor"""
    img, ox, oy = gable_house(2, 2, (236, 220, 186), (122, 58, 40), H=12, R=7, sign=(46, 110, 60, 255))
    iso = Iso(32, 32, 22)
    iso.img.paste(img, (int(ox - iso.x0), int(oy - iso.y0)), img)
    for x in (6, 20):
        iso.box(x, 34, x + 6, 37, 2.5, 3.2, (130, 90, 56))
        iso.box(x + 2.5, 35, x + 3.5, 36, 0, 2.5, (100, 70, 44))
    return iso.result()


def sawmill():
    """Sägewerk 3x2: Holzhalle, Stämme davor, Schornstein"""
    img, ox, oy = gable_house(3, 2, (150, 104, 64), (92, 70, 52), H=13, R=7, windows=False, sign=(200, 160, 60, 255))
    iso = Iso(48, 32, 36)
    iso.img.paste(img, (int(ox - iso.x0), int(oy - iso.y0)), img)
    iso.box(38, 4, 41, 7, 0, 30, (120, 110, 104))
    for i, x in enumerate((4, 12, 20)):
        for k in range(3):
            iso.box(x, 33 + k * 0.0, x + 7, 35, 0.5 + k * 2, 2.3 + k * 2, (172, 120, 70) if (i + k) % 2 else (150, 100, 58))
    return iso.result()


def mine():
    """Bergwerk 3x2: Förderturm (Gitter) und Maschinenhaus"""
    img, ox, oy = gable_house(2, 2, (176, 150, 130), (100, 80, 70), H=12, R=6, sign=(60, 60, 70, 255))
    iso = Iso(48, 32, 52)
    iso.img.paste(img, (int(ox - iso.x0), int(oy - iso.y0)), img)
    steel = (74, 78, 88)
    for (x, y) in ((36, 9), (44, 9), (36, 21), (44, 21)):
        iso.box(x, y, x + 1.5, y + 1.5, 0, 38, steel, outline=False)
    for z in (12, 24, 36):
        iso.box(36, 9, 45.5, 10.5, z, z + 1, steel, outline=False)
        iso.box(36, 21, 45.5, 22.5, z, z + 1, steel, outline=False)
    iso.box(37, 13, 45, 18, 38, 41, (150, 60, 50))
    for x in (6, 16):
        iso.box(x, 33, x + 7, 37, 0.5, 3, (60, 56, 52))
    return iso.result()


def vending():
    iso = Iso(16, 16, 16)
    iso.box(5, 6, 11, 10, 0, 12, (200, 40, 40))
    iso.wall_rect_y(10, 6, 10, 5, 11, (220, 230, 240, 255))
    for z in (6, 8, 10):
        iso.line((6.5, 10, z), (9.5, 10, z), (60, 120, 200, 255))
    return iso.result()


def parking():
    """Parkplatz 3x2: Asphalt, Markierungen, zwei Autos"""
    iso = Iso(48, 32, 10)
    iso.poly([(0, 0, 0.5), (48, 0, 0.5), (48, 32, 0.5), (0, 32, 0.5)], (88, 90, 96, 255))
    for x in range(4, 48, 8):
        iso.line((x, 2, 0.6), (x, 12, 0.6), (230, 230, 220, 255))
        iso.line((x, 20, 0.6), (x, 30, 0.6), (230, 230, 220, 255))
    for (x, y, col) in ((6, 3, (200, 60, 50)), (22, 21, (60, 110, 190)), (30, 3, (230, 200, 70))):
        iso.box(x, y, x + 6, y + 8, 0.6, 3.5, col)
        iso.box(x + 1, y + 2, x + 5, y + 6, 3.5, 5.5, shade(col, 0.85), top=(150, 190, 220, 255))
    return iso.result()


def bus_terminal():
    """Bushaltestelle 3x2: Dach, Bus"""
    iso = Iso(48, 32, 22)
    iso.poly([(0, 0, 0.5), (48, 0, 0.5), (48, 32, 0.5), (0, 32, 0.5)], (96, 96, 102, 255))
    iso.poly([(0, 20, 0.6), (48, 20, 0.6), (48, 22, 0.6), (0, 22, 0.6)], (230, 200, 60, 255))
    # Bus
    bus = (232, 180, 40)
    iso.box(6, 6, 40, 16, 1, 11, bus)
    for x in range(9, 38, 5):
        iso.wall_rect_y(16, x, x + 3.5, 6, 9.5, (60, 90, 120, 255))
    # Dach der Wartehalle
    post = (70, 76, 86, 255)
    for x in (4, 44):
        iso.line((x, 28, 0), (x, 28, 13), post)
    iso.poly([(2, 24, 13), (46, 24, 13), (46, 31, 13.5), (2, 31, 13.5)], (176, 216, 236, 220), (90, 110, 130, 255))
    return iso.result()


def road(mask):
    """Straßenstück; mask: 1=N(y-1) 2=E(x+1) 4=S(y+1) 8=W(x-1)"""
    iso = Iso(16, 16, 2)
    asphalt, line = (92, 94, 100, 255), (236, 226, 160, 255)
    iso.poly([(1, 1, 0.3), (15, 1, 0.3), (15, 15, 0.3), (1, 15, 0.3)], asphalt)
    if mask & 1: iso.poly([(1, 0, 0.3), (15, 0, 0.3), (15, 1, 0.3), (1, 1, 0.3)], asphalt)
    if mask & 4: iso.poly([(1, 15, 0.3), (15, 15, 0.3), (15, 16, 0.3), (1, 16, 0.3)], asphalt)
    if mask & 8: iso.poly([(0, 1, 0.3), (1, 1, 0.3), (1, 15, 0.3), (0, 15, 0.3)], asphalt)
    if mask & 2: iso.poly([(15, 1, 0.3), (16, 1, 0.3), (16, 15, 0.3), (15, 15, 0.3)], asphalt)
    # Mittellinie
    if mask & 5:
        iso.line((8, 0 if mask & 1 else 8, 0.4), (8, 16 if mask & 4 else 8, 0.4), line)
    if mask & 10:
        iso.line((0 if mask & 8 else 8, 8, 0.4), (16 if mask & 2 else 8, 8, 0.4), line)
    return iso.result()


def station_big(level):
    """Empfangsgebäude Stufe 2 (größer, Uhr) und 3 (mit Turm)"""
    wall = (226, 214, 180) if level == 2 else (214, 190, 160)
    roof = (168, 72, 56) if level == 2 else (90, 96, 110)
    img, ox, oy = gable_house(3, 2, wall, roof, H=18 if level == 2 else 20, R=9, sign=(40, 70, 130, 255))
    iso = Iso(48, 32, 52)
    iso.img.paste(img, (int(ox - iso.x0), int(oy - iso.y0)), img)
    if level == 3:
        iso.box(18, 10, 28, 20, 20, 40, wall)
        iso.poly([(17, 9, 40), (29, 9, 40), (23, 15, 48)], shade(roof, 0.8))
        iso.poly([(29, 9, 40), (29, 21, 40), (23, 15, 48)], shade(roof, 0.65))
        iso.poly([(17, 21, 40), (29, 21, 40), (23, 15, 48)], roof + (255,))
        iso.wall_rect_y(20, 20, 26, 30, 36, (245, 245, 235, 255))
    else:
        iso.wall_rect_y(32 - 1.5, 20, 28, 13, 17, (245, 245, 235, 255))
    # Vordach über dem Eingang
    iso.poly([(10, 30, 9), (38, 30, 9), (38, 36, 8), (10, 36, 8)], (80, 86, 96, 255), (50, 54, 60, 255))
    return iso.result()


def fountain():
    iso = Iso(16, 16, 12)
    iso.box(2, 2, 14, 14, 0, 2.5, (176, 170, 160), top=(90, 150, 220, 255))
    iso.box(7, 7, 9, 9, 2.5, 7, (190, 184, 172))
    iso.box(6, 6, 10, 10, 7, 8, (190, 184, 172), top=(120, 180, 240, 255))
    return iso.result()


def flowers(seed):
    rng = np.random.default_rng(seed)
    iso = Iso(16, 16, 6)
    iso.box(2, 2, 14, 14, 0, 2, (130, 92, 60), top=(84, 150, 64, 255))
    a = np.array(iso.img)
    cols = [(240, 80, 90), (250, 210, 70), (240, 240, 250), (190, 110, 230)]
    ys, xs = np.nonzero(a[:, :, 3])
    for i in rng.choice(len(xs), size=len(xs) // 9, replace=False):
        if a[ys[i], xs[i], 1] > 140:
            a[ys[i], xs[i]] = cols[int(rng.integers(4))] + (255,)
    return Image.fromarray(a), int(iso.x0), int(iso.y0)


def lamp():
    iso = Iso(16, 16, 22)
    iso.line((8, 8, 0), (8, 8, 18), (50, 54, 62, 255))
    iso.box(6.5, 6.5, 9.5, 9.5, 17, 20, (60, 64, 72), top=(255, 236, 150, 255))
    return iso.result()


def statue():
    iso = Iso(16, 16, 22)
    iso.box(4, 4, 12, 12, 0, 5, (170, 166, 156))
    stone = (120, 150, 140)
    iso.box(7, 7, 9.5, 9.5, 5, 13, stone)
    iso.box(6.5, 6.5, 10, 10, 13, 16, shade(stone, 1.05))
    iso.box(7.5, 7.5, 9, 9, 16, 18, stone)
    return iso.result()


def platform_clock():
    iso = Iso(16, 16, 22)
    iso.line((8, 8, 0), (8, 8, 14), (60, 64, 72, 255))
    iso.box(6, 7, 10, 9, 14, 19, (40, 44, 52), top=(60, 64, 72, 255))
    iso.wall_rect_y(9, 6.6, 9.4, 14.6, 18.4, (245, 245, 235, 255))
    iso.line((8, 9, 16.5), (8, 9, 18), (20, 20, 20, 255))
    return iso.result()


# ---------------------------------------------------------------- Wüste: Lehmhäuser, Brunnen, Zelt
def adobe(w, h, wall, H=10, dome=False, tower=False, seed=0):
    """Lehmhaus mit Flachdach und Brüstung, Holzbalken, kleine Fenster"""
    rng = np.random.default_rng(seed)
    W, D = 16 * w, 16 * h
    m = 1.5
    x0, y0, x1, y1 = m, m, W - m, D - m
    top_h = H + (8 if tower else 0) + (7 if dome else 0) + 4
    iso = Iso(W, D, top_h)
    iso.box(x0, y0, x1, y1, 0, H, wall)
    # Brüstung
    p = 1.2
    for (a, b, c, d) in ((x0, y0, x1, y0 + p), (x0, y1 - p, x1, y1), (x0, y0, x0 + p, y1), (x1 - p, y0, x1, y1)):
        iso.box(a, b, c, d, H, H + 1.5, shade(wall, 1.05), outline=False)
    iso.poly([(x0 + p, y0 + p, H + 0.2), (x1 - p, y0 + p, H + 0.2), (x1 - p, y1 - p, H + 0.2), (x0 + p, y1 - p, H + 0.2)], shade(wall, 0.9))
    # Fenster vorne + Tür
    n = max(1, int((x1 - x0) // 8))
    for i in range(n):
        xa = x0 + 3 + i * (x1 - x0 - 4) / n
        if i == n // 2:
            iso.wall_rect_y(y1, xa, xa + 3.5, 0, 6.5, (110, 70, 40, 255))
            iso.wall_rect_y(y1, xa - 0.5, xa + 4, 6.5, 7.3, shade(wall, 0.7))
        else:
            iso.wall_rect_y(y1, xa, xa + 2.5, 4.5, 7.5, (40, 34, 30, 255))
    for i in range(max(1, int((y1 - y0) // 9))):
        ya = y0 + 3 + i * 9
        iso.wall_rect_x(x1, ya, ya + 2.5, 4.5, 7.5, (34, 28, 26, 255))
    # Holzbalken (Vigas) unter dem Dach
    for i in range(int((x1 - x0) // 5)):
        xa = x0 + 2.5 + i * 5
        iso.wall_rect_y(y1 + 0.01, xa, xa + 1, H - 2, H - 1, (96, 64, 38, 255))
    if tower:
        tx0, ty0 = x0 + 2, y0 + 2
        iso.box(tx0, ty0, tx0 + 7, ty0 + 7, H, H + 8, shade(wall, 1.02))
        iso.wall_rect_y(ty0 + 7, tx0 + 2.5, tx0 + 4.5, H + 3, H + 6, (40, 34, 30, 255))
    if dome:
        cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, min(x1 - x0, y1 - y0) * 0.32
        for k in range(7):
            rr = r * np.cos(k / 7 * np.pi / 2)
            col = shade((236, 236, 228), 1.0 - k * 0.02) if k < 6 else shade((70, 140, 170), 1)
            iso.box(cx - rr, cy - rr, cx + rr, cy + rr, H + k, H + k + 1.2, col, outline=False)
    # Flecken im Lehm
    a = np.array(iso.img)
    ys, xs = np.where(a[:, :, 3] == 255)
    for i in rng.choice(len(xs), size=min(len(xs), 25), replace=False):
        y, x = ys[i], xs[i]
        a[y, x, :3] = (a[y, x, :3] * 0.9).astype(np.uint8)
    return Image.fromarray(a), int(iso.x0), int(iso.y0)


def well():
    iso = Iso(16, 16, 18)
    stone = (170, 150, 120)
    iso.box(3, 3, 13, 13, 0, 4, stone)
    iso.poly([(4.5, 4.5, 4.1), (11.5, 4.5, 4.1), (11.5, 11.5, 4.1), (4.5, 11.5, 4.1)], (50, 90, 130, 255))
    for (a, b) in ((3.5, 7.5), (11.5, 7.5)):
        iso.box(a, b, a + 1, b + 1, 4, 12, (110, 76, 46))
    iso.box(3.5, 7.2, 12.5, 8.8, 12, 13, (96, 64, 38))
    iso.poly([(2, 6, 13), (14, 6, 13), (14, 8, 16), (2, 8, 16)], shade((176, 80, 52), 0.8))
    iso.poly([(2, 10, 13), (14, 10, 13), (14, 8, 16), (2, 8, 16)], shade((176, 80, 52), 1.0))
    return iso.result()


def tent(col=(214, 190, 150), stripe=(170, 60, 50)):
    iso = Iso(16, 16, 14)
    x0, y0, x1, y1, H = 2, 3, 14, 13, 10
    ym = (y0 + y1) / 2
    iso.poly([(x1, y0, 0), (x1, y1, 0), (x1, ym, H)], shade(col, 0.8), shade(col, 0.55))
    iso.poly([(x0, y1, 0), (x1, y1, 0), (x1, ym, H), (x0, ym, H)], shade(col, 1.0), shade(col, 0.6))
    for t in (0.33, 0.66):
        iso.line((x0 + (x1 - x0) * t, y1, 0), (x0 + (x1 - x0) * t, ym, H), shade(stripe, 1))
    iso.poly([(x1, ym - 1.5, 0), (x1, ym + 1.5, 0), (x1, ym, 5)], (50, 36, 28, 255))
    return iso.result()


# ---------------------------------------------------------------- Forschung: neue Gebäude
def billboard():
    """Plakatwand auf zwei Pfosten, buntes Plakat"""
    iso = Iso(16, 16, 22)
    for x in (4, 12):
        iso.box(x, 8, x + 1, 9, 0, 9, (70, 70, 76))
    iso.box(2, 8, 14, 9, 9, 19, (230, 230, 224))
    iso.wall_rect_y(9.01, 3, 13, 10, 18, (60, 140, 210, 255))
    iso.wall_rect_y(9.02, 3, 13, 10, 12.5, (240, 200, 60, 255))
    iso.wall_rect_y(9.03, 4, 8, 13.5, 17, (220, 70, 60, 255))
    iso.wall_rect_y(9.03, 9, 12, 14.5, 15.5, (250, 250, 250, 255))
    iso.wall_rect_y(9.03, 9, 11, 16, 17, (250, 250, 250, 255))
    return iso.result()


def lockers():
    """Schließfächer: Metallschrank mit Fächern"""
    iso = Iso(16, 16, 18)
    iso.box(3, 6, 13, 10, 0, 13, (150, 160, 172))
    for i in range(4):
        for j in range(3):
            xa = 3.6 + i * 2.35
            iso.wall_rect_y(10.01, xa, xa + 1.9, 1 + j * 4, 4 + j * 4, (186, 196, 206, 255))
            iso.wall_rect_y(10.02, xa + 1.3, xa + 1.6, 2.2 + j * 4, 2.8 + j * 4, (60, 60, 66, 255))
    iso.wall_rect_y(10.03, 3.6, 12.4, 12, 13, (240, 200, 60, 255))
    return iso.result()


def souvenir():
    """Souvenirstand: Häuschen mit Postkartenständer und Wimpeln"""
    iso = Iso(16, 16, 22)
    iso.box(3, 4, 13, 11, 0, 9, (150, 90, 160))
    iso.wall_rect_y(11, 4, 12, 3, 7, (250, 236, 200, 255))
    for i, c in enumerate([(220, 60, 50), (60, 140, 210), (240, 200, 60), (80, 170, 90)]):
        iso.wall_rect_y(11.01, 4.5 + i * 2, 5.8 + i * 2, 4, 6, c + (255,))
    iso.poly([(2, 3, 9), (14, 3, 9), (14, 12, 9), (2, 12, 9)], (200, 140, 210, 255), (110, 60, 120, 255))
    iso.box(6, 6, 10, 9, 9, 12, (240, 200, 60))
    iso.line((13, 12, 0), (13, 12, 8), (70, 70, 76, 255))
    for k, c in enumerate([(240, 240, 240), (120, 200, 230), (250, 180, 120)]):
        iso.wall_rect_x(13.6, 11.2, 12.8, 2 + k * 2, 3.6 + k * 2, c + (255,))
    return iso.result()


def mural():
    """Wandbild: Mauerstück mit bunter Lok"""
    iso = Iso(16, 16, 20)
    wall = (196, 170, 140)
    iso.box(1, 7, 15, 9, 0, 14, wall)
    iso.wall_rect_y(9.01, 1.5, 14.5, 0.5, 13.5, (110, 190, 220, 255))
    iso.wall_rect_y(9.02, 1.5, 14.5, 0.5, 4, (90, 170, 80, 255))
    iso.wall_rect_y(9.03, 9.5, 12.5, 10, 12, (250, 220, 80, 255))
    iso.wall_rect_y(9.04, 3, 10, 4, 8.5, (210, 60, 50, 255))
    iso.wall_rect_y(9.05, 8, 10, 8.5, 10.5, (210, 60, 50, 255))
    iso.wall_rect_y(9.06, 3.5, 5, 6, 7.5, (240, 240, 240, 255))
    iso.wall_rect_y(9.06, 4, 5, 3.5, 4.5, (30, 30, 30, 255))
    iso.wall_rect_y(9.06, 7.5, 8.5, 3.5, 4.5, (30, 30, 30, 255))
    iso.wall_rect_y(9.07, 2, 14, 13, 13.6, shade(wall, 0.8))
    return iso.result()


def xmas():
    """Christbaum mit Kugeln und Stern"""
    img, ox, oy = tree_pine(77)
    a = np.array(img)
    rng = np.random.default_rng(5)
    cols = [(230, 60, 50), (250, 210, 60), (90, 150, 230), (250, 250, 250)]
    ys, xs = np.where((a[:, :, 3] == 255) & (a[:, :, 1] > 60))
    for i in rng.choice(len(xs), size=min(len(xs), 14), replace=False):
        if ys[i] < 22:
            a[ys[i], xs[i], :3] = cols[i % 4]
    top = np.where(a[:, :, 3] == 255)
    y0 = top[0].min()
    x0 = int(np.median(top[1][top[0] == y0]))
    big = np.zeros((a.shape[0] + 3, a.shape[1], 4), np.uint8)
    big[3:] = a
    for (dy, dx) in ((0, 0), (1, -1), (1, 0), (1, 1), (2, 0)):
        if 0 <= x0 + dx < big.shape[1]:
            big[dy + 1 if dy else 0, x0 + dx] = (255, 220, 60, 255)
    return Image.fromarray(big), ox, oy - 3


def ri_icon(kind):
    """kleine Forschungs-Symbole 18x18 (werden auf 48 skaliert)"""
    a = np.zeros((18, 18, 4), np.uint8)
    def px(x, y, c):
        if 0 <= x < 18 and 0 <= y < 18:
            a[y, x] = c + (255,)
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                px(x, y, c)
    K = (30, 30, 36)
    if kind == "whistle":
        rect(3, 7, 12, 12, (210, 200, 70)); rect(11, 8, 16, 10, (210, 200, 70)); rect(5, 8, 9, 11, (240, 230, 120))
        rect(6, 9, 8, 10, K); rect(2, 6, 4, 7, (160, 150, 40))
        for i in range(3):
            px(13 + i, 5 - i, (255, 255, 255)); px(12 + i, 4 - i, (200, 220, 255))
    elif kind == "estw":
        rect(1, 2, 17, 13, (60, 64, 72)); rect(2, 3, 16, 12, (20, 40, 30))
        for x in range(3, 15):
            px(x, 7, (120, 230, 120))
        for x in range(6, 11):
            px(x, 7 - (x - 6) // 2, (120, 230, 120))
        px(4, 5, (230, 60, 50)); px(13, 9, (120, 230, 120)); px(9, 10, (240, 200, 60))
        rect(7, 13, 11, 15, (60, 64, 72)); rect(4, 15, 14, 16, (80, 84, 92))
    elif kind == "haggle":
        rect(1, 7, 8, 12, (230, 180, 140)); rect(10, 7, 17, 12, (200, 150, 110))
        rect(6, 8, 12, 11, (240, 196, 156)); rect(0, 6, 3, 13, (60, 90, 160)); rect(15, 6, 18, 13, (160, 60, 60))
        for x in (7, 9, 11):
            px(x, 8, (170, 120, 90))
        rect(7, 1, 11, 5, (240, 200, 60)); px(8, 2, (200, 150, 30)); px(9, 3, (200, 150, 30))
    elif kind == "specials":
        rect(2, 4, 16, 13, (240, 220, 160)); rect(2, 4, 16, 6, (200, 60, 50))
        for y in (7, 9, 11):
            rect(4, y, 11, y + 1, (120, 100, 70))
        rect(12, 8, 15, 12, (60, 120, 200)); px(13, 9, (250, 250, 250))
        for y in range(4, 13, 2):
            px(1, y, (240, 220, 160)); px(16, y, (240, 220, 160))
    # Umriss
    m = a[:, :, 3] > 0
    out = a.copy()
    for y in range(18):
        for x in range(18):
            if not m[y, x] and any(0 <= y + dy < 18 and 0 <= x + dx < 18 and m[y + dy, x + dx] for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0))):
                out[y, x] = (20, 20, 24, 255)
    return Image.fromarray(out).resize((36, 36), Image.NEAREST)
