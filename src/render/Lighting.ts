import Phaser from 'phaser';
import { TILE } from '../config';
import type { Game } from '../game/Game';
import { toScreen } from '../iso';
import { BUILDINGS, isStation } from '../world/buildings';

type XY = { x: number; y: number };

/** wie dunkel es ist (0 = Tag, 1 = tiefe Nacht) und welche Farbe der Himmel hat */
export function daylight(time: number) {
  const h = (time / 3600) % 24;
  let dark: number;
  if (h >= 6.5 && h < 18.5) dark = 0;
  else if (h >= 18.5 && h < 21) dark = (h - 18.5) / 2.5;
  else if (h >= 4.5 && h < 6.5) dark = 1 - (h - 4.5) / 2;
  else dark = 1;
  // Dämmerung: warmes Violett, Nacht: tiefes Blau
  const dusk = dark > 0 && dark < 1 ? 1 - Math.abs(dark - 0.5) * 2 : 0;
  return { dark, dusk };
}

/** Tageszeit: abends dunkel, Laternen, Bahnhof und Züge leuchten */
export class Lighting {
  private shade: Phaser.GameObjects.Rectangle;
  private pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private staticLights: { p: XY; s: number; c: number }[] = [];
  private builtVersion = -1;

  constructor(private scene: Phaser.Scene, private g: Game, depth: number) {
    if (!scene.textures.exists('glow')) {
      const c = scene.textures.createCanvas('glow', 64, 64)!;
      const ctx = c.getContext();
      const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 64, 64);
      c.refresh();
    }
    this.shade = scene.add.rectangle(0, 0, 10, 10, 0x0b1236, 0).setOrigin(0).setDepth(depth);
    this.depth = depth + 1;
  }

  private depth: number;

  private light(p: XY, scale: number, color: number, alpha: number) {
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth);
      this.pool.push(img);
    }
    this.used++;
    img.setPosition(p.x, p.y).setScale(scale).setTint(color).setAlpha(alpha).setVisible(true);
  }

  private rebuild() {
    this.builtVersion = this.g.version;
    this.staticLights = [];
    for (const b of this.g.grid.buildings.values()) {
      const d = BUILDINGS[b.key];
      if (!d || b.decor) continue;
      const cx = (b.x + d.w / 2) * TILE, cy = (b.y + d.h / 2) * TILE;
      const s = toScreen(cx, cy);
      if (b.key === 'bld_lamp' || b.key === 'bld_streetlamp') this.staticLights.push({ p: { x: s.x, y: s.y - 15 }, s: 0.9, c: 0xffd27a });
      else if (b.key === 'bld_xmas') this.staticLights.push({ p: { x: s.x, y: s.y - 10 }, s: 0.7, c: 0xffe6a0 });
      else if (isStation(b.key)) {
        for (const dx of [-14, 14]) this.staticLights.push({ p: { x: s.x + dx, y: s.y - 2 }, s: 0.4, c: 0xffe0a0 });
      } else if (d.group === 'func' || d.group === 'deco' && d.w > 1) this.staticLights.push({ p: { x: s.x, y: s.y - 4 }, s: 0.5, c: 0xffd890 });
    }
  }

  /** trains: je Zug Spitze, Ende und Wagenmitten (Bildschirmkoordinaten) */
  update(view: Phaser.Geom.Rectangle, trains: { head: XY; tail: XY; cars: XY[]; pax: boolean }[]) {
    const { dark, dusk } = daylight(this.g.sim.time);
    this.used = 0;
    this.shade.setPosition(view.x - 20, view.y - 20).setSize(view.width + 40, view.height + 40);
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x0b1236), Phaser.Display.Color.ValueToColor(0x5a2a5a), 100, Math.round(dusk * 60));
    this.shade.setFillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), dark * 0.55);
    if (dark > 0.05) {
      if (this.builtVersion !== this.g.version) this.rebuild();
      const inView = (p: XY) => p.x > view.x - 40 && p.x < view.right + 40 && p.y > view.y - 40 && p.y < view.bottom + 40;
      for (const l of this.staticLights) if (inView(l.p)) this.light(l.p, l.s, l.c, dark * 0.8);
      for (const t of trains) {
        if (!inView(t.head)) continue;
        this.light({ x: t.head.x, y: t.head.y - 4 }, 0.5, 0xfff4d0, dark);
        this.light({ x: t.tail.x, y: t.tail.y - 4 }, 0.22, 0xff3030, dark * 0.9);
        if (t.pax) for (const c of t.cars) this.light({ x: c.x, y: c.y - 6 }, 0.32, 0xffe6a8, dark * 0.6);
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}
