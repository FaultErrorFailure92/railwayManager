import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { setMap } from '../src/world/maps';

describe('Hochbahn in der Großstadt (RM-FR-MAP-11)', () => {
  afterEach(() => setMap(undefined));
  it('Pfeiler blockieren, unter der Fahrbahn gehen Gleise aber keine Gebäude', () => {
    setMap('stadt');
    const g = new Game();
    g.money = 1e6;
    for (const t of ['track', 'building'] as const) g.unlocked.add(t);
    expect(g.grid.viaductAt(136, 61)).toBe(2);
    expect(g.grid.viaductAt(136, 59)).toBe(1);
    expect(g.grid.viaductAt(135, 59)).toBe(0);
    expect(g.plan('track', [{ x: 136, y: 61 }]).reason).toContain('Pfeiler');
    expect(g.plan('track', [{ x: 134, y: 59 }, { x: 135, y: 59 }, { x: 136, y: 59 }, { x: 137, y: 59 }]).ok).toBe(true);
    g.research.done.push('wc');
    const house = g.plan('building', [{ x: 136, y: 59 }], 'bld_wc');
    expect(house.ok).toBe(false);
    expect(house.reason).toContain('Hochbahn');
  });
  it('andere Karten haben keine Hochbahn', () => {
    setMap('donau');
    const g = new Game();
    expect(g.grid.viaductAt(136, 61)).toBe(0);
  });
});
