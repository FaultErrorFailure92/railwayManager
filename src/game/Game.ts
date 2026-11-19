import { autoCode } from './StationCode';
import { CHAPTERS, completeChapter } from './Profiles';
import { chapterRating } from './ChapterRating';
import { inspectTrain, INSPECTOR_WAGE } from './FareDodgers';
import { CREW, crewCare, crewSpeed } from './Staff';
import { storyAfterMission } from './Story';
import { capture, loadTemplates, pasteSteps, pushTemplate, templateCells, templateCost } from './Templates';
import { SEASON_NAME, SEASON_NEWS, seasonOf, seasonPax, seasonWeather, type Season } from './Seasons';
import { regularsOnStop, type RegularState } from './Regulars';
import { acceptGrant, grantTick, pickGrant, type GrantState } from './Grants';
import { challengeInfo, challengeTick, type ChallengeState } from './Challenges';
import { CHAPTER_MISSIONS, chapterLetter } from './Chapters';
import { growSave } from './saveMigrate';
import { activeCustom } from './CustomMaps';
import { checkForeign, FOREIGN_DECO_TAKT, foreignOps, foreignBlock, foreignFeeFactor, foreignPaxBonus } from './Foreign';
import { applyFreeCfg, contractCap, opAllowed, enterFreePlay, faultCfg, freeInfo, freeTick, paxCfg, type FreeCfg, type GameMode } from './FreePlay';
import { crewMaintain, faultFactor, pickWeighted, tickWear } from './Wear';
import { BANK, BoardState, dailyLetter, newBoard, Sender, welcomeLetter } from './Board';
import { ROW0, MAIN_ROW, PASSING_LOOPS, STATION_UPGRADE, COST, DELAY_PENALTY_PER_MIN, GAME_SEC_PER_REAL_SEC, MISSED_STOP_PENALTY, OLD_OFFSET, PARCEL, PUNCTUAL_LIMIT_MIN, REFUND, SECOND_ROW } from '../config';
import { applyOpOverrides, OperatorId, OPERATORS, SORT_DESTS, TAKT, trafficClass } from '../sim/Operators';
import { PARK_FEE, priceMod, acceptChance, cancelRisk, Contract, fairPrice, LengthClass, lengthClass, MIN_TAKT_DOUBLE, MIN_TAKT_SINGLE, newContracts, Offer, TAKT_STEPS, TALK_PAUSE, TRANSIT_FEE } from './Contracts';
import { FACILITY_RESEARCH, RESEARCH_BY_ID, ResearchId, ResearchState, ResearchTree } from './Research';
import { SimSave, Simulation, Train } from '../sim/Simulation';
import { BUILDING_RESEARCH, BUILDINGS, isStation, SHOPS } from '../world/buildings';
import { industries } from '../world/industries';
import { currentMap } from '../world/maps';
import { systemOn } from './Systems';
import { DEMO } from './Edition';
import { ACHIEVEMENTS } from './Achievements';
import { Goal, goalProgress, newGoals } from './Goals';
import { Grid } from '../world/Grid';
import { edgeRow, Network, type Edge } from '../world/Network';
import { PIECES } from '../world/pieces';
import { Mission, MISSIONS, MISSIONS_VERSION, ToolId, TUTORIAL_MISSIONS } from './Missions';
import { VERSION } from './changelog';
import { SAVE_VERSION } from './saveFile';
import { UndoHistory } from './Undo';
import { tierChecks, TIERS } from './StationTiers';
import { payLoan, type Loan } from './Loans';
import { noteArrival, settleDeparture, type Arrival } from './Connections';
import { canBoost, dayPax, rushPenalty } from '../sim/demand';
import { rollSpecial, SPECIALS, specialPax, specialRuns, type SpecialDay } from './SpecialDays';

