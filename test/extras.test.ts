import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { ACHIEVEMENTS } from '../src/game/Achievements';
import { applySetup, freeDefaults } from '../src/game/FreePlay';
import { acceptGrant, GRANTS, grantTick } from '../src/game/Grants';
import { REGULARS, regularsOnStop } from '../src/game/Regulars';
import { CREW, crewSpeed } from '../src/game/Staff';
import { dailyChallenge, dailyKey } from '../src/game/Challenges';
import { demoGame, seedRandom } from './helpers';

const player = { name: 'B', title: '' as const, avatar: 1 };

describe('Erfolge, Personal, Förderungen, Stammgäste, Tagesherausforderung, Sandbox', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(2); });
  afterEach(() => restore());

  it('etwa 40 Erfolge mit eindeutigen Ids (PROG-09)', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('Personal hat Namen und beeinflusst die Arbeit (ECO-12)', () => {
    expect(CREW.every((m) => m.name && m.trait)).toBe(true);
    expect(crewSpeed(1)).toBeLessThan(1);
    const { g } = demoGame();
    g.setCrew(0);
    g.setCrew(1);
    expect(g.log[0].text).toContain(CREW[0].name);
  });

  it('Förderung: Geld sofort, ohne Erfüllung zurück (ECO-11)', () => {
    const { g } = demoGame();
    const gr = GRANTS.find((x) => x.id === 'bus')!;
    const m = g.money;
    acceptGrant(g, gr.id);
    expect(g.money - m).toBe(gr.amount);
    const done = gr.done(g);
    g.sim.time = g.grant!.until + 1;
    grantTick(g);
    expect(g.grant).toBeUndefined();
    expect(g.money - m).toBe(done ? gr.amount : 0);
  });

  it('Stammgast bedankt sich nach 5 pünktlichen Tagen (EVT-07)', () => {
    const { g } = demoGame();
    const r = REGULARS[0];
    const t = g.sim.queue.find((x) => x.op.needsStop && x.op.kind !== 'freight')!;
    t.passengers = 50;
    const hourOf = () => Math.floor((g.sim.stationTimes(t).arr % 86400) / 3600);
    t.plannedSpawn += (r.hour - hourOf()) * 3600;
    expect(hourOf()).toBe(r.hour);
    for (let d = 0; d < 5; d++) { g.sim.time = (d + 1) * 86400 + 3600; regularsOnStop(g, t, true); }
    expect(g.uiEvents.some((e) => e.type === 'letter' && e.title.includes(r.name))).toBe(true);
  });

  it('tägliche Herausforderung ist für alle am selben Tag gleich (END-03)', () => {
    const a = dailyChallenge('20261117'), b = dailyChallenge('20261117');
    expect(a.id).toBe(b.id);
    expect(a.money).toBe(b.money);
    expect(dailyKey(new Date(2026, 10, 17))).toBe('20261117');
  });

  it('Sandbox: keine Pleite, Forschung sofort (MODE-07)', () => {
    const g = new Game();
    applySetup(g, { mode: 'free', map: 'donau', profileId: '', company: 'T', player, cfg: { ...freeDefaults('donau', 4000), sandbox: true } });
    expect(g.sandbox).toBe(true);
    expect(g.money).toBeGreaterThan(1e6);
    expect(g.startResearch('access')).toBe(true);
    expect(g.researched('access')).toBe(true);
  });
});
