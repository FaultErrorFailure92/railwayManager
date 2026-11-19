import type { Game, Stats } from './Game';
import type { Check } from './Missions';
import { activeProfile, updateProfile } from './Profiles';

/** Herausforderungen (RM-FR-MODE-08): kurze Szenarien mit fertigem Bahnhof, Ziel und Zeitlimit */

export interface Challenge {
  id: string;
  title: string;
  /** eine Zeile fürs Menü */
  short: string;
  hours: number;
  money: number;
  setup?: (g: Game) => void;
  goals: (g: Game, base: Stats, money0: number) => Check[];
}

export interface ChallengeState { id: string; until: number; base: Stats; money0: number; result?: 'won' | 'lost' }

const handled = (g: Game, b: Stats) => g.stats.handled - b.handled;
const punct = (g: Game, b: Stats) => {
  const n = handled(g, b);
  return n ? (g.stats.punctual - b.punctual) / n : 1;
};

export const CHALLENGES: Challenge[] = [
  {
    id: 'rush', title: 'Morgenspitze', short: '20 Züge in 4 Stunden, 90 % pünktlich', hours: 4, money: 20000,
    goals: (g, b) => [
      { label: `20 Züge abgefertigt (${Math.min(20, handled(g, b))}/20)`, done: handled(g, b) >= 20 },
      { label: `mindestens 90 % pünktlich (${Math.round(punct(g, b) * 100)} %)`, done: handled(g, b) > 0 && punct(g, b) >= 0.9 },
    ],
  },
  {
    id: 'storm', title: 'Sturmtief', short: 'Baum auf der Strecke – 8 Stunden durchhalten', hours: 8, money: 20000,
    setup: (g) => { g.startBigFault('tree'); },
    goals: (g, b) => [
      { label: `25 Züge abgefertigt (${Math.min(25, handled(g, b))}/25)`, done: handled(g, b) >= 25 },
      { label: `mindestens 80 % pünktlich (${Math.round(punct(g, b) * 100)} %)`, done: handled(g, b) > 0 && punct(g, b) >= 0.8 },
    ],
  },
  {
    id: 'cash', title: 'Sparkurs', short: 'Mit 5 000 € in einem Tag 15 000 € Gewinn', hours: 24, money: 5000,
    goals: (g, _b, m0) => [
      { label: `15 000 € Gewinn (${Math.round(g.money - m0).toLocaleString('de-AT')} €)`, done: g.money - m0 >= 15000 },
    ],
  },
];

/** Tägliche Herausforderung (RM-FR-END-03): für alle am selben Tag dieselbe, mit festem Zufall */
export function dailyKey(d = new Date()) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
export function dailyChallenge(key = dailyKey()): Challenge {
  const n = Number(key);
  const base = CHALLENGES[n % CHALLENGES.length];
  // Startgeld je Tag 100 / 80 / 67 % der Vorlage
  const tight = 1 + ((n >> 3) % 3) * 0.25;
  return { ...base, id: `daily-${key}`, title: `Heute: ${base.title}`, short: `${base.short} · Startgeld ${Math.round(100 / tight)} %`, money: Math.round(base.money / tight / 1000) * 1000 };
}
/** fester Zufall für die tägliche Herausforderung */
export function seedDaily(key: string) {
  let a = Number(key) >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function challengeById(id: string) { return id.startsWith('daily-') ? dailyChallenge(id.slice(6)) : CHALLENGES.find((c) => c.id === id); }

/** Herausforderung beginnen (nach dem Aufbau des Bahnhofs) */
export function startChallenge(g: Game, id: string) {
  const c = challengeById(id)!;
  if (id.startsWith('daily-')) g.addLog('Tägliche Herausforderung: heute für alle gleich', 'info');
  g.mode = 'challenge';
  g.money = c.money;
  c.setup?.(g);
  g.challenge = { id, until: g.sim.time + c.hours * 3600, base: structuredClone(g.stats), money0: g.money };
  g.uiEvents.push({ type: 'letter', mood: 'info', open: true, title: `Herausforderung: ${c.title}`,
    text: `<p>${c.short}.</p><ul>${c.goals(g, g.challenge.base, g.money).map((x) => `<li>${x.label.replace(/ \(.*\)$/, '')}</li>`).join('')}</ul><p>Zeit: ${c.hours} Stunden. Viel Glück!</p>` });
}

/** jeden Tick: gewonnen oder Zeit um? */
export function challengeTick(g: Game) {
  const s = g.challenge;
  if (!s || s.result) return;
  const c = challengeById(s.id);
  if (!c) return;
  const ok = c.goals(g, s.base, s.money0).every((x) => x.done);
  if (!ok && g.sim.time < s.until) return;
  s.result = ok ? 'won' : 'lost';
  const used = Math.round((g.sim.time - (s.until - c.hours * 3600)) / 60);
  if (ok) recordChallenge(s.id, used);
  g.uiEvents.push({ type: 'letter', mood: ok ? 'good' : 'bad', open: true, title: ok ? `Geschafft: ${c.title}` : `Nicht geschafft: ${c.title}`,
    text: ok ? `<p>Ziel erreicht nach ${Math.floor(used / 60)} h ${used % 60} min.</p><p>Sie können weiterspielen oder im Hauptmenü die nächste Herausforderung wählen.</p>`
      : '<p>Die Zeit ist um. Nochmal versuchen? Hauptmenü → Herausforderungen.</p>' });
}

/** Anzeige oben rechts statt Auftrag */
export function challengeInfo(g: Game) {
  const s = g.challenge!, c = challengeById(s.id)!;
  const checks = c.goals(g, s.base, s.money0);
  const left = Math.max(0, s.until - g.sim.time);
  const n = checks.filter((x) => x.done).length;
  const text = s.result === 'won' ? 'geschafft' : s.result === 'lost' ? 'Zeit um' : `noch ${Math.floor(left / 3600)}:${String(Math.floor((left % 3600) / 60)).padStart(2, '0')} h`;
  return { title: c.title, short: c.short, reward: 0, value: n / checks.length, text, index: 0, total: 1, checks };
}

/** Bestzeit im Profil merken (Minuten) */
function recordChallenge(id: string, minutes: number) {
  const p = activeProfile();
  if (!p) return;
  const best = p.challenges?.[id];
  if (best && best <= minutes) return;
  updateProfile(p.id, { challenges: { ...(p.challenges ?? {}), [id]: minutes } });
}
