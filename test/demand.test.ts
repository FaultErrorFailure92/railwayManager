import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boostAt, dayPax, rush, rushPenalty } from '../src/sim/demand';
import { OPERATORS } from '../src/sim/Operators';
import { demoGame, fastForward, seedRandom } from './helpers';

const h = (x: number) => x * 3600;

describe('Fahrgäste nach Tageszeit (RM-FR-ECO-08)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(4); });
  afterEach(() => restore());

  it('Stoßzeiten morgens und abends, ruhige Nächte', () => {
    expect(rush(h(7))).toBe('morgens');
    expect(rush(h(17.5))).toBe('abends');
    expect(rush(h(12))).toBeNull();
    expect(dayPax(OPERATORS.ro, h(7.5))).toBeGreaterThan(dayPax(OPERATORS.ro, h(12)));
    expect(dayPax(OPERATORS.ro, h(23))).toBeLessThan(0.5);
  });

  it('über den Betriebstag gemittelt bleibt die Fahrgastzahl etwa gleich', () => {
    let sum = 0, n = 0;
    for (let m = 5 * 60; m < 24 * 60; m += 5) { sum += dayPax(OPERATORS.sb, m * 60); n++; }
    expect(sum / n).toBeGreaterThan(0.9);
    expect(sum / n).toBeLessThan(1.1);
  });

  it('Verspätung in der Stoßzeit kostet mehr – nur bei Pendlern', () => {
    expect(rushPenalty(OPERATORS.ro, h(8))).toBeGreaterThan(1);
    expect(rushPenalty(OPERATORS.ro, h(12))).toBe(1);
    expect(rushPenalty(OPERATORS.wx, h(8))).toBe(1);
  });

  it('Verstärkerzüge nur in der Stoßzeit und nur bei Pendlern im 30-/60-Minuten-Takt', () => {
    expect(boostAt(OPERATORS.ro, h(7), 60)).toBe(h(7.5));
    expect(boostAt(OPERATORS.ro, h(12), 60)).toBeNull();
    expect(boostAt(OPERATORS.ro, h(7), 15)).toBeNull();
    expect(boostAt(OPERATORS.wx, h(7), 60)).toBeNull();
  });

  it('Verstärkerzüge nur mit Vertragsoption: morgens ja, mittags nicht', () => {
    const { g } = demoGame();
    const all = () => [...g.sim.trains, ...g.sim.queue];
    expect(all().some((t) => t.boost)).toBe(false);
    // Vertragsoption für ein Pendler-Unternehmen einschalten
    g.toggleBoost('ro');
    expect(g.contracts.ro.boost).toBe(true);
    fastForward(g, 600);
    expect(rush(g.sim.time)).toBe('morgens');
    expect(all().some((t) => t.boost && t.op.id === 'ro')).toBe(true);
    expect(all().some((t) => t.boost && t.op.id !== 'ro')).toBe(false);
    fastForward(g, h(11) - (g.sim.time % 86400));
    expect(all().filter((t) => t.boost && t.state === 'queued').every((t) => rush(t.plannedSpawn) !== null)).toBe(true);
    expect(all().some((t) => t.boost && t.state === 'queued' && t.plannedSpawn < g.sim.time + h(1))).toBe(false);
  }, 60000);
});
