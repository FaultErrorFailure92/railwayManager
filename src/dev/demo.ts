import type { Game } from '../game/Game';
import type { OperatorId } from '../sim/Operators';
import { RESEARCH } from '../game/Research';
import { setInspectors } from '../game/FareDodgers';
import { ROW0 } from '../config';

/**
 * Demobahnhof (nur lokale Entwicklung): fertiger Bahnhof mit 2 Bahnsteigen, Kreuzungsgleis, Signalen und Verträgen.
 * Zeigt möglichst alle Funktionen: Läden, Deko, Straße mit Parkplatz/Bus bis zur Gemeindestraße, Abstell- und Rangieranlagen,
 * Werksanschluss, Fremdbahnen (Halten und Durchfahren), Personal, Nachtzug, Verstärker.
 */
export function buildDemo(g: Game) {
  const log: string[] = [];
  g.company = 'Demobahn AG';
  g.demo = true;
  g.player = { name: 'Demo', title: '', avatar: 3 };
  g.skipTutorial();
  g.money = 200000;
  g.research.points += 20;
  // alles erforscht (ohne die Strecke umzubauen)
  g.research.done = RESEARCH.map((r) => r.id);
  (['signal', 'switch', 'track', 'curve', 'diag', 'building', 'wire', 'access', 'facility', 'research', 'road'] as const).forEach((u) => g.unlocked.add(u as any));
  g.grid.owned.fill(true);
  // Häuser/Bäume im Bahnhofsbereich weg
  for (const b of [...g.grid.buildings.values()]) if (b.x >= 90 && b.x <= 150 && b.y >= 25 + ROW0 && b.y <= 36 + ROW0) g.grid.removeBuilding(b.id);
  // … und rund um die Anschlüsse (Fremdbahnen, Sägewerk); Werke und Berge bleiben
  for (const b of [...g.grid.buildings.values()]) {
    if (b.key === 'bld_sawmill' || b.key === 'bld_mine' || !b.decor) continue;
    const y = b.y - ROW0;
    if ((b.x >= 104 && b.x <= 150 && y >= 18 && y <= 26) || (b.x >= 104 && b.x <= 150 && y >= 39 && y <= 44) || (b.x >= 156 && b.x <= 176 && y >= 23 && y <= 31)) g.grid.removeBuilding(b.id);
  }
  g.grid.electrifyLine();
  g.rebuild();
  const row = (x0: number, x1: number, y: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));
  const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i }));
  const B = (name: string, t: any, c: { x: number; y: number }[], v = '') => {
    const r = g.build(t, c.map((p) => ({ x: p.x + 80, y: p.y + 16 + ROW0 })), v);
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
  // Straße mit Parkplatz und Busterminal
  B('Straße', 'road', row(38, 56, 11));
  B('Parkplatz', 'building', [{ x: 39, y: 9 }], 'bld_parking');
  B('Bus', 'building', [{ x: 51, y: 9 }], 'bld_bus');
  // Straße bis zur Gemeindestraße (Spalte 146): Anschluss ans Straßennetz
  // Läden, Komfort, Deko
  for (const [n, x, y, k] of [
    ['Gasthaus', 41, 18, 'bld_inn'], ['WC', 48, 18, 'bld_wc'], ['Souvenir', 50, 14, 'bld_souvenir'], ['Schließfächer', 51, 17, 'bld_lockers'],
    ['Automat', 43, 14, 'bld_vending'], ['Bank', 49, 17, 'bld_bench'], ['Wartehalle', 46, 17, 'bld_shelter'], ['Uhr', 48, 14, 'bld_clock'],
    ['Laterne', 44, 17, 'bld_lamp'], ['Laterne', 52, 14, 'bld_lamp'], ['Plakat', 54, 13, 'bld_billboard'], ['Brunnen', 43, 12, 'bld_fountain'],
    ['Denkmal', 55, 12, 'bld_statue'], ['Wandbild', 56, 13, 'bld_mural'], ['Christbaum', 42, 12, 'bld_xmas'], ['Blumen', 49, 12, 'bld_flowers'],
    ['Straßenlaterne', 57, 10, 'bld_streetlamp'],
    // Wetterschutz und Zugzielanzeiger auf beiden Bahnsteigen
    ['Bahnsteigdach', 45, 14, 'bld_canopy'], ['Bahnsteigdach', 46, 14, 'bld_canopy'], ['Bahnsteigdach', 47, 14, 'bld_canopy'],
    ['Bahnsteigdach', 47, 17, 'bld_canopy'], ['Bahnsteigdach', 50, 17, 'bld_canopy'],
    ['Zugzielanzeiger', 49, 14, 'bld_board'], ['Zugzielanzeiger', 43, 17, 'bld_board'],
  ] as [string, number, number, string][]) B(n, 'building', [{ x, y }], k);
  // Abstellgleis mit Waschanlage im Rangierbereich, östlich hinter dem Gleiswechsel – abseits der Strecke (Reihe 17),
  // damit der spätere zweigleisige Ausbau (Reihe 16 wird Streckengleis) nicht über die Abstellanlage führt
  B('Gleiswechsel Ost', 'switch', [{ x: 62, y: 16 }], 'xover_down');
  B('Stumpfgleis', 'track', row(65, 75, 17));
  B('Fahrdraht Stumpf', 'wire', row(62, 75, 17));
  B('Fahrdraht Abzweig Ost', 'wire', row(62, 64, 16));
  B('Rangierbereich', 'facility', row(65, 68, 17), 'mark_shunt');
  B('Waschanlage', 'facility', [{ x: 66, y: 17 }], 'bld_wash');
  B('Abstellgleis', 'facility', row(69, 75, 17), 'mark_siding');
  // Remise westlich hinter dem Gleiswechsel, ebenfalls auf Reihe 17
  B('Gleiswechsel West', 'switch', [{ x: 31, y: 16 }], 'xover_up');
  B('Stumpfgleis West', 'track', row(23, 30, 17));
  B('Fahrdraht West', 'wire', row(23, 33, 17));
  B('Fahrdraht Einmündung West', 'wire', row(31, 33, 16));
  B('Remise', 'facility', [{ x: 24, y: 17 }], 'bld_remise');
  B('Straße zur Gemeindestraße', 'road', row(57, 65, 11));
  // Werksanschluss Sägewerk Holzer: Ladegleis (Reihe 25) nach Osten verlängert, über Diagonalen auf die Strecke (nach der Kreuzungsstelle)
  B('Anschlussgleis Sägewerk', 'track', row(78, 83, 9));
  B('Kurve Sägewerk', 'curve', [{ x: 84, y: 9 }], 'curve_divDown');
  for (let i = 0; i < 4; i++) B(`Diagonale Sägewerk ${i + 1}`, 'diag', [{ x: 87 + i, y: 10 + i }], 'diag_desc');
  B('Weiche Sägewerk', 'switch', [{ x: 91, y: 14 }], 'branch_mergeAbove');
  // Signale trennen das Ladegleis von der Strecke: beim Laden blockiert der Werkszug die Strecke nicht
  B('Signal Sägewerk Ausfahrt', 'signal', [{ x: 83, y: 9 }], 'E');
  B('Signal Sägewerk Einfahrt', 'signal', [{ x: 78, y: 9 }], 'W');
  // Fremdbahn Nord (Mühlkreisbahn): Weiche, Stumpfgleis und Haltepunkt „Demohausen Nord“ mit eigenem Empfangsgebäude
  B('Weiche Mühlkreisbahn', 'switch', [{ x: 30, y: 4 }], 'branch_divDown');
  B('Kurve Mühlkreisbahn', 'curve', [{ x: 33, y: 5 }], 'curve_mergeAbove');
  B('Gleis Nord', 'track', row(36, 50, 6));
  B('Bahnsteig Nord', 'platform', row(39, 48, 7));
  B('Bahnhof Nord', 'building', [{ x: 43, y: 8 }], 'bld_station');
  B('Bahnsteigdach Nord', 'building', [{ x: 41, y: 7 }], 'bld_canopy');
  // Fremdbahn Süd (Erlauftalbahn): Umfahrungsgleis über eigene Gleise – für den Durchfahrt-Vertrag
  B('Weiche Erlauftalbahn West', 'switch', [{ x: 28, y: 26 }], 'branch_divUp');
  B('Kurve Erlauftalbahn West', 'curve', [{ x: 31, y: 25 }], 'curve_mergeBelow');
  B('Umfahrungsgleis', 'track', row(34, 59, 25));
  B('Kurve Erlauftalbahn Ost', 'curve', [{ x: 60, y: 25 }], 'curve_divDown');
  B('Weiche Erlauftalbahn Ost', 'switch', [{ x: 63, y: 26 }], 'branch_mergeAbove');
  g.setCrew(2);
  setInspectors(g, 2);
  // Bahnhof gleich taufen, kein Namensdialog
  for (const b of g.grid.buildings.values()) if (b.key === 'bld_station') g.stationName(b.id, b.y < 26 + ROW0 ? 'Demohausen Nord' : 'Demohausen');
  g.uiEvents.splice(0, g.uiEvents.length, ...g.uiEvents.filter((e) => e.type !== 'station'));
  g.sim.setLevel(4);
  for (const id of ['ro', 'wx', 'cd', 'sb', 'lb', 'tx', 'nj', 'ln', 'ls'] as OperatorId[]) {
    const c = g.contracts[id];
    c.status = 'active';
    c.takt = id === 'ln' || id === 'ls' ? 120 : 60;
    if (id === 'nj') c.lines = 1;
    // Fremdbahnen: Nord hält am Haltepunkt, Süd fährt nur über das Umfahrungsgleis
    if (id === 'ln') c.mode = 'stop';
    if (id === 'ls') c.mode = 'through';
    g.sim.retime(id);
    g.sim.recontract(id);
  }
  // Verstärkerzüge der S-Bahn in der Stoßzeit
  g.toggleBoost('sb');
  // Abstellen & Pflege für Regional-, S-Bahn und Fernzug
  for (const id of ['ro', 'sb', 'wx'] as OperatorId[]) g.toggleService(id);
  g.offers.open = null;
  g.offers.done.push('regio', 'freight');
  // „Doppelt hält besser“ wieder offen: Die Gleiswechsel stehen schon, das 2. Streckengleis baut der Netzbetreiber
  // erst, wenn du es im Auftrag „Zweigleisiger Ausbau“ erforschst (sonst blockiert die Kreuzungsstelle den Anschluss)
  g.research.done = g.research.done.filter((id) => id !== 'double');
  // Bau- und Startgeld nicht als Tagesumsatz zählen
  g.history.length = 0;
  g.news.dayMoney = g.money;
  g.addLog('Demobahnhof geladen', 'info');
  if (log.length) console.warn('[Demo]', log.join(' | '));
  return log;
}
