export type BuildingGroup = 'func' | 'deco' | 'nature' | 'facility';

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
  { key: 'bld_bush0', label: 'Busch', effect: 'Deko', w: 1, h: 1, cost: 20, onPlatform: false, group: 'nature', demolish: 10 },
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(defs.map((d) => [d.key, d]));

/** Auswahl im Baumenü */
export const BUILD_MENU = ['bld_station', 'bld_shelter', 'bld_kiosk', 'bld_bench', 'bld_houseA', 'bld_houseB', 'bld_tree0', 'bld_pine0', 'bld_bush0'];
