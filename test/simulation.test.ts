import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoGame, fastForward, seedRandom } from './helpers';

/** Fahrdienstleiter (Simulation) am Demobahnhof: läuft ohne Blockade, pünktlich und ohne verwaiste Reservierungen */
describe('Fahrdienstleiter (Simulation)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(42); });
  afterEach(() => restore());

  it('Demobahnhof baut ohne Fehler', () => {
    const { log } = demoGame();
    expect(log).toEqual([]);
  });

  it('6 Stunden Betrieb: keine Blockade, Züge abgefertigt, überwiegend pünktlich', () => {
    const { g } = demoGame();
    fastForward(g, 6 * 3600);
    expect(g.gameOver).toBe(false);
    expect(g.sim.deadlock ?? null).toBeNull();
    expect(g.stats.handled).toBeGreaterThan(10);
    expect(g.stats.punctual / g.stats.handled).toBeGreaterThan(0.8);
  });

  it('Reservierungen gehören immer zu einem fahrenden Zug', () => {
    const { g } = demoGame();
    for (let i = 0; i < 24; i++) {
      fastForward(g, 600);
      const ids = new Set(g.sim.trains.map((t) => t.id));
      const ghosts = new Set<number>();
      g.sim.owner.forEach((o) => { if (o !== 0 && !ids.has(o)) ghosts.add(o); });
      expect([...ghosts], `nach ${(i + 1) * 10} min`).toEqual([]);
    }
  });

  it('kein Zug ist doppelt unterwegs', () => {
    const { g } = demoGame();
    fastForward(g, 3 * 3600);
    const ids = [...g.sim.trains, ...g.sim.queue].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
