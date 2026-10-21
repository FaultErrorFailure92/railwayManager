import Phaser from 'phaser';
import { COST, MAP_H, MAP_W, PARCEL, START_PARCELS, TILE } from '../config';
import { Game } from '../game/Game';
import type { ToolId } from '../game/Missions';
import manifest from '../gen/manifest.json';
import { toScreen, toWorld } from '../iso';
import type { Train } from '../sim/Simulation';
import { ROCK, WATER } from '../world/Grid';
import { Animals, preloadAnimals } from './Animals';
import { SORT_DESTS } from '../sim/Operators';
import { BUILD_MENU, BUILDINGS } from '../world/buildings';
import { pointOnEdge } from '../world/Network';
import { PIECES_BY_GROUP } from '../world/pieces';
import { People } from './People';

type SpriteInfo = { file: string; ox: number; oy: number; w: number; h: number };
const SPRITES = manifest.sprites as Record<string, SpriteInfo>;
type XY = { x: number; y: number };

/** Fokus liegt in einem Eingabefeld → keine Tastenkürzel */
export const typing = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
};

export interface Variant { key: string; label: string; icon: string; cost?: number; info?: string }

/** Werkzeuge mit Varianten (R schaltet weiter); icon = Vorschaubild im Baumenü */
export const VARIANTS: Partial<Record<ToolId, Variant[]>> = {
  signal: [
    { key: 'E', label: 'Signal für Fahrtrichtung →', icon: 'signal_E' },
    { key: 'W', label: 'Signal für Fahrtrichtung ←', icon: 'signal_W' },
  ],
  switch: PIECES_BY_GROUP('switch').map((d) => ({ key: d.key, label: d.label, icon: `piece_${d.key}`, cost: d.cost })),
  curve: PIECES_BY_GROUP('curve').map((d) => ({ key: d.key, label: d.label, icon: `piece_${d.key}`, cost: d.cost })),
  diag: PIECES_BY_GROUP('diag').map((d) => ({ key: d.key, label: d.label, icon: `piece_${d.key}`, cost: d.cost })),
  building: BUILD_MENU.map((k) => ({ key: k, label: BUILDINGS[k].label, icon: k, cost: BUILDINGS[k].cost, info: BUILDINGS[k].effect })),
  access: [
    { key: 'tunnel', label: 'Personenunterführung', icon: 'access_tunnel', cost: COST.tunnel, info: 'von Bahnsteig zu Bahnsteig ziehen' },
    { key: 'bridge', label: 'Fußgängerbrücke', icon: 'access_bridge', cost: COST.bridge, info: 'von Bahnsteig zu Bahnsteig ziehen' },
  ],
  facility: [
    { key: 'mark_siding', label: 'Abstellgleis markieren', icon: 'mark_siding', cost: COST.marker, info: 'Wendezüge warten hier ihre Wendezeit ab' },
    ...['bld_remise', 'bld_workshop', 'bld_wash', 'bld_hump'].map((k) => ({ key: k, label: BUILDINGS[k].label, icon: k, cost: BUILDINGS[k].cost, info: BUILDINGS[k].effect })),
    ...SORT_DESTS.map((d, i) => ({ key: `mark_sort${i}`, label: `Richtungsgleis ${d.name}`, icon: `mark_sort${i}`, cost: COST.marker, info: 'Wagen dieser Farbe rollen hierher' })),
  ],
};

export interface UiState {
  tool: ToolId;
  variant: Partial<Record<ToolId, number>>;
  message: string;
  /** angeklicktes Empfangsgebäude (Umbenennen) */
  stationClick: number | null;
  /** Zug unter dem Mauszeiger + Bildschirmposition */
  hoverTrain: number | null;
  mouse: XY;
  /** Hauptmenü offen: Kamera schwenkt langsam */
  menu: boolean;
}

export const variantOf = (ui: UiState, tool = ui.tool) => {
  const v = VARIANTS[tool];
  return v ? v[(ui.variant[tool] ?? 0) % v.length] : undefined;
};

