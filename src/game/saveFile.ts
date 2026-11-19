/**
 * Spielstand-Format, Export/Import als Datei und Prüfung von Importen.
 * Anforderungen: RM-FR-SAVE-02 (versioniert), RM-FR-SAVE-03 (Export/Import), RM-FR-SEC-01 (Importe sind nur Daten).
 */
import { growSave } from './saveMigrate';
import { cleanMap } from './CustomMaps';
import type { GameSave } from './Game';
import { VERSION } from './changelog';
import { MAP_W, MAP_H, PARCEL } from '../config';
import { PIECES } from '../world/pieces';
import { BUILDINGS } from '../world/buildings';
import { isCustomMap, isRandomMap, MAPS } from '../world/maps';
import { decodeSave } from './saveCodec';

/** aktuelle Formatversion (GameSave.v). Bei jeder inkompatiblen Änderung erhöhen und unten eine Migration ergänzen. */
export const SAVE_VERSION = 6 as const;
/** älteste Version, die noch geladen werden kann */
export const MIN_SAVE_VERSION = 4;

/** Kennung der Exportdatei */
export const FILE_KIND = 'railway-manager-save';
export const FILE_EXT = '.rmsave';

/** Hülle um den Spielstand in der Exportdatei */
export interface SaveFile {
  kind: typeof FILE_KIND;
  /** Version der Hülle (nicht des Spielstands) */
  fmt: 1;
  /** Spielversion beim Export */
  app: string;
  created: string;
  label?: string;
  save: GameSave;
}

export type CheckResult = { ok: true; save: GameSave; label?: string } | { ok: false; error: string };

// ------------------------------------------------------------ Grenzen (RM-FR-SEC-01)
/** größte Datei, die angenommen wird */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** größter entpackter Inhalt (Schutz vor „Zip-Bomben“) */
export const MAX_JSON_BYTES = 80 * 1024 * 1024;
const MAX_DEPTH = 24;
const MAX_STRING = 50_000;
const MAX_ARRAY = 200_000;
const MAX_MONEY = 1e12;

// ------------------------------------------------------------ Versionen (RM-FR-SAVE-02)
export function versionOf(s: unknown): number | undefined {
  const v = (s as { v?: unknown })?.v;
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined;
}

/** Kann diese Version geladen werden? Liefert sonst eine verständliche Meldung. */
export function versionProblem(v: number | undefined): string | undefined {
  if (v === undefined) return 'Keine Versionsnummer – das ist kein Spielstand.';
  if (v > SAVE_VERSION) return 'Dieser Spielstand ist aus einer neueren Spielversion. Bitte das Spiel aktualisieren.';
  if (v < MIN_SAVE_VERSION) return 'Dieser Spielstand ist zu alt und kann nicht mehr geladen werden.';
  return undefined;
}

/**
 * Hebt einen Spielstand Schritt für Schritt auf die aktuelle Version.
 * v4 (kleine Karte) wird beim Laden in Game selbst umgebaut, daher hier nichts zu tun.
 * Neue Schritte so ergänzen: `if (s.v === 5) { …; s.v = 6; }`
 */
export function migrate(s: GameSave): GameSave {
  if (s.v === 5) s = growSave(s);
  return s;
}

// ------------------------------------------------------------ Export
const safeName = (s: string) => s.replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Spielstand';

export function fileName(s: GameSave) {
  const day = Math.floor(s.sim.time / 86400) + 1;
  const m = Math.floor(s.sim.time / 60) % (24 * 60);
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
  return `${safeName(s.company)}_Tag${day}_${hhmm}${FILE_EXT}`;
}

export function toFile(save: GameSave, label?: string): SaveFile {
  return { kind: FILE_KIND, fmt: 1, app: VERSION, created: new Date().toISOString(), label, save };
}

/** Text gzip-komprimieren, wenn der Browser das kann (RM-FR-PERF-04), sonst unkomprimiert */
async function pack(text: string): Promise<Blob> {
  const raw = new Blob([text], { type: 'application/json' });
  if (typeof CompressionStream === 'undefined') return raw;
  try {
    const stream = raw.stream().pipeThrough(new CompressionStream('gzip'));
    return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
  } catch {
    return raw;
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Spielstand als Datei herunterladen */
export async function exportSave(save: GameSave, label?: string) {
  download(await pack(JSON.stringify(toFile(save, label))), fileName(save));
}

// ------------------------------------------------------------ Import
/** Datei lesen, ggf. entpacken, prüfen. Führt nie Code aus – nur JSON. */
export async function readSaveFile(file: Blob): Promise<CheckResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'Die Datei ist zu groß.' };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: 'Die Datei konnte nicht gelesen werden.' };
  }
  let text: string;
  try {
    text = await unpack(bytes);
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message ? e.message : 'Die Datei ist beschädigt.' };
  }
  return parseSaveText(text);
}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function unpack(bytes: Uint8Array): Promise<string> {
  if (!isGzip(bytes)) {
    if (bytes.length > MAX_JSON_BYTES) throw new Error('Die Datei ist zu groß.');
    return new TextDecoder().decode(bytes);
  }
  if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann komprimierte Spielstände nicht öffnen.');
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let r: ReadableStreamReadResult<Uint8Array>;
    try {
      r = await reader.read();
    } catch {
      throw new Error('Die Datei ist beschädigt.');
    }
    if (r.done) break;
    total += r.value.length;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error('Der Inhalt der Datei ist zu groß.');
    }
    parts.push(r.value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return new TextDecoder().decode(out);
}

