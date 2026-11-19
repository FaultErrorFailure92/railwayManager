/**
 * Leistungsbudget mit Referenz-Bahnhof (RM-FR-PERF-03, RM-FR-Q-01): misst die Simulation ohne Grafik.
 * Referenz: Demobahnhof, zweigleisig, alle Personen- und Güterverträge im dichtesten Takt, Verstärker, Fremdbahnen –
 * gespielt mit höchstem Tempo (×8) bei 60 Bildern pro Sekunde. Gemessen wird die Rechenzeit je Bild.
 * Aufruf: npm run perf [-- --hours 6 --seed 1]
 */
import { Game } from '../game/Game';
import { GAME_SEC_PER_REAL_SEC } from '../config';
import { buildDemo } from './demo';
import { OPERATORS, type OperatorId } from '../sim/Operators';
import { mulberry32 } from './balance';

/** Rechenzeit der Simulation je Bild: Ziel bei 60 Bildern/s (Rest bleibt fürs Zeichnen) */
export const PERF_BUDGET = { avgMs: 4, p95Ms: 8 };

export interface PerfResult {
  frames: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  peakTrains: number;
  peakPassengers: number;
  handled: number;
  punctual: number;
  ok: boolean;
}

/** Referenz-Bahnhof aufbauen */
export function referenceStation(): Game {
  const g = new Game();
  g.startMission();
  buildDemo(g);
  g.research.done.push('double');
  g.ensureSecondTrack();
  for (const id of Object.keys(OPERATORS) as OperatorId[]) {
    const o = OPERATORS[id];
    if (o.special || o.industry || o.kind === 'sort' || g.canRun(id)) continue;
    const c = g.contracts[id];
    c.status = 'active';
    c.takt = o.kind === 'night' ? c.takt : Math.max(g.minTakt, 30);
    g.sim.retime(id);
  }
  if (!g.contracts.ro.boost) g.toggleBoost('ro');
  g.uiEvents.length = 0;
  return g;
}

/** spielt `hours` Spielstunden mit Tempo ×8 und 60 Bildern/s und misst jedes Bild */
export function runPerf(hours = 6, seed = 1): PerfResult {
  const random = Math.random;
  Math.random = mulberry32(seed);
  try {
    const g = referenceStation();
    g.speed = 8;
    const dt = 1 / 60;
    const frames = Math.ceil((hours * 3600) / (dt * GAME_SEC_PER_REAL_SEC * g.speed));
    const times: number[] = [];
    let peakTrains = 0, peakPassengers = 0;
    for (let i = 0; i < frames && !g.gameOver; i++) {
      const t0 = performance.now();
      g.tick(dt);
      times.push(performance.now() - t0);
      g.uiEvents.length = 0;
      g.fx.length = 0;
      const running = g.sim.trains.filter((t) => t.state !== 'stored' && t.state !== 'rolling');
      peakTrains = Math.max(peakTrains, running.length);
      peakPassengers = Math.max(peakPassengers, running.reduce((a, t) => a + t.passengers, 0));
    }
    const sorted = [...times].sort((a, b) => a - b);
    const avgMs = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
    const p95Ms = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const r = { frames: times.length, avgMs, p95Ms, maxMs: sorted[sorted.length - 1] ?? 0, peakTrains, peakPassengers, handled: g.stats.handled, punctual: g.stats.punctual, ok: false };
    r.ok = avgMs <= PERF_BUDGET.avgMs && p95Ms <= PERF_BUDGET.p95Ms && !g.gameOver;
    return r;
  } finally {
    Math.random = random;
  }
}

export function formatPerf(r: PerfResult) {
  const f = (n: number) => n.toFixed(2);
  return [
    `Referenz-Bahnhof: ${r.frames} Bilder (Tempo ×8, 60 Bilder/s)`,
    `Rechenzeit je Bild: Ø ${f(r.avgMs)} ms · 95 % unter ${f(r.p95Ms)} ms · höchstens ${f(r.maxMs)} ms`,
    `Budget: Ø ≤ ${PERF_BUDGET.avgMs} ms, 95 % ≤ ${PERF_BUDGET.p95Ms} ms → ${r.ok ? 'eingehalten' : 'ÜBERSCHRITTEN'}`,
    `Spitze: ${r.peakTrains} Züge gleichzeitig, ${r.peakPassengers} Fahrgäste in Zügen · ${r.handled} Züge abgefertigt, ${r.handled ? Math.round((r.punctual / r.handled) * 100) : 0} % pünktlich`,
  ].join('\n');
}
