import { BANK, BoardState, dailyLetter, newBoard, Sender, welcomeLetter } from './Board';
import { MAIN_ROW, PASSING_LOOPS, STATION_UPGRADE, COST, DELAY_PENALTY_PER_MIN, GAME_SEC_PER_REAL_SEC, MISSED_STOP_PENALTY, OLD_OFFSET, PARCEL, PUNCTUAL_LIMIT_MIN, REFUND, SECOND_ROW } from '../config';
import { OperatorId, OPERATORS, SORT_DESTS, TAKT, trafficClass } from '../sim/Operators';
import { PARK_FEE, priceMod, acceptChance, cancelRisk, Contract, fairPrice, LengthClass, lengthClass, MIN_TAKT_DOUBLE, MIN_TAKT_SINGLE, newContracts, Offer, TAKT_STEPS, TALK_PAUSE, TRANSIT_FEE } from './Contracts';
import { FACILITY_RESEARCH, RESEARCH_BY_ID, ResearchId, ResearchState, ResearchTree } from './Research';
import { SimSave, Simulation, Train } from '../sim/Simulation';
import { BUILDING_RESEARCH, BUILDINGS, isStation, SHOPS } from '../world/buildings';
import { industries } from '../world/industries';
import { currentMap } from '../world/maps';
import { ACHIEVEMENTS } from './Achievements';
import { Goal, goalProgress, newGoals } from './Goals';
import { Grid } from '../world/Grid';
import { edgeRow, Network } from '../world/Network';
import { PIECES } from '../world/pieces';
import { FREE_PLAY, Mission, MISSIONS, MISSIONS_VERSION, ToolId, TUTORIAL_MISSIONS } from './Missions';

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
  /** Bahnsteiggleise, an denen schon ein Zug abgefertigt wurde */
  platformRuns: string[];
  /** je Unternehmen: abgefertigt / pünktlich */
  opStats?: Record<string, { handled: number; punctual: number }>;
  repairs?: number;
  specialsOk?: number;
  wasDebt?: boolean;
}

/** Tageswerte für die Statistik */
export interface DayStat { day: number; income: number; expense: number; handled: number; punctual: number; pax: number; shop?: number; maxDelay?: number }

export interface LogEntry { time: number; text: string; kind: 'good' | 'bad' | 'info' }

export interface InboxEntry { id: number; time: number; kind: 'letter' | 'news' | 'decision'; title: string; from: string; html: string; read: boolean }

export interface BuildPlan {
  ok: boolean;
  cost: number;
  reason?: string;
  cells: { x: number; y: number }[];
  /** automatischer Gleisbau: gesetzte Gleisteile (für die Vorschau) */
  pieces?: PiecePlace[];
  /** Hinweis zur Aktion (z. B. Zug wird entfernt) */
  note?: string;
  /** Züge, die beim Abreißen aus dem Verkehr genommen werden */
  trains?: number[];
  /** Flächen-Abriss: diese Felder einzeln abreißen */
  removeAt?: XY[];
}

export interface PiecePlace { key: string; x: number; y: number }

/** Gleisbau mit automatischer Richtung: gerade Felder + Gleisteile */
export interface TrackLayout { straight: XY[]; pieces: PiecePlace[] }

/** Ereignisse für die Oberfläche (Banner, Münzen …) */
export type UiEvent =
  | { type: 'mission'; title: string; reward: number; unlocked: ToolId[]; fp: number }
  | { type: 'missionStart'; title: string }
  | { type: 'station'; id: number }
  | { type: 'research'; id: ResearchId }
  | { type: 'contract'; op: OperatorId; kind: 'cancel' | 'accept' | 'reject' }
  | { type: 'offer' }
  | { type: 'deadlock' }
  | { type: 'gameover'; reason?: 'deadlock' | 'debt' }
  | { type: 'autosave'; label: string }
  | { type: 'news'; title: string; text: string; tag: string }
  | { type: 'decision'; title: string; text: string; yes: string; no: string; tag: string }
  | { type: 'letter'; title: string; text: string; mood: 'good' | 'bad' | 'info'; bonus?: number; from?: Sender }
  | { type: 'achievement'; id: string }
  | { type: 'goal' };

/** Effekte auf der Karte (schwebende Beträge) */
export interface FxEvent { amount: number; x: number; y: number; train?: number; label?: string }

type XY = { x: number; y: number };

const STATION_NAMES = ['Donaufeld', 'Mühlbach', 'Lindenau', 'Am Steinfeld', 'Grünwies', 'Hollerbrunn', 'Kirchberg Süd', 'Weidenau',
  'Auhof', 'Bachstetten', 'Rosental', 'Marchegg Nord', 'Eichgraben', 'Sonnleiten', 'Hainfeld West', 'Wolfsthal'];

export interface GameSave {
  v: 4 | 5;
  links: { id: number; kind: 'tunnel' | 'bridge'; x: number; y0: number; y1: number }[];
  sortDest: (number | null)[];
  company: string;
  cells: number[];
  pieces: { id: number; key: string; x: number; y: number }[];
  buildings: { id: number; key: string; x: number; y: number; decor: boolean; name?: string; rot?: boolean }[];
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
  shopPrices?: Record<string, number>;
  history?: DayStat[];
  achievements?: string[];
  weather?: Game['weather'];
  faults?: Game['faults'];
  goals?: Goal[];
  mapId?: string;
  board?: BoardState;
  crew?: number;
  inbox?: InboxEntry[];
  player?: Game['player'];
  missionsV?: number;
  missionMark?: number;
  offers?: Game['offers'];
  news?: Game['news'];
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Zell-Bits aus dem Spielstand */
/** Werkzeuge, die Bäume und Büsche automatisch fällen */
const CLEARING = new Set<ToolId>(['platform', 'switch', 'curve', 'diag', 'building']);

/** Störtrupp-Kosten */
export const REPAIR_COST = 300;

/** Stau: so lange (Spielsekunden) bleibt Zeit zum Lösen */
const DEADLOCK_LIMIT = 3600;
/** Kosten, wenn ein Zug aus dem Verkehr genommen wird */
export const CANCEL_COST = 500;

const unpackCell = (b: number, sortDest: number | null) => ({
  track: !!(b & 1), fixed: !!(b & 2), platform: !!(b & 4), signal: !!(b & 8), signalW: !!(b & 16),
  wire: !!(b & 32), siding: !!(b & 64), road: !!(b & 128), shunt: !!(b & 256), shuntSig: !!(b & 512), sortDest,
});

const newStats = (): Stats => ({
  handled: 0, punctual: 0, streak: 0, stopsRegio: 0, stopsIC: 0, passengers: 0, missed: 0, maxDwellSince: 0, secondRuns: 0, turnbacks: 0, parks: 0, services: 0, sortedWagons: 0, recent: [], platformRuns: [],
});

export class Game {
  readonly grid: Grid;
  net: Network;
  readonly sim: Simulation;
  company = '';
  private _money = currentMap().startMoney;
  /** Kasse – jede Änderung landet in der Tagesstatistik */
  get money() { return this._money; }
  set money(v: number) {
    const d = v - this._money;
    this._money = v;
    if (!this.sim || !d) return;
    const t = this.today();
    if (d > 0) t.income += d; else t.expense -= d;
  }
  /** letzte 14 Tage */
  history: DayStat[] = [];
  today(): DayStat {
    const day = Math.floor(this.sim.time / 86400);
    let t = this.history[this.history.length - 1];
    if (!t || t.day !== day) {
      t = { day, income: 0, expense: 0, handled: 0, punctual: 0, pax: 0 };
      this.history.push(t);
      if (this.history.length > 14) this.history.shift();
    }
    return t;
  }
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
  research: ResearchState = { done: [], running: {}, points: 0 };
  /** Verkaufspreise der Läden (€ je Einkauf) */
  shopPrices: Record<string, number> = Object.fromEntries(Object.entries(SHOPS).map(([k, v]) => [k, v.ref]));
  /** Ausweichstellen nach dem zweigleisigen Ausbau abbauen */
  private loopsPending = false;
  private loopCheck = 0;
  contracts = newContracts();
  private lastHour = 0;
  /** Werkzeuge, die im aktuellen Auftrag schon benutzt wurden (dann kein „!“ mehr in der Leiste) */
  readonly questUsed = new Set<string>();
  /** Zeitungsmeldungen: nächste Meldung, Vandalismus am Bahnhof bis, letzte abgerechnete Tag */
  news = { nextAt: 0, stationUntil: 0, lastDay: -1, dayMoney: NaN, lastBalance: NaN, deals: {} as Record<number, { reward: number; penalty: number }> };
  /** freigespielte Erfolge */
  achievements: string[] = [];
  /** Briefe vom Vorstand */
  board: BoardState = newBoard();
  /** Spieler: Name, Anrede, Avatar */
  player: { name: string; title: '' | 'Frau' | 'Herr'; avatar: number } = { name: '', title: '', avatar: 0 };
  /** Anrede für Briefe */
  salutation(formal = 'Sehr geehrte Betriebsleitung') {
    const n = this.player.name.trim();
    if (!n) return `${formal},`;
    return this.player.title === 'Frau' ? `Sehr geehrte Frau ${n},` : this.player.title === 'Herr' ? `Sehr geehrter Herr ${n},` : `Guten Tag ${n},`;
  }
  /** Postfach: Briefe, Zeitung, Anfragen */
  inbox: InboxEntry[] = [];
  /** Auftrag: Zählerstand beim Erreichen einer Bedingung (z. B. Signale gesetzt) */
  missionMark?: number;
  /** Gebäude gedreht bauen (Taste Q) */
  buildRot = false;
  /** drehbar: quadratische Gebäude */
  static canRotate(key: string) { const d = BUILDINGS[key]; return !!d && d.w === d.h && !d.onTrack; }

  /** eigene Instandhalter (Forschung „Instandhaltungsteam“) */
  crew = 0;
  static readonly CREW_WAGE = 250;
  static readonly CREW_MAX = 4;
  /** Wetter */
  weather = { kind: 'sun' as 'sun' | 'rain' | 'snow', until: 0 };
  /** Störungen an Weichen/Signalen */
  faults: { k: number; kind: 'switch' | 'signal'; since: number; repairAt?: number }[] = [];
  /** offene Entscheidung aus der Zeitung */
  decision: { id: 'fans' | 'sponsor'; at?: number; dir?: 'E' | 'W'; reward?: number; penalty?: number; cost?: number } | null = null;
  get repairs() { return this.stats.repairs ?? 0; }
  get specialsOk() { return this.stats.specialsOk ?? 0; }
  get wasInDebt() { return !!this.stats.wasDebt; }
  readonly uiEvents: UiEvent[] = [];
  readonly fx: FxEvent[] = [];

