/**
 * Baumenü (untere Leiste): Gruppe (1–9) → Typ → Variante → Drehung.
 * R dreht (Ausrichtung), T schaltet die Varianten eines Typs durch.
 */
import { Game } from '../game/Game';
import type { ToolId } from '../game/Missions';
import { FACILITY_RESEARCH, type ResearchId } from '../game/Research';
import { VARIANTS, type UiState } from '../render/GameScene';
import { BUILDING_RESEARCH } from '../world/buildings';
import { COST } from '../config';

/** eine Variante: ein Werkzeug mit seinen Ausrichtungen (keys); ohne keys = Werkzeug ohne Varianten */
export interface BVariant { tool: ToolId; keys: string[]; label: string; icon: string; cost?: number; info?: string }
/** ein Typ: z. B. „Weiche“ mit den Varianten Abzweig, Gleiswechsel … */
export interface BType { id: string; label: string; icon: string; info?: string; variants: BVariant[] }
export interface BGroup { id: string; label: string; key: string; alt?: string; icon: string; help: string; types: BType[] }

const V = (tool: ToolId, key: string) => VARIANTS[tool]!.find((v) => v.key === key)!;
/** Variante aus einer Reihe von Ausrichtungen derselben Sache */
const rot = (tool: ToolId, keys: string[], label: string, info?: string): BVariant => {
  const v = V(tool, keys[0]);
  return { tool, keys, label, icon: v.icon, cost: v.cost, info: info ?? v.info };
};
const one = (tool: ToolId, key: string): BVariant => { const v = V(tool, key); return { tool, keys: [key], label: v.label, icon: v.icon, cost: v.cost, info: v.info }; };
const plain = (tool: ToolId, label: string, icon: string, cost?: number, info?: string): BVariant => ({ tool, keys: [], label, icon, cost, info });
const single = (id: string, v: BVariant): BType => ({ id, label: v.label, icon: v.icon, info: v.info, variants: [v] });
const type = (id: string, label: string, variants: BVariant[], info?: string): BType => ({ id, label, icon: variants[0].icon, info, variants });

const bld = (keys: string[]) => keys.filter((k) => VARIANTS.building!.some((v) => v.key === k)).map((k) => one('building', k));
const sortMarks = () => VARIANTS.facility!.filter((v) => v.key.startsWith('mark_sort')).map((v) => one('facility', v.key));

export const BUILD_MENU_TREE: BGroup[] = [
  { id: 'select', label: 'Ansehen', key: '1', icon: 'tool_cursor', help: 'Ziehen = Karte verschieben · Mausrad = Zoom · Zug anfahren = Infos',
    types: [single('select', plain('select', 'Ansehen', 'tool_cursor'))] },
  { id: 'land', label: 'Land kaufen', key: '2', icon: 'tool_flag', help: 'Gelbe Parzelle anklicken',
    types: [single('land', plain('land', 'Land kaufen', 'tool_flag', undefined, 'Gelbe Parzelle anklicken'))] },
  { id: 'platform', label: 'Bahnsteig & Zugänge', key: '3', icon: 'platform', help: 'Bahnsteige neben dem Gleis ziehen · Zugänge von Bahnsteig zu Bahnsteig',
    types: [
      single('platform', plain('platform', 'Bahnsteig', 'platform', COST.platform, 'Neben dem Gleis ziehen')),
      type('access', 'Zugang', [one('access', 'tunnel'), one('access', 'bridge')], 'von Bahnsteig zu Bahnsteig ziehen'),
    ] },
  { id: 'tracks', label: 'Gleisbau', key: '4', icon: 'track', help: 'Gleise ziehen (schräg = Diagonale), Kurven und Weichen klicken',
    types: [
      single('track', plain('track', 'Gleis', 'track', COST.track, 'Ziehen: waagrecht = gerade, schräg = Diagonale')),
      type('curve', 'Kurve', [rot('curve', ['curve_divDown', 'curve_divUp', 'curve_mergeAbove', 'curve_mergeBelow'], 'Kurve')]),
      type('switch', 'Weiche', [
        rot('switch', ['branch_divDown', 'branch_divUp', 'branch_mergeAbove', 'branch_mergeBelow'], 'Abzweig'),
        rot('switch', ['xover_down', 'xover_up'], 'Gleiswechsel', 'ab zweigleisigem Ausbau'),
        rot('switch', ['xover_down_fast', 'xover_up_fast'], 'Schnellfahr-Gleiswechsel', 'Forschung'),
        rot('switch', ['dsw_desc_out', 'dsw_desc_in', 'dsw_asc_out', 'dsw_asc_in'], 'Schräge Weiche', 'Forschung'),
      ]),
    ] },
  { id: 'ops', label: 'Bahnbetrieb', key: '5', icon: 'signal_E', help: 'Signale, Oberleitung, Rangierbereiche und Gleismarkierungen',
    types: [
      type('signal', 'Signal', [rot('signal', ['E', 'W'], 'Hauptsignal', 'auf Gleis klicken'), rot('signal', ['SE', 'SW'], 'Rangiersignal', 'nur im Rangierbereich')]),
      single('wire', plain('wire', 'Oberleitung', 'tool_wire', COST.wire, 'Über Gleise ziehen · ohne Oberleitung halten nur Dieselzüge')),
      type('mark', 'Gleismarkierung', [one('facility', 'mark_shunt'), one('facility', 'mark_siding'), ...sortMarks()]),
    ] },
  { id: 'facility', label: 'Unterstützungsanlagen', key: '6', icon: 'bld_remise', help: 'Remise, Werkstatt, Waschanlage und Abrollberg auf Gleise setzen',
    types: ['bld_remise', 'bld_workshop', 'bld_wash', 'bld_hump'].map((k) => single(k, one('facility', k))) },
  { id: 'road', label: 'Straße', key: '7', icon: 'tool_road', help: 'Straßen ziehen · verbindet Empfangsgebäude mit Parkplatz und Busterminal',
    types: [single('road', plain('road', 'Straße', 'tool_road', COST.road, 'Ziehen'))] },
  { id: 'building', label: 'Gebäude', key: '8', alt: 'B', icon: 'bld_station', help: 'Klicken zum Bauen · R = drehen · T = nächstes Gebäude dieser Art',
    types: [
      type('b_station', 'Bahnhof', bld(['bld_station', 'bld_shelter', 'bld_bench', 'bld_clock', 'bld_lockers'])),
      type('b_shop', 'Läden', bld(['bld_kiosk', 'bld_vending', 'bld_cafe', 'bld_wc', 'bld_inn', 'bld_souvenir'])),
      type('b_traffic', 'Verkehr & Licht', bld(['bld_parking', 'bld_bus', 'bld_billboard', 'bld_lamp', 'bld_streetlamp'])),
      type('b_deco', 'Deko', bld(['bld_flowers', 'bld_fountain', 'bld_statue', 'bld_mural', 'bld_xmas', 'bld_houseA', 'bld_houseB', 'bld_tree0', 'bld_pine0', 'bld_bush0'])),
    ].filter((t) => t.variants.length) },
  { id: 'remove', label: 'Abriss', key: '9', alt: 'X', icon: 'tool_shovel', help: 'Klicken oder Fläche aufziehen · je Feld das oberste Teil',
    types: [single('remove', plain('remove', 'Abriss', 'tool_shovel', undefined, 'Klicken oder Fläche aufziehen'))] },
];

