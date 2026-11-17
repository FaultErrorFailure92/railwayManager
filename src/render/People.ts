import Phaser from 'phaser';
import { GAME_SEC_PER_REAL_SEC, TILE } from '../config';
import type { Game } from '../game/Game';
import manifest from '../gen/manifest.json';
import { toScreen } from '../iso';
import type { OperatorId } from '../sim/Operators';
import { pointOnEdge, StopRun } from '../world/Network';
import { currentMap } from '../world/maps';
import type { Train } from '../sim/Simulation';

type State = 'arrive' | 'idle' | 'walk' | 'board' | 'leave';
type Emote = 'dots' | 'excl' | 'angry' | 'heart' | 'happy';

/** Steckbrief eines Fahrgasts (RM-FR-EVT-06) */
interface Trip {
  name: string;
  /** Fahrtrichtung (Wartende) bzw. Herkunft (Aussteigende) */
  dir: 'E' | 'W';
  purpose: string;
  /** nur Aussteigende */
  train?: string;
  late?: number;
  dirty?: boolean;
}

export interface PersonCard { id: number; name: string; lines: { text: string; cls?: string }[]; mood: 'gut' | 'naja' | 'sauer' }

const FIRST = ['Frau Huber', 'Herr Gruber', 'Oma Gerti', 'Opa Ferdl', 'Lena', 'Jonas', 'Frau Dr. Wallner', 'Herr Mayerhofer', 'Sophie', 'Maximilian', 'Frau Pichler',
  'Herr Steiner', 'Mia', 'Lukas', 'Frau Moser', 'Herr Brandstätter', 'Tante Resi', 'Onkel Poldi', 'Anna', 'Elias', 'Frau Hofbauer', 'Herr Leitner', 'Emma', 'David'];
