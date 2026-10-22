import { TILE } from '../config';

export type OperatorId = 'ro' | 'wx' | 'cd' | 'sb' | 'rx' | 'nj' | 'tx' | 'dm' | 'cs' | 'lb' | 'hv' | 'hs';
export type TrainKind = 'regio' | 'ic' | 'freight' | 'sbahn' | 'night' | 'museum' | 'sort';
export type Traction = 'electric' | 'diesel' | 'steam';

export interface Operator {
  id: OperatorId;
  name: string;
  /** Zuggattung für die Anzeige */
  category: string;
  short: string;
  color: string;
  kind: TrainKind;
  /** Wagenfolge ab Zugspitze (Sprite-Arten), kurzer Zug */
  cars: string[];
  /** langer Zug (Verstärkung) und wie oft er fährt */
  long?: string[];
  longShare?: number;
  /** Höchstgeschwindigkeit in Einheiten/Spielsekunde */
  vmax: number;
  needsStop: boolean;
  /** Wendezug: hält, wechselt die Richtung und fährt zurück */
  turnback?: boolean;
  /** Antrieb: Elektrozüge brauchen Oberleitung */
  traction: Traction;
  /** Wendezeit in Minuten (von–bis), sobald Abstellanlagen im Spiel sind */
  layover?: [number, number];
  /** fährt nur in diesen Stunden (z.B. Nachtzug 21–5 Uhr) */
  hours?: [number, number];
  /** Mindesthaltezeit in Spielsekunden */
  dwell: number;
  /** Erlös bei pünktlicher Abfertigung (Basis) */
  fee: number;
  /** Fahrgäste von–bis */
  pax: [number, number];
  numberBase: number;
  /** gewünschter Takt im Vertragsangebot (Minuten) */
  takt: number;
  /** maximale Zahl Wagen (ohne Lok) bei langen Bahnsteigen */
  maxCoaches?: number;
}

const tpm = (t: number) => (t * TILE) / 60;

