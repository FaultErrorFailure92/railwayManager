import { industries } from './industries';
import { foreignLines, lineLayout, type ForeignLine } from './foreign';
import { currentMap } from './maps';
import { MAIN_ROW, MAP_H, MAP_W, OLD_OFFSET, PARCEL, PARCEL_BASE_PRICE, PARCEL_STEP_PRICE, PASSING_LOOPS, ROW0, SECOND_ROW, START_PARCELS } from '../config';

/** Bodenart */
export const GRASS = 0, WATER = 1, ROCK = 2;
/** Bereich der alten, kleinen Karte: bleibt flach (Wiese) */
const CORE = { x0: OLD_OFFSET.x - 4, x1: OLD_OFFSET.x + 96 + 3 };
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
  /** Straße */
  road: boolean;
  /** Rangierbereich: langsam, Rangiersignale erlaubt */
  shunt: boolean;
  /** Signale auf diesem Feld sind Rangiersignale */
  shuntSig: boolean;
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
  /** Bahnhofs-Kürzel (selbst vergeben) */
  code?: string;
  /** gespiegelt/gedreht (nur quadratische Gebäude) */
  rot?: boolean;
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
  /** Bodenart je Zelle (immer gleich erzeugt, wird nicht gespeichert) */
  readonly terrain: Uint8Array;
  /** Gleisteile des Netzbetreibers (nicht abreißbar) */
  readonly fixedPieces = new Set<number>();

  constructor(fresh = true) {
    for (let i = 0; i < this.w * this.h; i++) {
      this.cells.push({ track: false, fixed: false, platform: false, signal: false, signalW: false, piece: null, building: null,
        wire: false, siding: false, sortDest: null, road: false, shunt: false, shuntSig: false });
    }
    this.owned = new Array(this.pw * this.ph).fill(false);
    this.terrain = new Uint8Array(this.w * this.h);
    this.generateTerrain();
    if (!fresh) return;
    for (let x = 0; x < this.w; x++) Object.assign(this.get(x, MAIN_ROW)!, { track: true, fixed: true });
    for (let py = START_PARCELS.y0; py <= START_PARCELS.y1; py++) {
      for (let px = START_PARCELS.x0; px <= START_PARCELS.x1; px++) this.owned[py * this.pw + px] = true;
    }
    this.addPassingLoops();
    this.placeForeignLines(true);
    this.addPublicRoads();
    this.generateLandscape();
    this.placeIndustries();
  }

  /** Zelle -> Fremdbahn (Kennung = Unternehmen), RM-FR-MAP-09 */
  readonly foreignCells = new Map<number, string>();
  /** Fremdbahnen, die auf dieser Karte liegen (in alten Spielständen nur, wo Platz war) */
  readonly foreignLaid: ForeignLine[] = [];
  /** Reihen der Fremdbahnen an den Kartenrändern */
  get foreignRows() { return this.foreignLaid.map((l) => l.row); }
  foreignAtRow(row: number) { return this.foreignLaid.find((l) => l.row === row); }

  /**
   * Fremdbahnen verlegen (neue Karte) oder nach dem Laden wiedererkennen.
   * Alte Spielstände bekommen sie nachgerüstet, wenn die Felder frei und nicht gekauft sind.
   */
  placeForeignLines(fresh = false) {
    for (const l of foreignLines()) {
      if (this.foreignLaid.includes(l)) continue;
      const { straight, pieces } = lineLayout(l, this.w);
      const cells = [...straight.map((c) => this.key(c.x, c.y)), ...pieces.flatMap((p) => this.footprint(p.key, p.x, p.y).map((c) => this.key(c.x, c.y)))];
      if (cells.some((k) => k < 0 || k >= this.cells.length)) continue;
      const at = (p: { key: string; x: number; y: number }) => { const id = this.get(p.x, p.y)?.piece; return id != null && this.pieces.get(id)?.key === p.key ? id : null; };
      const laid = pieces.every((p) => at(p) !== null) && straight.every((c) => this.get(c.x, c.y)!.track);
      if (!laid) {
        if (!fresh) {
          // nachrüsten nur auf fremdem, freiem Land
          const blocked = cells.some((k) => {
            const c = this.cells[k], { x, y } = this.xy(k);
            return this.isOwned(x, y) || c.track || c.piece !== null || c.platform || (c.building !== null && !this.buildings.get(c.building)?.decor);
          });
          if (blocked) continue;
        }
        for (const k of cells) {
          const c = this.cells[k];
          if (c.building !== null) this.removeBuilding(c.building);
          c.road = false;
        }
        for (const p of pieces) this.fixedPieces.add(this.addPiece(p.key, p.x, p.y).id);
        for (const c of straight) Object.assign(this.get(c.x, c.y)!, { track: true, fixed: true, platform: false });
        this.get(l.x0, l.low)!.signalW = true;
        this.get(l.x1, l.low)!.signal = true;
      } else {
        for (const p of pieces) this.fixedPieces.add(at(p)!);
      }
      for (const k of cells) {
        this.foreignCells.set(k, l.op);
        if (this.terrain[k] === ROCK) this.terrain[k] = GRASS;
      }
      this.foreignLaid.push(l);
    }
  }

  /** Fremdbahnen, die nicht mehr ganz liegen (z. B. nach dem Laden eines sehr alten Spielstands), wieder entfernen */
  dropBrokenForeign() {
    for (const l of [...this.foreignLaid]) {
      const { straight, pieces } = lineLayout(l, this.w);
      const ok = straight.every((c) => this.get(c.x, c.y)!.track)
        && pieces.every((p) => { const id = this.get(p.x, p.y)?.piece; return id != null && this.pieces.get(id)?.key === p.key; });
      if (ok) continue;
      for (const p of pieces) {
        const id = this.get(p.x, p.y)?.piece;
        if (id != null && this.fixedPieces.has(id)) { this.removePiece(id); this.fixedPieces.delete(id); }
      }
      for (const c of straight) {
        const cell = this.get(c.x, c.y)!;
        if (cell.fixed && !this.isOwned(c.x, c.y)) Object.assign(cell, { track: false, fixed: false, signal: false, signalW: false });
      }
      for (const [k, op] of [...this.foreignCells]) if (op === l.op) this.foreignCells.delete(k);
      this.foreignLaid.splice(this.foreignLaid.indexOf(l), 1);
    }
  }

  /** Zelle -> Betrieb (Ladegleis) */
  readonly industryCells = new Map<number, string>();

  /** Privatbahn-Betriebe mit Ladegleis setzen (auch in alten Spielständen nachrüsten) */
  placeIndustries() {
    for (const ind of industries()) {
      for (let x = ind.x0; x <= ind.x1; x++) this.industryCells.set(this.key(x, ind.row), ind.id);
      if ([...this.buildings.values()].some((b) => b.key === ind.key)) continue;
      const area: [number, number][] = [];
      for (let y = Math.min(ind.y, ind.row); y <= Math.max(ind.y + 1, ind.row); y++) for (let x = ind.x0; x <= ind.x1; x++) area.push([x, y]);
      for (const [x, y] of area) {
        const c = this.get(x, y)!;
        if (c.building !== null) { const b = this.buildings.get(c.building); if (b && !BUILDINGS[b.key]?.fixed) this.removeBuilding(b.id); }
        this.terrain[this.key(x, y)] = GRASS;
      }
      this.addBuilding(ind.key, ind.x, ind.y, true);
      for (let x = ind.x0; x <= ind.x1; x++) Object.assign(this.get(x, ind.row)!, { track: true, fixed: true });
    }
  }

  isWater(x: number, y: number) { return this.inside(x, y) && this.terrain[this.key(x, y)] === WATER; }
  /** Wiese (bebaubar) */
  isGround(x: number, y: number) { return this.inside(x, y) && this.terrain[this.key(x, y)] === GRASS; }

  // ------------------------------------------------------------ Gelände
  /** Flüsse, Seen und Felsgebiete – immer gleich (fester Zufall) */
  private generateTerrain() {
    const M = currentMap();
    let seed = M.terrainSeed;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const T = this.terrain;
    const core = (x: number) => x >= CORE.x0 && x <= CORE.x1;
    // Felsgebiete (Gebirge): Nordwesten und Südosten, weich verrauscht
    const ranges = M.rocks;
    const ph = Array.from({ length: 6 }, () => rnd() * 6.3);
    // Rauschen in Koordinaten der früheren, halb so hohen Karte (ly), damit alte Spielstände dasselbe Gelände haben (RM-FR-MAP-12)
    for (const r of ranges) {
      // Tiefe wie früher: Nordrand ab Reihe 0 der alten Karte, Südrand bis zu ihrem Ende; darüber hinaus (neue Streifen) tiefer im Gebirge
      const oy0 = r.edge === 'N' ? ROW0 : r.y0, oy1 = r.edge === 'S' ? ROW0 + 64 : r.y1;
      for (let y = r.y0; y < r.y1; y++) {
        const ly = y - ROW0;
        for (let x = r.x0; x < r.x1; x++) {
          const depth = r.edge === 'N' ? 1 - (y - oy0) / (oy1 - oy0) : (y - oy0) / (oy1 - oy0);
          const n = Math.sin(x * 0.21 + ph[0]) * 0.25 + Math.sin(x * 0.07 + ly * 0.3 + ph[1]) * 0.2 + Math.sin(ly * 0.5 + ph[2]) * 0.1;
          const side = Math.min(1, (x - r.x0) / 8, (r.x1 - x) / 8);
          if (depth * side + n > M.rockLevel) T[this.key(x, y)] = ROCK;
        }
      }
    }
    // Seen
    for (const l of M.lakes) {
      for (let y = l.y - l.ry - 2; y <= l.y + l.ry + 2; y++) {
        for (let x = l.x - l.rx - 2; x <= l.x + l.rx + 2; x++) {
          if (!this.inside(x, y)) continue;
          const d = ((x - l.x) / l.rx) ** 2 + ((y - l.y) / l.ry) ** 2 + Math.sin(x * 1.3 + (y - ROW0) * 0.7) * 0.15;
          if (d <= 1) T[this.key(x, y)] = WATER;
        }
      }
    }
    // Flüsse (quer zur Strecke, von Nord nach Süd)
    for (const rv of M.rivers) {
      for (let y = 0; y < this.h; y++) {
        const ly = y - ROW0;
        const c = rv.x + rv.a * Math.sin(ly * 0.14 + rv.x) + rv.b * Math.sin(ly * 0.05 + 1);
        for (let x = Math.floor(c - 3); x <= Math.ceil(c + 3); x++) {
          if (this.inside(x, y) && !core(x) && Math.abs(x - c) <= rv.w) T[this.key(x, y)] = WATER;
        }
      }
    }
    // Startgebiet und alte Karte flach halten
    // (andere Karten: nur ein Band um die Strecke, damit die Berge bleiben)
    const band = M.id === 'donau' || (M.id.startsWith('eigen-') && M.base === 'donau') ? 99 : 9;
    for (let y = 0; y < this.h; y++) {
      if (Math.abs(y - MAIN_ROW) > band) continue;
      for (let x = CORE.x0; x <= CORE.x1; x++) T[this.key(x, y)] = GRASS;
    }
  }

  /** Netzbetreiber elektrifiziert alle Streckengleise (fest verlegte Gleise) */
  electrifyLine() {
    this.cells.forEach((c, k) => { if (c.fixed && c.track && !this.industryCells.has(k)) c.wire = true; });
    for (const id of this.fixedPieces) for (const k of this.pieceCells(this.pieces.get(id)!)) this.cells[k].wire = true;
  }

  /** Zelle gehört zu einer Kreuzungsstelle des Netzbetreibers */
  isLoopCell(x: number, y: number) {
    if (y !== MAIN_ROW && y !== SECOND_ROW) return false;
    const loop = PASSING_LOOPS.find(([a, b]) => x >= a && x <= b + 2);
    // nach dem zweigleisigen Ausbau: abgebaute Kreuzungsstellen sind normale Strecke
    return !!loop && (!this.mainRows.includes(SECOND_ROW) || this.loopStanding(loop));
  }

  /** Kreuzungsstelle steht noch (Weichen des Netzbetreibers vorhanden) */
  loopStanding([a, b]: [number, number]) {
    const fixedAt = (x: number) => { const pc = this.get(x, MAIN_ROW)?.piece; return pc != null && this.fixedPieces.has(pc); };
    return fixedAt(a) || fixedAt(b);
  }

  /** nach dem Laden: Weichen der Kreuzungsstellen wieder als fest markieren */
  markFixedLoops() {
    for (const p of this.pieces.values()) {
      if (p.y === MAIN_ROW && PASSING_LOOPS.some(([a, b]) => (p.x === a && p.key === 'xover_down') || (p.x === b && p.key === 'xover_up'))) this.fixedPieces.add(p.id);
    }
  }

  /** Kreuzungsstellen: kurzes zweites Gleis mit Weichen und Signalen (nur wo Platz ist) */
  addPassingLoops() {
    for (const [xa, xb] of PASSING_LOOPS) {
      let free = true;
      for (let x = xa; x <= xb + 2 && free; x++) {
        for (const y of [MAIN_ROW, SECOND_ROW]) {
          const c = this.get(x, y)!;
          if (c.piece !== null || c.building !== null || c.platform || this.isOwned(x, y) || (y === SECOND_ROW && c.track && !c.fixed)) free = false;
        }
      }
      if (!free) continue;
      const p1 = this.addPiece('xover_down', xa, MAIN_ROW);
      const p2 = this.addPiece('xover_up', xb, MAIN_ROW);
      this.fixedPieces.add(p1.id).add(p2.id);
      for (let x = xa; x <= xb + 2; x++) {
        const c = this.get(x, SECOND_ROW)!;
        Object.assign(c, { track: true, fixed: true });
      }
      for (const y of [MAIN_ROW, SECOND_ROW]) {
        this.get(xb - 1, y)!.signal = true;
        this.get(xa + 3, y)!.signalW = true;
      }
    }
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
  expandLine(wire = false) {
    if (this.mainRows.includes(SECOND_ROW)) return;
    let blocked = 0;
    for (let x = 0; x < this.w; x++) {
      const c = this.get(x, SECOND_ROW)!;
      if (this.isOwned(x, SECOND_ROW)) {
        // auf eigenem Gelände: freie Felder gleich mitverlegen (gehört dann dir), Bahnsteige/Gebäude bleiben
        if (c.track || c.piece !== null) continue;
        if (c.platform || (c.building !== null && !this.buildings.get(c.building)?.decor)) { blocked++; continue; }
        if (c.building !== null) this.removeBuilding(c.building);
        c.track = true;
        c.wire = wire;
        continue;
      }
      if (c.building !== null) this.removeBuilding(c.building);
      Object.assign(c, { track: true, fixed: true, platform: false });
    }
    this.mainRows.push(SECOND_ROW);
    return blocked;
  }

  /**
   * Blocksignale des Netzbetreibers auf der zweigleisigen Strecke (Linksverkehr): alle 16 Felder ein Signal je Richtung,
   * nur auf freier Strecke (keine Weichen, Signale oder Bahnsteige in der Nähe) und außerhalb noch stehender Kreuzungsstellen. So können Züge dicht hintereinander fahren.
   * Liefert die Zahl neuer Signale.
   */
  addBlockSignals(): number {
    if (!this.mainRows.includes(SECOND_ROW)) return 0;
    let n = 0;
    for (let x = 8; x < this.w - 8; x += 16) {
      if (PASSING_LOOPS.some(([a, b]) => x >= a - 3 && x <= b + 5 && this.loopStanding([a, b]))) continue;
      for (const [y, east] of [[MAIN_ROW, true], [SECOND_ROW, false]] as const) {
        const c = this.get(x, y)!;
        if (!c.track || c.piece !== null || c.road || c.platform) continue;
        // freie Strecke: keine Weichen, Signale oder Bahnsteige in der Nähe (dein Bahnhof bleibt unangetastet)
        let busy = false;
        for (let d = -6; d <= 6 && !busy; d++) {
          const q = this.get(x + d, y);
          if (!q || !q.track || q.piece !== null || q.signal || q.signalW || q.siding || q.shunt) busy = true;
          for (const dy of [-1, 1]) if (this.get(x + d, y + dy)?.platform) busy = true;
        }
        if (busy) continue;
        if (east) c.signal = true; else c.signalW = true;
        n++;
      }
    }
    return n;
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

  /** öffentliche Straße (RM-FR-MAP-08): auf Wiese über die ganze Kartenhöhe, kreuzt die Strecke mit Bahnübergang */
  isPublicRoad(x: number, y: number) { return !!currentMap().roads?.includes(x) && !!this.get(x, y)?.road; }
  private addPublicRoads() {
    for (const x of currentMap().roads ?? []) {
      for (let y = 0; y < this.h; y++) {
        const c = this.get(x, y);
        if (!c || this.terrain[this.key(x, y)] !== GRASS || c.piece !== null || c.platform || c.building !== null) continue;
        c.road = true;
      }
    }
  }

  /** Hochbahn über der Zelle (RM-FR-MAP-11): 0 keine, 1 Fahrbahn oben (darunter Gleise erlaubt), 2 Pfeiler (blockiert) */
  viaductAt(x: number, y: number): 0 | 1 | 2 {
    for (const v of currentMap().viaducts ?? []) {
      if (x !== v.x || y < v.y0 || y > v.y1) continue;
      return v.piers.includes(y) ? 2 : 1;
    }
    return 0;
  }

  private free(x: number, y: number, w: number, h: number) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      if (this.viaductAt(x + dx, y + dy)) return false;
      const c = this.get(x + dx, y + dy);
      if (!c || c.track || c.piece !== null || c.road || c.building !== null || Math.abs(y + dy - MAIN_ROW - 0.5) < 3) return false;
      if (this.terrain[this.key(x + dx, y + dy)] !== GRASS) return false;
    }
    return true;
  }

  /** Berge, Bäume, Büsche und Dörfer */
  private generateLandscape() {
    let seed = currentMap().landscapeSeed;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const T = this.terrain;
    // Berge auf Fels: erst große, dann kleine, dann Felsbrocken
    const rockFree = (x: number, y: number, w: number, h: number) => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const c = this.get(x + dx, y + dy);
        if (!c || c.building !== null || c.track || c.piece !== null || T[this.key(x + dx, y + dy)] !== ROCK) return false;
      }
      return true;
    };
    for (const [key, w, h, tries] of [['bld_mtn0', 3, 3, 500], ['bld_mtn2', 3, 3, 400], ['bld_mtn1', 2, 2, 600], ['bld_mtn3', 2, 2, 600]] as const) {
      for (let i = 0; i < tries; i++) {
        const x = Math.floor(rnd() * this.w), y = Math.floor(rnd() * this.h);
        if (rockFree(x, y, w, h)) this.addBuilding(key, x, y, true);
      }
    }
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(rnd() * this.w), y = Math.floor(rnd() * this.h);
      if (rockFree(x, y, 1, 1) && rnd() < 0.5) this.addBuilding(rnd() < 0.5 ? 'bld_rock0' : 'bld_rock1', x, y, true);
    }
    // Wälder: dichte Flecken
    // Wälder abseits der Strecke, verteilt über die ganze Höhe (doppelt so viele Flecken wie auf der früheren, halb so hohen Karte)
    const north = MAIN_ROW - 9, south = MAIN_ROW + 10;
    const forests = Array.from({ length: Math.round((currentMap().forests * this.h) / 64) }, () => ({ x: rnd() * this.w, y: rnd() < 0.5 ? rnd() * north : south + rnd() * (this.h - south), r: 3 + rnd() * 7 }));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let p = 0.02;
        for (const f of forests) {
          const d = Math.hypot(x - f.x, (y - f.y) * 1.2);
          if (d < f.r) p = Math.max(p, 0.55 * (1 - d / f.r) + 0.1);
        }
        if (this.isOwned(x, y)) p *= 0.5;
        if (rnd() < p && this.free(x, y, 1, 1)) {
          const r = rnd();
          const trees = currentMap().trees;
          const key = trees ? trees[Math.floor(r * trees.length)] : r < 0.35 ? 'bld_pine0' : r < 0.5 ? 'bld_pine1' : r < 0.65 ? 'bld_tree0' : r < 0.78 ? 'bld_tree1' : r < 0.9 ? 'bld_tree2' : 'bld_bush0';
          this.addBuilding(key, x, y, true);
        }
      }
    }
    // Dörfer
    for (const v of currentMap().villages) {
      const n = currentMap().villageSize ?? 8, spread = n > 8 ? 1.5 : 1;
      for (let i = 0; i < n; i++) {
        const x = Math.round(v.x + (rnd() - 0.5) * 12 * spread), y = Math.round(v.y + (rnd() - 0.5) * 7 * spread);
        const hs = currentMap().houses;
        const key = hs ? hs[Math.floor(rnd() * hs.length)] : rnd() < 0.5 ? 'bld_houseA' : 'bld_houseB';
        const d = BUILDINGS[key];
        if (this.free(x, y, d.w, d.h) && !this.isOwned(x, y)) this.addBuilding(key, x, y, true);
      }
    }
  }
}

/** Dorfmitten der aktuellen Karte (auch Weiden für Kühe und Schafe liegen dort) */
export const villages = () => currentMap().villages;
