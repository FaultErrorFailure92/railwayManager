import Phaser from 'phaser';
import { MAIN_ROW, TILE } from '../config';
import type { Game } from '../game/Game';
import manifest from '../gen/manifest.json';
import { toScreen } from '../iso';
import { VILLAGES } from '../world/Grid';

type Kind = 'cow' | 'sheep' | 'deer' | 'hare' | 'fox';

interface Animal {
  kind: Kind;
  img: Phaser.GameObjects.Image;
  /** Weltposition (Einheiten) */
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Heimat und Radius (Tiles) */
  hx: number;
  hy: number;
  r: number;
  speed: number;
  /** Restzeit Grasen/Stehen (echte Sekunden) */
  idle: number;
  anim: number;
}

const ANIMALS = (manifest as unknown as { animals: Record<Kind, { file: string; w: number; h: number; frames: number }> }).animals;
const SPEED: Record<Kind, number> = { cow: 4, sheep: 5, deer: 14, hare: 18, fox: 12 };
/** Tiere laufen nur auf Wiese ohne Gleis, Gebäude oder Bahnsteig */
const WILD_IDLE: Record<Kind, [number, number]> = { cow: [3, 9], sheep: [2, 7], deer: [2, 6], hare: [1, 4], fox: [1, 5] };

export function preloadAnimals(scene: Phaser.Scene) {
  for (const [k, a] of Object.entries(ANIMALS)) {
    scene.load.spritesheet(`animal_${k}`, `assets/gen/${a.file}`, { frameWidth: a.w, frameHeight: a.h });
  }
}

export class Animals {
  private list: Animal[] = [];
  private seed = 4242;

  constructor(private scene: Phaser.Scene, private g: Game) {
    this.spawnAll();
  }

  private rnd() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** Zelle frei für Tiere? */
  private walkable(cx: number, cy: number) {
    const g = this.g.grid;
    if (!g.isGround(cx, cy)) return false;
    const c = g.get(cx, cy)!;
    if (c.track || c.piece !== null || c.platform) return false;
    if (c.building !== null) {
      const b = g.buildings.get(c.building);
      return !!b && b.decor && (b.key.startsWith('bld_tree') || b.key.startsWith('bld_pine') || b.key === 'bld_bush0');
    }
    return true;
  }

  private spawnAll() {
    // Weiden bei den Dörfern: Kühe oder Schafe (nie auf der Strecken-Seite)
    VILLAGES.forEach((v, i) => {
      const kind: Kind = i % 2 ? 'sheep' : 'cow';
      const side = v.y < MAIN_ROW ? -1 : 1;
      const hx = v.x + (this.rnd() - 0.5) * 8, hy = v.y + side * (4 + this.rnd() * 3);
      const n = kind === 'sheep' ? 7 : 5;
      for (let k = 0; k < n; k++) this.add(kind, hx, hy, 3.5);
    });
    // Wildtiere am Waldrand und im freien Feld
    const g = this.g.grid;
    let placed = 0;
    for (let i = 0; i < 600 && placed < 70; i++) {
      const x = Math.floor(this.rnd() * g.w), y = Math.floor(this.rnd() * g.h);
      if (Math.abs(y - MAIN_ROW) < 5 || !this.walkable(x, y)) continue;
      // in der Nähe von Bäumen?
      let trees = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const c = g.get(x + dx, y + dy);
        if (c?.building != null && g.buildings.get(c.building)?.key.match(/tree|pine/)) trees++;
      }
      if (trees < 3) continue;
      const r = this.rnd();
      const kind: Kind = r < 0.45 ? 'deer' : r < 0.8 ? 'hare' : 'fox';
      const group = kind === 'deer' ? 1 + Math.floor(this.rnd() * 3) : 1;
      for (let k = 0; k < group; k++) this.add(kind, x, y, kind === 'deer' ? 7 : 5);
      placed++;
    }
  }

  private add(kind: Kind, hx: number, hy: number, r: number) {
    let x = hx, y = hy;
    for (let i = 0; i < 20; i++) {
      x = hx + (this.rnd() - 0.5) * r * 2;
      y = hy + (this.rnd() - 0.5) * r * 2;
      if (this.walkable(Math.floor(x), Math.floor(y))) break;
    }
    if (!this.walkable(Math.floor(x), Math.floor(y))) return;
    const img = this.scene.add.image(0, 0, `animal_${kind}`, 0).setOrigin(0.5, 1);
    const a: Animal = {
      kind, img, x: x * TILE, y: y * TILE, tx: x * TILE, ty: y * TILE, hx, hy, r,
      speed: SPEED[kind] * (0.8 + this.rnd() * 0.4), idle: this.rnd() * 5, anim: this.rnd() * 10,
    };
    this.list.push(a);
    this.place(a, 2);
  }

  private pickTarget(a: Animal) {
    for (let i = 0; i < 8; i++) {
      const x = a.hx + (this.rnd() - 0.5) * a.r * 2, y = a.hy + (this.rnd() - 0.5) * a.r * 2;
      if (this.walkable(Math.floor(x), Math.floor(y))) { a.tx = x * TILE; a.ty = y * TILE; return; }
    }
  }

  private place(a: Animal, frame: number) {
    const p = toScreen(a.x, a.y);
    a.img.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y + 0.25).setFrame(frame);
  }

  update(dtReal: number, speed: number, paused: boolean, view: Phaser.Geom.Rectangle) {
    if (paused) return;
    const dt = dtReal * Math.min(speed, 4);
    for (const a of this.list) {
      const p = toScreen(a.x, a.y);
      const visible = Phaser.Geom.Rectangle.Contains(view, p.x, p.y);
      a.img.setVisible(visible);
      if (a.idle > 0) {
        a.idle -= dt;
        if (visible) this.place(a, 2);
        if (a.idle <= 0) this.pickTarget(a);
        continue;
      }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d < 1) {
        const [lo, hi] = WILD_IDLE[a.kind];
        a.idle = lo + this.rnd() * (hi - lo);
        continue;
      }
      const step = Math.min(d, a.speed * dt);
      const nx = a.x + (dx / d) * step, ny = a.y + (dy / d) * step;
      if (!this.walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) { a.idle = 1; continue; }
      a.x = nx; a.y = ny;
      // Blickrichtung auf dem Bildschirm: rechts, wenn x−y wächst
      a.img.setFlipX(dx - dy < 0);
      a.anim += dt * (a.speed / 4);
      if (visible) this.place(a, Math.floor(a.anim * 2) % 2);
    }
  }
}
