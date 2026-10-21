import { COST, DELAY_PENALTY_PER_MIN, GAME_SEC_PER_REAL_SEC, MISSED_STOP_PENALTY, PARCEL, PUNCTUAL_LIMIT_MIN, REFUND, SECOND_ROW, START_MONEY } from '../config';
import { OperatorId, OPERATORS, SORT_DESTS } from '../sim/Operators';
import { acceptChance, cancelRisk, Contract, fairPrice, LengthClass, lengthClass, newContracts, TALK_PAUSE, TRANSIT_FEE } from './Contracts';
import { FACILITY_RESEARCH, RESEARCH_BY_ID, ResearchId, ResearchState } from './Research';
import { SimSave, Simulation, Train } from '../sim/Simulation';
import { BUILDINGS } from '../world/buildings';
import { Grid } from '../world/Grid';
import { edgeRow, Network } from '../world/Network';
import { PIECES } from '../world/pieces';
import { FREE_PLAY, Mission, MISSIONS, ToolId } from './Missions';

export interface Stats {
  handled: number;
  punctual: number;
  streak: number;
  stopsRegio: number;
  stopsIC: number;
  passengers: number;
  missed: number;
  maxDwellSince: number;
  secondRuns: number;
  turnbacks: number;
  parks: number;
  services: number;
  sortedWagons: number;
  recent: boolean[];
}

export interface LogEntry { time: number; text: string; kind: 'good' | 'bad' | 'info' }

export interface BuildPlan {
  ok: boolean;
  cost: number;
  reason?: string;
  cells: { x: number; y: number }[];
}

/** Ereignisse für die Oberfläche (Banner, Münzen …) */
export type UiEvent =
  | { type: 'mission'; title: string; reward: number; unlocked: ToolId[]; fp: number }
  | { type: 'missionStart'; title: string }
  | { type: 'station'; id: number }
  | { type: 'research'; id: ResearchId }
  | { type: 'contract'; op: OperatorId; kind: 'cancel' | 'accept' | 'reject' };

/** Effekte auf der Karte (schwebende Beträge) */
export interface FxEvent { amount: number; x: number; y: number; train?: number; label?: string }

type XY = { x: number; y: number };

const STATION_NAMES = ['Donaufeld', 'Mühlbach', 'Lindenau', 'Am Steinfeld', 'Grünwies', 'Hollerbrunn', 'Kirchberg Süd', 'Weidenau',
  'Auhof', 'Bachstetten', 'Rosental', 'Marchegg Nord', 'Eichgraben', 'Sonnleiten', 'Hainfeld West', 'Wolfsthal'];

export interface GameSave {
  v: 4;
  links: { id: number; kind: 'tunnel' | 'bridge'; x: number; y0: number; y1: number }[];
  sortDest: (number | null)[];
  company: string;
  cells: number[];
  pieces: { id: number; key: string; x: number; y: number }[];
  buildings: { id: number; key: string; x: number; y: number; decor: boolean; name?: string }[];
  owned: boolean[];
  mainRows: number[];
  money: number;
  stats: Stats;
  missionBase: Stats;
  satisfaction: Record<OperatorId, number>;
  missionIdx: number;
  unlocked: ToolId[];
  log: LogEntry[];
  sim: SimSave;
  research?: ResearchState;
  contracts?: Record<OperatorId, Contract>;
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const newStats = (): Stats => ({
  handled: 0, punctual: 0, streak: 0, stopsRegio: 0, stopsIC: 0, passengers: 0, missed: 0, maxDwellSince: 0, secondRuns: 0, turnbacks: 0, parks: 0, services: 0, sortedWagons: 0, recent: [],
});

export class Game {
  readonly grid: Grid;
  net: Network;
  readonly sim: Simulation;
  company = '';
  money = START_MONEY;
  speed = 1;
  paused = false;
  /** steigt bei jeder Änderung an Gleisen/Gebäuden/Fläche (für Renderer) */
  version = 0;
  stats: Stats = newStats();
  satisfaction = Object.fromEntries(Object.keys(OPERATORS).map((k) => [k, 70])) as Record<OperatorId, number>;
  missionIdx = 0;
  private missionBase: Stats = newStats();
  readonly unlocked = new Set<ToolId>(['select', 'land', 'platform', 'building', 'remove']);
  log: LogEntry[] = [];
  research: ResearchState = { done: [], current: null, points: 0 };
  contracts = newContracts();
  private lastHour = 0;
  readonly uiEvents: UiEvent[] = [];
  readonly fx: FxEvent[] = [];

