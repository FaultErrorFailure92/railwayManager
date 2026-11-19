import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { applySetup, freeDefaults } from '../src/game/FreePlay';
import { clean, crest, exportCompanies, importCompanies, newCompany, overridesFor } from '../src/game/Companies';
import { contactOf } from '../src/game/Board';
import { OP_DEFAULTS, OPERATORS } from '../src/sim/Operators';
import { setMap } from '../src/world/maps';

const player = { name: 'B', title: '' as const, avatar: 1 };

describe('Eigene Bahnunternehmen (RM-FR-MOD-01 … 03)', () => {
  afterEach(() => setMap('donau'));

  it('Eingaben werden geprüft: unbekannte Vorlage, HTML und falsche Farben fliegen raus', () => {
    expect(clean({ base: 'xx', name: 'A' })).toBeUndefined();
    expect(clean({ base: 'fx', name: 'Sonder' })).toBeUndefined(); // Sonderzug ist keine Vorlage
    const c = clean({ base: 'ro', name: '<b>Murtal</b>bahn', short: 'MURTAL', color: 'red', seed: -5 })!;
    expect(c.name).toBe('bMurtal/bbahn');
    expect(c.short).toBe('MURT');
    expect(c.color).toBe(OP_DEFAULTS.ro.color);
    expect(c.seed).toBe(5);
  });

  it('Export und Import ergeben dasselbe; kaputte Dateien melden einen Fehler', () => {
    const a = { ...newCompany('ro'), name: 'Murtalbahn', color: '#123456' };
    const file = exportCompanies([a]);
    const r = importCompanies(file, []);
    expect(r.error).toBeUndefined();
    expect(r.list[0]).toMatchObject({ id: a.id, name: 'Murtalbahn', color: '#123456', base: 'ro' });
    // gleiche ID ersetzt, nicht doppelt
    expect(importCompanies(file, r.list).list.length).toBe(1);
    expect(importCompanies('kein json', []).error).toBeTruthy();
    expect(importCompanies('{"format":"anders"}', []).error).toBeTruthy();
    expect(crest(a)).toContain('#123456');
  });

  it('im freien Spiel: eigenes Unternehmen ersetzt die Vorlage, abgewählte kommen nicht', () => {
    setMap('donau');
    const c = { ...newCompany('ro'), name: 'Murtalbahn', short: 'MB', color: '#123456', rep: 'Dr. Anna Murer', role: 'Vorstand' };
    const g = new Game();
    const cfg = { ...freeDefaults('donau', 8000), custom: overridesFor([c], { ro: c.id }), off: ['wx' as const, 'cd' as const] };
    applySetup(g, { mode: 'free', map: 'donau', cfg, profileId: '', company: 'T', player });
    expect(OPERATORS.ro.name).toBe('Murtalbahn');
    expect(OPERATORS.ro.short).toBe('MB');
    expect(contactOf('ro', OPERATORS.ro.name).name).toBe('Dr. Anna Murer');
    const allowed = (g as unknown as { allowedOps: (o: string[]) => string[] }).allowedOps.bind(g);
    expect(allowed(['ro', 'wx'])).toEqual(['ro']);
    expect(allowed(['wx', 'cd'])).toEqual(['wx', 'cd']); // nie leer
    // Spielstand behält das eigene Unternehmen
    const g2 = new Game(JSON.parse(JSON.stringify(g.save())));
    expect(OPERATORS.ro.name).toBe('Murtalbahn');
    expect(g2.freeCfg?.off).toContain('wx');
    // Kampagne/neue Karte: wieder Original
    setMap('donau');
    new Game();
    expect(OPERATORS.ro.name).toBe(OP_DEFAULTS.ro.name);
    expect(contactOf('ro', OPERATORS.ro.name).name).not.toBe('Dr. Anna Murer');
  });
});
