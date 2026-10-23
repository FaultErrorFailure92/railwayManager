import manifest from '../gen/manifest.json';

/** Titelbildschirm: kleine Pixel-Szenen hinter dem Hauptmenü (abwechselnd mit dem laufenden Spiel) */
type S = { file: string; ox: number; oy: number; w: number; h: number };
const SPR = manifest.sprites as Record<string, S>;
const Z = 2;
const T = 16;

interface TrainDef { cars: string[]; row: number; dir: 1 | -1; speed: number; stopAt?: number; gap?: number }
interface Scene {
  label: string;
  ground: string;
  props: string[];
  density: number;
  rows: number[];
  platforms?: number[];
  station?: { key: string; x: number; y: number };
  trains: TrainDef[];
  snow?: boolean;
  tint?: string;
}

const car = (op: string, kinds: string[]) => kinds.map((k) => `car_${op}_${k}_0`);

const SCENES: Scene[] = [
  {
    label: 'Wüstenexpress', ground: 'ground_sand_', props: ['bld_cactus0', 'bld_cactus1', 'bld_palm0', 'bld_palm1', 'bld_drybush', 'bld_drybush'], density: 0.05,
    rows: [0], trains: [
      { cars: car('hs', ['pcar', 'coach', 'dine', 'coach', 'pcar']), row: 0, dir: 1, speed: 260, gap: 2 },
    ],
  },
  {
    label: 'Hauptbahnhof', ground: 'ground_', props: ['bld_tree0', 'bld_tree1', 'bld_pine0', 'bld_bush0'], density: 0.03,
    rows: [-1, 1, 3, 5], platforms: [0, 4], station: { key: 'bld_station3', x: -1, y: -4 },
    trains: [
      { cars: car('wx', ['loco', 'bag', 'coach', 'dine', 'coach', 'coach']), row: -1, dir: 1, speed: 90, stopAt: 0, gap: 1 },
      { cars: car('ro', ['loco', 'coach', 'coach']), row: 1, dir: -1, speed: 70, stopAt: 0, gap: 3 },
      { cars: ['car_sb_ecabW_0', 'car_sb_emu_0', 'car_sb_ecabE_0'], row: 3, dir: 1, speed: 80, stopAt: 2, gap: 0 },
      { cars: car('cd', ['loco', 'wagon0', 'wagon1', 'wagon2', 'wagon0', 'wagon1']), row: 5, dir: -1, speed: 60, gap: 5 },
    ],
  },
  {
    label: 'Schneeland', ground: 'ground_snow_', props: ['bld_snowpine0', 'bld_snowpine1', 'bld_snowpine0'], density: 0.09,
    rows: [0, 1], snow: true, trains: [
      { cars: car('nj', ['loco', 'bag', 'coach', 'dine', 'coach', 'coach']), row: 0, dir: 1, speed: 80, gap: 1 },
      { cars: car('hv', ['loco', 'wagon0', 'wagon1', 'wagon2', 'wagon0']), row: 1, dir: -1, speed: 55, gap: 4 },
    ],
  },
  {
    label: 'Dampf im Gebirge', ground: 'ground_', props: ['bld_rock0', 'bld_rock1', 'bld_pine0', 'bld_pine1', 'bld_pine0'], density: 0.07, tint: 'rgba(200,220,210,0.12)',
    rows: [0], trains: [
      { cars: car('dm', ['steam', 'coach', 'dine', 'coach']), row: 0, dir: -1, speed: 45, gap: 1 },
    ],
  },
];

const img = new Map<string, HTMLImageElement>();
function get(name: string) {
  let i = img.get(name);
  if (!i) { i = new Image(); i.src = `assets/gen/${SPR[name]?.file ?? name + '.png'}`; img.set(name, i); }
  return i;
}