  constructor(save?: GameSave) {
    this.grid = new Grid(!save);
    if (save) {
      const g = this.grid;
      save.cells.forEach((b, k) => Object.assign(g.cells[k], {
        track: !!(b & 1), fixed: !!(b & 2), platform: !!(b & 4), signal: !!(b & 8), signalW: !!(b & 16),
        wire: !!(b & 32), siding: !!(b & 64), sortDest: save.sortDest?.[k] ?? null,
      }));
      save.links?.forEach((l) => g.addLink(l.kind, l.x, l.y0, l.y1, l.id));
      save.pieces.forEach((p) => g.addPiece(p.key, p.x, p.y, p.id));
      save.buildings.forEach((b) => { g.addBuilding(b.key, b.x, b.y, b.decor, b.id).name = b.name; });
      save.owned.forEach((o, i) => (g.owned[i] = o));
      g.mainRows = save.mainRows;
      Object.assign(this, {
        company: save.company, money: save.money, stats: { ...newStats(), ...save.stats }, missionBase: { ...newStats(), ...save.missionBase },
        missionIdx: save.missionIdx, log: save.log,
      });
      Object.assign(this.satisfaction, save.satisfaction);
      save.unlocked.forEach((u) => this.unlocked.add(u));
      if (save.research) this.research = save.research;
      else this.migrateResearch(save);
      if (save.contracts) Object.assign(this.contracts, save.contracts);
    }
    this.net = new Network(this.grid);
    this.sim = new Simulation(this.net, save?.sim);
    this.sim.contractActive = (id) => this.contracts[id].active;
    this.applySwitchSpeed();
    this.lastHour = Math.floor(this.sim.time / 3600);
  }

  /** alte Spielstände ohne Forschung: Bekanntes als erforscht übernehmen */
  private migrateResearch(save: GameSave) {
    const done = new Set<ResearchId>();
    if (save.unlocked.includes('access')) done.add('access');
    if (save.unlocked.includes('wire')) done.add('wire');
    if (save.unlocked.includes('facility')) (['siding', 'wash', 'remise', 'workshop', 'hump'] as ResearchId[]).forEach((r) => done.add(r));
    if (save.mainRows.includes(SECOND_ROW)) done.add('double');
    if (this.count('bld_station') > 1) done.add('stations');
    this.research.done = [...done];
    if (this.missionIdx >= 2) this.unlocked.add('research');
    if (this.missionIdx >= 3) this.missionIdx++;
  }

  save(): GameSave {
    const g = this.grid;
    return {
      v: 4,
      company: this.company,
      cells: g.cells.map((c) => (+c.track) | (+c.fixed << 1) | (+c.platform << 2) | (+c.signal << 3) | (+c.signalW << 4)
        | (+c.wire << 5) | (+c.siding << 6)),
      sortDest: g.cells.map((c) => c.sortDest),
      links: [...g.links.values()].map((l) => ({ ...l })),
      pieces: [...g.pieces.values()].map((p) => ({ ...p })),
      buildings: [...g.buildings.values()].map((b) => ({ ...b })),
      owned: [...g.owned],
      mainRows: [...g.mainRows],
      money: this.money, stats: this.stats, missionBase: this.missionBase,
      satisfaction: this.satisfaction, missionIdx: this.missionIdx,
      unlocked: [...this.unlocked], log: this.log, sim: this.sim.save(),
      research: this.research, contracts: this.contracts,
    };
  }

  // ------------------------------------------------------------ Gebäude-Wirkungen
  count(key: string) {
    let n = 0;
    for (const b of this.grid.buildings.values()) if (b.key === key && !b.decor) n++;
    return n;
  }

  /** Vorschlag für einen neuen Bahnhofsnamen */
  suggestStationName() {
    const used = new Set([...this.grid.buildings.values()].map((b) => b.name));
    const free = STATION_NAMES.filter((n) => !used.has(n));
    return free[Math.floor(Math.random() * free.length)] ?? `Bahnhof ${used.size + 1}`;
  }

  stationName(id: number, name: string) {
    const b = this.grid.buildings.get(id);
    if (b) { b.name = name; this.version++; }
  }

  /** Einnahmen-Faktor Personenverkehr durch Empfangsgebäude */
  get incomeFactor() { return 1 + 0.15 * Math.min(2, this.count('bld_station')); }

  /** Stimmung eines Fahrgasts beim Einsteigen (aus der Menschen-Simulation) */
  passengerMood(op: OperatorId, mood: -1 | 0 | 1) {
    this.satisfaction[op] = Math.max(0, Math.min(100, this.satisfaction[op] + (mood < 0 ? -0.4 : mood > 0 ? 0.15 : 0)));
  }

