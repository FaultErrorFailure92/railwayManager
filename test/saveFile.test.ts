import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { checkSave, parseSaveText, readSaveFile, SAVE_VERSION, toFile } from '../src/game/saveFile';
import { demoGame, fastForward, seedRandom } from './helpers';

const base = () => {
  const g = new Game();
  g.company = 'Test<script>alert(1)</script>';
  g.inbox.push({ id: 1, time: 0, kind: 'letter', title: 't', from: 'f', html: '<p>Hi<img src=x onerror=alert(1)></p>', read: false });
  return g.save();
};

describe('Spielstand-Format (RM-FR-SAVE-02)', () => {
  it('hat Formatversion und Spielversion', () => {
    const s = base();
    expect(s.v).toBe(SAVE_VERSION);
    expect(typeof s.app).toBe('string');
  });
  it('lehnt zu neue und zu alte Versionen mit Meldung ab', () => {
    const s = base();
    expect(checkSave({ ...s, v: 99 })).toMatchObject({ ok: false, error: expect.stringContaining('neueren') });
    expect(checkSave({ ...s, v: 3 })).toMatchObject({ ok: false, error: expect.stringContaining('zu alt') });
  });
});

describe('Export und Import (RM-FR-SAVE-03)', () => {
  it('Export → Import ergibt einen ladbaren Stand mit Label', () => {
    const r = parseSaveText(JSON.stringify(toFile(base(), 'Mein Stand')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Mein Stand');
    expect(() => new Game(r.save)).not.toThrow();
  });
  it('nimmt auch einen nackten Spielstand', () => {
    expect(parseSaveText(JSON.stringify(base())).ok).toBe(true);
  });
  it('liest gzip-Dateien', async () => {
    const txt = JSON.stringify(toFile(base()));
    const gz = await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    expect((await readSaveFile(new Blob([gz]))).ok).toBe(true);
  });
  it('Demobahnhof mit fahrenden Zügen übersteht Export → Import → Weiterspielen', () => {
    const restore = seedRandom(3);
    const { g } = demoGame();
    fastForward(g, 2 * 3600);
    const r = parseSaveText(JSON.stringify(toFile(g.save())));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g2 = new Game(r.save);
    expect(g2.money).toBe(g.money);
    expect(g2.sim.trains.length).toBe(g.sim.trains.length);
    // Fahrwege enthalten < und > als Richtungszeichen – dürfen beim Import nicht verändert werden
    expect(r.save.sim.trains.map((t) => t.route)).toEqual(g.save().sim.trains.map((t) => t.route));
    expect(() => fastForward(g2, 1800)).not.toThrow();
    restore();
  });
});

describe('Importe sind nur Daten (RM-FR-SEC-01)', () => {
  const bad = (mut: (o: any) => void) => { const o = JSON.parse(JSON.stringify(base())); mut(o); return checkSave(o); };
  it.each([
    ['falsche Kartengröße', (o: any) => o.cells.pop()],
    ['Zellwert außerhalb', (o: any) => (o.cells[5] = 5000)],
    ['Geld außerhalb', (o: any) => (o.money = 1e300)],
    ['unbekanntes Gleisteil', (o: any) => o.pieces.push({ id: 999999, key: 'evil', x: 1, y: 1 })],
    ['Gebäude außerhalb der Karte', (o: any) => o.buildings.push({ id: 999999, key: 'bld_station', x: 9999, y: 1, decor: false })],
    ['unbekannte Karte', (o: any) => (o.mapId = 'nope')],
    ['Simulation fehlt', (o: any) => (o.sim = 'x')],
  ])('lehnt ab: %s', (_n, mut) => { expect(bad(mut).ok).toBe(false); });

  it('entfernt HTML aus Texten und gefährliches HTML aus Briefen', () => {
    const r = checkSave(JSON.parse(JSON.stringify(base())));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.company).not.toMatch(/<[a-z/]/i);
    // ohne DOM (Node) wird alles HTML entfernt; im Browser filtert sanitizeHtml Tags und Attribute
    expect(r.save.inbox![0].html).not.toContain('<');
  });
  it('lehnt unendliche Zahlen und Müll ab', () => {
    expect(parseSaveText(JSON.stringify(base()).replace('{', '{"x":1e999,')).ok).toBe(false);
    expect(parseSaveText('kein json').ok).toBe(false);
  });
  it('entfernt __proto__ (keine Prototype-Pollution)', () => {
    const r = parseSaveText(JSON.stringify(base()).replace('"contracts":{', '"contracts":{"__proto__":{"polluted":1},'));
    expect(r.ok).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
  });
  it('lehnt zu tiefe Verschachtelung ab', () => {
    let deep: any = {}; const root = deep;
    for (let i = 0; i < 100; i++) { deep.a = {}; deep = deep.a; }
    expect(bad((o) => (o.stats.x = root)).ok).toBe(false);
  });
  it('lehnt Zip-Bomben ab', async () => {
    const bomb = await new Response(new Blob([new Uint8Array(100 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    expect((await readSaveFile(new Blob([bomb]))).ok).toBe(false);
  });
});
