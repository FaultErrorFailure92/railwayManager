/**
 * Balancing-Werkzeug (RM-FR-BAL-01): Simulation ohne Grafik im Schnelldurchlauf.
 * Spielt typische Strategien durch und liefert Kennzahlen je Spieltag.
 * Aufruf: npm run balance -- --days 3 --strategy demo,leer
 */
import { Game } from '../game/Game';
import { GAME_SEC_PER_REAL_SEC } from '../config';
import { OPERATORS, type OperatorId } from '../sim/Operators';
import { buildDemo } from './demo';
import { setMap } from '../world/maps';

export interface DayKpi {
  day: number;
  money: number;
  income: number;
  expense: number;
  handled: number;
  /** pünktlich abgefertigt in Prozent */
  punctual: number;
  pax: number;
  /** mittlere Zufriedenheit der Unternehmen mit Vertrag */
  satisfaction: number;
  contracts: number;
  cancelled: number;
}

export interface BalanceResult {
  strategy: string;
  seed: number;
  days: DayKpi[];
  gameOver?: string;
  /** Rechenzeit in Sekunden */
  seconds: number;
}

/** Strategien: bauen den Start auf */
export const STRATEGIES: Record<string, { text: string; setup: (g: Game) => void }> = {
  leer: { text: 'Nichts gebaut, Tutorial übersprungen – nur laufende Kosten', setup: (g) => { g.company = 'Leer AG'; g.skipTutorial(); } },
  demo: { text: 'Demobahnhof: 2 Bahnsteige, Läden, 6 Verträge im Stundentakt', setup: (g) => { buildDemo(g); } },
  'demo-teuer': {
    text: 'Demobahnhof mit 30 % überhöhten Vertragspreisen',
    setup: (g) => {
      buildDemo(g);
      for (const id of Object.keys(OPERATORS) as OperatorId[]) {
        const c = g.contracts[id];
        if (c.status === 'active') c.price = { short: Math.round(c.price.short * 1.3), long: Math.round(c.price.long * 1.3) };
      }
    },
  },
};

/** reproduzierbarer Zufall */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Game im Schnelldurchlauf laufen lassen (Spielsekunden). Entscheidungen im UI werden ignoriert. */
export function fastForward(g: Game, gameSeconds: number, step = 5) {
  const end = g.sim.time + gameSeconds;
  while (g.sim.time < end && !g.gameOver) {
    g.tick(Math.min(step, end - g.sim.time) / GAME_SEC_PER_REAL_SEC / g.speed);
    g.uiEvents.length = 0;
    g.fx.length = 0;
  }
}

export function runBalance(strategy: string, days: number, seed = 1, map?: string): BalanceResult {
  const s = STRATEGIES[strategy];
  if (!s) throw new Error(`Unbekannte Strategie „${strategy}“. Vorhanden: ${Object.keys(STRATEGIES).join(', ')}`);
  const random = Math.random;
  Math.random = mulberry32(seed);
  const t0 = performance.now();
  try {
    setMap(map);
    const g = new Game();
    g.startMission();
    s.setup(g);
    g.uiEvents.length = 0;
    const out: DayKpi[] = [];
    for (let d = 0; d < days && !g.gameOver; d++) {
      const before = { ...g.stats };
      const day = Math.floor(g.sim.time / 86400);
      const startMoney = g.money;
      fastForward(g, (day + 1) * 86400 - g.sim.time);
      const h = g.history.find((x) => x.day === day);
      const withContract = (Object.keys(OPERATORS) as OperatorId[]).filter((id) => g.contracts[id].status === 'active');
      const handled = g.stats.handled - before.handled;
      out.push({
        day: day + 1,
        money: Math.round(g.money),
        income: Math.round(h?.income ?? Math.max(0, g.money - startMoney)),
        expense: Math.round(h?.expense ?? 0),
        handled,
        punctual: handled ? Math.round(((g.stats.punctual - before.punctual) / handled) * 100) : 0,
        pax: g.stats.passengers - before.passengers,
        satisfaction: withContract.length ? Math.round(withContract.reduce((a, id) => a + g.satisfaction[id], 0) / withContract.length) : 0,
        contracts: withContract.length,
        cancelled: (Object.keys(OPERATORS) as OperatorId[]).filter((id) => g.contracts[id].status === 'cancelled').length,
      });
    }
    return { strategy, seed, days: out, gameOver: g.gameOver ? String(g.gameOver) : undefined, seconds: (performance.now() - t0) / 1000 };
  } finally {
    Math.random = random;
  }
}

/** Ergebnis als Text-Tabelle */
export function formatResult(r: BalanceResult) {
  const head = ['Tag', 'Kasse', 'Einnahmen', 'Ausgaben', 'Züge', 'pünktl. %', 'Fahrgäste', 'Zufried.', 'Verträge', 'gekündigt'];
  const rows = r.days.map((d) => [d.day, d.money, d.income, d.expense, d.handled, d.punctual, d.pax, d.satisfaction, d.contracts, d.cancelled].map((v) => v.toLocaleString('de-AT')));
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((x) => x[i].length)));
  const line = (c: string[]) => c.map((x, i) => x.padStart(w[i])).join('  ');
  return [`Strategie „${r.strategy}“ (${STRATEGIES[r.strategy].text}), Seed ${r.seed}, ${r.seconds.toFixed(1)} s${r.gameOver ? ` · GAME OVER: ${r.gameOver}` : ''}`,
    line(head), ...rows.map(line)].join('\n');
}
