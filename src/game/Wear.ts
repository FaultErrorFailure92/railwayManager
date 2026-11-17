/**
 * Abnutzung von Weichen und Signalen (für RM-FR-UI-12 Ebene „Instandhaltung“).
 * Jede Zugfahrt nutzt ein Element etwas ab. Abgenutzte Elemente fallen öfter aus.
 * Instandhalter warten stündlich die am stärksten abgenutzten Elemente; von Hand geht es gegen Geld.
 */
import type { Game } from './Game';
import { PIECES } from '../world/pieces';

/** Abnutzung je Zugfahrt in Prozent */
export const WEAR_PER_PASS = 0.4;
/** ab hier gilt ein Element als „abgenutzt“ */
export const WORN = 70;
/** vorbeugende Wartung von Hand */
export const MAINT_COST = 120;

export interface Element { k: number; kind: 'switch' | 'signal' }

let cache: { v: number; list: Element[] } | null = null;
const last = new Map<number, number>();

/** eigene Weichen (Mittelfeld) und Signale */
export function elements(g: Game): Element[] {
  if (cache && cache.v === g.version) return cache.list;
  const gr = g.grid;
  const list: Element[] = [];
  for (const p of gr.pieces.values()) {
    if (gr.fixedPieces.has(p.id) || PIECES[p.key].group !== 'switch') continue;
    const cells = gr.pieceCells(p);
    list.push({ k: cells[Math.floor(cells.length / 2)], kind: 'switch' });
  }
  gr.cells.forEach((c, k) => {
    if ((c.signal || c.signalW) && !c.fixed) { const { x, y } = gr.xy(k); if (gr.isOwned(x, y)) list.push({ k, kind: 'signal' }); }
  });
  cache = { v: g.version, list };
  return list;
}

export const wearOf = (g: Game, k: number) => g.wear[k] ?? 0;

/** jede neue Zugbelegung eines Elements nutzt es ab */
export function tickWear(g: Game) {
  const own = g.sim.owner;
  const f = WEAR_PER_PASS * (g.researched('crew2') ? 0.7 : 1);
  for (const e of elements(g)) {
    const o = own[e.k];
    if (o && o !== last.get(e.k)) g.wear[e.k] = Math.min(100, wearOf(g, e.k) + f);
    last.set(e.k, o);
  }
}

/** Faktor für die Ausfallwahrscheinlichkeit: frisch 0,3 · halb abgenutzt 1 · ganz abgenutzt 1,7 */
export function faultFactor(g: Game) {
  const list = elements(g);
  if (!list.length) return 1;
  const avg = list.reduce((a, e) => a + wearOf(g, e.k), 0) / list.length;
  return 0.3 + (1.4 * avg) / 100;
}

/** Element für eine Störung wählen – abgenutzte deutlich öfter */
export function pickWeighted<T extends { k: number }>(g: Game, cand: T[]): T {
  const w = cand.map((c) => 5 + wearOf(g, c.k));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
  return cand[cand.length - 1];
}

/** stündlich: jeder Instandhalter wartet ein stark abgenutztes Element */
export function crewMaintain(g: Game) {
  if (!g.crew) return 0;
  const worn = elements(g).filter((e) => wearOf(g, e.k) >= 50).sort((a, b) => wearOf(g, b.k) - wearOf(g, a.k)).slice(0, g.crew);
  for (const e of worn) g.wear[e.k] = 0;
  return worn.length;
}

/** stark abgenutzte Elemente */
export const wornElements = (g: Game) => elements(g).filter((e) => wearOf(g, e.k) >= WORN);

/** von Hand vorbeugend warten */
export function maintain(g: Game, k: number) {
  if (g.money < MAINT_COST) return false;
  g.book('Instandhaltung', -(MAINT_COST));
  g.wear[k] = 0;
  return true;
}
