import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { MAPS, setMap } from '../src/world/maps';
import { foreignLines, lineLayout } from '../src/world/foreign';
import { WATER } from '../src/world/Grid';
import { foreignBlock, foreignConnected, foreignPaxBonus, foreignProblems, foreignSlots, toggleForeignMode } from '../src/game/Foreign';
import { problems } from '../src/game/Problems';
import { freeDefaults } from '../src/game/FreePlay';
import { fastForward, freshGame, seedRandom } from './helpers';

describe('Fremdbahnen (RM-FR-MAP-09)', () => {
  afterEach(() => setMap('donau'));

  it('jede Karte: Fremdbahnen liegen vollständig, mit eigenen Ein- und Ausfahrten, außerhalb des Startgeländes', () => {
    for (const m of MAPS) {
      setMap(m.id);
      const g = new Game();
      expect(g.grid.foreignLaid.length, m.id).toBe(foreignLines().length);
      for (const l of foreignLines()) {
        const { straight, pieces } = lineLayout(l, g.grid.w);
        for (const c of straight) expect(g.grid.get(c.x, c.y)!.track, `${m.id} ${c.x},${c.y}`).toBe(true);
        for (const p of pieces) expect(g.grid.pieces.get(g.grid.get(p.x, p.y)!.piece!)?.key, `${m.id} ${p.key}`).toBe(p.key);
        for (const c of straight) expect(g.grid.isOwned(c.x, c.y)).toBe(false);
        // Bögen nicht im Wasser
        for (const p of pieces) for (const c of g.grid.footprint(p.key, p.x, p.y)) expect(g.grid.terrain[g.grid.key(c.x, c.y)], `${m.id} Wasser bei ${c.x},${c.y}`).not.toBe(WATER);
        const ins = g.net.entries.filter((e) => e.line === l.op);
        expect(ins.length, m.id).toBe(2);
        // die Fremdbahn ist durchgehend befahrbar (Ost und West)
        for (const e of ins) expect(g.net.paths(e.to, false).some((p) => p[p.length - 1].line === l.op), `${m.id} ${e.key}`).toBe(true);
        // und nicht mit der Hauptstrecke verbunden
        for (const e of ins) expect(g.net.paths(e.to, false).every((p) => p[p.length - 1].line === l.op)).toBe(true);
      }
    }
  });
});

/** freies Spiel: Fremdbahnen sind da (Kampagne erst ab Industrierevier) */
const fresh = () => { const g = freshGame(); g.mode = 'free'; return g; };

