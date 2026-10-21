export interface Vec { x: number; y: number }

/** Welt (x,y) -> Bildschirm (2:1 isometrisch) */
export const toScreen = (x: number, y: number): Vec => ({ x: x - y, y: (x + y) / 2 });

/** Bildschirm -> Welt (Bodenebene) */
export const toWorld = (sx: number, sy: number): Vec => ({ x: sy + sx / 2, y: sy - sx / 2 });
