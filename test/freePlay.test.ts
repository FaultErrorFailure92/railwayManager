import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { contractCap, FREE_CONTRACT_CAP, freeTick, LONG_GOALS } from '../src/game/FreePlay';
import { MISSIONS, TUTORIAL_MISSIONS } from '../src/game/Missions';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Spielmodus und freies Spiel (RM-FR-MODE-01/05)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(5); });
  afterEach(() => restore());

  it('freies Spiel ohne Tutorial: keine Aufträge, alle Kampagnen-Werkzeuge frei', () => {
    const g = new Game();
    g.startMission();
    g.startFreePlay(false);
    expect(g.mode).toBe('free');
    expect(g.mission).toBeNull();
    for (const m of MISSIONS) for (const u of m.unlock) expect(g.unlocked.has(u)).toBe(true);
    expect(g.missionInfo().title).toBe('Langzeitziele');
    expect(g.missionInfo().checks).toHaveLength(LONG_GOALS.length);
  });

  it('freies Spiel mit Tutorial: erst die Tutorial-Aufträge, dann frei', () => {
    const g = new Game();
    g.startMission();
    g.startFreePlay(true);
    expect(g.mission).not.toBeNull();
    expect(g.missionIdx).toBe(0);
    expect(TUTORIAL_MISSIONS).toBeLessThan(MISSIONS.length);
  });

  it('Verkehr wächst mit der Bahnhofsstufe, Kampagne ohne Grenze', () => {
    const { g } = demoGame();
    expect(contractCap(g)).toBe(Infinity);
    g.mode = 'free';
    g.tier = 0;
    expect(contractCap(g)).toBe(FREE_CONTRACT_CAP[0]);
    g.tier = 3;
    expect(contractCap(g)).toBe(Infinity);
  });

  it('Langzeitziel erreicht: Prämie einmalig, bleibt im Spielstand', () => {
    const { g } = demoGame();
    g.startFreePlay(false);
    g.stats.connOk = 500;
    const m = g.money;
    freeTick(g);
    expect(g.longGoals).toContain('conn');
    expect(g.money).toBeGreaterThanOrEqual(m + 8000);
    const m2 = g.money;
    freeTick(g);
    expect(g.money).toBe(m2);
    const loaded = new Game(JSON.parse(JSON.stringify(g.save())));
    expect(loaded.mode).toBe('free');
    expect(loaded.longGoals).toContain('conn');
  });

  it('freies Spiel läuft stabil', () => {
    const { g } = demoGame();
    g.startFreePlay(false);
    fastForward(g, 6 * 3600);
    expect(g.gameOver).toBeFalsy();
    expect(g.sim.deadlock).toBeFalsy();
  });
});
