import { OP_DEFAULTS, OPERATORS, OperatorId } from '../sim/Operators';
import { MAP_H, ROW0 } from '../config';
import type { Industry } from './industries';
import type { ForeignLine } from './foreign';

/** Karten (Szenarien): eigenes Gelände, eigene Bahnunternehmen, eigenes Thema */
export interface RockRange { x0: number; x1: number; y0: number; y1: number; edge: 'N' | 'S' }
export interface MapDef {
  id: string;
  name: string;
  /** Lokalzeitung */
  paper: string;
  /** Endpunkte der Strecke: [West, Ost] */
  ends: [string, string];
  theme: string;
  info: string;
  difficulty: 'leicht' | 'mittel' | 'schwer';
  startMoney: number;
  /** Farbton für den Boden (Phaser-Tint) */
  tint: number;
  /** Bodenart: Gras (Standard), Sand oder Schnee */
  ground?: 'sand' | 'snow';
  /** Bäume/Pflanzen in den Wäldern (zufällig daraus) */
  trees?: string[];
  /** Häuser in den Dörfern (zufällig daraus) */
  houses?: string[];
  /** Häuser je Dorf (Standard 8) und Streuung – Städte stehen dichter */
  villageSize?: number;
  /** Großstadt: Vorschaubild zeigt Häuserblöcke */
  city?: boolean;
  /** öffentliche Straßen quer zur Strecke (RM-FR-MAP-08): Spalten x, mit Bahnübergang über die Strecke */
  roads?: number[];
  /** Fahrzeuge auf den Straßen, passend zum Thema (Sprite-Namen) */
  vehicles?: string[];
  /** Hochbahn quer über die Strecke (RM-FR-MAP-11): Spalte x, von y0 bis y1, Pfeiler in diesen Reihen */
  viaducts?: { x: number; y0: number; y1: number; piers: number[] }[];
  terrainSeed: number;
  landscapeSeed: number;
  rocks: RockRange[];
  /** ab dieser Schwelle wird Fels (kleiner = mehr Fels) */
  rockLevel: number;
  lakes: { x: number; y: number; rx: number; ry: number }[];
  rivers: { x: number; a: number; b: number; w: number }[];
  forests: number;
  villages: { x: number; y: number }[];
  industries: Industry[];
  /** Fremdbahnen zum Anschließen (RM-FR-MAP-09) */
  foreignLines?: ForeignLine[];
  weather: { rain: number; snow: number };
  /** Namen der Bahnunternehmen auf dieser Karte */
  names?: Partial<Record<OperatorId, string>>;
  tenderRegio: OperatorId[];
  tenderFreight: OperatorId[];
  inquiries: OperatorId[];
  /** Ortsnamen für Bahnhöfe */
  stationNames?: string[];
  /** Zufallskarte: Vorlage (Thema, Musik) */
  base?: string;
}

const DONAU_VILLAGES = [
  { x: 90, y: 20 }, { x: 160, y: 41 }, { x: 150, y: 21 }, { x: 100, y: 42 },
  { x: 30, y: 38 }, { x: 70, y: 24 }, { x: 200, y: 24 }, { x: 240, y: 40 }, { x: 130, y: 8 }, { x: 128, y: 56 },
];

/** Fremdbahn im Norden / Süden: Bogen bis kurz vor das Startgelände */
export const NORTH = (x0 = 100, x1 = 156): ForeignLine => ({ op: 'ln', row: 6 + ROW0, low: 20 + ROW0, x0, x1 });
export const SOUTH = (x0 = 100, x1 = 156): ForeignLine => ({ op: 'ls', row: 57 + ROW0, low: 43 + ROW0, x0, x1 });

/** Werke: Lage in Koordinaten der früheren Karte (y, row), werden um ROW0 verschoben */
export const SAWMILL = (x: number, y: number, row: number, name = 'Sägewerk Holzer'): Industry => ({ id: 'sawmill', name, key: 'bld_sawmill', x, y: y + ROW0, row: row + ROW0, x0: x - 4, x1: x + 5, op: 'sw' });
export const MINE = (x: number, y: number, row: number, name = 'Bergwerk Erzleiten'): Industry => ({ id: 'mine', name, key: 'bld_mine', x, y: y + ROW0, row: row + ROW0, x0: x - 4, x1: x + 5, op: 'mn' });

