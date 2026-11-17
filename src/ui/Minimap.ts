/**
 * Übersichtskarte (RM-FR-UI-11) im Stil von Age of Empires 2: isometrisch wie das Spielfeld,
 * links in der unteren Leiste, sichtbarer Ausschnitt als Rechteck. Klicken oder Ziehen springt dorthin.
 * Mausrad zoomt (Standard 2×); im Zoom folgt der Kartenausschnitt der Kamera.
 */
import type { Game } from '../game/Game';
import type { GameScene } from '../render/GameScene';
import { TILE } from '../config';
import { ROCK, WATER } from '../world/Grid';
import { BUILDINGS, isStation } from '../world/buildings';
import { uiScale } from '../game/settings';

type RGB = readonly [number, number, number];
const C: Record<string, RGB> = {
  grass: [72, 108, 52], water: [52, 98, 156], rock: [118, 112, 102], tree: [40, 70, 32],
  track: [226, 222, 210], fixed: [160, 156, 150], platform: [246, 238, 214], road: [150, 136, 112],
  station: [226, 70, 52], building: [210, 170, 112], industry: [146, 104, 70], house: [176, 140, 110],
};
/** fremdes Land ist abgedunkelt (wie unerkundetes Gebiet) */
const FOREIGN = 0.62;
/** Zoomstufen der Übersichtskarte */
const ZOOMS = [1, 1.5, 2, 3, 4];

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  /** ganze Karte in der aktuellen Zoomstufe (Hintergrund, nur nach Änderungen neu) */
  private base: HTMLCanvasElement | null = null;
  /** Zoomstufe und sichtbarer Ausschnitt (Karteneinheiten, oben links) */
  private z = 2;
  private ou = 0;
  private ov = 0;
  private builtKey = '';
  private dragging = false;
  /** Pixel je Karteneinheit (Gerätepixel) */
  private k = 1;

  constructor(private canvas: HTMLCanvasElement, private g: Game, private scene: () => GameScene | undefined) {
    this.ctx = canvas.getContext('2d')!;
    const jump = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * canvas.width, py = ((e.clientY - r.top) / r.height) * canvas.height;
      const c = this.toCell(px, py);
      this.scene()?.centerOnCell(c.x, c.y);
      this.draw();
    };
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; canvas.setPointerCapture(e.pointerId); jump(e); });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) jump(e); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    try { this.z = Number(localStorage.getItem('rm_mmzoom2')) || 3; } catch { /* egal */ }
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }

  /** eine Zoomstufe hinein (+1) oder heraus (−1) */
  zoom(d: number) {
    const i = ZOOMS.indexOf(this.z);
    this.z = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 3 : i) + d))];
    try { localStorage.setItem('rm_mmzoom2', String(this.z)); } catch { /* egal */ }
    this.base = null;
    this.draw();
  }

  /** Karteneinheiten: u = x − y + h (0 … w+h), v = (x + y) / 2 (0 … (w+h)/2) */
  private get span() { return this.g.grid.w + this.g.grid.h; }
  private toPx(x: number, y: number) { return { px: (x - y + this.g.grid.h - this.ou) * this.k, py: ((x + y) / 2 - this.ov) * this.k }; }
  private toCell(px: number, py: number) {
    const u = px / this.k + this.ou - this.g.grid.h, v = py / this.k + this.ov;
    return { x: v + u / 2, y: v - u / 2 };
  }

  /** Canvas auf die angezeigte Größe (inkl. Oberflächen-Zoom und Bildschirmdichte) bringen */
  private fit() {
    const cssW = this.canvas.clientWidth;
    if (!cssW) return false;
    const w = Math.round(cssW * uiScale() * (window.devicePixelRatio || 1));
    const h = Math.round((this.canvas.clientHeight || cssW / 2) * uiScale() * (window.devicePixelRatio || 1));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.base = null;
    }
    const k = (w / this.span) * this.z;
    if (k !== this.k) { this.k = k; this.base = null; }
    return true;
  }

  /** Gelände, Land, Gleise und Gebäude malen (nur nach Änderungen) */
  private buildBase() {
    const g = this.g.grid, W = Math.ceil(this.span * this.k), H = Math.ceil((this.span / 2) * this.k);
    // Farbe je Feld vorberechnen
    const col: RGB[] = new Array(g.cells.length);
    for (let k = 0; k < g.cells.length; k++) {
      const t = g.terrain[k];
      col[k] = t === WATER ? C.water : t === ROCK ? C.rock : C.grass;
    }
    for (const b of g.buildings.values()) {
      const def = BUILDINGS[b.key];
      const c = def?.group === 'nature' ? C.tree : def?.group === 'industry' ? C.industry : isStation(b.key) ? C.station : b.decor ? C.house : C.building;
      for (const k of g.buildingCells(b)) col[k] = c;
    }
    g.cells.forEach((c, k) => {
      if (c.road) col[k] = C.road;
      if (c.platform) col[k] = C.platform;
      if (c.track || c.piece !== null) col[k] = c.fixed ? C.fixed : C.track;
    });
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d')!;
    const img = cx.createImageData(W, H), d = img.data;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        // ganze Karte: ohne Ausschnitt-Verschiebung
        const u = (px + 0.5) / this.k - g.h, v = (py + 0.5) / this.k;
        const c = { x: v + u / 2, y: v - u / 2 };
        const x = Math.floor(c.x), y = Math.floor(c.y);
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue; // außerhalb: durchsichtig (schwarzer Rahmen)
        const k = y * g.w + x;
        const f = g.isOwned(x, y) ? 1 : FOREIGN;
        const o = (py * W + px) * 4;
        d[o] = col[k][0] * f; d[o + 1] = col[k][1] * f; d[o + 2] = col[k][2] * f; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    this.base = cv;
  }

  /** aufrufen, wenn sichtbar (z. B. alle 120 ms) */
  draw() {
    if (this.canvas.offsetParent === null || !this.fit()) return;
    const key = `${this.g.version}|${this.canvas.width}|${this.canvas.height}|${this.z}`;
    if (!this.base || key !== this.builtKey) { this.buildBase(); this.builtKey = key; }
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const sc = this.scene();
    // Ausschnitt folgt der Kamera (beim Ziehen festhalten, sonst springt er unter der Maus weg)
    if (sc && !this.dragging) {
      const v = sc.viewRect();
      const cu = (v.x + v.width / 2) / TILE + this.g.grid.h, cv = (v.y + v.height / 2) / TILE;
      this.ou = Math.max(0, Math.min(this.span - W / this.k, cu - W / (2 * this.k)));
      this.ov = Math.max(0, Math.min(this.span / 2 - H / this.k, cv - H / (2 * this.k)));
    }
    ctx.fillStyle = '#0b0a08';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.base!, Math.round(this.ou * this.k), Math.round(this.ov * this.k), W, H, 0, 0, W, H);
    if (!sc) return;
    // Züge als Punkte in Unternehmensfarbe
    const s = Math.max(3, Math.min(9, Math.round(this.k * 1.4)));
    for (const t of sc.trainHeads()) {
      const p = this.toPx(t.x, t.y);
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(p.px - s / 2) - 1, Math.round(p.py - s / 2) - 1, s + 2, s + 2);
      ctx.fillStyle = t.color;
      ctx.fillRect(Math.round(p.px - s / 2), Math.round(p.py - s / 2), s, s);
    }
    // sichtbarer Ausschnitt: auf der isometrischen Karte ein Rechteck
    const v = sc.viewRect();
    const x0 = (v.x / TILE + this.g.grid.h - this.ou) * this.k, y0 = (v.y / TILE - this.ov) * this.k;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, Math.round(this.k * 0.6));
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round((v.width / TILE) * this.k), Math.round((v.height / TILE) * this.k));
  }
}
