import { MAIN_ROW, MAP_H, MAP_W, PARCEL, PARCEL_BASE_PRICE, PARCEL_STEP_PRICE, SECOND_ROW, START_PARCELS } from '../config';
import { BUILDINGS } from './buildings';
import { PIECES } from './pieces';

export interface Cell {
  /** gerades Gleis in x-Richtung */
  track: boolean;
  /** Streckengleis des Netzbetreibers – kann nicht abgerissen werden */
  fixed: boolean;
  platform: boolean;
  /** Signal für Fahrtrichtung Ost, am Ostende der Zelle (rechte Seite) */
  signal: boolean;
  /** Signal für Fahrtrichtung West, am Westende der Zelle */
  signalW: boolean;
  /** Id des Gleisteils (Weiche, Kurve, Diagonale), zu dem die Zelle gehört */
  piece: number | null;
  /** Id des Gebäudes / Baums auf der Zelle */
  building: number | null;
  /** Oberleitung */
  wire: boolean;
  /** als Abstellgleis markiert */
  siding: boolean;
  /** Richtungsgleis im Rangierbahnhof (Ziel 0..2) */
  sortDest: number | null;
}

/** Bahnsteigzugang quer über die Gleise */
export interface Link {
  id: number;
  kind: 'tunnel' | 'bridge';
  x: number;
  y0: number;
  y1: number;
}

/** Mehrzelliges Gleisteil. Anker (x,y) = linke obere Zelle. */
export interface Piece {
  id: number;
  key: string;
  x: number;
  y: number;
}

export interface Building {
  id: number;
  key: string;
  x: number;
  y: number;
  /** stand schon vorher in der Landschaft (Abriss kostet) */
  decor: boolean;
  /** Bahnhofsname (Empfangsgebäude) */
  name?: string;
}

type XY = { x: number; y: number };

export class Grid {
  readonly w = MAP_W;
  readonly h = MAP_H;
  readonly pw = MAP_W / PARCEL;
  readonly ph = MAP_H / PARCEL;
  readonly cells: Cell[] = [];
  readonly pieces = new Map<number, Piece>();
  readonly buildings = new Map<number, Building>();
  readonly links = new Map<number, Link>();
  nextLinkId = 1;
  /** gekaufte Parzellen */
  readonly owned: boolean[];
  /** Reihen mit Streckengleis bis zum Kartenrand */
  mainRows: number[] = [MAIN_ROW];
  nextPieceId = 1;
  nextBuildingId = 1;

  constructor(fresh = true) {
    for (let i = 0; i < this.w * this.h; i++) {
      this.cells.push({ track: false, fixed: false, platform: false, signal: false, signalW: false, piece: null, building: null,
        wire: false, siding: false, sortDest: null });
    }
    this.owned = new Array(this.pw * this.ph).fill(false);
    if (!fresh) return;
    for (let x = 0; x < this.w; x++) Object.assign(this.get(x, MAIN_ROW)!, { track: true, fixed: true, wire: true });
    for (let py = START_PARCELS.y0; py <= START_PARCELS.y1; py++) {
      for (let px = START_PARCELS.x0; px <= START_PARCELS.x1; px++) this.owned[py * this.pw + px] = true;
    }
    this.generateLandscape();
  }

