import type { Game } from './Game';
import type { ToolId } from './Missions';

export type ResearchId = 'access' | 'wire' | 'siding' | 'double' | 'wash' | 'remise' | 'stations' | 'fastSwitch' | 'workshop' | 'hump'
  | 'crossing' | 'railBridge';

export interface ResearchDef {
  id: ResearchId;
  name: string;
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
}

export const RESEARCH: ResearchDef[] = [
  { id: 'access', name: 'Bahnsteigzugänge', info: 'Unterführungen und Fußgängerbrücken zu weiteren Bahnsteigen', icon: 'access_tunnel',
    col: 0, row: 0, cost: 1500, fp: 3, hours: 2, requires: [], tools: ['access'] },
  { id: 'wire', name: 'Oberleitung', info: 'Eigene Gleise elektrifizieren – dann halten auch E-Züge dort', icon: 'tool_wire',
    col: 0, row: 1, cost: 2500, fp: 4, hours: 3, requires: [], tools: ['wire'] },
  { id: 'siding', name: 'Abstellgleise', info: 'Gleise als Abstellgleis markieren: Wendezüge machen dort Pause', icon: 'mark_siding',
    col: 0, row: 2, cost: 1500, fp: 3, hours: 2, requires: [], tools: ['facility'] },
  { id: 'double', name: 'Zweigleisiger Ausbau', info: 'Der Netzbetreiber baut das 2. Streckengleis – Linksverkehr', icon: 'track',
    col: 1, row: 0, cost: 5000, fp: 8, hours: 6, requires: ['access'], apply: (g) => g.expandLine() },
  { id: 'stations', name: 'Weitere Bahnhöfe', info: 'Bis zu 4 Empfangsgebäude mit eigenem Namen', icon: 'bld_station',
    col: 1, row: 1, cost: 4000, fp: 6, hours: 4, requires: ['access'] },
  { id: 'wash', name: 'Waschanlage', info: 'Züge fahren durch und werden sauber', icon: 'bld_wash',
    col: 1, row: 2, cost: 3000, fp: 5, hours: 3, requires: ['siding'] },
  { id: 'remise', name: 'Remise', info: 'Überdachter Abstellplatz mit Innenreinigung', icon: 'bld_remise',
    col: 1, row: 3, cost: 3000, fp: 5, hours: 3, requires: ['siding'] },
  { id: 'fastSwitch', name: 'Schnellfahrweichen', info: 'Abzweigende Weichenstränge mit 80 statt 40 km/h befahren', icon: 'piece_branch_divDown',
    col: 2, row: 0, cost: 6000, fp: 8, hours: 6, requires: ['double'] },
  { id: 'hump', name: 'Rangierbahnhof', info: 'Abrollberg und Richtungsgleise – Güterwagen sortieren', icon: 'bld_hump',
    col: 2, row: 1, cost: 8000, fp: 10, hours: 8, requires: ['double'] },
  { id: 'crossing', name: 'Gleiskreuzungen', info: 'Diagonale Gleise dürfen gerade Gleise kreuzen', icon: 'piece_cross_desc0',
    col: 0, row: 3, cost: 2000, fp: 4, hours: 2, requires: [] },
  { id: 'railBridge', name: 'Eisenbahnbrücken', info: 'Gleise über Flüsse und Seen bauen', icon: 'rail_bridge_icon',
    col: 2, row: 2, cost: 5000, fp: 7, hours: 5, requires: ['double'] },
  { id: 'workshop', name: 'Werkstatt', info: 'Verschlissene Züge reparieren', icon: 'bld_workshop',
    col: 2, row: 3, cost: 6000, fp: 8, hours: 5, requires: ['remise'] },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r])) as Record<ResearchId, ResearchDef>;

/** Welche Forschung braucht ein Anlagen-Bauteil? */
export const FACILITY_RESEARCH: Record<string, ResearchId> = {
  mark_siding: 'siding', bld_wash: 'wash', bld_remise: 'remise', bld_workshop: 'workshop',
  bld_hump: 'hump', mark_sort0: 'hump', mark_sort1: 'hump', mark_sort2: 'hump',
};

export interface ResearchState {
  done: ResearchId[];
  current: { id: ResearchId; left: number } | null;
  points: number;
}