export interface Stats {
  /** Anschlüsse erreicht / verpasst (RM-FR-OPS-13) */
  connOk?: number;
  /** Schwarzfahrer gesehen / erwischt (RM-FR-ECO-13) */
  dodgers?: number;
  caught?: number;
  connMissed?: number;
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
export interface DayStat { day: number; income: number; expense: number; handled: number; punctual: number; pax: number; shop?: number; maxDelay?: number; conn?: number; /** Kontostand am Tagesende */ cash?: number; /** Buchungen je Kategorie */ cats?: Record<string, number> }

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
  | { type: 'letter'; title: string; text: string; mood: 'good' | 'bad' | 'info'; bonus?: number; from?: Sender; open?: boolean }
  | { type: 'achievement'; id: string }
  | { type: 'goal' }
  | { type: 'dayEnd'; day: number; income: number; expense: number; handled: number; punctual: number; pax: number; goalsDone: number; goalsTotal: number }
  | { type: 'streak'; n: number };

/** Effekte auf der Karte (schwebende Beträge) */
export interface FxEvent { amount: number; x: number; y: number; train?: number; label?: string }

type XY = { x: number; y: number };

const STATION_NAMES = ['Donaufeld', 'Mühlbach', 'Lindenau', 'Am Steinfeld', 'Grünwies', 'Hollerbrunn', 'Kirchberg Süd', 'Weidenau',
  'Auhof', 'Bachstetten', 'Rosental', 'Marchegg Nord', 'Eichgraben', 'Sonnleiten', 'Hainfeld West', 'Wolfsthal'];

export interface GameSave {
  /** Formatversion, siehe saveFile.ts (RM-FR-SAVE-02) */
  v: 4 | 5 | 6;
  /** aus Format 5 gehoben: die neuen Streifen oben und unten beim Laden mit Landschaft füllen (RM-FR-MAP-12) */
  grown?: boolean;
  /** Spielversion beim Speichern */
  app?: string;
  links: { id: number; kind: 'tunnel' | 'bridge'; x: number; y0: number; y1: number }[];
  sortDest: (number | null)[];
  company: string;
  cells: number[];
  pieces: { id: number; key: string; x: number; y: number }[];
  buildings: { id: number; key: string; x: number; y: number; decor: boolean; name?: string; code?: string; rot?: boolean }[];
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
  wear?: Record<number, number>;
  goals?: Goal[];
  mapId?: string;
  /** eigene Karte (RM-FR-MOD-04): reist im Spielstand mit */
  customMap?: unknown;
  board?: BoardState;
  crew?: number;
  inspectors?: number;
  grant?: GrantState;
  grantsDone?: string[];
  regulars?: Record<string, RegularState>;
  shopAuto?: Record<string, boolean>;
  inbox?: InboxEntry[];
  player?: Game['player'];
  missionsV?: number;
  missionMark?: number;
  mode?: GameMode;
  demo?: boolean;
  challenge?: ChallengeState;
  longGoals?: string[];
  profileId?: string;
  freeCfg?: FreeCfg;
  offers?: Game['offers'];
  news?: Game['news'];
  specials?: SpecialDay[];
  tier?: number;
  loan?: Loan | null;
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
/** Großeinsatz bei einer Großstörung (RM-FR-EVT-09) */
export const SANDBOX_MONEY = 9_999_999;
export const BIG_REPAIR_COST = 1500;

/** Störung: Weiche/Signal (klein) oder gesperrter Streckenabschnitt (groß) */
export interface Fault {
  k: number;
  kind: 'switch' | 'signal' | 'tree' | 'wire';
  since: number;
  repairAt?: number;
  /** Großstörung: gesperrte Felder und Ende der Sperre */
  cells?: number[];
  until?: number;
  /** Großeinsatz schon bestellt */
  boosted?: boolean;
}

const unpackCell = (b: number, sortDest: number | null) => ({
  track: !!(b & 1), fixed: !!(b & 2), platform: !!(b & 4), signal: !!(b & 8), signalW: !!(b & 16),
  wire: !!(b & 32), siding: !!(b & 64), road: !!(b & 128), shunt: !!(b & 256), shuntSig: !!(b & 512), sortDest,
});

/** Bezeichnung der Werkzeuge für Meldungen beim Rückgängigmachen */
const TOOL_LABEL: Partial<Record<ToolId, string>> = {
  land: 'Landkauf', platform: 'Bahnsteig', track: 'Gleis', signal: 'Signal', switch: 'Weiche', curve: 'Kurve', diag: 'Diagonale',
  wire: 'Oberleitung', access: 'Zugang', building: 'Gebäude', facility: 'Anlage', remove: 'Abriss', road: 'Straße',
};

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
  /** Buchung mit Kategorie für die Finanz-Diagramme (RM-FR-ECO-09) */
  private moneyCat?: string;
  book(cat: string, delta: number) {
    this.moneyCat = cat;
    this.money += delta;
    this.moneyCat = undefined;
  }
  set money(v: number) {
    const d = v - this._money;
    this._money = v;
    if (!this.sim || !d) return;
    const t = this.today();
    if (d > 0) t.income += d; else t.expense -= d;
    t.cash = v;
    const cat = this.moneyCat ?? (d > 0 ? 'Sonstiges' : 'Bau');
    (t.cats ??= {})[cat] = (t.cats[cat] ?? 0) + d;
    this.bump(d > 0 ? 'earned' : 'spent', Math.abs(d));
    this.lifeMax = Math.max(this.lifeMax, v);
    this.lifeMin = Math.min(this.lifeMin, v);
  }
  /** Zähler fürs Spielerprofil seit dem letzten Übertragen (RM-FR-PROF-03) */
  life: Record<string, number> = {};
  lifeMax = -Infinity;
  lifeMin = Infinity;
  bump(key: string, n = 1) { this.life[key] = (this.life[key] ?? 0) + n; }
  /** letzte 14 Tage */
  history: DayStat[] = [];
  today(): DayStat {
    const day = Math.floor(this.sim.time / 86400);
    let t = this.history[this.history.length - 1];
    if (!t || t.day !== day) {
      t = { day, income: 0, expense: 0, handled: 0, punctual: 0, pax: 0, cash: this._money };
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
  /** Kampagne oder freies Spiel (RM-FR-MODE-01) */
  mode: GameMode = 'campaign';
  /** Demobahnhof (nur Entwicklung): zeigt alle Systeme */
  demo = false;
  /** laufende Herausforderung (RM-FR-MODE-08) */
  challenge?: ChallengeState;
  /** Spielerprofil, zu dem dieses Spiel gehört (RM-FR-PROF-01) */
  profileId?: string;
  /** Einstellungen des freien Spiels (RM-FR-MODE-06) */
  freeCfg?: FreeCfg;
  /** erreichte Langzeitziele im freien Spiel (RM-FR-MODE-05) */
  longGoals: string[] = [];
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
  /** Gebäude gedreht bauen (Taste R) */
  buildRot = false;
  /** drehbar: quadratische Gebäude */
  static canRotate(key: string) { const d = BUILDINGS[key]; return !!d && d.w === d.h && !d.onTrack; }

  /** eigene Instandhalter (Forschung „Instandhaltungsteam“) */
  crew = 0;
  /** Kontrolleure (RM-FR-ECO-13) */
  inspectors = 0;
  static readonly CREW_WAGE = 250;
  static readonly CREW_MAX = 4;
  /** Wetter */
  weather = { kind: 'sun' as 'sun' | 'rain' | 'snow', until: 0 };
  /** Störungen an Weichen/Signalen */
  faults: Fault[] = [];
  /** Abnutzung eigener Weichen/Signale in Prozent je Feld (RM-FR-UI-12) */
  wear: Record<number, number> = {};
  /** offene Entscheidung aus der Zeitung */
  /** Anschlüsse (RM-FR-OPS-13): angekommene Zubringer und Ergebnisse (nicht gespeichert) */
  readonly arrivals = new Map<number, Arrival>();
  readonly connResults = new Map<string, { ok: boolean; at: number; arr: number; dep: number; fromNo: string; toNo: string }>();
  /** aufgenommener Kredit (RM-FR-ECO-10) */
  loan: Loan | null = null;
  /** Geld gutschreiben, ohne es als Einnahme zu zählen (z. B. Kreditauszahlung) */
  addCash(v: number) { this._money += v; }
  /** Bahnhofsstufe 0..3 (RM-FR-PROG-08) */
  tier = 0;
  /** besondere Tage: heute und morgen (RM-FR-EVT-08) */
  specials: SpecialDay[] = [];
  /** laufende Förderung (RM-FR-ECO-11) */
  grant?: GrantState;
  grantsDone: string[] = [];
  /** Stammgäste (RM-FR-EVT-07) */
  regulars: Record<string, RegularState> = {};
  decision: { id: 'fans' | 'sponsor' | 'grant'; grant?: string; at?: number; dir?: 'E' | 'W'; reward?: number; penalty?: number; cost?: number } | null = null;
  get repairs() { return this.stats.repairs ?? 0; }
  get specialsOk() { return this.stats.specialsOk ?? 0; }
  get wasInDebt() { return !!this.stats.wasDebt; }
  readonly uiEvents: UiEvent[] = [];
  readonly fx: FxEvent[] = [];

  constructor(save?: GameSave) {
    if (save?.v === 5) save = growSave(save);
    const old = save?.v === 4;
    this.grid = new Grid(!save || old);
    if (save) {
      const g = this.grid;
      if (old) this.loadSmallMap(save);
      else {
        save.cells.forEach((b, k) => Object.assign(g.cells[k], unpackCell(b, save.sortDest?.[k] ?? null)));
        save.links?.forEach((l) => g.addLink(l.kind, l.x, l.y0, l.y1, l.id));
        save.pieces.forEach((p) => g.addPiece(p.key, p.x, p.y, p.id));
        save.buildings.forEach((b) => { Object.assign(g.addBuilding(b.key, b.x, b.y, b.decor, b.id), { name: b.name, code: b.code, rot: b.rot }); });
        save.owned.forEach((o, i) => (g.owned[i] = o));
        g.mainRows = save.mainRows;
        g.markFixedLoops();
        g.placeIndustries();
        g.placeForeignLines();
      }
      if (old) g.dropBrokenForeign();
      if (save.grown) this.fillOuter();
      Object.assign(this, {
        company: save.company, money: save.money, stats: { ...newStats(), ...save.stats }, missionBase: { ...newStats(), ...save.missionBase },
        missionIdx: save.missionIdx + ((save.missionsV ?? 1) < 2 && save.missionIdx >= 3 ? 1 : 0), log: save.log,
      });
      Object.assign(this.satisfaction, save.satisfaction);
      save.unlocked.forEach((u) => this.unlocked.add(u));
      if (save.research) this.research = save.research;
      else this.migrateResearch(save);
      this.migrateTrees(!!save.research);
      if (old) this.missionIdx = Math.min(this.missionIdx, this.missions.length);
      if (save.contracts) Object.assign(this.contracts, save.contracts);
      if (save.shopPrices) Object.assign(this.shopPrices, save.shopPrices);
    }
    this.net = new Network(this.grid);
    this.sim = new Simulation(this.net, old ? undefined : save?.sim);
    if (old && save) {
      this.sim.time = save.sim.time;
      this.sim.setLevel(save.sim.level);
    }
    this.wireSim();
    if (save && !save.offers) this.migrateContracts(save);
    if (save?.offers) Object.assign(this.offers, save.offers);
    if (save?.news) Object.assign(this.news, save.news);
    if (save?.specials) this.specials = save.specials;
    if (save?.loan) this.loan = save.loan;
    if (save?.tier) this.tier = Math.max(0, Math.min(TIERS.length - 1, Math.floor(save.tier)));
    if (save?.history) this.history = save.history;
    if (save?.achievements) this.achievements = save.achievements;
    if (save?.weather) Object.assign(this.weather, save.weather);
    if (save?.faults) this.faults = save.faults;
    if (save?.wear) this.wear = save.wear;
    if (save?.goals) this.goals = save.goals;
    if (save?.board) this.board = save.board;
    if (save?.crew) this.crew = save.crew;
    if (save?.inspectors) this.inspectors = save.inspectors;
    if (save?.grant) this.grant = save.grant;
    if (save?.grantsDone) this.grantsDone = save.grantsDone;
    if (save?.regulars) this.regulars = save.regulars;
    if (save?.shopAuto) this.shopAuto = save.shopAuto;
    if (save?.inbox) this.inbox = save.inbox;
    if (save?.player) this.player = save.player;
    if (save?.missionMark !== undefined) this.missionMark = save.missionMark;
    if (save?.mode) this.mode = save.mode;
    if (save?.demo) this.demo = true;
    if (save?.challenge) this.challenge = save.challenge;
    if (save?.profileId) this.profileId = save.profileId;
    applyOpOverrides(undefined);
    if (save?.freeCfg) { this.freeCfg = save.freeCfg; applyFreeCfg(this); }
    if (save?.longGoals) this.longGoals = save.longGoals;
    this.faults.forEach((f) => { this.sim.faultCells.add(f.k); f.cells?.forEach((k) => this.sim.faultCells.add(k)); });
    this.applyWeather();
    this.clampTakts();
    this.updatePlatformLength();
    this.sim.fillTimetable();
    this.applySwitchSpeed();
    this.lastHour = Math.floor(this.sim.time / 3600);
    this.loopsPending = this.grid.mainRows.includes(SECOND_ROW) && this.grid.fixedPieces.size > 0;
    // zweigleisiger Ausbau erforscht, aber das 2. Streckengleis fehlt (ältere Stände, Demobahnhof): jetzt nachholen
    this.ensureSecondTrack();
  }

  /** Rückrufe der Simulation an dieses Spiel binden */
  private wireSim() {
    this.sim.contractActive = (id) => this.contracts[id].status === 'active';
    this.sim.taktOf = (id) => {
      const c = this.contracts[id];
      // Fremdbahn: ohne Vertrag fahren ihre Züge als Kulisse im eigenen Takt – nur, wenn die Strecke liegt
      if (OPERATORS[id].foreign) {
        if (!this.grid.foreignLaid.some((l) => l.op === id) || this.freeCfg?.noForeign) return 0;
        return c.status === 'active' && foreignOps(this).includes(id) ? c.takt : FOREIGN_DECO_TAKT;
      }
      return c.status === 'none' ? 0 : c.takt;
    };
    this.sim.foreignMode = (id) => (this.researched('linkThru') ? this.contracts[id].mode ?? 'stop' : 'stop');
    this.sim.nightLines = (id) => this.contracts[id].lines ?? 1;
    this.sim.serviceOf = (id) => this.contracts[id].status === 'active' && !!this.contracts[id].service;
    this.sim.boostOf = (id) => this.contracts[id].status === 'active' && !!this.contracts[id].boost;
    this.sim.paxMod = (op, at) => specialPax(this, op, at) * dayPax(op, at) * seasonPax(seasonOf(Math.floor(at / 86400)), op);
    this.sim.runs = (op, at) => specialRuns(this, op, at);
  }

  /** Spielstand ohne Neuladen übernehmen (RM-FR-PERF-04): Zustand eines frisch geladenen Spiels in dieses Objekt holen */
  adopt(o: Game) {
    Object.assign(this, o);
    this.wireSim();
  }

  /** „Doppelt hält besser“ erforscht → Netzbetreiber baut das 2. Streckengleis (falls noch nicht geschehen) */
  ensureSecondTrack() {
    if (this.researched('double') && !this.grid.mainRows.includes(SECOND_ROW)) this.expandLine();
    if (this.grid.mainRows.includes(SECOND_ROW) && this.grid.addBlockSignals()) this.rebuild();
  }

  /** gehobener Spielstand (RM-FR-MAP-12): neue Streifen oben und unten wie auf einer frischen Karte (Landschaft, Straßen) */
  private fillOuter() {
    const g = this.grid, fresh = new Grid(true);
    const outer = (y: number) => y < ROW0 || y >= ROW0 + 64;
    for (let y = 0; y < g.h; y++) {
      if (!outer(y)) continue;
      for (let x = 0; x < g.w; x++) g.get(x, y)!.road = fresh.get(x, y)!.road;
    }
    for (const b of fresh.buildings.values()) {
      const cells = fresh.buildingCells(b);
      if (!cells.every((k) => outer(fresh.xy(k).y))) continue;
      if (cells.some((k) => g.cells[k].building !== null || g.cells[k].track || g.cells[k].piece !== null)) continue;
      g.addBuilding(b.key, b.x, b.y, true);
    }
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
    save.buildings.forEach((b) => { Object.assign(g.addBuilding(b.key, b.x + dx, b.y + dy, b.decor), { name: b.name, code: b.code }); });
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
      v: SAVE_VERSION, app: VERSION, missionsV: MISSIONS_VERSION, missionMark: this.missionMark,
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
      satisfaction: this.satisfaction, missionIdx: this.missionIdx, mode: this.mode, demo: this.demo || undefined, challenge: this.challenge, profileId: this.profileId, freeCfg: this.freeCfg, longGoals: this.longGoals,
      unlocked: [...this.unlocked], log: this.log, sim: this.sim.save(),
      research: this.research, contracts: this.contracts, shopPrices: this.shopPrices, offers: this.offers, news: this.news,
      history: this.history, achievements: this.achievements, weather: this.weather, faults: this.faults, wear: this.wear, goals: this.goals, specials: this.specials, tier: this.tier, loan: this.loan, mapId: currentMap().id, customMap: activeCustom(currentMap().id), board: this.board, crew: this.crew, inspectors: this.inspectors, grant: this.grant, grantsDone: this.grantsDone, regulars: this.regulars, shopAuto: this.shopAuto, inbox: this.inbox, player: this.player,
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

  stationName(id: number, name: string, code?: string) {
    const b = this.grid.buildings.get(id);
    if (b) { b.name = name; b.code = code || undefined; this.version++; }
  }

  /** Kürzel eines Bahnhofs (selbst vergeben oder aus dem Namen) */
  stationCode(b: { id: number; name?: string; code?: string }): string {
    if (b.code) return b.code;
    const taken: string[] = this.stations().filter((o) => o.id < b.id).map((o): string => this.stationCode(o));
    return autoCode(b.name ?? 'Bahnhof', taken);
  }

  stations() { return [...this.grid.buildings.values()].filter((b) => isStation(b.key) && !b.decor); }

  stationLevel(key: string) { return key === 'bld_station3' ? 3 : key === 'bld_station2' ? 2 : 1; }

  private connCache = { version: -1, map: new Map<number, { parking: boolean; bus: boolean; street: boolean }>() };
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
        const found = { parking: false, bus: false, street: false };
        while (stack.length) {
          const k = stack.pop()!;
          const { x, y } = g.xy(k);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const c = g.get(x + dx, y + dy);
            if (!c) continue;
            const bk = c.building !== null ? g.buildings.get(c.building)?.key : undefined;
            if (bk === 'bld_parking') found.parking = true;
            if (bk === 'bld_bus') found.bus = true;
            if (c.road && g.isPublicRoad(x + dx, y + dy)) found.street = true;
            const nk = g.key(x + dx, y + dy);
            if (c.road && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
          }
        }
        this.connCache.map.set(st.id, found);
      }
    }
    return this.connCache.map.get(id) ?? { parking: false, bus: false, street: false };
  }

