import { currentMap } from './maps';
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

/** Betriebe der aktuellen Karte */
export const industries = (): Industry[] => currentMap().industries;
export const industryById = (id: string) => industries().find((i) => i.id === id);