describe('Fremdbahn-Verträge (RM-FR-MAP-09, RM-FR-PROG-06)', () => {
  afterEach(() => setMap('donau'));

  /** Haltepunkt an der Nordbahn: Bahnsteig direkt an ihrem nahen Abschnitt, Empfangsgebäude dahinter */
  const halt = (g: Game) => {
    for (let px = 14; px <= 17; px++) g.grid.buyParcel(px, 6);
    const plat = Array.from({ length: 10 }, (_, i) => ({ x: 120 + i, y: 53 }));
    expect(g.build('platform', plat).ok).toBe(true);
    const st = g.build('building', [{ x: 123, y: 54 }], 'bld_station');
    expect(st.ok ? 'ok' : st.reason).toBe('ok');
  };

  it('ohne Vertrag fahren Fremdbahn-Züge nur als Kulisse: keine Kasse, keine Statistik, keine Strafe', () => {
    setMap('donau');
    const restore = seedRandom(3);
    const g = fresh();
    const money = g.money;
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      fastForward(g, 900);
      seen += g.sim.trains.filter((t) => t.deco && t.op.foreign).length;
      for (const t of g.sim.trains) if (t.op.foreign) expect(t.deco).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
    expect(g.stats.handled).toBe(0);
    expect(g.money).toBeLessThanOrEqual(money); // nur eigene Kosten, keine Einnahmen von der Fremdbahn
    expect(g.stats.opStats?.ln).toBeUndefined();
    expect(g.sim.deadlock).toBeNull();
    restore();
  });

  it('angeschlossen ohne Forschung: kein Vertrag; mit „Formular A38“ ruft der Betreiber an', () => {
    setMap('donau');
    const g = fresh();
    halt(g);
    expect(foreignConnected(g, 'ln')).toBe(true);
    expect(foreignConnected(g, 'ls')).toBe(false);
    expect(g.offers.open?.ops ?? []).not.toContain('ln');
    expect(foreignBlock(g, 'ln')).toMatch(/Formular A38/);
    g.research.done.push('link1');
    g.offers.open = null;
    g.rebuild();
    expect(g.offers.open?.ops).toEqual(['ln']);
    expect(g.acceptOffer('ln')).toBe(true);
    expect(g.contracts.ln.status).toBe('active');
    expect(g.contracts.ln.mode).toBe('stop');
    // zweiter Anschluss braucht die zweite Forschung
    expect(foreignSlots(g)).toBe(1);
  });

  it('mit Vertrag halten die Züge am Haltepunkt und zahlen; Umsteiger bringen mehr Fahrgäste', () => {
    setMap('donau');
    const restore = seedRandom(5);
    const g = fresh();
    halt(g);
    g.research.done.push('link1');
    g.offers.open = null;
    g.rebuild();
    g.acceptOffer('ln');
    g.stepTakt('ln', -1);
    expect(foreignPaxBonus(g)).toBeCloseTo(0.05);
    fastForward(g, 10 * 3600);
    expect(g.stats.opStats?.ln?.handled ?? 0).toBeGreaterThan(0);
    expect(g.sim.deadlock).toBeNull();
    restore();
  });

  it('Durchfahren erst mit Forschung; dann halten die Züge nicht mehr', () => {
    setMap('donau');
    const g = fresh();
    halt(g);
    g.research.done.push('link1');
    g.offers.open = null;
    g.rebuild();
    g.acceptOffer('ln');
    expect(toggleForeignMode(g, 'ln')).toBe(false);
    g.research.done.push('linkThru');
    expect(toggleForeignMode(g, 'ln')).toBe(true);
    expect(g.contracts.ln.mode).toBe('through');
    expect(foreignPaxBonus(g)).toBe(0);
    for (const t of g.sim.queue.filter((q) => q.op.id === 'ln' && !q.deco)) expect(t.jobs[0]).toMatchObject({ k: 'exit', via: true });
  });

  it('Anschluss abgebaut: Vertrag endet, Züge fahren wieder nur vorbei', () => {
    setMap('donau');
    const g = fresh();
    halt(g);
    g.research.done.push('link1');
    g.offers.open = null;
    g.rebuild();
    g.acceptOffer('ln');
    // Empfangsgebäude weg: der Bahnsteig hat keinen Zugang mehr
    const st = [...g.grid.buildings.values()].find((b) => b.key === 'bld_station')!;
    g.grid.removeBuilding(st.id);
    g.rebuild();
    expect(g.contracts.ln.status).toBe('none');
  });

  it('alter Spielstand ohne Fremdbahn: wird nachgerüstet, wo Platz ist', () => {
    setMap('donau');
    const g = new Game();
    const s = JSON.parse(JSON.stringify(g.save()));
    // Fremdbahn aus dem Spielstand entfernen
    const keep = new Set<number>();
    const grid = g.grid;
    s.pieces = s.pieces.filter((p: { x: number; y: number }) => !grid.foreignCells.has(grid.key(p.x, p.y)));
    grid.foreignCells.forEach((_op, k) => { keep.add(k); s.cells[k] = 0; });
    const g2 = new Game(s);
    expect(g2.grid.foreignLaid.map((l) => l.op).sort()).toEqual(['ln', 'ls']);
    expect(g2.net.entries.filter((e) => e.line).length).toBe(4);
  });

  it('Anschluss per Weiche: Züge biegen ab, halten im Stumpfgleis, wenden und fahren auf ihre Strecke zurück', () => {
    setMap('donau');
    const restore = seedRandom(7);
    const g = fresh();
    for (let px = 13; px <= 17; px++) g.grid.buyParcel(px, 6);
    const ok = (r: { ok: boolean; reason?: string }) => expect(r.ok ? 'ok' : r.reason).toBe('ok');
    ok(g.build('switch', [{ x: 110, y: 52 }], 'branch_divDown'));
    ok(g.build('curve', [{ x: 113, y: 53 }], 'curve_mergeAbove'));
    ok(g.build('track', Array.from({ length: 15 }, (_, i) => ({ x: 116 + i, y: 54 }))));
    ok(g.build('platform', Array.from({ length: 10 }, (_, i) => ({ x: 119 + i, y: 55 }))));
    ok(g.build('building', [{ x: 122, y: 56 }], 'bld_station'));
    expect(foreignConnected(g, 'ln')).toBe(true);
    g.research.done.push('link1');
    g.offers.open = null;
    g.rebuild();
    expect(g.acceptOffer('ln')).toBe(true);
    g.stepTakt('ln', -1);
    let exitsOnLine = 0;
    for (let i = 0; i < 48; i++) {
      fastForward(g, 900);
      for (const t of g.sim.trains) {
        const last = t.route[t.route.length - 1];
        if (last?.line && !t.op.foreign) exitsOnLine++;
      }
    }
    expect(exitsOnLine).toBe(0);
    expect(g.stats.opStats?.ln?.handled ?? 0).toBeGreaterThan(0);
    expect(g.sim.deadlock).toBeNull();
    restore();
  });
});

describe('Komplexitäts-Budget der Fremdbahnen (RM-FR-CPX-01, CPX-07)', () => {
  afterEach(() => setMap('donau'));

  it('Kampagne: erst ab dem Industrierevier; freies Spiel: abschaltbar; „Was ist los?“ meldet den Anschluss', () => {
    setMap('donau');
    const g = freshGame();
    g.mode = 'campaign';
    expect(foreignBlock(g, 'ln')).toBeTruthy();
    expect(g.researchBlock('link1')).toMatch(/Industrierevier/);
    g.mode = 'free';
    expect(g.researchBlock('link1')).not.toMatch(/Industrierevier/);
    // angeschlossen ohne Forschung → Hinweis in „Was ist los?“
    for (let px = 14; px <= 17; px++) g.grid.buyParcel(px, 6);
    g.build('platform', Array.from({ length: 10 }, (_, i) => ({ x: 120 + i, y: 53 })));
    g.build('building', [{ x: 123, y: 54 }], 'bld_station');
    expect(problems(g).some((p) => p.id === 'flln' && /Formular A38/.test(p.text))).toBe(true);
    // ausgeschaltet: keine Kulisse, kein Vertrag, kein Baum
    g.freeCfg = { ...freeDefaults('donau', 4000), noForeign: true };
    expect(g.sim.taktOf('ln')).toBe(0);
    expect(foreignProblems(g)).toEqual([]);
    expect(g.researchBlock('link1')).toBeTruthy();
  });
});
