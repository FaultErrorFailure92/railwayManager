import { RESEARCH } from './Research';
import { START_PARCELS } from '../config';
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
  { id: 'land5', name: 'Großgrundbesitzer', info: '5 Parzellen dazugekauft', icon: 'tool_flag', check: (g) => g.grid.owned.filter(Boolean).length >= (START_PARCELS.x1 - START_PARCELS.x0 + 1) * (START_PARCELS.y1 - START_PARCELS.y0 + 1) + 5 },
  { id: 'special', name: 'Sonderzug-Profi', info: '3 Sonderzüge pünktlich', icon: 'bld_bus', check: (g) => g.specialsOk >= 3 },
  // ---- mehr Erfolge (RM-FR-PROG-09)
  { id: 'p1000', name: 'Pünktlich wie die Eisenbahn', info: '1 000 Züge pünktlich', icon: 'bld_clock', check: (g) => g.stats.punctual >= 1000 },
  { id: 'streak50', name: 'Schweizer Präzision', info: '50 Züge in Folge pünktlich', icon: 'bld_clock', check: (g) => g.stats.streak >= 50 },
  { id: 'streak100', name: 'Die Uhr stellt sich nach dir', info: '100 Züge in Folge pünktlich', icon: 'bld_clock', check: (g) => g.stats.streak >= 100 },
  { id: 'pax100k', name: 'Völkerwanderung', info: '100 000 Fahrgäste', icon: 'bld_shelter', check: (g) => g.stats.passengers >= 100000 },
  { id: 'trains100', name: 'Hundert Halte', info: '100 Züge abgefertigt', icon: 'bld_station', check: (g) => g.stats.handled >= 100 },
  { id: 'ic50', name: 'Fernweh', info: '50 Fernzüge haben gehalten', icon: 'bld_station2', check: (g) => g.stats.stopsIC >= 50 },
  { id: 'conn1', name: 'Umsteigen bitte', info: 'Erster erreichter Anschluss', icon: 'bld_bench', check: (g) => (g.stats.connOk ?? 0) >= 1 },
  { id: 'conn100', name: 'Taktknotenpunkt', info: '100 Anschlüsse erreicht', icon: 'bld_bench', check: (g) => (g.stats.connOk ?? 0) >= 100 },
  { id: 'turn10', name: 'Kehrtwende', info: '10 Wendezüge gewendet', icon: 'track', check: (g) => g.stats.turnbacks >= 10 },
  { id: 'park10', name: 'Parkhaus', info: '10 Züge abgestellt', icon: 'bld_remise', check: (g) => g.stats.parks >= 10 },
  { id: 'clean25', name: 'Blitzblank', info: '25 Züge gepflegt', icon: 'bld_wash', check: (g) => g.stats.services >= 25 },
  { id: 'caught1', name: 'Fahrschein, bitte!', info: 'Ersten Schwarzfahrer erwischt', icon: 'bld_statue', check: (g) => (g.stats.caught ?? 0) >= 1 },
  { id: 'caught100', name: 'Schwarzkappler des Monats', info: '100 Schwarzfahrer erwischt', icon: 'bld_statue', check: (g) => (g.stats.caught ?? 0) >= 100 },
  { id: 'million', name: 'Millionär', info: '1 000 000 € in der Kasse', icon: 'bld_statue', check: (g) => g.money >= 1000000 },
  { id: 'deep', name: 'Mit dem Rücken zur Wand', info: 'Unter −20 000 € gerutscht', icon: 'bld_fountain', check: (g) => g.money <= -20000 },
  { id: 'loan', name: 'Bankkunde', info: 'Einen Kredit aufgenommen', icon: 'bld_lockers', check: (g) => !!g.loan },
  { id: 'allresearch', name: 'Wissensdurst', info: 'Alles erforscht', icon: 'bld_workshop', check: (g) => g.research.done.length >= RESEARCH.length },
  { id: 'tier2', name: 'Aufsteiger', info: 'Bahnhofsstufe „Knotenbahnhof“ erreicht', icon: 'bld_station2', check: (g) => g.tier >= 2 },
  { id: 'tier3', name: 'Hauptbahnhof', info: 'Höchste Bahnhofsstufe erreicht', icon: 'bld_station3', check: (g) => g.tier >= 3 },
  { id: 'crew4', name: 'Volle Truppe', info: '4 Instandhalter eingestellt', icon: 'tool_shovel', check: (g) => g.crew >= 4 },
  { id: 'fixer25', name: 'Feuerwehr', info: '25 Störungen behoben', icon: 'tool_shovel', check: (g) => g.repairs >= 25 },
  { id: 'week', name: 'Eine Woche durchgehalten', info: '7 Spieltage', icon: 'bld_clock', check: (g) => g.sim.time >= 7 * 86400 },
  { id: 'month', name: 'Dienstjubiläum', info: '30 Spieltage', icon: 'bld_clock', check: (g) => g.sim.time >= 30 * 86400 },
  { id: 'snow', name: 'Weiße Weihnacht', info: 'Ein Zug pünktlich bei Schnee', icon: 'bld_pine0', check: (g) => g.weather.kind === 'snow' && g.stats.streak >= 1 },
  { id: 'challenge', name: 'Herausgefordert', info: 'Eine Herausforderung geschafft', icon: 'tool_flag', check: (g) => g.challenge?.result === 'won' },
  { id: 'sandbox', name: 'Spielkind', info: 'Im Sandkasten gebaut', icon: 'tool_flag', check: (g) => !!g.freeCfg?.sandbox && g.stats.handled >= 1 },
];
