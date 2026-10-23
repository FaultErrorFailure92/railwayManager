import type { Game } from './Game';
import type { ToolId } from './Missions';

export type ResearchId = 'access' | 'wire' | 'siding' | 'double' | 'wash' | 'remise' | 'stations' | 'fastSwitch' | 'workshop' | 'hump' | 'shunt' | 'switchHeat' | 'crew' | 'crew2'
  | 'crossing' | 'railBridge' | 'road' | 'station2' | 'station3' | 'deco' | 'dwell' | 'estw'
  | 'bench' | 'light' | 'green' | 'clock' | 'water' | 'monument' | 'art' | 'season' | 'cat'
  | 'kiosk' | 'cafe' | 'wc' | 'inn' | 'ads' | 'lockers' | 'souvenir' | 'haggle' | 'specials';

/** drei Forschungsbäume */
export type ResearchTree = 'ops' | 'deco' | 'biz';
export const TREES: { id: ResearchTree; name: string; sub: string; icon: string }[] = [
  { id: 'ops', name: 'Stellwerk', sub: 'Gleise, Signale, Technik', icon: 'signal_E' },
  { id: 'deco', name: 'Verschönerungsverein', sub: 'Bahnhof und Deko', icon: 'bld_flowers' },
  { id: 'biz', name: 'Kaufmännische Abteilung', sub: 'Geld verdienen', icon: 'bld_kiosk' },
];

export interface ResearchDef {
  id: ResearchId;
  tree: ResearchTree;
  /** Name mit Augenzwinkern */
  name: string;
  /** was es freischaltet (kurz) */
  unlocks: string;
  /** kurze Beschreibung, was es bringt */
  info: string;
  icon: string;
  /** Spalte im Baum (Stufe) und Zeile */
  col: number;
  row: number;
  cost: number;
  /** Forschungspunkte */
  fp: number;
  /** Dauer in Spielstunden */
  hours: number;
  requires: ResearchId[];
  /** Werkzeuge, die danach freigeschaltet sind */
  tools?: ToolId[];
  /** einmalige Wirkung beim Abschluss */
  apply?: (g: Game) => void;
  /** nur noch für alte Spielstände, nicht im Baum */
  hidden?: boolean;
}

const R = (tree: ResearchTree, id: ResearchId, name: string, unlocks: string, info: string, icon: string, col: number, row: number,
  cost: number, fp: number, hours: number, requires: ResearchId[] = [], extra: Partial<ResearchDef> = {}): ResearchDef =>
  ({ tree, id, name, unlocks, info, icon, col, row, cost, fp, hours, requires, ...extra });

