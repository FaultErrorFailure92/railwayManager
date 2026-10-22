import { MAIN_ROW, SECOND_ROW } from '../config';
import type { ResearchId } from './Research';
import { isStation } from '../world/buildings';
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
}

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
    unlock: ['signal'],
    level: 2,
    fp: 3,
  },
  {
    title: 'Blockabstand',
    short: 'Signale setzen, 5 Züge in Folge pünktlich',
    reward: 2000,
    progress: (s) => ({ value: Math.min(1, s.streak / 5), text: `${Math.min(s.streak, 5)}/5` }),
    tool: () => ({ tool: 'signal' }),
    hint: (g) => {
      if (g.grid.cells.some((c) => c.signal || c.signalW)) return [];
      const { x0, x1 } = ownedSpan(g);
      return [{ x: x0 + 1, y: MAIN_ROW }, { x: x1 - 1, y: MAIN_ROW }];
    },
    unlock: ['switch', 'track', 'curve', 'diag', 'research'],
    level: 3,
    fp: 5,
  },
  {
    title: 'Erste Forschung',
    short: 'Im Forschungsbaum „Bahnsteigzugänge“ erforschen',
    reward: 1000,
    progress: (_s, _b, g) => ({ value: g.researched('access') ? 1 : 0, text: g.researched('access') ? '1/1' : '0/1' }),
    tool: research('access', null),
    unlock: [],
    level: 3,
    fp: 0,
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
    unlock: [],
    level: 4,
    fp: 4,
  },
  {
    title: 'Wendezüge',
    short: 'Wendezug-Unternehmen wählen, 3 Wendezüge bei dir wenden lassen',
    reward: 2500,
    progress: (s, b) => {
      const n = s.turnbacks - b.turnbacks;
      return { value: Math.min(1, n / 3), text: `${Math.min(n, 3)}/3` };
    },
    tool: () => ({ tool: 'track' }),
    onStart: (g) => g.requestTurnback(),
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
    tool: research('double', { tool: 'track' }),
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
    tool: (g) => (g.researched('wash') || g.researched('remise') ? { tool: 'facility', variant: g.researched('wash') ? 'bld_wash' : 'bld_remise' }
      : { tool: 'research', variant: 'wash' }),
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
