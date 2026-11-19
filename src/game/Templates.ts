import { COST } from '../config';
import { PIECES } from '../world/pieces';
import type { Grid } from '../world/Grid';
import type { ToolId } from './Missions';

/** Kopieren und Vorlagen (RM-FR-BUILD-13): Gleise, Weichen, Signale, Bahnsteige, Fahrdraht eines Bereichs */

type XY = { x: number; y: number };
export interface Template {
  w: number; h: number;
  track: [number, number][]; wire: [number, number][]; platform: [number, number][];
  pieces: { key: string; dx: number; dy: number }[];
  signals: { dx: number; dy: number; v: 'E' | 'W' | 'SE' | 'SW' }[];
}
export const TEMPLATE_SLOTS = 3;
const KEY = 'rm_templates';

export function loadTemplates(): (Template | null)[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? '[]') as (Template | null)[];
    return Array.from({ length: TEMPLATE_SLOTS }, (_, i) => a[i] ?? null);
  } catch { return Array(TEMPLATE_SLOTS).fill(null); }
}
/** neue Vorlage vorne einreihen (älteste fällt raus) */
export function pushTemplate(t: Template) {
  const a = [t, ...loadTemplates()].slice(0, TEMPLATE_SLOTS);
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* egal */ }
}
export const templateLabel = (t: Template | null, i: number) => (t ? `Vorlage ${i + 1} (${t.w}×${t.h})` : `Vorlage ${i + 1} (leer)`);

/** Bereich erfassen – nur eigene, nicht fest verlegte Teile */
export function capture(g: Grid, cells: XY[]): Template | null {
  if (!cells.length) return null;
  const x0 = Math.min(...cells.map((c) => c.x)), y0 = Math.min(...cells.map((c) => c.y));
  const x1 = Math.max(...cells.map((c) => c.x)), y1 = Math.max(...cells.map((c) => c.y));
  const t: Template = { w: x1 - x0 + 1, h: y1 - y0 + 1, track: [], wire: [], platform: [], pieces: [], signals: [] };
  const seen = new Set<number>();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.get(x, y);
    if (!c) continue;
    const dx = x - x0, dy = y - y0;
    if (c.platform) t.platform.push([dx, dy]);
    if (c.wire && !c.fixed) t.wire.push([dx, dy]);
    if (c.piece !== null) {
      const p = g.pieces.get(c.piece)!;
      // ganze Teile, die vollständig im Bereich liegen
      if (!seen.has(p.id) && !g.fixedPieces.has(p.id) && p.x >= x0 && p.y >= y0 && p.x + PIECES[p.key].w - 1 <= x1 && p.y + PIECES[p.key].h - 1 <= y1) t.pieces.push({ key: p.key, dx: p.x - x0, dy: p.y - y0 });
      seen.add(p.id);
      continue;
    }
    if (c.track && !c.fixed) t.track.push([dx, dy]);
    if (c.signal) t.signals.push({ dx, dy, v: c.shuntSig ? 'SE' : 'E' });
    if (c.signalW) t.signals.push({ dx, dy, v: c.shuntSig ? 'SW' : 'W' });
  }
  const n = t.track.length + t.pieces.length + t.platform.length + t.signals.length;
  return n ? t : null;
}

/** Bauschritte zum Einfügen an Position at (links oben), in sinnvoller Reihenfolge */
export function pasteSteps(t: Template, at: XY): { tool: ToolId; cells: XY[]; variant: string }[] {
  const P = ([dx, dy]: [number, number]) => ({ x: at.x + dx, y: at.y + dy });
  const steps: { tool: ToolId; cells: XY[]; variant: string }[] = [];
  for (const p of t.platform) steps.push({ tool: 'platform', cells: [P(p)], variant: '' });
  for (const p of t.pieces) steps.push({ tool: PIECES[p.key].group as ToolId, cells: [{ x: at.x + p.dx, y: at.y + p.dy }], variant: p.key });
  for (const p of t.track) steps.push({ tool: 'track', cells: [P(p)], variant: '' });
  for (const p of t.wire) steps.push({ tool: 'wire', cells: [P(p)], variant: '' });
  for (const s of t.signals) steps.push({ tool: 'signal', cells: [{ x: at.x + s.dx, y: at.y + s.dy }], variant: s.v });
  return steps;
}

/** grobe Kosten fürs Einfügen */
export function templateCost(t: Template) {
  return t.track.length * COST.track + t.wire.length * COST.wire + t.platform.length * COST.platform
    + t.pieces.reduce((a, p) => a + PIECES[p.key].cost, 0) + t.signals.reduce((a, s) => a + (s.v.startsWith('S') ? COST.shuntSignal : COST.signal), 0);
}

/** alle Felder der Vorlage an Position at */
export function templateCells(t: Template, at: XY): XY[] {
  const out: XY[] = [];
  for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) out.push({ x: at.x + dx, y: at.y + dy });
  return out;
}
