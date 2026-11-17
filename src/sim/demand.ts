/**
 * Fahrgäste nach Tageszeit (RM-FR-ECO-08): Stoßzeiten morgens und abends, ruhige Nächte.
 * Pendler (Regional, S-Bahn) schwanken stark, Fernverkehr schwächer. Über den Tag gemittelt bleibt die Fahrgastzahl etwa gleich.
 * In der Stoßzeit kosten Verspätungen mehr, und die Unternehmen schicken Verstärkerzüge.
 */
import type { Operator } from './Operators';

const hourOf = (t: number) => ((t / 3600) % 24 + 24) % 24;

export const isCommuter = (op: Operator) => op.kind === 'regio' || op.kind === 'sbahn';

/** Stoßzeit: 6–9 Uhr und 16–19 Uhr */
export function rush(t: number): 'morgens' | 'abends' | null {
  const h = hourOf(t);
  if (h >= 6 && h < 9) return 'morgens';
  if (h >= 16 && h < 19) return 'abends';
  return null;
}

/** Faktor auf die Fahrgäste eines Zuges, der zu dieser Zeit ankommt */
export function dayPax(op: Operator, t: number): number {
  if (op.special) return 1;
  const h = hourOf(t);
  if (isCommuter(op)) {
    if (rush(t)) return 1.5;
    if (h >= 9 && h < 16) return 0.9;
    if (h >= 19 && h < 22) return 0.7;
    if (h >= 5 && h < 6) return 0.7;
    return 0.35;
  }
  if (op.kind === 'ic') {
    if (rush(t)) return 1.15;
    if (h >= 9 && h < 19) return 1;
    if (h >= 19 && h < 22) return 0.85;
    return 0.5;
  }
  if (op.kind === 'museum') return h >= 10 && h < 17 ? 1.2 : 0.6;
  return 1;
}

/** Verspätungen in der Stoßzeit ärgern Pendler mehr: Faktor auf die Strafe */
export const rushPenalty = (op: Operator, t: number) => (isCommuter(op) && rush(t) ? 1.5 : 1);

/** ab diesem Takt (Minuten) gibt es Verstärkerzüge */
export const BOOST_MIN_TAKT = 30;

/** Kann das Unternehmen Verstärkerzüge schicken? (Pendler, mindestens 30-Minuten-Takt) */
export const canBoost = (op: Operator, takt: number) => isCommuter(op) && !op.special && takt >= BOOST_MIN_TAKT;

/** Zeit eines Verstärkerzugs zwischen zwei Regelzügen (oder null) */
export function boostAt(op: Operator, at: number, takt: number): number | null {
  if (!canBoost(op, takt)) return null;
  const t = at + (takt * 60) / 2;
  return rush(t) ? t : null;
}
