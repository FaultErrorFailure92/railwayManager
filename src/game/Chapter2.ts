import { SECOND_ROW } from '../config';
import { OPERATORS } from '../sim/Operators';
import { isStation } from '../world/buildings';
import type { Game, Stats } from './Game';
import type { Check, Mission } from './Missions';

/** Kapitel 2 „Pannonische Ebene“: Güter und Takt (RM-FR-MODE-02) */

const count = (label: string, n: number, of: number): Check => ({ label: `${label} (${Math.min(n, of)}/${of})`, done: n >= of });
const freightHandled = (s: Stats) => Object.entries(s.opStats ?? {})
  .filter(([id]) => OPERATORS[id as keyof typeof OPERATORS]?.kind === 'freight').reduce((a, [, v]) => a + v.handled, 0);
const active = (g: Game) => Object.entries(g.contracts).filter(([, c]) => c.status === 'active');
const fromChecks = (checks: Check[]) => {
  const n = checks.filter((c) => c.done).length;
  return { value: n === checks.length ? 1 : n / checks.length, text: `${n}/${checks.length}` };
};

const stationChecks = (g: Game): Check[] => [
  { label: 'Bahnhof mit Bahnsteig und Empfangsgebäude', done: [...g.grid.buildings.values()].some((b) => isStation(b.key)) && g.grid.cells.some((c) => c.platform) },
  { label: 'Vertrag mit einem Personen-Unternehmen', done: active(g).some(([id]) => OPERATORS[id as keyof typeof OPERATORS].needsStop) },
  { label: 'Vertrag mit einem Güter-Unternehmen', done: active(g).some(([id]) => OPERATORS[id as keyof typeof OPERATORS].kind === 'freight') },
];
const taktChecks = (g: Game): Check[] => [
  { label: '2. Streckengleis durchgehend', done: g.grid.mainRows.includes(SECOND_ROW) },
  count('Unternehmen im 30-min-Takt oder dichter', active(g).filter(([, c]) => c.takt <= 30).length, 2),
];

export const CHAPTER2_MISSIONS: Mission[] = [
  {
    title: 'Ankommen in der Ebene',
    short: 'Bahnhof bauen, je ein Personen- und Güterunternehmen unter Vertrag',
    reward: 3000,
    progress: (_s, _b, g) => fromChecks(stationChecks(g)),
    checks: (g) => stationChecks(g),
    unlock: [],
    level: 6,
    fp: 6,
  },
  {
    title: 'Die Rüben rollen',
    short: '15 Güterzüge pünktlich durch den Bahnhof',
    reward: 4000,
    progress: (s, b) => {
      const n = freightHandled(s) - freightHandled(b);
      return { value: Math.min(1, n / 15), text: `${Math.min(n, 15)}/15` };
    },
    checks: (_g, s, b) => [count('Güterzüge abgefertigt', freightHandled(s) - freightHandled(b), 15)],
    unlock: [],
    level: 6,
    fp: 6,
  },
  {
    title: 'Dichter Takt',
    short: 'Zweigleisig ausbauen, zwei Unternehmen im 30-min-Takt',
    reward: 6000,
    progress: (_s, _b, g) => fromChecks(taktChecks(g)),
    checks: (g) => taktChecks(g),
    unlock: [],
    level: 7,
    fp: 8,
  },
  {
    title: 'Umsteigen in Rübenau',
    short: '15 Anschlüsse erreicht',
    reward: 5000,
    progress: (s, b) => {
      const n = (s.connOk ?? 0) - (b.connOk ?? 0);
      return { value: Math.min(1, n / 15), text: `${Math.min(n, 15)}/15` };
    },
    checks: (_g, s, b) => [count('Anschlüsse erreicht', (s.connOk ?? 0) - (b.connOk ?? 0), 15)],
    unlock: [],
    level: 7,
    fp: 8,
  },
  {
    title: 'Taktfahrplan',
    short: '18 der letzten 20 Züge pünktlich',
    reward: 8000,
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

/** Brief zum Start von Kapitel 2 */
export function chapter2Letter(salutation: string) {
  return {
    title: 'Kapitel 2: Pannonische Ebene',
    text: `<p>${salutation}</p><p>nach dem Donautal vertraut Ihnen der Vorstand die <b>Pannonische Ebene</b> an: flaches Land, Rübenfelder, Pendler nach Wien und Bratislava – und Güterzüge, die im Takt kommen wollen.</p>`
      + '<p>Alle Werkzeuge aus dem Donautal stehen Ihnen zur Verfügung. Die Forschung beginnt wieder von vorn – die Kollegen hier haben ihre eigenen Vorstellungen.</p>',
  };
}
