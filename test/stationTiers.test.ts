import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { TIERS, tierChecks, tierMetrics } from '../src/game/StationTiers';
import { priceMod } from '../src/game/Contracts';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Bahnhofsstufen (RM-FR-PROG-08)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(5); });
  afterEach(() => restore());

  it('neues Spiel beginnt als Haltepunkt', () => {
    expect(new Game().tier).toBe(0);
  });

  it('Bedingungen zeigen Ist und Soll', () => {
    const { g } = demoGame();
    const m = tierMetrics(g);
    expect(m.runs).toBeGreaterThanOrEqual(2);
    const c = tierChecks(g, 1);
    expect(c.map((x) => x.label)).toContain('Züge an einem Tag');
    expect(tierChecks(g, 3).some((x) => x.label.includes('Empfangsgebäude'))).toBe(true);
  });

  it('Demobahnhof wird im Betrieb zum Bahnhof: Brief, Prämie, Bonus, bleibt nach Laden', () => {
    const { g } = demoGame();
    const fp0 = g.research.points;
    const fair0 = priceMod.fair;
    const start = g.sim.time;
    while (g.tier < 1 && g.sim.time - start < 30 * 3600) {
      fastForward(g, 1800);
    }
    expect(g.tier).toBeGreaterThanOrEqual(1);
    expect(g.research.points).toBeGreaterThan(fp0);
    expect(g.sim.paxFactor).toBeCloseTo((0.8 + 0.1 * g.rating.stars) * (1 + TIERS[g.tier].bonus.pax), 5);
    expect(priceMod.fair).toBeGreaterThanOrEqual(fair0);
    const g2 = new Game(JSON.parse(JSON.stringify(g.save())));
    expect(g2.tier).toBe(g.tier);
  }, 120000);

  it('eine Stufe geht nicht verloren', () => {
    const { g } = demoGame();
    g.tier = 2;
    fastForward(g, 3600);
    expect(g.tier).toBe(2);
  });
});
