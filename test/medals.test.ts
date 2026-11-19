import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_MEDALS, CAREER, syncMedals } from '../src/game/Medals';
import { createProfile, listProfiles, updateProfile } from '../src/game/Profiles';
import { randomMap, setMap, currentMap } from '../src/world/maps';
import { fairPrice } from '../src/game/Contracts';
import { OPERATORS } from '../src/sim/Operators';
import { storyCount } from '../src/game/Story';
import { addBonus, takeBonus } from '../src/game/Profiles';
import { demoGame, seedRandom } from './helpers';
import { loadTemplates } from '../src/game/Templates';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage;

describe('Stempel, Zufallskarten, Automatik, Geschichte, Neustart-Bonus', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(3); });
  afterEach(() => { restore(); setMap(undefined); });

  it('Erfolge und Laufbahn landen als Stempel im Profil', () => {
    const p = createProfile('Test AG', { name: 'B', title: '', avatar: 1 });
    expect(ALL_MEDALS.length).toBeGreaterThan(50);
    const fresh = syncMedals(p.id, ['first']);
    expect(fresh.map((m) => m.id)).toContain('first');
    updateProfile(p.id, { chapters: ['donau'] });
    expect(syncMedals(p.id).map((m) => m.id)).toContain('c-ch1');
    expect(syncMedals(p.id, ['first'])).toHaveLength(0);
    const q = listProfiles().find((x) => x.id === p.id)!;
    expect(Object.keys(q.medals ?? {})).toEqual(expect.arrayContaining(['first', 'c-ch1']));
    expect(CAREER.every((m) => m.check)).toBe(true);
  });

  it('Neustart-Bonus wird gutgeschrieben und einmal eingelöst', () => {
    const p = createProfile('Bonus AG', { name: 'B', title: '', avatar: 1 });
    addBonus(p.id, 3000);
    expect(takeBonus(p.id)).toBe(3000);
    expect(takeBonus(p.id)).toBe(0);
  });

  it('Zufallskarte: gleicher Startwert = gleiche Karte', () => {
    const a = randomMap(4711), b = randomMap(4711), c = randomMap(4712);
    expect(a).toEqual(b);
    expect(a.villages).not.toEqual(c.villages);
    setMap('zufall-4711');
    expect(currentMap().id).toBe('zufall-4711');
    expect(currentMap().base).toBeDefined();
  });

  it('Automatik hält Vertragspreise fair', () => {
    const { g } = demoGame();
    const id = 'ro' as const;
    g.setPrice(id, 'short', 999);
    g.toggleAutoPrice(id);
    expect(g.contracts[id].price.short).toBe(fairPrice(OPERATORS[id], 'short'));
    g.setPrice(id, 'short', 300);
    expect(g.contracts[id].auto).toBe(false);
  });

  it('jede spielbare Kampagnenkarte hat Briefe der Figuren', () => {
    for (const m of ['donau', 'ebene', 'revier', 'schnee', 'alpen', 'wueste']) expect(storyCount(m)).toBeGreaterThan(0);
  });
});

describe('Kopieren und Vorlagen (RM-FR-BUILD-13)', () => {
  it('Bereich kopieren und woanders einfügen', () => {
    const { g } = demoGame();
    g.money = 1e6;
    // Bahnhofsbereich des Demobahnhofs (Bahnsteige und Gleis 2)
    const area: { x: number; y: number }[] = [];
    for (let y = 62; y <= 65; y++) for (let x = 120; x <= 134; x++) area.push({ x, y });
    expect(g.build('copy', area, 'copy').ok).toBe(true);
    const tpl = loadTemplates()[0]!;
    expect(tpl.platform.length).toBeGreaterThan(0);
    // weiter oben ist frei: einfügen
    const at = { x: 120, y: 76 };
    const r = g.plan('copy', [at], 'tpl1');
    expect(r.ok ? 'ok' : r.reason).toBe('ok');
    const m = g.money;
    g.build('copy', [at], 'tpl1');
    expect(g.money).toBeLessThan(m);
    expect(g.grid.get(at.x + tpl.platform[0][0], at.y + tpl.platform[0][1])!.platform).toBe(true);
    expect(g.plan('copy', [at], 'tpl3').ok).toBe(false);
  });
});