  /** Zuschlag eines Bahnhofs auf die Einnahmen */
  stationBonus(id: number) {
    const b = this.grid.buildings.get(id);
    if (!b) return 0;
    const lvl = this.stationLevel(b.key);
    const c = this.connections(id);
    return [0, 0.15, 0.25, 0.4][lvl] + (c.parking ? 0.1 : 0) + (c.bus ? 0.15 : 0) + (c.street ? 0.05 : 0);
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
    this.book('Bau', -(STATION_UPGRADE[next]));
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
    this.shopAuto[key] = false;
    const ref = SHOPS[key].ref;
    this.shopPrices[key] = Math.round(Math.max(ref * 0.4, Math.min(ref * 2.5, price)) * 10) / 10;
  }

  /**
   * Laufkundschaft: Leute aus dem Ort kaufen auch ohne Zug ein (stündlich).
   * Tagsüber mehr, nachts kaum; größere Bahnhöfe mit Park- und Busanbindung ziehen mehr an.
   */
  walkIns() {
    const st = this.stations();
    if (!st.length) return 0;
    const hour = Math.floor(this.sim.time / 3600) % 24;
    const dayFactor = hour < 6 ? 0.1 : hour < 9 ? 0.8 : hour < 19 ? 1 : hour < 22 ? 0.6 : 0.2;
    const conn = st.reduce((a, b) => { const c = this.connections(b.id); return a + (c.parking ? 0.3 : 0) + (c.bus ? 0.4 : 0) + (c.street ? 0.3 : 0); }, 0);
    // Passanten je Stunde am Bahnhof
    const people = 40 * (1 + 0.5 * this.tier + conn) * dayFactor * this.sim.paxFactor;
    let total = 0;
    for (const key of Object.keys(SHOPS)) {
      const n = [...this.grid.buildings.values()].filter((b) => b.key === key && !b.decor).length;
      if (!n) continue;
      const sum = Math.round(people * Math.min(1.8, 1 + 0.4 * (n - 1)) * this.shopRate(key) * this.shopPrices[key]);
      if (sum > 0) { this.book('Läden', sum); total += sum; }
    }
    if (total) { const td = this.today(); td.shop = (td.shop ?? 0) + total; this.bump('shop', total); }
    return total;
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
    tickWear(this);
    this.checkDeadlock();
    challengeTick(this);
    for (const ev of this.sim.events.splice(0)) {
      if (ev.type === 'note') { this.addLog(ev.text, 'bad'); continue; }
      if (ev.type === 'sorted') {
        const income = ev.correct * 80 + (ev.wagons - ev.correct) * 20;
        this.book('Unternehmen', income);
        this.stats.sortedWagons += ev.correct;
        this.addLog(`Güterzug Richtung ${SORT_DESTS[ev.dest].name} mit ${ev.wagons} Wagen fährt ab · +${income} €`, 'good');
        continue;
      }
      const t = ev.train;
      // Fremdbahn-Züge ohne Vertrag sind Kulisse: keine Kasse, keine Statistik
      if (t.deco) continue;
      if (ev.type === 'arrive') { if (systemOn(this, 'connections')) noteArrival(this, t); continue; }
      if (ev.type === 'cancel') {
        this.book('Strafen', -(CANCEL_COST));
        this.stats.handled++;
        this.stats.streak = 0;
        this.stats.recent.push(false);
        this.satisfaction[t.op.id] = Math.max(0, this.satisfaction[t.op.id] - 10);
        this.addLog(`${t.number} aus dem Verkehr genommen (−${CANCEL_COST} €)`, 'bad');
        this.fx.push({ amount: -CANCEL_COST, x: 0, y: 0, train: t.id, label: 'Zug fällt aus' });
        continue;
      }
      if (ev.type === 'stop') {
        if (systemOn(this, 'connections')) settleDeparture(this, t);
        this.stats.passengers += t.passengers;
        inspectTrain(this, t);
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
          this.book('Läden', sum);
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
          this.book('Läden', ads);
          this.fx.push({ amount: ads, x: 0, y: 0, train: t.id, label: 'Werbung' });
        }
        if (shopSum) { const td = this.today(); td.shop = (td.shop ?? 0) + shopSum; this.bump('shop', shopSum); }
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
        if (fee) { this.book('Unternehmen', fee); this.fx.push({ amount: fee, x: 0, y: 0, train: t.id, label: 'Abstellen' }); }
        this.addLog(`${t.number} abgestellt (${where})${fee ? ` · +${fee} €` : ''}`, 'info');
        continue;
      }
      if (ev.type === 'service') {
        this.stats.services++;
        this.bump('services');
        this.book('Unternehmen', ev.fee);
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
    // Verspätung von außen zählt nicht gegen den Bahnhof (RM-FR-OPS-11) – nur was hier dazukommt
    delayMin = Math.max(0, delayMin - (t.extDelay ?? 0) / 60);
    const punctual = !missed && delayMin < PUNCTUAL_LIMIT_MIN;
    this.bump('trains'); if (punctual) this.bump('punctual');
    let income: number;
    if (t.transit) {
      income = TRANSIT_FEE;
      this.book('Unternehmen', income);
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
      const f = t.op.needsStop && !t.via ? this.incomeFactor : 1;
      const late = Math.max(0, delayMin - PUNCTUAL_LIMIT_MIN);
      this.bump('lateMin', late);
      let price = this.contracts[t.op.id].price[lengthClass(t.cars.length)];
      if (t.op.foreign) price = Math.round(price * foreignFeeFactor(this, !!t.via));
      // Stoßzeit: Pendler ärgern sich mehr über Verspätungen (RM-FR-ECO-08)
      const rushF = rushPenalty(t.op, this.sim.time);
      income = punctual ? Math.round(price * f) : Math.round(price * 0.7 * f - late * DELAY_PENALTY_PER_MIN * rushF);
      income = Math.max(-Math.round(price * 0.7), income);
      if (punctual) this.research.points++;
      this.satisfaction[t.op.id] += punctual ? 3 : -Math.min(15 * rushF, delayMin * 2 * rushF);
      const d = delayMin < 1 ? 'pünktlich' : `+${Math.round(delayMin)} min`;
      this.addLog(`${t.number} ${d} · ${income >= 0 ? '+' : ''}${income} €`, punctual ? 'good' : 'bad');
    }
    this.fx.push({ amount: income, x: 0, y: 0, train: t.id, label: missed ? 'kein Halt' : punctual ? 'pünktlich' : `+${Math.round(delayMin)} min` });
    this.satisfaction[t.op.id] = Math.max(0, Math.min(100, this.satisfaction[t.op.id]));
    this.book('Unternehmen', income);
    this.stats.handled++;
    regularsOnStop(this, t, punctual);
    if (punctual) {
      this.stats.punctual++; this.stats.streak++;
      if ([5, 10, 25, 50, 100].includes(this.stats.streak) || (this.stats.streak > 100 && this.stats.streak % 50 === 0)) this.uiEvents.push({ type: 'streak', n: this.stats.streak });
    } else this.stats.streak = 0;
    const os = ((this.stats.opStats ??= {})[t.op.id] ??= { handled: 0, punctual: 0 });
    os.handled++;
    if (punctual) os.punctual++;
    const td = this.today();
    td.handled++;
    if (punctual) td.punctual++;
    td.pax += t.passengers;
    this.bump('pax', t.passengers);
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
    if (r.tree === 'link' && !systemOn(this, 'foreign')) return 'Fremdbahnen kommen erst im Industrierevier';
    if (this.runningIn(r.tree)) return 'In diesem Baum läuft schon eine Forschung';
    const miss = r.requires.filter((q) => !this.researched(q));
    if (miss.length) return `Zuerst: ${miss.map((q) => RESEARCH_BY_ID[q].name).join(', ')}`;
    if (this.sandbox) return null;
    if (this.research.points < r.fp) return `Zu wenig Forschungspunkte (${r.fp})`;
    if (this.money < r.cost) return 'Zu wenig Geld';
    return null;
  }

  /** Sandbox (RM-FR-MODE-07): kein Geld, keine Pleite, Forschung sofort */
  get sandbox() { return !!this.freeCfg?.sandbox; }

  startResearch(id: ResearchId) {
    if (this.researchBlock(id)) return false;
    const r = RESEARCH_BY_ID[id];
    if (this.sandbox) { this.finishResearch(id); return true; }
    this.book('Forschung', -(r.cost));
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
    priceMod.fair = (this.researched('haggle') ? 1.1 : 1) * (1 + TIERS[this.tier].bonus.fair);
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

  /** Automatik (RM-FR-CPX-02): Vertragspreise auf fair, Ladenpreise auf üblich */
  applyAutoPrices() {
    for (const [id, c] of Object.entries(this.contracts)) {
      if (!c.auto) continue;
      const o = OPERATORS[id as OperatorId];
      c.price = { short: fairPrice(o, 'short'), long: fairPrice(o, 'long') };
    }
    for (const k of Object.keys(this.shopAuto)) if (this.shopAuto[k]) this.shopPrices[k] = SHOPS[k].ref;
  }
  toggleAutoPrice(op: OperatorId) {
    const c = this.contracts[op];
    c.auto = !c.auto;
    this.applyAutoPrices();
  }
  /** Ladenpreise automatisch (je Ladenart) */
  shopAuto: Record<string, boolean> = {};
  toggleShopAuto(key: string) {
    this.shopAuto[key] = !this.shopAuto[key];
    this.applyAutoPrices();
  }

  setPrice(op: OperatorId, cls: LengthClass, price: number) {
    this.contracts[op].auto = false;
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
    if (o.foreign) return foreignBlock(this, op);
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
    if (OPERATORS[op].foreign) { c.mode ??= 'stop'; this.sim.recontract(op); }
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

  openOffer(o: Offer, key: string) {
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
    const w = seasonWeather(this.season, currentMap().weather);
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
    // abgenutzte Weichen und Signale fallen öfter aus
    const chance = 0.05 * (1 - 0.15 * this.crew) * crewCare(this.crew) * (this.researched('crew2') ? 0.5 : 1) * faultFactor(this) * faultCfg(this);
    if (this.faults.length || Math.random() > chance || !systemOn(this, 'faults')) return;
    const g = this.grid;
    const cand: { k: number; kind: 'switch' | 'signal' }[] = [];
    for (const p of g.pieces.values()) {
      if (g.fixedPieces.has(p.id) || PIECES[p.key].group !== 'switch') continue;
      const cells = g.pieceCells(p);
      cand.push({ k: cells[Math.floor(cells.length / 2)], kind: 'switch' });
    }
    g.cells.forEach((c, k) => { if ((c.signal || c.signalW) && !c.fixed && g.isOwned(g.xy(k).x, g.xy(k).y)) cand.push({ k, kind: 'signal' }); });
    if (cand.length < 2) return;
    const f = pickWeighted(this, cand);
    if (this.sim.owner[f.k] !== 0) return;
    this.faults.push({ ...f, since: this.sim.time });
    this.bump('faults');
    this.sim.faultCells.add(f.k);
    const p = g.xy(f.k);
    this.addLog(this.crew ? `Störung: ${f.kind === 'switch' ? 'Weiche' : 'Signal'} defekt – deine Instandhalter rücken aus`
      : `Störung: ${f.kind === 'switch' ? 'Weiche' : 'Signal'} defekt – anklicken, um den Störtrupp zu schicken (${REPAIR_COST} €)`, 'bad');
    this.fx.push({ amount: 0, x: p.x, y: p.y, label: 'STÖRUNG!' });
  }

  /** Großstörung (RM-FR-EVT-09): selten wird ein Stück Streckengleis für 1–2½ Stunden gesperrt */
  private maybeBigFault(chance = 0.015) {
    if (!this.stations().length || this.sim.time < 86400 + 6 * 3600 || this.faults.some((f) => f.cells)) return false;
    if (Math.random() > chance * faultCfg(this)) return false;
    return this.startBigFault();
  }

  /** Großstörung jetzt auslösen (auch für Tests) */
  startBigFault(kind?: 'tree' | 'wire') {
    const g = this.grid, LEN = 5;
    const options: { cells: number[]; wire: boolean }[] = [];
    for (const row of g.mainRows) {
      for (let x = 2; x + LEN < g.w - 2; x++) {
        const cells: number[] = [];
        let ok = true;
        for (let i = 0; i < LEN && ok; i++) {
          const c = g.get(x + i, row);
          const k = g.key(x + i, row);
          ok = !!c && c.track && c.fixed && c.piece === null && !c.signal && !c.signalW && this.sim.owner[k] === 0 && g.isOwned(x + i, row);
          cells.push(k);
        }
        if (ok) options.push({ cells, wire: cells.every((k) => g.cells[k].wire) });
      }
    }
    if (!options.length) return false;
    const o = options[Math.floor(Math.random() * options.length)];
    const kd = kind ?? (o.wire && Math.random() < 0.5 ? 'wire' : 'tree');
    const minutes = kd === 'tree' ? 60 + Math.random() * 60 : 90 + Math.random() * 60;
    const f: Fault = { k: o.cells[2], kind: kd, since: this.sim.time, cells: o.cells, until: this.sim.time + Math.round(minutes) * 60 };
    this.faults.push(f);
    o.cells.forEach((k) => this.sim.faultCells.add(k));
    const p = g.xy(f.k);
    const what = kd === 'tree' ? 'Baum auf der Strecke' : 'Oberleitungsschaden';
    this.addLog(`Großstörung: ${what} – Streckengleis ca. ${Math.round(minutes)} min gesperrt`, 'bad');
    this.fx.push({ amount: 0, x: p.x, y: p.y, label: 'GESPERRT!' });
    this.uiEvents.push({ type: 'news', tag: `bigfault-${kd}`,
      title: kd === 'tree' ? 'Sturm: Baum stürzt auf die Bahnstrecke' : 'Oberleitung gerissen: Strecke gesperrt',
      text: `${kd === 'tree' ? 'Eine umgestürzte Fichte blockiert das Streckengleis.' : 'Ein Fahrdrahtriss legt das Streckengleis lahm – wegen der Arbeiten darf auch kein Dieselzug durch.'} Die Sperre dauert etwa ${Math.round(minutes)} Minuten. Wer ein zweites Gleis hat, kann die Züge daran vorbeileiten – sonst heißt es warten oder Züge ausfallen lassen.` });
    return true;
  }

  /** Großeinsatz: halbiert die restliche Sperrzeit (einmal je Störung) */
  boostBigFault(f: Fault) {
    if (!f.cells || f.boosted || this.money < BIG_REPAIR_COST) return false;
    this.book('Instandhaltung', -(BIG_REPAIR_COST));
    f.boosted = true;
    f.until = this.sim.time + Math.max(5 * 60, Math.round(((f.until ?? this.sim.time) - this.sim.time) / 2));
    const p = this.grid.xy(f.k);
    this.fx.push({ amount: -BIG_REPAIR_COST, x: p.x, y: p.y, label: 'Großeinsatz' });
    this.addLog(`Großeinsatz bestellt (−${BIG_REPAIR_COST.toLocaleString('de-AT')} €) – Strecke früher frei`, 'info');
    return true;
  }

  faultAt(x: number, y: number) {
    const g = this.grid;
    const c = g.get(x, y);
    if (!c) return undefined;
    const keys = new Set<number>([g.key(x, y)]);
    if (c.piece !== null) g.pieceCells(g.pieces.get(c.piece)!).forEach((k) => keys.add(k));
    return this.faults.find((f) => keys.has(f.k) || f.cells?.some((k) => keys.has(k)));
  }

  /** Störtrupp schicken: kostet, braucht 20 Spielminuten */
  repairFault(x: number, y: number) {
    const f = this.faultAt(x, y);
    if (f?.cells) return this.boostBigFault(f);
    if (!f || f.repairAt) return false;
    this.book('Instandhaltung', -(REPAIR_COST));
    f.repairAt = this.sim.time + this.repairMinutes * 60;
    this.addLog(`Störtrupp unterwegs (−${REPAIR_COST} €), fertig in ${this.repairMinutes} min`, 'info');
    this.fx.push({ amount: -REPAIR_COST, x, y, label: 'Störtrupp' });
    return true;
  }

  /** Reparaturdauer: eigene Instandhalter sind schneller */
  get repairMinutes() { return Math.max(3, Math.round((20 / (1 + 0.5 * this.crew)) * crewSpeed(this.crew) * (this.researched('estw') ? 0.5 : 1))); }

  /** Instandhalter einstellen / entlassen */
  setCrew(n: number) {
    if (!this.researched('crew')) return;
    const v = Math.max(0, Math.min(Game.CREW_MAX, n));
    if (v === this.crew) return;
    this.addLog(v > this.crew ? `${CREW[v - 1].name} (${CREW[v - 1].trait}) als Instandhalter eingestellt` : `${CREW[this.crew - 1].name} entlassen`, 'info');
    this.crew = v;
    this.version++;
  }

  private tickFaults() {
    if (!this.faults.length) return;
    const t = this.sim.time;
    for (const f of [...this.faults]) {
      // Großstörung: Sperre läuft einfach ab
      if (f.cells) {
        if (t >= (f.until ?? 0)) {
          this.faults.splice(this.faults.indexOf(f), 1);
          this.sim.faultCells.delete(f.k);
          f.cells.forEach((k) => this.sim.faultCells.delete(k));
          this.addLog(f.kind === 'tree' ? 'Baum weggeräumt – die Strecke ist wieder frei' : 'Oberleitung repariert – die Strecke ist wieder frei', 'good');
        }
        continue;
      }
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
        this.wear[f.k] = 0;
        if (auto) {
          for (const o of this.activeOperators()) this.satisfaction[o.id] = Math.max(0, this.satisfaction[o.id] - 5);
          this.addLog('Störung nach Stunden endlich behoben – die Unternehmen sind verärgert', 'bad');
        } else {
          this.stats.repairs = (this.stats.repairs ?? 0) + 1;
          this.bump('repairs');
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
    if (d.id === 'grant' && d.grant) acceptGrant(this, d.grant);
    if (d.id === 'sponsor' && d.cost) {
      this.book('Sonstiges', -(d.cost));
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
  /** Pleite-Grenze: im freien Spiel einstellbar (RM-FR-MODE-06) */
  get debtLimit() { return this.freeCfg ? -this.freeCfg.debt : Game.DEBT_LIMIT; }
  static readonly LOAN_RATE = 0.03;

  private checkDebt() {
    if (this.gameOver) return;
    if (this.sandbox) { if (this.money < 1e6) this._money = SANDBOX_MONEY; return; }
    if (this.money < 0 && !this.inDebt) {
      this.inDebt = true;
      this.stats.wasDebt = true;
      this.addLog(`Kasse leer – automatischer Kredit, ${Math.round(Game.LOAN_RATE * 100)} % Zinsen pro Tag`, 'bad');
      if (this.company) this.uiEvents.push({ type: 'letter', mood: 'bad', from: BANK(), title: 'Ihr Konto ist im Minus',
        text: `<p>${this.salutation(`Sehr geehrte Damen und Herren der ${this.company}`)}</p><p>Ihr Geschäftskonto ist soeben ins Minus gerutscht. Damit Ihre Züge weiterfahren, gewähren wir Ihnen automatisch einen Kredit – zu <b>${Math.round(Game.LOAN_RATE * 100)} % Zinsen pro Tag</b>.</p><p>Bitte beachten Sie: Bei <b>${(-this.debtLimit).toLocaleString('de-AT')}&nbsp;€ Schulden</b> müssen wir die Kreditlinie leider kündigen.</p>` });
    } else if (this.money >= 0 && this.inDebt) {
      this.inDebt = false;
      this.addLog('Kredit zurückgezahlt!', 'good');
      this.uiEvents.push({ type: 'letter', mood: 'good', from: BANK(), title: 'Kredit getilgt',
        text: `<p>${this.salutation('Sehr geehrte Damen und Herren')}</p><p>wir freuen uns, Ihnen mitzuteilen, dass Ihr Kredit vollständig zurückgezahlt ist. Es war uns ein Vergnügen. Beehren Sie uns bald wieder – aber nicht zu bald.</p>` });
    }
    if (this.money <= this.debtLimit) {
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

  /** abgewählte Unternehmen aus einer Ausschreibung nehmen (mindestens eines bleibt, sonst stockt das Spiel) */
  private allowedOps(ops: OperatorId[]) {
    const ok = ops.filter((op) => opAllowed(this, op));
    return ok.length ? ok : ops;
  }

  /** Ausschreibungen und Anfragen auslösen */
  private checkOffers() {
    // Herausforderung: feste Ausgangslage, keine neuen Anfragen
    if (this.offers.open || this.mode === 'challenge') return;
    const none = (op: OperatorId) => this.contracts[op].status === 'none';
    const t = this.sim.time;
    // 1. Regionalverkehr, sobald ein Empfangsgebäude steht
    if (this.stations().length && !this.offers.done.includes('regio')) {
      this.openOffer({ kind: 'tender', title: 'Ausschreibung Regionalverkehr', text: 'Dein Bahnhof ist eröffnet! Wähle EIN Unternehmen, das bei dir hält.',
        ops: this.allowedOps(currentMap().tenderRegio) }, 'regio');
      this.offers.freightAt = t + 2 * 3600;
      return;
    }
    // 2. Güterverkehr kurz danach
    if (this.offers.freightAt && t >= this.offers.freightAt && !this.offers.done.includes('freight')) {
      this.openOffer({ kind: 'tender', title: 'Ausschreibung Güterverkehr', text: 'Güterzüge fahren durch und zahlen für die Trasse. Wähle EIN Unternehmen.',
        ops: this.allowedOps(currentMap().tenderFreight) }, 'freight');
      return;
    }
    // 3. danach melden sich immer wieder Unternehmen (E-Züge erst mit Oberleitung)
    if (!this.offers.done.includes('freight') || t < this.offers.nextInquiry) return;
    // freies Spiel: mehr Verkehr erst mit der nächsten Bahnhofsstufe
    if (this.activeOperators().filter((o) => this.contracts[o.id].status === 'active').length >= contractCap(this)) { this.offers.nextInquiry = t + 3600; return; }
    const order: OperatorId[] = currentMap().inquiries.filter((op) => opAllowed(this, op));
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
    const base = { Gleise: track * 2 + pieces * 10 + sig * 2 + wire, Bahnsteige: plat * 3, Gebäude: Math.round(bld), Personal: this.crew * Game.CREW_WAGE + this.inspectors * INSPECTOR_WAGE };
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
    this.book('Prämien', goal.reward);
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
    // Bahnsteigdächer zählen bei Regen und Schnee doppelt (RM-FR-BUILD-15)
    const wet = this.weather.kind !== 'sun' ? 2 : 1;
    const comfort = Math.min(1, (count(['bld_shelter', 'bld_bench', 'bld_clock', 'bld_board', 'bld_wc', 'bld_lamp']) + count(['bld_canopy']) * wet) / (runs * 3));
    const shopTypes = ['bld_kiosk', 'bld_cafe', 'bld_vending', 'bld_inn'].filter((k) => count([k]) > 0).length;
    const service = Math.min(1, shopTypes / 3 + (count(['bld_parking', 'bld_bus']) ? 0.2 : 0));
    const mood = Math.max(0, Math.min(1, (this.moodEma + 1) / 2 + (this.researched('cat') ? 0.1 : 0)));
    const parts = { Pünktlichkeit: punct, Sauberkeit: this.cleanEma, Komfort: comfort, Service: service, Stimmung: mood };
    const score = punct * 0.35 + this.cleanEma * 0.15 + comfort * 0.2 + service * 0.15 + mood * 0.15;
    const stars = Math.max(1, Math.min(5, Math.round(score * 5)));
    if (this.stations().length && stars !== this.rating.stars) this.addLog(`Bahnhofs-Bewertung: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, stars > this.rating.stars ? 'good' : 'bad');
    this.rating = { stars, parts };
    this.sim.paxFactor = (0.8 + 0.1 * stars) * (1 + TIERS[this.tier].bonus.pax) * paxCfg(this) * (1 + foreignPaxBonus(this));
  }

  /** aktuelle Jahreszeit (RM-FR-EVT-10) */
  get season(): Season { return seasonOf(Math.floor(this.sim.time / 86400)); }

  private daily() {
    // neue Jahreszeit: Meldung und Wetter neu würfeln
    const day = Math.floor(this.sim.time / 86400);
    if (day > 0 && seasonOf(day) !== seasonOf(day - 1)) {
      const s = this.season;
      this.addLog(`${SEASON_NAME[s]}: ${SEASON_NEWS[s]}`, 'info');
      this.uiEvents.push({ type: 'news', title: `${SEASON_NAME[s]} im Land`, text: SEASON_NEWS[s], tag: `season-${s}` });
      this.weather.until = 0;
    }
    this.applyAutoPrices();
    // Tagesabschluss des vergangenen Tages (RM-FR-FEEL-01)
    const yd = Math.floor(this.sim.time / 86400) - 1;
    const y = this.history.find((h) => h.day === yd);
    if (y) this.uiEvents.push({ type: 'dayEnd', day: yd + 1, income: y.income, expense: y.expense, handled: y.handled, punctual: y.punctual, pax: y.pax,
      goalsDone: this.goals.filter((x) => x.done).length, goalsTotal: this.goals.length });
    this.rollGoals();
    const m = this.maintenance();
    const cost = (m.total - m.Personal) * (m.vandal ? 2 : 1) + m.Personal;
    if (cost) {
      this.book('Personal', -m.Personal);
      this.book('Instandhaltung', -(cost - m.Personal));
      this.addLog(`Instandhaltung: −${cost.toLocaleString('de-AT')} €${m.vandal ? ' (doppelt wegen Vandalismus)' : ''}`, 'bad');
    }
    payLoan(this);
    const zins = this.interest;
    if (zins) {
      this.book('Zinsen', -(zins));
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
      if (l.bonus) this.book('Prämien', l.bonus);
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
    const gr = q >= 0.4 && q < 0.6 && !this.decision && systemOn(this, 'grants') ? pickGrant(this) : undefined;
    if (gr) {
      this.decision = { id: 'grant', grant: gr.id };
      this.uiEvents.push({ type: 'decision', tag: 'grant', title: `${gr.from} fördert: ${gr.title}`,
        text: `${gr.text} Dafür gibt es ${gr.amount.toLocaleString('de-AT')} € sofort – klappt es nicht binnen ${gr.days} Tagen, muss alles zurückgezahlt werden.`,
        yes: `Annehmen (+${gr.amount.toLocaleString('de-AT')} €)`, no: 'Nein danke' });
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

  /** nächste Bahnhofsstufe erreicht? */
  private checkTier() {
    if (!this.stations().length || this.tier >= TIERS.length - 1) return;
    const next = this.tier + 1;
    if (!tierChecks(this, next).every((c) => c.ok)) return;
    this.tier = next;
    const t = TIERS[next];
    if (t.reward) { this.book('Prämien', t.reward.money); this.research.points += t.reward.fp; }
    this.applySwitchSpeed();
    this.updateRating();
    this.version++;
    const name = this.stations()[0]?.name ?? 'Unser Bahnhof';
    this.addLog(`${name} ist jetzt ${next === 1 ? 'ein ' : next === 2 ? 'ein ' : 'der '}${t.name}!`, 'good');
    this.uiEvents.push({
      type: 'letter', mood: 'good', open: true, bonus: t.reward?.money,
      title: `${name} ist jetzt ${t.name === 'Hauptbahnhof' ? 'Hauptbahnhof' : `ein ${t.name}`}!`,
      text: `<p>${next === 3 ? 'Ich bin – man verzeihe mir den Ausdruck – ganz aus dem Häuschen.' : next === 2 ? 'Was für eine Entwicklung!' : 'Herzlichen Glückwunsch!'} ${name} hat die Stufe <b>${t.name}</b> erreicht.</p>`
        + `<p>Das spricht sich herum: <b>${t.unlock}</b>. Dazu gibt der Vorstand eine Prämie und ${t.reward?.fp ?? 0} Forschungspunkte frei.</p>`
        + (next < TIERS.length - 1 ? `<p>Nächstes Ziel: ${TIERS[next + 1].name}. Ich zähle auf Sie.</p>` : '<p>Mehr geht nicht. Ich lasse ein Schild mit „Hbf“ anfertigen.</p>'),
    });
  }

  /** besondere Tage: am Vorabend ankündigen, am Morgen starten */
  private checkSpecials() {
    if (!this.stations().length || !this.company) return;
    const t = this.sim.time, hour = Math.floor(t / 3600) % 24, day = Math.floor(t / 86400);
    if (hour === 18) {
      const sd = rollSpecial(this);
      if (sd) {
        const p = SPECIALS[sd.id].paper(this, sd);
        this.uiEvents.push({ type: 'news', tag: `special-${sd.id}`, title: p.title, text: p.text });
        this.addLog(`Zeitung: morgen ${SPECIALS[sd.id].name} – ${SPECIALS[sd.id].hint}`, 'info');
      }
    }
    const today = this.specials.find((s) => s.day === day);
    if (today && !today.started && hour >= 6) {
      today.started = true;
      this.addLog(`Heute: ${SPECIALS[today.id].name} – ${SPECIALS[today.id].hint}`, 'info');
      if (today.id === 'heimspiel') {
        const at = day * 86400 + 17.5 * 3600;
        const tr = this.sim.addSpecial('fx', at, Math.random() < 0.5 ? 'E' : 'W');
        this.news.deals[tr.id] = { reward: 1500, penalty: 800 };
      }
      // Fahrgäste und Streik wirken schon beim Planen der Züge (angekündigt am Vorabend, geplant wird 90 min voraus)
    }
  }

  /** stündlich: Zufriedenheit je nach Preis, Kündigungen */
  private hourly() {
    checkForeign(this);
    const day = Math.floor(this.sim.time / 86400);
    if (this.news.lastDay < 0) this.news.lastDay = day;
    if (day !== this.news.lastDay) { this.news.lastDay = day; this.bump('days'); this.daily(); }
    grantTick(this);
    this.walkIns();
    // Auftrag „Wendezüge“: Ausschreibung wiederholen, falls noch kein Partner gewählt
    if (this.mission?.title === 'Wendezüge' && !this.offers.open) this.requestTurnback();
    this.checkNews();
    this.checkSpecials();
    this.updateRating();
    this.checkTier();
    if (!this.goals.length && this.stations().length) this.goals = newGoals(this, undefined);
    this.updateWeather();
    this.maybeFault();
    this.maybeBigFault();
    freeTick(this);
    crewMaintain(this);
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
  /** Auftragsliste: Kapitel 2 hat eigene Aufträge, sonst Donautal/Einschulung */
  get missions(): Mission[] {
    return (this.mode === 'campaign' && CHAPTER_MISSIONS[currentMap().id]) || MISSIONS;
  }

  get mission(): Mission | null {
    return this.missions[this.missionIdx] ?? null;
  }

  /** Kapitel 2–6 starten: alle Werkzeuge aus dem Donautal frei, eigene Aufträge */
  startChapter(map = currentMap().id) {
    const list = CHAPTER_MISSIONS[map];
    if (!list) return;
    MISSIONS.forEach((m) => m.unlock.forEach((u) => this.unlocked.add(u)));
    this.unlocked.add('research');
    this.research.points += 12;
    this.sim.setLevel(list[0].level);
    this.missionIdx = 0;
    this.missionBase = structuredClone(this.stats);
    this.startMission();
    const i = CHAPTERS.findIndex((c) => c.map === map);
    const l = chapterLetter(map, i + 1, CHAPTERS[i]?.title ?? currentMap().name, this.salutation());
    this.uiEvents.push({ type: 'letter', mood: 'info', title: l.title, text: l.text });
  }
  startChapter2() { this.startChapter('ebene'); }

  missionInfo() {
    const m = this.mission;
    // nach der Kampagne bzw. im freien Spiel: Langzeitziele
    if (this.mode === 'challenge' && this.challenge) return challengeInfo(this);
    if (!m) return freeInfo(this);
    const p = m.progress(this.stats, this.missionBase, this);
    return { title: m.title, short: m.short, reward: m.reward, ...p, index: this.missionIdx, total: this.missions.length, checks: m.checks?.(this, this.stats, this.missionBase) };
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
    this.grid.addBlockSignals();
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
      if (!g.loopStanding([xa, xb])) continue;
      // nur die Weichen müssen frei sein – auf der zweigleisigen Strecke ist die Kreuzungsstelle sonst ständig befahren
      const sw: number[] = [];
      for (const x0 of [xa, xb]) for (let x = x0; x <= x0 + 2; x++) for (const y of [MAIN_ROW, SECOND_ROW]) sw.push(g.key(x, y));
      if (sw.some((k) => this.sim.owner[k] !== 0)) { left = true; continue; }
      for (const id of new Set(sw.map((k) => g.cells[k].piece).filter((id): id is number => id !== null && g.fixedPieces.has(id)))) {
        g.removePiece(id); g.fixedPieces.delete(id);
      }
      // Weichen weg: durchgehendes Gleis auf beiden Streckengleisen
      for (const k of sw) g.cells[k].track = true;
      // Signale der Kreuzungsstelle abbauen – auch auf deinem Gelände
      for (const y of [MAIN_ROW, SECOND_ROW]) {
        g.get(xb - 1, y)!.signal = false;
        g.get(xa + 3, y)!.signalW = false;
      }
      // auf deinem Gelände gehört das Gleis jetzt dir (anschließen, Weichen setzen)
      for (let x = xa; x <= xb + 2; x++) for (const y of [MAIN_ROW, SECOND_ROW]) if (g.isOwned(x, y) && y === SECOND_ROW) g.get(x, y)!.fixed = false;
      changed = true;
    }
    if (changed) { this.grid.addBlockSignals(); this.rebuild(); this.addLog('Netzbetreiber hat eine Kreuzungsstelle abgebaut – dort ist jetzt durchgehend zweigleisige Strecke', 'info'); }
    this.loopsPending = left;
  }

  /** Kapitel der Kampagne abgeschlossen */
  private finishChapter() {
    const id = currentMap().id;
    const i = CHAPTERS.findIndex((c) => c.map === id);
    const r = chapterRating(this);
    const fresh = completeChapter(this.profileId, id, r.stars);
    const next = CHAPTERS[i + 1];
    this.uiEvents.push({ type: 'letter', mood: 'good', open: true, title: `Kapitel ${i + 1} geschafft: ${CHAPTERS[i]?.title ?? currentMap().name}`,
      text: `<p>${this.salutation()}</p><p>alle Aufträge dieses Kapitels sind erfüllt – der Vorstand ist begeistert.</p>`
        + `<p class="lt-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</p><ul class="lt-checks">${r.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${c.label}</li>`).join('')}</ul>`
        + (next && fresh && !DEMO ? `<p>Damit ist <b>Kapitel ${i + 2}: ${next.title}</b> freigeschaltet${next.ready ? '' : ' (wird gerade noch vorbereitet)'} – und die Karte ist ab sofort auch im <b>freien Spiel</b> wählbar.</p>` : '')
        + (DEMO && next ? `<p><b>Das war die Demo!</b> Die Kapitel 2 bis 7 – von der Pannonischen Ebene bis zur Großstadt – gibt es in der Vollversion auf Steam. Ihren Spielstand können Sie im Menü exportieren und dort weiterspielen.</p>` : '')
        + (!next ? `<p><b>Damit ist die Kampagne geschafft.</b> Vom ersten Bahnsteig im Donautal bis zum Hauptbahnhof der Großstadt – der Vorstand erhebt sich, die Kantine serviert Schnitzel, und irgendwo pfeift ein Zug. Danke fürs Spielen!</p><p>Im freien Spiel, bei den Herausforderungen und auf Zufallskarten geht es weiter.</p>` : '')
        + '<p>Sie können hier gerne weiterbauen: ab jetzt gelten die Langzeitziele.</p>' });
  }

  /** freies Spiel wählen (RM-FR-MODE-01) – mit Tutorial erst nach den Tutorial-Aufträgen */
  startFreePlay(tutorial: boolean) {
    this.mode = 'free';
    if (!tutorial) { enterFreePlay(this); this.addLog('Freies Spiel: alle Werkzeuge frei – Ziele oben rechts', 'info'); }
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
    this.book('Prämien', m.reward);
    this.research.points += m.fp;
    m.unlock.forEach((u) => this.unlocked.add(u));
    if (m.level !== this.sim.level) this.sim.setLevel(m.level);
    this.uiEvents.push({ type: 'mission', title: m.title, reward: m.reward, unlocked: m.unlock, fp: m.fp });
    storyAfterMission(this, this.missionIdx);
    this.addLog(`Auftrag „${m.title}“ erledigt`, 'good');
    this.missionIdx++;
    this.missionMark = undefined;
    // Ende des Tutorials: Brief vom Vorstand
    // Kampagne: letztes Kapitel-Ziel geschafft → im Profil merken, nächstes Kapitel frei (RM-FR-MODE-02/09)
    if (this.mode === 'campaign' && !this.mission) this.finishChapter();
    const freeNow = this.mode === 'free' && this.missionIdx === TUTORIAL_MISSIONS;
    if (freeNow) enterFreePlay(this);
    if ((this.missionIdx === TUTORIAL_MISSIONS && this.missions === MISSIONS) || freeNow) this.uiEvents.push({ type: 'letter', mood: 'good', title: 'Einschulung abgeschlossen!',
      text: `<p>${this.salutation()}</p><p>die Einschulung ist geschafft – herzlichen Glückwunsch! Sie haben einen Bahnhof eröffnet, Signale gesetzt, geforscht, Land gekauft, ein zweites Bahnsteiggleis gebaut und Wendezüge abgefertigt.</p>${freeNow ? '<p>Ab jetzt ist es <b>Ihr Bahnhof</b>: keine Aufträge mehr, nur noch große Ziele (oben rechts). Mehr Unternehmen melden sich, sobald der Bahnhof wächst.' : '<p>Ab jetzt läuft der <b>richtige Betrieb</b>: mehr Züge, größere Aufträge, eigene Entscheidungen.'} Der Vorstand traut Ihnen das zu. Enttäuschen Sie uns nicht – und vergessen Sie die Pünktlichkeit nicht.</p>` });
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
    if (tool === 'copy') return this.planCopy(cells, variant);
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
      // Hochbahn (RM-FR-MAP-11): Pfeiler blockieren, unter der Fahrbahn haben Gebäude keinen Platz
      if (cs.some((q) => g.viaductAt(q.x, q.y) === 2)) return 'Pfeiler der Hochbahn – hier kann man nicht bauen';
      if (tool === 'building' && !BUILDINGS[variant]?.onPlatform && cs.some((q) => g.viaductAt(q.x, q.y) === 1)) return 'Unter der Hochbahn ist kein Platz für Gebäude';
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
          if (g.isPublicRoad(q.x, q.y)) return 'Weichen nicht auf dem Bahnübergang';
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
        if (cells.some((c) => g.isPublicRoad(c.x, c.y))) return fail('Straße im Weg');
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
        cost = straight.filter((c) => !g.get(c.x, c.y)!.track).length * COST.track + bridgeCost(straight)
          + straight.filter((c) => !g.get(c.x, c.y)!.track && g.get(c.x, c.y)!.road).length * COST.crossing;
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
          if (cell.road) return fail('Straße im Weg', fp);
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
        if (c.road && !c.track && c.piece === null) {
          if (g.isPublicRoad(cells[0].x, cells[0].y)) return fail('Öffentliche Straße – gehört der Gemeinde');
          cost = -COST.road * REFUND; break;
        }
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

  /** Vertragsoption „Verstärkerzüge in der Stoßzeit“ umschalten (nur Pendlerverkehr im 30-/60-Minuten-Takt) */
  toggleBoost(op: OperatorId) {
    const c = this.contracts[op];
    if (c.status !== 'active' || !canBoost(OPERATORS[op], this.sim.taktOf(op))) return;
    c.boost = !c.boost;
    this.sim.retime(op);
    this.addLog(`${OPERATORS[op].name}: Verstärkerzüge in der Stoßzeit ${c.boost ? 'vereinbart' : 'abbestellt'}`, 'info');
  }

  /** Zug gegen Gebühr aus dem Verkehr nehmen (auch angekündigte) */
  removeTrain(id: number) {
    if (this.sim.trains.some((t) => t.id === id)) { this.sim.cancelTrain(id); return true; }
    const q = this.sim.queue.find((t) => t.id === id);
    if (!q) return false;
    this.sim.queue = this.sim.queue.filter((t) => t !== q);
    this.book('Strafen', -(CANCEL_COST));
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

  /** Rückgängig / Wiederholen (RM-FR-BUILD-11) */
  readonly undoLog = new UndoHistory();
  /** gebaute/abgerissene Felder für Bauanimationen (vom Renderer abgeholt, RM-FR-FEEL-02) */
  readonly buildEvents: { tool: ToolId; cells: XY[]; remove: boolean }[] = [];
  private buildDepth = 0;

  build(tool: ToolId, cells: XY[], variant = ''): BuildPlan {
    // nur die äußerste Aktion merken (Abriss mehrerer Teile ruft build mehrfach auf)
    if (this.buildDepth > 0) return this.buildOnce(tool, cells, variant);
    const before = this.undoLog.snapshot(this.grid);
    this.buildDepth++;
    try {
      const p = this.buildOnce(tool, cells, variant);
      if (p.ok) {
        this.undoLog.record(this.grid, before, TOOL_LABEL[tool] ?? 'Bauen', p.cost);
        this.bump(tool === 'remove' ? 'demolished' : tool === 'land' ? 'land' : 'built');
        if (tool !== 'land') this.buildEvents.push({ tool, cells: [...cells, ...p.cells], remove: tool === 'remove' });
        if (this.buildEvents.length > 20) this.buildEvents.shift();
      }
      return p;
    } finally {
      this.buildDepth--;
    }
  }

  /** letzte Bau-Aktion zurücknehmen; liefert eine Meldung */
  undo(): { ok: boolean; text: string } { return this.step(false); }
  /** zurückgenommene Aktion wiederholen */
  redo(): { ok: boolean; text: string } { return this.step(true); }

  private step(forward: boolean): { ok: boolean; text: string } {
    const h = this.undoLog;
    const s = forward ? h.peekRedo() : h.peekUndo();
    if (!s) return { ok: false, text: forward ? 'Nichts zum Wiederholen' : 'Nichts zum Rückgängigmachen' };
    if (!h.matches(this.grid, s, forward)) {
      // Welt hat sich dort inzwischen geändert (z. B. Ausbau der Strecke) – Verlauf ist nicht mehr gültig
      h.clear();
      return { ok: false, text: 'Geht nicht mehr – dort hat sich inzwischen etwas geändert' };
    }
    if (this.trainsOn(h.touched(this.grid, s)).length) return { ok: false, text: 'Geht gerade nicht – ein Zug steht dort' };
    const pay = forward ? s.cost : -s.cost;
    if (pay > 0 && pay > this.money) return { ok: false, text: `Zu wenig Geld (${Math.round(pay).toLocaleString('de-AT')} € nötig)` };
    h.apply(this.grid, s, forward);
    if (forward) h.moveRedone(); else h.moveUndone();
    // als Korrektur der Baukosten buchen, nicht als Einnahme
    this._money -= pay;
    const day = this.today();
    day.expense = Math.max(0, day.expense + pay);
    const c = s.cells[Math.floor(s.cells.length / 2)];
    const at = c ? this.grid.xy(c.k) : undefined;
    if (pay !== 0 && at) this.fx.push({ amount: -pay, x: at.x, y: at.y });
    this.rebuild();
    return { ok: true, text: `${s.label} ${forward ? 'wiederholt' : 'rückgängig'}${pay ? ` · ${pay < 0 ? '+' : '−'}${Math.abs(Math.round(pay)).toLocaleString('de-AT')} €` : ''}` };
  }

  /** Kopieren / Vorlage einfügen (RM-FR-BUILD-13) */
  private planCopy(cells: XY[], variant: string): BuildPlan {
    const g = this.grid;
    const fail = (reason: string, c = cells): BuildPlan => ({ ok: false, cost: 0, reason, cells: c });
    if (!this.unlocked.has('track')) return fail('Noch nicht freigeschaltet');
    if (!cells.length) return fail('');
    if (variant === 'copy') {
      if (!capture(g, cells)) return fail('Hier gibt es nichts Eigenes zum Kopieren (Gleise, Weichen, Signale, Bahnsteige)');
      return { ok: true, cost: 0, cells };
    }
    const t = loadTemplates()[Number(variant.slice(3)) - 1];
    if (!t) return fail('Diese Vorlage ist leer – erst einen Bereich kopieren');
    const area = templateCells(t, cells[0]);
    if (area.some((c) => !g.inside(c.x, c.y))) return fail('Außerhalb der Karte', area);
    if (area.some((c) => !g.isOwned(c.x, c.y))) return fail('Fläche nicht gekauft', area);
    if (area.some((c) => { const cc = g.get(c.x, c.y)!; return cc.piece !== null || cc.platform || (cc.track && !cc.fixed) || (cc.building !== null && !this.clearable(cc.building)); })) return fail('Fläche ist nicht frei', area);
    const cost = templateCost(t);
    return { ok: this.money >= cost, cost, reason: 'Zu wenig Geld', cells: area };
  }

  private buildOnce(tool: ToolId, cells: XY[], variant = ''): BuildPlan {
    const p = this.plan(tool, cells, variant);
    if (!p.ok) return p;
    if (tool === 'copy') {
      if (variant === 'copy') {
        const t = capture(this.grid, cells);
        if (t) { pushTemplate(t); this.addLog(`Bereich kopiert (${t.w}×${t.h}) – jetzt als Vorlage 1 einfügen`, 'info'); }
        return { ...p, cost: 0 };
      }
      const t = loadTemplates()[Number(variant.slice(3)) - 1]!;
      let fails = 0;
      for (const st of pasteSteps(t, cells[0])) if (!this.buildOnce(st.tool, st.cells, st.variant).ok) fails++;
      this.addLog(`Vorlage eingefügt${fails ? ` – ${fails} Teile passten nicht` : ''}`, fails ? 'bad' : 'info');
      return p;
    }
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
        else if (c.road && !c.track && c.piece === null) c.road = false;
        else if (c.siding || c.sortDest !== null) { c.siding = false; c.sortDest = null; }
        else if (c.shunt) c.shunt = false;
        else if (c.piece !== null) g.removePiece(c.piece);
        else if (c.track) { c.track = false; c.wire = false; }
        break;
      }
    }
    this.book('Bau', -(p.cost));
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
    checkForeign(this);
    this.version++;
  }

  /** von der Hauptstrecke aus erreichbare Kanten (je Netz einmal berechnet) */
  private reachCache?: { net: Network; set: Set<Edge> };
  mainReach() {
    if (this.reachCache?.net !== this.net) this.reachCache = { net: this.net, set: this.net.reach(this.net.entries.filter((e) => !e.line).map((e) => e.to)) };
    return this.reachCache.set;
  }

  /** Ladegleis über eigene Gleise mit der Strecke verbunden? */
  industryConnected(id: string) {
    return [...this.mainReach()].some((e) => e.industry === id);
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
