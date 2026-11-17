import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MISSED_PENALTY, TRANSFER_FEE, holdConnection, noteArrival, plannedConnections, settleDeparture } from '../src/game/Connections';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Anschlüsse (RM-FR-OPS-13)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(1); });
  afterEach(() => restore());

  it('im Demobahnhof werden Anschlüsse geplant und meist erreicht', () => {
    const { g } = demoGame();
    fastForward(g, 3 * 3600);
    expect(plannedConnections(g).length).toBeGreaterThan(0);
    fastForward(g, 6 * 3600);
    const ok = g.stats.connOk ?? 0, missed = g.stats.connMissed ?? 0;
    expect(ok).toBeGreaterThan(0);
    expect(missed).toBeLessThan(ok);
  });

  it('erreichter Anschluss bringt Geld, verpasster kostet', () => {
    const { g } = demoGame();
    fastForward(g, 3 * 3600);
    const c = plannedConnections(g)[0];
    expect(c).toBeDefined();
    const now = g.sim.time;
    // alle Zubringer dieses Anschlusszugs sind rechtzeitig angekommen
    for (const x of plannedConnections(g).filter((y) => y.to === c.to)) {
      noteArrival(g, x.from);
      g.arrivals.get(x.from.id)!.at = now - 600;
      g.arrivals.get(x.from.id)!.passengers = 100;
    }
    const m0 = g.money, ok0 = g.stats.connOk ?? 0;
    settleDeparture(g, c.to);
    const n = (g.stats.connOk ?? 0) - ok0;
    expect(n).toBeGreaterThan(0);
    expect(g.money).toBeGreaterThan(m0);
    expect(g.money - m0).toBeLessThanOrEqual(n * 100 * TRANSFER_FEE);

    // Zubringer noch unterwegs → verpasst
    const { g: g2 } = demoGame();
    fastForward(g2, 3 * 3600);
    const c2 = plannedConnections(g2).find((x) => !g2.sim.arrivedAt.has(x.from.id));
    if (!c2) return;
    const m1 = g2.money, miss0 = g2.stats.connMissed ?? 0;
    settleDeparture(g2, c2.to);
    expect(g2.stats.connMissed).toBeGreaterThan(miss0);
    expect(m1 - g2.money).toBeGreaterThanOrEqual(MISSED_PENALTY);
  });

  it('Anschlusszug wartet höchstens 5 Minuten auf den Zubringer', () => {
    const { g } = demoGame();
    fastForward(g, 3 * 3600);
    const c = plannedConnections(g)[0];
    holdConnection(g, c);
    expect(c.to.waitFor).toBe(c.from.id);
    expect(c.to.waitUntil).toBe(c.dep + 5 * 60);
  });
});
