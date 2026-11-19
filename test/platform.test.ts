import { describe, expect, it } from 'vitest';
import { applyStore, isDesktop, snapshot } from '../src/platform/Platform';

/** einfacher Browser-Speicher für Tests */
function mem(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

// RM-FR-STEAM-03: Spielstände als Datei, Steam Cloud gleicht ab
describe('Plattform', () => {
  it('im Browser ist keine Desktop-App', () => {
    expect(isDesktop()).toBe(false);
  });

  it('nimmt nur Spiel-Schlüssel in die Datei', () => {
    const ls = mem({ railway_manager_save_v4: 'a', rm_profiles: 'b', fremd: 'x', rm_sync_at: '5' });
    expect(snapshot(ls)).toEqual({ railway_manager_save_v4: 'a', rm_profiles: 'b' });
  });

  it('übernimmt nur eine neuere Datei und ersetzt dann alle Spiel-Schlüssel', () => {
    const ls = mem({ railway_manager_save_v4: 'alt', railway_manager_slot_x: 'weg', fremd: 'bleibt', rm_sync_at: '100' });
    expect(applyStore({ v: 1, at: 50, keys: { railway_manager_save_v4: 'älter' } }, ls)).toBe(false);
    expect(ls.getItem('railway_manager_save_v4')).toBe('alt');
    expect(applyStore({ v: 1, at: 200, keys: { railway_manager_save_v4: 'neu', fremd: 'nein' } }, ls)).toBe(true);
    expect(ls.getItem('railway_manager_save_v4')).toBe('neu');
    expect(ls.getItem('railway_manager_slot_x')).toBeNull();
    expect(ls.getItem('fremd')).toBe('bleibt');
    expect(ls.getItem('rm_sync_at')).toBe('200');
  });
});
