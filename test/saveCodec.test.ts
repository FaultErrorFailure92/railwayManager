import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../src/game/saveCodec';
import { parseSaveText } from '../src/game/saveFile';
import { Game } from '../src/game/Game';
import { demoGame, fastForward } from './helpers';

describe('Kompakte Spielstände (RM-FR-PERF-04)', () => {
  const { g } = demoGame();
  fastForward(g, 3600);
  const s = g.save();

  it('Kodieren und Dekodieren ergibt denselben Spielstand', () => {
    const back = decodeSave(JSON.parse(JSON.stringify(encodeSave(s))));
    expect(back).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('ist höchstens ein Drittel so groß', () => {
    const plain = JSON.stringify(s).length, small = JSON.stringify(encodeSave(s)).length;
    expect(small).toBeLessThan(plain / 3);
  });

  it('lädt in unter 2 s', () => {
    const txt = JSON.stringify(encodeSave(s));
    const t0 = performance.now();
    const g2 = new Game(decodeSave(JSON.parse(txt)) as never);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(g2.money).toBe(g.money);
  });

  it('alte, nicht kompakte Stände bleiben lesbar', () => {
    expect(decodeSave(s)).toBe(s);
  });

  it('kaputte Kompaktform wird beim Import abgelehnt', () => {
    const bad = encodeSave(s) as Record<string, unknown>;
    expect(parseSaveText(JSON.stringify({ ...bad, cells: [1e9, 1] })).ok).toBe(false);
    expect(parseSaveText(JSON.stringify({ ...bad, n: 5 })).ok).toBe(false);
    expect(parseSaveText(JSON.stringify({ ...bad, buildings: [['evil'], [1, 0, 1, 1, 0, 0, 0]] })).ok).toBe(false);
    expect(parseSaveText(JSON.stringify(bad)).ok).toBe(true);
  });
});
