// Welt: 1 Tile = 16 Einheiten. Bildschirm: 32x16 px pro Tile-Oberseite.
export const TILE = 16;
export const PARCEL = 8;
export const MAP_W = 96;
export const MAP_H = 32;
/** Bestandsstrecke */
export const MAIN_ROW = 15;
/** zweites Streckengleis (kommt mit dem Streckenausbau, Fahrtrichtung Ost = rechts) */
export const SECOND_ROW = 16;
/** Startfläche in Parzellen (inklusive) */
export const START_PARCELS = { x0: 4, x1: 7, y0: 1, y1: 2 };

// Zeit: Simulation läuft in Spielsekunden
export const GAME_SEC_PER_REAL_SEC = 20;
export const START_TIME = 6 * 3600;

// Fahrdynamik (Einheiten / Spielsekunde)
export const ACC = 0.12;
export const DEC = 0.16;
export const CAR_LEN = 16;

// Wirtschaft
export const START_MONEY = 4000;
export const COST = { track: 40, platform: 80, signal: 250, switch: 900, curve: 300, diag: 60, wire: 30, tunnel: 200, bridge: 150, marker: 20 } as const;
export const PARCEL_BASE_PRICE = 1500;
export const PARCEL_STEP_PRICE = 600;
export const REFUND = 0.5;
export const PUNCTUAL_LIMIT_MIN = 3;
export const MISSED_STOP_PENALTY = 250;
/** Abzug je Minute über der Pünktlichkeitsgrenze */
export const DELAY_PENALTY_PER_MIN = 15;
