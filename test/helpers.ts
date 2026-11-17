import { Game } from '../src/game/Game';
import { buildDemo } from '../src/dev/demo';
import { fastForward } from '../src/dev/balance';
import type { ToolId } from '../src/game/Missions';

/** neues Spiel mit allen Werkzeugen und viel Geld */
export function freshGame() {
  const g = new Game();
  g.company = 'Test';
  g.startMission();
  (['land', 'platform', 'track', 'signal', 'switch', 'curve', 'diag', 'wire', 'access', 'building', 'facility', 'remove', 'road'] as ToolId[]).forEach((t) => g.unlocked.add(t));
  g.money = 1e6;
  return g;
}

/** Demobahnhof mit laufenden Verträgen */
export function demoGame() {
  const g = new Game();
  g.startMission();
  const log = buildDemo(g);
  g.uiEvents.length = 0;
  return { g, log };
}

export { fastForward };

/** reproduzierbarer Zufall für einen Test */
export function seedRandom(seed = 1) {
  let a = seed >>> 0;
  const orig = Math.random;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = orig; };
}
