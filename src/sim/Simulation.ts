import { ACC, CAR_LEN, DEC, LOOP_SLACK, MAIN_ROW, MAP_W, PASSING_LOOPS, SECOND_ROW, START_TIME, TILE } from '../config';
import { Dir, Edge, edgeRow, isOut, Network, ParkKind, SortRun } from '../world/Network';
import { INDUSTRY_BY_ID } from '../world/industries';
import { inHours, LAYOVER_LEVEL, OPERATORS, Operator, OperatorId, SORT_DESTS } from './Operators';

/** Aufgaben eines Zuges, der Reihe nach abgearbeitet */
export type Job =
  | { k: 'stop'; board: boolean; alight: boolean }
  | { k: 'exit'; dir?: Dir }
  | { k: 'park'; until: number; wash?: boolean }
  | { k: 'hump' }
  | { k: 'load'; ind: string };

export type TrainState = 'queued' | 'running' | 'dwell' | 'parked' | 'rolling' | 'stored' | 'done';

export interface Train {
  id: number;
  op: Operator;
  number: string;
  dir: Dir;
  /** Sprite-Arten je Wagen ab Zugspitze (loco, coach, wagon0..2 …) */
  cars: string[];
  length: number;
  plannedSpawn: number;
  plannedExit: number;
  route: Edge[];
  /** Start-Distanz jeder Kante auf der Route */
  start: number[];
  /** Kopfposition (Distanz entlang Route) */
  s: number;
  v: number;
  /** Index der letzten reservierten Kante */
  committed: number;
  state: TrainState;
  jobs: Job[];
  dwellLeft: number;
  waiting: boolean;
  passengers: number;
  capacity: number;
  reserved: Set<number>;
  /** Verschmutzung/Verschleiß 0..100 (hoch = schlecht) */
  dirt: number;
  wear: number;
  /** Wendezeit in Minuten (0 = wendet sofort) */
  layover: number;
  nextReroute?: number;
  arrDelay?: number;
  /** hat gewendet (Wendezug) */
  turned?: boolean;
  washed?: boolean;
  parkedAt?: number;
  parkKind?: ParkKind;
  /** Rangieren: Zerlegezug ohne Lok am Abrollberg */
  rake?: boolean;
  /** Rangieren: Wagenziel und Richtungsgleis */
  dest?: number;
  sortRun?: string;
  /** Haltepunkt so viele Einheiten vor dem Routenende (Wagen hinter anderen Wagen) */
  endOffset?: number;
  /** Halt ausgefallen (kein erreichbarer Bahnsteig) */
  missedStop?: boolean;
  /** Ausfahrt aus dem Rangierbahnhof */
  departure?: boolean;
  /** Haltgebühr schon abgerechnet */
  paid?: boolean;
  /** fährt ohne Vertrag nur durch */
  transit?: boolean;
  /** geschätzte Weiterfahrt nach dem aktuellen Ziel (nur für die Deadlock-Prüfung) */
  ahead?: Edge[];
  /** Grund, warum der Zug steht (für Anzeige) */
  note?: string;
  /** steht seit (Spielzeit) */
  waitSince?: number;
}

export type SimEvent =
  | { type: 'stop'; train: Train }
  | { type: 'turn'; train: Train }
  | { type: 'exit'; train: Train; delayMin: number; missed: boolean }
  | { type: 'service'; train: Train; kind: 'wash' | 'repair' | 'clean'; fee: number }
  | { type: 'park'; train: Train; kind: ParkKind }
  | { type: 'sorted'; dest: number; wagons: number; correct: number }
  | { type: 'note'; text: string }
  | { type: 'cancel'; train: Train };

/** Speicherbares Abbild eines Zuges */
export interface TrainSave extends Omit<Train, 'op' | 'route' | 'start' | 'reserved' | 'ahead'> {
  op: OperatorId;
  route: string[];
  reserved: number[];
}

export interface SimSave {
  time: number;
  level: number;
  nextId: number;
  nextSpawn: Record<OperatorId, number>;
  counter: Record<OperatorId, number>;
  nextDir: Record<OperatorId, Dir>;
  sortDep?: number[];
  vandalUntil?: number;
  festUntil?: number;
  queue: TrainSave[];
  trains: TrainSave[];
}