const D_GROUND = -100000;
const D_TRACK = -50000;
const D_OVERLAY = 90000;
const D_UI = 100000;
const DRAG_TOOLS: ToolId[] = ['platform', 'track', 'diag', 'wire', 'access', 'facility'];
const FONT = '"VT323", monospace';

export class GameScene extends Phaser.Scene {
  private builtVersion = -1;
  private overlayKey = '';
  private staticObjs: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] = [];
  private downAt: XY | null = null;
  private animals!: Animals;
  private buildingImgs = new Map<number, { key: string; x: number; y: number; img: Phaser.GameObjects.Image }>();
  private signals: { img: Phaser.GameObjects.Image; k: number; dir: 'E' | 'W' }[] = [];
  private trainSprites = new Map<number, Phaser.GameObjects.Image[]>();
  private lastTrainPos = new Map<number, XY>();
  private overlay!: Phaser.GameObjects.Graphics;
  private priceLabels: Phaser.GameObjects.Text[] = [];
  private hintGfx!: Phaser.GameObjects.Graphics;
  private hintArrow!: Phaser.GameObjects.Image;
  private hintCells: XY[] = [];
  private hintTimer = 0;
  private ghost!: Phaser.GameObjects.Graphics;
  private ghostImgs: Phaser.GameObjects.Image[] = [];
  private dragStart: XY | null = null;
  private hoverCell: XY | null = null;
  private panLast: XY | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private people!: People;
  private time0 = 0;

  constructor(private g: Game, private ui: UiState) {
    super('game');
  }

  preload() {
    for (const [name, s] of Object.entries(SPRITES)) this.load.image(name, `assets/gen/${s.file}`);
    const pm = manifest.people;
    this.load.spritesheet('people', `assets/gen/${pm.file}`, { frameWidth: pm.w, frameHeight: pm.h });
    const em = manifest.emotes;
    this.load.spritesheet('emotes', `assets/gen/${em.file}`, { frameWidth: em.w, frameHeight: em.h });
    preloadAnimals(this);
  }

  create() {
    this.buildGround();
    this.overlay = this.add.graphics().setDepth(D_OVERLAY);
    this.hintGfx = this.add.graphics().setDepth(D_OVERLAY + 1);
    this.hintArrow = this.add.image(0, 0, 'arrow').setOrigin(0.5, 1).setDepth(D_UI + 5).setVisible(false);
    this.ghost = this.add.graphics().setDepth(D_UI);
    this.people = new People(this, this.g);
    this.animals = new Animals(this, this.g);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#1b2130');
    cam.setZoom(2);
    const cx = ((START_PARCELS.x0 + START_PARCELS.x1 + 1) / 2) * PARCEL * TILE;
    const cy = ((START_PARCELS.y0 + START_PARCELS.y1 + 1) / 2) * PARCEL * TILE;
    const c = toScreen(cx, cy);
    cam.centerOn(c.x, c.y);
    const left = -MAP_H * TILE, right = MAP_W * TILE;
    cam.setBounds(left - 300, -300, right - left + 600, ((MAP_W + MAP_H) * TILE) / 2 + 600);

    this.setupInput();
  }

  /** Boden in Kacheln (große RenderTextures sind auf manchen Grafikkarten zu groß) */
  private buildGround() {
    const g = this.g.grid;
    const left = -MAP_H * TILE;
    const totalW = (MAP_W + MAP_H) * TILE, h = ((MAP_W + MAP_H) * TILE) / 2 + 20;
    const CHUNK = 2048;
    const n = (manifest as { groundVariants?: number }).groundVariants ?? 4;
    const s = SPRITES.ground_0;
    const water = (x: number, y: number) => !g.inside(x, y) || g.isWater(x, y);
    for (let cx = 0; cx < totalW; cx += CHUNK) {
      const w = Math.min(CHUNK, totalW - cx);
      const rt = this.add.renderTexture(left + cx, 0, w, h).setOrigin(0).setDepth(D_GROUND);
      rt.beginDraw();
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          const p = toScreen(x * TILE, y * TILE);
          const px = p.x + s.ox - left - cx;
          if (px < -40 || px > w + 8) continue;
          const t = g.terrain[g.key(x, y)];
          const hash = Math.abs((x * 7349 + y * 3571) ^ (x * y * 113));
          let frame: string;
          if (t === WATER) {
            const m = (water(x, y - 1) ? 0 : 1) | (water(x + 1, y) ? 0 : 2) | (water(x, y + 1) ? 0 : 4) | (water(x - 1, y) ? 0 : 8);
            frame = `water_${m}`;
          } else if (t === ROCK) frame = `rock_${hash % 4}`;
          else frame = `ground_${hash % n}`;
          rt.batchDrawFrame(frame, undefined, px, p.y + s.oy);
        }
      }
      rt.endDraw();
    }
  }

  private place(name: string, wx: number, wy: number, depth: number) {
    const s = SPRITES[name];
    const p = toScreen(wx, wy);
    return this.add.image(p.x + s.ox, p.y + s.oy, name).setOrigin(0).setDepth(depth);
  }

  private diamond(gfx: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, fill = true, stroke = false) {
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([wx, wy]) => {
      const p = toScreen(wx * TILE, wy * TILE);
      return new Phaser.Math.Vector2(p.x, p.y);
    });
    if (fill) gfx.fillPoints(pts, true);
    if (stroke) gfx.strokePoints(pts, true);
  }

  // ------------------------------------------------------------ Eingabe
  private cellAt(px: number, py: number): XY {
    const wp = this.cameras.main.getWorldPoint(px, py);
    const w = toWorld(wp.x, wp.y);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  /** Felder bzw. Anker + Variante für das aktuelle Werkzeug */
  private currentAction(): { cells: XY[]; variant: string } {
    const h = this.hoverCell;
    const t = this.ui.tool;
    const variant = variantOf(this.ui)?.key ?? '';
    if (!h || !this.g.grid.inside(h.x, h.y)) return { cells: [], variant };
    if (t === 'diag') {
      const s = this.dragStart ?? h;
      const d = this.g.diagSteps(s.x, s.y, h.x, h.y, variant);
      return { cells: d.anchors, variant: d.key };
    }
    const line = t === 'platform' || t === 'track' || t === 'wire' || t === 'access' || (t === 'facility' && variant.startsWith('mark_'));
    if (line && this.dragStart) {
      return { cells: this.g.lineCells(t, this.dragStart.x, this.dragStart.y, h.x, h.y), variant };
    }
    return { cells: [h], variant };
  }

  private setupInput() {
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-R', () => {
      if (typing() || this.ui.menu) return;
      if (VARIANTS[this.ui.tool]) this.ui.variant[this.ui.tool] = ((this.ui.variant[this.ui.tool] ?? 0) + 1) % VARIANTS[this.ui.tool]!.length;
    });
    this.input.keyboard!.on('keydown-ESC', () => { this.dragStart = null; });

    this.input.on('gameout', () => { this.ui.hoverTrain = null; this.hoverCell = null; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.ui.menu) return;
      if (p.rightButtonDown() || p.middleButtonDown() || this.ui.tool === 'select') {
        this.panLast = { x: p.x, y: p.y };
        this.downAt = p.leftButtonDown() ? { x: p.x, y: p.y } : null;
        return;
      }
      if (DRAG_TOOLS.includes(this.ui.tool)) this.dragStart = this.cellAt(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.hoverCell = this.cellAt(p.x, p.y);
      this.ui.mouse = { x: p.x, y: p.y };
      this.ui.hoverTrain = this.trainAt(p.x, p.y);
      if (this.panLast && p.isDown) {
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - this.panLast.x) / cam.zoom;
        cam.scrollY -= (p.y - this.panLast.y) / cam.zoom;
        this.panLast = { x: p.x, y: p.y };
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.panLast) {
        this.panLast = null;
        const d = this.downAt;
        this.downAt = null;
        if (d && Math.hypot(p.x - d.x, p.y - d.y) < 5 && this.ui.tool === 'select') {
          const c = this.cellAt(p.x, p.y);
          const id = c ? this.g.grid.get(c.x, c.y)?.building : null;
          if (id != null && this.g.grid.buildings.get(id)?.key === 'bld_station') this.ui.stationClick = id;
        }
        return;
      }
      if (p.button !== 0) return;
      this.hoverCell = this.cellAt(p.x, p.y);
      const a = this.currentAction();
      this.dragStart = null;
      if (!a.cells.length || this.ui.tool === 'select') return;
      const res = this.g.build(this.ui.tool, a.cells, a.variant);
      this.ui.message = res.ok ? '' : res.reason ?? '';
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + (dy > 0 ? -1 : 1), 1, 6));
    });
  }

  /** Zug unter einem Bildschirmpunkt (oberster Wagen) */
  private trainAt(px: number, py: number): number | null {
    const wp = this.cameras.main.getWorldPoint(px, py);
    let best: { id: number; d: number } | null = null;
    for (const [id, sprites] of this.trainSprites) {
      for (const img of sprites) {
        if (!img.visible) continue;
        if (wp.x >= img.x && wp.x <= img.x + img.width && wp.y >= img.y && wp.y <= img.y + img.height) {
          if (!best || img.depth > best.d) best = { id, d: img.depth };
        }
      }
    }
    return best?.id ?? null;
  }

  /** Kamera auf ein Feld richten (vom Auftrags-Panel aus) */
  focus(x: number, y: number) {
    const p = toScreen(x * TILE + 8, y * TILE + 8);
    this.cameras.main.pan(p.x, p.y, 400, 'Sine.easeInOut');
  }

  /** Kamera zum Zug */
  focusTrain(id: number) {
    const img = this.trainSprites.get(id)?.find((i) => i.visible);
    if (img) this.cameras.main.pan(img.x + img.width / 2, img.y + img.height / 2, 400, 'Sine.easeInOut');
  }

  get hint() { return this.hintCells; }

  peopleMood() { return this.people?.moodSummary(); }

  // ------------------------------------------------------------ Update
  update(time: number, delta: number) {
    this.time0 = time;
    const dt = Math.min(delta, 1000) / 1000;
    // bis 1 s nachholen, damit die Spielzeit auch bei wenigen FPS gleich schnell läuft
    this.g.tick(dt);

    const cam = this.cameras.main;
    if (this.ui.menu) cam.scrollX += delta * 0.012;
    const sp = (delta * 0.4) / cam.zoom;
    if (!typing()) {
      if (this.keys.A.isDown || this.keys.LEFT.isDown) cam.scrollX -= sp;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) cam.scrollX += sp;
      if (this.keys.W.isDown || this.keys.UP.isDown) cam.scrollY -= sp;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) cam.scrollY += sp;
    }

    if (this.builtVersion !== this.g.version) this.rebuildStatic();
    const ok = `${this.g.version}|${this.ui.tool}`;
    if (ok !== this.overlayKey) { this.overlayKey = ok; this.drawOverlay(); }
    this.updateSignals();
    this.updateTrains();
    this.people.update(dt);
    const wv = this.cameras.main.worldView;
    this.animals.update(dt, this.g.speed, this.g.paused, new Phaser.Geom.Rectangle(wv.x - 40, wv.y - 40, wv.width + 80, wv.height + 80));
    this.drawHint(dt);
    this.drawGhost();
    this.showFx();
  }

  private rebuildStatic() {
    this.builtVersion = this.g.version;
    this.staticObjs.forEach((o) => o.destroy());
    this.staticObjs = [];
    this.signals.forEach((s) => s.img.destroy());
    this.signals = [];
    const g = this.g.grid;
    const rail = (cc?: { track: boolean; piece: number | null }) => !!cc && (cc.track || cc.piece !== null);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.get(x, y)!;
        if (c.track && c.piece === null) this.staticObjs.push(this.place('track', x * TILE, y * TILE, D_TRACK + x + y));
        if ((c.track || c.piece !== null) && g.isWater(x, y)) this.staticObjs.push(this.place('rail_bridge', x * TILE, y * TILE, D_TRACK + x + y + 0.2));
        if (c.platform) {
          const cy = toScreen(x * TILE + 8, y * TILE + 8).y;
          const n = rail(g.get(x, y - 1)), s = rail(g.get(x, y + 1));
          const name = n && s ? 'platform_ns' : n ? 'platform_n' : s ? 'platform_s' : 'platform';
          this.staticObjs.push(this.place(name, x * TILE, y * TILE, cy + 0.3));
        }
        // Signale stehen rechts vom Gleis in Fahrtrichtung
        if (c.signal) {
          const wx = (x + 1) * TILE - 2, wy = y * TILE + 15;
          this.signals.push({ img: this.place('signal_red', wx, wy, toScreen(wx, wy).y + 0.1), k: g.key(x, y), dir: 'E' });
        }
        if (c.signalW) {
          const wx = x * TILE + 2, wy = y * TILE + 1;
          this.signals.push({ img: this.place('signal_red', wx, wy, toScreen(wx, wy).y + 0.1), k: g.key(x, y), dir: 'W' });
        }
      }
    }
    for (const p of g.pieces.values()) {
      this.staticObjs.push(this.place(`piece_${p.key}`, p.x * TILE, p.y * TILE, D_TRACK + p.x + p.y + 0.5));
    }
    // Gebäude & Natur: Bilder bleiben erhalten, solange sich nichts ändert (tausende Bäume)
    for (const [id, c] of this.buildingImgs) {
      const b = g.buildings.get(id);
      if (!b || b.key !== c.key || b.x !== c.x || b.y !== c.y) { c.img.destroy(); this.buildingImgs.delete(id); }
    }
    for (const b of g.buildings.values()) {
      const d = BUILDINGS[b.key];
      if (!this.buildingImgs.has(b.id)) {
        const fx = b.x + d.w - 1, fy = b.y + d.h - 1;
        let depth = toScreen(fx * TILE + 8, fy * TILE + 8).y + (d.onPlatform ? 0.32 : 0.3);
        if (b.key === 'bld_hump') depth = D_TRACK + b.x + b.y + 0.7;
        this.buildingImgs.set(b.id, { key: b.key, x: b.x, y: b.y, img: this.place(b.key, b.x * TILE, b.y * TILE, depth) });
      }
      if (b.name) {
        const c = toScreen((b.x + d.w / 2) * TILE, (b.y + d.h / 2) * TILE);
        const label = this.add.text(c.x, c.y - 30, b.name, {
          fontFamily: FONT, fontSize: '11px', color: '#ffe9a8', backgroundColor: '#1d3a6bdd', padding: { x: 4, y: 1 },
        }).setOrigin(0.5, 1).setResolution(4).setDepth(D_OVERLAY + 2);
        this.staticObjs.push(label);
      }
    }
    this.rebuildExtras();
  }

  /** Oberleitung, Prellböcke, Zugänge, Markierungen, Warnungen */
  private rebuildExtras() {
    const g = this.g.grid, net = this.g.net;
    const objDepth = (x: number, y: number, extra: number) => toScreen(x * TILE + 8, y * TILE + 8).y + extra;
    const into = new Set<string>();
    for (const e of net.edges.values()) into.add(e.to);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.get(x, y)!;
        if (!c.track || c.piece !== null) continue;
        // Oberleitung
        if (c.wire) {
          this.staticObjs.push(this.place('wire_span', x * TILE, y * TILE, objDepth(x, y, 0.45)));
          if (x % 2 === 0) this.staticObjs.push(this.place('wire_mast', x * TILE, y * TILE, objDepth(x, y, -0.6)));
        }
        // Prellböcke an Gleisenden
        if (!into.has(`ES:${x},${y}`)) this.staticObjs.push(this.place('buffer_W', x * TILE, y * TILE, objDepth(x, y, 0.1)));
        if (!net.out.has(`ES:${x + 1},${y}`)) this.staticObjs.push(this.place('buffer_E', x * TILE, y * TILE, objDepth(x, y, 0.1)));
        // Markierungen
        const mark = c.siding ? 'siding' : c.sortDest !== null ? `sort${c.sortDest}` : null;
        if (mark) {
          this.staticObjs.push(this.place(`mark_${mark}`, x * TILE, y * TILE, D_TRACK + x + y + 0.8));
          const prev = g.get(x - 1, y);
          const prevMark = prev && prev.track ? (prev.siding ? 'siding' : prev.sortDest !== null ? `sort${prev.sortDest}` : null) : null;
          if (prevMark !== mark) this.staticObjs.push(this.place(`sign_${mark}`, x * TILE, y * TILE, objDepth(x, y, 0.15)));
        }
      }
    }
    for (const p of g.pieces.values()) {
      if (g.pieceCells(p).every((k) => g.cells[k].wire)) {
        const fx = p.x + (p.key.startsWith('diag') ? 0 : 2), fy = p.y + 1;
        this.staticObjs.push(this.place(`wire_piece_${p.key}`, p.x * TILE, p.y * TILE, objDepth(fx, fy, 0.45)));
      }
    }
    for (const l of g.links.values()) {
      for (let y = l.y0; y <= l.y1; y++) {
        const end = y === l.y0 || y === l.y1;
        if (l.kind === 'tunnel') {
          if (end) this.staticObjs.push(this.place('tunnel_stairs', l.x * TILE, y * TILE, objDepth(l.x, y, 0.33)));
        } else {
          this.staticObjs.push(this.place(end ? 'bridge_tower' : 'bridge_deck', l.x * TILE, y * TILE, objDepth(l.x, y, end ? 0.34 : 12)));
        }
      }
    }
    // Bahnsteige ohne Zugang: Warnschild
    const seen = new Set<number>();
    g.cells.forEach((c, k) => {
      if (!c.platform || net.accessible.has(k) || seen.has(k)) return;
      const stack = [k], cl: number[] = [];
      seen.add(k);
      while (stack.length) {
        const cur = stack.pop()!;
        cl.push(cur);
        const { x, y } = g.xy(cur);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!g.inside(x + dx, y + dy)) continue;
          const nk = g.key(x + dx, y + dy);
          if (g.cells[nk].platform && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      const mid = g.xy(cl[Math.floor(cl.length / 2)]);
      const p = toScreen(mid.x * TILE + 8, mid.y * TILE + 8);
      const img = this.add.image(p.x, p.y - 8, 'warn').setOrigin(0.5, 1).setDepth(D_OVERLAY + 3);
      this.tweens.add({ targets: img, y: p.y - 13, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.staticObjs.push(img);
    });
  }

  /** dunkle Fläche = noch nicht gekauft; mit Werkzeug „Land“ Preise der kaufbaren Parzellen */
  private drawOverlay() {
    const g = this.g.grid;
    const gfx = this.overlay;
    gfx.clear();
    this.priceLabels.forEach((t) => t.destroy());
    this.priceLabels = [];
    const land = this.ui.tool === 'land';
    for (let py = 0; py < g.ph; py++) {
      for (let px = 0; px < g.pw; px++) {
        const x0 = px * PARCEL, y0 = py * PARCEL;
        if (!g.parcelOwned(px, py)) {
          const buy = land && g.parcelBuyable(px, py);
          gfx.fillStyle(buy ? 0xffe066 : 0x0b0e18, buy ? 0.16 : 0.38);
          this.diamond(gfx, x0, y0, x0 + PARCEL, y0 + PARCEL);
          if (buy) {
            gfx.lineStyle(1, 0xffe066, 0.9);
            this.diamond(gfx, x0 + 0.15, y0 + 0.15, x0 + PARCEL - 0.15, y0 + PARCEL - 0.15, false, true);
            const c = toScreen((x0 + PARCEL / 2) * TILE, (y0 + PARCEL / 2) * TILE);
            const t = this.add.text(c.x, c.y, `${g.parcelPrice(px, py).toLocaleString('de-AT')} €`, {
              fontFamily: FONT, fontSize: '12px', color: '#fff6c8', stroke: '#3a2a00', strokeThickness: 3,
            }).setOrigin(0.5).setResolution(3).setDepth(D_OVERLAY + 2);
            this.priceLabels.push(t);
          }
        }
      }
    }
    // Grenze der eigenen Fläche
    gfx.lineStyle(1.5, 0xfff2b0, 0.8);
    for (let py = 0; py < g.ph; py++) {
      for (let px = 0; px < g.pw; px++) {
        if (!g.parcelOwned(px, py)) continue;
        const x0 = px * PARCEL, y0 = py * PARCEL, x1 = x0 + PARCEL, y1 = y0 + PARCEL;
        const seg = (ax: number, ay: number, bx: number, by: number) => {
          const a = toScreen(ax * TILE, ay * TILE), b = toScreen(bx * TILE, by * TILE);
          gfx.lineBetween(a.x, a.y, b.x, b.y);
        };
        if (!g.parcelOwned(px, py - 1)) seg(x0, y0, x1, y0);
        if (!g.parcelOwned(px, py + 1)) seg(x0, y1, x1, y1);
        if (!g.parcelOwned(px - 1, py)) seg(x0, y0, x0, y1);
        if (!g.parcelOwned(px + 1, py)) seg(x1, y0, x1, y1);
      }
    }
  }

  private updateSignals() {
    const g = this.g.grid, own = this.g.sim.owner;
    const dirOf = new Map(this.g.sim.trains.map((t) => [t.id, t.dir]));
    for (const s of this.signals) {
      const { x, y } = g.xy(s.k);
      const a = own[s.k];
      const nx = s.dir === 'E' ? x + 1 : x - 1;
      const next = g.inside(nx, y) ? own[g.key(nx, y)] : a;
      const tex = a !== 0 && next === a && dirOf.get(a) === s.dir ? 'signal_green' : 'signal_red';
      if (s.img.texture.key !== tex) s.img.setTexture(tex);
    }
  }

  private worldOnTrain(t: Train, back: number) {
    const { i, d } = this.g.sim.posOnTrain(t, back);
    return pointOnEdge(t.route[i], d);
  }

  private updateTrains() {
    const alive = new Set<number>();
    for (const t of this.g.sim.trains) {
      alive.add(t.id);
      let sprites = this.trainSprites.get(t.id);
      if (!sprites) {
        sprites = t.cars.map(() => this.add.image(0, 0, 'track').setOrigin(0));
        this.trainSprites.set(t.id, sprites);
      }
      t.cars.forEach((kind, i) => {
        const back = (i + 0.5) * 16;
        const c = this.worldOnTrain(t, back);
        const a = this.worldOnTrain(t, back - 5), b = this.worldOnTrain(t, back + 5);
        const dx = a.x - b.x, dy = a.y - b.y;
        const o = Math.abs(dy) < 0.4 * Math.abs(dx) ? 0 : dx * dy > 0 ? 1 : 2;
        const key = `car_${t.op.id}_${kind}_${o}`;
        const s = SPRITES[key];
        const p = toScreen(c.x, c.y);
        const img = sprites![i];
        if (img.texture.key !== key) img.setTexture(key);
        img.setPosition(Math.round(p.x + s.ox), Math.round(p.y + s.oy)).setDepth(p.y + 0.2);
        const f = 1 - Math.max(0, t.dirt - 30) / 100 * 0.45;
        const hover = this.ui.hoverTrain === t.id;
        if (hover) img.setTintFill(0xffffff).setAlpha(0.999).setTint(0xfff2a0);
        else img.setTint(Phaser.Display.Color.GetColor(255 * f, 245 * f, 225 * f));
        img.setVisible(c.x > -4 && c.x < MAP_W * TILE + 4);
      });
    }
    for (const [id, sprites] of this.trainSprites) {
      if (!alive.has(id)) {
        const head = sprites[0];
        if (head) this.lastTrainPos.set(id, { x: head.x + head.width / 2, y: head.y });
        sprites.forEach((s) => s.destroy());
        this.trainSprites.delete(id);
      }
    }
  }

  /** pulsierende Markierung + hüpfender Pfeil für den aktuellen Auftrag */
  private drawHint(dt: number) {
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) { this.hintTimer = 0.5; this.hintCells = this.g.missionHint(); }
    const gfx = this.hintGfx;
    gfx.clear();
    if (!this.hintCells.length) { this.hintArrow.setVisible(false); return; }
    const pulse = 0.25 + 0.2 * Math.sin(this.time0 / 220);
    gfx.fillStyle(0xffd23c, pulse);
    gfx.lineStyle(1, 0xffd23c, 0.9);
    for (const c of this.hintCells) this.diamond(gfx, c.x, c.y, c.x + 1, c.y + 1, true, true);
    const first = this.hintCells[Math.floor(this.hintCells.length / 2)];
    const p = toScreen(first.x * TILE + 8, first.y * TILE + 8);
    this.hintArrow.setVisible(true).setPosition(p.x, p.y - 6 - Math.abs(Math.sin(this.time0 / 180)) * 6);
  }

  private drawGhost() {
    const gfx = this.ghost;
    gfx.clear();
    this.ghostImgs.forEach((i) => i.setVisible(false));
    const tool = this.ui.tool;
    if (tool === 'select' || !this.hoverCell) return;
    const a = this.currentAction();
    if (!a.cells.length) { this.ui.message = ''; return; }
    const plan = this.g.plan(tool, a.cells, a.variant);
    const col = plan.ok ? (tool === 'remove' ? 0xffa040 : 0x7dff8a) : 0xff4b4b;
    gfx.lineStyle(2 / this.cameras.main.zoom, col, 1);
    gfx.fillStyle(col, 0.18);
    for (const c of plan.cells) this.diamond(gfx, c.x, c.y, c.x + 1, c.y + 1, true, true);
    const ghostImg = (i: number, name: string, wx: number, wy: number) => {
      let img = this.ghostImgs[i];
      if (!img) {
        img = this.add.image(0, 0, 'track').setOrigin(0).setAlpha(0.65).setDepth(D_UI - 1);
        this.ghostImgs.push(img);
      }
      const s = SPRITES[name];
      const p = toScreen(wx, wy);
      img.setTexture(name).setPosition(p.x + s.ox, p.y + s.oy).setVisible(true);
    };
    if (tool === 'switch' || tool === 'curve' || tool === 'diag') {
      a.cells.forEach((c, i) => ghostImg(i, `piece_${a.variant}`, c.x * TILE, c.y * TILE));
    }
    if (tool === 'building' || (tool === 'facility' && !a.variant.startsWith('mark_'))) ghostImg(0, a.variant, a.cells[0].x * TILE, a.cells[0].y * TILE);
    if (tool === 'signal') {
      const c = a.cells[0];
      const [wx, wy] = a.variant === 'W' ? [c.x * TILE + 2, c.y * TILE + 1] : [(c.x + 1) * TILE - 2, c.y * TILE + 15];
      ghostImg(0, 'signal_green', wx, wy);
    }
    this.ui.message = plan.ok ? `${plan.cost < 0 ? '+' : plan.cost > 0 ? '−' : ''}${Math.abs(plan.cost).toLocaleString('de-AT')} €` : plan.reason ?? '';
  }

  /** schwebende Beträge (Bauen, Züge, Kiosk) */
  private showFx() {
    for (const f of this.g.fx.splice(0)) {
      let p: XY;
      if (f.train !== undefined) {
        const img = this.trainSprites.get(f.train)?.[0];
        p = img ? { x: img.x + img.width / 2, y: img.y } : this.lastTrainPos.get(f.train) ?? { x: NaN, y: NaN };
        if (Number.isNaN(p.x)) continue;
      } else {
        const q = toScreen(f.x * TILE + 8, f.y * TILE + 8);
        p = { x: q.x, y: q.y - 6 };
      }
      const big = f.train !== undefined;
      const txt = `${f.amount >= 0 ? '+' : '−'}${Math.abs(f.amount).toLocaleString('de-AT')} €${f.label ? `\n${f.label}` : ''}`;
      const t = this.add.text(p.x, p.y, txt, {
        fontFamily: FONT, fontSize: big ? '13px' : '11px', align: 'center', lineSpacing: -3,
        color: f.amount >= 0 ? '#9dff8a' : '#ff6a5a', stroke: '#140c06', strokeThickness: 3,
      }).setOrigin(0.5, 1).setResolution(4).setDepth(D_UI + 10).setScale(0.6);
      this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: p.y - 28, alpha: 0, delay: big ? 1300 : 700, duration: 1100, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
    }
  }
}
