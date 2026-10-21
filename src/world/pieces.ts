import { COST } from '../config';
import manifest from '../gen/manifest.json';
import type { Vec } from '../iso';

/** Gleislage an einem Port: S = gerade, D = diagonal fallend (+x,+y), A = diagonal steigend (+x,-y) */
export type PortType = 'S' | 'D' | 'A';
export interface LocalPort { t: PortType; dx: number; dy: number }

export interface LocalPath {
  from: LocalPort;
  to: LocalPort;
  pts: Vec[];
  diverging: boolean;
}

export type PieceGroup = 'switch' | 'curve' | 'diag';

export interface PieceDef {
  key: string;
  group: PieceGroup;
  label: string;
  w: number;
  h: number;
  /** Reihen (lokal), in denen ein durchgehendes gerades Gleis liegt */
  through: number[];
  paths: LocalPath[];
  cost: number;
}

const P = (name: keyof typeof manifest.paths): Vec[] =>
  manifest.paths[name].map(([x, y]) => ({ x, y }));
const S = (dx: number, dy: number): LocalPort => ({ t: 'S', dx, dy });
const D = (dx: number, dy: number): LocalPort => ({ t: 'D', dx, dy });
const A = (dx: number, dy: number): LocalPort => ({ t: 'A', dx, dy });
const straight = (row: number): LocalPath => ({
  from: S(0, row), to: S(3, row), diverging: false,
  pts: [{ x: 0, y: row * 16 + 8 }, { x: 48, y: row * 16 + 8 }],
});

const defs: PieceDef[] = [
  { key: 'xover_down', group: 'switch', label: 'Gleiswechsel nach vorne', w: 3, h: 2, through: [0, 1], cost: COST.switch,
    paths: [straight(0), straight(1), { from: S(0, 0), to: S(3, 1), pts: P('xover_down'), diverging: true }] },
  { key: 'xover_up', group: 'switch', label: 'Gleiswechsel nach hinten', w: 3, h: 2, through: [0, 1], cost: COST.switch,
    paths: [straight(0), straight(1), { from: S(0, 1), to: S(3, 0), pts: P('xover_up'), diverging: true }] },
  { key: 'branch_divDown', group: 'switch', label: 'Abzweig nach vorne', w: 3, h: 2, through: [0], cost: COST.switch,
    paths: [straight(0), { from: S(0, 0), to: D(3, 1), pts: P('c1'), diverging: true }] },
  { key: 'branch_divUp', group: 'switch', label: 'Abzweig nach hinten', w: 3, h: 2, through: [1], cost: COST.switch,
    paths: [straight(1), { from: S(0, 1), to: A(3, 0), pts: P('c3'), diverging: true }] },
  { key: 'branch_mergeAbove', group: 'switch', label: 'Einmündung von hinten', w: 3, h: 2, through: [1], cost: COST.switch,
    paths: [straight(1), { from: D(0, 0), to: S(3, 1), pts: P('c2'), diverging: true }] },
  { key: 'branch_mergeBelow', group: 'switch', label: 'Einmündung von vorne', w: 3, h: 2, through: [0], cost: COST.switch,
    paths: [straight(0), { from: A(0, 1), to: S(3, 0), pts: P('c4'), diverging: true }] },
  { key: 'curve_divDown', group: 'curve', label: 'Kurve gerade → vorne', w: 3, h: 2, through: [], cost: COST.curve,
    paths: [{ from: S(0, 0), to: D(3, 1), pts: P('c1'), diverging: false }] },
  { key: 'curve_divUp', group: 'curve', label: 'Kurve gerade → hinten', w: 3, h: 2, through: [], cost: COST.curve,
    paths: [{ from: S(0, 1), to: A(3, 0), pts: P('c3'), diverging: false }] },
  { key: 'curve_mergeAbove', group: 'curve', label: 'Kurve von hinten → gerade', w: 3, h: 2, through: [], cost: COST.curve,
    paths: [{ from: D(0, 0), to: S(3, 1), pts: P('c2'), diverging: false }] },
  { key: 'curve_mergeBelow', group: 'curve', label: 'Kurve von vorne → gerade', w: 3, h: 2, through: [], cost: COST.curve,
    paths: [{ from: A(0, 1), to: S(3, 0), pts: P('c4'), diverging: false }] },
  { key: 'diag_desc', group: 'diag', label: 'Diagonale nach vorne', w: 1, h: 2, through: [], cost: COST.diag,
    paths: [{ from: D(0, 0), to: D(1, 1), pts: P('diag_desc'), diverging: false }] },
  { key: 'diag_asc', group: 'diag', label: 'Diagonale nach hinten', w: 1, h: 2, through: [], cost: COST.diag,
    paths: [{ from: A(0, 1), to: A(1, 0), pts: P('diag_asc'), diverging: false }] },
];

export const PIECES: Record<string, PieceDef> = Object.fromEntries(defs.map((d) => [d.key, d]));
export const PIECES_BY_GROUP = (g: PieceGroup) => defs.filter((d) => d.group === g);