  key(x: number, y: number) { return y * this.w + x; }
  xy(k: number) { return { x: k % this.w, y: Math.floor(k / this.w) }; }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): Cell | undefined { return this.inside(x, y) ? this.cells[this.key(x, y)] : undefined; }

  // ------------------------------------------------------------ Parzellen
  parcelOf(x: number, y: number) { return { px: Math.floor(x / PARCEL), py: Math.floor(y / PARCEL) }; }
  parcelOwned(px: number, py: number) {
    return px >= 0 && py >= 0 && px < this.pw && py < this.ph && this.owned[py * this.pw + px];
  }
  isOwned(x: number, y: number) {
    const { px, py } = this.parcelOf(x, y);
    return this.inside(x, y) && this.parcelOwned(px, py);
  }
  parcelBuyable(px: number, py: number) {
    if (px < 0 || py < 0 || px >= this.pw || py >= this.ph || this.parcelOwned(px, py)) return false;
    return this.parcelOwned(px - 1, py) || this.parcelOwned(px + 1, py) || this.parcelOwned(px, py - 1) || this.parcelOwned(px, py + 1);
  }
  parcelPrice(px: number, py: number) {
    const cx = (START_PARCELS.x0 + START_PARCELS.x1) / 2, cy = (START_PARCELS.y0 + START_PARCELS.y1) / 2;
    const dist = Math.max(0, Math.abs(px - cx) - 1.5) + Math.max(0, Math.abs(py - cy) - 0.5);
    return Math.round((PARCEL_BASE_PRICE + dist * PARCEL_STEP_PRICE) / 100) * 100;
  }
  buyParcel(px: number, py: number) { this.owned[py * this.pw + px] = true; }

  // ------------------------------------------------------------ Streckenausbau
  /** Netzbetreiber baut das 2. Streckengleis außerhalb deiner Fläche */
  expandLine() {
    if (this.mainRows.includes(SECOND_ROW)) return;
    for (let x = 0; x < this.w; x++) {
      const c = this.get(x, SECOND_ROW)!;
      if (this.isOwned(x, SECOND_ROW)) continue;
      if (c.building !== null) this.removeBuilding(c.building);
      Object.assign(c, { track: true, fixed: true, platform: false, wire: true });
    }
    this.mainRows.push(SECOND_ROW);
  }

  // ------------------------------------------------------------ Gleisteile
  footprint(key: string, x: number, y: number): XY[] {
    const d = PIECES[key] ?? BUILDINGS[key];
    const out: XY[] = [];
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) out.push({ x: x + dx, y: y + dy });
    return out;
  }

  pieceCells(p: Piece): number[] {
    return this.footprint(p.key, p.x, p.y).map((c) => this.key(c.x, c.y));
  }

  addPiece(key: string, x: number, y: number, id = this.nextPieceId++): Piece {
    const p: Piece = { id, key, x, y };
    this.nextPieceId = Math.max(this.nextPieceId, id + 1);
    this.pieces.set(p.id, p);
    const d = PIECES[key];
    for (const c of this.footprint(key, x, y)) {
      const cell = this.get(c.x, c.y)!;
      cell.piece = p.id;
      if (d.through.includes(c.y - y)) cell.track = true;
    }
    return p;
  }

  removePiece(id: number) {
    const p = this.pieces.get(id);
    if (!p) return;
    for (const k of this.pieceCells(p)) this.cells[k].piece = null;
    this.pieces.delete(id);
  }

  // ------------------------------------------------------------ Zugänge
  addLink(kind: Link['kind'], x: number, y0: number, y1: number, id = this.nextLinkId++): Link {
    const l: Link = { id, kind, x, y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
    this.nextLinkId = Math.max(this.nextLinkId, id + 1);
    this.links.set(id, l);
    return l;
  }

  linkAt(x: number, y: number) {
    for (const l of this.links.values()) if (l.x === x && y >= l.y0 && y <= l.y1) return l;
    return undefined;
  }

  // ------------------------------------------------------------ Gebäude
  buildingCells(b: Building) {
    return this.footprint(b.key, b.x, b.y).map((c) => this.key(c.x, c.y));
  }

  addBuilding(key: string, x: number, y: number, decor = false, id = this.nextBuildingId++): Building {
    const b: Building = { id, key, x, y, decor };
    this.nextBuildingId = Math.max(this.nextBuildingId, id + 1);
    this.buildings.set(id, b);
    for (const k of this.buildingCells(b)) this.cells[k].building = id;
    return b;
  }

  removeBuilding(id: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    for (const k of this.buildingCells(b)) this.cells[k].building = null;
    this.buildings.delete(id);
  }

  private free(x: number, y: number, w: number, h: number) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const c = this.get(x + dx, y + dy);
      if (!c || c.track || c.building !== null || Math.abs(y + dy - MAIN_ROW - 0.5) < 3) return false;
    }
    return true;
  }

  /** Bäume, Büsche und kleine Siedlungen rund um die Strecke */
  private generateLandscape() {
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    // Wälder: dichte Flecken
    const forests = Array.from({ length: 9 }, () => ({ x: rnd() * this.w, y: rnd() < 0.5 ? rnd() * 9 : 22 + rnd() * 10, r: 3 + rnd() * 5 }));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let p = 0.025;
        for (const f of forests) {
          const d = Math.hypot(x - f.x, (y - f.y) * 1.2);
          if (d < f.r) p = Math.max(p, 0.55 * (1 - d / f.r) + 0.1);
        }
        if (this.isOwned(x, y)) p *= 0.5;
        if (rnd() < p && this.free(x, y, 1, 1)) {
          const r = rnd();
          const key = r < 0.35 ? 'bld_pine0' : r < 0.5 ? 'bld_pine1' : r < 0.65 ? 'bld_tree0' : r < 0.78 ? 'bld_tree1' : r < 0.9 ? 'bld_tree2' : 'bld_bush0';
          this.addBuilding(key, x, y, true);
        }
      }
    }
    // Dörfer
    const villages = [{ x: 10, y: 4 }, { x: 80, y: 25 }, { x: 70, y: 5 }, { x: 20, y: 26 }];
    for (const v of villages) {
      for (let i = 0; i < 7; i++) {
        const x = Math.round(v.x + (rnd() - 0.5) * 12), y = Math.round(v.y + (rnd() - 0.5) * 6);
        if (this.free(x, y, 2, 2) && !this.isOwned(x, y)) this.addBuilding(rnd() < 0.5 ? 'bld_houseA' : 'bld_houseB', x, y, true);
      }
    }
  }
}