  constructor(save?: GameSave) {
    const old = save?.v === 4;
    this.grid = new Grid(!save || old);
    if (save) {
      const g = this.grid;
      if (old) this.loadSmallMap(save);
      else {
        save.cells.forEach((b, k) => Object.assign(g.cells[k], unpackCell(b, save.sortDest?.[k] ?? null)));
        save.links?.forEach((l) => g.addLink(l.kind, l.x, l.y0, l.y1, l.id));
        save.pieces.forEach((p) => g.addPiece(p.key, p.x, p.y, p.id));
        save.buildings.forEach((b) => { Object.assign(g.addBuilding(b.key, b.x, b.y, b.decor, b.id), { name: b.name, rot: b.rot }); });
        save.owned.forEach((o, i) => (g.owned[i] = o));
        g.mainRows = save.mainRows;
        g.markFixedLoops();
        g.placeIndustries();
      }
      Object.assign(this, {
        company: save.company, money: save.money, stats: { ...newStats(), ...save.stats }, missionBase: { ...newStats(), ...save.missionBase },
        missionIdx: save.missionIdx + ((save.missionsV ?? 1) < 2 && save.missionIdx >= 3 ? 1 : 0), log: save.log,
      });
      Object.assign(this.satisfaction, save.satisfaction);
      save.unlocked.forEach((u) => this.unlocked.add(u));
      if (save.research) this.research = save.research;
      else this.migrateResearch(save);
      this.migrateTrees(!!save.research);
      if (old) this.missionIdx = Math.min(this.missionIdx, MISSIONS.length);
      if (save.contracts) Object.assign(this.contracts, save.contracts);
      if (save.shopPrices) Object.assign(this.shopPrices, save.shopPrices);
    }
    this.net = new Network(this.grid);
    this.sim = new Simulation(this.net, old ? undefined : save?.sim);
    if (old && save) {
      this.sim.time = save.sim.time;
      this.sim.setLevel(save.sim.level);
    }
    this.sim.contractActive = (id) => this.contracts[id].status === 'active';
    this.sim.taktOf = (id) => (this.contracts[id].status === 'none' ? 0 : this.contracts[id].takt);
    this.sim.nightLines = (id) => this.contracts[id].lines ?? 1;
    this.sim.serviceOf = (id) => this.contracts[id].status === 'active' && !!this.contracts[id].service;
    if (save && !save.offers) this.migrateContracts(save);
    if (save?.offers) Object.assign(this.offers, save.offers);
    if (save?.news) Object.assign(this.news, save.news);
    if (save?.history) this.history = save.history;
    if (save?.achievements) this.achievements = save.achievements;
    if (save?.weather) Object.assign(this.weather, save.weather);
    if (save?.faults) this.faults = save.faults;
    if (save?.goals) this.goals = save.goals;
    if (save?.board) this.board = save.board;
    if (save?.crew) this.crew = save.crew;
    if (save?.inbox) this.inbox = save.inbox;
    if (save?.player) this.player = save.player;
    if (save?.missionMark !== undefined) this.missionMark = save.missionMark;
    this.faults.forEach((f) => this.sim.faultCells.add(f.k));
    this.applyWeather();
    this.clampTakts();
    this.updatePlatformLength();
    this.sim.fillTimetable();
    this.applySwitchSpeed();
    this.lastHour = Math.floor(this.sim.time / 3600);
    this.loopsPending = this.grid.mainRows.includes(SECOND_ROW) && this.grid.fixedPieces.size > 0;
  }

  /** Spielstand der kleinen Karte (96x32) mittig in die große Welt setzen */
  private loadSmallMap(save: GameSave) {
    const g = this.grid, OW = 96, OH = 32, dx = OLD_OFFSET.x, dy = OLD_OFFSET.y;
    const inRect = (x: number, y: number) => x >= dx && x < dx + OW && y >= dy && y < dy + OH;
    for (const p of [...g.pieces.values()]) if (g.pieceCells(p).some((k) => { const q = g.xy(k); return inRect(q.x, q.y); })) { g.removePiece(p.id); g.fixedPieces.delete(p.id); }
    for (const b of [...g.buildings.values()]) if (g.buildingCells(b).some((k) => { const p = g.xy(k); return inRect(p.x, p.y); })) g.removeBuilding(b.id);
    for (let y = 0; y < OH; y++) {
      for (let x = 0; x < OW; x++) {
        const k = y * OW + x;
        Object.assign(g.get(x + dx, y + dy)!, unpackCell(save.cells[k], save.sortDest?.[k] ?? null), { piece: null, building: null });
      }
    }
    save.links?.forEach((l) => g.addLink(l.kind, l.x + dx, l.y0 + dy, l.y1 + dy));
    save.pieces.forEach((p) => g.addPiece(p.key, p.x + dx, p.y + dy));
    save.buildings.forEach((b) => { g.addBuilding(b.key, b.x + dx, b.y + dy, b.decor).name = b.name; });
    const opw = OW / PARCEL;
    save.owned.forEach((o, i) => { if (o) g.buyParcel((i % opw) + dx / PARCEL, Math.floor(i / opw) + dy / PARCEL); });
    // Kreuzungsstellen im alten Bereich neu setzen, wo Platz ist
    g.addPassingLoops();
    if (save.mainRows.length > 1) g.expandLine();
  }

  /** alte Spielstände ohne Forschung: Bekanntes als erforscht übernehmen */
  private migrateResearch(save: GameSave) {
    const done = new Set<ResearchId>();
    if (save.unlocked.includes('access')) done.add('access');
    if (save.unlocked.includes('wire')) done.add('wire');
    if (save.unlocked.includes('facility')) (['siding', 'wash', 'remise', 'workshop', 'hump'] as ResearchId[]).forEach((r) => done.add(r));
    if (save.mainRows.length > 1) done.add('double');
    if (this.stations().length > 1) done.add('stations');
    this.research.done = [...done];
    if (this.missionIdx >= 2) this.unlocked.add('research');
    if (this.missionIdx >= 3) this.missionIdx++;
  }

  save(): GameSave {
    const g = this.grid;
    return {
      v: 5, missionsV: MISSIONS_VERSION, missionMark: this.missionMark,
      company: this.company,
      cells: g.cells.map((c) => (+c.track) | (+c.fixed << 1) | (+c.platform << 2) | (+c.signal << 3) | (+c.signalW << 4)
        | (+c.wire << 5) | (+c.siding << 6) | (+c.road << 7) | (+c.shunt << 8) | (+c.shuntSig << 9)),
      sortDest: g.cells.map((c) => c.sortDest),
      links: [...g.links.values()].map((l) => ({ ...l })),
      pieces: [...g.pieces.values()].map((p) => ({ ...p })),
      buildings: [...g.buildings.values()].map((b) => ({ ...b })),
      owned: [...g.owned],
      mainRows: [...g.mainRows],
      money: this.money, stats: this.stats, missionBase: this.missionBase,
      satisfaction: this.satisfaction, missionIdx: this.missionIdx,
      unlocked: [...this.unlocked], log: this.log, sim: this.sim.save(),
      research: this.research, contracts: this.contracts, shopPrices: this.shopPrices, offers: this.offers, news: this.news,
      history: this.history, achievements: this.achievements, weather: this.weather, faults: this.faults, goals: this.goals, mapId: currentMap().id, board: this.board, crew: this.crew, inbox: this.inbox, player: this.player,
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
    const free = (currentMap().stationNames ?? STATION_NAMES).filter((n) => !used.has(n));
    return free[Math.floor(Math.random() * free.length)] ?? `Bahnhof ${used.size + 1}`;
  }

  stationName(id: number, name: string) {
    const b = this.grid.buildings.get(id);
    if (b) { b.name = name; this.version++; }
  }

  stations() { return [...this.grid.buildings.values()].filter((b) => isStation(b.key) && !b.decor); }

  stationLevel(key: string) { return key === 'bld_station3' ? 3 : key === 'bld_station2' ? 2 : 1; }

  private connCache = { version: -1, map: new Map<number, { parking: boolean; bus: boolean }>() };
  /** Straßenanbindung je Bahnhof: Parkplatz / Busterminal über Straßen erreichbar */
  connections(id: number) {
    if (this.connCache.version !== this.version) {
      this.connCache = { version: this.version, map: new Map() };
      const g = this.grid;
      for (const st of this.stations()) {
        const seen = new Set<number>(), stack: number[] = [];
        const near = (cells: number[]) => {
          for (const k of cells) {
            const { x, y } = g.xy(k);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const c = g.get(x + dx, y + dy);
              if (c?.road) { const nk = g.key(x + dx, y + dy); if (!seen.has(nk)) { seen.add(nk); stack.push(nk); } }
            }
          }
        };
        near(g.buildingCells(st));
        const found = { parking: false, bus: false };
        while (stack.length) {
          const k = stack.pop()!;
          const { x, y } = g.xy(k);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const c = g.get(x + dx, y + dy);
            if (!c) continue;
            const bk = c.building !== null ? g.buildings.get(c.building)?.key : undefined;
            if (bk === 'bld_parking') found.parking = true;
            if (bk === 'bld_bus') found.bus = true;
            const nk = g.key(x + dx, y + dy);
            if (c.road && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
          }
        }
        this.connCache.map.set(st.id, found);
      }
    }
    return this.connCache.map.get(id) ?? { parking: false, bus: false };
  }

  /** Zuschlag eines Bahnhofs auf die Einnahmen */
  stationBonus(id: number) {
    const b = this.grid.buildings.get(id);
    if (!b) return 0;
    const lvl = this.stationLevel(b.key);
    const c = this.connections(id);
    return [0, 0.15, 0.25, 0.4][lvl] + (c.parking ? 0.1 : 0) + (c.bus ? 0.15 : 0);
  }

  /** Einnahmen-Faktor Personenverkehr durch Empfangsgebäude, Parkplatz und Bus */
  get incomeFactor() { return 1 + Math.min(1.2, this.stations().reduce((a, b) => a + this.stationBonus(b.id), 0)); }

  /** Empfangsgebäude ausbauen; gibt Grund zurück, wenn es nicht geht */
  upgradeBlock(id: number): string | null {
    const b = this.grid.buildings.get(id);
    if (!b) return 'Kein Gebäude';
    const next = this.stationLevel(b.key) + 1;
    if (next > 3) return 'Schon voll ausgebaut';
    if (!this.researched(next === 2 ? 'station2' : 'station3')) return `Erst erforschen: Bahnhofsausbau ${next === 2 ? 'I' : 'II'}`;
    if (this.money < STATION_UPGRADE[next]) return 'Zu wenig Geld';
    return null;
  }

  upgradeStation(id: number) {
    if (this.upgradeBlock(id)) return false;
    const b = this.grid.buildings.get(id)!;
    const next = this.stationLevel(b.key) + 1;
    this.money -= STATION_UPGRADE[next];
    b.key = next === 2 ? 'bld_station2' : 'bld_station3';
    this.fx.push({ amount: -STATION_UPGRADE[next], x: b.x + 1, y: b.y + 1 });
    this.addLog(`${b.name ?? 'Bahnhof'} ausgebaut`, 'good');
    this.version++;
    return true;
  }

  // ------------------------------------------------------------ Läden
  /** Kaufquote je Fahrgast bei einem Preis */
  shopRate(key: string, price = this.shopPrices[key]) {
    const s = SHOPS[key];
    const fest = key === 'bld_souvenir' && this.sim.time < this.sim.festUntil ? 3 : 1;
    return Math.max(0, s.rate * fest * Math.min(1.5, 2 - price / s.ref));
  }

  setShopPrice(key: string, price: number) {
    const ref = SHOPS[key].ref;
    this.shopPrices[key] = Math.round(Math.max(ref * 0.4, Math.min(ref * 2.5, price)) * 10) / 10;
  }

  /** Stimmung eines Fahrgasts beim Einsteigen (aus der Menschen-Simulation) */
  passengerMood(op: OperatorId, mood: -1 | 0 | 1) {
    this.moodEma += (mood - this.moodEma) * 0.01;
    this.satisfaction[op] = Math.max(0, Math.min(100, this.satisfaction[op] + (mood < 0 ? -0.4 : mood > 0 ? 0.15 : 0)));
  }

