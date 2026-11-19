import { describe, expect, it } from 'vitest';
import { SIM_BUDGET_MS, SIM_STEP, SimClock } from '../src/game/SimClock';

// RM-FR-PERF-01: feste Schritte, unabhängig von der Bildrate
describe('SimClock', () => {
  it('rechnet in festen Schritten, egal wie die Bilder kommen', () => {
    const steps: number[] = [];
    const c = new SimClock((d) => steps.push(d), () => 0);
    for (let i = 0; i < 30; i++) c.advance(1 / 30); // 30 Bilder/s
    for (let i = 0; i < 144; i++) c.advance(1 / 144); // 144 Bilder/s
    expect(new Set(steps)).toEqual(new Set([SIM_STEP]));
    expect(steps.length).toBeGreaterThanOrEqual(119);
    expect(steps.length).toBeLessThanOrEqual(120);
  });

  it('holt nach einer langen Pause nicht alles auf einmal nach', () => {
    let n = 0;
    const c = new SimClock(() => n++, () => 0);
    c.advance(5);
    expect(n).toBeLessThanOrEqual(15);
  });

  it('bricht ab, wenn das Rechnen das Budget sprengt', () => {
    let t = 0, n = 0;
    const c = new SimClock(() => { n++; t += SIM_BUDGET_MS; }, () => t);
    c.advance(0.2);
    expect(n).toBe(2);
    expect(c.slowFrames).toBe(1);
  });
});
