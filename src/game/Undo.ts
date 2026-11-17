/**
 * Rückgängig machen und Wiederholen von Bau-Aktionen (RM-FR-BUILD-11).
 * Jede Aktion merkt sich nur, was sie geändert hat (Zellen, Gleisteile, Gebäude, Zugänge, Grundstücke).
 * Rückgängig geht nur, wenn genau diese Stellen seither unverändert sind und kein Zug darauf steht.
 */
import type { Building, Cell, Grid, Link, Piece } from '../world/Grid';

/** Zelle als Zahl: dieselben Bits wie im Spielstand, Rangierziel ab Bit 10 */
const packCell = (c: Cell) => (+c.track) | (+c.fixed << 1) | (+c.platform << 2) | (+c.signal << 3) | (+c.signalW << 4)
  | (+c.wire << 5) | (+c.siding << 6) | (+c.road << 7) | (+c.shunt << 8) | (+c.shuntSig << 9) | ((c.sortDest ?? -1) + 1) << 10;

function applyCell(c: Cell, b: number) {
  Object.assign(c, {
    track: !!(b & 1), fixed: !!(b & 2), platform: !!(b & 4), signal: !!(b & 8), signalW: !!(b & 16),
    wire: !!(b & 32), siding: !!(b & 64), road: !!(b & 128), shunt: !!(b & 256), shuntSig: !!(b & 512),
    sortDest: (b >> 10) === 0 ? null : (b >> 10) - 1,
  });
}

/** Zustand der Welt vor einer Aktion */
interface Snapshot {
  cells: Int32Array;
  pieces: Map<number, Piece>;
  buildings: Map<number, Building>;
  links: Map<number, Link>;
  owned: boolean[];
}

/** Unterschied: was vorher da war (before) und was nachher da ist (after) */
interface Diff<T> { before: T[]; after: T[] }

export interface UndoStep {
  /** Kurzbeschreibung für Meldungen, z. B. „Gleis“ */
  label: string;
  /** Kosten der Aktion (negativ = Erlös beim Abriss) */
  cost: number;
  cells: { k: number; before: number; after: number }[];
  pieces: Diff<Piece>;
  buildings: Diff<Building>;
  links: Diff<Link>;
  owned: { i: number; before: boolean; after: boolean }[];
}

const MAX_STEPS = 50;

function sortById<T>(m: Map<number, T>) {
  const all = [...m].sort((a, b) => a[0] - b[0]);
  m.clear();
  for (const [id, x] of all) m.set(id, x);
}
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

function diffMaps<T extends { id: number }>(a: Map<number, T>, b: Map<number, T>): Diff<T> {
  const before: T[] = [], after: T[] = [];
  for (const [id, x] of a) { const y = b.get(id); if (!y || !same(x, y)) before.push({ ...x }); }
  for (const [id, y] of b) { const x = a.get(id); if (!x || !same(x, y)) after.push({ ...y }); }
  return { before, after };
}

export class UndoHistory {
  private undoStack: UndoStep[] = [];
  private redoStack: UndoStep[] = [];

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  peekUndo() { return this.undoStack[this.undoStack.length - 1]; }
  peekRedo() { return this.redoStack[this.redoStack.length - 1]; }

  clear() { this.undoStack = []; this.redoStack = []; }

  snapshot(g: Grid): Snapshot {
    const cells = new Int32Array(g.cells.length);
    g.cells.forEach((c, k) => (cells[k] = packCell(c)));
    const copy = <T extends { id: number }>(m: Map<number, T>) => new Map([...m].map(([id, x]) => [id, { ...x }]));
    return { cells, pieces: copy(g.pieces), buildings: copy(g.buildings), links: copy(g.links), owned: [...g.owned] };
  }

