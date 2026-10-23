import { MAIN_ROW, SECOND_ROW } from '../config';
import type { ResearchId } from './Research';
import { isStation } from '../world/buildings';
import { PIECES } from '../world/pieces';
import { OPERATORS } from '../sim/Operators';
import type { Game, Stats } from './Game';

export type ToolId = 'select' | 'land' | 'platform' | 'track' | 'signal' | 'switch' | 'curve' | 'diag' | 'wire' | 'access'
  | 'building' | 'facility' | 'remove' | 'research' | 'road';

type XY = { x: number; y: number };

export interface Mission {
  title: string;
  /** eine kurze Zeile */
  short: string;
  reward: number;
  /** Fortschritt 0..1 und Zähler-Text */
  progress: (s: Stats, base: Stats, g: Game) => { value: number; text: string };
  /** Werkzeug (+ Variante), das im Baumenü hervorgehoben wird – darf vom Spielstand abhängen */
  tool?: (g: Game) => { tool: ToolId; variant?: string } | null;
  /** Felder, die auf der Karte markiert werden */
  hint?: (g: Game) => XY[];
  /** beim Start des Auftrags */
  onStart?: (g: Game) => void;
  unlock: ToolId[];
  level: number;
  /** Forschungspunkte als Belohnung */
  fp: number;
  /** Teilschritte als Checkliste (werden abgehakt) */
  checks?: (g: Game, s: Stats, base: Stats) => Check[];
}

export interface Check { label: string; done: boolean }
/** Zähler-Schritt: „3 Züge … (1/3)“ */
const count = (label: string, n: number, of: number): Check => ({ label: `${label} (${Math.min(n, of)}/${of})`, done: n >= of });
const ownSwitch = (g: Game) => [...g.grid.pieces.values()].some((p) => !g.grid.fixedPieces.has(p.id) && PIECES[p.key].group === 'switch');
/** eigene Blocksignale je Richtung (nicht an den Kreuzungsstellen des Netzbetreibers) */
const blockSignals = (g: Game) => {
  let e = false, w = false;
  g.grid.cells.forEach((c, k) => {
    if (!c.signal && !c.signalW) return;
    const p = g.grid.xy(k);
    if (!g.grid.isOwned(p.x, p.y) || g.grid.isLoopCell(p.x, p.y)) return;
    if (c.signal) e = true;
    if (c.signalW) w = true;
  });
  return { e, w, both: e && w };
};

/** 2. Streckengleis auf eigenem Gelände ohne Lücke */
const secondDone = (g: Game) => !Array.from({ length: g.grid.w }, (_, x) => x)
  .some((x) => g.grid.isOwned(x, SECOND_ROW) && !g.grid.get(x, SECOND_ROW)!.track && g.grid.get(x, SECOND_ROW)!.piece === null);
/** Züge vom 2. Gleis kommen an einen Bahnsteig: zwei eigene Gleiswechsel oder Bahnsteig direkt am 2. Gleis */
const hasXovers = (g: Game) => [...g.grid.pieces.values()].filter((p) => !g.grid.fixedPieces.has(p.id) && p.key.startsWith('xover')).length >= 2
  || g.grid.cells.some((c, k) => c.platform && g.grid.xy(k).y === SECOND_ROW + 1);
const hasBuilding = (g: Game, ...keys: string[]) => [...g.grid.buildings.values()].some((b) => keys.includes(b.key));

