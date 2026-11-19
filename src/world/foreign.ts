import type { OperatorId } from '../sim/Operators';
import { currentMap } from './maps';

/**
 * Fremdbahn (RM-FR-MAP-09): eine fremde Strecke, die im Bogen nahe an deinem Bahnhof vorbeiführt.
 * An den Kartenrändern liegt sie in Reihe `row`, dazwischen kommt sie mit einem geraden Abschnitt (`low`, Spalten x0–x1)
 * bis kurz vor dein Gelände. Dort kannst du sie mit einer Weiche anschließen.
 */
export interface ForeignLine {
  /** Unternehmen, das auf der Strecke fährt (zugleich Kennung der Strecke) */
  op: OperatorId;
  /** Reihe an den Kartenrändern */
  row: number;
  /** Reihe des nahen, geraden Abschnitts */
  low: number;
  x0: number;
  x1: number;
}

export interface LinePiece { key: string; x: number; y: number }

/** Bogen aus Kurve, Diagonalen und Kurve: Gleisteile und gerade Felder der ganzen Strecke */
export function lineLayout(l: ForeignLine, w: number): { straight: { x: number; y: number }[]; pieces: LinePiece[] } {
  const north = l.low > l.row;
  const k = Math.abs(l.low - l.row) - 2;
  const ax = l.x0 - 6 - k; // Beginn des linken Bogens
  const bx = l.x1 + 7 + k; // erstes gerade Feld nach dem rechten Bogen
  const pieces: LinePiece[] = [];
  if (north) {
    pieces.push({ key: 'curve_divDown', x: ax, y: l.row });
    for (let i = 0; i < k; i++) pieces.push({ key: 'diag_desc', x: ax + 3 + i, y: l.row + 1 + i });
    pieces.push({ key: 'curve_mergeAbove', x: ax + 3 + k, y: l.row + 1 + k });
    pieces.push({ key: 'curve_divUp', x: l.x1 + 1, y: l.low - 1 });
    for (let i = 0; i < k; i++) pieces.push({ key: 'diag_asc', x: l.x1 + 4 + i, y: l.low - 2 - i });
    pieces.push({ key: 'curve_mergeBelow', x: l.x1 + 4 + k, y: l.row });
  } else {
    pieces.push({ key: 'curve_divUp', x: ax, y: l.row - 1 });
    for (let i = 0; i < k; i++) pieces.push({ key: 'diag_asc', x: ax + 3 + i, y: l.row - 2 - i });
    pieces.push({ key: 'curve_mergeBelow', x: ax + 3 + k, y: l.low });
    pieces.push({ key: 'curve_divDown', x: l.x1 + 1, y: l.low });
    for (let i = 0; i < k; i++) pieces.push({ key: 'diag_desc', x: l.x1 + 4 + i, y: l.low + 1 + i });
    pieces.push({ key: 'curve_mergeAbove', x: l.x1 + 4 + k, y: l.low + 1 + k });
  }
  const straight: { x: number; y: number }[] = [];
  for (let x = 0; x < ax; x++) straight.push({ x, y: l.row });
  for (let x = l.x0; x <= l.x1; x++) straight.push({ x, y: l.low });
  for (let x = bx; x < w; x++) straight.push({ x, y: l.row });
  return { straight, pieces };
}

/** Fremdbahnen der aktuellen Karte */
export const foreignLines = (): ForeignLine[] => currentMap().foreignLines ?? [];
export const foreignLineOf = (op: OperatorId | string | undefined) => foreignLines().find((l) => l.op === op);
