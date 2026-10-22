import type { Game } from './Game';

/** Erfolge: einmal pro Spielstand, mit Konfetti */
export interface Achievement {
  id: string;
  name: string;
  info: string;
  icon: string;
  check: (g: Game) => boolean;
}

const stationCount = (g: Game) => g.stations().length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Erster Zug', info: 'Einen Zug abgefertigt', icon: 'bld_station', check: (g) => g.stats.handled >= 1 },
  { id: 'p100', name: 'Hundert pünktlich', info: '100 Züge pünktlich', icon: 'signal_E', check: (g) => g.stats.punctual >= 100 },
  { id: 'p500', name: 'Uhrwerk', info: '500 Züge pünktlich', icon: 'bld_clock', check: (g) => g.stats.punctual >= 500 },
  { id: 'streak25', name: 'Auf die Minute', info: '25 Züge in Folge pünktlich', icon: 'bld_clock', check: (g) => g.stats.streak >= 25 },
  { id: 'pax10k', name: 'Volle Bahnsteige', info: '10 000 Fahrgäste', icon: 'bld_shelter', check: (g) => g.stats.passengers >= 10000 },
  { id: 'rich', name: 'Gut bei Kasse', info: '100 000 € in der Kasse', icon: 'bld_statue', check: (g) => g.money >= 100000 },
  { id: 'debtfree', name: 'Schuldenfrei', info: 'Nach einem Kredit wieder im Plus', icon: 'bld_fountain', check: (g) => g.wasInDebt && g.money >= 0 },
  { id: 'night', name: 'Nachtschwärmer', info: 'Einen Nachtzug abgefertigt', icon: 'bld_lamp', check: (g) => (g.stats.opStats?.nj?.handled ?? 0) >= 1 },
  { id: 'private', name: 'Anschluss gefunden', info: 'Eine Privatbahn angeschlossen', icon: 'bld_sawmill', check: (g) => g.contracts.sw.status === 'active' || g.contracts.mn.status === 'active' },
  { id: 'stations3', name: 'Netzwerker', info: '3 Bahnhöfe in Betrieb', icon: 'bld_station2', check: (g) => stationCount(g) >= 3 },
  { id: 'research10', name: 'Tüftler', info: '10 Forschungen abgeschlossen', icon: 'bld_workshop', check: (g) => g.research.done.length >= 10 },
  { id: 'sorted100', name: 'Rangiermeister', info: '100 Wagen richtig sortiert', icon: 'bld_hump', check: (g) => g.stats.sortedWagons >= 100 },
  { id: 'fixer', name: 'Störungssucher', info: '5 Störungen behoben', icon: 'tool_shovel', check: (g) => g.repairs >= 5 },
  { id: 'special', name: 'Sonderzug-Profi', info: '3 Sonderzüge pünktlich', icon: 'bld_bus', check: (g) => g.specialsOk >= 3 },
];
