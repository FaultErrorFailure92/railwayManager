import { describe, expect, it } from 'vitest';
import { MAIN_ROW, SECOND_ROW } from '../src/config';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Blocksignale auf der zweigleisigen Strecke', () => {
  it('Netzbetreiber stellt Blocksignale je Richtung, nicht im Bahnhof', () => {
    const { g } = demoGame();
    g.research.done.push('double');
    g.ensureSecondTrack();
    const e = [], w = [];
    for (let x = 0; x < g.grid.w; x++) { if (g.grid.get(x, MAIN_ROW)!.signal) e.push(x); if (g.grid.get(x, SECOND_ROW)!.signalW) w.push(x); }
    expect(e.length).toBeGreaterThan(8);
    expect(w.length).toBeGreaterThan(8);
    // auf freier Strecke etwa alle 16 Felder (im Bahnhof bleiben nur die eigenen Signale)
    expect(e.filter((x) => x > 150).length).toBeGreaterThanOrEqual(4);
  });
  it('zweigleisig ist der Demobahnhof wieder pünktlich und ohne Stau', () => {
    const undo = seedRandom(3);
    const { g } = demoGame();
    g.research.done.push('double');
    g.ensureSecondTrack();
    fastForward(g, 24 * 3600);
    undo();
    expect(g.gameOver).toBe(false);
    expect(g.stats.punctual / g.stats.handled).toBeGreaterThan(0.75);
  }, 120000);

  it('zweigleisig mit Verstärkerzügen: kein Stau durch Gegengleis-Fahrten (RM-FR-OPS-15)', () => {
    for (const seed of [4, 5]) {
      const undo = seedRandom(seed);
      const { g } = demoGame();
      if (!g.contracts.ro.boost) g.toggleBoost('ro');
      g.research.done.push('double');
      g.ensureSecondTrack();
      fastForward(g, 14 * 3600);
      undo();
      expect(g.gameOver, `Startwert ${seed}`).toBe(false);
      expect(g.sim.deadlock ?? null).toBeNull();
    }
  }, 120000);
});
