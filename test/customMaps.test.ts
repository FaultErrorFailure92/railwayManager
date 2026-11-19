import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import {
  activeCustom, checkMap, cleanMap, exportMap, importMap, loadMaps, migrateCompanies, newMap, prepareMap, saveMaps, toMapDef, useCustomMap,
} from '../src/game/CustomMaps';
import { loadCompanies, newCompany, saveCompanies } from '../src/game/Companies';
import { applySetup, freeDefaults } from '../src/game/FreePlay';
import { checkSave } from '../src/game/saveFile';
import { OPERATORS } from '../src/sim/Operators';
import { currentMap, MAPS, setMap } from '../src/world/maps';
import { mapOverrides } from '../src/game/CustomMaps';

// localStorage für die Bibliothek
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

const player = { name: 'B', title: '' as const, avatar: 1 };

describe('Eigene Karten (RM-FR-MOD-04, MOD-05)', () => {
  beforeEach(() => mem.clear());
  afterEach(() => setMap('donau'));

  it('jede Vorlage lässt sich kopieren und ist ohne Fehler spielbar', () => {
    for (const m of MAPS) {
      const c = newMap(m.id);
      expect(c.id.startsWith('eigen-')).toBe(true);
      const errs = checkMap(c).filter((x) => x.level === 'error');
      expect(errs, m.id).toEqual([]);
    }
  });

  it('Prüfen findet Fehler: Straße durchs Werk, kein Regionalverkehr', () => {
    const c = newMap('donau');
    c.roads.push(c.sawmill!);
    c.off = [...toMapDef(c).tenderRegio];
    const texts = checkMap(c).filter((x) => x.level === 'error').map((x) => x.text).join(' | ');
    expect(texts).toMatch(/Straße führt durchs Werk/);
    expect(texts).toMatch(/Regionalverkehr/);
  });

  it('Werke und Fremdbahnen lassen sich abschalten und verschieben', () => {
    const c = newMap('donau');
    c.sawmill = null; c.mine = 120; c.ls = false;
    const d = toMapDef(c);
    expect(d.industries.map((i) => i.id)).toEqual(['mine']);
    expect(d.industries[0].x).toBe(120);
    expect(d.foreignLines?.map((l) => l.op)).toEqual(['ln']);
    expect(checkMap(c).some((x) => x.level === 'error')).toBe(false);
  });

  it('Datei: Export → Import ergibt dieselbe Karte; fremde Eingaben werden gekürzt und gereinigt', () => {
    const c = newMap('alpen');
    c.name = 'Mein Tal';
    c.companies.push({ ...newCompany('ro'), name: 'Talbahn' });
    c.use.ro = c.companies[0].id;
    const r = importMap(exportMap(c), []);
    expect(r.error).toBeUndefined();
    expect(r.map).toMatchObject({ id: c.id, name: 'Mein Tal', base: 'alpen' });
    expect(r.map!.use.ro).toBe(c.companies[0].id);
    const bad = cleanMap({ ...c, name: '<b>X</b>'.repeat(20), base: 'alpen', lakes: Array(99).fill({ x: 9999, y: -5, rx: 99, ry: 0 }), startMoney: 1e12, use: { ro: 'gibtsnicht' } })!;
    expect(bad.name).not.toMatch(/[<>]/);
    expect(bad.name.length).toBeLessThanOrEqual(32);
    expect(bad.lakes.length).toBeLessThanOrEqual(12);
    expect(bad.lakes[0]).toEqual({ x: 255, y: 0, rx: 14, ry: 2 });
    expect(bad.startMoney).toBe(50000);
    expect(bad.use).toEqual({});
    expect(cleanMap({ base: 'mond' })).toBeUndefined();
    expect(importMap('{"format":"etwas"}', []).error).toBeTruthy();
  });

  it('Spiel auf eigener Karte: Karte und Unternehmen im Spielstand, Laden ohne Bibliothek', () => {
    const c = newMap('ebene');
    c.name = 'Steppe Plus';
    c.companies.push({ ...newCompany('ro'), name: 'Steppenexpress', short: 'SX', color: '#123456' });
    c.use.ro = c.companies[0].id;
    saveMaps([c]);
    prepareMap(c.id);
    setMap(c.id);
    expect(currentMap().name).toBe('Steppe Plus');
    const g = new Game();
    applySetup(g, { mode: 'free', map: c.id, profileId: '', company: 'Test', player, cfg: { ...freeDefaults(c.id, c.startMoney), custom: mapOverrides(c) } });
    expect(OPERATORS.ro.name).toBe('Steppenexpress');
    const s = JSON.parse(JSON.stringify(g.save()));
    expect(s.mapId).toBe(c.id);
    expect(s.customMap.name).toBe('Steppe Plus');
    expect(checkSave(s).ok).toBe(true);
    // Bibliothek leer: Karte kommt aus dem Spielstand
    mem.clear();
    setMap('donau');
    prepareMap(s.mapId, s.customMap);
    setMap(s.mapId);
    const g2 = new Game(s);
    expect(currentMap().name).toBe('Steppe Plus');
    expect(activeCustom(c.id)?.name).toBe('Steppe Plus');
    expect(g2.grid.cells.filter((x) => x.track).length).toBe(g.grid.cells.filter((x) => x.track).length);
    // ohne Karte im Spielstand ist eine eigene Kennung ungültig
    expect(checkSave({ ...s, customMap: undefined }).ok).toBe(false);
  });

  it('Umstieg: Unternehmen aus dem alten Editor landen in einer eigenen Karte', () => {
    saveCompanies([{ ...newCompany('ro'), name: 'Altbahn' }, { ...newCompany('cd'), name: 'Altfracht' }]);
    const m = migrateCompanies()!;
    expect(m.companies.map((x) => x.name)).toEqual(['Altbahn', 'Altfracht']);
    expect(Object.keys(m.use).sort()).toEqual(['cd', 'ro']);
    expect(loadCompanies()).toEqual([]);
    expect(loadMaps().map((x) => x.id)).toEqual([m.id]);
    expect(migrateCompanies()).toBeUndefined();
  });

  it('angemeldete Karte bleibt auch nach anderer Karte abrufbar', () => {
    const c = newMap('schnee');
    useCustomMap(c);
    setMap('donau');
    setMap(c.id);
    expect(currentMap().id).toBe(c.id);
    expect(currentMap().ground).toBe('snow');
  });
});