// ------------------------------------------------------------ Zustand
/** Forschung, die eine Variante braucht */
export function needOf(v: BVariant): ResearchId | undefined {
  const k = v.keys[0] ?? '';
  if (v.tool === 'facility') return FACILITY_RESEARCH[k] as ResearchId | undefined;
  if (v.tool === 'switch') return k.endsWith('_fast') ? 'fastSwitch' : k.startsWith('dsw') ? 'diagSwitch' : k.startsWith('xover') ? 'double' : undefined;
  if (v.tool === 'signal' && k.startsWith('S')) return 'shunt';
  if (v.tool === 'building') return BUILDING_RESEARCH[k] as ResearchId | undefined;
  return undefined;
}

export const variantLocked = (g: Game, v: BVariant) => { const need = needOf(v); return !g.unlocked.has(v.tool) || (!!need && !g.researched(need)); };
export const typeLocked = (g: Game, t: BType) => t.variants.every((v) => variantLocked(g, v));

/** aktuell gewählte Ausrichtung (Schlüssel in VARIANTS) */
export const curKey = (ui: UiState) => { const vs = VARIANTS[ui.tool]; return vs ? vs[(ui.variant[ui.tool] ?? 0) % vs.length].key : ''; };

export const variantOn = (ui: UiState, v: BVariant) => ui.tool === v.tool && (v.keys.length === 0 || v.keys.includes(curKey(ui)));

/** wo im Baum steht das aktuelle Werkzeug? */
export function locate(ui: UiState, prefer?: string) {
  const groups = prefer ? [...BUILD_MENU_TREE].sort((a, b) => +(b.id === prefer) - +(a.id === prefer)) : BUILD_MENU_TREE;
  for (const grp of groups) for (const t of grp.types) for (const v of t.variants) if (variantOn(ui, v)) return { grp, type: t, variant: v };
  return null;
}

/** Variante wählen (behält die Ausrichtung, wenn möglich) */
export function pickVariant(ui: UiState, v: BVariant, rotIdx = 0) {
  ui.tool = v.tool;
  if (!v.keys.length) return;
  const key = v.keys[Math.min(rotIdx, v.keys.length - 1)];
  const idx = VARIANTS[v.tool]!.findIndex((x) => x.key === key);
  if (idx >= 0) ui.variant[v.tool] = idx;
}

/** Ausrichtung der aktuellen Variante (Index, Anzahl) */
export function rotation(ui: UiState, g: Game) {
  const at = locate(ui);
  if (!at) return { i: 0, n: 1 };
  if (at.variant.tool === 'building') return Game.canRotate(curKey(ui)) ? { i: g.buildRot ? 1 : 0, n: 2 } : { i: 0, n: 1 };
  return { i: Math.max(0, at.variant.keys.indexOf(curKey(ui))), n: Math.max(1, at.variant.keys.length) };
}

/** R: drehen */
export function rotate(ui: UiState, g: Game) {
  const at = locate(ui);
  if (!at) return false;
  if (at.variant.tool === 'building') {
    if (!Game.canRotate(curKey(ui))) return false;
    g.buildRot = !g.buildRot;
    return true;
  }
  const ks = at.variant.keys;
  if (ks.length < 2) return false;
  pickVariant(ui, at.variant, (ks.indexOf(curKey(ui)) + 1) % ks.length);
  return true;
}

/** T: nächste (freigeschaltete) Variante desselben Typs */
export function nextVariant(ui: UiState, g: Game) {
  const at = locate(ui);
  if (!at || at.type.variants.length < 2) return false;
  const vs = at.type.variants;
  const r = Math.max(0, at.variant.keys.indexOf(curKey(ui)));
  for (let s = 1; s <= vs.length; s++) {
    const v = vs[(vs.indexOf(at.variant) + s) % vs.length];
    if (!variantLocked(g, v)) { pickVariant(ui, v, r); return true; }
  }
  return false;
}
