import { describe, expect, it } from 'vitest';
import { Game, type GameSave } from '../src/game/Game';
import { checkSave, SAVE_VERSION } from '../src/game/saveFile';
import { shiftKey } from '../src/game/saveMigrate';
import { MAIN_ROW, MAP_H, MAP_W, ROW0 } from '../src/config';
import { demoGame, fastForward, seedRandom } from './helpers';

/** heutigen Spielstand in einen der früheren, halb so hohen Karte (Format 5) zurückverwandeln – so sahen alte Stände aus */
function shrink(s: GameSave): GameSave {
  const o = JSON.parse(JSON.stringify(s)) as GameSave;
  const keep = (k: number) => k >= ROW0 * MAP_W && k < (ROW0 + 64) * MAP_W;
  const back = (k: string) => k.replace(/^p:(\d+),(\d+)([<>])$/, (_, x, y, d) => `p:${x},${Number(y) - ROW0}${d}`).replace(/^(IN|OUT)_(E|W):(\d+)$/, (_, a, b, r) => `${a}_${b}:${Number(r) - ROW0}`);
  o.v = 5;
  o.cells = o.cells.filter((_, k) => keep(k));
  o.sortDest = o.sortDest.filter((_, k) => keep(k));
  o.pieces = o.pieces.filter((p) => p.y >= ROW0 && p.y < ROW0 + 64).map((p) => ({ ...p, y: p.y - ROW0 }));
  o.buildings = o.buildings.filter((b) => b.y >= ROW0 && b.y < ROW0 + 62).map((b) => ({ ...b, y: b.y - ROW0 }));
  o.links = o.links.map((l) => ({ ...l, y0: l.y0 - ROW0, y1: l.y1 - ROW0 }));
  const pw = MAP_W / 8;
  o.owned = o.owned.slice(4 * pw, 12 * pw);
  o.mainRows = o.mainRows.map((r) => r - ROW0);
  o.faults = [];
  o.wear = {};
  for (const list of [o.sim.queue, o.sim.trains]) for (const t of list) {
    t.route = t.route.map(back);
    t.reserved = t.reserved.map((k) => k - ROW0 * MAP_W);
  }
  return o;
}

describe('Doppelt so hohe Welt (RM-FR-MAP-12)', () => {
  it('Karte ist 256 × 128, die Strecke liegt in der Mitte', () => {
    const g = new Game();
    expect(g.grid.h).toBe(MAP_H);
    expect(MAP_H).toBe(128);
    expect(g.grid.get(0, MAIN_ROW)!.track).toBe(true);
    // in den neuen Streifen oben und unten gibt es Landschaft
    const outer = [...g.grid.buildings.values()].filter((b) => b.y < ROW0 || b.y >= ROW0 + 64).length;
    expect(outer).toBeGreaterThan(50);
  });

  it('Fahrweg-Kennungen rücken mit', () => {
    expect(shiftKey('p:12,31>')).toBe(`p:12,${31 + ROW0}>`);
    expect(shiftKey('IN_W:32')).toBe(`IN_W:${32 + ROW0}`);
    expect(shiftKey('q:17:1<')).toBe('q:17:1<');
  });

  it('Spielstand der halb so hohen Karte (Format 5) lädt: Bahnhof, Züge und Verträge bleiben, die neuen Streifen bekommen Landschaft', () => {
    const undo = seedRandom(2);
    const { g } = demoGame();
    fastForward(g, 3600);
    const now = g.save();
    const old = shrink(now);
    const r = checkSave(JSON.parse(JSON.stringify(old)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.v).toBe(SAVE_VERSION);
    const g2 = new Game(r.save);
    // Gleise, Bahnsteige und Gebäude am selben Ort
    const tracks = (x: Game) => x.grid.cells.filter((c, k) => c.track && k >= ROW0 * MAP_W && k < (ROW0 + 64) * MAP_W).length;
    expect(tracks(g2)).toBe(tracks(g));
    expect(g2.stations().map((b) => [b.x, b.y, b.name])).toEqual(g.stations().map((b) => [b.x, b.y, b.name]));
    expect(g2.platformRuns().map((p) => p.id)).toEqual(g.platformRuns().map((p) => p.id));
    // Züge fahren weiter
    expect(g2.sim.trains.length).toBe(g.sim.trains.filter((t) => t.route.every((e) => e.cells.every((k) => k >= ROW0 * MAP_W && k < (ROW0 + 64) * MAP_W))).length);
    expect(g2.contracts.ro.status).toBe('active');
    // Landschaft in den neuen Streifen
    expect([...g2.grid.buildings.values()].filter((b) => b.y < ROW0).length).toBeGreaterThan(20);
    fastForward(g2, 1800);
    expect(g2.gameOver).toBe(false);
    undo();
  });
});
