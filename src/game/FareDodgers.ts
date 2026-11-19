import type { Game } from './Game';
import type { Train } from '../sim/Simulation';
import { inspectorBonus, INSPECTORS } from './Staff';

/** Schwarzfahrer und Kontrolle (RM-FR-ECO-13): erst ab der Forschung „Schwarzkappler“ */

export const INSPECTOR_MAX = 4;
export const INSPECTOR_WAGE = 200;
/** erhöhtes Beförderungsentgelt je erwischtem Schwarzfahrer */
export const FINE = 60;
/** Anteil Schwarzfahrer unter den Fahrgästen */
export const DODGE_SHARE = 0.04;

/** Anteil der Schwarzfahrer, die erwischt werden */
export function catchRate(n: number) { return n ? Math.max(0, Math.min(0.95, n * 0.25 + inspectorBonus(n))) : 0; }

/** Halt eines Personenzugs: Schwarzfahrer zählen, Kontrolleure kassieren */
export function inspectTrain(g: Game, t: Train) {
  if (!g.researched('ticket') || !t.passengers) return 0;
  const dodgers = Math.round(t.passengers * DODGE_SHARE * (0.5 + Math.random()));
  const caught = Math.round(dodgers * catchRate(g.inspectors));
  g.stats.dodgers = (g.stats.dodgers ?? 0) + dodgers;
  if (!caught) return 0;
  g.stats.caught = (g.stats.caught ?? 0) + caught;
  g.bump('caught', caught);
  g.book('Kontrolle', caught * FINE);
  if (caught >= 3) g.fx.push({ amount: caught * FINE, x: 0, y: 0, train: t.id, label: `${caught} Schwarzfahrer` });
  return caught;
}

/** Kontrolleure einstellen / entlassen */
export function setInspectors(g: Game, n: number) {
  if (!g.researched('ticket')) return;
  const v = Math.max(0, Math.min(INSPECTOR_MAX, n));
  if (v === g.inspectors) return;
  g.addLog(v > g.inspectors ? `${INSPECTORS[v - 1].name} (${INSPECTORS[v - 1].trait}) als Kontrolleur eingestellt` : `${INSPECTORS[g.inspectors - 1].name} entlassen`, 'info');
  g.inspectors = v;
  g.version++;
}
