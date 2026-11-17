/**
 * Bahnhofsstufen (RM-FR-PROG-08): Haltepunkt → Bahnhof → Knotenbahnhof → Hauptbahnhof.
 * Abhängig von Größe (Bahnsteigkanten), Verkehr (Züge am Tag, Verträge) und Bewertung.
 * Jede Stufe schaltet einen dauerhaften Vorteil frei und wird mit einem Brief gefeiert. Eine Stufe geht nie verloren.
 */
import type { Game } from './Game';
import { OPERATORS, type OperatorId } from '../sim/Operators';

export interface Tier {
  name: string;
  /** Bedingungen für diese Stufe (keine für den Haltepunkt) */
  need?: { runs: number; trains: number; stars: number; contracts: number; station3?: boolean };
  /** dauerhafter Vorteil */
  bonus: { pax: number; fair: number };
  /** einmalige Belohnung beim Erreichen */
  reward?: { money: number; fp: number };
  unlock: string;
}

export const TIERS: Tier[] = [
  { name: 'Haltepunkt', bonus: { pax: 0, fair: 0 }, unlock: 'Ein Bahnsteig, ein Schild – der Anfang.' },
  { name: 'Bahnhof', need: { runs: 2, trains: 30, stars: 3, contracts: 2 }, bonus: { pax: 0.05, fair: 0 }, reward: { money: 3000, fp: 3 },
    unlock: '+5 % Fahrgäste' },
  { name: 'Knotenbahnhof', need: { runs: 3, trains: 70, stars: 4, contracts: 4 }, bonus: { pax: 0.1, fair: 0.05 }, reward: { money: 8000, fp: 6 },
    unlock: '+10 % Fahrgäste, Unternehmen zahlen 5 % mehr' },
  { name: 'Hauptbahnhof', need: { runs: 4, trains: 120, stars: 4, contracts: 6, station3: true }, bonus: { pax: 0.15, fair: 0.1 }, reward: { money: 20000, fp: 10 },
    unlock: '+15 % Fahrgäste, Unternehmen zahlen 10 % mehr, Name mit „Hbf“' },
];

export interface Check { label: string; ok: boolean; have: string; need: string }

/** Kennzahlen für die Stufen */
export function tierMetrics(g: Game) {
  const day = Math.floor(g.sim.time / 86400);
  const handled = (d: number) => g.history.find((h) => h.day === d)?.handled ?? 0;
  return {
    runs: g.platformRuns().length,
    trains: Math.max(handled(day), handled(day - 1)),
    stars: g.rating.stars,
    contracts: (Object.keys(OPERATORS) as OperatorId[]).filter((id) => g.contracts[id].status === 'active' && OPERATORS[id].needsStop).length,
    station3: g.stations().some((b) => b.key === 'bld_station3'),
  };
}

/** Bedingungen der Stufe i mit aktuellem Stand */
export function tierChecks(g: Game, i: number): Check[] {
  const n = TIERS[i]?.need;
  if (!n) return [];
  const m = tierMetrics(g);
  const out: Check[] = [
    { label: 'Bahnsteigkanten', ok: m.runs >= n.runs, have: String(m.runs), need: String(n.runs) },
    { label: 'Züge an einem Tag', ok: m.trains >= n.trains, have: String(m.trains), need: String(n.trains) },
    { label: 'Bewertung', ok: m.stars >= n.stars, have: `${m.stars} ★`, need: `${n.stars} ★` },
    { label: 'Verträge mit Halt', ok: m.contracts >= n.contracts, have: String(m.contracts), need: String(n.contracts) },
  ];
  if (n.station3) out.push({ label: 'Empfangsgebäude voll ausgebaut', ok: m.station3, have: m.station3 ? 'ja' : 'nein', need: 'ja' });
  return out;
}

/** Bonus der aktuellen Stufe */
export const tierBonus = (g: Game) => TIERS[g.tier].bonus;
