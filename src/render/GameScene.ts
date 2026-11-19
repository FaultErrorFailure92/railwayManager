import Phaser from 'phaser';
import { settings } from '../game/settings';
import { COST, MAIN_ROW, MAP_H, MAP_W, PARCEL, START_PARCELS, TILE } from '../config';
import { Game } from '../game/Game';
import { elements, wearOf } from '../game/Wear';
import type { ToolId } from '../game/Missions';
import manifest from '../gen/manifest.json';
import { ATLAS, ATLAS_OK } from './atlas';
import { SimClock } from '../game/SimClock';
import { toScreen, toWorld } from '../iso';
import type { Train } from '../sim/Simulation';
import { ROCK, WATER } from '../world/Grid';
import { isStation, SHOPS } from '../world/buildings';
import { Animals, preloadAnimals } from './Animals';
import { OP_DEFAULTS, OP_OVERRIDES, OPERATORS, SORT_DESTS, type OperatorId } from '../sim/Operators';
import { BUILD_MENU, BUILDINGS } from '../world/buildings';
import { pointOnEdge } from '../world/Network';
import { PIECES, PIECES_BY_GROUP } from '../world/pieces';
import { People } from './People';
import { Lighting } from './Lighting';
import { Weather } from './Weather';
import { Sound } from './Sound';
import { currentMap } from '../world/maps';

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
    { key: 'SE', label: 'Rangiersignal → (nur im Rangierbereich)', icon: 'shsig_E', cost: COST.shuntSignal },
    { key: 'SW', label: 'Rangiersignal ← (nur im Rangierbereich)', icon: 'shsig_W', cost: COST.shuntSignal },
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
    { key: 'mark_shunt', label: 'Rangierbereich markieren', icon: 'mark_shunt', cost: COST.marker, info: 'Schrittgeschwindigkeit, Rangiersignale erlaubt' },
    { key: 'mark_siding', label: 'Abstellgleis markieren', icon: 'mark_siding', cost: COST.marker, info: 'Wendezüge warten hier ihre Wendezeit ab' },
    ...['bld_remise', 'bld_workshop', 'bld_wash', 'bld_hump'].map((k) => ({ key: k, label: BUILDINGS[k].label, icon: k, cost: BUILDINGS[k].cost, info: BUILDINGS[k].effect })),
    ...SORT_DESTS.map((d, i) => ({ key: `mark_sort${i}`, label: `Richtungsgleis ${d.name}`, icon: `mark_sort${i}`, cost: COST.marker, info: 'Wagen dieser Farbe rollen hierher' })),
  ],
  // Kopieren und Vorlagen (RM-FR-BUILD-13)
  copy: [
    { key: 'copy', label: 'Bereich kopieren', icon: 'tool_cursor', info: 'Fläche aufziehen: eigene Gleise, Weichen, Signale, Bahnsteige und Fahrdraht werden Vorlage 1' },
    ...[1, 2, 3].map((i) => ({ key: `tpl${i}`, label: `Vorlage ${i} einfügen`, icon: 'track', info: 'Klicken: links oben einfügen. Die neueste Kopie ist immer Vorlage 1' })),
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
  /** Fahrgast unter dem Mauszeiger bzw. per langem Druck gewählt (RM-FR-EVT-06) */
  hoverPerson?: number | null;
  mouse: XY;
  /** Hauptmenü offen: Kamera schwenkt langsam */
  menu: boolean;
  /** Zug auf der Karte angeklickt (Bildschirmposition) */
  trainClick?: { id: number; x: number; y: number } | null;
  /** Fahrgast angeklickt (Objektkarte, RM-FR-CPX-04) */
  personClick?: number | null;
  /** eingeblendete Ebene (RM-FR-UI-12) */
  layer?: Layer;
}

/** Ebenen-Ansicht (RM-FR-UI-12) – Taste Ü schaltet weiter */
export type Layer = 'occupancy' | 'pax' | 'mood' | 'wear';
export const LAYERS: { id: Layer; name: string; legend: [string, string][] }[] = [
  { id: 'occupancy', name: 'Gleisbelegung', legend: [['#3fa34d', 'frei'], ['#ffb02e', 'belegt oder für einen Zug reserviert'], ['#d9534f', 'Störung']] },
  { id: 'pax', name: 'Fahrgäste', legend: [['#4da3ff', 'wenige'], ['#ffd23f', 'viele'], ['#ff6a3d', 'Gedränge']] },
  { id: 'mood', name: 'Stimmung', legend: [['#3fa34d', 'zufrieden'], ['#ffd23f', 'ungeduldig'], ['#d9534f', 'sauer']] },
  { id: 'wear', name: 'Instandhaltung', legend: [['#3fa34d', 'Weiche/Signal neu'], ['#ffd23f', 'abgenutzt'], ['#d9534f', 'fällt bald aus · Zug muss in die Werkstatt']] },
];

export const variantOf = (ui: UiState, tool = ui.tool) => {
  const v = VARIANTS[tool];
  return v ? v[(ui.variant[tool] ?? 0) % v.length] : undefined;
};

const D_GROUND = -100000;
const D_TRACK = -50000;
const D_OVERLAY = 90000;
const D_UI = 100000;
const DRAG_TOOLS: ToolId[] = ['platform', 'track', 'diag', 'wire', 'access', 'facility', 'road', 'remove', 'copy'];
/** Gebäude mit Infofenster beim Anklicken */
const PANEL_BUILDING = (k?: string) => !!k && (isStation(k) || !!SHOPS[k]);
/** Nebel: ab so vielen Feldern Abstand zur eigenen Fläche, voll nach weiteren … */
const FOG_START = 4, FOG_FULL = 9;
const FONT = '"VT323", monospace';
/** Schriftgrößen der Beschriftungen auf der Karte in Bildschirm-Pixeln – unabhängig vom Zoom */
const LABEL_PX = { price: 22, station: 16, cost: 16, platform: 14, fx: 16, fxBig: 18 };

