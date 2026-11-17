import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autoCode, cleanCode } from '../src/game/StationCode';
import { trainStatus } from '../src/game/TrainStatus';
import { decodeSave, encodeSave } from '../src/game/saveCodec';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Bahnhofs-Kürzel und Zugstatus mit Ort', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(5); });
  afterEach(() => restore());

  it('Kürzel aus dem Namen: 2–3 Buchstaben, eindeutig', () => {
    expect(autoCode('Demohausen')).toBe('Dmh');
    expect(autoCode('Oase Nord')).toBe('ON');
    expect(autoCode('Ua')).toBe('Ua');
    expect(autoCode('Oase Nord', ['ON'])).toBe('ON2');
    expect(cleanCode(' wien-hbf ')).toBe('Wien');
    expect(cleanCode('x')).toBe('X');
  });

  it('eigenes Kürzel wird benutzt und gespeichert', () => {
    const { g } = demoGame();
    const st = g.stations()[0];
    expect(g.stationCode(st)).toBe(autoCode('Demohausen'));
    g.stationName(st.id, 'Demohausen', 'DH');
    expect(g.stationCode(st)).toBe('DH');
    const s = g.save();
    expect(s.buildings.find((b) => b.id === st.id)?.code).toBe('DH');
    expect((decodeSave(encodeSave(s)) as typeof s).buildings.find((b) => b.id === st.id)?.code).toBe('DH');
  });

  it('Status nennt den Bahnhof: ein, hält, aus, durch', () => {
    const { g } = demoGame();
    const st = g.stations()[0];
    g.stationName(st.id, 'Demohausen', 'DH');
    const seen = new Set<string>();
    for (let i = 0; i < 3 * 3600; i += 5) {
      fastForward(g, 5, 5);
      for (const t of g.sim.trains) seen.add(trainStatus(g, t).replace(/[\d:+]+/g, '#'));
    }
    const all = [...seen].join(' | ');
    expect(all).toMatch(/fährt in DH ein/);
    expect(all).toMatch(/hält in DH/);
    expect(all).toMatch(/fährt aus DH aus/);
    expect(all).not.toMatch(/^fährt aus$/m);
  });
});