  /** Aktion abschließen: Unterschied zum Snapshot merken. Leere Aktionen werden nicht gemerkt. */
  record(g: Grid, before: Snapshot, label: string, cost: number) {
    const step: UndoStep = { label, cost, cells: [], pieces: diffMaps(before.pieces, g.pieces),
      buildings: diffMaps(before.buildings, g.buildings), links: diffMaps(before.links, g.links), owned: [] };
    g.cells.forEach((c, k) => { const b = packCell(c); if (b !== before.cells[k]) step.cells.push({ k, before: before.cells[k], after: b }); });
    g.owned.forEach((o, i) => { if (o !== before.owned[i]) step.owned.push({ i, before: before.owned[i], after: o }); });
    const empty = !step.cells.length && !step.owned.length && !step.pieces.before.length && !step.pieces.after.length
      && !step.buildings.before.length && !step.buildings.after.length && !step.links.before.length && !step.links.after.length;
    if (empty && !cost) return;
    this.undoStack.push(step);
    if (this.undoStack.length > MAX_STEPS) this.undoStack.shift();
    this.redoStack = [];
  }

  /** alle Zellen, die eine Aktion berührt (für die Zug-Prüfung) */
  touched(g: Grid, s: UndoStep): number[] {
    const out = new Set<number>(s.cells.map((c) => c.k));
    for (const p of [...s.pieces.before, ...s.pieces.after]) g.pieceCells(p).forEach((k) => out.add(k));
    for (const b of [...s.buildings.before, ...s.buildings.after]) g.buildingCells(b).forEach((k) => out.add(k));
    for (const l of [...s.links.before, ...s.links.after]) for (let y = l.y0; y <= l.y1; y++) out.add(g.key(l.x, y));
    return [...out];
  }

  /** Ist die Welt an diesen Stellen noch so wie nach (forward = false) bzw. vor (forward = true) der Aktion? */
  matches(g: Grid, s: UndoStep, forward: boolean): boolean {
    const want = forward ? 'before' : 'after', gone = forward ? 'after' : 'before';
    for (const c of s.cells) if (packCell(g.cells[c.k]) !== c[want]) return false;
    for (const o of s.owned) if (g.owned[o.i] !== o[want]) return false;
    const check = <T extends { id: number }>(m: Map<number, T>, d: Diff<T>) => {
      for (const x of d[want]) { const y = m.get(x.id); if (!y || !same(x, y)) return false; }
      const keep = new Set(d[want].map((x) => x.id));
      for (const x of d[gone]) if (!keep.has(x.id) && m.has(x.id)) return false;
      return true;
    };
    return check(g.pieces, s.pieces) && check(g.buildings, s.buildings) && check(g.links, s.links);
  }

  /** Aktion zurücknehmen (forward = false) oder wiederholen (forward = true) */
  apply(g: Grid, s: UndoStep, forward: boolean) {
    const from = forward ? 'before' : 'after', to = forward ? 'after' : 'before';
    // erst entfernen, dann hinzufügen, zuletzt die Zell-Bits setzen (die sind maßgeblich)
    for (const p of s.pieces[from]) g.removePiece(p.id);
    for (const b of s.buildings[from]) g.removeBuilding(b.id);
    for (const l of s.links[from]) g.links.delete(l.id);
    for (const p of s.pieces[to]) g.addPiece(p.key, p.x, p.y, p.id);
    for (const b of s.buildings[to]) Object.assign(g.addBuilding(b.key, b.x, b.y, b.decor, b.id), b);
    for (const l of s.links[to]) g.addLink(l.kind, l.x, l.y0, l.y1, l.id);
    for (const c of s.cells) applyCell(g.cells[c.k], c[to]);
    for (const o of s.owned) g.owned[o.i] = o[to];
    // Reihenfolge wie vorher (nach Id), z. B. für die Nummerierung der Bahnhöfe
    if (s.pieces[to].length) sortById(g.pieces);
    if (s.buildings[to].length) sortById(g.buildings);
    if (s.links[to].length) sortById(g.links);
  }

  /** Schritt vom Rückgängig- auf den Wiederholen-Stapel legen und umgekehrt */
  moveUndone() { const s = this.undoStack.pop(); if (s) this.redoStack.push(s); }
  moveRedone() { const s = this.redoStack.pop(); if (s) this.undoStack.push(s); }
}
