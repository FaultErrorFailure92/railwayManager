import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { letPass } from '../src/game/Connections';
import { problems } from '../src/game/Problems';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Verspätungen von außen (RM-FR-OPS-11)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(2); });
  afterEach(() => restore());

  it('einige Vertragszüge kommen verspätet, aber nicht zu viele', () => {
    const { g } = demoGame();
    fastForward(g, 4 * 3600);
    const all = [...g.sim.queue, ...g.sim.trains].filter((t) => !t.transit);
    const late = all.filter((t) => t.extDelay);
    expect(late.length).toBeLessThan(all.length * 0.3);
  });

  it('verspäteter Zug hält Folgezüge auf – vorlassen löst es', () => {
    const { g } = demoGame();
    fastForward(g, 3600);
    const q = g.sim.queue;
    const a = q[0];
    const b = q.find((x) => x !== a && x.dir === a.dir)!;
    a.extDelay = Math.max(600, b.plannedSpawn - a.plannedSpawn + 600);
    fastForward(g, Math.max(0, b.plannedSpawn - g.sim.time) - 120);
    expect(g.sim.blockedBehind(a)).toContain(b);
    const p = problems(g).find((x) => x.id === `ext${a.id}`);
    expect(p?.fix).toBeDefined();
    letPass(g, a);
    expect(g.sim.blockedBehind(a)).toHaveLength(0);
    fastForward(g, 600);
    expect(g.sim.queue).not.toContain(b);
    expect(g.sim.queue).toContain(a);
  });

  it('ohne Vorlassen bleibt die Reihenfolge', () => {
    const { g } = demoGame();
    fastForward(g, 3600);
    const a = g.sim.queue[0];
    const b = g.sim.queue.find((x) => x !== a && x.dir === a.dir)!;
    a.extDelay = b.plannedSpawn - a.plannedSpawn + 900;
    fastForward(g, b.plannedSpawn - g.sim.time + 300);
    expect(g.sim.queue).toContain(b);
  });
});