export const RESEARCH: ResearchDef[] = [
  // ------------------------------------------------ Stellwerk
  R('ops', 'access', 'Treppen für Fortgeschrittene', 'Unterführung, Fußgängerbrücke', 'Fahrgäste kommen sicher zu weiteren Bahnsteigen', 'access_tunnel', 0, 0, 1500, 3, 2, [], { tools: ['access'] }),
  R('ops', 'wire', 'Strom von oben', 'Oberleitung', 'Die Strecke wird elektrifiziert, eigene Gleise auch – dann fahren E-Züge', 'tool_wire', 0, 1, 2500, 4, 3, [], { tools: ['wire'], apply: (g) => g.grid.electrifyLine() }),
  R('ops', 'siding', 'Parkverbot aufgehoben', 'Abstellgleise', 'Gleise als Abstellgleis markieren: Wendezüge machen dort Pause', 'mark_siding', 0, 2, 1500, 3, 2, [], { tools: ['facility'] }),
  R('ops', 'crossing', 'Kreuzworträtsel', 'Gleiskreuzungen', 'Diagonale Gleise dürfen gerade Gleise kreuzen', 'piece_cross_desc0', 0, 3, 2000, 4, 2),
  R('ops', 'double', 'Doppelt hält besser', '2. Streckengleis, Gleiswechsel', 'Der Netzbetreiber baut das 2. Streckengleis – Linksverkehr und Gleiswechsel-Weichen', 'track', 1, 0, 5000, 8, 6, ['access'], { apply: (g) => g.expandLine() }),
  R('ops', 'dwell', 'Pfiff-Akademie', 'kürzere Haltezeiten', 'Zugbegleiter lernen den perfekten Abfahrtspfiff: Züge stehen 15 % kürzer am Bahnsteig', 'ri_whistle', 1, 1, 3000, 5, 3, ['wire']),
  R('ops', 'shunt', 'Schneckentempo mit System', 'Rangierbereiche, Rangiersignale', 'Gleise als Rangierbereich markieren: nur Schrittgeschwindigkeit, günstige Rangiersignale teilen den Bereich', 'mark_shunt', 1, 2, 2500, 4, 3, ['siding']),
  R('ops', 'switchHeat', 'Föhn für Weichen', 'Weichenheizung', 'Bei Schnee frieren die Weichen nicht ein: Züge fahren fast normal schnell', 'piece_branch_divUp', 1, 3, 3500, 5, 3, ['crossing']),
  R('ops', 'fastSwitch', 'Kurvenstar', 'Schnellfahrweichen', 'Lange Gleiswechsel (6 Felder), abzweigend mit voller Fahrt – nötig für Hochgeschwindigkeitszüge', 'piece_branch_divDown', 2, 0, 6000, 8, 6, ['double']),
  R('ops', 'hump', 'Schwerkraft macht\'s', 'Abrollberg, Richtungsgleise', 'Rangierbahnhof: Güterwagen rollen vom Berg in ihre Richtungsgleise', 'bld_hump', 2, 1, 8000, 10, 8, ['double']),
  R('ops', 'railBridge', 'Über sieben Brücken', 'Eisenbahnbrücken', 'Gleise über Flüsse und Seen bauen', 'rail_bridge_icon', 2, 2, 5000, 7, 5, ['double']),
  R('ops', 'crew', 'Die Schrauber-Brigade', 'Instandhalter einstellen', 'Eigene Instandhalter (unter „Verträge“): rücken bei Störungen selbst aus und reparieren schneller', 'tool_shovel', 2, 3, 4000, 6, 4, ['switchHeat']),
  R('ops', 'estw', 'Elektronisches Stellwerk', 'Störungen halb so lang', 'Computer statt Hebel: Störungen sind doppelt so schnell behoben, auch ohne Trupp', 'ri_estw', 3, 0, 7000, 9, 6, ['fastSwitch']),
  R('ops', 'crew2', 'Vorsorgeuntersuchung', 'Vorbeugende Wartung', 'Regelmäßige Inspektionen: Weichen und Signale fallen nur noch halb so oft aus', 'piece_xover_down', 3, 3, 5000, 7, 5, ['crew']),
  // ------------------------------------------------ Verschönerungsverein
  R('deco', 'bench', 'Sitzfleisch', 'Sitzbank, Wartehalle', 'Wartende werden geduldiger', 'bld_bench', 0, 0, 400, 1, 1),
  R('deco', 'light', 'Es werde Licht', 'Laternen', 'Bahnsteig- und Straßenlaternen leuchten in der Nacht', 'bld_lamp', 0, 1, 800, 2, 1),
  R('deco', 'green', 'Grüner Daumen', 'Blumenbeete, Bäume, Büsche', 'Ein bisschen Natur macht Wartende froher', 'bld_flowers', 0, 2, 800, 2, 1),
  R('deco', 'clock', 'Pünktlich wie die Uhr', 'Bahnhofsuhr', 'Wer die Zeit sieht, wartet geduldiger', 'bld_clock', 1, 0, 1200, 2, 2, ['bench']),
  R('deco', 'stations', 'Mehr Bahnhof wagen', 'bis zu 4 Empfangsgebäude', 'Weitere Empfangsgebäude mit eigenem Namen', 'bld_station', 1, 1, 4000, 6, 4, ['bench']),
  R('deco', 'water', 'Wasserspiele', 'Brunnen', 'Plätschern beruhigt: Wartende sind froher', 'bld_fountain', 1, 2, 1500, 3, 2, ['green']),
  R('deco', 'art', 'Kunst am Bau', 'Wandbild, weniger Vandalismus', 'Ein buntes Wandbild – Sprayer haben Respekt: halb so viel Vandalismus', 'bld_mural', 2, 0, 2500, 4, 3, ['clock']),
  R('deco', 'station2', 'Größenwahn I', 'großes Empfangsgebäude', 'Empfangsgebäude vergrößern: +25 % statt +15 % Einnahmen', 'bld_station2', 2, 1, 5000, 7, 5, ['stations']),
  R('deco', 'monument', 'Denkmalschutz', 'Denkmal', 'Ein Denkmal für den ersten Lokführer der Gegend', 'bld_statue', 2, 2, 2000, 3, 2, ['water']),
  R('deco', 'cat', 'Bahnhofskatze', 'Maskottchen', 'Eine Katze zieht am Bahnhof ein: alle sind besser gelaunt', 'bld_cat', 3, 0, 1500, 4, 2, ['art']),
  R('deco', 'station3', 'Größenwahn II', 'Empfangsgebäude mit Uhrturm', 'Der ganz große Auftritt: +40 % Einnahmen', 'bld_station3', 3, 1, 9000, 10, 8, ['station2']),
  R('deco', 'season', 'Saisonzauber', 'Christbaum, Festschmuck', 'Festliche Deko: Wartende sind deutlich froher', 'bld_xmas', 3, 2, 3000, 5, 3, ['monument']),
  // ------------------------------------------------ Kaufmännische Abteilung
  R('biz', 'kiosk', 'Kleine Brötchen', 'Kiosk, Automat', 'Die ersten Einnahmen nebenbei: Zeitungen, Snacks, Getränke', 'bld_kiosk', 0, 0, 400, 1, 1),
  R('biz', 'road', 'Parken & Reisen', 'Straßen, Parkplatz, Busterminal', 'Straßenanbindung: mehr Fahrgäste', 'bld_bus', 0, 1, 4000, 6, 4, [], { tools: ['road'] }),
  R('biz', 'remise', 'Schöner Wohnen für Züge', 'Remise', 'Überdachter Abstellplatz mit Innenreinigung', 'bld_remise', 0, 2, 3000, 5, 3, ['siding']),
  R('biz', 'cafe', 'Kaffeeklatsch', 'Café', 'Kaffee und Kuchen für Wartende', 'bld_cafe', 1, 0, 1500, 2, 2, ['kiosk']),
  R('biz', 'ads', 'Werbeflächen', 'Plakatwand', 'Jede Plakatwand bringt Geld für jeden Fahrgast', 'bld_billboard', 1, 1, 2500, 4, 2, ['road']),
  R('biz', 'workshop', 'Doktor Lok', 'Werkstatt', 'Verschlissene Züge reparieren', 'bld_workshop', 1, 2, 6000, 8, 5, ['remise']),
  R('biz', 'wash', 'Waschstraße', 'Waschanlage', 'Züge fahren durch und werden sauber – wird im Rangierbereich gebaut', 'bld_wash', 1, 3, 3000, 5, 3, ['remise', 'shunt']),
  R('biz', 'wc', 'Menschliches Bedürfnis', 'WC-Anlage', 'Benutzungsgebühr – und Wartende sind geduldiger', 'bld_wc', 2, 0, 2000, 3, 2, ['cafe']),
  R('biz', 'lockers', 'Schließfach-Imperium', 'Schließfächer', 'Gepäckaufbewahrung am Bahnsteig gegen Gebühr', 'bld_lockers', 2, 1, 2500, 4, 2, ['ads']),
  R('biz', 'haggle', 'Verhandlungsgeschick', 'höhere Preise', 'Ein Seminar „Feilschen für Fortgeschrittene“: Unternehmen akzeptieren 10 % höhere Preise', 'ri_haggle', 2, 2, 5000, 7, 4, ['ads']),
  R('biz', 'inn', 'Wirtshauskultur', 'Gasthaus', 'Wirtshaus am Bahnhof – gutes Essen, gutes Geld', 'bld_inn', 3, 0, 5000, 7, 4, ['wc']),
  R('biz', 'souvenir', 'Andenken-Wahnsinn', 'Souvenirladen', 'Kitsch verkauft sich – bei Volksfesten dreimal so gut', 'bld_souvenir', 3, 1, 4000, 6, 3, ['lockers']),
  R('biz', 'specials', 'Sonderzug-Agentur', 'mehr Sonderzüge', 'Öfter Anfragen für Sonderzüge, und die Prämien sind 50 % höher', 'ri_specials', 3, 2, 4000, 6, 3, ['haggle']),
  // alt
  R('deco', 'deco', 'Mehr Deko', '', 'alter Spielstand', 'bld_fountain', 0, 0, 0, 0, 0, [], { hidden: true }),
];

/** Forschungen im Baum (ohne ausgeblendete) */
export const treeOf = (t: ResearchTree) => RESEARCH.filter((r) => r.tree === t && !r.hidden);

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r])) as Record<ResearchId, ResearchDef>;

/** Welche Forschung braucht ein Anlagen-Bauteil? */
export const FACILITY_RESEARCH: Record<string, ResearchId> = {
  mark_siding: 'siding', mark_shunt: 'shunt', bld_wash: 'wash', bld_remise: 'remise', bld_workshop: 'workshop',
  bld_hump: 'hump', mark_sort0: 'hump', mark_sort1: 'hump', mark_sort2: 'hump',
};

export interface ResearchState {
  done: ResearchId[];
  /** alt: eine laufende Forschung */
  current?: { id: ResearchId; left: number } | null;
  /** je Baum eine laufende Forschung */
  running?: Partial<Record<ResearchTree, { id: ResearchId; left: number }>>;
  points: number;
}