const PURPOSE = [
  'besucht die Enkerl – mit selbstgebackenem Marillenkuchen',
  'hat ein Vorstellungsgespräch und übt leise die Antworten',
  'fährt zum Zahnarzt und hofft auf eine Verspätung',
  'will endlich den Dachboden der Tante entrümpeln',
  'fährt zum Fußballtraining, die Stutzen hängen aus dem Rucksack',
  'pendelt ins Büro, der Laptop ist schwerer als gedacht',
  'hat ein erstes Date und zu viel Parfum erwischt',
  'bringt einen Kürbis zur Gemüse-Prämierung',
  'fährt zur Oper – im Rucksack belegte Semmeln für die Pause',
  'besucht einen Modellbahn-Stammtisch (natürlich)',
  'holt ein gebrauchtes Akkordeon ab',
  'will heute endlich den Gipfel schaffen, die Wanderschuhe sind neu',
  'fährt zur Uni und hat die Vorlesung schon zur Hälfte verschlafen',
  'liefert eine Torte für eine Hochzeit – bitte nicht bremsen',
  'zählt Züge und schreibt alle Nummern in ein Heft',
  'fährt einkaufen und hat die Liste natürlich vergessen',
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
let nextPersonId = 1;

interface Person {
  id: number;
  trip: Trip;
  img: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Image;
  x: number;
  y: number;
  tx: number;
  ty: number;
  state: State;
  variant: number;
  anim: number;
  wait: number;
  alpha: number;
  /** gewartete Spielzeit in Sekunden */
  waited: number;
  /** gerade angezeigtes Symbol + Restzeit */
  emote: Emote | null;
  emoteT: number;
  /** Takt für wiederkehrende Symbole */
  blink: number;
}

const MAX_PEOPLE = 350;
const WALK = 7; // Welt-Einheiten pro echter Sekunde bei 1×
const PLATFORM_Z = 4;
const PER_CELL = 2;
/** Grundgeduld in Spielsekunden – gezählt wird nur, solange ein Zug überfällig ist */
const PATIENCE = 5 * 60;
const { variants: VARIANTS, frames: FRAMES } = manifest.people;
const EMOTES = manifest.emotes.names as Emote[];

/** Rein optische Fahrgäste mit Stimmung: warten, steigen ein und aus. */
export class People {
  private list: Person[] = [];
  private dwelling = new Set<number>();
  private spawnAcc = 0;
  private comfortVersion = -1;
  /** Geduld-Faktor je Feld (Wartehalle, Bank, Kiosk in der Nähe) */
  private comfort = new Map<string, number>();
  private kioskNear = new Set<string>();
  private hasWc = false;

  constructor(private scene: Phaser.Scene, private g: Game) {}

  private cellOf(p: { x: number; y: number }) {
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
  }

  private onPlatform(x: number, y: number) {
    const c = this.cellOf({ x, y });
    return !!this.g.grid.get(c.x, c.y)?.platform;
  }

  private updateComfort() {
    if (this.comfortVersion === this.g.version) return;
    this.comfortVersion = this.g.version;
    this.comfort.clear();
    this.kioskNear.clear();
    this.hasWc = [...this.g.grid.buildings.values()].some((b) => b.key === 'bld_wc' && !b.decor);
    const add = (x: number, y: number, r: number, f: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const k = `${x + dx},${y + dy}`;
        this.comfort.set(k, Math.max(this.comfort.get(k) ?? 1, f));
      }
    };
    for (const b of this.g.grid.buildings.values()) {
      if (b.key === 'bld_shelter') add(b.x, b.y, 1, 1.7);
      if (b.key === 'bld_bench') add(b.x, b.y, 1, 1.3);
      if (b.key === 'bld_clock') add(b.x, b.y, 2, 1.2);
      // Deko in der Nähe macht Wartende froher
      if (b.key === 'bld_fountain' || b.key === 'bld_statue' || b.key === 'bld_mural') add(b.x, b.y, 3, 1.15);
      if (b.key === 'bld_flowers') add(b.x, b.y, 2, 1.1);
      if (b.key === 'bld_xmas') add(b.x, b.y, 3, 1.3);
      if (b.key === 'bld_kiosk' || b.key === 'bld_vending') {
        add(b.x, b.y, 2, 1.3);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.kioskNear.add(`${b.x + dx},${b.y + dy}`);
      }
    }
  }

  /** zufälliger Punkt auf einem Bahnsteigfeld, bevorzugt nahe der Gleiskante */
  private spotOn(cx: number, cy: number) {
    const g = this.g.grid;
    const rail = (x: number, y: number) => { const c = g.get(x, y); return !!c && (c.track || c.piece !== null); };
    let ly = 3 + Math.random() * 10;
    if (rail(cx, cy - 1) && !rail(cx, cy + 1)) ly = 3 + Math.random() * 4;
    if (rail(cx, cy + 1) && !rail(cx, cy - 1)) ly = 9 + Math.random() * 4;
    return { x: cx * TILE + 2 + Math.random() * 12, y: cy * TILE + ly };
  }

  private add(x: number, y: number, state: State, tx = x, ty = y, alpha = 0): Person | null {
    if (this.list.length >= MAX_PEOPLE) return null;
    const variant = Math.floor(Math.random() * VARIANTS);
    const img = this.scene.add.image(0, 0, 'people', variant * FRAMES).setOrigin(0.5, 1);
    const bubble = this.scene.add.image(0, 0, 'emotes', 0).setOrigin(0.5, 1).setVisible(false);
    const trip: Trip = { name: pick(FIRST), dir: Math.random() < 0.5 ? 'E' : 'W', purpose: pick(PURPOSE) };
    const p: Person = { id: nextPersonId++, trip, img, bubble, x, y, tx, ty, state, variant, anim: Math.random(), wait: 1 + Math.random() * 6, alpha,
      waited: 0, emote: null, emoteT: 0, blink: Math.random() * 4 };
    this.list.push(p);
    return p;
  }

  private say(p: Person, e: Emote, t = 2) {
    p.emote = e;
    p.emoteT = t;
  }

  private runCells(run: StopRun) {
    const out: { x: number; y: number }[] = [];
    for (let x = run.x0; x <= run.x1; x++) {
      for (const y of [run.row - 1, run.row + 1]) if (this.g.grid.get(x, y)?.platform) out.push({ x, y });
    }
    return out;
  }

  private patience(p: Person) {
    if (this.g.researched('cat')) return this.patienceRaw(p) * 1.1;
    return this.patienceRaw(p);
  }

  private patienceRaw(p: Person) {
    const c = this.cellOf(p);
    return PATIENCE * (this.comfort.get(`${c.x},${c.y}`) ?? 1) * (this.hasWc ? 1.2 : 1);
  }

  update(dtReal: number) {
    if (this.g.paused) return;
    this.updateComfort();
    const dt = dtReal * this.g.speed;
    const dtGame = dt * GAME_SEC_PER_REAL_SEC;
    const sim = this.g.sim;
    // geärgert wird nur, wenn ein Zug zu spät ist – nicht über den Takt
    const overdue = sim.overdue() > 240;
    const plats: { x: number; y: number }[] = [];
    // nur Bahnsteige mit Zugang vom Empfangsgebäude
    this.g.grid.cells.forEach((c, k) => { if (c.platform && c.building === null && this.g.net.accessible.has(k)) plats.push(this.g.grid.xy(k)); });

    // --- neue Wartende
    const waitingPerCell = new Map<string, number>();
    for (const p of this.list) {
      if (p.state === 'idle' || p.state === 'arrive' || p.state === 'walk') {
        const c = this.cellOf(p);
        const k = `${c.x},${c.y}`;
        waitingPerCell.set(k, (waitingPerCell.get(k) ?? 0) + 1);
      }
    }
    this.spawnAcc += dt * plats.length * 0.06;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const c = plats[Math.floor(Math.random() * plats.length)];
      if (!c || (waitingPerCell.get(`${c.x},${c.y}`) ?? 0) >= PER_CELL) continue;
      const s = this.spotOn(c.x, c.y);
      this.add(s.x, s.y, 'arrive');
    }

    // --- Züge am Bahnsteig: aussteigen beim Ankommen, einsteigen solange sie halten
    const now = new Set<number>();
    for (const t of sim.trains) {
      const job = t.jobs[0];
      if (t.state !== 'dwell' || job?.k !== 'stop') continue;
      const run = t.route[t.route.length - 1].stopRun;
      if (!run) continue;
      now.add(t.id);
      const cells = this.runCells(run);
      if (!cells.length) continue;
      const doors = t.cars.map((_, i) => {
        const { i: ei, d } = sim.posOnTrain(t, (i + 0.5) * 16);
        return pointOnEdge(t.route[ei], d);
      }).slice(t.op.kind === 'freight' ? 99 : 1);
      if (!doors.length) continue;
      const late = (t.arrDelay ?? 0) >= 3;
      if (!this.dwelling.has(t.id) && job.alight) {
        const n = Math.min(10, Math.round(t.passengers / 30));
        for (let i = 0; i < n; i++) {
          const d = doors[i % doors.length];
          const c = cells[Math.floor(Math.random() * cells.length)];
          const s = this.spotOn(c.x, c.y);
          const side = Math.sign(c.y * TILE + 8 - d.y);
          const p = this.add(d.x + (Math.random() - 0.5) * 6, d.y + side * 5, 'leave', s.x, s.y, 1);
          if (p) {
            this.say(p, late || t.dirt > 70 ? 'angry' : 'happy', 2.5);
            p.trip = { ...p.trip, dir: t.dir, train: `${t.number} (${t.op.category})`, late: Math.round(t.arrDelay ?? 0), dirty: t.dirt > 70 };
          }
        }
      }
      if (!job.board) continue;
      const inRun = new Set(cells.map((c) => `${c.x},${c.y}`));
      for (const p of this.list) {
        if (p.state !== 'idle' && p.state !== 'walk') continue;
        const c = this.cellOf(p);
        if (!inRun.has(`${c.x},${c.y}`)) continue;
        let best = doors[0], bd = Infinity;
        for (const d of doors) {
          const dd = Math.hypot(d.x - p.x, d.y - p.y);
          if (dd < bd) { bd = dd; best = d; }
        }
        p.state = 'board';
        p.tx = best.x + (Math.random() - 0.5) * 4;
        p.ty = best.y;
        const comfort = this.patience(p) / PATIENCE;
        const delay = sim.boardDelay(t);
        const mood = delay >= 6 * comfort || p.waited > 2 * this.patience(p) ? -1 : delay < 2 ? 1 : 0;
        this.g.passengerMood(t.op.id as OperatorId, mood);
        if (mood > 0) this.say(p, 'heart', 1.2);
      }
    }
    this.dwelling = now;

    // --- Bewegung + Stimmung
    for (const p of this.list) {
      let moving = false;
      if (p.state === 'idle' || p.state === 'walk' || p.state === 'arrive') {
        if (overdue) p.waited += dtGame;
        else p.waited = Math.max(0, p.waited - dtGame * 0.5);
        const pat = this.patience(p);
        p.blink -= dt;
        if (p.waited > 2 * pat) {
          if (p.emote !== 'angry' || p.emoteT < 0.2) this.say(p, 'angry', p.blink > 0 ? 1 : 0.5);
          if (p.blink <= 0) p.blink = 2.5;
        } else if (p.waited > pat && p.blink <= 0) {
          this.say(p, Math.random() < 0.6 ? 'dots' : 'excl', 1.4);
          p.blink = 3 + Math.random() * 3;
        } else if (p.blink <= 0) {
          const c = this.cellOf(p);
          if (this.kioskNear.has(`${c.x},${c.y}`) && Math.random() < 0.3) this.say(p, 'happy', 1.2);
          p.blink = 4 + Math.random() * 4;
        }
      }
      if (p.state === 'arrive') {
        p.alpha = Math.min(1, p.alpha + dt * 2);
        if (p.alpha >= 1) p.state = 'idle';
      } else if (p.state === 'idle') {
        p.wait -= dt;
        if (p.wait <= 0) {
          const c = this.cellOf(p);
          const s = this.spotOn(c.x, c.y);
          p.tx = s.x; p.ty = s.y; p.state = 'walk';
        }
        if (!this.onPlatform(p.x, p.y)) { p.state = 'leave'; p.tx = p.x; p.ty = p.y; }
      } else {
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        const step = WALK * dt;
        if (dist > 0.3) {
          p.x += (dx / dist) * Math.min(step, dist);
          p.y += (dy / dist) * Math.min(step, dist);
          moving = true;
          const sdx = dx - dy;
          if (Math.abs(sdx) > 0.1) p.img.setFlipX(sdx < 0);
        }
        if (p.state === 'walk' && dist <= 0.3) { p.state = 'idle'; p.wait = 2 + Math.random() * 8; }
        if (p.state === 'board' && dist < 3) p.alpha -= dt * 4;
        if (p.state === 'leave' && dist <= 0.3) p.alpha -= dt * 1.5;
        if (p.state === 'board' && !now.size) p.state = 'idle';
      }
      if (moving) p.anim += dt * 7;
      const frame = moving ? 1 + (Math.floor(p.anim) % 2) : 0;
      p.img.setFrame(p.variant * FRAMES + frame);

      const c = this.cellOf(p);
      const onPlat = !!this.g.grid.get(c.x, c.y)?.platform;
      const z = onPlat || p.state === 'board' || p.state === 'leave' ? PLATFORM_Z : 0;
      const s = toScreen(p.x, p.y);
      const cellSy = toScreen(c.x * TILE + 8, c.y * TILE + 8).y;
      const depth = cellSy + 0.35 + (s.y - cellSy + 8) / 1000;
      const a = Math.max(0, Math.min(1, p.alpha));
      p.img.setPosition(Math.round(s.x), Math.round(s.y - z)).setDepth(depth).setAlpha(a);

      p.emoteT -= dt;
      if (p.emote && p.emoteT > 0) {
        p.bubble.setVisible(true).setFrame(EMOTES.indexOf(p.emote))
          .setPosition(Math.round(s.x) + 1, Math.round(s.y - z) - 8).setDepth(depth + 50000).setAlpha(a);
      } else {
        p.emote = null;
        p.bubble.setVisible(false);
      }
    }
    this.list = this.list.filter((p) => {
      if (p.alpha > 0 || p.state === 'arrive') return true;
      p.img.destroy();
      p.bubble.destroy();
      return false;
    });
  }

  // ------------------------------------------------------------ Fahrgast im Detail (RM-FR-EVT-06)
  /** Fahrgast unter einem Weltpunkt (oberster) */
  at(wx: number, wy: number): number | null {
    let best: Person | null = null;
    for (const p of this.list) {
      if (p.alpha < 0.5 || !p.img.visible) continue;
      const b = p.img.getBounds();
      if (wx < b.x - 1 || wx > b.right + 1 || wy < b.y - 1 || wy > b.bottom + 1) continue;
      if (!best || p.img.depth > best.img.depth) best = p;
    }
    return best?.id ?? null;
  }

  /** nächster Zug in diese Richtung, der hier hält und mitnimmt */
  private nextTrain(dir: 'E' | 'W'): Train | undefined {
    const sim = this.g.sim;
    // Wendezüge fahren dorthin zurück, woher sie kamen
    const goes = (t: Train) => (t.op.turnback ? (t.dir === 'E' ? 'W' : 'E') : t.dir);
    return [...sim.trains, ...sim.queue]
      .filter((t) => goes(t) === dir && !t.missedStop && t.jobs.some((j) => j.k === 'stop' && j.board))
      .sort((a, b) => a.plannedSpawn - b.plannedSpawn)[0];
  }

  card(id: number): PersonCard | null {
    const p = this.list.find((x) => x.id === id);
    if (!p) return null;
    const [west, east] = currentMap().ends;
    const lines: PersonCard['lines'] = [];
    let mood: PersonCard['mood'] = 'gut';
    const trip = p.trip;
    if (trip.train) {
      lines.push({ text: `kommt mit ${trip.train} aus ${trip.dir === 'E' ? west : east}` });
      if ((trip.late ?? 0) >= 3) { mood = 'sauer'; lines.push({ text: `${trip.late} min zu spät – „Typisch!“`, cls: 'no' }); }
      else if (trip.dirty) { mood = 'naja'; lines.push({ text: 'Der Zug war ganz schön schmutzig.', cls: 'no' }); }
      else lines.push({ text: 'Pünktlich angekommen – sehr zufrieden.', cls: 'ok' });
    } else {
      const t = this.nextTrain(trip.dir);
      lines.push({ text: `will nach ${trip.dir === 'E' ? east : west}` });
      if (t) {
        const delay = Math.round(this.g.sim.delayNow(t));
        lines.push({ text: `wartet auf ${t.number} (${t.op.category})${delay >= 2 ? ` – ${delay} min Verspätung` : ''}`, cls: delay >= 3 ? 'no' : undefined });
      } else lines.push({ text: 'Weiß noch nicht, welcher Zug hier hält …', cls: 'no' });
      const pat = this.patience(p), min = Math.round(p.waited / 60);
      const c = this.cellOf(p), k = `${c.x},${c.y}`;
      const comfort = this.comfort.get(k) ?? 1;
      if (p.waited > 2 * pat) { mood = 'sauer'; lines.push({ text: `ist sauer: wartet schon ${min} min auf einen überfälligen Zug`, cls: 'no' }); }
      else if (p.waited > pat) { mood = 'naja'; lines.push({ text: `wird ungeduldig (${min} min über der Zeit)`, cls: 'no' }); }
      else if (this.kioskNear.has(k)) lines.push({ text: 'gut gelaunt – hat sich am Kiosk einen Kaffee geholt', cls: 'ok' });
      else if (comfort >= 1.7) lines.push({ text: 'gut gelaunt – sitzt trocken in der Wartehalle', cls: 'ok' });
      else if (comfort > 1) lines.push({ text: 'gut gelaunt – hier lässt es sich aushalten', cls: 'ok' });
      else lines.push({ text: 'ganz entspannt – noch ist alles im Plan' });
    }
    lines.push({ text: trip.purpose, cls: 'muted' });
    return { id, name: trip.name, lines, mood };
  }

  /** Stimmung aller Wartenden: Anteil verärgert / glücklich (für die Anzeige) */
  /** Position und Stimmung aller Fahrgäste (Ebenen RM-FR-UI-12): 1 gut, 0 naja, −1 sauer */
  samples() {
    return this.list.map((p) => {
      let mood = 1;
      if (p.state === 'leave' || p.state === 'arrive') mood = (p.trip.late ?? 0) >= 3 ? -1 : p.trip.dirty ? 0 : 1;
      else if (p.waited > 2 * this.patience(p)) mood = -1;
      else if (p.waited > this.patience(p)) mood = 0;
      return { x: p.x, y: p.y, mood };
    });
  }

  moodSummary() {
    let angry = 0, waiting = 0;
    for (const p of this.list) {
      if (p.state !== 'idle' && p.state !== 'walk') continue;
      waiting++;
      if (p.waited > 2 * this.patience(p)) angry++;
    }
    return { waiting, angry };
  }
}
