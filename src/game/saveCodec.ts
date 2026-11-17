/**
 * Kompakte Ablage von Spielständen (RM-FR-PERF-04): gleicher Inhalt, etwa ein Fünftel der Größe
 * (Demobahnhof 184 → 35 kB). Der Inhalt (GameSave, Formatversion v) bleibt gleich; nur die Speicherform ändert sich.
 * Erkennbar am Feld `c` (Version der Kompaktform). Stände ohne `c` werden unverändert gelesen.
 */
import type { GameSave } from './Game';

const CODEC = 1;

type Compact = Omit<GameSave, 'cells' | 'sortDest' | 'buildings'> & {
  c: number;
  /** Lauflängen: [Anzahl, Wert, Anzahl, Wert, …] */
  cells: number[];
  /** nur belegte Felder: [Feld, Ziel, …] */
  sortDest: number[];
  /** [id, key, x, y, decor(0/1), name|0, rot(0/1)] */
  buildings: (string | number)[][];
  n: number;
};

export function encodeSave(s: GameSave): object {
  const runs: number[] = [];
  for (let i = 0; i < s.cells.length;) {
    let j = i;
    while (j < s.cells.length && s.cells[j] === s.cells[i]) j++;
    runs.push(j - i, s.cells[i]);
    i = j;
  }
  const sd: number[] = [];
  s.sortDest.forEach((d, k) => { if (d !== null && d !== undefined) sd.push(k, d); });
  const keys = [...new Set(s.buildings.map((b) => b.key))];
  const out: Compact = {
    ...s, c: CODEC, n: s.cells.length, cells: runs, sortDest: sd,
    buildings: [keys, ...s.buildings.map((b) => [b.id, keys.indexOf(b.key), b.x, b.y, +b.decor, b.name ?? 0, +!!b.rot])],
  };
  return out;
}

/** gibt den Spielstand in normaler Form zurück; unbekannte Daten unverändert (die Prüfung lehnt sie dann ab) */
export function decodeSave(x: unknown): unknown {
  if (typeof x !== 'object' || x === null || (x as { c?: unknown }).c !== CODEC) return x;
  const c = x as Compact;
  if (!Array.isArray(c.cells) || !Array.isArray(c.sortDest) || !Array.isArray(c.buildings) || typeof c.n !== 'number' || c.n < 0 || c.n > 1e6) return { ...c, cells: null };
  const cells: number[] = [];
  for (let i = 0; i + 1 < c.cells.length; i += 2) {
    const n = Number(c.cells[i]);
    if (!(n > 0) || cells.length + n > c.n) return { ...c, cells: null };
    for (let j = 0; j < n; j++) cells.push(c.cells[i + 1]);
  }
  const sortDest: (number | null)[] = new Array(c.n).fill(null);
  for (let i = 0; i + 1 < c.sortDest.length; i += 2) {
    const k = c.sortDest[i];
    if (Number.isInteger(k) && k >= 0 && k < c.n) sortDest[k] = c.sortDest[i + 1];
  }
  const [keys, ...rows] = c.buildings as [string[], ...(string | number)[][]];
  const buildings = rows.map((r) => {
    const b: GameSave['buildings'][number] = { id: r[0] as number, key: Array.isArray(keys) ? keys[r[1] as number] : '', x: r[2] as number, y: r[3] as number, decor: !!r[4] };
    if (r[5]) b.name = r[5] as string;
    if (r[6]) b.rot = true;
    return b;
  });
  const { c: _c, n: _n, ...rest } = c;
  return { ...rest, cells, sortDest, buildings };
}
