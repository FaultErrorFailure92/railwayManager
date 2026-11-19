import { afterEach, describe, expect, it } from 'vitest';
import { MAIN_ROW } from '../src/config';
import { Game } from '../src/game/Game';
import { currentMap, setMap } from '../src/world/maps';

describe('Öffentliche Straßen mit Bahnübergang (RM-FR-MAP-08)', () => {
  afterEach(() => setMap(undefined));
  it('jede Karte hat Straßen, die die Strecke kreuzen', () => {
    for (const id of ['donau', 'ebene', 'revier', 'schnee', 'alpen', 'wueste', 'stadt']) {
      setMap(id);
      const g = new Game();
      const xs = currentMap().roads ?? [];
      expect(xs.length).toBeGreaterThan(0);
      for (const x of xs) {
        const c = g.grid.get(x, MAIN_ROW)!;
        expect(c.road && c.track).toBe(true);
        // keine Bäume oder Häuser auf der Straße
        for (let y = 0; y < g.grid.h; y++) { const cc = g.grid.get(x, y)!; if (cc.road) expect(cc.building).toBeNull(); }
      }
    }
  });
  it('Straße der Gemeinde kann man nicht abreißen, Gleis darüber kostet einen Bahnübergang', () => {
    setMap('donau');
    const g = new Game();
    g.money = 1e6;
    g.unlocked.add('track'); g.unlocked.add('remove');
    const x = currentMap().roads![0];
    for (let px = 0; px < g.grid.pw; px++) for (let py = 0; py < g.grid.ph; py++) g.grid.owned[py * g.grid.pw + px] = true;
    const y = MAIN_ROW - 4;
    expect(g.plan('remove', [{ x, y }]).ok).toBe(false);
    const plain = g.plan('track', [{ x: x + 2, y }, { x: x + 3, y }]);
    const over = g.plan('track', [{ x, y }, { x: x + 1, y }]);
    expect(plain.ok && over.ok).toBe(true);
    expect(over.cost - plain.cost).toBeGreaterThanOrEqual(400);
  });
});
