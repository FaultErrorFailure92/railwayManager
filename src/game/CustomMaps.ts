/**
 * Eigene Karten mit eigenen Unternehmen (RM-FR-MOD-04, MOD-05; Unternehmen RM-FR-MOD-01 … 03).
 * Eine eigene Karte ist eine Kopie einer mitgelieferten Vorlage: Thema (Boden, Bäume, Häuser, Fahrzeuge, Musik) kommt
 * von der Vorlage, alles andere ist einstellbar. Die Unternehmen gehören zur Karte.
 * Gespeichert im Browser (localStorage), als Datei teilbar, und jeder Spielstand trägt seine Karte mit.
 */
import { MAP_W, MAP_H, MAIN_ROW, PARCEL, ROW0, START_PARCELS } from '../config';
import { OPERATORS, type OperatorId, type OpOverride } from '../sim/Operators';
import { CUSTOM_PREFIX, isCustomMap, MAPS, MINE, NORTH, registerMap, SAWMILL, SOUTH, withMap, type MapDef } from '../world/maps';
import { Grid, GRASS, WATER } from '../world/Grid';
import { lineLayout } from '../world/foreign';
import { clean as cleanCompany, loadCompanies, overridesFor, saveCompanies, type CustomCompany } from './Companies';

export interface CustomMap {
  /** 2 = Koordinaten der doppelt so hohen Welt (RM-FR-MAP-12) */
  v?: number;
  id: string;
  /** Vorlage (Thema, Musik, Bahnunternehmen-Grundliste) */
  base: string;
  name: string;
  paper: string;
  ends: [string, string];
  startMoney: number;
  difficulty: 'leicht' | 'mittel' | 'schwer';
  weather: { rain: number; snow: number };
  terrainSeed: number;
  landscapeSeed: number;
  /** Felsränder der Vorlage behalten */
  rocks: boolean;
  lakes: { x: number; y: number; rx: number; ry: number }[];
  rivers: { x: number; a: number; b: number; w: number }[];
  villages: { x: number; y: number }[];
  forests: number;
  /** öffentliche Straßen (Spalten) */
  roads: number[];
  /** Werke: Spalte des Gebäudes oder null = keins */
  sawmill: number | null;
  mine: number | null;
  /** Fremdbahnen Nord/Süd */
  ln: boolean;
  ls: boolean;
  /** Unternehmen, die nicht mitspielen */
  off: OperatorId[];
  /** Namen der mitgelieferten Unternehmen auf dieser Karte */
  names: Partial<Record<OperatorId, string>>;
  /** eigene Unternehmen der Karte … */
  companies: CustomCompany[];
  /** … und welches auf welchem Platz fährt */
  use: Partial<Record<OperatorId, string>>;
}