/** Spannweite der eigenen Fläche entlang der Strecke */
const ownedSpan = (g: Game) => {
  let x0 = Infinity, x1 = -Infinity;
  for (let x = 0; x < g.grid.w; x++) if (g.grid.isOwned(x, MAIN_ROW)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return { x0, x1, cx: Math.round((x0 + x1) / 2) };
};

const platforms = (g: Game) => g.grid.cells.map((c, k) => (c.platform ? g.grid.xy(k) : null)).filter((p): p is XY => !!p);
const research = (id: ResearchId, then: { tool: ToolId; variant?: string } | null) => (g: Game) =>
  (g.researched(id) ? then : { tool: 'research' as ToolId, variant: id });
const hasStation = (g: Game) => [...g.grid.buildings.values()].some((b) => isStation(b.key));

/** so viele Aufträge am Anfang sind das (abwählbare) Tutorial */
export const TUTORIAL_MISSIONS = 6;
/** Stand der Auftragsliste (für alte Spielstände: eingefügte Aufträge) */
export const MISSIONS_VERSION = 2;
const parcels = (g: Game) => g.grid.owned.filter(Boolean).length;

export const MISSIONS: Mission[] = [
  {
    title: 'Bahnhof eröffnen',
    short: 'Bahnsteig + Empfangsgebäude, Vertrag wählen, 3 Regionalzüge halten',
    reward: 2000,
    progress: (s, b) => {
      const n = s.stopsRegio - b.stopsRegio;
      return { value: Math.min(1, n / 3), text: `${Math.min(n, 3)}/3` };
    },
    tool: (g) => (!platforms(g).length ? { tool: 'platform' } : !hasStation(g) ? { tool: 'building', variant: 'bld_station' } : null),
    hint: (g) => {
      const ps = platforms(g);
      if (!ps.length) {
        const { cx } = ownedSpan(g);
        return Array.from({ length: 5 }, (_, i) => ({ x: cx - 2 + i, y: MAIN_ROW - 1 }));
      }
      if (hasStation(g)) return [];
      const top = ps.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
      const out: XY[] = [];
      for (let dy = -2; dy < 0; dy++) for (let dx = 0; dx < 3; dx++) out.push({ x: top.x + dx, y: top.y + dy });
      return out;
    },
    checks: (g, s, b) => [
      { label: 'Bahnsteig bauen', done: platforms(g).length > 0 },
      { label: 'Empfangsgebäude bauen', done: hasStation(g) },
      { label: 'Regional-Unternehmen wählen', done: Object.values(g.contracts).some((c) => c.status === 'active') },
      count('Regionalzüge halten lassen', s.stopsRegio - b.stopsRegio, 3),
    ],
    unlock: ['signal'],
    level: 2,
    fp: 3,
  },
  {
    title: 'Blockabstand',
    short: 'Je ein Signal für beide Fahrtrichtungen hinter den Bahnsteig-Enden setzen, dann 5 Züge in Folge pünktlich',
    reward: 2000,
    progress: (s, _b, g) => {
      if (!blockSignals(g).both) return { value: 0, text: '0/5' };
      // erst ab dem Signal-Bau zählen
      g.missionMark ??= s.handled;
      const n = Math.min(s.streak, s.handled - g.missionMark);
      return { value: Math.min(1, n / 5), text: `${Math.min(n, 5)}/5` };
    },
    tool: (g) => { const b = blockSignals(g); return { tool: 'signal', variant: !b.e ? 'E' : !b.w ? 'W' : undefined }; },
    hint: (g) => {
      const b = blockSignals(g);
      const ps = platforms(g).filter((p) => p.y === MAIN_ROW - 1 || p.y === MAIN_ROW + 1);
      if (!ps.length) return [];
      const x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x));
      // → hinter dem östlichen Bahnsteigende, ← hinter dem westlichen
      if (!b.e) return [{ x: x1 + 2, y: MAIN_ROW }];
      if (!b.w) return [{ x: x0 - 2, y: MAIN_ROW }];
      return [];
    },
    checks: (g, s) => {
      const b = blockSignals(g);
      const n = b.both && g.missionMark !== undefined ? Math.min(s.streak, s.handled - g.missionMark) : 0;
      return [
        { label: 'Signal → (Fahrtrichtung Ost) östlich vom Bahnsteig', done: b.e },
        { label: 'Signal ← (Fahrtrichtung West) westlich vom Bahnsteig', done: b.w },
        count('Züge danach in Folge pünktlich', n, 5),
      ];
    },
    unlock: ['switch', 'track', 'curve', 'diag', 'research'],
    level: 3,
    fp: 5,
  },
  {
    title: 'Erste Forschung',
    short: 'Im Stellwerk-Baum „Treppen für Fortgeschrittene“ erforschen',
    reward: 1000,
    progress: (_s, _b, g) => ({ value: g.researched('access') ? 1 : 0, text: g.researched('access') ? '1/1' : '0/1' }),
    tool: research('access', null),
    unlock: [],
    level: 3,
    fp: 0,
  },
  {
    title: 'Mehr Platz',
    short: 'Mit dem Werkzeug „Land kaufen“ eine gelbe Parzelle neben deinem Gelände kaufen',
    reward: 1500,
    onStart: (g) => { g.missionMark = parcels(g); },
    progress: (_s, _b, g) => {
      g.missionMark ??= parcels(g);
      const n = Math.max(0, parcels(g) - g.missionMark);
      return { value: Math.min(1, n), text: `${Math.min(n, 1)}/1` };
    },
    tool: () => ({ tool: 'land' }),
    checks: (g) => [{ label: 'Eine Parzelle Land kaufen', done: g.missionMark !== undefined && parcels(g) > g.missionMark }],
    unlock: [],
    level: 3,
    fp: 2,
  },
  {
    title: 'Zweites Bahnsteiggleis',
    short: 'Weiche, Gleis, Bahnsteig und Unterführung: auf 2 verschiedenen Gleisen je einen Zug abfertigen',
    reward: 3000,
    progress: (s) => {
      const n = Math.min(2, (s.platformRuns ?? []).length);
      return { value: n / 2, text: `${n}/2` };
    },
    tool: (g) => (g.grid.links.size || !g.grid.pieces.size ? { tool: 'switch' } : { tool: 'access' }),
    checks: (g, s) => [
      { label: 'Weiche bauen', done: ownSwitch(g) },
      { label: 'Zweiten Bahnsteig bauen', done: new Set(platforms(g).map((p) => p.y)).size >= 2 },
      { label: 'Unterführung oder Brücke bauen', done: g.grid.links.size > 0 },
      count('Gleise mit abgefertigtem Zug', (s.platformRuns ?? []).length, 2),
    ],
    unlock: [],
    level: 4,
    fp: 4,
  },
  {
    title: 'Wendezüge',
    short: 'Wendezug-Unternehmen wählen, 3 Wendezüge bei dir wenden lassen (sie wenden direkt am Bahnsteig)',
    reward: 2500,
    progress: (s, b) => {
      const n = s.turnbacks - b.turnbacks;
      return { value: Math.min(1, n / 3), text: `${Math.min(n, 3)}/3` };
    },
    // Wendezüge wenden am Bahnsteig – kein Gleisbau nötig; ohne Vertrag die Ausschreibung erneut zeigen
    tool: () => null,
    onStart: (g) => g.requestTurnback(),
    checks: (g, s, b) => [
      { label: 'Wendezug-Unternehmen wählen', done: Object.values(OPERATORS).some((o) => o.turnback && g.contracts[o.id].status === 'active') },
      count('Wendezüge wenden lassen', s.turnbacks - b.turnbacks, 3),
    ],
    unlock: [],
    level: 4,
    fp: 4,
  },
  {
    title: 'Zweigleisiger Ausbau',
    short: '2. Streckengleis erforschen, anschließen (Linksverkehr), 5 Züge darauf',
    reward: 4000,
    progress: (s, b) => {
      const n = s.secondRuns - b.secondRuns;
      return { value: Math.min(1, n / 5), text: `${Math.min(n, 5)}/5` };
    },
    tool: (g) => !g.researched('double') ? { tool: 'research', variant: 'double' } : !secondDone(g) ? { tool: 'track' }
      : !hasXovers(g) ? { tool: 'switch', variant: 'xover_up' } : null,
    checks: (g, s, b) => [
      { label: '„Doppelt hält besser“ erforschen', done: g.researched('double') },
      { label: '2. Streckengleis durchgehend verlegen', done: g.researched('double') && secondDone(g) },
      { label: 'Gleiswechsel an beiden Bahnhofsenden (oder Bahnsteig am 2. Gleis)', done: hasXovers(g) },
      count('Züge auf dem 2. Gleis', s.secondRuns - b.secondRuns, 5),
    ],
    hint: (g) => {
      const out: XY[] = [];
      if (!g.researched('double')) return out;
      for (let x = 0; x < g.grid.w; x++) {
        const c = g.grid.get(x, SECOND_ROW)!;
        if (g.grid.isOwned(x, SECOND_ROW) && !c.track && c.piece === null) out.push({ x, y: SECOND_ROW });
      }
      return out;
    },
    unlock: [],
    level: 5,
    fp: 6,
  },
  {
    title: 'Abstellanlage',
    short: 'Wendezüge haben jetzt Pause: 3 Züge abstellen (Abstellgleis/Remise)',
    reward: 3000,
    progress: (s, b) => {
      const n = s.parks - b.parks;
      return { value: Math.min(1, n / 3), text: `${Math.min(n, 3)}/3` };
    },
    tool: research('siding', { tool: 'facility', variant: 'mark_siding' }),
    checks: (g, s, b) => [
      { label: '„Parkverbot aufgehoben“ erforschen', done: g.researched('siding') },
      { label: 'Abstellgleis markieren oder Remise bauen', done: g.grid.cells.some((c) => c.siding) || hasBuilding(g, 'bld_remise') },
      count('Züge abstellen', s.parks - b.parks, 3),
    ],
    unlock: [],
    level: 6,
    fp: 5,
  },
  {
    title: 'Saubere Züge',
    short: 'Waschanlage oder Werkstatt bauen: 5 Züge pflegen',
    reward: 4000,
    progress: (s, b) => {
      const n = s.services - b.services;
      return { value: Math.min(1, n / 5), text: `${Math.min(n, 5)}/5` };
    },
    tool: (g) => {
      if (g.researched('wash')) return g.grid.cells.some((c) => c.shunt) ? { tool: 'facility', variant: 'bld_wash' } : { tool: 'facility', variant: 'mark_shunt' };
      if (g.researched('remise')) return { tool: 'facility', variant: 'bld_remise' };
      return { tool: 'research', variant: 'remise' };
    },
    checks: (g, s, b) => [
      { label: '„Schöner Wohnen für Züge“ (Remise) erforschen', done: g.researched('wash') || g.researched('remise') },
      { label: 'Waschanlage (im Rangierbereich), Remise oder Werkstatt bauen', done: hasBuilding(g, 'bld_wash', 'bld_remise', 'bld_workshop') },
      count('Züge pflegen', s.services - b.services, 5),
    ],
    unlock: [],
    level: 6,
    fp: 6,
  },
  {
    title: 'Rangierbahnhof',
    short: 'Abrollberg + Richtungsgleise: 20 Wagen sortiert abfahren lassen',
    reward: 6000,
    progress: (s, b) => {
      const n = s.sortedWagons - b.sortedWagons;
      return { value: Math.min(1, n / 20), text: `${Math.min(n, 20)}/20` };
    },
    tool: research('hump', { tool: 'facility', variant: 'bld_hump' }),
    checks: (g, s, b) => [
      { label: '„Schwerkraft macht\'s“ erforschen', done: g.researched('hump') },
      { label: 'Abrollberg bauen', done: hasBuilding(g, 'bld_hump') },
      { label: 'Richtungsgleise markieren', done: g.grid.cells.some((c) => c.sortDest !== null) },
      count('Wagen sortiert abfahren lassen', s.sortedWagons - b.sortedWagons, 20),
    ],
    unlock: [],
    level: 7,
    fp: 8,
  },
  {
    title: 'Taktknoten',
    short: '18 der letzten 20 Züge pünktlich',
    reward: 6000,
    progress: (s) => {
      const last = s.recent.slice(-20);
      const ok = last.filter(Boolean).length;
      return { value: last.length >= 20 && ok >= 18 ? 1 : Math.min(0.99, ok / 18), text: `${ok}/18` };
    },
    unlock: [],
    level: 8,
    fp: 10,
  },
];

export const FREE_PLAY = {
  title: 'Freies Spiel',
  short: 'Alle Aufträge erledigt – bau weiter, so groß du willst',
};