/** gefährliche Schlüssel, die Objekt-Prototypen verändern könnten */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** JSON-Text prüfen. Nimmt die Exportdatei oder einen nackten Spielstand. */
export function parseSaveText(text: string): CheckResult {
  let data: unknown;
  try {
    data = JSON.parse(text, (k, v) => (BAD_KEYS.has(k) ? undefined : v));
  } catch {
    return { ok: false, error: 'Das ist keine gültige Spielstand-Datei.' };
  }
  let label: string | undefined;
  if (isObj(data) && data.kind === FILE_KIND) {
    if (data.fmt !== 1) return { ok: false, error: 'Dieses Dateiformat kennt diese Spielversion noch nicht.' };
    if (typeof data.label === 'string') label = data.label;
    data = data.save;
  }
  return checkSave(decodeSave(data), label);
}

// ------------------------------------------------------------ Prüfung (RM-FR-SEC-01)
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const isNum = (x: unknown, lim = Number.MAX_VALUE): x is number => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= lim;
const isStr = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max;
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

class Bad extends Error {}
const fail = (what: string): never => { throw new Bad(what); };
const need = (cond: boolean, what: string) => { if (!cond) fail(what); };

/** Spielstand-Objekt prüfen und bereinigen. Wirft nie, sondern liefert eine Meldung. */
export function checkSave(data: unknown, label?: string): CheckResult {
  try {
    need(isObj(data), 'Kein Spielstand gefunden.');
    const s = data as Obj;
    const problem = versionProblem(versionOf(s));
    if (problem) return { ok: false, error: problem };
    walk(s, 0, '');
    checkFields(s);
    return { ok: true, save: migrate(s as unknown as GameSave), label: label ? clean(label).slice(0, 60) : undefined };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: `Spielstand ungültig: ${e.message}` };
    return { ok: false, error: 'Spielstand ungültig.' };
  }
}

/**
 * Nur Tag-Anfänge (`<b`, `</`, `<!`, `<?`) entfernen, damit nichts als HTML wirken kann.
 * Einzelne `<` und `>` bleiben erhalten – sie kommen in internen Kennungen vor (z. B. Fahrwege `p:12,31>`).
 */
const clean = (s: string) => s.replace(/<(?=[a-zA-Z/!?])/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

/**
 * Alles einmal durchgehen: Tiefe, Längen, nur endliche Zahlen.
 * Texte werden bereinigt; Brief-HTML im Postfach wird gesondert gefiltert.
 */
function walk(x: unknown, depth: number, path: string): void {
  need(depth <= MAX_DEPTH, 'zu tief verschachtelt');
  if (Array.isArray(x)) {
    need(x.length <= MAX_ARRAY, `Liste zu lang (${path})`);
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (typeof v === 'string') x[i] = clean(v);
      else if (typeof v === 'object' && v !== null) walk(v, depth + 1, path);
      else checkScalar(v, path);
    }
    return;
  }
  if (!isObj(x)) return;
  for (const k of Object.keys(x)) {
    const v = x[k];
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string') {
      need(v.length <= MAX_STRING, `Text zu lang (${p})`);
      x[k] = p === 'inbox.html' ? sanitizeHtml(v) : clean(v);
    } else if (typeof v === 'object' && v !== null) walk(v, depth + 1, p);
    else checkScalar(v, p);
  }
}

function checkScalar(v: unknown, p: string) {
  if (typeof v === 'number') need(Number.isFinite(v), `ungültige Zahl (${p})`);
}

