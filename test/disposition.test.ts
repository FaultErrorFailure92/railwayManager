import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_HOLD, baseDeparture, dispoConflicts, dispoSlots, setHold, setTrainPlatform, shiftHold } from '../src/game/Disposition';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Disposition (RM-FR-OPS-12)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(3); });
  afterEach(() => restore());

  it('listet die Halte der nächsten zwei Stunden', () => {
    const { g } = demoGame();
    fastForward(g, 2 * 3600);
    const s = dispoSlots(g);
    expect(s.length).toBeGreaterThan(0);
    s.forEach((x) => { expect(x.dep).toBeGreaterThanOrEqual(x.arr); expect(x.arr).toBeLessThanOrEqual(g.sim.time + 2 * 3600); });
  });

  it('Zurückhalten verschiebt die Abfahrt, auf Minuten gerundet und begrenzt', () => {
    const { g } = demoGame();
    fastForward(g, 2 * 3600);
    const t = dispoSlots(g).find((x) => x.t.state === 'queued')!.t;
    const base = baseDeparture(g, t);
    shiftHold(g, t, 5);
    expect(t.holdUntil! - base).toBeGreaterThanOrEqual(4.5 * 60);
    expect(t.holdUntil! % 60).toBe(0);
    expect(g.sim.stationTimes(t).dep).toBe(t.holdUntil);
    setHold(g, t, base + 5 * 3600);
    expect(t.holdUntil).toBeLessThanOrEqual(base + MAX_HOLD);
    setHold(g, t, undefined);
    expect(t.holdUntil).toBeUndefined();
  });

  it('gehaltener Zug fährt erst nach der Haltezeit ab', () => {
    const { g } = demoGame();
    fastForward(g, 2 * 3600);
    for (let i = 0; i < 3600 && !g.sim.trains.some((t) => t.state === 'dwell' && t.jobs[0]?.k === 'stop'); i++) fastForward(g, 1, 1);
    const t = g.sim.trains.find((x) => x.state === 'dwell' && x.jobs[0]?.k === 'stop');
    expect(t).toBeDefined();
    const until = g.sim.time + 10 * 60;
    t!.holdUntil = until;
    for (let i = 0; i < 9 * 60; i++) fastForward(g, 1, 1);
    expect(t!.state).toBe('dwell');
    for (let i = 0; i < 5 * 60 && t!.state === 'dwell'; i++) fastForward(g, 1, 1);
    expect(t!.state).not.toBe('dwell');
    expect(g.sim.time).toBeGreaterThanOrEqual(until);
  });

  it('meldet zwei Züge gleichzeitig am selben Bahnsteig als Konflikt', () => {
    const { g } = demoGame();
    fastForward(g, 2 * 3600);
    const runs = g.platformRuns();
    const s = dispoSlots(g).filter((x) => !x.locked);
    const a = s[0], b = s.find((x) => x !== a && x.arr < a.dep + 600)!;
    expect(b).toBeDefined();
    setTrainPlatform(g, a.t, runs[0].id);
    setTrainPlatform(g, b.t, runs[0].id);
    setHold(g, a.t, b.arr + 600);
    const c = dispoConflicts(g);
    expect(c.some((x) => x.platform === runs[0].id && [x.a, x.b].includes(a.t) && [x.a, x.b].includes(b.t))).toBe(true);
    // anderer Bahnsteig löst den Konflikt
    setTrainPlatform(g, b.t, runs[1].id);
    expect(dispoConflicts(g).some((x) => x.platform === runs[0].id && [x.a, x.b].includes(b.t))).toBe(false);
  });

  it('Bahnsteig je Zug wird benutzt und gespeichert', () => {
    const { g } = demoGame();
    fastForward(g, 2 * 3600);
    const runs = g.platformRuns();
    const t = dispoSlots(g).find((x) => x.t.state === 'queued')!.t;
    setTrainPlatform(g, t, runs[runs.length - 1].id);
    const s = g.sim.save();
    const saved = [...s.queue, ...s.trains].find((x) => x.id === t.id)!;
    expect(saved.platform).toBe(runs[runs.length - 1].id);
    for (let i = 0; i < 4 * 3600 && !(t.state === 'dwell' && t.jobs[0]?.k === 'stop'); i++) fastForward(g, 1, 1);
    expect(t.route[t.route.length - 1]?.stopRun?.id).toBe(runs[runs.length - 1].id);
  });
});