const KEY = 'rm_maps';
export const MAP_FORMAT = 'bahnhofsmanager-karte';
const store = () => { try { return globalThis.localStorage; } catch { return undefined; } };
const rid = () => `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// ------------------------------------------------------------ Grenzen
export const LIMITS = { lakes: 12, rivers: 4, villages: 24, roads: 4, forests: 60, lakeR: [2, 14] as const, money: [2000, 50000] as const };
/** Startgelände in Feldern */
export const START_AREA = { x0: START_PARCELS.x0 * PARCEL, x1: (START_PARCELS.x1 + 1) * PARCEL - 1, y0: START_PARCELS.y0 * PARCEL, y1: (START_PARCELS.y1 + 1) * PARCEL - 1 };

/** neue eigene Karte als Kopie einer Vorlage */
export function newMap(baseId: string): CustomMap {
  const b = MAPS.find((m) => m.id === baseId) ?? MAPS[0];
  const ind = (id: string) => b.industries.find((i) => i.id === id)?.x ?? null;
  const fl = (op: OperatorId) => !!b.foreignLines?.some((l) => l.op === op);
  return {
    v: 2, id: rid(), base: b.id, name: `${b.name} (eigene)`, paper: b.paper, ends: [...b.ends], startMoney: b.startMoney, difficulty: b.difficulty,
    weather: { ...b.weather }, terrainSeed: b.terrainSeed, landscapeSeed: b.landscapeSeed, rocks: b.rocks.length > 0,
    lakes: b.lakes.map((l) => ({ ...l })), rivers: b.rivers.map((r) => ({ ...r })), villages: b.villages.map((v) => ({ ...v })), forests: b.forests,
    roads: [...(b.roads ?? [])], sawmill: ind('sawmill'), mine: ind('mine'), ln: fl('ln'), ls: fl('ls'),
    off: [], names: { ...(b.names ?? {}) }, companies: [], use: {},
  };
}

/** Kartendaten fürs Spiel */
export function toMapDef(c: CustomMap): MapDef {
  const b = MAPS.find((m) => m.id === c.base) ?? MAPS[0];
  const bi = (id: string) => b.industries.find((i) => i.id === id);
  const industries = [
    ...(c.sawmill !== null ? [SAWMILL(c.sawmill, 22, 25, c.names.sw ?? bi('sawmill')?.name ?? 'Sägewerk Holzer')] : []),
    ...(c.mine !== null ? [MINE(c.mine, 41, 40, c.names.mn ?? bi('mine')?.name ?? 'Bergwerk Erzleiten')] : []),
  ];
  return {
    ...b, id: c.id, base: b.id, name: c.name, paper: c.paper, ends: [...c.ends], startMoney: c.startMoney, difficulty: c.difficulty,
    info: `Eigene Karte (Vorlage: ${b.name}).`, weather: { ...c.weather }, terrainSeed: c.terrainSeed, landscapeSeed: c.landscapeSeed,
    rocks: c.rocks ? b.rocks : [], lakes: c.lakes.map((l) => ({ ...l })), rivers: c.rivers.map((r) => ({ ...r })), villages: c.villages.map((v) => ({ ...v })),
    forests: c.forests, roads: [...c.roads], industries, foreignLines: [...(c.ln ? [NORTH()] : []), ...(c.ls ? [SOUTH()] : [])],
    names: { ...(b.names ?? {}), ...c.names },
  };
}

/** eigene Unternehmen der Karte als Übersteuerungen fürs freie Spiel */
export const mapOverrides = (c: CustomMap): Partial<Record<OperatorId, OpOverride>> => overridesFor(c.companies, c.use);

// ------------------------------------------------------------ Prüfen und Kürzen (auch für fremde Dateien)
const str = (v: unknown, max: number, def = '') => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '') || def;
const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);
const frac = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, Math.round(v * 100) / 100)) : def);
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const opIds = Object.keys(OPERATORS) as OperatorId[];

export function cleanMap(x: unknown): CustomMap | undefined {
  if (!x || typeof x !== 'object') return;
  const o = x as Record<string, unknown>;
  const b = MAPS.find((m) => m.id === o.base);
  if (!b) return;
  const d = newMap(b.id);
  const ends = Array.isArray(o.ends) ? o.ends : [];
  const names: Partial<Record<OperatorId, string>> = {};
  if (o.names && typeof o.names === 'object') for (const [k, v] of Object.entries(o.names)) if (opIds.includes(k as OperatorId) && str(v, 32)) names[k as OperatorId] = str(v, 32);
  const companies = arr(o.companies, 40).map(cleanCompany).filter((c): c is CustomCompany => !!c);
  const use: Partial<Record<OperatorId, string>> = {};
  if (o.use && typeof o.use === 'object') for (const [k, v] of Object.entries(o.use)) if (companies.some((c) => c.id === v && c.base === k)) use[k as OperatorId] = v as string;
  const pt = (p: unknown) => (p && typeof p === 'object' ? p as Record<string, unknown> : {});
  // frühere Karten (halb so hoch): Dörfer und Seen rücken nach unten
  const dy = o.v === 2 ? 0 : ROW0;
  const id = typeof o.id === 'string' && o.id.startsWith(CUSTOM_PREFIX) && /^[a-z0-9-]{7,40}$/.test(o.id) ? o.id : rid();
  return {
    v: 2, id, base: b.id, name: str(o.name, 32, d.name), paper: str(o.paper, 32, d.paper),
    ends: [str(ends[0], 20, d.ends[0]), str(ends[1], 20, d.ends[1])],
    startMoney: num(o.startMoney, LIMITS.money[0], LIMITS.money[1], d.startMoney),
    difficulty: (['leicht', 'mittel', 'schwer'] as const).includes(o.difficulty as 'leicht') ? o.difficulty as CustomMap['difficulty'] : d.difficulty,
    weather: { rain: frac(pt(o.weather).rain, d.weather.rain), snow: frac(pt(o.weather).snow, d.weather.snow) },
    terrainSeed: num(o.terrainSeed, 1, 9_999_999, d.terrainSeed), landscapeSeed: num(o.landscapeSeed, 1, 9_999_999, d.landscapeSeed),
    rocks: typeof o.rocks === 'boolean' ? o.rocks : d.rocks,
    lakes: arr(o.lakes, LIMITS.lakes).map(pt).map((l) => ({ x: num(l.x, 0, MAP_W - 1, 0), y: num(num(l.y, -99, 999, 0) + dy, 0, MAP_H - 1, 0), rx: num(l.rx, LIMITS.lakeR[0], LIMITS.lakeR[1], 5), ry: num(l.ry, LIMITS.lakeR[0], LIMITS.lakeR[1], 3) })),
    rivers: arr(o.rivers, LIMITS.rivers).map(pt).map((r) => ({ x: num(r.x, 0, MAP_W - 1, 0), a: num(r.a, 0, 12, 4), b: num(r.b, 0, 8, 3), w: Math.max(1, Math.min(2, typeof r.w === 'number' && Number.isFinite(r.w) ? r.w : 1.2)) })),
    villages: arr(o.villages, LIMITS.villages).map(pt).map((v) => ({ x: num(v.x, 0, MAP_W - 1, 0), y: num(num(v.y, -99, 999, 0) + dy, 0, MAP_H - 1, 0) })),
    forests: num(o.forests, 0, LIMITS.forests, d.forests),
    roads: [...new Set(arr(o.roads, LIMITS.roads).map((r) => num(r, 2, MAP_W - 3, 0)).filter((r) => r > 0))],
    sawmill: o.sawmill === null ? null : num(o.sawmill, 8, MAP_W - 10, d.sawmill ?? 150),
    mine: o.mine === null ? null : num(o.mine, 8, MAP_W - 10, d.mine ?? 196),
    ln: typeof o.ln === 'boolean' ? o.ln : d.ln, ls: typeof o.ls === 'boolean' ? o.ls : d.ls,
    off: arr(o.off, 30).filter((k): k is OperatorId => opIds.includes(k as OperatorId)),
    names, companies, use,
  };
}

/** eigene Karte fürs Spiel anmelden (neues Spiel oder Spielstand) */
const active = new Map<string, CustomMap>();
export function useCustomMap(c: CustomMap) { active.set(c.id, c); registerMap(toMapDef(c)); }
/** die eigene Karte zu einer Kennung, wie sie im Spiel ist (für den Spielstand) */
export const activeCustom = (id: string) => (isCustomMap(id) ? active.get(id) : undefined);

/** Karte vor dem Spielstart bereitstellen: aus dem Spielstand oder aus der Bibliothek */
export function prepareMap(mapId: string | undefined, fromSave?: unknown) {
  if (!isCustomMap(mapId)) return;
  const c = (fromSave ? cleanMap(fromSave) : undefined) ?? findMap(mapId!);
  if (c) useCustomMap({ ...c, id: mapId! });
}

// ------------------------------------------------------------ Bibliothek
export function loadMaps(): CustomMap[] {
  try {
    const raw = JSON.parse(store()?.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.map(cleanMap).filter((m): m is CustomMap => !!m) : [];
  } catch { return []; }
}
export function saveMaps(list: CustomMap[]) {
  try { store()?.setItem(KEY, JSON.stringify(list)); } catch { /* voll oder gesperrt */ }
}
export const findMap = (id: string) => loadMaps().find((m) => m.id === id);

/**
 * Umstieg: Unternehmen aus dem früheren Unternehmens-Editor wandern in eine eigene Karte (Donautal),
 * damit nichts verloren geht. Läuft einmal, danach ist die alte Liste leer.
 */
export function migrateCompanies(): CustomMap | undefined {
  const old = loadCompanies();
  if (!old.length) return;
  const m = newMap('donau');
  m.name = 'Donautal (meine Unternehmen)';
  m.companies = old;
  for (const c of old) if (!m.use[c.base]) m.use[c.base] = c.id;
  saveMaps([...loadMaps(), m]);
  saveCompanies([]);
  return m;
}

/** Datei zum Weitergeben: Karte samt Unternehmen */
export function exportMap(m: CustomMap) {
  return JSON.stringify({ format: MAP_FORMAT, version: 1, map: m }, null, 2);
}

/** Datei einlesen: gleiche Kennung ersetzt, sonst neu */
export function importMap(text: string, into: CustomMap[]): { list: CustomMap[]; map?: CustomMap; error?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { list: into, error: 'Das ist keine gültige Datei.' }; }
  const d = data as { format?: string; map?: unknown };
  if (d?.format !== MAP_FORMAT) return { list: into, error: 'In der Datei steht keine Karte.' };
  const m = cleanMap(d.map);
  if (!m) return { list: into, error: 'Die Karte in der Datei ist ungültig.' };
  const list = [...into];
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) list[i] = m; else list.push(m);
  return { list: list.slice(0, 40), map: m };
}

// ------------------------------------------------------------ Vorschau und Prüfung
/** Gelände der Karte erzeugen (ohne Spiel) */
export function previewGrid(c: CustomMap): Grid {
  return withMap(toMapDef(c), () => new Grid(true));
}

export interface MapCheck { level: 'ok' | 'warn' | 'error'; text: string }

/** Ampel: was fehlt oder nicht geht */
export function checkMap(c: CustomMap, grid = previewGrid(c)): MapCheck[] {
  const out: MapCheck[] = [];
  const def = toMapDef(c);
  if (!c.name.trim()) out.push({ level: 'error', text: 'Die Karte braucht einen Namen.' });
  // Startgelände: überwiegend bebaubar
  let bad = 0, all = 0;
  for (let y = START_AREA.y0; y <= START_AREA.y1; y++) for (let x = START_AREA.x0; x <= START_AREA.x1; x++) {
    all++;
    if (grid.terrain[grid.key(x, y)] !== GRASS) bad++;
  }
  if (bad / all > 0.15) out.push({ level: 'error', text: `Das Startgelände ist zu ${Math.round((bad / all) * 100)} % Wasser oder Fels – Seen und Flüsse weiter weg.` });
  // Strecke über Wasser: geht (Brücke), aber Hinweis
  const wet = Array.from({ length: grid.w }, (_, x) => grid.terrain[grid.key(x, MAIN_ROW)] === WATER).filter(Boolean).length;
  if (wet > 12) out.push({ level: 'warn', text: `Die Strecke führt ${wet} Felder über Wasser.` });
  // Fremdbahnen ganz verlegt, Bögen nicht im Wasser
  for (const l of def.foreignLines ?? []) {
    const name = def.names?.[l.op] ?? OPERATORS[l.op].name;
    if (!grid.foreignLaid.some((x) => x.op === l.op)) { out.push({ level: 'error', text: `${name} lässt sich nicht verlegen.` }); continue; }
    const { pieces } = lineLayout(l, grid.w);
    if (pieces.some((p) => grid.footprint(p.key, p.x, p.y).some((q) => grid.terrain[grid.key(q.x, q.y)] === WATER))) out.push({ level: 'warn', text: `${name}: Ein Bogen liegt im Wasser (sieht aus wie eine Brücke).` });
    if (pieces.some((p) => grid.footprint(p.key, p.x, p.y).some((q) => c.roads.includes(q.x)))) out.push({ level: 'error', text: `${name}: Eine Straße kreuzt einen Bogen – Straße verschieben.` });
  }
  // Werke: nicht auf dem Startgelände, nicht auf Straßen
  for (const ind of def.industries) {
    if (ind.x1 >= START_AREA.x0 - 1 && ind.x0 <= START_AREA.x1 + 1 && ind.y + 1 >= START_AREA.y0 && ind.y <= START_AREA.y1) out.push({ level: 'error', text: `${ind.name} liegt auf dem Startgelände.` });
    if (c.roads.some((r) => r >= ind.x0 && r <= ind.x1)) out.push({ level: 'error', text: `${ind.name}: Eine Straße führt durchs Werk.` });
  }
  if (c.roads.some((r) => r >= START_AREA.x0 && r <= START_AREA.x1)) out.push({ level: 'warn', text: 'Eine Straße führt quer durchs Startgelände.' });
  // Unternehmen: je Ausschreibung mindestens eines
  const off = new Set(c.off);
  if (!def.tenderRegio.some((o) => !off.has(o))) out.push({ level: 'error', text: 'Im Regionalverkehr spielt kein Unternehmen mit.' });
  if (!def.tenderFreight.some((o) => !off.has(o))) out.push({ level: 'error', text: 'Im Güterverkehr spielt kein Unternehmen mit.' });
  if (!out.length) out.push({ level: 'ok', text: 'Alles bereit – im freien Spiel wählbar.' });
  return out;
}

export const playable = (c: CustomMap) => !checkMap(c).some((x) => x.level === 'error');
