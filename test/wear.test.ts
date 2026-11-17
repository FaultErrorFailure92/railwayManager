import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crewMaintain, elements, faultFactor, maintain, MAINT_COST, wearOf } from '../src/game/Wear';
import { demoGame, fastForward, seedRandom } from './helpers';

describe('Abnutzung von Weichen und Signalen (RM-FR-UI-12)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(3); });
  afterEach(() => restore());

  it('Zugfahrten nutzen Weichen ab', () => {
    const { g } = demoGame();
    g.crew = 0;
    expect(elements(g).length).toBeGreaterThan(0);
    fastForward(g, 6 * 3600);
    expect(Math.max(...elements(g).map((e) => wearOf(g, e.k)))).toBeGreaterThan(5);
  });

  it('abgenutzt = mehr Ausfälle, frisch = weniger', () => {
    const { g } = demoGame();
    for (const e of elements(g)) g.wear[e.k] = 0;
    const fresh = faultFactor(g);
    for (const e of elements(g)) g.wear[e.k] = 100;
    expect(faultFactor(g)).toBeGreaterThan(fresh * 4);
  });

  it('warten setzt die Abnutzung zurück – von Hand gegen Geld, Instandhalter gratis', () => {
    const { g } = demoGame();
    const [a, b] = elements(g);
    g.wear[a.k] = 90;
    const m = g.money;
    expect(maintain(g, a.k)).toBe(true);
    expect(wearOf(g, a.k)).toBe(0);
    expect(m - g.money).toBe(MAINT_COST);
    if (!b) return;
    g.wear[b.k] = 80; g.crew = 1;
    expect(crewMaintain(g)).toBe(1);
    expect(wearOf(g, b.k)).toBe(0);
  });

  it('Abnutzung bleibt im Spielstand', () => {
    const { g } = demoGame();
    const e = elements(g)[0];
    g.wear[e.k] = 42;
    expect(JSON.parse(JSON.stringify(g.save())).wear[e.k]).toBe(42);
  });
});
