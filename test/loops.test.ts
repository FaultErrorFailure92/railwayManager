import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { MAIN_ROW, PASSING_LOOPS, SECOND_ROW } from '../src/config';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Kreuzungsstellen nach dem zweigleisigen Ausbau', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(8); });
  afterEach(() => restore());

  it('Netzbetreiber baut die Kreuzungsstelle auf deinem Gelände ab, danach kannst du anschließen', () => {
    const { g } = demoGame();
    // Gelände über die Kreuzungsstelle 154–168 kaufen
    for (let px = 18; px <= 21; px++) for (let py = 3; py <= 4; py++) g.grid.buyParcel(px, py);
    const loop = PASSING_LOOPS.find(([a]) => a === 154)!;
    expect(g.grid.loopStanding(loop)).toBe(true);
    g.research.done.push('double');
    g.ensureSecondTrack();
    expect(g.grid.mainRows).toContain(SECOND_ROW);
    fastForward(g, 3 * 3600);
    expect(g.grid.loopStanding(loop)).toBe(false);
    expect(g.grid.isLoopCell(160, MAIN_ROW)).toBe(false);
    // Signale der Kreuzungsstelle sind weg, beide Streckengleise durchgehend
    for (const y of [MAIN_ROW, SECOND_ROW]) {
      expect(g.grid.get(loop[1] - 1, y)!.signal).toBe(false);
      expect(g.grid.get(loop[0] + 3, y)!.signalW).toBe(false);
      for (let x = loop[0]; x <= loop[1] + 2; x++) expect(g.grid.get(x, y)!.track).toBe(true);
    }
    // Gleiswechsel mitten in der ehemaligen Kreuzungsstelle bauen
    let r = g.build('switch', [{ x: 163, y: MAIN_ROW }], 'xover_down');
    for (let i = 0; i < 600 && r.reason === 'Gleis ist gerade befahren'; i++) { fastForward(g, 5, 5); r = g.build('switch', [{ x: 163, y: MAIN_ROW }], 'xover_down'); }
    expect(r.reason ?? 'ok').toBe('ok');
  });

  it('ohne zweites Gleis bleibt die Kreuzungsstelle stehen', () => {
    const g = new Game();
    g.startMission();
    expect(PASSING_LOOPS.some((l) => g.grid.loopStanding(l))).toBe(true);
    expect(g.grid.isLoopCell(PASSING_LOOPS[0][0] + 5, MAIN_ROW)).toBe(true);
  });
});
