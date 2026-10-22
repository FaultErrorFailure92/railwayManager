// Welt: 1 Tile = 16 Einheiten. Bildschirm: 32x16 px pro Tile-Oberseite.
export const TILE = 16;
export const PARCEL = 8;
export const MAP_W = 256;
export const MAP_H = 64;
/** Bestandsstrecke */
export const MAIN_ROW = 31;
/** zweites Streckengleis (kommt mit dem Streckenausbau, Fahrtrichtung Ost = rechts) */
export const SECOND_ROW = 32;
/** Startfläche in Parzellen (inklusive) */
export const START_PARCELS = { x0: 14, x1: 17, y0: 3, y1: 4 };
/** Spielstände v4 (Karte 96x32) liegen um diesen Versatz in der großen Karte */
export const OLD_OFFSET = { x: 80, y: 16 };
/** Kreuzungsstellen des Netzbetreibers auf der eingleisigen Strecke: [Weiche West, Weiche Ost] */
export const PASSING_LOOPS: [number, number][] = [[6, 20], [48, 62], [88, 102], [154, 168], [190, 204], [232, 246]];
/** Fahrplanzuschlag je Kreuzungsstelle (Spielsekunden) */
export const LOOP_SLACK = 75;

// Zeit: Simulation läuft in Spielsekunden
export const GAME_SEC_PER_REAL_SEC = 20;
export const START_TIME = 6 * 3600;

// Fahrdynamik (Einheiten / Spielsekunde)
export const ACC = 0.12;
export const DEC = 0.16;
export const CAR_LEN = 16;

// Wirtschaft
export const START_MONEY = 4000;
export const COST = { track: 40, platform: 80, signal: 250, switch: 900, curve: 300, diag: 60, wire: 30, tunnel: 200, bridge: 150, marker: 20, shuntSignal: 100, crossing: 400, railBridge: 250, road: 25 } as const;
/** Ausbau des Empfangsgebäudes auf Stufe 2 / 3 */
export const STATION_UPGRADE = [0, 0, 6000, 12000];
export const PARCEL_BASE_PRICE = 1500;
export const PARCEL_STEP_PRICE = 600;
export const REFUND = 0.5;
export const PUNCTUAL_LIMIT_MIN = 3;
export const MISSED_STOP_PENALTY = 250;
/** Abzug je Minute über der Pünktlichkeitsgrenze */
export const DELAY_PENALTY_PER_MIN = 15;
