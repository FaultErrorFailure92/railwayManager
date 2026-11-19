import type { Game } from './Game';
import type { Train } from '../sim/Simulation';

/** Stammgäste (RM-FR-EVT-07): fahren jeden Tag zur selben Zeit und schreiben Briefe */

export interface Regular { id: string; name: string; who: string; hour: number; seed: number }
export interface RegularState { good: number; bad: number; day: number }

export const REGULARS: Regular[] = [
  { id: 'huber', name: 'Frau Huber', who: 'Pendlerin, nimmt immer den Zug kurz nach 7', hour: 7, seed: 41 },
  { id: 'novak', name: 'Herr Novak', who: 'Schichtarbeiter, fährt um 5 zur Arbeit', hour: 5, seed: 42 },
  { id: 'gertrude', name: 'Oma Gertrude', who: 'besucht vormittags ihre Enkel', hour: 10, seed: 43 },
  { id: 'lena', name: 'Lena (17)', who: 'fährt nach der Schule heim', hour: 13, seed: 44 },
  { id: 'ober', name: 'Hofrat a. D. Oberhuber', who: 'fährt abends ins Theater', hour: 18, seed: 45 },
];

/** Halt eines Personenzugs: passt er zu einem Stammgast? */
export function regularsOnStop(g: Game, t: Train, punctual: boolean) {
  if (!t.op.needsStop || !t.passengers || t.op.kind === 'freight') return;
  const hour = Math.floor((g.sim.stationTimes(t).arr % 86400) / 3600);
  const day = Math.floor(g.sim.time / 86400);
  for (const r of REGULARS) {
    if (r.hour !== hour) continue;
    const s = (g.regulars[r.id] ??= { good: 0, bad: 0, day: -1 });
    if (s.day === day) continue; // einmal am Tag
    s.day = day;
    if (punctual) s.good++; else s.bad++;
    const from = { name: r.name, role: r.who, org: 'Fahrgast', seed: r.seed };
    if (s.good >= 5) {
      s.good = 0; s.bad = 0;
      g.book('Prämien', 200);
      g.uiEvents.push({ type: 'letter', mood: 'good', from, title: `${r.name} bedankt sich`,
        text: `<p>Liebes Bahnhofsteam,</p><p>seit Tagen komme ich pünktlich an – das hat es hier noch nie gegeben! Anbei ein kleines Trinkgeld für die Kaffeekassa (200 €).</p><p>Herzlich, ${r.name}</p>` });
    } else if (s.bad >= 2) {
      s.good = 0; s.bad = 0;
      for (const o of g.activeOperators()) if (o.id === t.op.id) g.satisfaction[o.id] = Math.max(0, g.satisfaction[o.id] - 3);
      g.uiEvents.push({ type: 'letter', mood: 'bad', from, title: `Beschwerde von ${r.name}`,
        text: `<p>Sehr geehrte Damen und Herren,</p><p>schon wieder hatte mein Zug um ${hour} Uhr Verspätung. Ich überlege ernsthaft, aufs Auto umzusteigen. Ich habe mich auch bei ${t.op.name} beschwert.</p><p>${r.name}</p>` });
    }
  }
}
