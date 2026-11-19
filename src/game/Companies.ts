/**
 * Eigene Bahnunternehmen (RM-FR-MOD-01 … MOD-03).
 * Ein eigenes Unternehmen nimmt den Platz eines mitgelieferten ein (Vorlage): Züge, Antrieb und Zuggattung
 * kommen von der Vorlage, Name, Kürzel, Farbe (Lackierung, Wappen), Motto und Ansprechperson sind eigene.
 * Die Bibliothek liegt im Browser (localStorage) und lässt sich als JSON-Datei teilen.
 */
import { OP_DEFAULTS, OPERATORS, type OperatorId, type OpOverride } from '../sim/Operators';

export interface CustomCompany extends OpOverride {
  id: string;
  base: OperatorId;
}

const KEY = 'rm_companies';
export const FILE_FORMAT = 'bahnhofsmanager-unternehmen';
/** Vorlagen: nur Unternehmen, die über Verträge ins Spiel kommen (keine Werksbahnen oder Sonderzüge) */
export const TEMPLATES: OperatorId[] = (Object.keys(OPERATORS) as OperatorId[]).filter((id) => !OPERATORS[id].special && !OPERATORS[id].industry && !OPERATORS[id].foreign);

const store = () => {
  try { return globalThis.localStorage; } catch { return undefined; }
};

export function loadCompanies(): CustomCompany[] {
  try {
    const raw = JSON.parse(store()?.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.map(clean).filter((c): c is CustomCompany => !!c) : [];
  } catch { return []; }
}

export function saveCompanies(list: CustomCompany[]) {
  try { store()?.setItem(KEY, JSON.stringify(list)); } catch { /* voll oder gesperrt */ }
}

const rid = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** neues Unternehmen aus einer Vorlage */
export function newCompany(base: OperatorId): CustomCompany {
  const d = OP_DEFAULTS[base];
  return { id: rid(), base, name: `Neue ${d.name}`, short: d.short, color: d.color, rep: 'Mag. Erika Musterfrau', role: 'Geschäftsführung', seed: Math.floor(Math.random() * 1e6), motto: '' };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');

/** Eingaben prüfen und kürzen – auch für importierte Dateien von anderen */
export function clean(x: unknown): CustomCompany | undefined {
  if (!x || typeof x !== 'object') return;
  const o = x as Record<string, unknown>;
  const base = o.base as OperatorId;
  if (!TEMPLATES.includes(base)) return;
  const name = str(o.name, 32);
  if (!name) return;
  const color = typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color.toLowerCase() : OP_DEFAULTS[base].color;
  return {
    id: str(o.id, 24) || rid(), base, name,
    short: str(o.short, 4) || OP_DEFAULTS[base].short,
    color,
    rep: str(o.rep, 40) || 'Geschäftsführung',
    role: str(o.role, 30) || 'Geschäftsführung',
    seed: Number.isFinite(o.seed) ? Math.abs(Math.floor(o.seed as number)) % 1e6 : 1,
    motto: str(o.motto, 60),
  };
}

/** Datei zum Weitergeben (MOD-03) */
export function exportCompanies(list: CustomCompany[]) {
  return JSON.stringify({ format: FILE_FORMAT, version: 1, companies: list.map(({ id, base, name, short, color, rep, role, seed, motto }) => ({ id, base, name, short, color, rep, role, seed, motto })) }, null, 2);
}

/** Datei einlesen: liefert die gültigen Unternehmen (bestehende IDs werden ersetzt, neue angehängt) */
export function importCompanies(text: string, into: CustomCompany[]): { list: CustomCompany[]; added: number; error?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { list: into, added: 0, error: 'Das ist keine gültige Datei.' }; }
  const arr = Array.isArray(data) ? data : (data as { format?: string; companies?: unknown[] })?.format === FILE_FORMAT ? (data as { companies: unknown[] }).companies : undefined;
  if (!Array.isArray(arr)) return { list: into, added: 0, error: 'In der Datei stehen keine Bahnunternehmen.' };
  const got = arr.map(clean).filter((c): c is CustomCompany => !!c);
  if (!got.length) return { list: into, added: 0, error: 'Keines der Unternehmen in der Datei ist gültig.' };
  const list = [...into];
  for (const c of got) {
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c; else list.push(c);
  }
  return { list: list.slice(0, 60), added: got.length };
}

/** für FreeCfg.custom: je Vorlage höchstens ein eigenes Unternehmen */
export function overridesFor(list: CustomCompany[], pick: Partial<Record<OperatorId, string>>): Partial<Record<OperatorId, OpOverride>> {
  const out: Partial<Record<OperatorId, OpOverride>> = {};
  for (const [base, id] of Object.entries(pick) as [OperatorId, string][]) {
    const c = list.find((x) => x.id === id && x.base === base);
    if (c) out[base] = { name: c.name, short: c.short, color: c.color, rep: c.rep, role: c.role, seed: c.seed, motto: c.motto, base };
  }
  return out;
}

/** Wappen als kleines SVG (Schild in der Farbe, Kürzel darauf) */
export function crest(c: { short: string; color: string }, size = 40) {
  const s = c.short.replace(/[<>&"]/g, '').slice(0, 4);
  return `<svg class="crest" width="${size}" height="${Math.round(size * 1.15)}" viewBox="0 0 40 46" aria-hidden="true">
    <path d="M4 3h32v20c0 11-8 17-16 20C12 40 4 34 4 23z" fill="${c.color}" stroke="#1b1d2a" stroke-width="3"/>
    <path d="M8 7h24v6H8z" fill="rgba(255,255,255,.35)"/>
    <text x="20" y="${s.length > 2 ? 29 : 31}" text-anchor="middle" font-size="${s.length > 2 ? 11 : 15}" font-family="inherit" fill="#fff" stroke="#1b1d2a" stroke-width=".6">${s}</text></svg>`;
}
