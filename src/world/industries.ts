import type { OperatorId } from '../sim/Operators';

/** Privatbahn-Anschluss: Betrieb mit Ladegleis, zahlt für jede Fahrt über deine Strecke */
export interface Industry {
  id: string;
  name: string;
  /** Gebäude (3x2) */
  key: string;
  x: number;
  y: number;
  /** Ladegleis: Reihe und Spalten von–bis (fest verlegt, gehört dem Betrieb) */
  row: number;
  x0: number;
  x1: number;
  op: OperatorId;
}

export const INDUSTRIES: Industry[] = [
  { id: 'sawmill', name: 'Sägewerk Holzer', key: 'bld_sawmill', x: 152, y: 22, row: 25, x0: 148, x1: 157, op: 'sw' },
  { id: 'mine', name: 'Bergwerk Erzleiten', key: 'bld_mine', x: 196, y: 41, row: 40, x0: 192, x1: 201, op: 'mn' },
];

export const INDUSTRY_BY_ID: Record<string, Industry> = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));
