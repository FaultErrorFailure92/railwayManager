import { OPERATORS, type OperatorId } from '../sim/Operators';
import type { Game } from './Game';
import { systemOn } from './Systems';
import type { Problem } from './Problems';

/**
 * Fremdbahnen (RM-FR-MAP-09, RM-FR-PROG-06): fremde Strecken, die im Bogen nahe an deinem Bahnhof vorbeiführen.
 * Ohne Vertrag fahren ihre Züge nur als Kulisse vorbei. Ist die Strecke mit deinen Gleisen verbunden und ein
 * Anschluss erforscht, ruft der Betreiber an: Anschlussvertrag mit Halt bei dir oder Durchfahrt über deine Gleise.
 */

export type ForeignMode = 'stop' | 'through';

/** ohne Vertrag fahren die Züge der Fremdbahn nur alle so viele Minuten vorbei (Kulisse) */
export const FOREIGN_DECO_TAKT = 180;
/** Durchfahrt zahlt diesen Anteil des Vertragspreises (Trasse statt Halt) */
export const THROUGH_SHARE = 0.6;
/** Gebühren-Forschung „Trassenpreis-Tango“ */
export const FEE_BONUS = 1.25;

/** Fremdbahn-Unternehmen dieser Karte (nur Strecken, die auch liegen) */
export const foreignOps = (g: Game): OperatorId[] => (systemOn(g, 'foreign') ? g.grid.foreignLaid.map((l) => l.op) : []);

/** erforschte Anschlüsse (je Forschung einer) */
export function foreignSlots(g: Game) {
  return (g.researched('link1') ? 1 : 0) + (g.researched('link2') ? 1 : 0);
}

/** Fremdbahnen mit laufendem Vertrag */
export const activeForeign = (g: Game) => foreignOps(g).filter((op) => g.contracts[op].status === 'active');

/**
 * Fremdbahn angeschlossen? Entweder führt ein Weg von ihrer Strecke auf deine Gleise (Weiche),
 * oder an ihrer Strecke liegt ein Bahnsteig mit Zugang (eigener Haltepunkt).
 */
export function foreignConnected(g: Game, op: OperatorId) {
  const grid = g.grid;
  if (g.net.runs.some((r) => r.accessible && grid.foreignCells.get(grid.key(r.x0, r.row)) === op)) return true;
  return [...g.net.reach(g.net.entries.filter((en) => en.line === op).map((en) => en.to))].some((e) => e.cells.length > 0 && !g.sim.onLine(e, op));
}

/** Warum (noch) kein Anschlussvertrag möglich ist – sonst null */
export function foreignBlock(g: Game, op: OperatorId): string | null {
  if (!foreignConnected(g, op)) return 'Strecke noch nicht angeschlossen (Weiche zu deinen Gleisen oder Bahnsteig an der Strecke)';
  if (g.contracts[op].status === 'active') return null;
  const slots = foreignSlots(g);
  if (!slots) return 'Erst „Formular A38“ erforschen (Anschlussfragen)';
  if (activeForeign(g).length >= slots) return 'Alle erforschten Anschlüsse sind belegt';
  return null;
}

/** Fahrgäste kommen von der Fremdbahn und steigen um: Bonus auf alle Fahrgastzahlen */
export function foreignPaxBonus(g: Game) {
  const n = activeForeign(g).filter((op) => (g.contracts[op].mode ?? 'stop') === 'stop').length;
  return n * (g.researched('linkPax') ? 0.1 : 0.05);
}

/** Preisfaktor für einen Fremdbahn-Zug */
export function foreignFeeFactor(g: Game, via: boolean) {
  return (via ? THROUGH_SHARE : 1) * (g.researched('linkFee') ? FEE_BONUS : 1);
}

/** bereits gemeldete Hinweise (nicht gespeichert): nur einmal je Verbindung */
const hinted = new WeakMap<Game, Set<string>>();

/** nach jedem Umbau und stündlich: Anschluss erkennen, Anruf auslösen oder Vertrag beenden */
export function checkForeign(g: Game) {
  const seen = hinted.get(g) ?? new Set<string>();
  hinted.set(g, seen);
  for (const op of foreignOps(g)) {
    const c = g.contracts[op];
    const name = OPERATORS[op].name;
    const on = foreignConnected(g, op);
    if (!on) {
      seen.delete(op);
      if (c.status === 'active') {
        c.status = 'none';
        g.sim.retime(op);
        g.addLog(`${name}: Anschluss unterbrochen – Züge fahren wieder nur auf ihrer Strecke`, 'bad');
      }
      continue;
    }
    if (c.status === 'active') continue;
    const block = foreignBlock(g, op);
    if (block) {
      if (!seen.has(op)) { seen.add(op); g.addLog(`${name} ist angeschlossen – ${block}`, 'info'); }
      continue;
    }
    if ((c.declinedUntil ?? 0) > g.sim.time || g.offers.open || g.sim.time < c.talkAfter) continue;
    const key = `ask:${op}`;
    g.offers.done = g.offers.done.filter((k) => k !== key);
    g.openOffer({ kind: 'inquiry', title: 'Anschlussvertrag', text: `${name} möchte bei dir anschließen.`, ops: [op] }, key);
  }
}

/** „Was ist los?“ (RM-FR-CPX-03/07): Anschluss ohne Forschung, Züge erreichen den Bahnsteig nicht */
export function foreignProblems(g: Game): Problem[] {
  const out: Problem[] = [];
  for (const op of foreignOps(g)) {
    const name = OPERATORS[op].name, c = g.contracts[op];
    if (c.status !== 'active') {
      if (!foreignConnected(g, op)) continue;
      const block = foreignBlock(g, op);
      if (block) out.push({ id: `fl${op}`, level: 'info', text: `${name} ist angeschlossen – ${block}.`, fix: { label: 'Forschung öffnen', ui: 'research' } });
      continue;
    }
    for (const dir of ['E', 'W'] as const) {
      const at = g.sim.foreignMissed.get(`${op}:${dir}`);
      if (at === undefined || g.sim.time - at > 3 * 3600) continue;
      out.push({ id: `flm${op}${dir}`, level: 'gelb',
        text: `${name}: Züge aus ${dir === 'E' ? 'Westen' : 'Osten'} kommen nicht zu deinem Bahnsteig und fahren ohne Halt vorbei – eine Weiche in diese Richtung fehlt.`,
        fix: { label: 'Verträge ansehen', ui: 'contracts' } });
    }
  }
  return out;
}

/** Halten ↔ Durchfahren (Durchfahrt braucht die Forschung „Freie Fahrt“) */
export function toggleForeignMode(g: Game, op: OperatorId) {
  const c = g.contracts[op];
  if (!OPERATORS[op].foreign) return false;
  const next: ForeignMode = (c.mode ?? 'stop') === 'stop' ? 'through' : 'stop';
  if (next === 'through' && !g.researched('linkThru')) return false;
  c.mode = next;
  g.sim.recontract(op);
  g.addLog(`${OPERATORS[op].name}: ${next === 'stop' ? 'Züge halten jetzt bei dir' : 'Züge fahren jetzt ohne Halt über deine Gleise'}`, 'info');
  return true;
}
