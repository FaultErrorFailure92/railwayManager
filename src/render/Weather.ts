import Phaser from 'phaser';
import type { Game } from '../game/Game';

/** Regen- und Schneeflocken als Pixel über der sichtbaren Karte */
export class Weather {
  private gfx: Phaser.GameObjects.Graphics;
  private drops: { x: number; y: number; s: number }[] = [];

  constructor(scene: Phaser.Scene, private g: Game, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth);
    for (let i = 0; i < 260; i++) this.drops.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 });
  }

  update(dt: number, view: Phaser.Geom.Rectangle, zoom: number) {
    const kind = this.g.weather.kind;
    const gfx = this.gfx;
    gfx.clear();
    if (kind === 'sun') return;
    const snow = kind === 'snow';
    const speed = this.g.paused ? 0 : snow ? 0.08 : 0.9;
    const n = snow ? 220 : 260;
    const px = 1 / zoom;
    gfx.fillStyle(snow ? 0xe8eef8 : 0x0a1830, snow ? 0.1 : 0.12).fillRect(view.x, view.y, view.width, view.height);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d.y += speed * d.s * dt;
      d.x += (snow ? Math.sin((d.y + i) * 6) * 0.01 : -0.25 * speed * d.s) * dt;
      if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
      if (d.x < 0) d.x += 1;
      if (d.x > 1) d.x -= 1;
      const x = view.x + d.x * view.width, y = view.y + d.y * view.height;
      if (snow) {
        const r = d.s > 1 ? 4 : 3;
        gfx.fillStyle(0xffffff, 0.95).fillRect(x, y, r * px, r * px);
      } else {
        gfx.lineStyle(px, 0xb8d0f0, 0.55).lineBetween(x, y, x - 3 * px, y + 9 * px);
      }
    }
  }
}
