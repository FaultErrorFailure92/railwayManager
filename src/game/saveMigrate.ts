/**
 * Spielstände der halb so hohen Karte (Format 5, 256 × 64) in die heutige Welt (256 × 128) heben (RM-FR-MAP-12).
 * Alles rückt um ROW0 Reihen nach unten. Die neuen Streifen oben und unten füllt das Spiel beim Laden mit Landschaft (`grown`).
 */
import { MAP_W, PARCEL, ROW0 } from '../config';
import type { GameSave } from './Game';

const OLD_H = 64;
const SHIFT = ROW0 * MAP_W;

/** Fahrweg-Kennung verschieben: `p:x,y>`, `IN_E:31`, `OUT_W:32` (Gleisteile `q:id:i` bleiben) */
export function shiftKey(k: string): string {
  const p = /^p:(\d+),(\d+)([<>])$/.exec(k);
  if (p) return `p:${p[1]},${Number(p[2]) + ROW0}${p[3]}`;
  const e = /^(IN|OUT)_(E|W):(\d+)$/.exec(k);
  if (e) return `${e[1]}_${e[2]}:${Number(e[3]) + ROW0}`;
  return k;
}

/** Bahnsteig-/Abstell-Kennung `x,y` verschieben */
const shiftRun = (id: string | undefined) => {
  if (!id) return id;
  const m = /^(\d+),(\d+)$/.exec(id);
  return m ? `${m[1]},${Number(m[2]) + ROW0}` : id;
};

type Any = Record<string, unknown>;

export function growSave(s: GameSave): GameSave {
  if (s.v !== 5) return s;
  const pad = <T>(arr: T[] | undefined, fill: T) => {
    if (!arr) return arr;
    const out = new Array<T>(MAP_W * (OLD_H + 2 * ROW0)).fill(fill);
    arr.forEach((v, i) => { out[i + SHIFT] = v; });
    return out;
  };
  s.cells = pad(s.cells, 0)!;
  s.sortDest = pad(s.sortDest, null)!;
  s.links = (s.links ?? []).map((l) => ({ ...l, y0: l.y0 + ROW0, y1: l.y1 + ROW0 }));
  s.pieces = s.pieces.map((p) => ({ ...p, y: p.y + ROW0 }));
  s.buildings = s.buildings.map((b) => ({ ...b, y: b.y + ROW0 }));
  const pw = MAP_W / PARCEL, dp = ROW0 / PARCEL;
  const owned = new Array<boolean>(pw * ((OLD_H + 2 * ROW0) / PARCEL)).fill(false);
  s.owned.forEach((o, i) => { owned[i + dp * pw] = o; });
  s.owned = owned;
  s.mainRows = s.mainRows.map((r) => r + ROW0);
  s.faults = s.faults?.map((f) => ({ ...f, k: f.k + SHIFT, cells: f.cells?.map((k) => k + SHIFT) }));
  if (s.wear) s.wear = Object.fromEntries(Object.entries(s.wear).map(([k, v]) => [String(Number(k) + SHIFT), v]));
  // Züge: Fahrwege, Reservierungen und Bahnsteige verschieben
  const sim = s.sim as unknown as Any;
  if (sim) {
    if (sim.platformPref) sim.platformPref = Object.fromEntries(Object.entries(sim.platformPref as Record<string, string>).map(([k, v]) => [k, shiftRun(v)!]));
    for (const list of ['queue', 'trains'] as const) {
      const ts = sim[list] as Any[] | undefined;
      if (!ts) continue;
      sim[list] = ts.map((t) => ({
        ...t,
        route: (t.route as string[] | undefined)?.map(shiftKey) ?? [],
        reserved: (t.reserved as number[] | undefined)?.map((k) => k + SHIFT) ?? [],
        platform: shiftRun(t.platform as string | undefined),
        sortRun: shiftRun(t.sortRun as string | undefined),
      }));
    }
  }
  (s as GameSave & { grown?: boolean }).grown = true;
  s.v = 6;
  return s;
}
