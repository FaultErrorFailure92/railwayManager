import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rollSpecial, specialPax, specialRuns } from '../src/game/SpecialDays';
import { OPERATORS } from '../src/sim/Operators';
import { problems } from '../src/game/Problems';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Besondere Tage (RM-FR-EVT-08)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(11); });
  afterEach(() => restore());

  const at = (day: number, h: number) => day * 86400 + h * 3600;

  it('Heimspiel: Regionalzüge am Nachmittag voller, morgens nicht', () => {
    const { g } = demoGame();
    g.specials = [{ day: 1, id: 'heimspiel' }];
    expect(specialPax(g, OPERATORS.ro, at(1, 16))).toBeGreaterThan(1.5);
    expect(specialPax(g, OPERATORS.ro, at(1, 8))).toBe(1);
    expect(specialPax(g, OPERATORS.ro, at(0, 16))).toBe(1);
  });

  it('Feiertag: weniger Pendler, mehr Fernverkehr', () => {
    const { g } = demoGame();
    g.specials = [{ day: 1, id: 'feiertag' }];
    expect(specialPax(g, OPERATORS.sb, at(1, 8))).toBeLessThan(1);
    expect(specialPax(g, OPERATORS.wx, at(1, 8))).toBeGreaterThan(1);
  });

  it('Streik: das Unternehmen fährt den ganzen Tag nicht, andere sind voller', () => {
    const { g } = demoGame();
    g.specials = [{ day: 0, id: 'streik', op: 'ro' }];
    expect(specialRuns(g, OPERATORS.ro, at(0, 10))).toBe(false);
    expect(specialRuns(g, OPERATORS.ro, at(1, 10))).toBe(true);
    expect(specialPax(g, OPERATORS.sb, at(0, 10))).toBeGreaterThan(1);
    g.sim.queue = g.sim.queue.filter((q) => q.op.id !== 'ro');
    g.sim.nextSpawn.ro = g.sim.time;
    fastForward(g, 3 * 3600);
    expect([...g.sim.trains, ...g.sim.queue].filter((t) => t.op.id === 'ro' && Math.floor(t.plannedSpawn / 86400) === 0)).toEqual([]);
  });

  it('wird am Vorabend angekündigt und erscheint in „Was ist los?“', () => {
    const { g } = demoGame();
    const sd = rollSpecial(g, 1);
    expect(sd?.day).toBe(Math.floor(g.sim.time / 86400) + 1);
    expect(rollSpecial(g, 1)).toBeUndefined();
    expect(problems(g).some((p) => p.text.startsWith('Morgen:'))).toBe(true);
  });

  it('läuft über einen ganzen Tag mit Ankündigung, Heimspiel-Sonderzug und Speichern', () => {
    const { g } = demoGame();
    g.specials = [{ day: 1, id: 'heimspiel' }];
    fastForward(g, (86400 - (g.sim.time % 86400)) + 7 * 3600);
    expect(g.specials[0].started).toBe(true);
    expect(g.sim.queue.some((t) => t.op.id === 'fx') || g.sim.trains.some((t) => t.op.id === 'fx')).toBe(true);
    expect(g.save().specials?.[0].id).toBe('heimspiel');
  }, 60000);
});
