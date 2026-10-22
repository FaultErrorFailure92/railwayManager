export type BuildingGroup = 'func' | 'deco' | 'nature' | 'facility' | 'road' | 'industry';

export interface BuildingDef {
  key: string;
  label: string;
  /** kurze Wirkung (für Tooltip) */
  effect: string;
  w: number;
  h: number;
  cost: number;
  /** steht auf dem Bahnsteig statt auf der Wiese */
  onPlatform: boolean;
  group: BuildingGroup;
  /** Abrisskosten, wenn das Gebäude schon in der Landschaft stand */
  demolish: number;
  /** steht über einem geraden Gleis (Remise, Werkstatt, Waschanlage, Abrollberg) */
  onTrack?: boolean;
  /** Teil der Landschaft, kann nicht abgerissen werden (Berge) */
  fixed?: boolean;
}

const defs: BuildingDef[] = [
  { key: 'bld_station', label: 'Empfangsgebäude', effect: '+15 % Einnahmen Personenverkehr', w: 3, h: 2, cost: 2500, onPlatform: false, group: 'func', demolish: 600 },
  { key: 'bld_shelter', label: 'Wartehalle', effect: 'Wartende bleiben länger geduldig', w: 1, h: 1, cost: 400, onPlatform: true, group: 'func', demolish: 100 },
  { key: 'bld_kiosk', label: 'Kiosk', effect: '+0,25 € je Fahrgast, macht Wartende froh', w: 1, h: 1, cost: 600, onPlatform: true, group: 'func', demolish: 100 },
  { key: 'bld_bench', label: 'Sitzbank', effect: 'Wartende etwas geduldiger', w: 1, h: 1, cost: 150, onPlatform: true, group: 'func', demolish: 30 },
  { key: 'bld_houseA', label: 'Wohnhaus grau', effect: 'Deko', w: 2, h: 2, cost: 800, onPlatform: false, group: 'deco', demolish: 400 },
  { key: 'bld_houseB', label: 'Wohnhaus gelb', effect: 'Deko', w: 2, h: 2, cost: 800, onPlatform: false, group: 'deco', demolish: 400 },
  { key: 'bld_tree0', label: 'Laubbaum', effect: 'Deko', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_tree1', label: 'Laubbaum', effect: 'Deko', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_tree2', label: 'Laubbaum', effect: 'Deko', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_pine0', label: 'Nadelbaum', effect: 'Deko', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_pine1', label: 'Nadelbaum', effect: 'Deko', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_remise', label: 'Remise', effect: 'Abstellplatz unter Dach, Innenreinigung (+100 €)', w: 5, h: 1, cost: 3000, onPlatform: false, group: 'facility', demolish: 0, onTrack: true },
  { key: 'bld_workshop', label: 'Werkstatt', effect: 'repariert abgestellte Züge (+400 €)', w: 5, h: 1, cost: 6000, onPlatform: false, group: 'facility', demolish: 0, onTrack: true },
  { key: 'bld_wash', label: 'Waschanlage', effect: 'Durchfahrt wäscht den Zug (+150 €)', w: 3, h: 1, cost: 3500, onPlatform: false, group: 'facility', demolish: 0, onTrack: true },
  { key: 'bld_hump', label: 'Abrollberg', effect: 'Zerlegezüge enden hier, Wagen rollen in Richtungsgleise', w: 2, h: 1, cost: 5000, onPlatform: false, group: 'facility', demolish: 0, onTrack: true },
  { key: 'bld_mtn0', label: 'Berg', effect: 'Landschaft', w: 3, h: 3, cost: 0, onPlatform: false, group: 'nature', demolish: 0, fixed: true },
  { key: 'bld_mtn1', label: 'Berg', effect: 'Landschaft', w: 2, h: 2, cost: 0, onPlatform: false, group: 'nature', demolish: 0, fixed: true },
  { key: 'bld_mtn2', label: 'Berg', effect: 'Landschaft', w: 3, h: 3, cost: 0, onPlatform: false, group: 'nature', demolish: 0, fixed: true },
  { key: 'bld_mtn3', label: 'Hügel', effect: 'Landschaft', w: 2, h: 2, cost: 0, onPlatform: false, group: 'nature', demolish: 0, fixed: true },
  { key: 'bld_rock0', label: 'Felsbrocken', effect: 'Landschaft', w: 1, h: 1, cost: 0, onPlatform: false, group: 'nature', demolish: 0, fixed: true },
  { key: 'bld_rock1', label: 'Felsbrocken', effect: 'Landschaft', w: 1, h: 1, cost: 0, onPlatform: false, group: 'nature', demolish: 0, fixed: true },
  { key: 'bld_station2', label: 'Empfangsgebäude (groß)', effect: '+25 % Einnahmen Personenverkehr', w: 3, h: 2, cost: 2500, onPlatform: false, group: 'func', demolish: 600 },
  { key: 'bld_station3', label: 'Empfangsgebäude mit Uhrturm', effect: '+40 % Einnahmen Personenverkehr', w: 3, h: 2, cost: 2500, onPlatform: false, group: 'func', demolish: 600 },
  { key: 'bld_cafe', label: 'Café', effect: 'verkauft Kaffee und Kuchen – Preis per Klick einstellen', w: 2, h: 2, cost: 2500, onPlatform: false, group: 'func', demolish: 300 },
  { key: 'bld_vending', label: 'Automat', effect: 'Snacks am Bahnsteig – Preis per Klick einstellen', w: 1, h: 1, cost: 300, onPlatform: true, group: 'func', demolish: 50 },
  { key: 'bld_parking', label: 'Parkplatz', effect: 'mit Straße am Bahnhof: +10 % Einnahmen', w: 3, h: 2, cost: 2000, onPlatform: false, group: 'road', demolish: 300 },
  { key: 'bld_bus', label: 'Busterminal', effect: 'mit Straße am Bahnhof: +15 % Einnahmen', w: 3, h: 2, cost: 4000, onPlatform: false, group: 'road', demolish: 500 },
  { key: 'bld_fountain', label: 'Brunnen', effect: 'Deko · Wartende etwas froher', w: 1, h: 1, cost: 600, onPlatform: false, group: 'deco', demolish: 100 },
  { key: 'bld_flowers', label: 'Blumenbeet', effect: 'Deko · Wartende etwas froher', w: 1, h: 1, cost: 150, onPlatform: false, group: 'deco', demolish: 30 },
  { key: 'bld_statue', label: 'Denkmal', effect: 'Deko', w: 1, h: 1, cost: 900, onPlatform: false, group: 'deco', demolish: 100 },
  { key: 'bld_lamp', label: 'Laterne', effect: 'Deko am Bahnsteig · leuchtet in der Nacht', w: 1, h: 1, cost: 120, onPlatform: true, group: 'deco', demolish: 20 },
  { key: 'bld_clock', label: 'Bahnhofsuhr', effect: 'Wartende etwas geduldiger', w: 1, h: 1, cost: 400, onPlatform: true, group: 'func', demolish: 50 },
  { key: 'bld_sawmill', label: 'Sägewerk', effect: 'Privatbahn: Ladegleis mit deiner Strecke verbinden – zahlt für jede Fahrt', w: 3, h: 2, cost: 0, onPlatform: false, group: 'industry', demolish: 0, fixed: true },
  { key: 'bld_mine', label: 'Bergwerk', effect: 'Privatbahn: Ladegleis mit deiner Strecke verbinden – zahlt für jede Fahrt', w: 3, h: 2, cost: 0, onPlatform: false, group: 'industry', demolish: 0, fixed: true },
  { key: 'bld_streetlamp', label: 'Straßenlaterne', effect: 'Deko · leuchtet in der Nacht', w: 1, h: 1, cost: 150, onPlatform: false, group: 'deco', demolish: 20 },
  { key: 'bld_wc', label: 'WC-Anlage', effect: 'Wartende geduldiger · Benutzungsgebühr (Preis per Klick)', w: 1, h: 1, cost: 900, onPlatform: false, group: 'func', demolish: 100 },
  { key: 'bld_inn', label: 'Gasthaus', effect: 'Wirtshaus am Bahnhof – Preis per Klick einstellen', w: 2, h: 2, cost: 4500, onPlatform: false, group: 'func', demolish: 600 },
  { key: 'bld_bush0', label: 'Busch', effect: 'Deko', w: 1, h: 1, cost: 20, onPlatform: false, group: 'nature', demolish: 10 },
  { key: 'bld_billboard', label: 'Plakatwand', effect: 'Werbung: Geld für jeden Fahrgast (bis 6 Wände)', w: 1, h: 1, cost: 800, onPlatform: false, group: 'func', demolish: 100 },
  { key: 'bld_lockers', label: 'Schließfächer', effect: 'Gepäckaufbewahrung – Gebühr per Klick einstellen', w: 1, h: 1, cost: 700, onPlatform: true, group: 'func', demolish: 80 },
  { key: 'bld_souvenir', label: 'Souvenirladen', effect: 'Andenken – bei Volksfesten dreimal so viele Käufer', w: 1, h: 1, cost: 1800, onPlatform: true, group: 'func', demolish: 200 },
  { key: 'bld_mural', label: 'Wandbild', effect: 'Kunst am Bau · Wartende froher', w: 1, h: 1, cost: 1200, onPlatform: false, group: 'deco', demolish: 100 },
  { key: 'bld_xmas', label: 'Christbaum', effect: 'Festschmuck · Wartende deutlich froher · leuchtet', w: 1, h: 1, cost: 600, onPlatform: false, group: 'deco', demolish: 50 },
  { key: 'bld_adobeA', label: 'Lehmhaus', effect: 'Deko', w: 2, h: 2, cost: 800, onPlatform: false, group: 'deco', demolish: 400 },
  { key: 'bld_adobeB', label: 'Lehmhaus mit Kuppel', effect: 'Deko', w: 2, h: 2, cost: 900, onPlatform: false, group: 'deco', demolish: 400 },
  { key: 'bld_adobeC', label: 'Lehmhütte', effect: 'Deko', w: 1, h: 1, cost: 400, onPlatform: false, group: 'deco', demolish: 200 },
  { key: 'bld_well', label: 'Brunnen (Ziehbrunnen)', effect: 'Deko', w: 1, h: 1, cost: 300, onPlatform: false, group: 'deco', demolish: 100 },
  { key: 'bld_tent', label: 'Zelt', effect: 'Deko', w: 1, h: 1, cost: 100, onPlatform: false, group: 'deco', demolish: 50 },
  { key: 'bld_cactus0', label: 'Kaktus', effect: 'Landschaft', w: 1, h: 1, cost: 20, onPlatform: false, group: 'nature', demolish: 20 },
  { key: 'bld_cactus1', label: 'Kaktus', effect: 'Landschaft', w: 1, h: 1, cost: 20, onPlatform: false, group: 'nature', demolish: 20 },
  { key: 'bld_palm0', label: 'Palme', effect: 'Landschaft', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_palm1', label: 'Palme', effect: 'Landschaft', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_drybush', label: 'Dornbusch', effect: 'Landschaft', w: 1, h: 1, cost: 10, onPlatform: false, group: 'nature', demolish: 10 },
  { key: 'bld_snowpine0', label: 'Verschneite Tanne', effect: 'Landschaft', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
  { key: 'bld_snowpine1', label: 'Verschneite Tanne', effect: 'Landschaft', w: 1, h: 1, cost: 40, onPlatform: false, group: 'nature', demolish: 30 },
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(defs.map((d) => [d.key, d]));

/** Auswahl im Baumenü */
export const BUILD_MENU = ['bld_station', 'bld_shelter', 'bld_kiosk', 'bld_vending', 'bld_cafe', 'bld_wc', 'bld_inn', 'bld_souvenir', 'bld_lockers', 'bld_bench', 'bld_clock',
  'bld_parking', 'bld_bus', 'bld_billboard', 'bld_lamp', 'bld_streetlamp', 'bld_flowers', 'bld_fountain', 'bld_statue', 'bld_mural', 'bld_xmas',
  'bld_houseA', 'bld_houseB', 'bld_tree0', 'bld_pine0', 'bld_bush0'];

export const isStation = (key: string) => key === 'bld_station' || key === 'bld_station2' || key === 'bld_station3';

/** Gebäude, die erst erforscht werden müssen */
export const BUILDING_RESEARCH: Record<string, string> = {
  bld_parking: 'road', bld_bus: 'road', bld_lamp: 'light', bld_streetlamp: 'light', bld_flowers: 'green', bld_tree0: 'green', bld_pine0: 'green', bld_bush0: 'green',
  bld_fountain: 'water', bld_statue: 'monument', bld_clock: 'clock', bld_bench: 'bench', bld_shelter: 'bench', bld_mural: 'art', bld_xmas: 'season',
  bld_kiosk: 'kiosk', bld_vending: 'kiosk', bld_cafe: 'cafe', bld_wc: 'wc', bld_inn: 'inn', bld_billboard: 'ads', bld_lockers: 'lockers', bld_souvenir: 'souvenir',
};

/** Läden: Referenzpreis (€) und Kaufquote bei diesem Preis */
export const SHOPS: Record<string, { name: string; ref: number; rate: number }> = {
  bld_kiosk: { name: 'Kiosk', ref: 3, rate: 0.12 },
  bld_cafe: { name: 'Café', ref: 4.5, rate: 0.1 },
  bld_vending: { name: 'Automat', ref: 2, rate: 0.1 },
  bld_wc: { name: 'WC', ref: 0.5, rate: 0.2 },
  bld_inn: { name: 'Gasthaus', ref: 9, rate: 0.05 },
  bld_lockers: { name: 'Schließfächer', ref: 2, rate: 0.04 },
  bld_souvenir: { name: 'Souvenirladen', ref: 7, rate: 0.025 },
};