const SPAWN_HEAD = 152; // Kopf startet 8 Einheiten vor dem Kartenrand
const PLAN_AHEAD = 90 * 60;
const SHUNT_V = 1.4;
/** Höchstgeschwindigkeit im Verschubbereich (≈ 25 km/h) */
const SHUNT_AREA_V = (6 * TILE) / 60;
const ROLL_V = 2.2;
const SORT_SLOT = 30 * 60;
const SORT_MIN = 4;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Simulation {
  time = START_TIME;
  level = 1;
  trains: Train[] = [];
  queue: Train[] = [];
  readonly events: SimEvent[] = [];
  readonly owner: Int32Array;
  private nextId = 1;
  private nextSpawn = Object.fromEntries(Object.keys(OPERATORS).map((k, i) => [k, START_TIME + 120 + i * 300])) as Record<OperatorId, number>;
  private counter = Object.fromEntries(Object.keys(OPERATORS).map((k) => [k, 1])) as Record<OperatorId, number>;
  private nextDir = Object.fromEntries(Object.keys(OPERATORS).map((k, i) => [k, i % 2 ? 'W' : 'E'])) as Record<OperatorId, Dir>;
  /** nächste Abfahrt je Rangierziel */
  sortDep = [START_TIME + SORT_SLOT, START_TIME + SORT_SLOT + 600, START_TIME + SORT_SLOT + 1200];
  private noted = new Map<string, number>();
  /** Vertrag mit dem Unternehmen aktiv? (sonst nur Durchfahrt) */
  contractActive: (id: OperatorId) => boolean = () => true;
  /** Takt in Minuten je Unternehmen (0 = fährt nicht) – kommt aus den Verträgen */
  taktOf: (id: OperatorId) => number = () => 0;
  /** Züge in einem Stau-Kreis (gegenseitig blockiert) */
  deadlock: number[] | null = null;
  /** längster Bahnsteig mit Zugang (Felder) – Züge werden höchstens so lang */
  maxPlatform = 0;
  /** Höchstgeschwindigkeit im abzweigenden Strang einer Weiche */
  switchV = (10 * TILE) / 60;

  constructor(public net: Network, save?: SimSave) {
    this.owner = new Int32Array(net.grid.w * net.grid.h);
    if (save) this.restore(save);
    else this.fillTimetable();
  }

  // ------------------------------------------------------------ Fahrplan
  setLevel(level: number) {
    this.level = level;
  }

  /** Takt geändert / neuer Vertrag: geplante, noch ferne Züge des Unternehmens neu planen */
  retime(id: OperatorId) {
    const keepUntil = this.time + 600;
    this.queue = this.queue.filter((t) => t.op.id !== id || t.plannedSpawn <= keepUntil);
    const takt = this.taktOf(id);
    if (takt) {
      const last = Math.max(-Infinity, ...this.queue.filter((t) => t.op.id === id).map((t) => t.plannedSpawn));
      this.nextSpawn[id] = Math.max(last + takt * 60, this.time + 300);
    }
    this.fillTimetable();
  }

  fillTimetable() {
    for (const id of Object.keys(OPERATORS) as OperatorId[]) {
      const takt = this.taktOf(id);
      if (!takt) continue;
      if (this.nextSpawn[id] === undefined || this.nextSpawn[id] < this.time) this.nextSpawn[id] = this.time + 300;
      while (this.nextSpawn[id] < this.time + PLAN_AHEAD) {
        const at = this.nextSpawn[id];
        this.nextSpawn[id] += takt * 60;
        if (!inHours(OPERATORS[id], at)) continue;
        const dir = this.nextDir[id] ?? 'E';
        this.nextDir[id] = dir === 'E' ? 'W' : 'E';
        this.queue.push(this.createTrain(OPERATORS[id], at, dir));
      }
    }
    this.queue.sort((a, b) => a.plannedSpawn - b.plannedSpawn);
  }

  /** bis dahin kommen wegen Vandalismus viele verschmutzte Züge an (Zeitungsmeldung) */
  vandalUntil = 0;
  /** bis dahin mehr Fahrgäste (Volksfest) */
  festUntil = 0;
  private hasWash() {
    for (const e of this.net.edges.values()) if (e.wash) return true;
    return false;
  }

  private createTrain(op: Operator, at: number, dir: Dir): Train {
    let base = op.long && Math.random() < (op.longShare ?? 0) ? op.long : op.cars;
    if (op.needsStop && op.long) {
      // Personenzüge: so lang, wie der längste Bahnsteig erlaubt (lange Züge bringen mehr)
      const fit = this.maxPlatform;
      if (fit >= op.long.length && Math.random() < 0.6) base = op.long;
      else if (fit < op.long.length) base = op.cars;
      if (base === op.long && fit >= op.long.length + 2 && Math.random() < 0.4) {
        const extra = op.cars.includes('emu') || op.cars.includes('ecab') ? 'emu' : 'coach';
        const tail = base[base.length - 1];
        base = tail === 'cab' || tail === 'pcar' || tail === 'ecab' ? [...base.slice(0, -1), extra, extra, tail] : [...base, extra, extra];
      }
    }
    const cars = base.map((c) => (c === 'wagon' ? `wagon${Math.floor(Math.random() * 3)}` : c));
    const contract = this.contractActive(op.id);
    const length = cars.length * CAR_LEN;
    const back: Dir = dir === 'E' ? 'W' : 'E';
    const vandal = at < this.vandalUntil && op.needsStop;
    // Vandalismus: Wendezüge mit Waschanlage enden und fahren zum Waschen, auch vor der Wendezeit-Stufe
    const layover = contract && op.turnback && op.layover && (this.level >= LAYOVER_LEVEL || (vandal && this.hasWash())) ? Math.round(rnd(op.layover[0], op.layover[1])) : 0;
    let jobs: Job[];
    if (op.industry && contract) jobs = [{ k: 'load', ind: op.industry }, { k: 'exit', dir: back }];
    else if (op.kind === 'sort') jobs = [{ k: 'hump' }];
    else if (!op.needsStop || !contract) jobs = [{ k: 'exit' }];
    else if (op.turnback && layover) {
      jobs = [{ k: 'stop', alight: true, board: false }, { k: 'park', until: 0 }, { k: 'stop', alight: false, board: true }, { k: 'exit', dir: back }];
    } else if (op.turnback) jobs = [{ k: 'stop', alight: true, board: true }, { k: 'exit', dir: back }];
    else jobs = [{ k: 'stop', alight: true, board: true }, { k: 'exit' }];
    // Wendezug: hin zum Bahnhof (ca. Kartenmitte) und wieder zurück, plus 1 min zum Wenden
    const stops = op.needsStop && contract;
    const ind = op.industry && contract ? INDUSTRY_BY_ID[op.industry] : undefined;
    // Privatbahn: bis zum Ladegleis (plus Anschlussgleis) und zurück
    const indDist = ind ? 2 * ((dir === 'E' ? ind.x1 : MAP_W - ind.x0) + Math.abs(ind.row - MAIN_ROW) * 2 + 10) * TILE : 0;
    const dist = ind ? indDist : op.turnback && stops ? MAP_W * TILE + 2 * length : MAP_W * TILE + 12 + length;
    const stopLoss = ind ? op.dwell + 2 * (op.vmax / (2 * ACC) + op.vmax / (2 * DEC)) + 600 + 60
      : stops ? op.dwell + op.vmax / (2 * ACC) + op.vmax / (2 * DEC) + 60 + (op.turnback ? 60 : 0) : 0;
    const plannedSpawn = Math.round((at + (Math.random() * 4 - 2) * 60) / 60) * 60;
    const capacity = cars.filter((c) => c === 'coach' || c === 'cab' || c === 'emu' || c === 'ecab').length * 80;
    const paxScale = base.length / op.cars.length;
    const fest = at < this.festUntil ? 1.6 : 1;
    const passengers = !stops ? 0 : Math.min(capacity || 9999, Math.round((op.pax[0] + Math.random() * (op.pax[1] - op.pax[0])) * paxScale * fest));
    return {
      id: this.nextId++, op, cars, length, dir,
      number: `${op.short} ${op.numberBase + this.counter[op.id]++ * 2 - (dir === 'E' ? 1 : 0)}`,
      plannedSpawn,
      plannedExit: plannedSpawn + dist / op.vmax + stopLoss + layover * 60 + 120 + PASSING_LOOPS.length * LOOP_SLACK, // Reserve + Kreuzungen
      route: [], start: [], s: SPAWN_HEAD, v: 0, committed: 0,
      state: 'queued', jobs, dwellLeft: 0, waiting: false,
      passengers, capacity, reserved: new Set(),
      dirt: Math.round(vandal ? rnd(75, 98) : rnd(5, 85)), wear: Math.round(rnd(0, 85)), layover,
      transit: !contract && op.kind !== 'sort',
    };
  }

  // ------------------------------------------------------------ Netzänderung
  setNetwork(net: Network) {
    this.net = net;
    this.loopEdges.clear(); this.loopTwin.clear(); this.parkedCache.clear();
    for (const t of this.trains) {
      if (t.state === 'rolling' || t.state === 'stored') {
        const r = t.route.map((e) => net.edges.get(e.key));
        if (r.every(Boolean)) t.route = r as Edge[];
        continue;
      }
      const fresh: Edge[] = [];
      for (const e of t.route) {
        const ne = net.edges.get(e.key);
        if (!ne) break;
        fresh.push(ne);
      }
      if (fresh.length <= t.committed) continue; // reservierte Zellen sind für Umbauten gesperrt
      this.setRoute(t, fresh);
      if (t.state === 'running' && !t.rake) this.replan(t, t.committed, false);
    }
  }

  // ------------------------------------------------------------ Blöcke & Fahrstraßen
  blockOwner(b: number) {
    for (const k of this.net.blockCells.get(b) ?? []) if (this.owner[k]) return this.owner[k];
    return 0;
  }

  blockFree(b: number, id: number) {
    if (b < 0) return true;
    const cells = this.net.blockCells.get(b);
    return !cells || cells.every((k) => this.owner[k] === 0 || this.owner[k] === id);
  }

  /** Kanten-Indizes ab i bis einschließlich zum nächsten Signal in Fahrtrichtung (oder Ausfahrt) */
  private section(route: Edge[], i: number): number[] {
    const out: number[] = [];
    for (let j = i; j < route.length; j++) {
      out.push(j);
      if (route[j].signalAtEnd || isOut(route[j].key)) break;
    }
    return out;
  }

  private sectionBlocks(route: Edge[], idx: number[]) {
    const s = new Set<number>();
    for (const i of idx) if (route[i].block >= 0) s.add(route[i].block);
    return s;
  }

  private cellBlock?: Int32Array;
  private cellBlockNet?: Network;
  private blockOfCell(k: number) {
    if (!this.cellBlock || this.cellBlock.length !== this.owner.length || this.cellBlockNet !== this.net) {
      this.cellBlockNet = this.net;
      this.cellBlock = new Int32Array(this.owner.length).fill(-1);
      for (const [b, cells] of this.net.blockCells) for (const c of cells) this.cellBlock[c] = b;
    }
    return this.cellBlock[k];
  }

  private baseline = { time: -1, net: null as Network | null, set: new Set<number>() };
  private baselineUnsafe() {
    if (this.baseline.time !== this.time || this.baseline.net !== this.net) {
      this.baseline = { time: this.time, net: this.net, set: this.unsafeTrains() };
    }
    return this.baseline.set;
  }

  /**
   * Stau-Vorhersage: Jeder Zug fährt Abschnitt für Abschnitt (Signal zu Signal) seinen geplanten Weg weiter,
   * sobald alle Blöcke des nächsten Abschnitts frei sind, und gibt dabei die alten frei.
   * Züge, die so nie bis zum Ende ihres Weges kommen, stecken in einem Stau.
   * extra: Zug t hätte zusätzlich `blocks` reserviert und fährt danach `path`.
   */
  private unsafeTrains(extra?: { t: Train; blocks: Set<number>; legs: Edge[][]; route?: Edge[]; end?: number }): Set<number> {
    const owners = new Map<number, Set<number>>();
    const hold = (b: number, id: number) => { let o = owners.get(b); if (!o) owners.set(b, (o = new Set())); o.add(id); };
    type Sec = { blocks: Set<number>; anyOf: number[][]; last?: boolean; stop?: boolean; arrive?: Set<number> };
    const agents: { id: number; held: Set<number>; sections: Sec[] }[] = [];
    /**
     * Abschnitte je Teilweg; am Ende eines Teilwegs (Halt/Wenden/Abstellen) steht der Zug ganz im letzten Block.
     * In Kreuzungsstellen darf er jedes der beiden Gleise nehmen. Ab der zweiten Kreuzungsstelle ist er weit genug weg.
     */
    const sectionsOf = (legs: Edge[][]) => {
      const out: Sec[] = [];
      let cur: Sec = { blocks: new Set(), anyOf: [] };
      const push = () => { if (cur.blocks.size || cur.anyOf.length) out.push(cur); cur = { blocks: new Set(), anyOf: [] }; };
      let loops = 0, inLoop = false;
      outer: for (const leg of legs) {
        for (const e of leg) {
          const twin = e.block >= 0 ? this.loopTwinBlock(e.block) : -1;
          if (twin >= 0) {
            if (!inLoop) {
              inLoop = true;
              if (++loops === 2) { cur.anyOf.push([e.block, twin]); cur.last = true; push(); break outer; }
            }
            if (!cur.anyOf.some((g) => g[0] === e.block)) cur.anyOf.push([e.block, twin]);
          } else {
            if (e.block >= 0 && !this.isLoopEdge(e)) inLoop = false;
            if (e.block >= 0) cur.blocks.add(e.block);
          }
          if (e.signalAtEnd || isOut(e.key)) push();
        }
        push();
        const last = leg[leg.length - 1];
        const prev = out[out.length - 1];
        if (last && last.block >= 0 && prev && !prev.anyOf.length && !(prev.blocks.size === 1 && prev.blocks.has(last.block))) out.push({ blocks: new Set([last.block]), anyOf: [] });
        if (out.length) out[out.length - 1].stop = true;
      }
      push();
      // nur von Warteplatz zu Warteplatz fahren (Kreuzungsgleis, Halt, Ende): nie auf der eingleisigen Strecke stehen bleiben
      const merged: Sec[] = [];
      let acc: Sec | null = null;
      for (const sec of out) {
        if (!acc) acc = { blocks: new Set(sec.blocks), anyOf: [...sec.anyOf] };
        else { sec.blocks.forEach((b) => acc!.blocks.add(b)); acc.anyOf.push(...sec.anyOf); }
        if (sec.anyOf.length || sec.stop || sec.last) {
          // angekommen: steht dann nur noch im Kreuzungsgleis bzw. im letzten Abschnitt
          acc.arrive = sec.anyOf.length ? new Set() : new Set(sec.blocks);
          merged.push(acc); acc = null;
        }
      }
      if (acc) merged.push(acc);
      return merged;
    };
    const list = extra && !this.trains.includes(extra.t) ? [...this.trains, extra.t] : this.trains;
    for (const x of list) {
      const held = new Set<number>();
      if (extra && x === extra.t && extra.route && extra.end !== undefined) {
        // mit der neuen Fahrstraße: steht dann an deren Ende
        this.blocksAtEnd(x, extra.route, extra.end).forEach((b) => held.add(b));
      } else if (x.state === 'running' && !x.rake && x.route.length && x.committed < x.route.length) {
        // fährt bis ans Ende seiner Fahrstraße (die hat er sicher) – dahinter wird alles frei
        this.blocksAtEnd(x, x.route, x.committed).forEach((b) => held.add(b));
      } else {
        for (const k of x.reserved) { const b = this.blockOfCell(k); if (b >= 0) held.add(b); }
        if (extra && x === extra.t) extra.blocks.forEach((b) => held.add(b));
      }
      held.forEach((b) => hold(b, x.id));
      if (x.state === 'rolling' || x.state === 'stored') continue; // Wagen im Richtungsgleis bleiben stehen
      const legs = extra && x === extra.t ? extra.legs : x.state === 'parked' ? this.parkedPath(x) : [x.route.slice(x.committed + 1), x.ahead ?? []];
      const secs = sectionsOf(legs);
      agents.push({ id: x.id, held, sections: secs });
    }
    // Suche: Züge rücken von Warteplatz zu Warteplatz vor (Kreuzungsgleis, Halt). Wessen ganzer restlicher Weg frei ist,
    // kommt sicher durch und gibt alles frei. Findet sich eine Reihenfolge, in der alle durchkommen, gibt es keinen Stau.
    const n = agents.length;
    const free0 = (held: Set<number>[], b: number, i: number) => { for (let j = 0; j < n; j++) if (j !== i && held[j].has(b)) return false; return true; };
    const canFinish = (held: Set<number>[], pos: number[], i: number) => {
      const secs = agents[i].sections;
      for (let k = pos[i]; k < secs.length; k++) {
        const sec = secs[k];
        for (const b of sec.blocks) if (!free0(held, b, i)) return false;
        for (const g of sec.anyOf) if (!g.some((b) => free0(held, b, i))) return false;
      }
      return true;
    };
    const DONE = -1;
    let best = { done: -1, pos: [] as number[] };
    const seen = new Set<string>();
    let budget = 1500;
    const search = (held: Set<number>[], pos: number[]): boolean => {
      // alles, was durchkommt, sofort durchlassen (schadet nie)
      let again = true;
      while (again) {
        again = false;
        for (let i = 0; i < n; i++) if (pos[i] !== DONE && canFinish(held, pos, i)) { pos[i] = DONE; held[i] = new Set(); again = true; }
      }
      const nd = pos.filter((p) => p === DONE).length;
      if (nd > best.done) best = { done: nd, pos: [...pos] };
      if (nd === n) return true;
      if (--budget <= 0) return false;
      const key = pos.join(',') + '|' + held.map((h) => [...h].sort((x, y) => x - y).join('.')).join('/');
      if (seen.has(key)) return false;
      seen.add(key);
      for (let i = 0; i < n; i++) {
        if (pos[i] === DONE) continue;
        const sec = agents[i].sections[pos[i]];
        if (!sec) continue;
        if ([...sec.blocks].some((b) => !free0(held, b, i))) continue;
        const picks: number[] = [];
        let ok = true;
        for (const g of sec.anyOf) {
          const pick = g.find((b) => held[i].has(b)) ?? g.find((b) => free0(held, b, i));
          if (pick === undefined) { ok = false; break; }
          picks.push(pick);
        }
        if (!ok) continue;
        const h2 = [...held]; const p2 = [...pos];
        h2[i] = sec.arrive ? new Set([...sec.arrive, ...picks]) : new Set([...sec.blocks, ...picks]);
        p2[i] = pos[i] + 1;
        if (search(h2, p2)) return true;
      }
      return false;
    };
    search(agents.map((a) => new Set(a.held)), agents.map(() => 0));
    const stuckIds = new Set(agents.filter((_, i) => best.pos[i] !== DONE).map((a) => a.id));
    return stuckIds;
  }

  /** Block des Nachbargleises in derselben Kreuzungsstelle */
  private loopTwin = new Map<number, number>();
  private loopTwinBlock(b: number) {
    let v = this.loopTwin.get(b);
    if (v === undefined) {
      v = -1;
      const g = this.net.grid;
      const pure = (blk: number) => {
        const cs = this.net.blockCells.get(blk) ?? [];
        return cs.length > 0 && cs.every((k) => { const p = g.xy(k); return g.isLoopCell(p.x, p.y) && (p.y === MAIN_ROW || p.y === SECOND_ROW); })
          && new Set(cs.map((k) => g.xy(k).y)).size === 1;
      };
      const cells = this.net.blockCells.get(b) ?? [];
      if (cells.length && pure(b)) {
        const p = g.xy(cells[Math.floor(cells.length / 2)]);
        const o = this.blockOfCell(g.key(p.x, p.y === MAIN_ROW ? SECOND_ROW : MAIN_ROW));
        if (o >= 0 && o !== b && pure(o)) v = o;
      }
      if (v < 0) v = this.parallelBlocks().get(b) ?? -1;
      this.loopTwin.set(b, v);
    }
    return v;
  }

  private parallel?: { net: Network; map: Map<number, number> };
  /** Blöcke, die dieselben Nachbarblöcke verbinden (z.B. zwei Bahnhofsgleise zwischen denselben Weichen) */
  private parallelBlocks() {
    if (this.parallel?.net === this.net) return this.parallel.map;
    const prev = new Map<number, Set<number>>(), next = new Map<number, Set<number>>();
    const add = (m: Map<number, Set<number>>, b: number, x: number) => { let s2 = m.get(b); if (!s2) m.set(b, (s2 = new Set())); s2.add(x); };
    for (const e of this.net.edges.values()) {
      if (e.dir !== 'E' || e.block < 0) continue;
      for (const f of this.net.out.get(e.to) ?? []) {
        if (f.block < 0 || f.block === e.block) continue;
        add(next, e.block, f.block);
        add(prev, f.block, e.block);
      }
    }
    const sig = new Map<string, number[]>();
    for (const b of this.net.blockCells.keys()) {
      const p = prev.get(b), n2 = next.get(b);
      if (!p?.size || !n2?.size) continue;
      const k = [...p].sort().join(',') + '>' + [...n2].sort().join(',');
      if (!sig.has(k)) sig.set(k, []);
      sig.get(k)!.push(b);
    }
    const map = new Map<number, number>();
    for (const group of sig.values()) if (group.length === 2) { map.set(group[0], group[1]); map.set(group[1], group[0]); }
    this.parallel = { net: this.net, map };
    return map;
  }

  private parkedCache = new Map<number, { time: number; path: Edge[][] }>();
  /** abgestellter Zug: geschätzter Weg nach dem Abstellen (zum nächsten Halt und weiter) */
  private parkedPath(t: Train): Edge[][] {
    const c = this.parkedCache.get(t.id);
    if (c && this.time - c.time < 30) return c.path;
    const saved = t.jobs;
    const end = t.route[t.route.length - 1];
    let path: Edge[][] = [];
    if (end) {
      const leg1 = this.estimateAhead(t, [end]);
      t.jobs = saved.slice(1);
      const leg2 = leg1.length ? this.estimateAhead(t, leg1) : [];
      t.jobs = saved;
      path = [leg1, leg2];
    }
    this.parkedCache.set(t.id, { time: this.time, path });
    return path;
  }

  /** Blöcke, die der Zug belegt, wenn seine Spitze am Ende von route[end] steht */
  private blocksAtEnd(t: Train, route: Edge[], end: number) {
    const out = new Set<number>();
    let acc = 0;
    for (let i = end; i >= 0; i--) {
      const e = route[i];
      if (e.block >= 0) out.add(e.block);
      acc += e.len;
      if (acc >= t.length + 2) break;
    }
    return out;
  }

  /** macht diese Lage jemanden stecken, der vorher noch durchkam? */
  private worse(after: Set<number>) {
    const base = this.baselineUnsafe();
    for (const id of after) if (!base.has(id)) return true;
    return false;
  }

  /** versucht den nächsten Abschnitt ab route[i] zu reservieren */
  private trySection(t: Train, i: number): boolean {
    const idx = this.section(t.route, i);
    const blocks = this.sectionBlocks(t.route, idx);
    for (const b of blocks) if (!this.blockFree(b, t.id)) return false;
    // Nur reservieren, wenn danach noch alle Züge der Reihe nach ans Ziel kommen (kein Stau entsteht)
    const after = this.unsafeTrains({ t, blocks, legs: [t.route.slice(idx[0]), t.ahead ?? []], route: t.route, end: idx[idx.length - 1] });
    if (after.has(t.id)) return false;
    // andere Züge kämen danach nicht mehr weiter – nur zulassen, wenn sonst alles steht (gegenseitiges Höflichsein auflösen)
    // andere Züge kämen danach nicht mehr weiter – dann lieber warten
    if (this.worse(after)) return false;
    for (const b of blocks) this.reserve(t, b);
    t.committed = idx[idx.length - 1];
    return true;
  }

  // ------------------------------------------------------------ Ziele & Routenwahl
  /** Streckengleis in Fahrtrichtung: Linksverkehr, sobald zweigleisig */
  preferredRow(dir: Dir) {
    if (!this.net.grid.mainRows.includes(SECOND_ROW)) return MAIN_ROW;
    return dir === 'E' ? MAIN_ROW : SECOND_ROW;
  }

  private electric(t: Train) { return t.op.traction === 'electric'; }

  /** Kandidatenwege für die aktuelle Aufgabe ab Port `from` */
  private candidates(t: Train, from: string, job: Job | undefined, estimate = false): Edge[][] {
    if (!job || isOut(from)) return [];
    // Hochgeschwindigkeitszüge: nur gerade Gleise und Schnellfahrweichen
    if (t.op.highSpeed) return this.candidatesRaw(t, from, job, estimate).filter((p) => p.every((e) => !e.curvy));
    return this.candidatesRaw(t, from, job, estimate);
  }

  private candidatesRaw(t: Train, from: string, job: Job, estimate: boolean): Edge[][] {
    const el = this.electric(t);
    switch (job.k) {
      case 'stop':
        return this.net.pathsTo(from, (e) => !!e.stopRun && e.stopRun.accessible && e.stopRun.len * TILE >= t.length, el);
      case 'park': {
        let c = this.net.pathsTo(from, (e) => !!e.parkRun && e.parkRun.len * TILE >= t.length && (estimate || this.blockFree(e.block, t.id)), el);
        if (job.wash) { const w = c.filter((p) => p.some((e) => e.wash)); if (w.length) c = w; }
        return c;
      }
      case 'hump':
        return this.net.pathsTo(from, (e) => e.hump, el, 50);
      case 'load': {
        // bis ans Ende des Ladegleises (Prellbock) – Pendelfahrt: dort wenden und zurück
        const end = this.net.pathsTo(from, (e) => e.industry === job.ind && !(this.net.out.get(e.to) ?? []).some((f) => f.industry === job.ind), el, 50);
        return end.length ? end : this.net.pathsTo(from, (e) => e.industry === job.ind, el, 50);
      }
      case 'exit':
        if (job.dir && job.dir !== t.dir) return [];
        return this.net.paths(from, el);
    }
  }

  private score(t: Train, p: Edge[], job: Job) {
    let score = p.reduce((a, e) => a + e.len + (e.diverging ? 20 : 0), 0);
    const busy = new Set<number>();
    for (const e of p) if (e.block >= 0 && !this.blockFree(e.block, t.id)) busy.add(e.block);
    score += busy.size * 1500;
    const last = p[p.length - 1];
    if (job.k === 'stop' && last.stopRun) {
      const id = last.stopRun.id;
      const assigned = this.trains.filter((o) => o !== t && o.jobs[0]?.k === 'stop' && o.route[o.route.length - 1]?.stopRun?.id === id).length;
      score += assigned * 2000;
    }
    if (job.k === 'park' && last.parkRun) {
      const k = last.parkRun.kind;
      if (k === 'workshop') score += t.wear > 60 ? -3000 : 1500;
      if (k === 'remise') score -= 500;
      if (job.wash && p.some((e) => e.wash)) score -= 2000;
    }
    if (job.k === 'exit') {
      score += p.filter((e) => e.atPlatform).length * 200;
      if (edgeRow(last.key) !== this.preferredRow(t.dir)) score += 800;
    }
    return score;
  }

  /** bester Weg ab route[fromIdx].to für die aktuelle Aufgabe. requireFree: erster Abschnitt frei + kein Deadlock */
  private bestPath(t: Train, fromIdx: number, requireFree: boolean): Edge[] | null {
    const job = t.jobs[0];
    const raw = this.candidates(t, t.route[fromIdx].to, job).filter((p) => p.length);
    // nach Güte sortiert; die (teure) Stau-Prüfung nur für die besten paar Wege
    const ranked = raw.map((p) => ({ p, score: this.score(t, p, job!) })).sort((x, y) => x.score - y.score);
    let checks = 0;
    for (const { p } of ranked) {
      if (requireFree) {
        const idx = this.section(p, 0);
        const first = this.sectionBlocks(p, idx);
        if (![...first].every((b) => this.blockFree(b, t.id))) continue;
        if (++checks > 12) return null;
        const full = [...t.route.slice(0, fromIdx + 1), ...p];
        const after = this.unsafeTrains({ t, blocks: first, legs: [p, this.estimateAhead(t, p)], route: full, end: fromIdx + 1 + idx[idx.length - 1] });
        if (after.has(t.id) || this.worse(after)) continue;
        return p;
      }
      // Weg, auf dem der Zug sicher stecken bliebe (Gegenzug auf demselben Gleis), möglichst meiden
      if (++checks > 12) break;
      const after = this.unsafeTrains({ t, blocks: new Set(), legs: [p, this.estimateAhead(t, p)] });
      if (!after.has(t.id)) return p;
    }
    return requireFree ? null : ranked[0]?.p ?? null;
  }

  /** geschätzter Weg nach dem aktuellen Ziel (für die Deadlock-Prüfung) */
  private estimateAhead(t: Train, path: Edge[]): Edge[] {
    const next = t.jobs[1];
    if (!next) return [];
    const end = path[path.length - 1];
    /** nach dem Wenden: tatsächlichen Weg in Gegenrichtung schätzen */
    const afterReverse = () => {
      const rev = this.net.twin(end);
      if (!rev) return null;
      const saved = t.dir;
      t.dir = saved === 'E' ? 'W' : 'E';
      const c2 = this.candidates(t, rev.to, next, true);
      t.dir = saved;
      return c2[0] ? [rev, ...c2[0]] : null;
    };
    /** notfalls: denselben Weg zurück */
    const back = () => [...t.route, ...path].reverse().map((e) => this.net.twin(e)).filter((e): e is Edge => !!e);
    if (t.op.turnback && !t.turned && next.k !== 'park') return afterReverse() ?? back();
    const c = this.candidates(t, end.to, next, true);
    if (c[0]) return c[0];
    // muss dort wenden (z.B. im Stumpfgleis)
    if (this.canReverse(t)) return afterReverse() ?? back();
    return [];
  }

  private setRoute(t: Train, route: Edge[]) {
    t.route = route;
    t.start = [];
    let acc = 0;
    for (const e of route) { t.start.push(acc); acc += e.len; }
  }

  /** Route ab route[fromIdx] neu planen (ohne Wenden) */
  private replan(t: Train, fromIdx: number, requireFree: boolean) {
    const p = this.bestPath(t, fromIdx, requireFree);
    if (!p) return false;
    this.setRoute(t, t.route.slice(0, fromIdx + 1).concat(p));
    t.ahead = this.estimateAhead(t, p);
    return true;
  }

  private canReverse(t: Train) {
    return !!t.op.turnback || !!t.departure;
  }

  /** nächste Aufgabe anfahren; steht der Zug, darf er dafür auch wenden */
  private planNext(t: Train) {
    const job = t.jobs[0];
    if (!job) return;
    t.note = undefined;
    const last = t.route.length - 1;
    if (this.replan(t, last, false)) return;
    if (this.canReverse(t)) {
      this.reverse(t);
      if (this.replan(t, t.route.length - 1, false)) return;
    }
    // Ziel nicht erreichbar
    if (job.k === 'stop') {
      t.missedStop = true;
      t.jobs.shift();
      this.note(`nostop:${t.op.id}`, `${t.number}: kein erreichbarer Bahnsteig (Zugang? Länge? Oberleitung?)`);
      this.planNext(t);
    } else if (job.k === 'park') {
      // kein Abstellplatz: bleibt am Bahnsteig stehen
      t.state = 'parked';
      t.parkedAt = this.time;
      t.parkKind = undefined;
      t.note = 'kein Abstellgleis frei';
      this.note(`nopark:${t.op.id}`, `${t.number} findet kein Abstellgleis und blockiert den Bahnsteig`);
    } else if (job.k === 'hump') {
      t.jobs = [{ k: 'exit' }];
      this.note('nohump', `${t.number}: kein Abrollberg erreichbar – fährt durch`);
      this.planNext(t);
    } else {
      t.note = 'kein Weg zur Ausfahrt';
    }
  }

  private note(key: string, text: string) {
    const last = this.noted.get(key) ?? -Infinity;
    if (this.time - last < 1800) return;
    this.noted.set(key, this.time);
    this.events.push({ type: 'note', text });
  }

  // ------------------------------------------------------------ Simulation
  step(dtGame: number) {
    let rest = dtGame;
    while (rest > 0) {
      const dt = Math.min(0.5, rest);
      rest -= dt;
      this.time += dt;
      this.spawn('E');
      this.spawn('W');
      for (const t of [...this.trains]) {
        if (t.state === 'rolling') this.rollWagon(t, dt);
        else if (t.state !== 'stored' && t.state !== 'done') this.moveTrain(t, dt);
      }
      this.sortDepartures();
      if (Math.floor(this.time / 30) !== Math.floor((this.time - dt) / 30)) this.deadlock = this.findDeadlock();
      this.trains = this.trains.filter((t) => t.state !== 'done');
    }
    this.fillTimetable();
  }

  private spawn(dir: Dir) {
    const t = this.queue.find((q) => q.dir === dir);
    if (!t || t.plannedSpawn > this.time) return;
    let best: { entry: Edge; p: Edge[]; score: number; missed: boolean } | null = null;
    let anyBusy = false;
    for (const entry of this.net.entries) {
      if (entry.dir !== dir) continue;
      const busy = this.trains.some((o) => o.route[0]?.key === entry.key && o.s - o.length < entry.len + 4);
      if (busy) { anyBusy = true; continue; }
      t.route = [entry];
      let p = this.bestPath(t, 0, false);
      let missed = false;
      if (!p && t.jobs[0]?.k !== 'exit') {
        // Ziel (Bahnsteig/Abrollberg) nicht erreichbar: durchfahren
        const saved = t.jobs;
        t.jobs = [{ k: 'exit' }];
        p = this.bestPath(t, 0, false);
        t.jobs = saved;
        missed = true;
      }
      if (!p) continue;
      const score = this.score(t, p, missed ? { k: 'exit' } : t.jobs[0]) + (edgeRow(entry.key) !== this.preferredRow(dir) ? 800 : 0) + (missed ? 1e5 : 0);
      if (!best || score < best.score) best = { entry, p, score, missed };
    }
    t.route = [];
    if (!best) {
      if (!anyBusy && this.time - t.plannedSpawn > 600) this.note(`noroute:${t.op.id}`, `${t.number} kommt nicht durch – fehlt Oberleitung oder Gleis?`);
      return;
    }
    this.queue.splice(this.queue.indexOf(t), 1);
    t.state = 'running';
    if (best.missed) {
      if (t.jobs[0].k === 'stop') { t.missedStop = true; this.note(`nostop:${t.op.id}`, `${t.number}: kein erreichbarer Bahnsteig (Zugang? Länge? Oberleitung?)`); }
      if (t.jobs[0].k === 'hump') this.note('nohump', `${t.number}: kein Abrollberg erreichbar – fährt durch`);
      t.jobs = [{ k: 'exit' }];
    }
    this.setRoute(t, [best.entry, ...best.p]);
    t.ahead = this.estimateAhead(t, best.p);
    t.v = t.op.vmax;
    this.trains.push(t);
  }

  private reserve(t: Train, b: number) {
    if (b < 0) return;
    for (const k of this.net.blockCells.get(b) ?? []) {
      this.owner[k] = t.id;
      t.reserved.add(k);
    }
  }

  private vmax(t: Train) {
    if (t.rake) return SHUNT_V;
    let v = t.op.vmax * (t.wear > 80 ? 0.75 : 1);
    const hi = this.edgeIndexAt(t, Math.max(0, t.s - 0.01));
    const head = t.route[hi];
    if (head?.wash || t.departure && t.s < 300) v = Math.min(v, t.op.vmax * 0.35);
    // Verschubbereich: Schrittgeschwindigkeit (ganzer Zug + Bremsweg davor)
    if (v > SHUNT_AREA_V) {
      const ti = this.edgeIndexAt(t, Math.max(0, t.s - t.length));
      for (let i = ti; i < t.route.length && i <= hi + 4; i++) {
        if (!t.route[i].shunt) continue;
        const ahead = t.start[i] - t.s;
        v = Math.min(v, ahead <= 0 ? SHUNT_AREA_V : Math.sqrt(SHUNT_AREA_V * SHUNT_AREA_V + 2 * DEC * ahead));
      }
    }
    // Weichen im abzweigenden Strang: langsam befahren (ganzer Zug + Bremsweg davor)
    if (v > this.switchV) {
      const ti = this.edgeIndexAt(t, Math.max(0, t.s - t.length));
      for (let i = ti; i < t.route.length && i <= hi + 4; i++) {
        const e = t.route[i];
        if (!e.diverging || e.fast) continue;
        const ahead = t.start[i] - t.s;
        const vi = ahead <= 0 ? this.switchV : Math.sqrt(this.switchV * this.switchV + 2 * DEC * ahead);
        v = Math.min(v, vi);
      }
    }
    return v;
  }

  private loopEdges = new Map<string, boolean>();
  /** Kante liegt ganz in einer Kreuzungsstelle des Netzbetreibers */
  private isLoopEdge(e: Edge) {
    let v = this.loopEdges.get(e.key);
    if (v === undefined) {
      const g = this.net.grid;
      v = e.cells.length > 0 && e.cells.every((k) => { const p = g.xy(k); return g.isLoopCell(p.x, p.y); });
      this.loopEdges.set(e.key, v);
    }
    return v;
  }

  /** Vertrag geändert: wartende Züge des Unternehmens neu planen */
  recontract(id: OperatorId) {
    this.queue = this.queue.map((t) => (t.op.id === id && t.state === 'queued' ? { ...this.createTrain(t.op, t.plannedSpawn, t.dir), number: t.number } : t));
  }

  private moveTrain(t: Train, dt: number) {
    if (t.state === 'dwell') {
      t.dwellLeft -= dt;
      if (t.dwellLeft <= 0) {
        const job = t.jobs.shift();
        t.state = 'running';
        if (job?.k === 'stop' && job.board) this.events.push({ type: 'stop', train: t });
        this.planNext(t);
      }
      this.release(t);
      return;
    }
    if (t.state === 'parked') {
      const job = t.jobs[0];
      if (job?.k === 'park' && this.time >= job.until) {
        this.serviceAfterPark(t);
        t.jobs.shift();
        t.state = 'running';
        this.planNext(t);
      }
      return;
    }
    if (t.note === 'kein Weg zur Ausfahrt' && (t.nextReroute ?? 0) <= this.time) {
      t.nextReroute = this.time + 10;
      this.planNext(t);
    }

    // Fahrstraße bis zum nächsten Signal reservieren
    while (t.committed + 1 < t.route.length) {
      const endS = t.start[t.committed] + t.route[t.committed].len;
      if (endS - t.s > (t.v * t.v) / (2 * DEC) + 24) break;
      if (this.trySection(t, t.committed + 1)) continue;
      if ((t.nextReroute ?? 0) > this.time || t.rake) break;
      t.nextReroute = this.time + 5;
      const rest = t.route.slice(t.committed + 1);
      const alt = this.bestPath(t, t.committed, true);
      if (alt && (alt.length !== rest.length || alt.some((e, k) => e !== rest[k]))) {
        this.setRoute(t, t.route.slice(0, t.committed + 1).concat(alt));
        t.ahead = this.estimateAhead(t, alt);
        if (this.trySection(t, t.committed + 1)) continue;
      }
      break;
    }

    const last = t.route.length - 1;
    const endS = t.start[t.committed] + t.route[t.committed].len;
    let lim = endS - 0.5 - t.s;
    const goalEnd = !isOut(t.route[last].key) && (t.jobs.length > 0 || !!t.rake);
    const stopS = goalEnd ? t.start[last] + t.route[last].len - 1.5 - (t.endOffset ?? 0) : Infinity;
    if (goalEnd) lim = Math.min(lim, stopS - t.s);
    const vAllowed = Math.sqrt(2 * DEC * Math.max(0, lim));
    t.v = Math.min(this.vmax(t), t.v + ACC * dt, vAllowed);
    t.s += Math.min(t.v * dt, Math.max(0, lim));
    t.waiting = t.v < 0.05;
    if (t.waiting) t.waitSince ??= this.time; else t.waitSince = undefined;

    // Waschanlage durchfahren
    if (!t.washed) {
      const tailIdx = this.edgeIndexAt(t, Math.max(0, t.s - t.length));
      if (t.route[tailIdx]?.wash === false && tailIdx > 0 && t.route[tailIdx - 1].wash) {
        t.washed = true;
        t.dirt = 0;
        this.events.push({ type: 'service', train: t, kind: 'wash', fee: 150 });
      }
    }

    if (goalEnd && stopS - t.s < 0.3 && t.v < 0.3) {
      t.s = stopS;
      t.v = 0;
      t.waiting = false;
      this.arrive(t);
    }

    this.release(t);

    if (isOut(t.route[last].key) && t.s - t.length >= t.start[last] + 4) {
      for (const k of t.reserved) if (this.owner[k] === t.id) this.owner[k] = 0;
      t.reserved.clear();
      t.state = 'done';
      if (t.op.kind !== 'sort') {
        this.events.push({
          type: 'exit', train: t,
          delayMin: (this.time - t.plannedExit) / 60,
          missed: t.op.needsStop && !!t.missedStop,
        });
      }
    }
  }

  /** geplante Abfahrt am Bahnhof (Wendezüge) */
  /** planmäßige Ankunft am Bahnhof (grob: Kartenmitte) */
  private dueAt(t: Train) {
    return t.plannedSpawn + (MAP_W * TILE / 2) / t.op.vmax + 60;
  }

  /** so viele Spielsekunden ist der überfälligste Zug, der hier noch Fahrgäste mitnehmen soll, schon zu spät (0 = alles im Plan) */
  overdue() {
    let worst = 0;
    for (const t of [...this.queue, ...this.trains]) {
      if (t.missedStop || t.op.kind === 'sort') continue;
      const i = t.jobs.findIndex((j) => j.k === 'stop' && j.board);
      if (i < 0) continue;
      const job = t.jobs[i] as Extract<Job, { k: 'stop' }>;
      if (i === 0 && t.state === 'dwell') continue; // steht schon da
      const due = job.alight ? this.dueAt(t) : this.plannedDeparture(t) - 120;
      worst = Math.max(worst, this.time - due);
    }
    return worst;
  }

  /** Verspätung in Minuten beim Einsteigen */
  boardDelay(t: Train) {
    const job = t.jobs[0];
    if (job?.k === 'stop' && !job.alight) return Math.max(0, (this.time - this.plannedDeparture(t)) / 60);
    return Math.max(0, t.arrDelay ?? 0);
  }

  private plannedDeparture(t: Train) {
    return t.plannedExit - (MAP_W * TILE / 2 + t.length) / t.op.vmax - 180;
  }

  /** Zug steht am Ziel seiner Route */
  private arrive(t: Train) {
    if (t.rake) { this.releaseWagon(t); return; }
    const job = t.jobs[0];
    if (!job) return;
    if (job.k === 'stop') {
      t.state = 'dwell';
      t.dwellLeft = job.board ? t.op.dwell + (t.passengers / 100) * 20 : 40 + (t.passengers / 100) * 15;
      if (job.alight) {
        const nominal = (t.s - SPAWN_HEAD) / t.op.vmax + t.op.vmax / (2 * DEC) + 60;
        t.arrDelay = (this.time - (t.plannedSpawn + nominal)) / 60;
      }
      // Wendezug mit Wendezeit: Abstellzeit festlegen
      const park = t.jobs[1];
      if (park?.k === 'park') {
        park.until = Math.max(this.time + 300, this.plannedDeparture(t) - 6 * 60);
        park.wash = t.dirt > 50;
      }
      // Einsteigen erst kurz vor der Abfahrt
      if (job.board && !job.alight) t.dwellLeft = Math.max(t.dwellLeft, this.plannedDeparture(t) - this.time);
      return;
    }
    if (job.k === 'load') {
      t.state = 'dwell';
      t.dwellLeft = t.op.dwell;
      return;
    }
    if (job.k === 'park') {
      t.state = 'parked';
      t.parkedAt = this.time;
      t.parkKind = t.route[t.route.length - 1].parkRun?.kind;
      if (t.parkKind) this.events.push({ type: 'park', train: t, kind: t.parkKind });
      return;
    }
    if (job.k === 'hump') {
      // Lok abkuppeln, Wagen werden über den Berg gedrückt
      t.cars.shift();
      t.length -= CAR_LEN;
      t.s -= CAR_LEN;
      t.rake = true;
      t.jobs = [];
      t.state = 'running';
      this.events.push({ type: 'note', text: `${t.number} am Abrollberg: ${t.cars.length} Wagen werden zerlegt` });
    }
  }

  private serviceAfterPark(t: Train) {
    const mins = (this.time - (t.parkedAt ?? this.time)) / 60;
    if (t.parkKind === 'workshop' && mins >= 10 && t.wear > 30) {
      t.wear = 0;
      this.events.push({ type: 'service', train: t, kind: 'repair', fee: 400 });
    } else if (t.parkKind === 'remise' && t.dirt > 20) {
      t.dirt = Math.round(t.dirt * 0.3);
      this.events.push({ type: 'service', train: t, kind: 'clean', fee: 100 });
    }
  }

  // ------------------------------------------------------------ Rangieren
  /** Wagen, die in einem Richtungsgleis stehen oder dorthin rollen */
  storedIn(runId: string) {
    return this.trains.filter((w) => w.sortRun === runId && (w.state === 'stored' || w.state === 'rolling'));
  }

  /** vorderen Wagen am Abrollberg lösen und ins Richtungsgleis rollen lassen */
  private releaseWagon(rake: Train) {
    if (!rake.cars.length) { this.finishRake(rake); return; }
    const kind = rake.cars[0];
    const dest = Number(kind.replace('wagon', ''));
    const from = rake.route[rake.route.length - 1].to;
    const hasSpace = (e: Edge) => !!e.sortRun && this.storedIn(e.sortRun.id).length < e.sortRun.len - 1;
    let paths = this.net.pathsTo(from, (e) => hasSpace(e) && e.sortRun!.dest === dest, false, 40);
    // Richtungsgleis fehlt oder voll: Fehlleitung in ein anderes freies Richtungsgleis
    if (!paths.length) {
      paths = this.net.pathsTo(from, hasSpace, false, 40);
      if (paths.length) this.note(`missort:${dest}`, `Richtungsgleis ${SORT_DESTS[dest].name} fehlt/voll – Wagen wird fehlgeleitet`);
    }
    if (!paths.length) {
      rake.note = 'alle Richtungsgleise voll';
      this.note(`sortfull:${dest}`, `Abrollberg wartet: ${rake.note}`);
      return;
    }
    rake.note = undefined;
    const p = paths.sort((a, b) => a.length - b.length)[0];
    const run = p[p.length - 1].sortRun!;
    const before = this.storedIn(run.id).length;
    const w: Train = {
      id: this.nextId++, op: rake.op, number: `Wagen → ${SORT_DESTS[dest].name}`, dir: rake.dir, cars: [kind], length: CAR_LEN,
      plannedSpawn: this.time, plannedExit: this.time, route: [], start: [], s: CAR_LEN / 2, v: ROLL_V, committed: 0,
      state: 'rolling', jobs: [], dwellLeft: 0, waiting: false, passengers: 0, capacity: 0, reserved: new Set(),
      dirt: 0, wear: 0, layover: 0, dest, sortRun: run.id, endOffset: before * CAR_LEN,
    };
    this.setRoute(w, p);
    this.trains.push(w);
    rake.cars.shift();
    rake.length -= CAR_LEN;
    rake.s -= CAR_LEN;
    if (!rake.cars.length) this.finishRake(rake);
  }

  private finishRake(rake: Train) {
    for (const k of rake.reserved) if (this.owner[k] === rake.id) this.owner[k] = 0;
    rake.reserved.clear();
    rake.state = 'done';
  }

  /** Wagen rollt (ohne Fahrstraße) ins Richtungsgleis und kuppelt an */
  private rollWagon(w: Train, dt: number) {
    const last = w.route.length - 1;
    const stopS = w.start[last] + w.route[last].len - 1.5 - (w.endOffset ?? 0);
    const lim = stopS - w.s;
    // nicht in einen von einem Zug belegten Abschnitt rollen
    const head = this.edgeIndexAt(w, Math.max(0, w.s + 4));
    const blocked = w.route[head].path.some((k) => { const o = this.owner[k]; return o !== 0 && o !== w.id && !this.isShunt(o); });
    w.v = blocked ? 0 : Math.min(ROLL_V, Math.sqrt(2 * DEC * Math.max(0, lim)) + 0.05);
    w.s += Math.min(w.v * dt, Math.max(0, lim));
    // belegte Zellen markieren
    const tail = this.edgeIndexAt(w, Math.max(0, w.s - w.length));
    const cur = this.edgeIndexAt(w, Math.max(0, w.s - 0.01));
    const now = new Set<number>();
    for (let i = tail; i <= cur; i++) for (const k of w.route[i].path) now.add(k);
    for (const k of w.reserved) if (!now.has(k)) { if (this.owner[k] === w.id) this.owner[k] = 0; w.reserved.delete(k); }
    for (const k of now) if (this.owner[k] === 0) { this.owner[k] = w.id; w.reserved.add(k); }
    if (lim < 0.2) { w.s = stopS; w.v = 0; w.state = 'stored'; }
  }

  private isShunt(id: number) {
    const t = this.trains.find((x) => x.id === id);
    return !!t && (t.state === 'rolling' || t.state === 'stored' || !!t.rake);
  }

  /** volle Richtungsgleise fahren zu festen Zeiten als neuer Zug ab */
  private sortDepartures() {
    for (let d = 0; d < SORT_DESTS.length; d++) {
      if (this.time < this.sortDep[d]) continue;
      this.sortDep[d] += SORT_SLOT;
      for (const run of this.net.sortRuns.filter((r) => r.dest === d)) {
        const wagons = this.storedIn(run.id);
        if (wagons.length < SORT_MIN || wagons.some((w) => w.state !== 'stored')) continue;
        if (this.departSort(run, wagons)) break;
      }
    }
  }

  private departSort(run: SortRun, wagons: Train[]): boolean {
    const inDir = wagons[0].dir;
    const dir: Dir = inDir === 'E' ? 'W' : 'E';
    // Kanten des Richtungsgleises in Abfahrtsrichtung, vom Gleisende aus
    const keys: string[] = [];
    if (dir === 'W') for (let x = run.x1; x >= run.x0; x--) keys.push(`p:${x},${run.row}<`);
    else for (let x = run.x0; x <= run.x1; x++) keys.push(`p:${x},${run.row}>`);
    const route = keys.map((k) => this.net.edges.get(k)).filter((e): e is Edge => !!e);
    if (route.length !== keys.length) return false;
    const op = OPERATORS.cs;
    const sorted = [...wagons].sort((a, b) => (b.endOffset ?? 0) - (a.endOffset ?? 0));
    const t: Train = {
      id: this.nextId++, op, number: `${op.short} ${op.numberBase + this.counter.cs++ * 2}`, dir,
      cars: ['loco', ...sorted.map((w) => w.cars[0])],
      length: (wagons.length + 1) * CAR_LEN, plannedSpawn: this.time, plannedExit: this.time + 3600,
      route: [], start: [], s: 0, v: 0, committed: 0, state: 'running', jobs: [{ k: 'exit' }], dwellLeft: 0,
      waiting: false, passengers: 0, capacity: 0, reserved: new Set(), dirt: 0, wear: 0, layover: 0, departure: true,
    };
    this.setRoute(t, route);
    t.s = 1.5 + t.length;
    if (t.s > t.start[route.length - 1] + route[route.length - 1].len) return false;
    t.committed = this.edgeIndexAt(t, t.s - 0.01);
    // Wagen übergeben
    for (const w of wagons) {
      for (const k of w.reserved) if (this.owner[k] === w.id) this.owner[k] = 0;
      w.state = 'done';
    }
    for (let i = 0; i <= t.committed; i++) this.reserve(t, route[i].block);
    if (!this.replan(t, route.length - 1, false)) t.note = 'kein Weg zur Ausfahrt';
    this.trains.push(t);
    this.events.push({ type: 'sorted', dest: run.dest, wagons: wagons.length, correct: wagons.filter((w) => w.dest === run.dest).length });
    return true;
  }

  /**
   * Notbremse gegen Blockaden: stehen mehrere Züge seit Minuten im Kreis aufeinander wartend,
   * fällt der zuletzt eingefahrene aus (Strafe), damit der Rest weiterfahren kann.
   */
  /** Züge, die sich gegenseitig blockieren (Kreis), sonst null */
  private findDeadlock(): number[] | null {
    const stuck = this.trains.filter((t) => t.state === 'running' && !t.rake && t.waiting && t.waitSince !== undefined && this.time - t.waitSince > 240);
    if (stuck.length < 2) return null;
    // wer wartet auf wen (nächster Abschnitt belegt)?
    const waitsOn = new Map<number, number[]>();
    for (const t of stuck) {
      const idx = this.section(t.route, Math.min(t.committed + 1, t.route.length - 1));
      const set = new Set<number>();
      for (const b of this.sectionBlocks(t.route, idx)) {
        for (const k of this.net.blockCells.get(b) ?? []) { const o = this.owner[k]; if (o && o !== t.id) set.add(o); }
      }
      waitsOn.set(t.id, [...set]);
    }
    for (const start of stuck) {
      const path: number[] = [];
      const seen = new Set<number>();
      const dfs = (id: number): boolean => {
        if (path.length && id === start.id) return true;
        if (seen.has(id) || !waitsOn.has(id)) return false;
        seen.add(id);
        path.push(id);
        for (const n of waitsOn.get(id)!) if (dfs(n)) return true;
        path.pop();
        return false;
      };
      if (dfs(start.id)) {
        // nur echte Staus melden: kommt laut Vorhersage noch jeder durch (z.B. über ein anderes Gleis), ist es kein Stau
        const unsafe = this.unsafeTrains();
        if (path.some((id) => unsafe.has(id))) return path.slice();
        break;
      }
    }
    // alle stehen, obwohl nichts im Weg ist? (gegenseitiges Vorlassen) – nach 20 min auch als Stau melden
    const frozen = stuck.filter((t) => this.time - (t.waitSince ?? this.time) > 1200);
    if (frozen.length >= 2 && this.trains.every((t) => t.state === 'stored' || t.state === 'rolling' || (t.state === 'running' && t.waiting))) return frozen.map((t) => t.id);
    return null;
  }

  /** Zug aus dem Verkehr nehmen (Ausweg aus einem Stau) */
  cancelTrain(id: number) {
    const t = this.trains.find((x) => x.id === id);
    if (!t) return;
    for (const k of t.reserved) if (this.owner[k] === t.id) this.owner[k] = 0;
    t.reserved.clear();
    t.state = 'done';
    this.trains = this.trains.filter((x) => x !== t);
    this.events.push({ type: 'cancel', train: t });
    this.deadlock = null;
  }

  // ------------------------------------------------------------ Wenden
  /** Fahrtrichtung wechseln, Zugschluss wird zur Spitze */
  private reverse(t: Train) {
    const tailS = Math.max(0, t.s - t.length);
    const ti = this.edgeIndexAt(t, tailS);
    const hi = this.edgeIndexAt(t, Math.max(0, t.s - 0.01));
    const occupied = t.route.slice(ti, hi + 1);
    const twins = occupied.map((e) => this.net.twin(e)).reverse();
    if (twins.some((e) => !e)) return;
    const L = occupied.reduce((a, e) => a + e.len, 0);
    const a = tailS - t.start[ti];
    t.dir = t.dir === 'E' ? 'W' : 'E';
    t.cars.reverse();
    t.v = 0;
    t.committed = twins.length - 1;
    this.setRoute(t, twins as Edge[]);
    t.s = L - a;
    if (t.op.turnback && !t.turned) {
      t.turned = true;
      this.events.push({ type: 'turn', train: t });
    }
  }

  private edgeIndexAt(t: Train, s: number) {
    let i = 0;
    while (i + 1 < t.route.length && t.start[i + 1] <= s) i++;
    return i;
  }

  private release(t: Train) {
    const tail = this.edgeIndexAt(t, Math.max(0, t.s - t.length));
    const needed = new Set<number>();
    for (let i = tail; i <= t.committed; i++) if (t.route[i].block >= 0) needed.add(t.route[i].block);
    for (const k of t.reserved) {
      if (!needed.has(this.net.blockOf[k])) {
        if (this.owner[k] === t.id) this.owner[k] = 0;
        t.reserved.delete(k);
      }
    }
  }

  /** Kante + Distanz eines Punktes, `back` Einheiten hinter dem Zugkopf */
  posOnTrain(t: Train, back: number) {
    const s = t.s - back;
    const i = this.edgeIndexAt(t, Math.max(0, s));
    return { i, d: s - t.start[i] };
  }

  /** geschätzte Verspätung in Minuten */
  delayNow(t: Train) {
    if (t.op.kind === 'sort' || t.state === 'rolling' || t.state === 'stored') return 0;
    const rest = Math.max(0, (t.start[t.route.length - 1] ?? 0) - t.s) / t.op.vmax;
    return Math.max(0, (this.time + rest - t.plannedExit) / 60);
  }

  // ------------------------------------------------------------ Speichern
  private saveTrain(t: Train): TrainSave {
    const { ahead: _a, ...rest } = t;
    void _a;
    return { ...rest, op: t.op.id, route: t.route.map((e) => e.key), reserved: [...t.reserved], start: [] } as unknown as TrainSave;
  }

  save(): SimSave {
    return {
      time: this.time, level: this.level, nextId: this.nextId, sortDep: [...this.sortDep], vandalUntil: this.vandalUntil, festUntil: this.festUntil,
      nextSpawn: { ...this.nextSpawn }, counter: { ...this.counter }, nextDir: { ...this.nextDir },
      queue: this.queue.map((t) => this.saveTrain(t)),
      trains: this.trains.map((t) => this.saveTrain(t)),
    };
  }

  private restore(s: SimSave) {
    Object.assign(this, { time: s.time, level: s.level, nextId: s.nextId });
    if (s.sortDep) this.sortDep = s.sortDep;
    this.vandalUntil = s.vandalUntil ?? 0;
    this.festUntil = s.festUntil ?? 0;
    Object.assign(this.nextSpawn, s.nextSpawn);
    Object.assign(this.counter, s.counter);
    Object.assign(this.nextDir, s.nextDir);
    const load = (ts: TrainSave): Train | null => {
      const route = ts.route.map((k) => this.net.edges.get(k));
      if (route.some((e) => !e)) return null;
      const t: Train = { ...ts, op: OPERATORS[ts.op], route: [], start: [], reserved: new Set(ts.reserved) };
      this.setRoute(t, route as Edge[]);
      for (const k of t.reserved) this.owner[k] = t.id;
      return t;
    };
    this.queue = s.queue.map(load).filter((t): t is Train => !!t);
    this.trains = s.trains.map(load).filter((t): t is Train => !!t);
  }
}
