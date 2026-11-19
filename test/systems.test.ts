import { describe, expect, it } from 'vitest';
import { systemOn } from '../src/game/Systems';

describe('Systeme je Kapitel (CPX-01)', () => {
  it('Kampagne: erst ab dem einführenden Kapitel', () => {
    const g = { mode: 'campaign' as const };
    expect(systemOn(g, 'staff', 'donau')).toBe(false);
    expect(systemOn(g, 'staff', 'schnee')).toBe(true);
    expect(systemOn(g, 'dispo', 'schnee')).toBe(false);
    expect(systemOn(g, 'dispo', 'alpen')).toBe(true);
    expect(systemOn(g, 'loan', 'alpen')).toBe(false);
    expect(systemOn(g, 'grants', 'wueste')).toBe(true);
  });
  it('freies Spiel: alles da', () => {
    expect(systemOn({ mode: 'free' }, 'loan', 'donau')).toBe(true);
  });
});