export const OPERATORS: Record<OperatorId, Operator> = {
  ro: {
    takt: 60, id: 'ro', name: 'Regionalbahn Ost', category: 'Regionalzug', short: 'R', color: '#c4342f', kind: 'regio',
    cars: ['loco', 'coach', 'coach'], long: ['loco', 'coach', 'coach', 'coach', 'coach'], longShare: 0.35, traction: 'diesel', vmax: tpm(18), needsStop: true, dwell: 60, fee: 120, pax: [40, 160], numberBase: 2000,
  },
  wx: {
    takt: 120, id: 'wx', name: 'WestExpress', category: 'Fernzug', short: 'WX', color: '#2456aa', kind: 'ic',
    cars: ['loco', 'coach', 'coach', 'coach'], long: ['loco', 'coach', 'coach', 'coach', 'coach', 'coach'], longShare: 0.5, traction: 'electric', vmax: tpm(24), needsStop: true, dwell: 90, fee: 300, pax: [120, 400], numberBase: 500,
  },
  cd: {
    takt: 90, id: 'cd', name: 'Cargo Danubia', category: 'Containerzug', short: 'CD', color: '#e88a24', kind: 'freight',
    cars: ['loco', 'wagon', 'wagon', 'wagon'], long: ['loco', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon'], longShare: 0.5, traction: 'electric', vmax: tpm(14), needsStop: false, dwell: 0, fee: 150, pax: [0, 0], numberBase: 47000,
  },
  sb: {
    takt: 60, id: 'sb', name: 'S-Bahn Donaustadt', category: 'S-Bahn (Wendezug)', short: 'S', color: '#1f9fa8', kind: 'sbahn',
    cars: ['emu', 'emu'], long: ['emu', 'emu', 'emu', 'emu'], longShare: 0.3, traction: 'electric', vmax: tpm(18), needsStop: true, turnback: true, layover: [18, 30], dwell: 50, fee: 110, pax: [60, 180], numberBase: 3100,
  },
  rx: {
    takt: 90, id: 'rx', name: 'Waldviertel Express', category: 'REX-Wendezug', short: 'REX', color: '#3f8f3a', kind: 'regio',
    cars: ['loco', 'coach', 'cab'], long: ['loco', 'coach', 'coach', 'coach', 'cab'], longShare: 0.4, traction: 'electric', vmax: tpm(20), needsStop: true, turnback: true, layover: [25, 40], dwell: 70, fee: 190, pax: [80, 240], numberBase: 1700,
  },
  nj: {
    takt: 120, id: 'nj', name: 'Nachtschiene', category: 'Nachtzug', short: 'NS', color: '#3b3f8c', kind: 'night',
    cars: ['loco', 'coach', 'coach', 'coach'], long: ['loco', 'coach', 'coach', 'coach', 'coach', 'coach'], longShare: 0.6, traction: 'electric', vmax: tpm(22), needsStop: true, hours: [21, 5],
    dwell: 120, fee: 420, pax: [80, 260], numberBase: 460,
  },
  tx: {
    takt: 120, id: 'tx', name: 'TransAlp Logistik', category: 'Kesselwagenzug', short: 'TX', color: '#d9b62a', kind: 'freight',
    cars: ['loco', 'tank', 'tank', 'tank'], long: ['loco', 'tank', 'tank', 'tank', 'tank', 'tank', 'tank'], longShare: 0.5, traction: 'diesel', vmax: tpm(12), needsStop: false, dwell: 0, fee: 190, pax: [0, 0], numberBase: 54000,
  },
  dm: {
    takt: 120, id: 'dm', name: 'Dampfbahn Wachau', category: 'Museumszug', short: 'D', color: '#7a2a24', kind: 'museum',
    cars: ['steam', 'coach', 'coach'], long: ['steam', 'coach', 'coach', 'coach', 'coach'], longShare: 0.3, traction: 'steam', vmax: tpm(10), needsStop: true, dwell: 150, fee: 380, pax: [100, 220], numberBase: 9100,
  },
  cs: {
    takt: 90, id: 'cs', name: 'Cargo Danubia Rangier', category: 'Zerlegezug (Abrollberg)', short: 'CDR', color: '#9c4a2c', kind: 'sort',
    cars: ['loco', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon'], traction: 'diesel', vmax: tpm(12),
    needsStop: false, dwell: 0, fee: 0, pax: [0, 0], numberBase: 61000,
  },
  lb: {
    takt: 60, id: 'lb', name: 'Weinviertler Landesbahn', category: 'Pendelzug (Wendezug)', short: 'LB', color: '#2f7fb8', kind: 'regio',
    cars: ['loco', 'coach', 'cab'], long: ['loco', 'coach', 'coach', 'coach', 'cab'], longShare: 0.3, traction: 'diesel', vmax: tpm(17), needsStop: true,
    turnback: true, layover: [20, 35], dwell: 60, fee: 130, pax: [50, 170], numberBase: 4200,
  },
  hv: {
    takt: 120, id: 'hv', name: 'Holzbahn Waldviertel', category: 'Holzzug', short: 'HB', color: '#8a5a2c', kind: 'freight',
    cars: ['loco', 'wagon', 'wagon', 'wagon'], long: ['loco', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon', 'wagon'], longShare: 0.4, traction: 'diesel', vmax: tpm(11),
    needsStop: false, dwell: 0, fee: 160, pax: [0, 0], numberBase: 58000,
  },
  hs: {
    takt: 120, id: 'hs', name: 'Donau-Sprinter', category: 'Hochgeschwindigkeits-Triebzug', short: 'DS', color: '#c8102e', kind: 'ic',
    cars: ['pcar', 'coach', 'coach', 'coach', 'pcar'], long: ['pcar', 'coach', 'coach', 'coach', 'coach', 'coach', 'coach', 'pcar'], longShare: 0.5,
    traction: 'electric', vmax: tpm(30), needsStop: true, turnback: true, layover: [20, 35], dwell: 90, fee: 450, pax: [180, 520], numberBase: 70,
  },
};

/** Zielrichtungen im Rangierbahnhof (Wagenfarbe = Ziel) */
export const SORT_DESTS = [
  { name: 'Nord', color: '#3460a0' },
  { name: 'Süd', color: '#aa3c32' },
  { name: 'West', color: '#46825a' },
];

const T = (t: Partial<Record<OperatorId, number>>): Record<OperatorId, number> =>
  ({ ro: 0, wx: 0, cd: 0, sb: 0, rx: 0, nj: 0, tx: 0, dm: 0, cs: 0, lb: 0, hv: 0, hs: 0, ...t });

/** alter Takt je Stufe – nur noch für alte Spielstände (Verträge übernehmen) */
export const TAKT: Record<number, Record<OperatorId, number>> = {
  1: T({ ro: 30, cd: 60 }),
  2: T({ ro: 20, cd: 30 }),
  3: T({ ro: 15, wx: 30, cd: 30 }),
  4: T({ ro: 15, wx: 30, cd: 30, sb: 20 }),
  5: T({ ro: 15, wx: 30, cd: 30, sb: 20, rx: 40, tx: 45, nj: 60 }),
  6: T({ ro: 15, wx: 30, cd: 30, sb: 20, rx: 40, tx: 45, nj: 60 }),
  7: T({ ro: 15, wx: 30, cd: 40, sb: 20, rx: 40, tx: 45, nj: 60, cs: 45 }),
  8: T({ ro: 10, wx: 20, cd: 30, sb: 15, rx: 30, tx: 40, nj: 60, dm: 120, cs: 40 }),
};

/** ab dieser Stufe haben Wendezüge Wendezeit (brauchen Abstellgleise) */
export const LAYOVER_LEVEL = 6;

/** liegt die Stunde im Betriebsfenster? */
export const inHours = (op: Operator, t: number) => {
  if (!op.hours) return true;
  const h = Math.floor(t / 3600) % 24;
  const [a, b] = op.hours;
  return a <= b ? h >= a && h < b : h >= a || h < b;
};

/** Verkehrsart für Verträge */
export type TrafficClass = 'regional' | 'fern' | 'gueter';
export const TRAFFIC_LABEL: Record<TrafficClass, string> = { regional: 'Regionalverkehr', fern: 'Fernverkehr', gueter: 'Güterverkehr' };
export const trafficClass = (op: Operator): TrafficClass =>
  op.kind === 'ic' || op.kind === 'night' ? 'fern' : op.kind === 'freight' || op.kind === 'sort' ? 'gueter' : 'regional';
/** langer Zug ab so vielen Fahrzeugen */
export const LONG_TRAIN_CARS = 5;
