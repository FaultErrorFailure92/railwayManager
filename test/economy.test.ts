import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptChance, cancelRisk, fairPrice, newContracts, tolerance } from '../src/game/Contracts';
import { OPERATORS } from '../src/sim/Operators';
import { demoGame, fastForward, seedRandom } from './helpers';

const op = OPERATORS.ro;

describe('Verträge (Regeln)', () => {
  it('lange Züge kosten mehr als kurze', () => {
    // Unternehmen ohne Haltgebühr (z. B. Privatbahnen) ausgenommen
    for (const o of Object.values(OPERATORS).filter((x) => x.fee > 0)) expect(fairPrice(o, 'long')).toBeGreaterThan(fairPrice(o, 'short'));
  });
  it('fairer Preis wird nie gekündigt und ab mittlerer Zufriedenheit sicher angenommen', () => {
    const c = newContracts().ro;
    for (const sat of [0, 50, 100]) expect(cancelRisk(op, c, sat)).toBe(0);
    expect(acceptChance(op, c, 50)).toBe(1);
    expect(acceptChance(op, c, 100)).toBe(1);
    expect(acceptChance(op, c, 0)).toBeCloseTo(0.5, 5);
  });
  it('höherer Preis: geringere Annahme, höheres Kündigungsrisiko', () => {
    const c = newContracts().ro;
    let lastAccept = 2, lastRisk = -1;
    for (const f of [1, 1.2, 1.4, 1.6, 2]) {
      c.price = { short: fairPrice(op, 'short') * f, long: fairPrice(op, 'long') * f };
      const a = acceptChance(op, c, 50), r = cancelRisk(op, c, 50);
      expect(a).toBeLessThanOrEqual(lastAccept);
      expect(r).toBeGreaterThanOrEqual(lastRisk);
      lastAccept = a; lastRisk = r;
    }
    expect(lastAccept).toBe(0);
    expect(lastRisk).toBeGreaterThan(0);
  });
  it('zufriedene Unternehmen tolerieren mehr', () => {
    expect(tolerance(100)).toBeGreaterThan(tolerance(0));
    const c = newContracts().ro;
    c.price = { short: fairPrice(op, 'short') * 1.3, long: fairPrice(op, 'long') * 1.3 };
    expect(cancelRisk(op, c, 100)).toBeLessThan(cancelRisk(op, c, 0));
  });
});

describe('Wirtschaft im Betrieb', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(7); });
  afterEach(() => restore());

  it('Kasse = Einnahmen − Ausgaben des Tages', () => {
    const { g } = demoGame();
    const day = Math.floor(g.sim.time / 86400);
    const start = g.money;
    const h0 = g.history.find((h) => h.day === day);
    const in0 = h0?.income ?? 0, out0 = h0?.expense ?? 0;
    fastForward(g, 8 * 3600);
    const h = g.history.find((x) => x.day === day)!;
    expect(Math.round(g.money - start)).toBe(Math.round(h.income - in0 - (h.expense - out0)));
  });

  it('Demobahnhof verdient Geld', () => {
    const { g } = demoGame();
    const start = g.money;
    fastForward(g, 8 * 3600);
    expect(g.money).toBeGreaterThan(start);
  });

  it('stark überhöhte Preise bei unzufriedenem Unternehmen führen zur Kündigung', () => {
    const { g } = demoGame();
    const c = g.contracts.ro;
    c.price = { short: fairPrice(op, 'short') * 2, long: fairPrice(op, 'long') * 2 };
    g.satisfaction.ro = 0;
    fastForward(g, 12 * 3600);
    expect(c.status).not.toBe('active');
  });
});
