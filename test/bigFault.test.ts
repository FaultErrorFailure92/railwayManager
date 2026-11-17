import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { problems } from '../src/game/Problems';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Großstörungen (RM-FR-EVT-09)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(9); });
  afterEach(() => restore());

  it('sperrt ein Stück Streckengleis, erscheint rot in „Was ist los?“ und läuft von selbst ab', () => {
    const { g } = demoGame();
    expect(g.startBigFault('tree')).toBe(true);
    const f = g.faults.find((x) => x.cells)!;
    expect(f.cells!.length).toBe(5);
    f.cells!.forEach((k) => expect(g.sim.faultCells.has(k)).toBe(true));
    expect(problems(g)[0]).toMatchObject({ level: 'rot', id: `big${f.k}` });
    const end = f.until!;
    fastForward(g, end - g.sim.time + 120);
    expect(g.gameOver).toBe(false);
    expect(g.faults.some((x) => x.cells)).toBe(false);
    f.cells!.forEach((k) => expect(g.sim.faultCells.has(k)).toBe(false));
  }, 60000);

  it('Großeinsatz halbiert die restliche Zeit und kostet Geld (nur einmal)', () => {
    const { g } = demoGame();
    g.startBigFault('wire');
    const f = g.faults.find((x) => x.cells)!;
    const left = f.until! - g.sim.time, m = g.money;
    const p = g.grid.xy(f.cells![0]);
    expect(g.repairFault(p.x, p.y)).toBe(true);
    expect(f.until! - g.sim.time).toBeLessThanOrEqual(Math.ceil(left / 2));
    expect(g.money).toBeLessThan(m);
    expect(g.repairFault(p.x, p.y)).toBe(false);
  });

  it('bleibt nach Speichern und Laden gesperrt', () => {
    const { g } = demoGame();
    g.startBigFault('tree');
    const f = g.faults.find((x) => x.cells)!;
    const g2 = new Game(JSON.parse(JSON.stringify(g.save())));
    f.cells!.forEach((k) => expect(g2.sim.faultCells.has(k)).toBe(true));
  });
});
