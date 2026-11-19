import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEASON_DAYS, seasonOf, seasonPax, seasonWeather } from '../src/game/Seasons';
import { OPERATORS } from '../src/sim/Operators';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Jahreszeiten (RM-FR-EVT-10)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(9); });
  afterEach(() => restore());

  it('wechseln alle 7 Tage: Frühling, Sommer, Herbst, Winter', () => {
    expect([0, SEASON_DAYS, 2 * SEASON_DAYS, 3 * SEASON_DAYS, 4 * SEASON_DAYS].map(seasonOf)).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring']);
  });

  it('Winter bringt Schnee, Sommer keinen; Sommer mehr Ausflügler', () => {
    const base = { rain: 0.3, snow: 0.05 };
    expect(seasonWeather('winter', base).snow).toBeGreaterThan(base.snow);
    expect(seasonWeather('summer', base).snow).toBe(0);
    expect(seasonPax('summer', OPERATORS.ro)).toBeGreaterThan(1);
    expect(seasonPax('winter', OPERATORS.ro)).toBeLessThan(1);
  });

  it('beim Wechsel gibt es eine Zeitungsmeldung', () => {
    const { g } = demoGame();
    g.sim.time = SEASON_DAYS * 86400 - 600;
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) { g.tick(0.5); seen = g.uiEvents.some((e) => e.type === 'news' && e.tag === 'season-summer'); }
    expect(seen).toBe(true);
    expect(g.season).toBe('summer');
    void fastForward;
  });
});
