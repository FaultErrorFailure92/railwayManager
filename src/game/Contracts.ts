import { LONG_TRAIN_CARS, OPERATORS, Operator, OperatorId } from '../sim/Operators';

export type LengthClass = 'short' | 'long';

export interface Contract {
  active: boolean;
  /** vereinbarter Preis je Zug (pünktlich) */
  price: Record<LengthClass, number>;
  /** frühestens dann wieder verhandeln (Spielzeit) */
  talkAfter: number;
}

/** Durchfahrt ohne Vertrag: nur Trassenentgelt */
export const TRANSIT_FEE = 40;
/** so viele Spielsekunden nach Kündigung/Absage keine neuen Gespräche */
export const TALK_PAUSE = 6 * 3600;

export const lengthClass = (cars: number): LengthClass => (cars >= LONG_TRAIN_CARS ? 'long' : 'short');

const round10 = (n: number) => Math.round(n / 10) * 10;

/** marktüblicher Preis */
export function fairPrice(op: Operator, cls: LengthClass) {
  return round10(op.fee * (cls === 'long' ? 2.2 : 1.5));
}

export function newContracts(): Record<OperatorId, Contract> {
  return Object.fromEntries(Object.values(OPERATORS).map((o) => [o.id, {
    active: true, price: { short: fairPrice(o, 'short'), long: fairPrice(o, 'long') }, talkAfter: 0,
  }])) as Record<OperatorId, Contract>;
}

/** Wie weit über dem fairen Preis darf es sein? hängt von der Zufriedenheit ab */
export const tolerance = (satisfaction: number) => 1.0 + 0.4 * (satisfaction / 100);

/** höchstes Verhältnis Preis / fair über beide Zuglängen */
export function priceRatio(op: Operator, c: Contract) {
  return Math.max(c.price.short / fairPrice(op, 'short'), c.price.long / fairPrice(op, 'long'));
}

/** Kündigungsrisiko pro Spielstunde (0..1) */
export function cancelRisk(op: Operator, c: Contract, satisfaction: number) {
  const over = priceRatio(op, c) - tolerance(satisfaction);
  return over <= 0 ? 0 : Math.min(0.6, over * 1.5);
}

/** Chance, dass ein Angebot angenommen wird */
export function acceptChance(op: Operator, c: Contract, satisfaction: number) {
  const r = priceRatio(op, c) / tolerance(satisfaction);
  return r <= 0.85 ? 1 : r >= 1.15 ? 0 : (1.15 - r) / 0.3;
}
