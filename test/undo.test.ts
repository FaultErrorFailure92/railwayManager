import { beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../src/game/Game';
import { freshGame } from './helpers';

const fp = (g: Game) => { const s = g.save(); return JSON.stringify([s.cells, s.sortDest, s.pieces, s.buildings, s.owned, s.links]); };

describe('Rückgängig und Wiederholen (RM-FR-BUILD-11)', () => {
  let g: Game, x0 = -1, row = -1;
  const line = () => [...Array(8)].map((_, i) => ({ x: x0 + i, y: row }));
  beforeEach(() => {
    g = freshGame();
    x0 = row = -1;
    for (let y = 0; y < g.grid.h && row < 0; y++) for (let x = 0; x < g.grid.w - 8; x++) {
      if ([...Array(8)].every((_, i) => g.grid.isOwned(x + i, y)) && g.plan('track', [...Array(8)].map((_, i) => ({ x: x + i, y }))).ok) { row = y; x0 = x; break; }
    }
    expect(row).toBeGreaterThanOrEqual(0);
  });

  it('nimmt Bauen zurück und bucht die Kosten zurück', () => {
    const s0 = fp(g), m0 = g.money;
    const p = g.build('track', line());
    expect(p.ok).toBe(true);
    expect(g.money).toBe(m0 - p.cost);
    expect(g.undo().ok).toBe(true);
    expect(fp(g)).toBe(s0);
    expect(g.money).toBe(m0);
    expect(g.undo().ok).toBe(false);
  });

  it('wiederholt in der richtigen Reihenfolge', () => {
    g.build('track', line());
    const s1 = fp(g);
    expect(g.build('signal', [{ x: x0 + 3, y: row }], 'E').ok).toBe(true);
    const s2 = fp(g), m2 = g.money;
    g.undo(); g.undo();
    expect(g.redo().ok).toBe(true);
    expect(fp(g)).toBe(s1);
    expect(g.redo().ok).toBe(true);
    expect(fp(g)).toBe(s2);
    expect(g.money).toBe(m2);
  });

  it('Abriss mehrerer Teile ist ein Schritt', () => {
    g.build('track', line());
    const s1 = fp(g);
    expect(g.build('remove', line()).ok).toBe(true);
    expect(g.undoLog.peekUndo()?.label).toBe('Abriss');
    expect(g.undo().ok).toBe(true);
    expect(fp(g)).toBe(s1);
  });

  it('neue Aktion leert Wiederholen', () => {
    g.build('track', line());
    g.undo();
    expect(g.undoLog.canRedo).toBe(true);
    g.build('platform', [{ x: x0, y: row + 1 }]);
    expect(g.undoLog.canRedo).toBe(false);
  });

  it('verweigert, wenn sich die Stelle inzwischen geändert hat', () => {
    g.build('platform', [{ x: x0, y: row + 1 }]);
    g.grid.get(x0, row + 1)!.platform = false;
    const r = g.undo();
    expect(r.ok).toBe(false);
    expect(g.undoLog.canUndo).toBe(false);
  });

  it('verweigert, solange ein Zug auf den Feldern steht', () => {
    g.build('track', line());
    g.build('signal', [{ x: x0 + 5, y: row }], 'E');
    const k = g.grid.key(x0 + 5, row);
    g.sim.owner[k] = 4711;
    expect(g.undo()).toMatchObject({ ok: false, text: expect.stringContaining('Zug') });
    g.sim.owner[k] = 0;
    expect(g.undo().ok).toBe(true);
  });

  it('Wiederholen ohne Geld geht nicht', () => {
    g.build('track', line());
    g.undo();
    g.money = 0;
    expect(g.redo()).toMatchObject({ ok: false, text: expect.stringContaining('Zu wenig Geld') });
  });

  it('Rückbuchung zählt nicht als Einnahme', () => {
    const before = g.today().income;
    g.build('track', line());
    g.undo();
    expect(g.today().income).toBe(before);
  });
});