  // ------------------------------------------------------------ Ablauf
  tick(dtReal: number) {
    if (this.paused) return;
    const dtGame = dtReal * GAME_SEC_PER_REAL_SEC * this.speed;
    this.sim.step(dtGame);
    this.tickResearch(dtGame);
    const hour = Math.floor(this.sim.time / 3600);
    if (hour !== this.lastHour) { this.lastHour = hour; this.hourly(); }
    for (const ev of this.sim.events.splice(0)) {
      if (ev.type === 'note') { this.addLog(ev.text, 'bad'); continue; }
      if (ev.type === 'sorted') {
        const income = ev.correct * 80 + (ev.wagons - ev.correct) * 20;
        this.money += income;
        this.stats.sortedWagons += ev.correct;
        this.addLog(`Güterzug Richtung ${SORT_DESTS[ev.dest].name} mit ${ev.wagons} Wagen fährt ab · +${income} €`, 'good');
        continue;
      }
      const t = ev.train;
      if (ev.type === 'cancel') {
        this.money -= 300;
        this.stats.handled++;
        this.stats.streak = 0;
        this.stats.recent.push(false);
        this.satisfaction[t.op.id] = Math.max(0, this.satisfaction[t.op.id] - 10);
        this.addLog(`Blockade! ${t.number} fällt aus (−300 €) – mehr Ausweichgleise oder Signale bauen`, 'bad');
        continue;
      }
      if (ev.type === 'stop') {
        this.stats.passengers += t.passengers;
        if (t.op.kind === 'regio') this.stats.stopsRegio++;
        if (t.op.kind === 'ic') this.stats.stopsIC++;
        const kiosks = [...this.grid.buildings.values()].filter((b) => b.key === 'bld_kiosk' && !b.decor);
        const kiosk = Math.round(Math.min(3, kiosks.length) * t.passengers * 0.25);
        if (kiosk) {
          this.money += kiosk;
          const k = kiosks[Math.floor(Math.random() * Math.min(3, kiosks.length))];
          this.fx.push({ amount: kiosk, x: k.x, y: k.y, label: 'Kiosk' });
        }
        if (t.dirt > 70) this.satisfaction[t.op.id] = Math.max(0, this.satisfaction[t.op.id] - 2);
        this.addLog(`${t.number} abgefertigt · ${t.passengers} Fahrgäste${kiosk ? ` · Kiosk +${kiosk} €` : ''}${t.dirt > 70 ? ' · Zug verschmutzt!' : ''}`, t.dirt > 70 ? 'bad' : 'info');
        // Haltgebühr wird bei der Abfahrt fällig
        if (!t.paid) this.settle(t, this.sim.delayNow(t), false);
        continue;
      }
      if (ev.type === 'turn') {
        this.stats.turnbacks++;
        this.addLog(`${t.number} wendet`, 'info');
        continue;
      }
      if (ev.type === 'park') {
        this.stats.parks++;
        const where = { siding: 'Abstellgleis', remise: 'Remise', workshop: 'Werkstatt' }[ev.kind];
        this.addLog(`${t.number} abgestellt (${where})`, 'info');
        continue;
      }
      if (ev.type === 'service') {
        this.stats.services++;
        this.money += ev.fee;
        const what = { wash: 'gewaschen', repair: 'repariert', clean: 'innen gereinigt' }[ev.kind];
        this.addLog(`${t.number} ${what} · +${ev.fee} €`, 'good');
        this.satisfaction[t.op.id] = Math.min(100, this.satisfaction[t.op.id] + 1);
        continue;
      }
      if (!t.paid) this.settle(t, ev.delayMin, ev.missed);
      // Linksverkehr: Richtung West fährt auf dem neuen Streckengleis
      if (t.dir === 'W' && edgeRow(t.route[0].key) === SECOND_ROW && edgeRow(t.route[t.route.length - 1].key) === SECOND_ROW) {
        this.stats.secondRuns++;
      }
    }
    const dwelling = this.sim.trains.filter((t) => t.state === 'dwell').length;
    this.stats.maxDwellSince = Math.max(this.stats.maxDwellSince, dwelling);
    this.checkMission();
  }