/** Karten wie früher (256 × 64) gezeichnet; `lift` setzt sie in die doppelt so hohe Welt */
const RAW_MAPS: MapDef[] = [
  {
    roads: [106, 146],
    vehicles: ['auto_0', 'auto_tractor', 'auto_1', 'auto_3'],
    id: 'donau', ends: ['Linz', 'Wien'], paper: 'Donau-Kurier', name: 'Donautal', theme: 'Klassisch', difficulty: 'leicht', startMoney: 4000, tint: 0xffffff,
    info: 'Sanfte Hügel an der Donau, Berge im Nordwesten, ein Sägewerk und ein Bergwerk. Der ideale Einstieg.',
    terrainSeed: 987654, landscapeSeed: 1234567, rockLevel: 0.45,
    rocks: [{ x0: 0, x1: 70, y0: 0, y1: 16, edge: 'N' }, { x0: 186, x1: 256, y0: 46, y1: 64, edge: 'S' }],
    lakes: [{ x: 20, y: 51, rx: 8, ry: 5 }, { x: 236, y: 13, rx: 7, ry: 4 }, { x: 196, y: 8, rx: 4, ry: 3 }, { x: 60, y: 54, rx: 5, ry: 3 }],
    rivers: [{ x: 44, a: 7, b: 4, w: 1.3 }, { x: 212, a: 6, b: 3, w: 1.1 }],
    forests: 26, villages: DONAU_VILLAGES,
    industries: [SAWMILL(152, 22, 25), MINE(196, 41, 40)],
    foreignLines: [NORTH(), SOUTH()],
    weather: { rain: 0.28, snow: 0.1 },
    names: { ln: 'Mühlkreisbahn', ls: 'Erlauftalbahn' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['tx', 'hv', 'cd'],
    inquiries: ['wx', 'cd', 'sb', 'tt', 'rx', 'nj', 'ro', 'lb', 'tx', 'hv', 'dm', 'cs', 'hs'],
  },
  {
    roads: [106, 148],
    vehicles: ['auto_1', 'auto_van', 'auto_0', 'auto_tractor'],
    id: 'alpen', ends: ['Bludenz', 'Innsbruck'], paper: 'Der Bergbote', name: 'Alpenbahn', theme: 'Gebirge', difficulty: 'schwer', startMoney: 5000, tint: 0xe4f0ea,
    info: 'Ein enges Tal zwischen hohen Gipfeln: wenig Platz, viel Schnee, Holz und Erz aus den Bergen. Weichenheizung lohnt sich!',
    terrainSeed: 424242, landscapeSeed: 777001, rockLevel: 0.32,
    rocks: [{ x0: 0, x1: 256, y0: 0, y1: 20, edge: 'N' }, { x0: 0, x1: 256, y0: 42, y1: 64, edge: 'S' }],
    lakes: [{ x: 40, y: 25, rx: 5, ry: 2 }, { x: 222, y: 37, rx: 6, ry: 2 }],
    rivers: [{ x: 236, a: 3, b: 2, w: 1.0 }],
    forests: 40, villages: [{ x: 60, y: 26 }, { x: 128, y: 24 }, { x: 180, y: 37 }, { x: 230, y: 25 }, { x: 20, y: 36 }],
    industries: [SAWMILL(88, 23, 26), MINE(170, 39, 37, 'Erzberg Bergbau')],
    foreignLines: [NORTH()],
    weather: { rain: 0.2, snow: 0.35 },
    names: { ln: 'Gipfelbahn', ro: 'Tauern Regional', wx: 'Alpen-Express', cd: 'Brenner Cargo', dm: 'Zillertaler Dampfbahn', lb: 'Ennstal-Pendel', hv: 'Gebirgsholz Transport', sb: 'S-Bahn Innsbruck', rx: 'Arlberg-REX' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['hv', 'cd', 'tx'],
    inquiries: ['wx', 'cd', 'rx', 'sb', 'nj', 'dm', 'tt', 'ro', 'lb', 'tx', 'hv', 'cs', 'hs'],
    stationNames: ['Bergheim', 'Schneealm', 'Lärchwald', 'Gipfelblick', 'Klammbrück', 'Hohenfeld', 'Steinach', 'Sonnalpe'],
  },
  {
    roads: [106, 148],
    vehicles: ['auto_tractor', 'auto_2', 'auto_tractor', 'auto_van'],
    id: 'ebene', ends: ['Wien', 'Bratislava'], paper: 'Marchfelder Rundschau', name: 'Pannonische Ebene', theme: 'Flachland', difficulty: 'leicht', startMoney: 4000, tint: 0xfff2cc,
    info: 'Weites, flaches Land voller Felder und Dörfer, kaum Schnee. Viel Güterverkehr und viele Pendler.',
    terrainSeed: 13579, landscapeSeed: 24680, rockLevel: 9,
    rocks: [],
    lakes: [{ x: 70, y: 50, rx: 10, ry: 5 }, { x: 200, y: 12, rx: 9, ry: 4 }, { x: 236, y: 52, rx: 6, ry: 3 }],
    rivers: [{ x: 30, a: 9, b: 5, w: 1.4 }],
    forests: 10, villages: [...DONAU_VILLAGES, { x: 180, y: 50 }, { x: 60, y: 12 }, { x: 210, y: 36 }],
    industries: [SAWMILL(160, 22, 25), MINE(100, 41, 40, 'Schotterwerk Ebenfurth')],
    foreignLines: [NORTH(), SOUTH()],
    weather: { rain: 0.25, snow: 0.04 },
    names: { ln: 'Kornfeldbahn', ls: 'Steppenbahn', ro: 'Weinviertler Regionalbahn', hv: 'Rübenbahn Marchfeld', cd: 'Pannonia Cargo', tx: 'Agrar Logistik', sb: 'S-Bahn Marchfeld', mn: 'Schotterwerk Ebenfurth' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['hv', 'tx', 'cd'],
    inquiries: ['cd', 'sb', 'tt', 'wx', 'tx', 'hv', 'ro', 'lb', 'rx', 'nj', 'cs', 'dm', 'hs'],
    stationNames: ['Weinsdorf', 'Marchfeld', 'Kornfeld', 'Rübenau', 'Sonnenebene', 'Pappelhof', 'Seewinkel', 'Steppenrand'],
  },
  {
    roads: [80, 176],
    vehicles: ['auto_van', 'auto_3', 'auto_van', 'auto_1'],
    id: 'revier', ends: ['Kohlstadt', 'Hüttenburg'], paper: 'Revier-Anzeiger', name: 'Industrierevier', theme: 'Industrie', difficulty: 'mittel', startMoney: 6000, tint: 0xe8e6de,
    info: 'Halden, Gruben und Schlote: Bergwerk und Sägewerk liegen nahe am Startgebiet, Güterzüge dominieren. Schnell zu Geld – wenn der Verkehr fließt.',
    terrainSeed: 31337, landscapeSeed: 90210, rockLevel: 0.5,
    rocks: [{ x0: 20, x1: 110, y0: 40, y1: 64, edge: 'S' }, { x0: 150, x1: 240, y0: 0, y1: 18, edge: 'N' }],
    lakes: [{ x: 210, y: 50, rx: 6, ry: 3 }],
    rivers: [{ x: 60, a: 4, b: 2, w: 1.2 }],
    forests: 14, villages: [{ x: 100, y: 20 }, { x: 160, y: 42 }, { x: 40, y: 22 }, { x: 220, y: 38 }, { x: 128, y: 52 }],
    industries: [SAWMILL(108, 22, 25), MINE(150, 41, 39, 'Zeche Glückauf')],
    foreignLines: [NORTH(), SOUTH()],
    weather: { rain: 0.35, snow: 0.08 },
    names: { ln: 'Zechenbahn', ls: 'Kanalbahn', cd: 'Revier Cargo', tx: 'Chemie Transport', cs: 'Rangierbetrieb Revier', ro: 'Revier-Regionalbahn' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['cd', 'tx', 'hv'],
    inquiries: ['cd', 'tx', 'cs', 'wx', 'sb', 'tt', 'hv', 'rx', 'nj', 'ro', 'lb', 'dm', 'hs'],
    stationNames: ['Zechenhausen', 'Kohlberg', 'Glückauf', 'Hüttendorf', 'Schachtweg', 'Eisenstadt Nord', 'Hochofen', 'Haldenblick'],
  },
  {
    roads: [106, 180],
    vehicles: ['auto_jeep', 'auto_van', 'auto_jeep', 'auto_2'],
    id: 'wueste', ends: ['Sandheim', 'Dattelburg'], paper: 'Oasen-Bote', name: 'Wüstenbahn', theme: 'Wüste', difficulty: 'mittel', startMoney: 5000, tint: 0xffffff, ground: 'sand',
    info: 'Sand, Kakteen und Palmen-Oasen, fast nie Regen. Eine Salzmine im Süden und viel Fernverkehr quer durch die Dünen.',
    terrainSeed: 55501, landscapeSeed: 66602, rockLevel: 0.48,
    rocks: [{ x0: 0, x1: 90, y0: 0, y1: 14, edge: 'N' }, { x0: 170, x1: 256, y0: 0, y1: 12, edge: 'N' }, { x0: 0, x1: 60, y0: 50, y1: 64, edge: 'S' }],
    lakes: [{ x: 70, y: 48, rx: 3, ry: 2 }, { x: 190, y: 16, rx: 4, ry: 2 }],
    rivers: [],
    forests: 16, houses: ['bld_adobeA', 'bld_adobeB', 'bld_adobeA', 'bld_adobeC', 'bld_adobeC', 'bld_well', 'bld_tent', 'bld_tent'], trees: ['bld_cactus0', 'bld_cactus1', 'bld_cactus0', 'bld_palm0', 'bld_palm1', 'bld_drybush', 'bld_drybush'],
    villages: [{ x: 70, y: 22 }, { x: 186, y: 40 }, { x: 130, y: 52 }, { x: 230, y: 24 }, { x: 30, y: 40 }],
    industries: [MINE(150, 41, 39, 'Salzmine Sandhausen')],
    foreignLines: [NORTH(), SOUTH()],
    weather: { rain: 0.05, snow: 0 },
    names: { ln: 'Oasenbahn', ls: 'Karawanenbahn', ro: 'Oasen-Regionalbahn', cd: 'Karawane Cargo', wx: 'Sandsturm-Express', hv: 'Dattel Logistik', dm: 'Wüstendampfer', lb: 'Dünen-Pendel', tx: 'Öl Transport', mn: 'Salzmine Sandhausen' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['tx', 'cd', 'hv'],
    inquiries: ['wx', 'tx', 'cd', 'rx', 'nj', 'sb', 'tt', 'ro', 'lb', 'hv', 'dm', 'cs', 'hs'],
    stationNames: ['Oase Nord', 'Sandhausen', 'Dünenfeld', 'Kamelbrunn', 'Palmental', 'Sonnenstein', 'Staubweiler', 'Fata Morgana'],
  },
  {
    roads: [106, 182],
    vehicles: ['auto_plow', 'auto_1', 'auto_0', 'auto_van'],
    id: 'schnee', ends: ['Eisberg', 'Frostfurt'], paper: 'Nordlicht-Zeitung', name: 'Schneeland', theme: 'Winter', difficulty: 'schwer', startMoney: 5500, tint: 0xffffff, ground: 'snow',
    info: 'Tief verschneite Wälder, zugefrorene Seen und fast täglich Neuschnee. Ohne Weichenheizung kriechen die Züge. Holz und Erz gibt es reichlich.',
    terrainSeed: 70707, landscapeSeed: 80808, rockLevel: 0.42,
    rocks: [{ x0: 0, x1: 120, y0: 0, y1: 15, edge: 'N' }, { x0: 140, x1: 256, y0: 48, y1: 64, edge: 'S' }],
    lakes: [{ x: 40, y: 50, rx: 7, ry: 4 }, { x: 210, y: 14, rx: 6, ry: 3 }],
    rivers: [{ x: 96, a: 5, b: 3, w: 1.1 }],
    forests: 36, trees: ['bld_snowpine0', 'bld_snowpine1', 'bld_snowpine0', 'bld_snowpine1', 'bld_pine0'],
    villages: [{ x: 70, y: 22 }, { x: 160, y: 42 }, { x: 200, y: 26 }, { x: 120, y: 54 }, { x: 30, y: 30 }],
    industries: [SAWMILL(150, 22, 25, 'Sägewerk Tannheim'), MINE(80, 41, 40, 'Erzgrube Frostberg')],
    foreignLines: [NORTH(), SOUTH()],
    weather: { rain: 0.04, snow: 0.6 },
    names: { ln: 'Polarkreisbahn', ls: 'Rentierbahn', ro: 'Polarlicht Regional', cd: 'Eismeer Cargo', wx: 'Nordlicht-Express', hv: 'Holzfäller Transport', dm: 'Rentier-Dampfbahn', lb: 'Gletscher-Pendel', sb: 'S-Bahn Frosthafen' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['hv', 'cd', 'tx'],
    inquiries: ['wx', 'hv', 'cd', 'nj', 'rx', 'sb', 'tt', 'ro', 'lb', 'tx', 'dm', 'cs', 'hs'],
    stationNames: ['Frosthafen', 'Eisdorf', 'Tannheim', 'Schneewinkel', 'Rentierhof', 'Polarstern', 'Kaltenbrunn', 'Weißenau'],
  },
  {
    roads: [108, 148],
    vehicles: ['auto_taxi', 'auto_van', 'auto_1', 'auto_taxi'],
    id: 'stadt', ends: ['Westbahnhof', 'Ostbahnhof'], paper: 'Großstadt-Echo', name: 'Großstadt', theme: 'Metropole', difficulty: 'schwer', startMoney: 8000, tint: 0xeef0f2,
    info: 'Häuserblöcke, Bürotürme, ein Kanal und eine Hochbahn quer über den Bahnhof. S-Bahn, Fernzüge und Güterverkehr wollen alle gleichzeitig durch. Das Finale.',
    terrainSeed: 90901, landscapeSeed: 91902, rockLevel: 0.7,
    rocks: [],
    lakes: [{ x: 40, y: 50, rx: 5, ry: 3 }],
    rivers: [{ x: 150, a: 3, b: 2, w: 1.4 }],
    forests: 5, trees: ['bld_tree0', 'bld_tree1', 'bld_tree2', 'bld_bush0'], city: true, villageSize: 18,
    viaducts: [{ x: 136, y0: 14, y1: 50, piers: [14, 18, 22, 26, 29, 35, 38, 42, 46, 50] }],
    houses: ['bld_cityA', 'bld_cityB', 'bld_cityC', 'bld_cityA', 'bld_cityB', 'bld_slab', 'bld_office', 'bld_cityC'],
    villages: [{ x: 30, y: 18 }, { x: 70, y: 16 }, { x: 110, y: 20 }, { x: 190, y: 18 }, { x: 230, y: 16 },
      { x: 50, y: 44 }, { x: 95, y: 46 }, { x: 130, y: 44 }, { x: 175, y: 46 }, { x: 215, y: 44 }, { x: 245, y: 48 }, { x: 150, y: 8 }, { x: 110, y: 56 }],
    industries: [],
    foreignLines: [NORTH(), SOUTH()],
    weather: { rain: 0.18, snow: 0.05 },
    names: { ln: 'Villenbahn', ls: 'Hafenbahn', ro: 'Stadtregional', sb: 'S-Bahn Metropole', tt: 'Vorortbahn', wx: 'Metropolitan Express', hs: 'Hauptstadt-Sprinter', cd: 'Hafen Cargo', lb: 'Ringbahn', nj: 'Nachtschiene Metropole' },
    tenderRegio: ['sb', 'tt', 'ro'], tenderFreight: ['cd', 'tx', 'hv'],
    inquiries: ['sb', 'wx', 'hs', 'nj', 'rx', 'tt', 'lb', 'cd', 'ro', 'tx', 'dm', 'cs'],
    stationNames: ['Altstadt', 'Kanalbrücke', 'Rathausplatz', 'Messe', 'Universität', 'Neubauviertel', 'Hafentor', 'Zentrum'],
  },
];

/**
 * Karte in die doppelt so hohe Welt setzen (RM-FR-MAP-12): alles rückt um ROW0 nach unten, Felsränder reichen bis an den Kartenrand,
 * und in den neuen Streifen oben und unten entstehen ein paar Dörfer und Seen (immer gleich, aus dem Landschafts-Startwert).
 * Werke und Fremdbahnen sind schon in neuen Koordinaten.
 */
function lift(m: MapDef): MapDef {
  let a = (m.landscapeSeed >>> 0) || 1;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (lo: number, hi: number) => Math.floor(lo + r() * (hi - lo + 1));
  const outer = (n: number) => Array.from({ length: n }, (_, i) => ({ x: ri(12, 244), y: i % 2 ? ri(MAP_H - ROW0 + 6, MAP_H - 8) : ri(6, ROW0 - 6) }));
  const extraV = m.villages.length ? outer(m.city ? 8 : 6) : [];
  const extraL = outer(2).map((p) => ({ ...p, rx: ri(4, 9), ry: ri(2, 4) }));
  return {
    ...m,
    rocks: m.rocks.map((k) => ({ ...k, y0: k.edge === 'N' && k.y0 === 0 ? 0 : k.y0 + ROW0, y1: k.edge === 'S' && k.y1 >= 64 ? MAP_H : k.y1 + ROW0 })),
    lakes: [...m.lakes.map((l) => ({ ...l, y: l.y + ROW0 })), ...extraL],
    villages: [...m.villages.map((v) => ({ ...v, y: v.y + ROW0 })), ...extraV],
    viaducts: m.viaducts?.map((v) => ({ ...v, y0: v.y0 + ROW0, y1: v.y1 + ROW0, piers: v.piers.map((p) => p + ROW0) })),
  };
}

export const MAPS: MapDef[] = RAW_MAPS.map(lift);

let current: MapDef = MAPS[0];

export const currentMap = () => current;

/** Zufallskarte aus einem Startwert (RM-FR-END-02): gleicher Startwert = gleiche Karte */
export const RANDOM_PREFIX = 'zufall-';
export function isRandomMap(id: string | undefined) { return !!id && id.startsWith(RANDOM_PREFIX); }
export function randomMap(seed: number): MapDef {
  let a = (seed >>> 0) || 1;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (lo: number, hi: number) => Math.floor(lo + r() * (hi - lo + 1));
  const base = RAW_MAPS[seed % RAW_MAPS.length];
  // Dörfer und Seen abseits der Strecke (Reihen 28–36 bleiben frei)
  const away = () => (r() < 0.5 ? ri(4, 22) : ri(42, 58));
  const villages = Array.from({ length: ri(6, 11) }, () => ({ x: ri(10, 246), y: away() }));
  const lakes = Array.from({ length: ri(0, 4) }, () => ({ x: ri(20, 236), y: away(), rx: ri(4, 10), ry: ri(2, 5) }));
  const rivers = r() < 0.6 ? [{ x: ri(20, 230), a: ri(4, 12), b: ri(3, 8), w: 1 + r() }] : [];
  return lift({
    ...base, base: base.id, id: `${RANDOM_PREFIX}${seed}`, name: `Zufallskarte ${seed}`,
    info: `Zufällig erzeugt aus dem Startwert ${seed} (${base.theme}). Gleicher Startwert = gleiche Karte.`,
    terrainSeed: (seed * 7919) % 1000003, landscapeSeed: (seed * 104729) % 1000003,
    villages, lakes, rivers, forests: ri(6, 18),
    rockLevel: base.rockLevel,
  });
}

/** eigene Karten (RM-FR-MOD-04): vom Karten-Editor oder aus dem Spielstand angemeldet */
export const CUSTOM_PREFIX = 'eigen-';
export const isCustomMap = (id: string | undefined) => !!id && id.startsWith(CUSTOM_PREFIX);
const custom = new Map<string, MapDef>();
export function registerMap(def: MapDef) { custom.set(def.id, def); }
export const registeredMap = (id: string) => custom.get(id);

/** Kartendaten zu einer Kennung (mitgeliefert, Zufallskarte oder eigene) */
export function mapById(id: string | undefined): MapDef | undefined {
  if (isRandomMap(id)) return randomMap(Number(id!.slice(RANDOM_PREFIX.length)) || 1);
  if (isCustomMap(id)) return custom.get(id!);
  return MAPS.find((m) => m.id === id);
}

/** kurz auf eine andere Karte umschalten (z. B. Vorschau im Editor) und zurück */
export function withMap<T>(def: MapDef, f: () => T): T {
  const prev = current;
  current = def;
  try { return f(); } finally { current = prev; }
}

/** vor dem Erzeugen des Spiels aufrufen */
export function setMap(id: string | undefined) {
  current = mapById(id) ?? MAPS[0];
  for (const o of Object.values(OPERATORS)) Object.assign(o, OP_DEFAULTS[o.id]);
  for (const [op, name] of Object.entries(current.names ?? {})) OPERATORS[op as OperatorId].name = name!;
}