  // ------------------------------------------------------------ Ablauf
  tick(dtReal: number) {
    if (this.paused || this.gameOver) return;
    const dtGame = dtReal * GAME_SEC_PER_REAL_SEC * this.speed;
    this.sim.step(dtGame);
    this.tickResearch(dtGame);
    if (this.loopsPending && this.sim.time > this.loopCheck) { this.loopCheck = this.sim.time + 60; this.removeLoops(); }
    const hour = Math.floor(this.sim.time / 3600);
    if (hour !== this.lastHour) { this.lastHour = hour; this.hourly(); }
    this.checkOffers();
    this.tickFaults();
    this.checkDeadlock();
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
        this.money -= CANCEL_COST;
        this.stats.handled++;
        this.stats.streak = 0;
        this.stats.recent.push(false);
        this.satisfaction[t.op.id] = Math.max(0, this.satisfaction[t.op.id] - 10);
        this.addLog(`${t.number} aus dem Verkehr genommen (−${CANCEL_COST} €)`, 'bad');
        this.fx.push({ amount: -CANCEL_COST, x: 0, y: 0, train: t.id, label: 'Zug fällt aus' });
        continue;
      }
      if (ev.type === 'stop') {
        this.stats.passengers += t.passengers;
        if (trafficClass(t.op) === 'regional') this.stats.stopsRegio++;
        const run = t.route[this.sim.posOnTrain(t, 0).i]?.stopRun?.id ?? t.route[t.route.length - 1]?.stopRun?.id;
        if (run && !this.stats.platformRuns.includes(run)) this.stats.platformRuns.push(run);
        if (t.op.kind === 'ic') this.stats.stopsIC++;
        let shopSum = 0;
        for (const key of Object.keys(SHOPS)) {
          const list = [...this.grid.buildings.values()].filter((b) => b.key === key && !b.decor);
          if (!list.length) continue;
          // mehrere Läden gleicher Art: mehr Kunden, aber abnehmend
          const reach = Math.min(1.8, 1 + 0.4 * (list.length - 1));
          const sum = Math.round(t.passengers * this.shopRate(key) * reach * this.shopPrices[key]);
          if (!sum) continue;
          shopSum += sum;
          this.money += sum;
          const b = list[Math.floor(Math.random() * list.length)];
          this.fx.push({ amount: sum, x: b.x, y: b.y, label: SHOPS[key].name });
          // zu teuer verärgert, günstig freut
          const r = this.shopPrices[key] / SHOPS[key].ref;
          if (r > 1.3) this.satisfaction[t.op.id] = Math.max(0, this.satisfaction[t.op.id] - (r - 1.3) * 2);
          if (r < 0.85) this.satisfaction[t.op.id] = Math.min(100, this.satisfaction[t.op.id] + 0.2);
        }
        // Werbeflächen: kleiner Betrag je Fahrgast und Plakatwand
        const boards = Math.min(6, [...this.grid.buildings.values()].filter((b) => b.key === 'bld_billboard' && !b.decor).length);
        const ads = Math.round(t.passengers * 0.05 * boards);
        if (ads) {
          shopSum += ads;
          this.money += ads;
          this.fx.push({ amount: ads, x: 0, y: 0, train: t.id, label: 'Werbung' });
        }
        if (shopSum) { const td = this.today(); td.shop = (td.shop ?? 0) + shopSum; }
        if (t.op.needsStop && !t.transit) this.cleanEma += ((1 - t.dirt / 100) - this.cleanEma) * 0.05;
        if (t.dirt > 70) this.satisfaction[t.op.id] = Math.max(0, this.satisfaction[t.op.id] - 2);
        this.addLog(`${t.number} abgefertigt · ${t.passengers} Fahrgäste${shopSum ? ` · Läden +${shopSum} €` : ''}${t.dirt > 70 ? ' · Zug verschmutzt!' : ''}`, t.dirt > 70 ? 'bad' : 'info');
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
        const fee = this.contracts[t.op.id]?.service ? PARK_FEE[ev.kind] : 0;
        if (fee) { this.money += fee; this.fx.push({ amount: fee, x: 0, y: 0, train: t.id, label: 'Abstellen' }); }
        this.addLog(`${t.number} abgestellt (${where})${fee ? ` · +${fee} €` : ''}`, 'info');
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
    const deal = t.op.special ? this.news.deals?.[t.id] : undefined;
    if (deal) {
      income = punctual ? deal.reward : -deal.penalty;
      if (punctual) this.stats.specialsOk = (this.stats.specialsOk ?? 0) + 1;
      delete this.news.deals[t.id];
      this.addLog(`${t.number} Sonderzug ${punctual ? 'pünktlich – Prämie' : 'zu spät – Strafe'} · ${income >= 0 ? '+' : ''}${income} €`, punctual ? 'good' : 'bad');
    } else if (missed) {
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
    const os = ((this.stats.opStats ??= {})[t.op.id] ??= { handled: 0, punctual: 0 });
    os.handled++;
    if (punctual) os.punctual++;
    const td = this.today();
    td.handled++;
    if (punctual) td.punctual++;
    td.pax += t.passengers;
    td.maxDelay = Math.max(td.maxDelay ?? 0, missed ? 99 : delayMin);
    this.checkGoals();
    this.stats.recent.push(punctual);
    if (this.stats.recent.length > 50) this.stats.recent.shift();
  }

  // ------------------------------------------------------------ Forschung
  researched(id: ResearchId) { return this.research.done.includes(id); }

  /** alte Spielstände auf die drei Bäume umstellen */
  private migrateTrees(hadResearch: boolean) {
    const r = this.research;
    r.running ??= {};
    if (r.current) { r.running[RESEARCH_BY_ID[r.current.id].tree] = r.current; r.current = null; }
    const done = new Set(r.done);
    const add = (...ids: ResearchId[]) => ids.forEach((i) => done.add(i));
    // was früher ohne Forschung baubar war, bleibt in alten Ständen frei
    if (hadResearch || this.company) add('bench', 'kiosk', 'cafe', 'green');
    if (done.has('deco')) add('light', 'green', 'clock', 'water', 'monument');
    if (done.has('station2')) add('wc');
    if (done.has('station3')) add('inn');
    if (done.has('wash')) add('shunt');
    if (done.has('fastSwitch')) add('diagSwitch');
    r.done = [...done];
  }

  /** laufende Forschung je Baum */
  runningIn(tree: ResearchTree) { return this.research.running?.[tree]; }
  runningOf(id: ResearchId) {
    const cur = this.research.running?.[RESEARCH_BY_ID[id].tree];
    return cur?.id === id ? cur : null;
  }

  /** Kann die Forschung gestartet werden? sonst Grund */
  researchBlock(id: ResearchId): string | null {
    const r = RESEARCH_BY_ID[id];
    if (this.researched(id)) return 'Schon erforscht';
    if (this.runningIn(r.tree)) return 'In diesem Baum läuft schon eine Forschung';
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
    (this.research.running ??= {})[r.tree] = { id, left: r.hours * 3600 };
    this.addLog(`Forschung gestartet: ${r.name}`, 'info');
    return true;
  }

  private tickResearch(dt: number) {
    const run = this.research.running;
    if (!run) return;
    for (const tree of Object.keys(run) as ResearchTree[]) {
      const cur = run[tree];
      if (!cur) continue;
      cur.left -= dt;
      if (cur.left > 0) continue;
      delete run[tree];
      this.finishResearch(cur.id);
    }
  }

  private finishResearch(id: ResearchId) {
    const r = RESEARCH_BY_ID[id];
    this.research.done.push(id);
    r.tools?.forEach((t) => this.unlocked.add(t));
    r.apply?.(this);
    this.applySwitchSpeed();
    if (r.apply) this.rebuild(); else this.version++;
    this.addLog(`Forschung abgeschlossen: ${r.name}`, 'good');
    this.uiEvents.push({ type: 'research', id });
    this.uiEvents.push({ type: 'autosave', label: `Forschung: ${r.name}` });
  }

  private applySwitchSpeed() {
    this.sim.switchV = (10 * 16) / 60;
    // Forschungs-Wirkungen
    this.sim.dwellFactor = this.researched('dwell') ? 0.85 : 1;
    priceMod.fair = this.researched('haggle') ? 1.1 : 1;
  }

  get maxStations() { return this.researched('stations') ? 4 : 1; }

  // ------------------------------------------------------------ Verträge
  /** Ausschreibungen und Anfragen, die gerade offen sind / noch kommen */
  offers = {
    /** aktuell angezeigtes Angebot */
    open: null as Offer | null,
    /** Spielzeit, ab der die nächste Anfrage kommen darf */
    nextInquiry: 0,
    /** Güter-Ausschreibung kommt um diese Zeit (0 = noch nicht geplant) */
    freightAt: 0,
    done: [] as string[],
  };

  /** Unternehmen mit Vertrag (oder gekündigt: fahren durch) */
  activeOperators() {
    return Object.values(OPERATORS).filter((o) => this.contracts[o.id].status !== 'none');
  }

  /** dichtester erlaubter Takt: erst mit 2. Streckengleis öfter als stündlich */
  get minTakt() { return this.grid.mainRows.includes(SECOND_ROW) ? MIN_TAKT_DOUBLE : MIN_TAKT_SINGLE; }

  private clampTakts() {
    for (const c of Object.values(this.contracts)) c.takt = Math.max(this.minTakt, c.takt);
  }

  setPrice(op: OperatorId, cls: LengthClass, price: number) {
    const fair = fairPrice(OPERATORS[op], cls);
    this.contracts[op].price[cls] = Math.max(Math.round(fair * 0.5), Math.min(Math.round(fair * 2), Math.round(price / 10) * 10));
  }

  /** Takt um eine Stufe ändern (dir −1 = öfter, +1 = seltener) */
  stepTakt(op: OperatorId, dir: number) {
    const c = this.contracts[op];
    // Nachtzug: Linien statt Takt (dir < 0 = mehr)
    if (OPERATORS[op].kind === 'night') {
      const n = Math.max(1, Math.min(3, (c.lines ?? 1) + (dir < 0 ? 1 : -1)));
      if (n === (c.lines ?? 1)) return;
      this.satisfaction[op] = Math.max(0, Math.min(100, this.satisfaction[op] + (n > (c.lines ?? 1) ? 4 : -6)));
      c.lines = n;
      this.sim.retime(op);
      return;
    }
    const steps = TAKT_STEPS.filter((m) => m >= this.minTakt);
    const i = steps.indexOf(c.takt);
    const next = steps[Math.max(0, Math.min(steps.length - 1, (i < 0 ? 0 : i) + (dir < 0 ? 1 : -1)))];
    if (next === c.takt) return;
    // mehr Züge freuen das Unternehmen, weniger ärgern es
    this.satisfaction[op] = Math.max(0, Math.min(100, this.satisfaction[op] + (next < c.takt ? 4 : -6)));
    c.takt = next;
    this.sim.retime(op);
  }

  /** neues Angebot an ein Unternehmen, das gekündigt hat */
  offer(op: OperatorId) {
    const c = this.contracts[op];
    if (c.status !== 'cancelled' || this.sim.time < c.talkAfter) return false;
    const ok = Math.random() < acceptChance(OPERATORS[op], c, this.satisfaction[op]);
    if (ok) {
      c.status = 'active';
      this.sim.recontract(op);
      this.addLog(`${OPERATORS[op].name} unterschreibt den neuen Vertrag`, 'good');
    } else {
      c.talkAfter = this.sim.time + TALK_PAUSE / 2;
      this.addLog(`${OPERATORS[op].name} lehnt das Angebot ab`, 'bad');
    }
    this.uiEvents.push({ type: 'contract', op, kind: ok ? 'accept' : 'reject' });
    return ok;
  }

  /** Kann das Unternehmen bei uns fahren? (E-Züge brauchen Oberleitung) */
  canRun(op: OperatorId) {
    const o = OPERATORS[op];
    if (o.traction === 'electric' && !this.researched('wire')) return 'braucht Oberleitung';
    if (o.kind === 'sort' && !this.researched('hump')) return 'braucht Rangierbahnhof';
    if (o.highSpeed && !this.researched('fastSwitch')) return 'braucht Schnellfahrweichen';
    return null;
  }

  /** Angebot annehmen (bei Ausschreibung: dieses eine Unternehmen) */
  acceptOffer(op: OperatorId) {
    const o = this.offers.open;
    if (!o || !o.ops.includes(op) || this.canRun(op)) return false;
    const c = this.contracts[op];
    c.status = 'active';
    c.takt = Math.max(this.minTakt, OPERATORS[op].takt);
    this.satisfaction[op] = 70;
    this.offers.open = null;
    this.offers.nextInquiry = this.sim.time + 3 * 3600;
    this.sim.retime(op);
    this.addLog(`Vertrag mit ${OPERATORS[op].name}: ${OPERATORS[op].category} alle ${c.takt} min`, 'good');
    return true;
  }

  /** Anfrage ablehnen / Ausschreibung schließen */
  declineOffer() {
    const o = this.offers.open;
    if (!o) return;
    if (o.kind === 'inquiry') o.ops.forEach((op) => (this.contracts[op].declinedUntil = this.sim.time + 12 * 3600));
    this.offers.open = null;
    this.offers.nextInquiry = this.sim.time + 2 * 3600;
  }

  private openOffer(o: Offer, key: string) {
    if (this.offers.open || this.offers.done.includes(key)) return;
    this.offers.done.push(key);
    this.offers.open = o;
    this.uiEvents.push({ type: 'offer' });
  }

  // ------------------------------------------------------------ Wetter, Störungen, Erfolge, Entscheidungen
  applyWeather() {
    this.sim.weatherV = this.weather.kind === 'snow' ? (this.researched('switchHeat') ? 0.95 : 0.85) : this.weather.kind === 'rain' ? 0.95 : 1;
  }

  private updateWeather() {
    const t = this.sim.time;
    if (t < this.weather.until) return;
    const r = Math.random();
    const w = currentMap().weather;
    const kind = r < w.snow ? 'snow' : r < w.snow + w.rain ? 'rain' : 'sun';
    const was = this.weather.kind;
    this.weather = { kind, until: t + (3 + Math.random() * 6) * 3600 };
    this.applyWeather();
    if (kind !== was) {
      if (kind === 'snow') this.addLog(this.researched('switchHeat') ? 'Schneefall – dank Weichenheizung kaum Behinderungen' : 'Schneefall: Züge fahren langsamer (Weichenheizung hilft)', 'bad');
      else if (kind === 'rain') this.addLog('Regen zieht auf', 'info');
      else this.addLog('Das Wetter klart auf', 'good');
    }
  }

  /** ab und zu fällt eine eigene Weiche oder ein eigenes Signal aus */
  private maybeFault() {
    // Instandhalter warten vorbeugend: weniger Ausfälle
    const chance = 0.05 * (1 - 0.15 * this.crew) * (this.researched('crew2') ? 0.5 : 1);
    if (this.faults.length || Math.random() > chance) return;
    const g = this.grid;
    const cand: { k: number; kind: 'switch' | 'signal' }[] = [];
    for (const p of g.pieces.values()) {
      if (g.fixedPieces.has(p.id) || PIECES[p.key].group !== 'switch') continue;
      const cells = g.pieceCells(p);
      cand.push({ k: cells[Math.floor(cells.length / 2)], kind: 'switch' });
    }
    g.cells.forEach((c, k) => { if ((c.signal || c.signalW) && !c.fixed && g.isOwned(g.xy(k).x, g.xy(k).y)) cand.push({ k, kind: 'signal' }); });
    if (cand.length < 2) return;
    const f = cand[Math.floor(Math.random() * cand.length)];
    if (this.sim.owner[f.k] !== 0) return;
    this.faults.push({ ...f, since: this.sim.time });
    this.sim.faultCells.add(f.k);
    const p = g.xy(f.k);
    this.addLog(this.crew ? `Störung: ${f.kind === 'switch' ? 'Weiche' : 'Signal'} defekt – deine Instandhalter rücken aus`
      : `Störung: ${f.kind === 'switch' ? 'Weiche' : 'Signal'} defekt – anklicken, um den Störtrupp zu schicken (${REPAIR_COST} €)`, 'bad');
    this.fx.push({ amount: 0, x: p.x, y: p.y, label: 'STÖRUNG!' });
  }

  faultAt(x: number, y: number) {
    const g = this.grid;
    const c = g.get(x, y);
    if (!c) return undefined;
    const keys = new Set<number>([g.key(x, y)]);
    if (c.piece !== null) g.pieceCells(g.pieces.get(c.piece)!).forEach((k) => keys.add(k));
    return this.faults.find((f) => keys.has(f.k));
  }

  /** Störtrupp schicken: kostet, braucht 20 Spielminuten */
  repairFault(x: number, y: number) {
    const f = this.faultAt(x, y);
    if (!f || f.repairAt) return false;
    this.money -= REPAIR_COST;
    f.repairAt = this.sim.time + this.repairMinutes * 60;
    this.addLog(`Störtrupp unterwegs (−${REPAIR_COST} €), fertig in ${this.repairMinutes} min`, 'info');
    this.fx.push({ amount: -REPAIR_COST, x, y, label: 'Störtrupp' });
    return true;
  }

  /** Reparaturdauer: eigene Instandhalter sind schneller */
  get repairMinutes() { return Math.max(3, Math.round((20 / (1 + 0.5 * this.crew)) * (this.researched('estw') ? 0.5 : 1))); }

  /** Instandhalter einstellen / entlassen */
  setCrew(n: number) {
    if (!this.researched('crew')) return;
    const v = Math.max(0, Math.min(Game.CREW_MAX, n));
    if (v === this.crew) return;
    this.addLog(v > this.crew ? `Instandhalter eingestellt (jetzt ${v})` : `Instandhalter entlassen (jetzt ${v})`, 'info');
    this.crew = v;
    this.version++;
  }

  private tickFaults() {
    if (!this.faults.length) return;
    const t = this.sim.time;
    for (const f of [...this.faults]) {
      // eigene Instandhalter rücken nach 5 min von selbst aus, ohne Extrakosten
      if (this.crew && !f.repairAt && t - f.since > 5 * 60) {
        f.repairAt = t + this.repairMinutes * 60;
        const p = this.grid.xy(f.k);
        this.fx.push({ amount: 0, x: p.x, y: p.y, label: 'Instandhalter' });
      }
      // ohne Trupp nach 4 Stunden von selbst (aber die Unternehmen sind sauer)
      const auto = !f.repairAt && t - f.since > (this.researched('estw') ? 2 : 4) * 3600;
      if ((f.repairAt && t >= f.repairAt) || auto) {
        this.faults.splice(this.faults.indexOf(f), 1);
        this.sim.faultCells.delete(f.k);
        if (auto) {
          for (const o of this.activeOperators()) this.satisfaction[o.id] = Math.max(0, this.satisfaction[o.id] - 5);
          this.addLog('Störung nach Stunden endlich behoben – die Unternehmen sind verärgert', 'bad');
        } else {
          this.stats.repairs = (this.stats.repairs ?? 0) + 1;
          this.addLog('Störung behoben', 'good');
        }
      }
    }
  }

  private checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.achievements.includes(a.id) || !a.check(this)) continue;
      this.achievements.push(a.id);
      this.addLog(`Erfolg: ${a.name}!`, 'good');
      this.uiEvents.push({ type: 'achievement', id: a.id });
    }
  }

  /** Entscheidung aus der Zeitung annehmen oder ablehnen */
  decide(yes: boolean) {
    const d = this.decision;
    this.decision = null;
    if (!d || !yes) return;
    if (d.id === 'fans' && d.at !== undefined && d.dir) {
      const tr = this.sim.addSpecial('fx', d.at, d.dir);
      this.news.deals[tr.id] = { reward: d.reward ?? 0, penalty: d.penalty ?? 0 };
      this.addLog(`Sonderzug ${tr.number} bestellt: Ankunft um ${fmtTime(d.at)}`, 'good');
    }
    if (d.id === 'sponsor' && d.cost) {
      this.money -= d.cost;
      this.sim.festUntil = this.sim.time + 12 * 3600;
      for (const o of this.activeOperators()) this.satisfaction[o.id] = Math.min(100, this.satisfaction[o.id] + 8);
      this.addLog('Bahnhofsfest gesponsert – 12 Stunden mehr Fahrgäste, Unternehmen zufrieden', 'good');
    }
  }

  // ------------------------------------------------------------ Stau / Game Over
  /** Spielzeit, seit der sich Züge gegenseitig blockieren (0 = kein Stau) */
  deadlockSince = 0;
  gameOver = false;

  /** Kredit: unter 0 € automatisch, Zinsen täglich; ab dieser Schuld ist Schluss */
  static readonly DEBT_LIMIT = -50000;
  static readonly LOAN_RATE = 0.03;

  private checkDebt() {
    if (this.gameOver) return;
    if (this.money < 0 && !this.inDebt) {
      this.inDebt = true;
      this.stats.wasDebt = true;
      this.addLog(`Kasse leer – automatischer Kredit, ${Math.round(Game.LOAN_RATE * 100)} % Zinsen pro Tag`, 'bad');
      if (this.company) this.uiEvents.push({ type: 'letter', mood: 'bad', from: BANK(), title: 'Ihr Konto ist im Minus',
        text: `<p>${this.salutation(`Sehr geehrte Damen und Herren der ${this.company}`)}</p><p>Ihr Geschäftskonto ist soeben ins Minus gerutscht. Damit Ihre Züge weiterfahren, gewähren wir Ihnen automatisch einen Kredit – zu <b>${Math.round(Game.LOAN_RATE * 100)} % Zinsen pro Tag</b>.</p><p>Bitte beachten Sie: Bei <b>${(-Game.DEBT_LIMIT).toLocaleString('de-AT')}&nbsp;€ Schulden</b> müssen wir die Kreditlinie leider kündigen.</p>` });
    } else if (this.money >= 0 && this.inDebt) {
      this.inDebt = false;
      this.addLog('Kredit zurückgezahlt!', 'good');
      this.uiEvents.push({ type: 'letter', mood: 'good', from: BANK(), title: 'Kredit getilgt',
        text: `<p>${this.salutation('Sehr geehrte Damen und Herren')}</p><p>wir freuen uns, Ihnen mitzuteilen, dass Ihr Kredit vollständig zurückgezahlt ist. Es war uns ein Vergnügen. Beehren Sie uns bald wieder – aber nicht zu bald.</p>` });
    }
    if (this.money <= Game.DEBT_LIMIT) {
      this.gameOver = true;
      this.paused = true;
      this.uiEvents.push({ type: 'gameover', reason: 'debt' });
    }
  }
  inDebt = false;

  /** Zinsen für heute (bei Schulden) */
  get interest() { return this.money < 0 ? Math.max(10, Math.round(-this.money * Game.LOAN_RATE)) : 0; }

  private checkDeadlock() {
    this.checkDebt();
    if (this.gameOver) return;
    if (!this.sim.deadlock) { this.deadlockSince = 0; return; }
    if (!this.deadlockSince) {
      this.deadlockSince = this.sim.time;
      this.addLog('STAU! Züge blockieren sich gegenseitig – schnell lösen!', 'bad');
      this.uiEvents.push({ type: 'deadlock' });
    }
    if (this.sim.time - this.deadlockSince > DEADLOCK_LIMIT) {
      this.gameOver = true;
      this.paused = true;
      this.uiEvents.push({ type: 'gameover', reason: 'deadlock' });
    }
  }

  /** verbleibende Spielsekunden bis Game Over */
  get deadlockLeft() { return this.deadlockSince ? Math.max(0, DEADLOCK_LIMIT - (this.sim.time - this.deadlockSince)) : 0; }

  /** Mission „Wendezüge“: ein Wendezug-Unternehmen fragt an */
  requestTurnback() {
    if (Object.values(OPERATORS).some((o) => o.turnback && this.contracts[o.id].status !== 'none')) return;
    const ops = (['lb', 'sb', 'rx'] as OperatorId[]).filter((op) => !this.canRun(op));
    this.offers.done = this.offers.done.filter((k) => k !== 'turnback');
    this.openOffer({ kind: 'tender', title: 'Ausschreibung Wendezüge', text: 'Diese Züge enden bei dir und fahren zurück. Wähle einen Partner.', ops }, 'turnback');
  }

  /** Ausschreibungen und Anfragen auslösen */
  private checkOffers() {
    if (this.offers.open) return;
    const none = (op: OperatorId) => this.contracts[op].status === 'none';
    const t = this.sim.time;
    // 1. Regionalverkehr, sobald ein Empfangsgebäude steht
    if (this.stations().length && !this.offers.done.includes('regio')) {
      this.openOffer({ kind: 'tender', title: 'Ausschreibung Regionalverkehr', text: 'Dein Bahnhof ist eröffnet! Wähle EIN Unternehmen, das bei dir hält.',
        ops: currentMap().tenderRegio }, 'regio');
      this.offers.freightAt = t + 2 * 3600;
      return;
    }
    // 2. Güterverkehr kurz danach
    if (this.offers.freightAt && t >= this.offers.freightAt && !this.offers.done.includes('freight')) {
      this.openOffer({ kind: 'tender', title: 'Ausschreibung Güterverkehr', text: 'Güterzüge fahren durch und zahlen für die Trasse. Wähle EIN Unternehmen.',
        ops: currentMap().tenderFreight }, 'freight');
      return;
    }
    // 3. danach melden sich immer wieder Unternehmen (E-Züge erst mit Oberleitung)
    if (!this.offers.done.includes('freight') || t < this.offers.nextInquiry) return;
    const order: OperatorId[] = currentMap().inquiries;
    const cand = order.find((op) => none(op) && !this.canRun(op) && (this.contracts[op].declinedUntil ?? 0) <= t
      && (op !== 'hs' || this.grid.mainRows.includes(SECOND_ROW)));
    if (!cand) { this.offers.nextInquiry = t + 3600; return; }
    const o = OPERATORS[cand];
    this.offers.done = this.offers.done.filter((k) => k !== `ask:${cand}`);
    this.openOffer({ kind: 'inquiry', title: 'Anfrage', text: `${o.name} möchte bei dir fahren: ${o.category}.`, ops: [cand] }, `ask:${cand}`);
  }

  /** alte Spielstände: wer nach altem Takt fuhr, bekommt einen Vertrag */
  private migrateContracts(save: GameSave) {
    const takt = TAKT[save.sim.level] ?? TAKT[1];
    for (const id of Object.keys(OPERATORS) as OperatorId[]) {
      const c = this.contracts[id] as Contract & { active?: boolean };
      if (!c.status) c.status = takt[id] ? (c.active === false ? 'cancelled' : 'active') : 'none';
      if (!c.takt) c.takt = takt[id] || OPERATORS[id].takt;
      delete c.active;
    }
    this.offers.done = ['regio', 'freight'];
    this.offers.nextInquiry = this.sim.time + 3600;
  }

  /** längster Bahnsteig mit Zugang → Züge dürfen so lang werden */
  updatePlatformLength() {
    this.sim.maxPlatform = Math.max(0, ...this.net.runs.filter((r) => r.accessible).map((r) => r.len));
  }

  // ------------------------------------------------------------ Instandhaltung & Zeitung
  /** tägliche Instandhaltung: jedes Gleis, jede Weiche, jeder Bahnsteig, jedes Gebäude kostet */
  maintenance() {
    const g = this.grid;
    let track = 0, plat = 0, sig = 0, wire = 0;
    g.cells.forEach((c, k) => {
      const p = g.xy(k);
      if (!g.isOwned(p.x, p.y)) return;
      if (c.track && !c.fixed) track++;
      if (c.platform) plat++;
      if (c.signal) sig++;
      if (c.signalW) sig++;
      if (c.wire && !c.fixed) wire++;
    });
    let pieces = 0;
    for (const pc of g.pieces.values()) if (g.isOwned(pc.x, pc.y)) pieces++;
    let bld = 0;
    for (const b of g.buildings.values()) {
      const d = BUILDINGS[b.key];
      if (!b.decor && d && (d.group === 'func' || d.group === 'facility' || d.group === 'road')) bld += d.cost * 0.01;
    }
    const base = { Gleise: track * 2 + pieces * 10 + sig * 2 + wire, Bahnsteige: plat * 3, Gebäude: Math.round(bld), Personal: this.crew * Game.CREW_WAGE };
    const total = base.Gleise + base.Bahnsteige + base.Gebäude + base.Personal;
    return { ...base, total, vandal: this.sim.time < this.news.stationUntil };
  }

  /** um Mitternacht abrechnen */
  // ------------------------------------------------------------ Tagesziele & Bahnhofs-Bewertung
  goals: Goal[] = [];
  /** gleitende Mittel für die Bewertung */
  cleanEma = 0.7;
  moodEma = 0.3;
  rating = { stars: 3, parts: { Pünktlichkeit: 0.8, Sauberkeit: 0.7, Komfort: 0, Service: 0, Stimmung: 0.6 } as Record<string, number> };

  /** Ziele des Tages prüfen (sofort erreichbare) */
  checkGoals() {
    if (!this.goals.length) return;
    const d = this.today();
    for (const goal of this.goals) {
      if (goal.done || goal.failed) continue;
      if (goal.kind === 'noLate') { if ((d?.maxDelay ?? 0) > goal.target) { goal.failed = true; this.addLog('Tagesziel verpasst: ein Zug war zu spät', 'bad'); } continue; }
      if (goal.kind === 'balance') continue;
      if (goalProgress(goal, d, this).value >= 1) this.rewardGoal(goal);
    }
  }

  private rewardGoal(goal: Goal) {
    goal.done = true;
    this.money += goal.reward;
    this.research.points += goal.fp;
    this.addLog(`Tagesziel geschafft: ${goalProgress(goal, undefined, this).label} · +${goal.reward.toLocaleString('de-AT')} € · +${goal.fp} FP`, 'good');
    this.uiEvents.push({ type: 'goal' });
  }

  /** um Mitternacht: Tagesziele abschließen und neue verteilen */
  private rollGoals() {
    const prev = this.history.find((h) => h.day === Math.floor(this.sim.time / 86400) - 1);
    for (const goal of this.goals) {
      if (goal.done || goal.failed) continue;
      if (goal.kind === 'noLate' && prev && prev.handled > 0) this.rewardGoal(goal);
      else if (goal.kind === 'balance' && prev && prev.income - prev.expense > 0) this.rewardGoal(goal);
    }
    this.goals = this.stations().length ? newGoals(this, prev) : [];
  }

  /** Bahnhofs-Bewertung 1–5 Sterne: mehr Sterne, mehr Fahrgäste */
  updateRating() {
    const r = this.stats.recent;
    const punct = r.length ? r.filter(Boolean).length / r.length : 0.8;
    const runs = Math.max(1, this.net.runs.filter((x) => x.accessible).length);
    const count = (keys: string[]) => [...this.grid.buildings.values()].filter((b) => !b.decor && keys.includes(b.key)).length;
    const comfort = Math.min(1, (count(['bld_shelter', 'bld_bench', 'bld_clock', 'bld_wc', 'bld_lamp']) / (runs * 3)));
    const shopTypes = ['bld_kiosk', 'bld_cafe', 'bld_vending', 'bld_inn'].filter((k) => count([k]) > 0).length;
    const service = Math.min(1, shopTypes / 3 + (count(['bld_parking', 'bld_bus']) ? 0.2 : 0));
    const mood = Math.max(0, Math.min(1, (this.moodEma + 1) / 2 + (this.researched('cat') ? 0.1 : 0)));
    const parts = { Pünktlichkeit: punct, Sauberkeit: this.cleanEma, Komfort: comfort, Service: service, Stimmung: mood };
    const score = punct * 0.35 + this.cleanEma * 0.15 + comfort * 0.2 + service * 0.15 + mood * 0.15;
    const stars = Math.max(1, Math.min(5, Math.round(score * 5)));
    if (this.stations().length && stars !== this.rating.stars) this.addLog(`Bahnhofs-Bewertung: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, stars > this.rating.stars ? 'good' : 'bad');
    this.rating = { stars, parts };
    this.sim.paxFactor = 0.8 + 0.1 * stars;
  }

  private daily() {
    this.rollGoals();
    const m = this.maintenance();
    const cost = (m.total - m.Personal) * (m.vandal ? 2 : 1) + m.Personal;
    if (cost) {
      this.money -= cost;
      this.addLog(`Instandhaltung: −${cost.toLocaleString('de-AT')} €${m.vandal ? ' (doppelt wegen Vandalismus)' : ''}`, 'bad');
    }
    const zins = this.interest;
    if (zins) {
      this.money -= zins;
      this.addLog(`Kreditzinsen: −${zins.toLocaleString('de-AT')} €`, 'bad');
    }
    // Tagesbilanz (alles, was die Kasse heute bewegt hat)
    if (Number.isFinite(this.news.dayMoney)) {
      const bal = Math.round(this.money - this.news.dayMoney);
      this.news.lastBalance = bal;
      this.addLog(`Tagesbilanz: ${bal >= 0 ? '+' : '−'}${Math.abs(bal).toLocaleString('de-AT')} €`, bal >= 0 ? 'good' : 'bad');
    }
    this.news.dayMoney = this.money;
    // ab und zu ein Brief vom Vorstand
    const l = dailyLetter(this);
    if (l) {
      if (l.bonus) this.money += l.bonus;
      this.uiEvents.push({ type: 'letter', title: l.title, text: l.text, mood: l.mood, bonus: l.bonus });
      this.addLog(`Brief vom Vorstand: ${l.title}`, l.mood === 'bad' ? 'bad' : 'good');
    }
  }

  /** Begrüßungsbrief beim neuen Spiel */
  welcome() {
    const l = welcomeLetter(this);
    this.board.nextAt = this.sim.time + 86400;
    this.uiEvents.push({ type: 'letter', title: l.title, text: l.text, mood: l.mood });
  }

  /** ab und zu eine Zeitungsmeldung mit Folgen */
  private checkNews() {
    const t = this.sim.time;
    if (!this.stations().length) return;
    if (!this.news.nextAt) { this.news.nextAt = t + (20 + Math.random() * 16) * 3600; return; }
    if (t < this.news.nextAt) return;
    this.news.nextAt = t + (14 + Math.random() * 18) * 3600;
    // Entscheidungen
    const q = Math.random();
    const agency = this.researched('specials');
    if (q < (agency ? 0.4 : 0.25) && this.stations().length && !this.decision) {
      const at = Math.round((t + (3 + Math.random() * 3) * 3600) / 600) * 600;
      const dir: 'E' | 'W' = Math.random() < 0.5 ? 'E' : 'W';
      const reward = agency ? 2250 : 1500;
      this.decision = { id: 'fans', at, dir, reward, penalty: 800 };
      this.uiEvents.push({ type: 'decision', tag: 'fans', title: 'Fußball-Fans brauchen einen Sonderzug',
        text: `Der Fanclub fragt an: Ein langer Sonderzug soll um ${fmtTime(at)} Uhr bei dir halten. Pünktlich gibt es ${reward.toLocaleString('de-AT')} € Prämie – kommt er zu spät, kostet es 800 € Strafe.`,
        yes: 'Annehmen', no: 'Ablehnen' });
      return;
    }
    if (q < 0.4 && this.stations().length && !this.decision && this.money > 4000) {
      this.decision = { id: 'sponsor', cost: 2000 };
      this.uiEvents.push({ type: 'decision', tag: 'sponsor', title: 'Bürgermeister plant ein Bahnhofsfest',
        text: 'Ob du 2 000 € beisteuern willst? Dafür kommen 12 Stunden lang viel mehr Fahrgäste, und alle Bahnunternehmen sind zufriedener.',
        yes: 'Sponsern (2 000 €)', no: 'Nein danke' });
      return;
    }
    // Kunst am Bau: Sprayer haben Respekt – halb so viel Vandalismus
    const art = this.researched('art');
    let r = Math.random();
    if (art && r >= 0.7 && Math.random() < 0.5) r = 0.4 + Math.random() * 0.3;
    const trains = this.researched('wash') && r < 0.4 && !(art && Math.random() < 0.5);
    if (!trains && r < 0.7) {
      this.sim.festUntil = t + 12 * 3600;
      this.uiEvents.push({ type: 'news', tag: 'fest', title: 'Volksfest im Ort: Massenandrang erwartet',
        text: 'Bierzelt, Blasmusik und Ringelspiel – in den nächsten 12 Stunden fahren deutlich mehr Leute mit dem Zug. Volle Züge bringen mehr Geld, aber pünktlich sollten sie sein!' });
      this.addLog('Zeitung: Volksfest – 12 Stunden mehr Fahrgäste', 'good');
    } else if (trains) {
      this.sim.vandalUntil = t + 8 * 3600;
      this.uiEvents.push({ type: 'news', tag: 'vandal-trains', title: 'Sprayer-Serie: Züge über Nacht beschmiert',
        text: 'In den Abstellanlagen der Umgebung wurden zahlreiche Garnituren besprüht. In den nächsten Stunden kommen viele verschmutzte Züge an. Wendezüge, die bei dir enden, fahren zur Waschanlage – das bringt Geld und zufriedene Fahrgäste.' });
      this.addLog('Zeitung: viele verschmutzte Züge in den nächsten 8 Stunden', 'info');
    } else {
      this.news.stationUntil = t + 24 * 3600;
      this.uiEvents.push({ type: 'news', tag: 'vandal-station', title: 'Vandalen wüten am Bahnhof',
        text: 'Zerkratzte Scheiben, beschmierte Wände, kaputte Bänke: Heute Nacht hat es auch deinen Bahnhof erwischt. Die Instandhaltung kostet für einen Tag doppelt.' });
      this.addLog('Zeitung: Vandalismus am Bahnhof – Instandhaltung heute doppelt', 'bad');
    }
  }

  /** stündlich: Zufriedenheit je nach Preis, Kündigungen */
  private hourly() {
    const day = Math.floor(this.sim.time / 86400);
    if (this.news.lastDay < 0) this.news.lastDay = day;
    if (day !== this.news.lastDay) { this.news.lastDay = day; this.daily(); }
    // Auftrag „Wendezüge“: Ausschreibung wiederholen, falls noch kein Partner gewählt
    if (this.mission?.title === 'Wendezüge' && !this.offers.open) this.requestTurnback();
    this.checkNews();
    this.updateRating();
    if (!this.goals.length && this.stations().length) this.goals = newGoals(this, undefined);
    this.updateWeather();
    this.maybeFault();
    this.checkAchievements();
    if (this.stations().length && Math.floor(this.sim.time / 3600) % 3 === 0) this.uiEvents.push({ type: 'autosave', label: `Autosave ${fmtTime(this.sim.time)}` });
    for (const o of this.activeOperators()) {
      const c = this.contracts[o.id];
      if (o.kind === 'sort') continue;
      if (c.status === 'cancelled') {
        this.satisfaction[o.id] = Math.min(50, this.satisfaction[o.id] + 2);
        continue;
      }
      const ratio = Math.max(c.price.short / fairPrice(o, 'short'), c.price.long / fairPrice(o, 'long'));
      this.satisfaction[o.id] = Math.max(0, Math.min(100, this.satisfaction[o.id] - (ratio - 1) * 3));
      if (Math.random() < cancelRisk(o, c, this.satisfaction[o.id])) {
        c.status = 'cancelled';
        c.talkAfter = this.sim.time + TALK_PAUSE;
        this.satisfaction[o.id] = Math.max(0, this.satisfaction[o.id] - 20);
        this.sim.recontract(o.id);
        this.addLog(`${o.name} kündigt den Vertrag! Züge fahren nur noch durch`, 'bad');
        this.uiEvents.push({ type: 'contract', op: o.id, kind: 'cancel' });
      }
    }
  }

  addLog(text: string, kind: LogEntry['kind']) {
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
    return { title: m.title, short: m.short, reward: m.reward, ...p, index: this.missionIdx, total: MISSIONS.length, checks: m.checks?.(this, this.stats, this.missionBase) };
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
    const blocked = this.grid.expandLine(this.researched('wire')) ?? 0;
    if (this.researched('wire')) this.grid.electrifyLine();
    this.rebuild();
    this.loopsPending = true;
    this.addLog('Netzbetreiber baut das 2. Streckengleis – auch durch deinen Bahnhof, wo Platz ist', 'info');
    if (blocked) this.addLog(`Auf ${blocked} Feldern deines Geländes steht etwas im Weg (Bahnsteig/Gebäude): dort das 2. Gleis selbst verlegen oder per Weichen umfahren`, 'bad');
  }

  /** Ausweichstellen abbauen, sobald dort kein Zug mehr steht (nach dem zweigleisigen Ausbau) */
  private removeLoops() {
    const g = this.grid;
    let changed = false, left = false;
    for (const [xa, xb] of PASSING_LOOPS) {
      const cells: number[] = [];
      for (let x = xa; x <= xb + 2; x++) for (const y of [MAIN_ROW, SECOND_ROW]) cells.push(g.key(x, y));
      const pieces = [...new Set(cells.map((k) => g.cells[k].piece).filter((id): id is number => id !== null && g.fixedPieces.has(id)))];
      const sig = cells.filter((k) => (g.cells[k].signal || g.cells[k].signalW) && !g.isOwned(g.xy(k).x, g.xy(k).y));
      if (!pieces.length && !sig.length) continue;
      if (cells.some((k) => this.sim.owner[k] !== 0)) { left = true; continue; }
      pieces.forEach((id) => { g.removePiece(id); g.fixedPieces.delete(id); });
      sig.forEach((k) => { g.cells[k].signal = false; g.cells[k].signalW = false; });
      changed = true;
    }
    if (changed) this.rebuild();
    this.loopsPending = left;
  }

  /** ohne Tutorial: alles aus den Tutorial-Aufträgen sofort freischalten und mit dem ersten richtigen Auftrag beginnen */
  skipTutorial() {
    if (this.missionIdx >= TUTORIAL_MISSIONS) return;
    for (let i = this.missionIdx; i < TUTORIAL_MISSIONS; i++) {
      const m = MISSIONS[i];
      m.unlock.forEach((u) => this.unlocked.add(u));
      this.research.points += m.fp;
    }
    this.unlocked.add('research');
    this.sim.setLevel(MISSIONS[TUTORIAL_MISSIONS - 1].level);
    this.missionIdx = TUTORIAL_MISSIONS;
    this.missionBase = structuredClone(this.stats);
    this.startMission();
    this.addLog('Ohne Tutorial gestartet: alle Grundwerkzeuge frei', 'info');
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
    this.missionMark = undefined;
    // Ende des Tutorials: Brief vom Vorstand
    if (this.missionIdx === TUTORIAL_MISSIONS) this.uiEvents.push({ type: 'letter', mood: 'good', title: 'Einschulung abgeschlossen!',
      text: `<p>${this.salutation()}</p><p>die Einschulung ist geschafft – herzlichen Glückwunsch! Sie haben einen Bahnhof eröffnet, Signale gesetzt, geforscht, Land gekauft, ein zweites Bahnsteiggleis gebaut und Wendezüge abgefertigt.</p><p>Ab jetzt läuft der <b>richtige Betrieb</b>: mehr Züge, größere Aufträge, eigene Entscheidungen. Der Vorstand traut Ihnen das zu. Enttäuschen Sie uns nicht – und vergessen Sie die Pünktlichkeit nicht.</p>` });
    this.stats.streak = 0;
    this.stats.maxDwellSince = 0;
    this.missionBase = structuredClone(this.stats);
    this.startMission();
    const next = this.mission;
    if (next) this.uiEvents.push({ type: 'missionStart', title: next.title });
    this.uiEvents.push({ type: 'autosave', label: `Auftrag erfüllt: ${m.title}` });
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

  /**
   * Schräges Gleis von a nach b: lauter Diagonalstücke. Kreuzt es ein gerades Gleis,
   * wird automatisch eine Gleiskreuzung gesetzt. Kurven baut man mit dem Kurven-Werkzeug.
   */
  trackLayout(a: XY, b: XY): TrackLayout | string {
    const g = this.grid;
    const plain = (x: number, y: number) => { const c = g.get(x, y); return !!c && c.track && c.piece === null; };
    const d = this.diagSteps(a.x, a.y, b.x, b.y, b.x >= a.x === b.y >= a.y ? 'diag_desc' : 'diag_asc');
    const desc = d.key === 'diag_desc';
    const pieces: PiecePlace[] = [];
    for (const p of d.anchors) {
      const ay = p.y;
      if (plain(p.x, ay) && plain(p.x, ay + 1)) return 'Diagonale würde zwei Gleise kreuzen';
      const k = plain(p.x, ay) ? `cross_${desc ? 'desc' : 'asc'}0` : plain(p.x, ay + 1) ? `cross_${desc ? 'desc' : 'asc'}1` : d.key;
      pieces.push({ key: k, x: p.x, y: ay });
    }
    return { straight: [], pieces };
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
  /** Abriss über eine Fläche: je Feld das oberste Element, jedes Objekt nur einmal */
  private planRemoveMany(cells: XY[]): BuildPlan {
    const g = this.grid;
    const seen = new Set<string>();
    let cost = 0;
    const shown: XY[] = [], trains = new Set<number>(), parts: XY[] = [];
    for (const c of cells) {
      const p = this.plan('remove', [c]);
      if (!p.ok) continue;
      const cc = g.get(c.x, c.y)!;
      const id = cc.signal || cc.signalW ? `s${c.x},${c.y}` : cc.building !== null ? `b${cc.building}` : g.linkAt(c.x, c.y) ? `l${g.linkAt(c.x, c.y)!.id}`
        : cc.platform || cc.road || cc.siding || cc.sortDest !== null || cc.shunt ? `c${c.x},${c.y}` : cc.piece !== null ? `p${cc.piece}` : `c${c.x},${c.y}`;
      if (seen.has(id)) continue;
      seen.add(id);
      cost += p.cost;
      shown.push(...p.cells);
      parts.push(c);
      p.trains?.forEach((t) => trains.add(t));
    }
    if (!parts.length) return { ok: false, cost: 0, reason: 'Nichts zum Abreißen', cells };
    const tr = [...trains];
    return { ok: cost <= this.money, reason: 'Zu wenig Geld', cost, cells: shown, removeAt: parts, ...this.trainNote(tr),
      note: `${parts.length} Teile${tr.length ? ` · ${tr.length} Zug/Züge fallen aus` : ''}` };
  }

  plan(tool: ToolId, cells: XY[], variant = ''): BuildPlan {
    const g = this.grid;
    const fail = (reason: string, c = cells): BuildPlan => ({ ok: false, cost: 0, reason, cells: c });
    if (!this.unlocked.has(tool)) return fail('Noch nicht freigeschaltet');
    if (tool === 'remove' && cells.length > 1) return this.planRemoveMany(cells);
    if (!cells.length) return fail('');
    const need = tool === 'facility' ? FACILITY_RESEARCH[variant] : undefined;
    if (need && !this.researched(need)) return fail(`Erst erforschen: ${RESEARCH_BY_ID[need].name}`);
    if (tool === 'building' && BUILDING_RESEARCH[variant] && !this.researched(BUILDING_RESEARCH[variant] as ResearchId)) {
      return fail(`Erst erforschen: ${RESEARCH_BY_ID[BUILDING_RESEARCH[variant] as ResearchId].name}`);
    }
    if (tool === 'building' && variant === 'bld_station' && this.stations().length >= this.maxStations) {
      return fail(this.researched('stations') ? 'Mehr Bahnhöfe gehen nicht' : 'Erst erforschen: Weitere Bahnhöfe');
    }
    const notOwned = (cs: XY[]) => cs.some((c) => !g.isOwned(c.x, c.y));
    /** Wasser oder Fels unter den Feldern? */
    /** Baum oder Busch: wird beim Bauen automatisch gefällt */
    const solid = (c?: { building: number | null }) => !!c && c.building !== null && !this.clearable(c.building);
    const rails = tool === 'track' || tool === 'switch' || tool === 'curve' || tool === 'diag';
    const rough = (cs: XY[]) => {
      const c = cs.find((q) => !g.isGround(q.x, q.y) && !g.get(q.x, q.y)?.track && !(rails && g.isWater(q.x, q.y) && this.researched('railBridge')));
      return !c ? null : g.isWater(c.x, c.y) ? (rails ? 'Wasser – erst Eisenbahnbrücken erforschen' : 'Wasser – hier kann man nicht bauen')
        : 'Felsen – hier kann man nicht bauen';
    };
    /** Aufpreis für Brückenfelder */
    const bridgeCost = (cs: XY[]) => cs.filter((q) => g.isWater(q.x, q.y) && !g.get(q.x, q.y)!.track && g.get(q.x, q.y)!.piece === null).length * COST.railBridge;
    /** Gleisteile prüfen: Kosten oder Grund */
    const checkPieces = (list: PiecePlace[], fp: XY[]): string | number => {
      let c = 0;
      for (const a of list) {
        const def = PIECES[a.key];
        if (!def) return 'Unbekanntes Gleisteil';
        // Weiche über eine passende Kurve: die Kurve wird zur Weiche ausgebaut
        const up = this.curveUnder(a);
        if (up) c -= PIECES[up.key].cost * REFUND;
        if (def.key.startsWith('cross_') && !this.researched('crossing')) return 'Kreuzt ein Gleis – erst Gleiskreuzungen erforschen';
        for (const q of g.footprint(a.key, a.x, a.y)) {
          if (!g.inside(q.x, q.y)) return 'Außerhalb der Karte';
          const cell = g.get(q.x, q.y)!;
          fp.push(q);
          if (!g.isOwned(q.x, q.y)) return 'Fläche nicht gekauft';
          if (rough([q])) return rough([q])!;
          if (cell.platform) return 'Bahnsteig im Weg';
          if (solid(cell)) return 'Gebäude im Weg';
          if (cell.piece !== null && cell.piece !== up?.id) return 'Überschneidet anderes Gleisteil';
          if (cell.signal || cell.signalW) return 'Signal im Weg';
          if (this.reserved(q.x, q.y)) return 'Gleis ist gerade befahren';
          const through = def.through.includes(q.y - a.y);
          if (cell.track && !through) return 'Gerades Gleis im Weg';
          if (through && !cell.track) c += COST.track;
        }
        c += def.cost + bridgeCost(g.footprint(a.key, a.x, a.y));
      }
      return c;
    };
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
        if (rough(cells)) return fail(rough(cells)!);
        if (cells.some((c) => g.get(c.x, c.y)!.track || g.get(c.x, c.y)!.piece !== null)) return fail('Bahnsteig nicht auf Gleis');
        if (cells.some((c) => solid(g.get(c.x, c.y)))) return fail('Gebäude im Weg');
        cost = cells.filter((c) => !g.get(c.x, c.y)!.platform).length * COST.platform;
        break;
      }
      case 'track': {
        let straight = cells, pieces: PiecePlace[] = [];
        if (cells.length === 2 && cells[0].y !== cells[1].y) {
          const lay = this.trackLayout(cells[0], cells[1]);
          if (typeof lay === 'string') return fail(lay);
          straight = lay.straight;
          pieces = lay.pieces;
        }
        if (notOwned(straight)) return fail('Fläche nicht gekauft', straight);
        if (rough(straight)) return fail(rough(straight)!, straight);
        if (straight.some((c) => g.get(c.x, c.y)!.platform || g.get(c.x, c.y)!.piece !== null)) return fail('Feld ist belegt', straight);
        if (straight.some((c) => solid(g.get(c.x, c.y)))) return fail('Gebäude im Weg', straight);
        // nicht seitlich an die Weichen einer Kreuzungsstelle des Netzbetreibers anschließen (dort endet das Gleis)
        const loopSwitch = (x: number, y: number) => { const pc = g.get(x, y)?.piece; return pc != null && g.fixedPieces.has(pc) && PIECES[g.pieces.get(pc)!.key].group === 'switch'; };
        if (straight.some((c) => !g.get(c.x, c.y)!.track && (loopSwitch(c.x - 1, c.y) || loopSwitch(c.x + 1, c.y)))) {
          return fail('Hier endet die Kreuzungsstelle des Netzbetreibers – nicht anschließen', straight);
        }
        cost = straight.filter((c) => !g.get(c.x, c.y)!.track).length * COST.track + bridgeCost(straight);
        const fp: XY[] = [...straight];
        const pc = checkPieces(pieces, fp);
        if (typeof pc === 'string') return { ok: false, cost: 0, reason: pc, cells: fp, pieces };
        cost += pc;
        cost += this.clearCost(fp);
        if (cost > this.money) return { ok: false, cost, reason: 'Zu wenig Geld', cells: fp, pieces };
        return { ok: true, cost, cells: fp, pieces };
      }
      case 'signal': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        const c = g.get(cells[0].x, cells[0].y)!;
        if (!c.track || c.piece !== null) return fail('Signal nur auf geradem Gleis');
        const west = variant.endsWith('W');
        if (west ? c.signalW : c.signal) return fail('Hier steht schon ein Signal');
        const shuntSig = variant.startsWith('S');
        if (shuntSig && !c.shunt) return fail('Rangiersignale nur im Rangierbereich');
        if (shuntSig && !this.researched('shunt')) return fail('Rangierbereiche erst erforschen');
        if (c.shuntSig !== shuntSig && (c.signal || c.signalW)) return fail('Hier steht schon ein anderes Signal');
        cost = shuntSig ? COST.shuntSignal : COST.signal;
        break;
      }
      case 'switch':
      case 'curve':
      case 'diag': {
        if (!PIECES[variant]) return fail('');
        if (PIECES[variant].fast && !this.researched('fastSwitch')) return fail('Schnellfahrweichen erst erforschen');
        if (PIECES[variant].diagSwitch && !this.researched('diagSwitch')) return fail('Schräge Weichen erst erforschen');
        if (variant.startsWith('xover') && !this.researched('double')) return fail('Gleiswechsel erst mit dem zweigleisigen Ausbau (Forschung)');
        const fp: XY[] = [];
        const pc = checkPieces(cells.map((a) => ({ key: variant, x: a.x, y: a.y })), fp);
        if (typeof pc === 'string') return fail(pc, fp);
        cost = pc;
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
          if (rough([c])) return fail(rough([c])!, fp);
          if (solid(cell)) return fail('Hier steht schon etwas', fp);
          if (cell.track || cell.piece !== null) return fail('Gleis im Weg', fp);
          if (def.onPlatform && !cell.platform) return fail('Nur auf dem Bahnsteig', fp);
          if (!def.onPlatform && cell.platform) return fail('Nicht auf dem Bahnsteig', fp);
        }
        cost = def.cost;
        break;
      }
      case 'road': {
        if (notOwned(cells)) return fail('Fläche nicht gekauft');
        if (rough(cells)) return fail(rough(cells)!);
        if (cells.some((c) => { const cc = g.get(c.x, c.y)!; return cc.track || cc.piece !== null || cc.platform; })) return fail('Gleis oder Bahnsteig im Weg');
        if (cells.some((c) => solid(g.get(c.x, c.y)))) return fail('Gebäude im Weg');
        cost = cells.filter((c) => !g.get(c.x, c.y)!.road).length * COST.road + this.clearCost(cells);
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
          if (variant === 'mark_shunt') {
            if (cells.some((c) => { const cc = g.get(c.x, c.y)!; return !cc.track && cc.piece === null; })) return fail('Nur auf Gleisen');
            if (cells.some((c) => g.get(c.x, c.y)!.fixed)) return fail('Strecke gehört dem Netzbetreiber');
            cost = cells.length * COST.marker;
            break;
          }
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
          if (variant === 'bld_wash' && !cell.shunt) return fail('Waschanlage nur im Rangierbereich – Gleis zuerst als Rangierbereich markieren', fp);
          if (this.reserved(c.x, c.y)) return fail('Gleis ist gerade befahren', fp);
        }
        cost = def.cost;
        break;
      }
      case 'remove': {
        const c = g.get(cells[0].x, cells[0].y)!;
        if (!g.isOwned(cells[0].x, cells[0].y)) return fail('Fläche nicht gekauft');
        if ((c.signal || c.signalW) && g.isLoopCell(cells[0].x, cells[0].y)) return fail('Signal gehört dem Netzbetreiber');
        if (c.signal || c.signalW) { cost = -COST.signal * REFUND; break; }
        const link = g.linkAt(cells[0].x, cells[0].y);
        if (c.building !== null) {
          const b = g.buildings.get(c.building)!;
          const def = BUILDINGS[b.key];
          if (def.fixed) return fail(`${def.label} kann nicht entfernt werden`);
          const tr = def.onTrack ? this.trainsOn(g.buildingCells(b)) : [];
          return { ok: this.money >= (b.decor ? def.demolish : 0), cost: b.decor ? def.demolish : -def.cost * REFUND,
            reason: 'Zu wenig Geld', cells: g.buildingCells(b).map((k) => g.xy(k)), ...this.trainNote(tr) };
        }
        if (link) {
          const cs: XY[] = [];
          for (let y = link.y0; y <= link.y1; y++) cs.push({ x: link.x, y });
          return { ok: true, cost: -cs.length * (link.kind === 'bridge' ? COST.bridge : COST.tunnel) * REFUND, cells: cs };
        }
        if (c.platform) { cost = -COST.platform * REFUND; break; }
        if (c.road) { cost = -COST.road * REFUND; break; }
        if (c.siding || c.sortDest !== null || c.shunt) { cost = 0; break; }
        if (c.piece !== null) {
          const p = g.pieces.get(c.piece)!;
          const pc = g.pieceCells(p);
          if (g.fixedPieces.has(p.id)) return fail('Weiche gehört dem Netzbetreiber');
          return { ok: true, cost: -PIECES[p.key].cost * REFUND, cells: pc.map((k) => g.xy(k)), ...this.trainNote(this.trainsOn(pc)) };
        }
        if (c.track) {
          if (c.fixed) return fail('Streckengleis kann nicht abgerissen werden');
          return { ok: true, cost: -COST.track * REFUND, cells: [cells[0]], ...this.trainNote(this.trainsOn([g.key(cells[0].x, cells[0].y)])) };
        }
        return fail('Nichts zum Abreißen');
      }
      default:
        return fail('');
    }
    if (CLEARING.has(tool)) cost += this.clearCost(shown);
    if (cost > this.money) return { ok: false, cost, reason: 'Zu wenig Geld', cells: shown };
    return { ok: true, cost, cells: shown };
  }

  /** Bahnsteiggleise mit Zugang, nummeriert von Nord nach Süd, West nach Ost */
  platformRuns() { return this.net.runs.filter((r) => r.accessible).sort((a, b) => a.row - b.row || a.x0 - b.x0); }

  /** Fahrplan eines Unternehmens um Minuten verschieben */
  shiftTimes(op: OperatorId, min: number) {
    this.sim.shiftTimes(op, min * 60);
    this.addLog(`Fahrplan ${OPERATORS[op].name}: ${min > 0 ? '+' : '−'}${Math.abs(min)} min`, 'info');
  }

  /** Vertrags-Zusatz „Abstellen & Pflege“ umschalten */
  toggleService(op: OperatorId) {
    const c = this.contracts[op];
    if (c.status !== 'active' || !OPERATORS[op].needsStop || OPERATORS[op].kind === 'freight') return;
    c.service = !c.service;
    this.sim.retime(op);
    this.addLog(`${OPERATORS[op].name}: Abstellen & Pflege ${c.service ? 'vereinbart' : 'gekündigt'}`, 'info');
  }

  /** Zug gegen Gebühr aus dem Verkehr nehmen (auch angekündigte) */
  removeTrain(id: number) {
    if (this.sim.trains.some((t) => t.id === id)) { this.sim.cancelTrain(id); return true; }
    const q = this.sim.queue.find((t) => t.id === id);
    if (!q) return false;
    this.sim.queue = this.sim.queue.filter((t) => t !== q);
    this.money -= CANCEL_COST;
    this.satisfaction[q.op.id] = Math.max(0, this.satisfaction[q.op.id] - 10);
    this.addLog(`${q.number} gestrichen (−${CANCEL_COST} €)`, 'bad');
    return true;
  }

  /** Kurve an derselben Stelle, die genau der Abzweigung dieser Weiche entspricht */
  private curveUnder(a: PiecePlace) {
    const CURVE_OF: Record<string, string> = { branch_divDown: 'curve_divDown', branch_divUp: 'curve_divUp', branch_mergeAbove: 'curve_mergeAbove', branch_mergeBelow: 'curve_mergeBelow' };
    const want = CURVE_OF[a.key];
    if (!want) return undefined;
    const id = this.grid.get(a.x, a.y)?.piece;
    const p = id != null ? this.grid.pieces.get(id) : undefined;
    return p && p.key === want && p.x === a.x && p.y === a.y && !this.grid.fixedPieces.has(p.id) ? p : undefined;
  }

  /** Züge, die diese Felder belegen oder reserviert haben */
  private trainsOn(keys: number[]) {
    return [...new Set(keys.map((k) => this.sim.owner[k]).filter((o) => o !== 0))];
  }

  private trainNote(ids: number[]) {
    if (!ids.length) return {};
    return { trains: ids, note: `${ids.length === 1 ? '1 Zug wird' : `${ids.length} Züge werden`} aus dem Verkehr genommen (je −${CANCEL_COST} €)` };
  }

  /** Bäume/Büsche, die beim Bauen weg müssen */
  private clearable(id: number) {
    const b = this.grid.buildings.get(id);
    return !!b && b.decor && BUILDINGS[b.key].group === 'nature' && !BUILDINGS[b.key].fixed;
  }

  private natureIn(cells: XY[]) {
    const ids = new Set<number>();
    for (const c of cells) { const id = this.grid.get(c.x, c.y)?.building; if (id != null && this.clearable(id)) ids.add(id); }
    return [...ids];
  }

  private clearCost(cells: XY[]) {
    return this.natureIn(cells).reduce((a, id) => a + BUILDINGS[this.grid.buildings.get(id)!.key].demolish, 0);
  }

  build(tool: ToolId, cells: XY[], variant = ''): BuildPlan {
    const p = this.plan(tool, cells, variant);
    if (!p.ok) return p;
    if (tool === 'remove' && p.removeAt) {
      for (const c of p.removeAt) this.build('remove', [c]);
      return p;
    }
    this.questUsed.add(`${this.missionIdx}:${tool}`);
    const g = this.grid;
    if (CLEARING.has(tool) || tool === 'track') this.natureIn(p.cells).forEach((id) => g.removeBuilding(id));
    switch (tool) {
      case 'land': {
        const { px, py } = g.parcelOf(cells[0].x, cells[0].y);
        g.buyParcel(px, py);
        break;
      }
      case 'platform': cells.forEach((c) => (g.get(c.x, c.y)!.platform = true)); break;
      case 'track':
        p.cells.forEach((c) => { const cc = g.get(c.x, c.y)!; if (cc.piece === null && !p.pieces?.length) cc.track = true; });
        if (p.pieces?.length) {
          const lay = this.trackLayout(cells[0], cells[1]) as TrackLayout;
          lay.straight.forEach((c) => (g.get(c.x, c.y)!.track = true));
          lay.pieces.forEach((a) => g.addPiece(a.key, a.x, a.y));
        }
        break;
      case 'signal': {
        const c = g.get(cells[0].x, cells[0].y)!;
        if (variant.endsWith('W')) c.signalW = true; else c.signal = true;
        c.shuntSig = variant.startsWith('S');
        break;
      }
      case 'switch':
      case 'curve':
      case 'diag':
        cells.forEach((a) => {
          const up = this.curveUnder({ key: variant, x: a.x, y: a.y });
          if (up) g.removePiece(up.id);
          g.addPiece(variant, a.x, a.y);
        });
        break;
      case 'building': {
        const b = g.addBuilding(variant, cells[0].x, cells[0].y);
        if (this.buildRot && Game.canRotate(variant)) b.rot = true;
        if (variant === 'bld_station') {
          b.name = this.suggestStationName();
          this.uiEvents.push({ type: 'station', id: b.id });
        }
        break;
      }
      case 'wire': cells.forEach((c) => (g.get(c.x, c.y)!.wire = true)); break;
      case 'road':
        this.natureIn(cells).forEach((id) => g.removeBuilding(id));
        cells.forEach((c) => (g.get(c.x, c.y)!.road = true));
        break;
      case 'access': g.addLink(variant as 'tunnel' | 'bridge', cells[0].x, cells[0].y, cells[cells.length - 1].y); break;
      case 'facility':
        if (variant === 'mark_siding') cells.forEach((c) => Object.assign(g.get(c.x, c.y)!, { siding: true, sortDest: null }));
        else if (variant === 'mark_shunt') cells.forEach((c) => (g.get(c.x, c.y)!.shunt = true));
        else if (variant.startsWith('mark_sort')) cells.forEach((c) => Object.assign(g.get(c.x, c.y)!, { siding: false, sortDest: Number(variant.slice(9)) }));
        else g.addBuilding(variant, cells[0].x, cells[0].y);
        break;
      case 'remove': {
        // Züge auf dem abgerissenen Gleis fallen aus
        p.trains?.forEach((id) => this.sim.cancelTrain(id));
        const c = g.get(cells[0].x, cells[0].y)!;
        const link = g.linkAt(cells[0].x, cells[0].y);
        if (c.signal) { c.signal = false; if (!c.signalW) c.shuntSig = false; }
        else if (c.signalW) { c.signalW = false; c.shuntSig = false; }
        else if (c.building !== null) g.removeBuilding(c.building);
        else if (link) g.links.delete(link.id);
        else if (c.platform) c.platform = false;
        else if (c.road) c.road = false;
        else if (c.siding || c.sortDest !== null) { c.siding = false; c.sortDest = null; }
        else if (c.shunt) c.shunt = false;
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

  rebuild() {
    this.net = new Network(this.grid);
    this.sim.setNetwork(this.net);
    this.updatePlatformLength();
    this.checkIndustries();
    this.version++;
  }

  /** Ladegleis über eigene Gleise mit der Strecke verbunden? */
  industryConnected(id: string) {
    return this.net.entries.some((en) => this.net.pathsTo(en.to, (e) => e.industry === id, false, 5).length > 0);
  }

  /** Privatbahnen: angeschlossen → fahren und zahlen; getrennt → fahren nicht mehr */
  private checkIndustries() {
    for (const ind of industries()) {
      const c = this.contracts[ind.op];
      const on = this.industryConnected(ind.id);
      if (on && c.status !== 'active') {
        c.status = 'active';
        c.takt = OPERATORS[ind.op].takt;
        this.satisfaction[ind.op] = 70;
        this.sim.retime(ind.op);
        this.addLog(`${ind.name} ist angeschlossen – Privatzüge fahren alle ${c.takt} min`, 'good');
        this.uiEvents.push({ type: 'news', tag: 'industry', title: `${ind.name} am Netz`,
          text: `Das Ladegleis ist jetzt mit deiner Strecke verbunden. Ab sofort holen Privatzüge dort ihre Ladung ab und zahlen dir für jede Fahrt über deine Gleise.` });
      } else if (!on && c.status === 'active') {
        c.status = 'none';
        this.sim.retime(ind.op);
        this.addLog(`${ind.name}: Anschluss unterbrochen – keine Privatzüge mehr`, 'bad');
      }
    }
  }
}