  /** Abrechnung eines Zugs: pünktlich = Bonus, verspätet = Abzug pro Minute */
  private settle(t: Train, delayMin: number, missed: boolean) {
    t.paid = true;
    const punctual = !missed && delayMin < PUNCTUAL_LIMIT_MIN;
    let income: number;
    if (t.transit) {
      income = TRANSIT_FEE;
      this.money += income;
      this.addLog(`${t.number} Durchfahrt ohne Vertrag · +${income} €`, 'info');
      this.fx.push({ amount: income, x: 0, y: 0, train: t.id, label: 'Durchfahrt' });
      return;
    }
    if (missed) {
      income = -MISSED_STOP_PENALTY;
      this.stats.missed++;
      this.satisfaction[t.op.id] -= 12;
      this.addLog(`${t.number} ohne Halt durchgefahren · ${income} €`, 'bad');
    } else {
      const f = t.op.needsStop ? this.incomeFactor : 1;
      const late = Math.max(0, delayMin - PUNCTUAL_LIMIT_MIN);
      const price = this.contracts[t.op.id].price[lengthClass(t.cars.length)];
      income = punctual ? Math.round(price * f) : Math.round(price * 0.7 * f - late * DELAY_PENALTY_PER_MIN);
      income = Math.max(-Math.round(price * 0.7), income);
      if (punctual) this.research.points++;
      this.satisfaction[t.op.id] += punctual ? 3 : -Math.min(15, delayMin * 2);
      const d = delayMin < 1 ? 'pünktlich' : `+${Math.round(delayMin)} min`;
      this.addLog(`${t.number} ${d} · ${income >= 0 ? '+' : ''}${income} €`, punctual ? 'good' : 'bad');
    }
    this.fx.push({ amount: income, x: 0, y: 0, train: t.id, label: missed ? 'kein Halt' : punctual ? 'pünktlich' : `+${Math.round(delayMin)} min` });
    this.satisfaction[t.op.id] = Math.max(0, Math.min(100, this.satisfaction[t.op.id]));
    this.money += income;
    this.stats.handled++;
    if (punctual) { this.stats.punctual++; this.stats.streak++; } else this.stats.streak = 0;
    this.stats.recent.push(punctual);
    if (this.stats.recent.length > 50) this.stats.recent.shift();
  }

  // ------------------------------------------------------------ Forschung
  researched(id: ResearchId) { return this.research.done.includes(id); }

  /** Kann die Forschung gestartet werden? sonst Grund */
  researchBlock(id: ResearchId): string | null {
    const r = RESEARCH_BY_ID[id];
    if (this.researched(id)) return 'Schon erforscht';
    if (this.research.current) return 'Es läuft schon eine Forschung';
    const miss = r.requires.filter((q) => !this.researched(q));
    if (miss.length) return `Zuerst: ${miss.map((q) => RESEARCH_BY_ID[q].name).join(', ')}`;
    if (this.research.points < r.fp) return `Zu wenig Forschungspunkte (${r.fp})`;
    if (this.money < r.cost) return 'Zu wenig Geld';
    return null;
  }

  startResearch(id: ResearchId) {
    if (this.researchBlock(id)) return false;
    const r = RESEARCH_BY_ID[id];
    this.money -= r.cost;
    this.research.points -= r.fp;
    this.research.current = { id, left: r.hours * 3600 };
    this.addLog(`Forschung gestartet: ${r.name}`, 'info');
    return true;
  }

  private tickResearch(dt: number) {
    const cur = this.research.current;
    if (!cur) return;
    cur.left -= dt;
    if (cur.left > 0) return;
    this.research.current = null;
    this.finishResearch(cur.id);
  }

  private finishResearch(id: ResearchId) {
    const r = RESEARCH_BY_ID[id];
    this.research.done.push(id);
    r.tools?.forEach((t) => this.unlocked.add(t));
    r.apply?.(this);
    this.applySwitchSpeed();
    this.version++;
    this.addLog(`Forschung abgeschlossen: ${r.name}`, 'good');
    this.uiEvents.push({ type: 'research', id });
  }

  private applySwitchSpeed() {
    this.sim.switchV = ((this.researched('fastSwitch') ? 20 : 10) * 16) / 60;
  }

  get maxStations() { return this.researched('stations') ? 4 : 1; }

  // ------------------------------------------------------------ Verträge
  /** Unternehmen, die gerade bei uns fahren */
  activeOperators() {
    return Object.values(OPERATORS).filter((o) => this.sim.queue.some((t) => t.op === o) || this.sim.trains.some((t) => t.op === o));
  }

  setPrice(op: OperatorId, cls: LengthClass, price: number) {
    const fair = fairPrice(OPERATORS[op], cls);
    this.contracts[op].price[cls] = Math.max(Math.round(fair * 0.5), Math.min(Math.round(fair * 2), Math.round(price / 10) * 10));
  }