export class TitleShow {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private running = false;
  private scene = 0;
  /** -1 = laufendes Spiel zeigen */
  private showing = -1;
  private since = 0;
  private props: { key: string; x: number; y: number }[] = [];
  private trains: { def: TrainDef; x: number; wait: number }[] = [];
  private flakes = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() }));
  private last = 0;

  constructor(parent: HTMLElement) {
    this.cv = document.createElement('canvas');
    this.cv.id = 'title-bg';
    parent.prepend(this.cv);
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    // Bilder vorladen
    for (const sc of SCENES) { sc.props.forEach(get); sc.trains.forEach((t) => t.cars.forEach(get)); for (let v = 0; v < 8; v++) get(`${sc.ground}${v}`); }
    ['track', 'platform', 'bld_station3'].forEach(get);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.showing = -1;
    this.since = performance.now();
    this.cv.classList.remove('on');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  stop() {
    this.running = false;
    this.cv.classList.remove('on');
  }

  private pick() {
    const sc = SCENES[this.scene];
    this.scene = (this.scene + 1) % SCENES.length;
    // Deko zufällig neben den Gleisen
    this.props = [];
    const r0 = Math.min(...sc.rows) - 1, r1 = Math.max(...sc.rows) + 1;
    for (let y = -30; y < 34; y++) for (let x = -50; x < 60; x++) {
      if (y >= r0 && y <= r1) continue;
      if (sc.station && x >= sc.station.x - 1 && x <= sc.station.x + 3 && y >= sc.station.y - 1 && y <= sc.station.y + 2) continue;
      if (Math.random() < sc.density) this.props.push({ key: sc.props[Math.floor(Math.random() * sc.props.length)], x, y });
    }
    this.trains = sc.trains.map((d) => ({ def: d, x: d.dir > 0 ? -40 - (d.gap ?? 0) * 8 : 60 + (d.gap ?? 0) * 8, wait: 0 }));
    return SCENES.indexOf(sc);
  }

  private frame(now: number) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // alle 12 s wechseln: Spiel → Szene → Spiel → nächste Szene …
    if (now - this.since > 12000) {
      this.since = now;
      if (this.showing < 0) { this.showing = this.pick(); this.cv.classList.add('on'); } else { this.showing = -1; this.cv.classList.remove('on'); }
    }
    if (this.showing >= 0) this.draw(SCENES[this.showing], dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  private draw(sc: Scene, dt: number) {
    const W = window.innerWidth, H = window.innerHeight;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.ctx.imageSmoothingEnabled = false; }
    const c = this.ctx;
    c.fillStyle = '#1b2130';
    c.fillRect(0, 0, W, H);
    // Weltpunkt (wx, wy) in Einheiten → Bildschirm; Mitte der Gleise in die Bildmitte
    const midRow = (Math.min(...sc.rows) + Math.max(...sc.rows)) / 2;
    const cx = 5 * T, cy = (midRow + 0.5) * T;
    const sx = (wx: number, wy: number) => W * 0.32 + ((wx - wy) - (cx - cy)) * Z;
    const sy = (wx: number, wy: number) => H * 0.66 + ((wx + wy) / 2 - (cx + cy) / 2) * Z;
    const put = (name: string, wx: number, wy: number) => {
      const s = SPR[name];
      const i = get(name);
      if (!s || !i.complete) return;
      c.drawImage(i, Math.round(sx(wx, wy) + s.ox * Z), Math.round(sy(wx, wy) + s.oy * Z), s.w * Z, s.h * Z);
    };
    // Boden
    for (let y = -30; y < 34; y++) for (let x = -50; x < 60; x++) {
      const px = sx(x * T, y * T), py = sy(x * T, y * T);
      if (px < -80 || px > W + 80 || py < -80 || py > H + 40) continue;
      put(`${sc.ground}${Math.abs((x * 7349 + y * 3571) ^ (x * y * 113)) % 8}`, x * T, y * T);
    }
    // Gleise, Bahnsteige, Bahnhof
    for (const r of sc.rows) for (let x = -50; x < 60; x++) put('track', x * T, r * T);
    for (const r of sc.platforms ?? []) for (let x = -6; x < 8; x++) put('platform', x * T, r * T);
    // Objekte und Züge nach Tiefe sortiert zeichnen
    const items: { d: number; f: () => void }[] = [];
    for (const p of this.props) items.push({ d: (p.x + p.y) * T, f: () => put(p.key, p.x * T, p.y * T) });
    if (sc.station) { const st = sc.station; items.push({ d: (st.x + st.y + 4) * T, f: () => put(st.key, st.x * T, st.y * T) }); }
    for (const tr of this.trains) {
      const d = tr.def;
      // Bewegung: vor dem Bahnsteig bremsen, kurz halten, wieder anfahren
      let v = d.speed;
      if (d.stopAt !== undefined && tr.wait >= 0) {
        const target = d.stopAt * T + (d.dir > 0 ? 3 * T : -3 * T);
        const dist = (target - tr.x) * d.dir;
        if (dist > 0) v = Math.max(18, Math.min(d.speed, Math.sqrt(dist * 260)));
        else if (tr.wait < 3.5) { v = 0; tr.wait += dt; } else tr.wait = -1;
      }
      tr.x += v * d.dir * dt;
      const len = d.cars.length * T;
      if ((d.dir > 0 && tr.x - len > 62 * T) || (d.dir < 0 && tr.x + len < -48 * T)) { tr.x = d.dir > 0 ? -48 * T : 62 * T; tr.wait = 0; }
      d.cars.forEach((name, i) => {
        const wx = tr.x - d.dir * (i + 0.5) * T, wy = (d.row + 0.5) * T;
        items.push({ d: wx + wy + 0.5, f: () => put(name, wx, wy) });
      });
    }
    items.sort((a, b) => a.d - b.d).forEach((it) => it.f());
    if (sc.tint) { c.fillStyle = sc.tint; c.fillRect(0, 0, W, H); }
    if (sc.snow) {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of this.flakes) {
        f.y += dt * 0.06 * f.s; f.x += Math.sin(f.y * 20) * 0.0006;
        if (f.y > 1) { f.y = 0; f.x = Math.random(); }
        c.fillRect(Math.round(f.x * W), Math.round(f.y * H), 3 * f.s + 1, 3 * f.s + 1);
      }
    }
    // Szenenname unten
    c.font = '22px VT323, monospace';
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillText(sc.label, 22, H - 18);
    c.fillStyle = '#ffd23c';
    c.fillText(sc.label, 20, H - 20);
  }
}