function checkFields(s: Obj) {
  const small = s.v === 4;
  const w = small ? 96 : MAP_W, h = small ? 32 : s.v === 5 ? 64 : MAP_H;
  const n = w * h;

  need(isStr(s.company, 60), 'Firmenname');
  need(isNum(s.money, MAX_MONEY), 'Kontostand');
  need(isInt(s.missionIdx, 0, 10_000), 'Auftragsnummer');
  if (s.mapId !== undefined) need(typeof s.mapId === 'string' && (MAPS.some((m) => m.id === s.mapId) || isRandomMap(s.mapId) || (isCustomMap(s.mapId) && !!cleanMap(s.customMap))), 'unbekannte Karte');

  // Zellen: 10 Bits je Zelle
  need(Array.isArray(s.cells) && s.cells.length === n, 'Kartengröße passt nicht');
  for (const c of s.cells as unknown[]) need(isInt(c, 0, 1023), 'Zelldaten');
  if (s.sortDest !== undefined) {
    need(Array.isArray(s.sortDest) && s.sortDest.length === n, 'Rangierziele');
    for (const d of s.sortDest as unknown[]) need(d === null || isInt(d, 0, 255), 'Rangierziele');
  }

  const inMap = (x: unknown, y: unknown) => isInt(x, 0, w - 1) && isInt(y, 0, h - 1);
  const ids = (list: unknown, what: string, each: (o: Obj) => boolean) => {
    need(Array.isArray(list), what);
    const seen = new Set<number>();
    for (const o of list as unknown[]) {
      need(isObj(o) && isInt(o.id, 1, 1e9) && !seen.has(o.id as number) && each(o as Obj), what);
      seen.add((o as Obj).id as number);
    }
  };
  ids(s.pieces, 'Gleisteile', (p) => typeof p.key === 'string' && p.key in PIECES && inMap(p.x, p.y));
  ids(s.buildings, 'Gebäude', (b) => typeof b.key === 'string' && b.key in BUILDINGS && inMap(b.x, b.y) && isBool(b.decor)
    && (b.name === undefined || b.name === null || isStr(b.name, 60)) && (b.rot === undefined || isBool(b.rot)));
  ids(s.links ?? [], 'Tunnel/Brücken', (l) => (l.kind === 'tunnel' || l.kind === 'bridge') && inMap(l.x, l.y0) && inMap(l.x, l.y1));

  need(Array.isArray(s.owned) && s.owned.length === (w / PARCEL) * (h / PARCEL) && (s.owned as unknown[]).every(isBool), 'Grundstücke');
  need(Array.isArray(s.mainRows) && s.mainRows.length >= 1 && s.mainRows.length <= 8 && (s.mainRows as unknown[]).every((r) => isInt(r, 0, h - 1)), 'Streckengleise');
  need(Array.isArray(s.unlocked) && (s.unlocked as unknown[]).every((u) => isStr(u, 40)), 'Freischaltungen');
  need(isObj(s.stats) && isObj(s.missionBase) && isObj(s.satisfaction), 'Statistik');
  need(Array.isArray(s.log), 'Protokoll');

  const sim = s.sim;
  need(isObj(sim), 'Simulation');
  const m = sim as Obj;
  need(isNum(m.time) && (m.time as number) >= 0 && isInt(m.level, 1, 100), 'Spielzeit');
  need(Array.isArray(m.trains) && Array.isArray(m.queue) && (m.trains as unknown[]).length <= 5000 && (m.queue as unknown[]).length <= 5000, 'Züge');

  if (s.inbox !== undefined) need(Array.isArray(s.inbox) && (s.inbox as unknown[]).length <= 200, 'Postfach');
  if (s.player !== undefined) need(isObj(s.player) && isStr((s.player as Obj).name, 60), 'Spielername');
}

// ------------------------------------------------------------ Brief-HTML filtern
const ALLOWED_TAGS = new Set(['B', 'I', 'EM', 'STRONG', 'P', 'BR', 'DIV', 'SPAN', 'SMALL', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'HR', 'BLOCKQUOTE', 'SUP', 'SUB', 'U', 'S']);
const ALLOWED_ATTR = new Set(['class', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan']);
/** Bilder nur aus dem Spiel selbst oder als eingebettete Rastergrafik */
const SAFE_SRC = /^(assets\/|\.\/assets\/|\/assets\/|data:image\/(png|gif|jpeg|webp);base64,)/i;

/** Nur harmlose Tags und Attribute behalten. Ohne DOM (z. B. in Tests) wird alles HTML entfernt. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return clean(html);
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const visit = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // unbekannte Tags: Inhalt als Text behalten, Script & Co. ganz weg
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT'].includes(child.tagName)) child.remove();
        else child.replaceWith(doc.createTextNode(child.textContent ?? ''));
        continue;
      }
      for (const a of Array.from(child.attributes)) {
        const name = a.name.toLowerCase();
        if (!ALLOWED_ATTR.has(name) || (name === 'src' && !SAFE_SRC.test(a.value.trim()))) child.removeAttribute(a.name);
      }
      visit(child);
    }
  };
  visit(root);
  return root.innerHTML;
}