  /** neues Angebot an ein Unternehmen ohne Vertrag */
  offer(op: OperatorId) {
    const c = this.contracts[op];
    if (c.active || this.sim.time < c.talkAfter) return false;
    const ok = Math.random() < acceptChance(OPERATORS[op], c, this.satisfaction[op]);
    if (ok) {
      c.active = true;
      this.sim.recontract(op);
      this.addLog(`${OPERATORS[op].name} unterschreibt den neuen Vertrag`, 'good');
    } else {
      c.talkAfter = this.sim.time + TALK_PAUSE / 2;
      this.addLog(`${OPERATORS[op].name} lehnt das Angebot ab`, 'bad');
    }
    this.uiEvents.push({ type: 'contract', op, kind: ok ? 'accept' : 'reject' });
    return ok;
  }

  /** stündlich: Zufriedenheit je nach Preis, Kündigungen */
  private hourly() {
    for (const o of this.activeOperators()) {
      const c = this.contracts[o.id];
      if (o.kind === 'sort') continue;
      if (!c.active) {
        this.satisfaction[o.id] = Math.min(50, this.satisfaction[o.id] + 2);
        continue;
      }
      const ratio = Math.max(c.price.short / fairPrice(o, 'short'), c.price.long / fairPrice(o, 'long'));
      this.satisfaction[o.id] = Math.max(0, Math.min(100, this.satisfaction[o.id] - (ratio - 1) * 3));
      if (Math.random() < cancelRisk(o, c, this.satisfaction[o.id])) {
        c.active = false;
        c.talkAfter = this.sim.time + TALK_PAUSE;
        this.satisfaction[o.id] = Math.max(0, this.satisfaction[o.id] - 20);
        this.sim.recontract(o.id);
        this.addLog(`${o.name} kündigt den Vertrag! Züge fahren nur noch durch`, 'bad');
        this.uiEvents.push({ type: 'contract', op: o.id, kind: 'cancel' });
      }
    }
  }

  private addLog(text: string, kind: LogEntry['kind']) {
    this.log.unshift({ time: this.sim.time, text, kind });
    if (this.log.length > 40) this.log.pop();
  }

  // ------------------------------------------------------------ Aufträge
  get mission(): Mission | null {
    return MISSIONS[this.missionIdx] ?? null;
  }

  missionInfo() {
    const m = this.mission;
    if (!m) return { title: FREE_PLAY.title, short: FREE_PLAY.short, reward: 0, value: 1, text: '', index: MISSIONS.length, total: MISSIONS.length };
    const p = m.progress(this.stats, this.missionBase, this);
    return { title: m.title, short: m.short, reward: m.reward, ...p, index: this.missionIdx, total: MISSIONS.length };
  }

  /** hervorgehobenes Werkzeug für den aktuellen Auftrag */
  missionTool() {
    return this.mission?.tool?.(this) ?? null;
  }

  /** Markierte Felder für den aktuellen Auftrag */
  missionHint(): XY[] {
    return this.mission?.hint?.(this) ?? [];
  }

  /** beim Laden / Start: Auftrag vorbereiten */
  startMission() {
    const m = this.mission;
    if (m?.onStart) { m.onStart(this); }
  }

  expandLine() {
    if (this.grid.mainRows.includes(SECOND_ROW)) return;
    this.grid.expandLine();
    this.rebuild();
    this.addLog('Netzbetreiber baut das 2. Streckengleis', 'info');
  }

  private checkMission() {
    const m = this.mission;
    if (!m || m.progress(this.stats, this.missionBase, this).value < 1) return;
    this.money += m.reward;
    this.research.points += m.fp;
    m.unlock.forEach((u) => this.unlocked.add(u));
    if (m.level !== this.sim.level) this.sim.setLevel(m.level);
    this.uiEvents.push({ type: 'mission', title: m.title, reward: m.reward, unlocked: m.unlock, fp: m.fp });
    this.addLog(`Auftrag „${m.title}“ erledigt`, 'good');
    this.missionIdx++;
    this.stats.streak = 0;
    this.stats.maxDwellSince = 0;
    this.missionBase = structuredClone(this.stats);
    this.startMission();
    const next = this.mission;
    if (next) this.uiEvents.push({ type: 'missionStart', title: next.title });
  }

  get punctuality() {
    return this.stats.handled ? this.stats.punctual / this.stats.handled : 1;
  }

  // ------------------------------------------------------------ Bauen
  private reserved(x: number, y: number) {
    return this.sim.owner[this.grid.key(x, y)] !== 0;
  }

  /** Zellen einer gezogenen Linie (Gleis nur in x-Richtung) */
  lineCells(tool: ToolId, x0: number, y0: number, x1: number, y1: number): XY[] {
    const out: XY[] = [];
    const alongX = tool === 'track' || tool === 'wire' || tool === 'facility' || (tool !== 'access' && Math.abs(x1 - x0) >= Math.abs(y1 - y0));
    if (alongX) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push({ x, y: y0 });
    else for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push({ x: x0, y });
    return out.filter((c) => this.grid.inside(c.x, c.y));
  }

