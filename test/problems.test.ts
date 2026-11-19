import { describe, expect, it } from 'vitest';
import { problems } from '../src/game/Problems';
import { fairPrice } from '../src/game/Contracts';
import { OPERATORS } from '../src/sim/Operators';
import { demoGame, fastForward } from './helpers';

describe('„Was ist los?“ (RM-FR-CPX-03)', () => {
  it('Demobahnhof im Normalbetrieb: nichts Dringendes', () => {
    const { g } = demoGame();
    fastForward(g, 1800);
    expect(problems(g).filter((p) => p.level === 'rot')).toEqual([]);
  });

  it('Störung erscheint rot ganz oben, Lösung schickt den Störtrupp', () => {
    const { g } = demoGame();
    g.inbox.push({ id: 99, time: 0, kind: 'letter', title: 'x', from: 'y', html: '', read: false });
    const k = g.grid.key(118, 63);
    g.faults.push({ k, kind: 'signal', since: g.sim.time });
    const list = problems(g);
    expect(list[0]).toMatchObject({ id: `fault${k}`, level: 'rot', at: { x: 118, y: 63 } });
    expect(list.at(-1)?.level).toBe('info');
    const m = g.money;
    list[0].fix!.run!(g);
    expect(g.faults[0].repairAt).toBeGreaterThan(g.sim.time);
    expect(g.money).toBeLessThan(m);
    expect(problems(g).find((p) => p.id === `fault${k}`)?.level).toBe('info');
  });

  it('überhöhter Preis: Warnung, Lösung setzt fairen Preis', () => {
    const { g } = demoGame();
    const op = OPERATORS.ro;
    g.contracts.ro.price = { short: fairPrice(op, 'short') * 2, long: fairPrice(op, 'long') * 2 };
    const p = problems(g).find((x) => x.id === 'riskro');
    expect(p?.level).toBe('gelb');
    p!.fix!.run!(g);
    expect(g.contracts.ro.price.short).toBe(fairPrice(op, 'short'));
    expect(problems(g).find((x) => x.id === 'riskro')).toBeUndefined();
  });

  it('Schulden: gelb, ab der Hälfte des Limits rot', () => {
    const { g } = demoGame();
    g.money = -1000;
    expect(problems(g).find((x) => x.id === 'debt')?.level).toBe('gelb');
    g.money = -40000;
    expect(problems(g).find((x) => x.id === 'debt')?.level).toBe('rot');
  });

  it('Ladenpreis zu hoch: Lösung setzt Richtwert', () => {
    const { g } = demoGame();
    g.setShopPrice('bld_kiosk', 999);
    const p = problems(g).find((x) => x.id === 'shopbld_kiosk');
    expect(p).toBeDefined();
    p!.fix!.run!(g);
    expect(problems(g).find((x) => x.id === 'shopbld_kiosk')).toBeUndefined();
  });
});
