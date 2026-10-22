import type { Game } from '../game/Game';
import type { OperatorId } from '../sim/Operators';
import { RESEARCH } from '../game/Research';

/** Demobahnhof (nur lokale Entwicklung): fertiger Bahnhof mit 2 Bahnsteigen, Kreuzungsgleis, Signalen und Verträgen */
export function buildDemo(g: Game) {
  const log: string[] = [];
  g.company = 'Demobahn AG';
  g.skipTutorial();
  g.money = 200000;
  g.research.points += 20;
  // alles erforscht (ohne die Strecke umzubauen)
  g.research.done = RESEARCH.map((r) => r.id);
  (['signal', 'switch', 'track', 'curve', 'diag', 'building', 'wire', 'access', 'facility', 'research', 'road'] as const).forEach((u) => g.unlocked.add(u as any));
  g.grid.owned.fill(true);
  // Häuser/Bäume im Bahnhofsbereich weg
  for (const b of [...g.grid.buildings.values()]) if (b.x >= 90 && b.x <= 150 && b.y >= 25 && b.y <= 36) g.grid.removeBuilding(b.id);
  g.grid.electrifyLine();
  g.rebuild();
  const row = (x0: number, x1: number, y: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));
  const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i }));
  const B = (name: string, t: any, c: { x: number; y: number }[], v = '') => {
    const r = g.build(t, c.map((p) => ({ x: p.x + 80, y: p.y + 16 })), v);
    if (!r.ok) log.push(`${name}: ${r.reason}`);
  };
  B('Bahnsteig 1', 'platform', row(42, 52, 14));
  B('Bahnhof', 'building', [{ x: 45, y: 12 }], 'bld_station');
  B('Weiche W', 'switch', [{ x: 34, y: 15 }], 'xover_down');
  B('Gleis 2', 'track', row(37, 58, 16));
  B('Weiche O', 'switch', [{ x: 59, y: 15 }], 'xover_up');
  B('Fahrdraht', 'wire', row(34, 61, 16));
  B('Bahnsteig 2', 'platform', row(42, 52, 17));
  B('Unterführung', 'access', col(48, 14, 17), 'tunnel');
  for (const [x, y, d] of [[56, 15, 'E'], [56, 16, 'E'], [40, 15, 'W'], [40, 16, 'W'], [33, 15, 'E'], [62, 15, 'W']] as const) B(`Signal ${x}/${y}`, 'signal', [{ x, y }], d);
  B('Kiosk', 'building', [{ x: 51, y: 14 }], 'bld_kiosk');
  B('Café', 'building', [{ x: 44, y: 18 }], 'bld_cafe');
  // Bahnhof gleich taufen, kein Namensdialog
  for (const b of g.grid.buildings.values()) if (b.key === 'bld_station') g.stationName(b.id, 'Demohausen');
  g.uiEvents.splice(0, g.uiEvents.length, ...g.uiEvents.filter((e) => e.type !== 'station'));
  g.sim.setLevel(4);
  for (const id of ['ro', 'wx', 'cd', 'sb'] as OperatorId[]) {
    const c = g.contracts[id];
    c.status = 'active';
    c.takt = 60;
    g.sim.retime(id);
  }
  g.offers.open = null;
  g.offers.done.push('regio', 'freight');
  g.addLog('Demobahnhof geladen', 'info');
  if (log.length) console.warn('[Demo]', log.join(' | '));
  return log;
}