  /** Diagonale ziehen: Ankerzellen der einzelnen Schritte + Teiltyp */
  diagSteps(x0: number, y0: number, x1: number, y1: number, fallback: string): { key: string; anchors: XY[] } {
    const dx = x1 - x0, dy = y1 - y0;
    const key = dx * dy > 0 ? 'diag_desc' : dx * dy < 0 ? 'diag_asc' : fallback;
    const n = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
    const sx = (key === 'diag_desc' ? Math.sign(dx) || Math.sign(dy) : Math.sign(dx) || -Math.sign(dy)) || 1;
    const anchors: XY[] = [];
    for (let k = 0; k < n; k++) {
      anchors.push(key === 'diag_desc' ? { x: x0 + sx * k, y: y0 + sx * k } : { x: x0 + sx * k, y: y0 - sx * k });
    }
    return { key, anchors };
  }

  /** Zellen der Parzelle unter einem Feld */
  parcelCells(x: number, y: number): XY[] {
    const { px, py } = this.grid.parcelOf(x, y);
    const out: XY[] = [];
    for (let dy = 0; dy < PARCEL; dy++) for (let dx = 0; dx < PARCEL; dx++) out.push({ x: px * PARCEL + dx, y: py * PARCEL + dy });
    return out;
  }

  /**
   * Bauplan prüfen.
   * variant: Signalrichtung ('E'/'W'), Gleisteil- oder Gebäude-Schlüssel
   * cells: Felder (Bahnsteig/Gleis), Signalfeld, oder Ankerzellen der Teile
   */
  plan(tool: ToolId, cells: XY[], variant = ''): BuildPlan {
    const g = this.grid;
    const fail = (reason: string, c = cells): BuildPlan => ({ ok: false, cost: 0, reason, cells: c });
    if (!this.unlocked.has(tool)) return fail('Noch nicht freigeschaltet');
    if (!cells.length) return fail('');
    const need = tool === 'facility' ? FACILITY_RESEARCH[variant] : undefined;
    if (need && !this.researched(need)) return fail(`Erst erforschen: ${RESEARCH_BY_ID[need].name}`);
    if (tool === 'building' && variant === 'bld_station' && this.count('bld_station') >= this.maxStations) {
      return fail(this.researched('stations') ? 'Mehr Bahnhöfe gehen nicht' : 'Erst erforschen: Weitere Bahnhöfe');
    }
    const notOwned = (cs: XY[]) => cs.some((c) => !g.isOwned(c.x, c.y));
    let cost = 0;
    let shown = cells;
    switch (tool) {
      case 'land': {
        const { px, py } = g.parcelOf(cells[0].x, cells[0].y);
        const pc = this.parcelCells(cells[0].x, cells[0].y);
        if (g.parcelOwned(px, py)) return fail('Gehört dir schon', pc);
        if (!g.parcelBuyable(px, py)) return fail('Nur angrenzende Flächen kaufbar', pc);
        cost = g.parcelPrice(px, py);
        shown = pc;
        break;
      }
      case 'platform': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        if (cells.some((c) => g.get(c.x, c.y)!.track || g.get(c.x, c.y)!.piece !== null)) return fail('Bahnsteig nicht auf Gleis');
        if (cells.some((c) => g.get(c.x, c.y)!.building !== null)) return fail('Gebäude im Weg');
        cost = cells.filter((c) => !g.get(c.x, c.y)!.platform).length * COST.platform;
        break;
      }
      case 'track': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        if (cells.some((c) => g.get(c.x, c.y)!.platform || g.get(c.x, c.y)!.piece !== null)) return fail('Feld ist belegt');
        if (cells.some((c) => g.get(c.x, c.y)!.building !== null)) return fail('Gebäude im Weg');
        cost = cells.filter((c) => !g.get(c.x, c.y)!.track).length * COST.track;
        break;
      }
      case 'signal': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        const c = g.get(cells[0].x, cells[0].y)!;
        if (!c.track || c.piece !== null) return fail('Signal nur auf geradem Gleis');
        if (variant === 'W' ? c.signalW : c.signal) return fail('Hier steht schon ein Signal');
        cost = COST.signal;
        break;
      }
      case 'switch':
      case 'curve':
      case 'diag': {
        const def = PIECES[variant];
        if (!def) return fail('');
        const fp: XY[] = [];
        for (const a of cells) {
          for (const c of g.footprint(variant, a.x, a.y)) {
            if (!g.inside(c.x, c.y)) return fail('Außerhalb der Karte', fp);
            const cell = g.get(c.x, c.y)!;
            fp.push(c);
            if (!g.isOwned(c.x, c.y)) return fail('Fläche nicht gekauft', fp);
            if (cell.platform) return fail('Bahnsteig im Weg', fp);
            if (cell.building !== null) return fail('Gebäude im Weg', fp);
            if (cell.piece !== null) return fail('Überschneidet anderes Gleisteil', fp);
            if (cell.signal || cell.signalW) return fail('Signal im Weg', fp);
            if (this.reserved(c.x, c.y)) return fail('Gleis ist gerade befahren', fp);
            const through = def.through.includes(c.y - a.y);
            if (cell.track && !through) return fail('Gerades Gleis im Weg', fp);
            if (through && !cell.track) cost += COST.track;
          }
          cost += def.cost;
        }
        shown = fp;
        break;
      }
      case 'building': {
        const def = BUILDINGS[variant];
        if (!def) return fail('');
        const fp = g.footprint(variant, cells[0].x, cells[0].y);
        shown = fp;
        for (const c of fp) {
          const cell = g.get(c.x, c.y);
          if (!cell) return fail('Außerhalb der Karte', fp);
          if (!g.isOwned(c.x, c.y)) return fail('Fläche nicht gekauft', fp);
          if (cell.building !== null) return fail('Hier steht schon etwas', fp);
          if (cell.track || cell.piece !== null) return fail('Gleis im Weg', fp);
          if (def.onPlatform && !cell.platform) return fail('Nur auf dem Bahnsteig', fp);
          if (!def.onPlatform && cell.platform) return fail('Nicht auf dem Bahnsteig', fp);
        }
        cost = def.cost;
        break;
      }
      case 'wire': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        const todo = cells.filter((c) => { const cc = g.get(c.x, c.y)!; return (cc.track || cc.piece !== null) && !cc.wire; });
        if (!todo.length) return fail('Hier ist kein Gleis ohne Oberleitung');
        cost = todo.length * COST.wire;
        shown = todo;
        break;
      }
      case 'access': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        if (cells.length < 3) return fail('Über mindestens ein Gleis ziehen');
        const a = g.get(cells[0].x, cells[0].y)!, b = g.get(cells[cells.length - 1].x, cells[cells.length - 1].y)!;
        if (!a.platform || !b.platform) return fail('Beide Enden müssen auf einem Bahnsteig liegen');
        if (cells.some((c) => g.linkAt(c.x, c.y))) return fail('Hier gibt es schon einen Zugang');
        if (variant === 'bridge' && cells.some((c) => { const cc = g.get(c.x, c.y)!; return cc.building !== null && !cc.platform; })) return fail('Gebäude im Weg');
        cost = cells.length * (variant === 'bridge' ? COST.bridge : COST.tunnel);
        break;
      }
      case 'facility': {
        if (variant.startsWith('mark_')) {
          if (notOwned(cells)) return fail('Fläche nicht gekauft');
          const plain = cells.filter((c) => { const cc = g.get(c.x, c.y)!; return cc.track && cc.piece === null; });
          if (plain.length !== cells.length) return fail('Nur auf geradem Gleis');
          cost = cells.length * COST.marker;
          break;
        }
        const def = BUILDINGS[variant];
        if (!def) return fail('');
        const fp = g.footprint(variant, cells[0].x, cells[0].y);
        shown = fp;
        for (const c of fp) {
          const cell = g.get(c.x, c.y);
          if (!cell) return fail('Außerhalb der Karte', fp);
          if (!g.isOwned(c.x, c.y)) return fail('Fläche nicht gekauft', fp);
          if (!cell.track || cell.piece !== null) return fail('Braucht ein gerades Gleis darunter', fp);
          if (cell.building !== null) return fail('Hier steht schon etwas', fp);
          if (cell.signal || cell.signalW) return fail('Signal im Weg', fp);
          if (this.reserved(c.x, c.y)) return fail('Gleis ist gerade befahren', fp);
        }
        cost = def.cost;
        break;
      }
      case 'remove': {
        const c = g.get(cells[0].x, cells[0].y)!;
        if (!g.isOwned(cells[0].x, cells[0].y)) return fail('Fläche nicht gekauft');
        if (c.signal || c.signalW) { cost = -COST.signal * REFUND; break; }
        const link = g.linkAt(cells[0].x, cells[0].y);
        if (c.building !== null) {
          const b = g.buildings.get(c.building)!;
          const def = BUILDINGS[b.key];
          if (def.onTrack && g.buildingCells(b).some((k) => this.sim.owner[k] !== 0)) return fail('Gleis ist gerade befahren');
          return { ok: this.money >= (b.decor ? def.demolish : 0), cost: b.decor ? def.demolish : -def.cost * REFUND,
            reason: 'Zu wenig Geld', cells: g.buildingCells(b).map((k) => g.xy(k)) };
        }
        if (link) {
          const cs: XY[] = [];
          for (let y = link.y0; y <= link.y1; y++) cs.push({ x: link.x, y });
          return { ok: true, cost: -cs.length * (link.kind === 'bridge' ? COST.bridge : COST.tunnel) * REFUND, cells: cs };
        }
        if (c.platform) { cost = -COST.platform * REFUND; break; }
        if (c.siding || c.sortDest !== null) { cost = 0; break; }
        if (c.piece !== null) {
          const p = g.pieces.get(c.piece)!;
          const pc = g.pieceCells(p);
          if (pc.some((k) => this.sim.owner[k] !== 0)) return fail('Gleisteil ist gerade befahren');
          return { ok: true, cost: -PIECES[p.key].cost * REFUND, cells: pc.map((k) => g.xy(k)) };
        }
        if (c.track) {
          if (c.fixed) return fail('Streckengleis kann nicht abgerissen werden');
          if (this.reserved(cells[0].x, cells[0].y)) return fail('Gleis ist gerade befahren');
          cost = -COST.track * REFUND;
          break;
        }
        return fail('Nichts zum Abreißen');
      }
      default:
        return fail('');
    }
    if (cost > this.money) return { ok: false, cost, reason: 'Zu wenig Geld', cells: shown };
    return { ok: true, cost, cells: shown };
  }

  build(tool: ToolId, cells: XY[], variant = ''): BuildPlan {
    const p = this.plan(tool, cells, variant);
    if (!p.ok) return p;
    const g = this.grid;
    switch (tool) {
      case 'land': {
        const { px, py } = g.parcelOf(cells[0].x, cells[0].y);
        g.buyParcel(px, py);
        break;
      }
      case 'platform': cells.forEach((c) => (g.get(c.x, c.y)!.platform = true)); break;
      case 'track': cells.forEach((c) => (g.get(c.x, c.y)!.track = true)); break;
      case 'signal': {
        const c = g.get(cells[0].x, cells[0].y)!;
        if (variant === 'W') c.signalW = true; else c.signal = true;
        break;
      }
      case 'switch':
      case 'curve':
      case 'diag':
        cells.forEach((a) => g.addPiece(variant, a.x, a.y));
        break;
      case 'building': {
        const b = g.addBuilding(variant, cells[0].x, cells[0].y);
        if (variant === 'bld_station') {
          b.name = this.suggestStationName();
          this.uiEvents.push({ type: 'station', id: b.id });
        }
        break;
      }
      case 'wire': cells.forEach((c) => (g.get(c.x, c.y)!.wire = true)); break;
      case 'access': g.addLink(variant as 'tunnel' | 'bridge', cells[0].x, cells[0].y, cells[cells.length - 1].y); break;
      case 'facility':
        if (variant === 'mark_siding') cells.forEach((c) => Object.assign(g.get(c.x, c.y)!, { siding: true, sortDest: null }));
        else if (variant.startsWith('mark_sort')) cells.forEach((c) => Object.assign(g.get(c.x, c.y)!, { siding: false, sortDest: Number(variant.slice(9)) }));
        else g.addBuilding(variant, cells[0].x, cells[0].y);
        break;
      case 'remove': {
        const c = g.get(cells[0].x, cells[0].y)!;
        const link = g.linkAt(cells[0].x, cells[0].y);
        if (c.signal) c.signal = false;
        else if (c.signalW) c.signalW = false;
        else if (c.building !== null) g.removeBuilding(c.building);
        else if (link) g.links.delete(link.id);
        else if (c.platform) c.platform = false;
        else if (c.siding || c.sortDest !== null) { c.siding = false; c.sortDest = null; }
        else if (c.piece !== null) g.removePiece(c.piece);
        else if (c.track) { c.track = false; c.wire = false; }
        break;
      }
    }
    this.money -= p.cost;
    const c = p.cells[Math.floor(p.cells.length / 2)];
    if (p.cost !== 0 && c) this.fx.push({ amount: -p.cost, x: c.x, y: c.y });
    this.rebuild();
    return p;
  }

  private rebuild() {
    this.net = new Network(this.grid);
    this.sim.setNetwork(this.net);
    this.version++;
  }
}
