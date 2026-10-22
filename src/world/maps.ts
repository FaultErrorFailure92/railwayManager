import { OPERATORS, OperatorId } from '../sim/Operators';
import type { Industry } from './industries';

/** Karten (Szenarien): eigenes Gelände, eigene Bahnunternehmen, eigenes Thema */
export interface RockRange { x0: number; x1: number; y0: number; y1: number; edge: 'N' | 'S' }
export interface MapDef {
  id: string;
  name: string;
  /** Lokalzeitung */
  paper: string;
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
  weather: { rain: number; snow: number };
  /** Namen der Bahnunternehmen auf dieser Karte */
  names?: Partial<Record<OperatorId, string>>;
  tenderRegio: OperatorId[];
  tenderFreight: OperatorId[];
  inquiries: OperatorId[];
  /** Ortsnamen für Bahnhöfe */
  stationNames?: string[];
}

const DONAU_VILLAGES = [
  { x: 90, y: 20 }, { x: 160, y: 41 }, { x: 150, y: 21 }, { x: 100, y: 42 },
  { x: 30, y: 38 }, { x: 70, y: 24 }, { x: 200, y: 24 }, { x: 240, y: 40 }, { x: 130, y: 8 }, { x: 128, y: 56 },
];

const SAWMILL = (x: number, y: number, row: number, name = 'Sägewerk Holzer'): Industry => ({ id: 'sawmill', name, key: 'bld_sawmill', x, y, row, x0: x - 4, x1: x + 5, op: 'sw' });
const MINE = (x: number, y: number, row: number, name = 'Bergwerk Erzleiten'): Industry => ({ id: 'mine', name, key: 'bld_mine', x, y, row, x0: x - 4, x1: x + 5, op: 'mn' });

