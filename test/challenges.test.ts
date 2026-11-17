import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { applySetup } from '../src/game/FreePlay';
import { CHALLENGES, challengeTick } from '../src/game/Challenges';
import { catchRate, FINE, inspectTrain, setInspectors } from '../src/game/FareDodgers';
import { demoGame, fastForward, seedRandom } from './helpers';

const player = { name: 'B', title: '' as const, avatar: 1 };

describe('Herausforderungen, Schwarzfahrer, Finanzen (RM-FR-MODE-08, ECO-13, ECO-09)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(6); });
  afterEach(() => restore());

  it('Herausforderung startet mit fertigem Bahnhof, Ziel und Zeitlimit', () => {
    const g = new Game();
    applySetup(g, { mode: 'challenge', map: 'donau', challenge: 'rush', profileId: '', company: 'Test AG', player });
    expect(g.mode).toBe('challenge');
    expect(g.company).toBe('Test AG');
    expect(g.money).toBe(CHALLENGES[0].money);
    expect(g.stations().length).toBeGreaterThan(0);
    expect(g.mission).toBeNull();
    const info = g.missionInfo();
    expect(info.title).toBe('Morgenspitze');
    expect(info.checks?.length).toBe(2);
  });

  it('nach Ablauf der Zeit ist sie gewonnen oder verloren', () => {
    const g = new Game();
    applySetup(g, { mode: 'challenge', map: 'donau', challenge: 'rush', profileId: '', company: 'T', player });
    fastForward(g, 4 * 3600 + 60);
    challengeTick(g);
    expect(['won', 'lost']).toContain(g.challenge?.result);
  });

  it('Schwarzfahrer erst nach der Forschung, Kontrolleure kassieren', () => {
    const { g } = demoGame();
    const t = { id: 1, passengers: 400 } as never;
    g.research.done = g.research.done.filter((r) => r !== 'ticket');
    expect(inspectTrain(g, t)).toBe(0);
    g.research.done.push('ticket');
    setInspectors(g, 4);
    expect(g.inspectors).toBe(4);
    const m = g.money;
    const n = inspectTrain(g, t);
    expect(n).toBeGreaterThan(0);
    expect(g.money - m).toBe(n * FINE);
    expect(catchRate(0)).toBe(0);
  });

  it('Buchungen landen in Kategorien', () => {
    const { g } = demoGame();
    fastForward(g, 3 * 3600);
    const cats = g.history[g.history.length - 1].cats ?? {};
    expect(cats.Unternehmen).toBeGreaterThan(0);
  });
});