export class GameScene extends Phaser.Scene {
  private builtVersion = -1;
  private clock = new SimClock((d) => this.g.tick(d));
  private overlayKey = '';
  private staticObjs: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] = [];
  private downAt: XY | null = null;
  private animals!: Animals;
  private buildingImgs = new Map<number, { key: string; x: number; y: number; rot?: boolean; img: Phaser.GameObjects.Image }>();
  private signals: { img: Phaser.GameObjects.Image; k: number; dir: 'E' | 'W'; sh?: boolean; mark?: Phaser.GameObjects.Text }[] = [];
  private trainSprites = new Map<number, Phaser.GameObjects.Image[]>();
  private lastTrainPos = new Map<number, XY>();
  private overlay!: Phaser.GameObjects.Graphics;
  private layerGfx!: Phaser.GameObjects.Graphics;
  private layerNext = 0;
  private layerOn = false;
  private priceLabels: Phaser.GameObjects.Text[] = [];
  /** Beschriftungen mit fester Bildschirmgröße (werden mit 1/Zoom skaliert) */
  private fixedLabels = new Set<Phaser.GameObjects.Text>();
  private fixedSize<T extends Phaser.GameObjects.Text>(t: T): T {
    this.fixedLabels.add(t);
    t.once('destroy', () => this.fixedLabels.delete(t));
    return t.setScale(1 / this.cameras.main.zoom);
  }
  private hintGfx!: Phaser.GameObjects.Graphics;
  private hintArrow!: Phaser.GameObjects.Image;
  private hintCells: XY[] = [];
  private hintTimer = 0;
  private ghost!: Phaser.GameObjects.Graphics;
  private ghostImgs: Phaser.GameObjects.Image[] = [];
  /** Kosten am Mauszeiger (RM-FR-BUILD-14) */
  private costTag!: Phaser.GameObjects.Text;
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
    // beim Laden ohne Neuladen (RM-FR-PERF-04) sind die Bilder schon da
    if (this.textures.exists('people')) return;
    // Ladebildschirm füttern
    const bar = document.getElementById('ld-bar');
    this.load.on('progress', (v: number) => { if (bar) bar.style.width = `${Math.round(v * 100)}%`; });
    // alle Einzelbilder in einem Textur-Atlas (RM-FR-PERF-02): ein Bild, weniger Texturwechsel beim Zeichnen
    if (ATLAS_OK) this.load.atlas(ATLAS, `assets/atlas/${ATLAS}.png`, `assets/atlas/${ATLAS}.json`);
    else for (const [name, s] of Object.entries(SPRITES)) this.load.image(name, `assets/gen/${s.file}`);
    const pm = manifest.people;
    this.load.spritesheet('people', `assets/gen/${pm.file}`, { frameWidth: pm.w, frameHeight: pm.h });
    const em = manifest.emotes;
    this.load.spritesheet('emotes', `assets/gen/${em.file}`, { frameWidth: em.w, frameHeight: em.h });
    preloadAnimals(this);
  }

  create() {
    this.buildGround();
    // Spiel steht: Ladebildschirm ausblenden
    requestAnimationFrame(() => {
      document.body.classList.add('ready');
      const ld = document.getElementById('loading');
      ld?.classList.add('done');
      setTimeout(() => ld?.remove(), 500);
    });
    this.overlay = this.add.graphics().setDepth(D_OVERLAY);
    this.layerGfx = this.add.graphics().setDepth(D_OVERLAY + 1);
    this.hintGfx = this.add.graphics().setDepth(D_OVERLAY + 1);
    this.hintArrow = this.img(0, 0, 'arrow').setOrigin(0.5, 1).setDepth(D_UI + 5).setVisible(false);
    this.ghost = this.add.graphics().setDepth(D_UI);
    this.costTag = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: `${LABEL_PX.cost}px`, color: '#9dff8a', backgroundColor: '#140c06dd', padding: { x: 3, y: 0 },
    }).setOrigin(0, 1).setResolution(2).setDepth(D_UI + 6).setVisible(false);
    this.fixedSize(this.costTag);
    this.people = new People(this, this.g);
    this.lighting = new Lighting(this, this.g, D_OVERLAY - 10);
    this.weatherFx = new Weather(this, this.g, D_OVERLAY - 8);
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
    const gk = currentMap().ground ? `ground_${currentMap().ground}_` : 'ground_';
    const water = (x: number, y: number) => !g.inside(x, y) || g.isWater(x, y);
    const atlas = this.textures.exists(ATLAS);
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
          else frame = `${gk}${hash % n}`;
          if (atlas) rt.batchDrawFrame(ATLAS, frame, px, p.y + s.oy);
          else rt.batchDrawFrame(frame, undefined, px, p.y + s.oy);
        }
      }
      rt.endDraw();
      const tint = currentMap().tint;
      if (tint !== 0xffffff) rt.setTint(tint);
    }
  }

  /** eigene Lackierung (RM-FR-MOD-01): Farbton der Vorlage auf die eigene Farbe drehen, Helligkeit bleibt */
  private painted = new Map<string, string>();
  private paintKey(op: OperatorId, base: string) {
    const own = OP_OVERRIDES[op];
    if (!own || own.color === OP_DEFAULTS[op].color) return base;
    const key = `${base}_p${own.color.slice(1)}`;
    if (this.painted.get(base) === key && this.textures.exists(key)) return key;
    if (!this.textures.exists(key)) {
      const fr = this.textures.exists(base) ? this.textures.getFrame(base) : this.textures.getFrame(ATLAS, base);
      const w = fr.cutWidth, h = fr.cutHeight;
      const tex = this.textures.createCanvas(key, w, h);
      if (!tex) return base;
      const ctx = tex.getContext();
      ctx.drawImage(fr.source.image as HTMLImageElement, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const from = hsl(OP_DEFAULTS[op].color), to = hsl(own.color);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const [h, sat, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        // nur die Lackfarbe (ähnlicher Farbton, deutlich bunt) – Fenster, Dach und Fahrwerk bleiben
        if (sat < 0.22 || Math.min(Math.abs(h - from[0]), 1 - Math.abs(h - from[0])) > 0.07) continue;
        const nl = Math.max(0, Math.min(1, l + (to[2] - from[2]) * 0.7));
        const [r, g, b] = hslToRgb(to[0], Math.min(1, to[1] * (sat / Math.max(0.01, from[1]))), nl);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    this.painted.set(base, key);
    return key;
  }

  /** Bahnübergänge und Autos auf den öffentlichen Straßen (RM-FR-MAP-08) */
  private crossings: { k: number; img: Phaser.GameObjects.Image; closed: boolean }[] = [];
  private roadSegs?: { x: number; y0: number; y1: number }[];
  private cars: { img: Phaser.GameObjects.Image; seg: number; y: number; dir: 1 | -1 }[] = [];
  private moveTraffic(delta: number) {
    const g = this.g.grid, sim = this.g.sim;
    const shut = new Set<number>();
    for (const c of this.crossings) {
      const closed = sim.owner[c.k] !== 0;
      if (closed) shut.add(c.k);
      if (closed !== c.closed) { c.closed = closed; this.setTex(c.img, closed ? 'xing_closed' : 'xing_open'); }
    }
    if (!this.roadSegs) {
      // zusammenhängendes Straßenstück rund um die Strecke je öffentlicher Straße
      this.roadSegs = [];
      for (const x of currentMap().roads ?? []) {
        if (!g.get(x, MAIN_ROW)?.road) continue;
        let y0 = MAIN_ROW, y1 = MAIN_ROW;
        while (g.get(x, y0 - 1)?.road) y0--;
        while (g.get(x, y1 + 1)?.road) y1++;
        if (y1 - y0 >= 6) this.roadSegs.push({ x, y0, y1 });
      }
      const want = this.roadSegs.length * 4;
      while (this.cars.length > want) this.cars.pop()!.img.destroy();
      while (this.cars.length < want) {
        const i = this.cars.length, seg = Math.floor(i / 4), sg = this.roadSegs[seg];
        const kinds = currentMap().vehicles ?? ['auto_0', 'auto_1', 'auto_2', 'auto_3'];
        this.cars.push({ img: this.img(0, 0, kinds[i % kinds.length]).setOrigin(0), seg, y: sg.y0 + ((i * 7.3) % (sg.y1 - sg.y0)), dir: i % 2 ? 1 : -1 });
      }
      this.cars.forEach((c, i) => { c.seg = Math.floor(i / 4); });
    }
    const run = !this.g.paused;
    const step = (delta / 1000) * 1.6 * Math.min(4, this.g.speed);
    const sp = SPRITES.auto_0;
    for (const c of this.cars) {
      const sg = this.roadSegs[c.seg];
      if (!sg) { c.img.setVisible(false); continue; }
      if (run) {
        const ahead = Math.floor(c.y + c.dir * 0.9);
        const blocked = shut.has(g.key(sg.x, ahead)) && !shut.has(g.key(sg.x, Math.floor(c.y)))
          || this.cars.some((o) => o !== c && o.seg === c.seg && o.dir === c.dir && (o.y - c.y) * c.dir > 0 && (o.y - c.y) * c.dir < 1.1);
        if (!blocked) c.y += c.dir * step;
        if (c.y > sg.y1 + 0.9) c.y = sg.y0 - 0.5;
        if (c.y < sg.y0 - 0.9) c.y = sg.y1 + 0.5;
      }
      const wx = sg.x * TILE + (c.dir === 1 ? -2.5 : 2.5), wy = c.y * TILE;
      const p = toScreen(wx, wy);
      c.img.setVisible(true).setPosition(p.x + sp.ox, p.y + sp.oy).setDepth(toScreen(wx + 8, wy + 8).y + 0.4);
    }
  }

  /** Hochbahn-Zug (RM-FR-MAP-11): zwei Wagen pendeln über die Hochbahn, unabhängig vom Spielbetrieb */
  private metro?: { cars: Phaser.GameObjects.Image[]; pos: number; dir: 1 | -1; wait: number };
  private moveMetro(delta: number) {
    const v = currentMap().viaducts?.[0];
    if (!v) { if (this.metro) { this.metro.cars.forEach((c) => c.destroy()); this.metro = undefined; } return; }
    if (!this.metro) this.metro = { cars: [0, 1].map(() => this.img(0, 0, 'viaduct_car').setOrigin(0)), pos: v.y0, dir: 1, wait: 0 };
    const m = this.metro, len = 2;
    if (this.g.paused) return;
    if (m.wait > 0) m.wait -= delta * this.g.speed;
    else {
      m.pos += m.dir * delta * 0.004 * Math.min(4, this.g.speed);
      if (m.pos > v.y1 - len + 1 || m.pos < v.y0) { m.pos = Math.max(v.y0, Math.min(v.y1 - len + 1, m.pos)); m.dir = m.dir === 1 ? -1 : 1; m.wait = 12000; }
    }
    const s = SPRITES.viaduct_car;
    m.cars.forEach((c, i) => {
      const y = m.pos + i;
      const p = toScreen(v.x * TILE, y * TILE);
      c.setPosition(p.x + s.ox, p.y + s.oy).setDepth(toScreen(v.x * TILE + 8, y * TILE + 8).y + 14.5);
    });
  }

  private place(name: string, wx: number, wy: number, depth: number) {
    const s = SPRITES[name];
    const p = toScreen(wx, wy);
    const img = this.img(p.x + s.ox, p.y + s.oy, name).setOrigin(0).setDepth(depth);
    if (this.animCells.size) this.animate(img, name, Math.floor(wx / TILE), Math.floor(wy / TILE));
    return img;
  }

  // ------------------------------------------------------------ Bauanimationen (RM-FR-FEEL-02)
  /** Feld → Startzeit der Animation (scene time) */
  private animCells = new Map<number, number>();

  /** Bau-Ereignisse aus dem Spiel abholen: Felder der Reihe nach animieren, Abriss staubt */
  private takeBuildEvents() {
    const evs = this.g.buildEvents.splice(0);
    if (evs.some((e) => e.remove)) Sound.crunch();
    if (evs.some((e) => !e.remove)) Sound.snap();
    if (!settings.anim) return;
    const now = this.time.now;
    for (const [k, t0] of this.animCells) if (now - t0 > 2000) this.animCells.delete(k);
    for (const e of evs) {
      const seen = new Set<number>();
      const cells = e.cells.filter((c) => { const k = this.g.grid.key(c.x, c.y); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.x - b.x || a.y - b.y);
      // alles zusammen höchstens ~1,2 s
      const step = Math.min(70, 900 / Math.max(1, cells.length));
      cells.forEach((c, i) => {
        if (e.remove) this.dust(c.x, c.y, i * step);
        else this.animCells.set(this.g.grid.key(c.x, c.y), now + i * step);
      });
    }
  }

  private animate(img: Phaser.GameObjects.Image, name: string, cx: number, cy: number) {
    const start = this.animCells.get(this.g.grid.key(cx, cy));
    // nur frisch Gebautes; bei späterem Neuzeichnen nicht noch einmal
    if (start === undefined || start < this.time.now - 30) return;
    const delay = Math.max(0, start - this.time.now);
    if (name.startsWith('bld_')) {
      // Gebäude wächst von unten aus dem Gerüst
      const h = img.height, w = img.width;
      img.setCrop(0, h, w, 0);
      const st = { v: 0 };
      this.tweens.add({ targets: st, v: 1, delay, duration: 900, ease: 'Sine.easeOut',
        onUpdate: () => { const v = Math.round(st.v * h); img.setCrop(0, h - v, w, v); },
        onComplete: () => { img.setCrop(); } });
      this.dust(cx, cy, delay + 850, 6);
    } else {
      // Schwellen, Schienen, Masten: von oben einsetzen
      const y = img.y;
      img.setAlpha(0).setY(y - 10);
      this.tweens.add({ targets: img, y, alpha: 1, delay, duration: 220, ease: 'Back.easeOut' });
    }
  }

  /** kleine Staubwolke auf einem Feld */
  private dust(cx: number, cy: number, delay = 0, n = 4) {
    const c = toScreen(cx * TILE + 8, cy * TILE + 8);
    for (let i = 0; i < n; i++) {
      const puff = this.add.circle(c.x + (Math.random() - 0.5) * 12, c.y + (Math.random() - 0.5) * 6, 2 + Math.random() * 2, 0xcfc6b4, 0.8)
        .setDepth(D_UI - 2).setAlpha(0);
      this.tweens.add({ targets: puff, alpha: { from: 0.8, to: 0 }, scale: { from: 1, to: 2.4 }, y: puff.y - 6 - Math.random() * 6,
        delay: delay + i * 40, duration: 600, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
    }
  }

  /** Bild aus dem Textur-Atlas (RM-FR-PERF-02); eigene Texturen (z. B. Lackierung) haben Vorrang */
  private img(x: number, y: number, name: string) {
    return this.textures.exists(name) ? this.add.image(x, y, name) : this.add.image(x, y, ATLAS, name);
  }

  /** Bild tauschen – nur, wenn es sich ändert */
  private setTex(img: Phaser.GameObjects.Image, name: string) {
    if (this.textures.exists(name)) { if (img.texture.key !== name) img.setTexture(name); }
    else if (img.texture.key !== ATLAS || img.frame.name !== name) img.setTexture(ATLAS, name);
    return img;
  }

  /** gedrehtes Gebäude: an der oberen Ecke gespiegelt (x und y tauschen) */
  private mirror(img: Phaser.GameObjects.Image, name: string, wx: number, wy: number) {
    const s = SPRITES[name];
    const p = toScreen(wx, wy);
    img.setFlipX(true).setX(p.x - s.ox - s.w);
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
    // Gleis: schräg gezogen = Diagonale (mit automatischer Kreuzung)
    if (t === 'track' && this.dragStart && h.y !== this.dragStart.y) return { cells: [this.dragStart, h], variant };
    // Abriss: Rechteck aufziehen
    if ((t === 'remove' || (t === 'copy' && variant === 'copy')) && this.dragStart) {
      const x0 = Math.min(this.dragStart.x, h.x), x1 = Math.max(this.dragStart.x, h.x);
      const y0 = Math.min(this.dragStart.y, h.y), y1 = Math.max(this.dragStart.y, h.y);
      const out: XY[] = [];
      for (let y = y0; y <= y1 && out.length < 600; y++) for (let x = x0; x <= x1; x++) if (this.g.grid.inside(x, y)) out.push({ x, y });
      return { cells: out, variant };
    }
    const line = t === 'platform' || t === 'track' || t === 'wire' || t === 'road' || t === 'access' || (t === 'facility' && variant.startsWith('mark_'));
    if (line && this.dragStart) {
      return { cells: this.g.lineCells(t, this.dragStart.x, this.dragStart.y, h.x, h.y), variant };
    }
    return { cells: [h], variant };
  }

  private setupInput() {
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    // R (drehen) und T (Variante) behandelt die Oberfläche (BuildMenu.ts)
    this.input.keyboard!.on('keydown-ESC', () => { this.dragStart = null; });

    this.input.on('gameout', () => { this.ui.hoverTrain = null; this.hoverCell = null; if (!this.personPinned) this.ui.hoverPerson = null; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.ui.menu) return;
      // langer Druck (Tablet) zeigt einen Fahrgast
      this.personPinned = false;
      this.pressAt = p.wasTouch && this.ui.tool === 'select' ? { x: p.x, y: p.y, t: this.time.now } : null;
      if (p.rightButtonDown() || p.middleButtonDown() || this.ui.tool === 'select') {
        this.panLast = { x: p.x, y: p.y };
        this.downAt = p.leftButtonDown() ? { x: p.x, y: p.y } : null;
        return;
      }
      if (DRAG_TOOLS.includes(this.ui.tool)) this.dragStart = this.cellAt(p.x, p.y);
    });
    // Tablet (RM-FR-Q-04): zweiter Finger – mit zwei Fingern verschieben und zoomen
    this.input.addPointer(1);
    let pinch: { d: number; mx: number; my: number } | null = null;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1?.isDown && p2?.isDown) {
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const cam = this.cameras.main;
        if (pinch) {
          cam.scrollX -= (mx - pinch.mx) / cam.zoom;
          cam.scrollY -= (my - pinch.my) / cam.zoom;
          // ganze Zoomstufen (Pixelgrafik): erst bei deutlicher Fingerbewegung
          if (d / pinch.d > 1.3 && cam.zoom < 6) { cam.setZoom(cam.zoom + 1); pinch.d = d; }
          else if (d / pinch.d < 0.77 && cam.zoom > 1) { cam.setZoom(cam.zoom - 1); pinch.d = d; }
          pinch.mx = mx; pinch.my = my;
        } else pinch = { d, mx, my };
        // kein Bauen und kein Verschieben mit einem Finger, solange zwei liegen
        this.dragStart = null; this.panLast = null; this.downAt = null; this.pressAt = null;
        return;
      }
      if (pinch && !(p1?.isDown || p2?.isDown)) pinch = null;
      this.hoverCell = this.cellAt(p.x, p.y);
      this.ui.mouse = { x: p.x, y: p.y };
      this.ui.hoverTrain = this.trainAt(p.x, p.y);
      if (this.pressAt && Math.hypot(p.x - this.pressAt.x, p.y - this.pressAt.y) > 8) this.pressAt = null;
      if (!this.personPinned) this.ui.hoverPerson = this.personAt(p.x, p.y);
      if (this.panLast && p.isDown) {
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - this.panLast.x) / cam.zoom;
        cam.scrollY -= (p.y - this.panLast.y) / cam.zoom;
        this.panLast = { x: p.x, y: p.y };
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (pinch) { if (!this.input.pointer1?.isDown && !this.input.pointer2?.isDown) pinch = null; this.dragStart = null; return; }
      if (this.panLast) {
        this.panLast = null;
        const d = this.downAt;
        this.downAt = null;
        if (d && Math.hypot(p.x - d.x, p.y - d.y) < 5 && this.ui.tool === 'select') {
          const tr = this.trainAt(p.x, p.y);
          if (tr !== null) { this.ui.trainClick = { id: tr, x: p.x, y: p.y }; return; }
          const pid = this.personAt(p.x, p.y);
          if (pid !== null && pid !== undefined) { this.ui.personClick = pid; return; }
          const c = this.cellAt(p.x, p.y);
          if (c && this.g.repairFault(c.x, c.y)) return;
          const id = c ? this.g.grid.get(c.x, c.y)?.building : null;
          if (id != null && PANEL_BUILDING(this.g.grid.buildings.get(id)?.key)) this.ui.stationClick = id;
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
    // Mausrad/Trackpad: Bewegung sammeln, erst nach einer ganzen Raststufe zoomen, dann kurz Pause
    let wheelAcc = 0, wheelBlock = 0;
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const now = this.time.now;
      if (now < wheelBlock) { wheelAcc = 0; return; }
      wheelAcc += dy;
      if (Math.abs(wheelAcc) < 100) return;
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + (wheelAcc > 0 ? -1 : 1), 1, 6));
      wheelAcc = 0;
      wheelBlock = now + 220;
    });
  }

  /**
   * Controller (RM-FR-PAD-01): linker Stick verschiebt die Karte, LB/RB zoomen,
   * A = Pause, X = schneller, Y = Fahrplan, B = Werkzeug weg, Start = Menü.
   */
  private padPrev: boolean[] = [];
  private pollGamepad(dt: number) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((x) => x && x.connected);
    if (!gp) return;
    const cam = this.cameras.main;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const sx = dz(gp.axes[0] ?? 0) + dz(gp.axes[2] ?? 0), sy = dz(gp.axes[1] ?? 0) + dz(gp.axes[3] ?? 0);
    const sp = (900 * dt * (settings.scroll / 100)) / cam.zoom;
    cam.scrollX += sx * sp;
    cam.scrollY += sy * sp;
    const pressed = gp.buttons.map((b) => b.pressed);
    const hit = (i: number) => pressed[i] && !this.padPrev[i];
    const key = (k: string, code = '') => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code }));
    if (hit(4)) cam.setZoom(Math.max(1, cam.zoom - 1));
    if (hit(5)) cam.setZoom(Math.min(6, cam.zoom + 1));
    if (hit(0)) key(' ', 'Space');
    if (hit(2)) key('+');
    if (hit(3)) key(settings.keys.timetable);
    if (hit(1)) key('Escape');
    if (hit(9)) key('Escape');
    this.padPrev = pressed;
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

  // ------------------------------------------------------------ Minimap (RM-FR-UI-11)
  /** Kamera sofort auf ein Feld setzen */
  centerOnCell(x: number, y: number) {
    const p = toScreen(x * TILE, y * TILE);
    this.cameras.main.centerOn(p.x, p.y);
  }

  /** sichtbarer Ausschnitt (isometrische Bildschirm-Koordinaten der Welt) */
  viewRect() {
    const v = this.cameras.main.worldView;
    return { x: v.x, y: v.y, width: v.width, height: v.height };
  }

  /** Zugspitzen in Feldern */
  trainHeads() {
    return this.g.sim.trains.filter((t) => t.route.length).map((t) => {
      const c = this.worldOnTrain(t, 8);
      return { x: c.x / TILE, y: c.y / TILE, color: t.op.color };
    });
  }

  // ------------------------------------------------------------ Fahrgast im Detail (RM-FR-EVT-06)
  private pressAt: { x: number; y: number; t: number } | null = null;
  private personPinned = false;

  private personAt(sx: number, sy: number) {
    if (this.ui.menu || this.ui.tool !== 'select' || this.ui.hoverTrain !== null) return null;
    const w = this.cameras.main.getWorldPoint(sx, sy);
    return this.people.at(w.x, w.y);
  }

  personCard(id: number) { return this.people.card(id); }

  /** langer Druck ohne Bewegung: Fahrgast festhalten, bis wieder getippt wird */
  private checkLongPress() {
    const pr = this.pressAt;
    if (!pr || !this.input.activePointer.isDown || this.time.now - pr.t < 450) return;
    this.pressAt = null;
    const id = this.personAt(pr.x, pr.y);
    if (id === null) return;
    this.ui.hoverPerson = id;
    this.ui.mouse = { x: pr.x, y: pr.y };
    this.personPinned = true;
  }

  /** Kamera zum Zug */
  /** Feld unter der Maus (für Hover-Fenster) */
  get hovered() { return this.hoverCell; }

  /** Bildschirmposition (CSS-Pixel) der Mitte eines Felds */
  cellToScreen(x: number, y: number) {
    const cam = this.cameras.main;
    const p = toScreen((x + 0.5) * TILE, (y + 0.5) * TILE);
    return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom };
  }

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
    // Simulation in festen Schritten (RM-FR-PERF-01)
    this.clock.advance(dt);

    const cam = this.cameras.main;
    if (this.ui.menu) cam.scrollX += delta * 0.012;
    const sp = (delta * 0.4 * (settings.scroll / 100)) / cam.zoom;
    if (!typing()) {
      if (this.keys.A.isDown || this.keys.LEFT.isDown) cam.scrollX -= sp;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) cam.scrollX += sp;
      if (this.keys.W.isDown || this.keys.UP.isDown) cam.scrollY -= sp;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) cam.scrollY += sp;
    }

    this.takeBuildEvents();
    if (this.builtVersion !== this.g.version) this.rebuildStatic();
    this.moveMetro(delta);
    this.moveTraffic(delta);
    this.checkLongPress();
    this.pollGamepad(dt);
    // Beschriftungen auf fester Bildschirmgröße halten
    const inv = 1 / this.cameras.main.zoom;
    for (const l of this.fixedLabels) if (l.scaleX !== inv) l.setScale(inv);
    const ok = `${this.g.version}|${this.ui.tool}`;
    if (ok !== this.overlayKey) { this.overlayKey = ok; this.drawOverlay(); }
    this.updateSignals();
    this.updateTrains();
    this.people.update(dt);
    const wv = this.cameras.main.worldView;
    this.animals.update(dt, this.g.speed, this.g.paused, new Phaser.Geom.Rectangle(wv.x - 40, wv.y - 40, wv.width + 80, wv.height + 80));
    this.updateLights();
    this.weatherFx.update(dt, this.cameras.main.worldView, this.cameras.main.zoom);
    this.updateMarkers();
    this.updateLayer();
    this.cull();
    this.drawHint(dt);
    this.drawGhost();
    this.showFx();
  }

  /** Nur Sichtbares zeichnen (RM-FR-PERF-02): feste Bilder außerhalb des Ausschnitts ausblenden */
  private cullKey = '';
  private cullCount = -1;
  private cull() {
    const v = this.cameras.main.worldView;
    const n = this.staticObjs.length + this.buildingImgs.size;
    const key = `${Math.round(v.x / 32)},${Math.round(v.y / 32)},${Math.round(v.width / 32)},${Math.round(v.height / 32)}`;
    if (key === this.cullKey && n === this.cullCount) return;
    this.cullKey = key; this.cullCount = n;
    const pad = 96, x0 = v.x - pad, y0 = v.y - pad, x1 = v.right + pad, y1 = v.bottom + pad;
    const vis = (o: Phaser.GameObjects.Image | Phaser.GameObjects.Text) => {
      const ox = o.x - o.displayOriginX, oy = o.y - o.displayOriginY;
      o.setVisible(ox + o.displayWidth >= x0 && ox <= x1 && oy + o.displayHeight >= y0 && oy <= y1);
    };
    this.staticObjs.forEach(vis);
    for (const b of this.buildingImgs.values()) vis(b.img);
  }

  private rebuildStatic() {
    this.builtVersion = this.g.version;
    this.staticObjs.forEach((o) => o.destroy());
    this.staticObjs = [];
    this.crossings = [];
    this.roadSegs = undefined;
    this.signals.forEach((s) => { s.img.destroy(); s.mark?.destroy(); });
    this.signals = [];
    const g = this.g.grid;
    const rail = (cc?: { track: boolean; piece: number | null }) => !!cc && (cc.track || cc.piece !== null);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.get(x, y)!;
        if (c.track && c.piece === null) this.staticObjs.push(this.place('track', x * TILE, y * TILE, D_TRACK + x + y));
        if (c.road) {
          const r = (xx: number, yy: number) => !!g.get(xx, yy)?.road;
          const m = (r(x, y - 1) ? 1 : 0) | (r(x + 1, y) ? 2 : 0) | (r(x, y + 1) ? 4 : 0) | (r(x - 1, y) ? 8 : 0);
          this.staticObjs.push(this.place(`road_${m || 10}`, x * TILE, y * TILE, D_TRACK + x + y - 0.1));
          // Bahnübergang (RM-FR-MAP-08): Schranken schließen, sobald ein Zug den Abschnitt reserviert hat
          if (c.track || c.piece !== null) {
            const img = this.place('xing_open', x * TILE, y * TILE, toScreen(x * TILE + 8, y * TILE + 8).y + 0.42);
            this.staticObjs.push(img);
            this.crossings.push({ k: g.key(x, y), img, closed: false });
          }
        }
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
          this.signals.push({ img: this.place(c.shuntSig ? 'shsig_red' : 'signal_red', wx, wy, toScreen(wx, wy).y + 0.1), k: g.key(x, y), dir: 'E', sh: c.shuntSig });
        }
        if (c.signalW) {
          const wx = x * TILE + 2, wy = y * TILE + 1;
          this.signals.push({ img: this.place(c.shuntSig ? 'shsig_red' : 'signal_red', wx, wy, toScreen(wx, wy).y + 0.1), k: g.key(x, y), dir: 'W', sh: c.shuntSig });
        }
      }
    }
    for (const p of g.pieces.values()) {
      this.staticObjs.push(this.place(`piece_${p.key}`, p.x * TILE, p.y * TILE, D_TRACK + p.x + p.y + 0.5));
    }
    // Gebäude & Natur: Bilder bleiben erhalten, solange sich nichts ändert (tausende Bäume)
    for (const [id, c] of this.buildingImgs) {
      const b = g.buildings.get(id);
      if (!b || b.key !== c.key || b.x !== c.x || b.y !== c.y || !!b.rot !== !!c.rot) { c.img.destroy(); this.buildingImgs.delete(id); }
    }
    for (const b of g.buildings.values()) {
      const d = BUILDINGS[b.key];
      if (!this.buildingImgs.has(b.id)) {
        const fx = b.x + d.w - 1, fy = b.y + d.h - 1;
        let depth = toScreen(fx * TILE + 8, fy * TILE + 8).y + (d.onPlatform ? 0.32 : 0.3);
        if (b.key === 'bld_hump') depth = D_TRACK + b.x + b.y + 0.7;
        const img = this.place(b.key, b.x * TILE, b.y * TILE, depth);
        if (b.rot) this.mirror(img, b.key, b.x * TILE, b.y * TILE);
        this.buildingImgs.set(b.id, { key: b.key, x: b.x, y: b.y, rot: b.rot, img });
      }
      if (b.name) {
        const c = toScreen((b.x + d.w / 2) * TILE, (b.y + d.h / 2) * TILE);
        // Hauptbahnhof (höchste Bahnhofsstufe): „Hbf“ am größten Bahnhof
        const hbf = this.g.tier === 3 && this.g.stations()[0]?.id === b.id ? ' Hbf' : '';
        const label = this.fixedSize(this.add.text(c.x, c.y - 30, `${b.name}${hbf}`, {
          fontFamily: FONT, fontSize: `${LABEL_PX.station}px`, color: '#ffe9a8', backgroundColor: '#1d3a6bdd', padding: { x: 4, y: 0 },
        }).setOrigin(0.5, 1).setResolution(2).setDepth(D_OVERLAY + 2));
        this.staticObjs.push(label);
      }
    }
    // Gleisnummern am Bahnsteig (für „Bahnsteig festlegen“)
    const runs = this.g.platformRuns();
    if (runs.length > 1) runs.forEach((r, i) => {
      const c = toScreen((r.x0 + 0.5) * TILE, (r.row + 0.5) * TILE);
      const lbl = this.fixedSize(this.add.text(c.x, c.y - 4, String(i + 1), {
        fontFamily: FONT, fontSize: `${LABEL_PX.platform}px`, color: '#ffffff', backgroundColor: '#2c5f8add', padding: { x: 3, y: 0 },
      }).setOrigin(0.5, 1).setResolution(2).setDepth(D_OVERLAY + 1));
      this.staticObjs.push(lbl);
    });
    // Fremdbahnen (RM-FR-MAP-09): Namensschild am nahen Abschnitt – hier kann man anschließen
    for (const l of g.foreignLaid) {
      const op = OPERATORS[l.op];
      const c = toScreen(((l.x0 + l.x1) / 2 + 0.5) * TILE, (l.low + 0.5) * TILE);
      const lbl = this.fixedSize(this.add.text(c.x, c.y - 10, `${op.name} · Fremdbahn`, {
        fontFamily: FONT, fontSize: `${LABEL_PX.platform}px`, color: '#ffffff', backgroundColor: `${op.color}dd`, padding: { x: 4, y: 0 },
      }).setOrigin(0.5, 1).setResolution(2).setDepth(D_OVERLAY + 1));
      this.staticObjs.push(lbl);
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
        const mark = c.siding ? 'siding' : c.sortDest !== null ? `sort${c.sortDest}` : c.shunt ? 'shunt' : null;
        if (mark) {
          this.staticObjs.push(this.place(`mark_${mark}`, x * TILE, y * TILE, D_TRACK + x + y + 0.8));
          const prev = g.get(x - 1, y);
          const prevMark = prev && prev.track ? (prev.siding ? 'siding' : prev.sortDest !== null ? `sort${prev.sortDest}` : prev.shunt ? 'shunt' : null) : null;
          if (prevMark !== mark) this.staticObjs.push(this.place(`sign_${mark}`, x * TILE, y * TILE, objDepth(x, y, 0.15)));
        }
      }
    }
    for (const p of g.pieces.values()) {
      if (g.pieceCells(p).every((k) => g.cells[k].wire) && SPRITES[`wire_piece_${p.key}`]) {
        const fx = p.x + (p.key.startsWith('diag') || p.key.startsWith('cross') ? 0 : 2), fy = p.y + 1;
        this.staticObjs.push(this.place(`wire_piece_${p.key}`, p.x * TILE, p.y * TILE, objDepth(fx, fy, 0.45)));
      } else {
        // nur das durchgehende gerade Gleis hat Fahrdraht
        for (const k of g.pieceCells(p)) {
          const q = g.xy(k);
          if (g.cells[k].wire && PIECES[p.key].through.includes(q.y - p.y)) this.staticObjs.push(this.place('wire_span', q.x * TILE, q.y * TILE, objDepth(q.x, q.y, 0.45)));
        }
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
    // Hochbahn (RM-FR-MAP-11): Fahrbahn und Pfeiler über allem
    for (const v of currentMap().viaducts ?? []) {
      for (let y = v.y0; y <= v.y1; y++) this.staticObjs.push(this.place(v.piers.includes(y) ? 'viaduct_pier' : 'viaduct_deck', v.x * TILE, y * TILE, objDepth(v.x, y, 14)));
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
      const img = this.img(p.x, p.y - 8, 'warn').setOrigin(0.5, 1).setDepth(D_OVERLAY + 3);
      this.tweens.add({ targets: img, y: p.y - 13, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.staticObjs.push(img);
    });
  }

  /** dunkle Fläche = noch nicht gekauft; mit Werkzeug „Land“ Preise der kaufbaren Parzellen */
  /** Nebel über Flächen weit weg von der eigenen: je weiter, desto dichter */
  private drawFog(gfx: Phaser.GameObjects.Graphics) {
    const g = this.g.grid;
    const owned: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let py = 0; py < g.ph; py++) for (let px = 0; px < g.pw; px++) {
      if (g.parcelOwned(px, py)) owned.push({ x0: px * PARCEL, y0: py * PARCEL, x1: (px + 1) * PARCEL, y1: (py + 1) * PARCEL });
    }
    const B = 2;
    for (let y = 0; y < g.h; y += B) {
      for (let x = 0; x < g.w; x += B) {
        const cx = x + B / 2, cy = y + B / 2;
        let d = Infinity;
        for (const r of owned) d = Math.min(d, Math.max(r.x0 - cx, cx - r.x1, 0) + Math.max(r.y0 - cy, cy - r.y1, 0) * 0.8);
        const a = Math.min(0.94, Math.max(0, (d - FOG_START) / FOG_FULL) * 0.94);
        if (a < 0.02) continue;
        // leicht wolkig
        const n = Math.sin(x * 0.31 + y * 0.17) * 0.04 + Math.sin(x * 0.07 - y * 0.23) * 0.04;
        gfx.fillStyle(0xdce3ea, Math.min(0.96, a + n * a));
        this.diamond(gfx, x, y, x + B, y + B);
      }
    }
  }

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
          gfx.fillStyle(buy ? 0xffe066 : 0x0b0e18, buy ? 0.16 : 0.22);
          this.diamond(gfx, x0, y0, x0 + PARCEL, y0 + PARCEL);
          if (buy) {
            gfx.lineStyle(1, 0xffe066, 0.9);
            this.diamond(gfx, x0 + 0.15, y0 + 0.15, x0 + PARCEL - 0.15, y0 + PARCEL - 0.15, false, true);
            const c = toScreen((x0 + PARCEL / 2) * TILE, (y0 + PARCEL / 2) * TILE);
            const t = this.fixedSize(this.add.text(c.x, c.y, `${g.parcelPrice(px, py).toLocaleString('de-AT')} €`, {
              fontFamily: FONT, fontSize: `${LABEL_PX.price}px`, color: '#fff6c8', stroke: '#3a2a00', strokeThickness: 5,
            }).setOrigin(0.5).setResolution(2).setDepth(D_OVERLAY + 2));
            this.priceLabels.push(t);
          }
        }
      }
    }
    this.drawFog(gfx);
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
      const go = a !== 0 && next === a && dirOf.get(a) === s.dir;
      const tex = s.sh ? (go ? 'shsig_green' : 'shsig_red') : go ? 'signal_green' : 'signal_red';
      this.setTex(s.img, tex);
      // Farbenblind-Modus (RM-FR-UI-13): Form zusätzlich zur Farbe – ■ Halt, ▲ Fahrt
      if (settings.colorblind) {
        if (!s.mark) s.mark = this.add.text(s.img.x, s.img.y - s.img.displayHeight - 2, '', { fontFamily: 'VT323, monospace', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(s.img.depth + 1);
        const t = go ? '▲' : '■';
        if (s.mark.text !== t) s.mark.setText(t);
        s.mark.setVisible(true);
      } else s.mark?.setVisible(false);
    }
  }

  private lighting!: Lighting;
  private weatherFx!: Weather;
  private markerPool: Phaser.GameObjects.Image[] = [];
  private lastState = new Map<number, string>();

  /** rote Uhr über verspäteten Zügen, Warnzeichen an Störungen, Geräusche bei Halt/Abfahrt */
  /** Ebene neu zeichnen (gut dreimal pro Sekunde) */
  private updateLayer() {
    const layer = this.ui.layer;
    if (!layer) { if (this.layerOn) { this.layerGfx.clear(); this.layerOn = false; } return; }
    const now = performance.now();
    if (this.layerOn && now < this.layerNext) return;
    this.layerNext = now + 300;
    this.layerOn = true;
    const gfx = this.layerGfx, gr = this.g.grid, sim = this.g.sim;
    gfx.clear();
    // Karte abdunkeln, damit die Ebene heraussticht (in Parzellen – ein einziges Riesenvieleck zeichnet WebGL nicht zuverlässig)
    gfx.fillStyle(0x0b0e18, 0.45);
    for (let py = 0; py < MAP_H; py += PARCEL) for (let px = 0; px < MAP_W; px += PARCEL) this.diamond(gfx, px, py, px + PARCEL, py + PARCEL);
    const cell = (x: number, y: number, color: number, alpha: number, grow = 0) => {
      gfx.fillStyle(color, alpha);
      this.diamond(gfx, x - grow, y - grow, x + 1 + grow, y + 1 + grow);
    };
    if (layer === 'occupancy') {
      gr.cells.forEach((c, k) => {
        if (!c.track && c.piece === null) return;
        const { x, y } = gr.xy(k);
        if (sim.faultCells.has(k)) cell(x, y, 0xd9534f, 0.9);
        else if (sim.owner[k]) cell(x, y, 0xffb02e, 0.55);
        else cell(x, y, 0x3fa34d, 0.35);
      });
    } else if (layer === 'pax' || layer === 'mood') {
      const agg = new Map<number, { n: number; m: number }>();
      for (const p of this.people.samples()) {
        const x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE);
        if (!gr.inside(x, y)) continue;
        const k = gr.key(x, y), a = agg.get(k) ?? { n: 0, m: 0 };
        a.n++; a.m += p.mood;
        agg.set(k, a);
      }
      for (const [k, a] of agg) {
        const { x, y } = gr.xy(k);
        if (layer === 'pax') cell(x, y, a.n >= 6 ? 0xff6a3d : a.n >= 3 ? 0xffd23f : 0x4da3ff, a.n >= 6 ? 0.75 : 0.55);
        else { const m = a.m / a.n; cell(x, y, m > 0.5 ? 0x3fa34d : m > -0.3 ? 0xffd23f : 0xd9534f, 0.7); }
      }
    } else if (layer === 'wear') {
      for (const e of elements(this.g)) {
        const w = wearOf(this.g, e.k), { x, y } = gr.xy(e.k);
        cell(x, y, w >= 70 ? 0xd9534f : w >= 40 ? 0xffd23f : 0x3fa34d, 0.85);
      }
      // Züge, die in die Werkstatt oder zum Putzen müssten
      for (const t of sim.trains) {
        if ((t.wear <= 55 && t.dirt <= 70) || !t.route.length || t.state === 'stored') continue;
        const p = this.worldOnTrain(t, t.length / 2);
        cell(Math.floor(p.x / TILE), Math.floor(p.y / TILE), t.wear > 55 ? 0xd9534f : 0xffd23f, 0.6, 0.4);
      }
    }
  }

  private updateMarkers() {
    let used = 0;
    const put = (key: string, wx: number, wy: number, alpha = 1) => {
      let img = this.markerPool[used];
      if (!img) { img = this.img(0, 0, key).setOrigin(0).setDepth(D_OVERLAY + 4); this.markerPool.push(img); }
      used++;
      const s = SPRITES[key], p = toScreen(wx, wy);
      this.setTex(img, key);
      img.setPosition(Math.round(p.x + s.ox), Math.round(p.y + s.oy)).setAlpha(alpha).setVisible(true);
    };
    const sim = this.g.sim;
    const view = this.cameras.main.worldView;
    for (const t of sim.trains) {
      if (t.state === 'stored' || t.state === 'rolling' || !t.route.length) continue;
      const head = this.worldOnTrain(t, 4);
      const sp = toScreen(head.x, head.y);
      const visible = view.contains(sp.x, sp.y);
      // Geräusche nur für Züge im Bild
      const prev = this.lastState.get(t.id);
      if (visible && prev !== t.state) {
        if (t.state === 'dwell' && t.jobs[0]?.k === 'stop') Sound.gong();
        if (t.state === 'dwell' && prev === 'running') Sound.brake(t.op.traction);
        if (prev === 'dwell' && t.state === 'running') { Sound.whistle(); Sound.depart(t.op.traction); }
      }
      this.lastState.set(t.id, t.state);
      if (sim.stuck(t)) put('warn', head.x, head.y - 16, Math.floor(this.time0 / 300) % 2 ? 1 : 0.5);
      else if (sim.delayNow(t) >= 3) put('late_icon', head.x, head.y - 14);
    }
    if (this.lastState.size > 200) for (const id of [...this.lastState.keys()]) if (!sim.trains.some((t) => t.id === id)) this.lastState.delete(id);
    const blink = Math.floor(this.time0 / 400) % 2 === 0;
    for (const f of this.g.faults) {
      for (const k of f.cells ?? [f.k]) {
        const q = this.g.grid.xy(k);
        put('warn', q.x * TILE + 8, q.y * TILE + 8, f.repairAt || f.boosted ? 0.5 : blink ? 1 : 0.35);
      }
    }
    for (let i = used; i < this.markerPool.length; i++) this.markerPool[i].setVisible(false);
  }
  private updateLights() {
    const scr = (p: XY) => toScreen(p.x, p.y);
    const trains = this.g.sim.trains.filter((t) => t.state !== 'stored' && t.state !== 'done' && t.route.length).map((t) => ({
      head: scr(this.worldOnTrain(t, 2)),
      tail: scr(this.worldOnTrain(t, t.length - 2)),
      cars: t.cars.map((_, i) => scr(this.worldOnTrain(t, (i + 0.5) * 16))),
      pax: t.op.needsStop && t.op.kind !== 'freight' && !t.rake,
    }));
    this.lighting.update(this.cameras.main.worldView, trains);
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
        sprites = t.cars.map(() => this.img(0, 0, 'track').setOrigin(0));
        this.trainSprites.set(t.id, sprites);
      }
      t.cars.forEach((kind, i) => {
        const back = (i + 0.5) * 16;
        const c = this.worldOnTrain(t, back);
        const a = this.worldOnTrain(t, back - 5), b = this.worldOnTrain(t, back + 5);
        const dx = a.x - b.x, dy = a.y - b.y;
        const o = Math.abs(dy) < 0.4 * Math.abs(dx) ? 0 : dx * dy > 0 ? 1 : 2;
        // Triebzug-Führerstand: Nase zeigt an beiden Zugenden nach außen
        const sk = kind === 'ecab' ? ((i === 0) === (dx > 0) ? 'ecabE' : 'ecabW') : kind;
        const base = `car_${t.op.id}_${sk}_${o}`;
        const s = SPRITES[base];
        const key = this.paintKey(t.op.id, base);
        const p = toScreen(c.x, c.y);
        const img = sprites![i];
        this.setTex(img, key);
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

  /** Hilfsfelder je Werkzeug: wo kann man bauen (gecacht je Version) */
  private helpKey = '';
  private helpCells: { ok: XY[]; bad: XY[] } = { ok: [], bad: [] };

  private toolHelp(tool: string) {
    const key = `${tool}|${this.g.version}`;
    if (key === this.helpKey) return this.helpCells;
    this.helpKey = key;
    const g = this.g.grid;
    const ok: XY[] = [], bad: XY[] = [];
    if (tool === 'access') {
      // Bahnsteige (Anfang/Ende einer Unterführung)
      g.cells.forEach((c, k) => { if (c.platform) ok.push(g.xy(k)); });
    } else if (tool === 'wire') {
      // eigene Gleise ohne Oberleitung
      g.cells.forEach((c, k) => { const p = g.xy(k); if ((c.track || c.piece !== null) && !c.wire && g.isOwned(p.x, p.y)) ok.push(p); });
      // Oberleitung ohne Verbindung zur Strecke: „hängt offen“
      const seen = new Set<number>();
      g.cells.forEach((c, k) => {
        if (!c.wire || seen.has(k)) return;
        const comp: number[] = [k];
        seen.add(k);
        let live = false;
        for (let i = 0; i < comp.length; i++) {
          const p = g.xy(comp[i]);
          if (g.get(p.x, p.y)!.fixed) live = true;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const n = g.get(p.x + dx, p.y + dy);
            if (!n || !n.wire) continue;
            const nk = g.key(p.x + dx, p.y + dy);
            if (!seen.has(nk)) { seen.add(nk); comp.push(nk); }
          }
        }
        if (!live) comp.forEach((q) => bad.push(g.xy(q)));
      });
    }
    this.helpCells = { ok, bad };
    return this.helpCells;
  }

  private drawGhost() {
    const gfx = this.ghost;
    gfx.clear();
    this.ghostImgs.forEach((i) => i.setVisible(false));
    this.costTag.setVisible(false);
    const tool = this.ui.tool;
    if (tool === 'access' || tool === 'wire') {
      const h = this.toolHelp(tool);
      const z = this.cameras.main.zoom;
      gfx.lineStyle(1 / z, 0x8fd0ff, 0.55).fillStyle(0x8fd0ff, 0.12);
      for (const c of h.ok) this.diamond(gfx, c.x, c.y, c.x + 1, c.y + 1, true, true);
      gfx.lineStyle(2 / z, 0xff4b4b, 0.9).fillStyle(0xff4b4b, 0.25);
      for (const c of h.bad) this.diamond(gfx, c.x, c.y, c.x + 1, c.y + 1, true, true);
    }
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
        img = this.img(0, 0, 'track').setOrigin(0).setAlpha(0.65).setDepth(D_UI - 1);
        this.ghostImgs.push(img);
      }
      const s = SPRITES[name];
      const p = toScreen(wx, wy);
      this.setTex(img, name).setFlipX(false).setPosition(p.x + s.ox, p.y + s.oy).setVisible(true);
    };
    if (tool === 'switch' || tool === 'curve' || tool === 'diag') {
      a.cells.forEach((c, i) => ghostImg(i, `piece_${a.variant}`, c.x * TILE, c.y * TILE));
    }
    if (tool === 'track' && plan.pieces) {
      plan.pieces.forEach((p, i) => ghostImg(i, `piece_${p.key}`, p.x * TILE, p.y * TILE));
    }
    if (tool === 'building' || (tool === 'facility' && !a.variant.startsWith('mark_'))) {
      ghostImg(0, a.variant, a.cells[0].x * TILE, a.cells[0].y * TILE);
      const gi = this.ghostImgs[0];
      gi.setFlipX(false);
      if (tool === 'building' && this.g.buildRot && Game.canRotate(a.variant)) this.mirror(gi, a.variant, a.cells[0].x * TILE, a.cells[0].y * TILE);
    }
    if (tool === 'signal') {
      const c = a.cells[0];
      const [wx, wy] = a.variant === 'W' ? [c.x * TILE + 2, c.y * TILE + 1] : [(c.x + 1) * TILE - 2, c.y * TILE + 15];
      ghostImg(0, 'signal_green', wx, wy);
      // Fahrtrichtung: gelbe Pfeile auf den nächsten Feldern, laufen in Fahrtrichtung
      const d = a.variant.endsWith('W') ? -1 : 1;
      const z = this.cameras.main.zoom;
      const phase = (this.time0 / 400) % 1;
      for (let i = 0; i < 4; i++) {
        const fx = c.x + 0.5 + d * (i - 0.5 + phase), fy = c.y + 0.5;
        const pt = (dx: number, dy: number) => toScreen((fx + dx) * TILE, (fy + dy) * TILE);
        const tip = pt(d * 0.32, 0), l = pt(-d * 0.22, -0.42), r = pt(-d * 0.22, 0.42);
        const alpha = Math.min(1, (i + 1 - phase) / 1.2) * (i === 3 ? 1 - phase : 1);
        gfx.lineStyle(4 / z, 0x000000, 0.5 * alpha).beginPath().moveTo(l.x, l.y + 1 / z).lineTo(tip.x, tip.y + 1 / z).lineTo(r.x, r.y + 1 / z).strokePath();
        gfx.lineStyle(2.5 / z, 0xffd23c, alpha).beginPath().moveTo(l.x, l.y).lineTo(tip.x, tip.y).lineTo(r.x, r.y).strokePath();
      }
    }
    const eur = (n: number) => Math.abs(Math.round(n)).toLocaleString('de-AT');
    const broke = !plan.ok && plan.reason === 'Zu wenig Geld' && plan.cost > 0;
    this.ui.message = plan.ok ? `${plan.note ? `${plan.note} · ` : ''}${plan.cost < 0 ? '+' : plan.cost > 0 ? '−' : ''}${eur(plan.cost)} €`
      : broke ? `Zu wenig Geld: kostet ${eur(plan.cost)} €, es fehlen ${eur(plan.cost - this.g.money)} €` : plan.reason ?? '';
    // Betrag direkt am Mauszeiger, rot wenn das Geld nicht reicht
    if ((plan.ok && plan.cost !== 0) || broke) {
      const end = a.cells[a.cells.length - 1];
      const q = toScreen((end.x + 1) * TILE, end.y * TILE);
      this.costTag.setText(broke ? `−${eur(plan.cost)} € · fehlen ${eur(plan.cost - this.g.money)} €` : `${plan.cost < 0 ? '+' : '−'}${eur(plan.cost)} €`)
        .setColor(broke ? '#ff6a5a' : plan.cost < 0 ? '#9dff8a' : '#ffe9a8').setPosition(q.x + 6 / this.cameras.main.zoom, q.y - 2 / this.cameras.main.zoom).setVisible(true);
    }
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
      // feste Bildschirmgröße wie die übrigen Beschriftungen (nicht in fixedLabels, weil die Größe animiert wird)
      const inv = 1 / this.cameras.main.zoom;
      const t = this.add.text(p.x, p.y, txt, {
        fontFamily: FONT, fontSize: `${big ? LABEL_PX.fxBig : LABEL_PX.fx}px`, align: 'center', lineSpacing: -4,
        color: f.amount >= 0 ? '#9dff8a' : '#ff6a5a', stroke: '#140c06', strokeThickness: 4,
      }).setOrigin(0.5, 1).setResolution(2).setDepth(D_UI + 10).setScale(0.6 * inv);
      this.tweens.add({ targets: t, scale: inv, duration: 180, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: p.y - 28, alpha: 0, delay: big ? 1300 : 700, duration: 1100, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
    }
  }
}

/** Farbumrechnung für die Lackierung */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
  const h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
function hsl(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
