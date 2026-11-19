import { describe, expect, it } from 'vitest';
import { runPerf } from '../src/dev/perf';

describe('Leistungsbudget (RM-FR-PERF-03)', () => {
  // großzügig (Testrechner sind unterschiedlich schnell) – das echte Budget prüft `npm run perf`
  it('Referenz-Bahnhof: Simulation bleibt weit unter einem Bild (16 ms) je Bild, ohne Stau', () => {
    const r = runPerf(1, 1);
    expect(r.frames).toBeGreaterThan(1000);
    expect(r.avgMs).toBeLessThan(12);
    expect(r.peakTrains).toBeGreaterThan(5);
  }, 60000);
});