export const MAPS: MapDef[] = [
  {
    id: 'donau', paper: 'Donau-Kurier', name: 'Donautal', theme: 'Klassisch', difficulty: 'leicht', startMoney: 4000, tint: 0xffffff,
    info: 'Sanfte Hügel an der Donau, Berge im Nordwesten, ein Sägewerk und ein Bergwerk. Der ideale Einstieg.',
    terrainSeed: 987654, landscapeSeed: 1234567, rockLevel: 0.45,
    rocks: [{ x0: 0, x1: 70, y0: 0, y1: 16, edge: 'N' }, { x0: 186, x1: 256, y0: 46, y1: 64, edge: 'S' }],
    lakes: [{ x: 20, y: 51, rx: 8, ry: 5 }, { x: 236, y: 13, rx: 7, ry: 4 }, { x: 196, y: 8, rx: 4, ry: 3 }, { x: 60, y: 54, rx: 5, ry: 3 }],
    rivers: [{ x: 44, a: 7, b: 4, w: 1.3 }, { x: 212, a: 6, b: 3, w: 1.1 }],
    forests: 26, villages: DONAU_VILLAGES,
    industries: [SAWMILL(152, 22, 25), MINE(196, 41, 40)],
    weather: { rain: 0.28, snow: 0.1 },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['tx', 'hv', 'cd'],
    inquiries: ['wx', 'cd', 'sb', 'tt', 'rx', 'nj', 'ro', 'lb', 'tx', 'hv', 'dm', 'cs', 'hs'],
  },
  {
    id: 'alpen', paper: 'Der Bergbote', name: 'Alpenbahn', theme: 'Gebirge', difficulty: 'schwer', startMoney: 5000, tint: 0xe4f0ea,
    info: 'Ein enges Tal zwischen hohen Gipfeln: wenig Platz, viel Schnee, Holz und Erz aus den Bergen. Weichenheizung lohnt sich!',
    terrainSeed: 424242, landscapeSeed: 777001, rockLevel: 0.32,
    rocks: [{ x0: 0, x1: 256, y0: 0, y1: 20, edge: 'N' }, { x0: 0, x1: 256, y0: 42, y1: 64, edge: 'S' }],
    lakes: [{ x: 40, y: 25, rx: 5, ry: 2 }, { x: 222, y: 37, rx: 6, ry: 2 }],
    rivers: [{ x: 236, a: 3, b: 2, w: 1.0 }],
    forests: 40, villages: [{ x: 60, y: 26 }, { x: 128, y: 24 }, { x: 180, y: 37 }, { x: 230, y: 25 }, { x: 20, y: 36 }],
    industries: [SAWMILL(88, 23, 26), MINE(170, 39, 37, 'Erzberg Bergbau')],
    weather: { rain: 0.2, snow: 0.35 },
    names: { ro: 'Tauern Regional', wx: 'Alpen-Express', cd: 'Brenner Cargo', dm: 'Zillertaler Dampfbahn', lb: 'Ennstal-Pendel', hv: 'Gebirgsholz Transport', sb: 'S-Bahn Innsbruck', rx: 'Arlberg-REX' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['hv', 'cd', 'tx'],
    inquiries: ['wx', 'cd', 'rx', 'sb', 'nj', 'dm', 'tt', 'ro', 'lb', 'tx', 'hv', 'cs', 'hs'],
    stationNames: ['Bergheim', 'Schneealm', 'Lärchwald', 'Gipfelblick', 'Klammbrück', 'Hohenfeld', 'Steinach', 'Sonnalpe'],
  },
  {
    id: 'ebene', paper: 'Marchfelder Rundschau', name: 'Pannonische Ebene', theme: 'Flachland', difficulty: 'leicht', startMoney: 4000, tint: 0xfff2cc,
    info: 'Weites, flaches Land voller Felder und Dörfer, kaum Schnee. Viel Güterverkehr und viele Pendler.',
    terrainSeed: 13579, landscapeSeed: 24680, rockLevel: 9,
    rocks: [],
    lakes: [{ x: 70, y: 50, rx: 10, ry: 5 }, { x: 200, y: 12, rx: 9, ry: 4 }, { x: 236, y: 52, rx: 6, ry: 3 }],
    rivers: [{ x: 30, a: 9, b: 5, w: 1.4 }],
    forests: 10, villages: [...DONAU_VILLAGES, { x: 180, y: 50 }, { x: 60, y: 12 }, { x: 210, y: 36 }],
    industries: [SAWMILL(160, 22, 25), MINE(100, 41, 40, 'Schotterwerk Ebenfurth')],
    weather: { rain: 0.25, snow: 0.04 },
    names: { ro: 'Weinviertler Regionalbahn', hv: 'Rübenbahn Marchfeld', cd: 'Pannonia Cargo', tx: 'Agrar Logistik', sb: 'S-Bahn Marchfeld', mn: 'Schotterwerk Ebenfurth' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['hv', 'tx', 'cd'],
    inquiries: ['cd', 'sb', 'tt', 'wx', 'tx', 'hv', 'ro', 'lb', 'rx', 'nj', 'cs', 'dm', 'hs'],
    stationNames: ['Weinsdorf', 'Marchfeld', 'Kornfeld', 'Rübenau', 'Sonnenebene', 'Pappelhof', 'Seewinkel', 'Steppenrand'],
  },
  {
    id: 'revier', paper: 'Revier-Anzeiger', name: 'Industrierevier', theme: 'Industrie', difficulty: 'mittel', startMoney: 6000, tint: 0xe8e6de,
    info: 'Halden, Gruben und Schlote: Bergwerk und Sägewerk liegen nahe am Startgebiet, Güterzüge dominieren. Schnell zu Geld – wenn der Verkehr fließt.',
    terrainSeed: 31337, landscapeSeed: 90210, rockLevel: 0.5,
    rocks: [{ x0: 20, x1: 110, y0: 40, y1: 64, edge: 'S' }, { x0: 150, x1: 240, y0: 0, y1: 18, edge: 'N' }],
    lakes: [{ x: 210, y: 50, rx: 6, ry: 3 }],
    rivers: [{ x: 60, a: 4, b: 2, w: 1.2 }],
    forests: 14, villages: [{ x: 100, y: 20 }, { x: 160, y: 42 }, { x: 40, y: 22 }, { x: 220, y: 38 }, { x: 128, y: 52 }],
    industries: [SAWMILL(108, 22, 25), MINE(150, 41, 39, 'Zeche Glückauf')],
    weather: { rain: 0.35, snow: 0.08 },
    names: { cd: 'Revier Cargo', tx: 'Chemie Transport', cs: 'Rangierbetrieb Revier', ro: 'Revier-Regionalbahn' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['cd', 'tx', 'hv'],
    inquiries: ['cd', 'tx', 'cs', 'wx', 'sb', 'tt', 'hv', 'rx', 'nj', 'ro', 'lb', 'dm', 'hs'],
    stationNames: ['Zechenhausen', 'Kohlberg', 'Glückauf', 'Hüttendorf', 'Schachtweg', 'Eisenstadt Nord', 'Hochofen', 'Haldenblick'],
  },
  {
    id: 'wueste', paper: 'Oasen-Bote', name: 'Wüstenbahn', theme: 'Wüste', difficulty: 'mittel', startMoney: 5000, tint: 0xffffff, ground: 'sand',
    info: 'Sand, Kakteen und Palmen-Oasen, fast nie Regen. Eine Salzmine im Süden und viel Fernverkehr quer durch die Dünen.',
    terrainSeed: 55501, landscapeSeed: 66602, rockLevel: 0.48,
    rocks: [{ x0: 0, x1: 90, y0: 0, y1: 14, edge: 'N' }, { x0: 170, x1: 256, y0: 0, y1: 12, edge: 'N' }, { x0: 0, x1: 60, y0: 50, y1: 64, edge: 'S' }],
    lakes: [{ x: 70, y: 48, rx: 3, ry: 2 }, { x: 190, y: 16, rx: 4, ry: 2 }],
    rivers: [],
    forests: 16, houses: ['bld_adobeA', 'bld_adobeB', 'bld_adobeA', 'bld_adobeC', 'bld_adobeC', 'bld_well', 'bld_tent', 'bld_tent'], trees: ['bld_cactus0', 'bld_cactus1', 'bld_cactus0', 'bld_palm0', 'bld_palm1', 'bld_drybush', 'bld_drybush'],
    villages: [{ x: 70, y: 22 }, { x: 186, y: 40 }, { x: 130, y: 52 }, { x: 230, y: 24 }, { x: 30, y: 40 }],
    industries: [MINE(150, 41, 39, 'Salzmine Sandhausen')],
    weather: { rain: 0.05, snow: 0 },
    names: { ro: 'Oasen-Regionalbahn', cd: 'Karawane Cargo', wx: 'Sandsturm-Express', hv: 'Dattel Logistik', dm: 'Wüstendampfer', lb: 'Dünen-Pendel', tx: 'Öl Transport', mn: 'Salzmine Sandhausen' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['tx', 'cd', 'hv'],
    inquiries: ['wx', 'tx', 'cd', 'rx', 'nj', 'sb', 'tt', 'ro', 'lb', 'hv', 'dm', 'cs', 'hs'],
    stationNames: ['Oase Nord', 'Sandhausen', 'Dünenfeld', 'Kamelbrunn', 'Palmental', 'Sonnenstein', 'Staubweiler', 'Fata Morgana'],
  },
  {
    id: 'schnee', paper: 'Nordlicht-Zeitung', name: 'Schneeland', theme: 'Winter', difficulty: 'schwer', startMoney: 5500, tint: 0xffffff, ground: 'snow',
    info: 'Tief verschneite Wälder, zugefrorene Seen und fast täglich Neuschnee. Ohne Weichenheizung kriechen die Züge. Holz und Erz gibt es reichlich.',
    terrainSeed: 70707, landscapeSeed: 80808, rockLevel: 0.42,
    rocks: [{ x0: 0, x1: 120, y0: 0, y1: 15, edge: 'N' }, { x0: 140, x1: 256, y0: 48, y1: 64, edge: 'S' }],
    lakes: [{ x: 40, y: 50, rx: 7, ry: 4 }, { x: 210, y: 14, rx: 6, ry: 3 }],
    rivers: [{ x: 96, a: 5, b: 3, w: 1.1 }],
    forests: 36, trees: ['bld_snowpine0', 'bld_snowpine1', 'bld_snowpine0', 'bld_snowpine1', 'bld_pine0'],
    villages: [{ x: 70, y: 22 }, { x: 160, y: 42 }, { x: 200, y: 26 }, { x: 120, y: 54 }, { x: 30, y: 30 }],
    industries: [SAWMILL(150, 22, 25, 'Sägewerk Tannheim'), MINE(80, 41, 40, 'Erzgrube Frostberg')],
    weather: { rain: 0.04, snow: 0.6 },
    names: { ro: 'Polarlicht Regional', cd: 'Eismeer Cargo', wx: 'Nordlicht-Express', hv: 'Holzfäller Transport', dm: 'Rentier-Dampfbahn', lb: 'Gletscher-Pendel', sb: 'S-Bahn Frosthafen' },
    tenderRegio: ['ro', 'lb', 'dm'], tenderFreight: ['hv', 'cd', 'tx'],
    inquiries: ['wx', 'hv', 'cd', 'nj', 'rx', 'sb', 'tt', 'ro', 'lb', 'tx', 'dm', 'cs', 'hs'],
    stationNames: ['Frosthafen', 'Eisdorf', 'Tannheim', 'Schneewinkel', 'Rentierhof', 'Polarstern', 'Kaltenbrunn', 'Weißenau'],
  },
];

let current: MapDef = MAPS[0];

export const currentMap = () => current;

/** vor dem Erzeugen des Spiels aufrufen */
export function setMap(id: string | undefined) {
  current = MAPS.find((m) => m.id === id) ?? MAPS[0];
  for (const [op, name] of Object.entries(current.names ?? {})) OPERATORS[op as OperatorId].name = name!;
}
