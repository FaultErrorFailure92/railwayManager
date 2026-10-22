import { MAP_W, TILE } from '../config';
import { isStation } from './buildings';
import type { Vec } from '../iso';
import { Grid } from './Grid';
import { PIECES, PortType } from './pieces';

export type Dir = 'E' | 'W';
export const isOut = (key: string) => key.startsWith('OUT');
/** Reihe einer Ein-/Ausfahrtskante, z.B. 'IN_E:16' -> 16 */
export const edgeRow = (key: string) => Number(key.split(':')[1]);

/** Port-Schlüssel: Fahrtrichtung + Gleislage + Position (Tile-Grenze x, Reihe y) */
const port = (dir: Dir, t: PortType, x: number, y: number) => `${dir}${t}:${x},${y}`;
const rowY = (y: number) => y * TILE + TILE / 2;

/** Durchgehende Bahnsteigkante entlang eines Gleises */
export interface StopRun {
  id: string;
  row: number;
  x0: number;
  x1: number;
  /** Länge in Tiles */
  len: number;
  /** Fahrgäste kommen vom Empfangsgebäude hin (direkt, Unterführung, Brücke) */
  accessible: boolean;
}

export type ParkKind = 'siding' | 'remise' | 'workshop';

/** Abstellplatz: zusammenhängende Abstellgleis-/Remisen-/Werkstattfelder */
export interface ParkRun {
  id: string;
  row: number;
  x0: number;
  x1: number;
  len: number;
  kind: ParkKind;
}

/** Richtungsgleis im Rangierbahnhof */
export interface SortRun {
  id: string;
  row: number;
  x0: number;
  x1: number;
  len: number;
  dest: number;
}

export interface Edge {
  key: string;
  dir: Dir;
  from: string;
  to: string;
  pts: Vec[];
  cum: number[];
  len: number;
  cells: number[];
  /** Blockabschnitt (-1 = außerhalb, nie belegt) */
  block: number;
  /** am Kantenende steht ein Signal für diese Fahrtrichtung */
  signalAtEnd: boolean;
  /** gesetzt auf der letzten Kante einer Bahnsteigkante (in Fahrtrichtung) */
  stopRun?: StopRun;
  /** gesetzt auf der letzten Kante eines Abstellplatzes (in Fahrtrichtung) */
  parkRun?: ParkRun;
  /** gesetzt auf der letzten Kante eines Richtungsgleises (in Fahrtrichtung) */
  sortRun?: SortRun;
  atPlatform: boolean;
  diverging: boolean;
  /** liegt (teilweise) im Verschubbereich */
  shunt?: boolean;
  /** Ladegleis eines Privatbahn-Betriebs */
  industry?: string;
  /** abzweigend über eine Schnellfahrweiche */
  fast: boolean;
  /** nicht gerade (Bogen, Diagonale, normaler Weichenabzweig) – für Hochgeschwindigkeitszüge gesperrt */
  curvy: boolean;
  /** komplett unter Oberleitung */
  electrified: boolean;
  wash: boolean;
  hump: boolean;
  /** Zellen, die der Zug tatsächlich befährt (für Oberleitung) */
  path: number[];
}

function makeEdge(key: string, dir: Dir, from: string, to: string, pts: Vec[], cells: number[], diverging = false): Edge {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { key, dir, from, to, pts, cum, len: cum[cum.length - 1], cells, block: -1, signalAtEnd: false, atPlatform: false, diverging,
    fast: false, curvy: false, electrified: true, wash: false, hump: false, path: cells };
}

/** Punkt auf einer Kante bei Distanz d (außerhalb wird linear verlängert) */
export function pointOnEdge(e: Edge, d: number): Vec {
  if (d <= 0) {
    const a = e.pts[0], b = e.pts[1];
    const l = e.cum[1] || 1;
    return { x: a.x + ((b.x - a.x) * d) / l, y: a.y + ((b.y - a.y) * d) / l };
  }
  if (d >= e.len) {
    const n = e.pts.length;
    const a = e.pts[n - 2], b = e.pts[n - 1];
    const l = e.cum[n - 1] - e.cum[n - 2] || 1;
    const over = d - e.len;
    return { x: b.x + ((b.x - a.x) * over) / l, y: b.y + ((b.y - a.y) * over) / l };
  }
  let lo = 0, hi = e.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (e.cum[m] <= d) lo = m; else hi = m;
  }
  const t = (d - e.cum[lo]) / (e.cum[hi] - e.cum[lo] || 1);
  const a = e.pts[lo], b = e.pts[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export class Network {
  readonly edges = new Map<string, Edge>();
  readonly out = new Map<string, Edge[]>();
  /** Block-Id je Zelle (-1 = kein Gleis) */
  readonly blockOf: Int32Array;
  readonly blockCells = new Map<number, number[]>();
  readonly runs: StopRun[] = [];
  readonly parkRuns: ParkRun[] = [];
  readonly sortRuns: SortRun[] = [];
  /** Bahnsteigfelder mit Zugang vom Empfangsgebäude */
  readonly accessible = new Set<number>();
  /** Einfahrten je Streckengleis und Richtung */
  readonly entries: Edge[] = [];
  /** physischer Port -> Zellen der angrenzenden Kanten (für Blockbildung) */
  private portCells = new Map<string, number[]>();

  constructor(readonly grid: Grid) {
    this.blockOf = new Int32Array(grid.w * grid.h).fill(-1);
    this.build();
  }

  private add(e: Edge) {
    this.edges.set(e.key, e);
    if (!this.out.has(e.from)) this.out.set(e.from, []);
    this.out.get(e.from)!.push(e);
  }

  /** legt eine Gleisverbindung für beide Fahrtrichtungen an (pts in +x-Richtung) */
  private addBoth(key: string, a: { t: PortType; x: number; y: number }, b: { t: PortType; x: number; y: number },
    pts: Vec[], cells: number[], diverging = false, fast = false, curvy = false) {
    const e = makeEdge(`${key}>`, 'E', port('E', a.t, a.x, a.y), port('E', b.t, b.x, b.y), pts, cells, diverging);
    const w = makeEdge(`${key}<`, 'W', port('W', b.t, b.x, b.y), port('W', a.t, a.x, a.y), [...pts].reverse(), cells, diverging);
    // befahrene Zellen aus der Geometrie
    const g = this.grid, trav = new Set<number>();
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[Math.min(i + 1, pts.length - 1)];
      for (let t = 0; t <= 1; t += 0.25) {
        const x = Math.floor((p0.x + (p1.x - p0.x) * t - 0.01 * Math.sign(p1.x - p0.x)) / TILE);
        const y = Math.floor((p0.y + (p1.y - p0.y) * t) / TILE);
        if (g.inside(x, y)) trav.add(g.key(x, y));
      }
    }
    const path = [...trav].filter((k) => cells.includes(k));
    const el = path.every((k) => g.cells[k].wire);
    e.path = w.path = path;
    e.electrified = w.electrified = el;
    e.fast = w.fast = fast;
    e.curvy = w.curvy = curvy;
    this.add(e);
    this.add(w);
    for (const p of [`${a.t}:${a.x},${a.y}`, `${b.t}:${b.x},${b.y}`]) {
      if (!this.portCells.has(p)) this.portCells.set(p, []);
      this.portCells.get(p)!.push(...cells);
    }
    return { e, w };
  }

  private build() {
    const g = this.grid;
    const right = MAP_W * TILE;

    // --- Ein-/Ausfahrten an jedem Streckengleis, das bis zu beiden Kartenrändern reicht
    for (const r of g.mainRows) {
      if (!g.get(0, r)?.track || !g.get(g.w - 1, r)?.track) continue;
      const my = rowY(r);
      const inE = makeEdge(`IN_E:${r}`, 'E', `IN_E:${r}`, port('E', 'S', 0, r), [{ x: -160, y: my }, { x: 0, y: my }], []);
      const inW = makeEdge(`IN_W:${r}`, 'W', `IN_W:${r}`, port('W', 'S', MAP_W, r), [{ x: right + 160, y: my }, { x: right, y: my }], []);
      inE.signalAtEnd = inW.signalAtEnd = true;
      this.add(inE);
      this.add(inW);
      this.entries.push(inE, inW);
      this.add(makeEdge(`OUT_E:${r}`, 'E', port('E', 'S', MAP_W, r), `OUT_E:${r}`, [{ x: right, y: my }, { x: right + 400, y: my }], []));
      this.add(makeEdge(`OUT_W:${r}`, 'W', port('W', 'S', 0, r), `OUT_W:${r}`, [{ x: 0, y: my }, { x: -400, y: my }], []));
    }

    // --- gerade Gleise
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.get(x, y)!;
        if (!c.track || c.piece !== null) continue;
        const { e, w } = this.addBoth(`p:${x},${y}`, { t: 'S', x, y }, { t: 'S', x: x + 1, y },
          [{ x: x * TILE, y: rowY(y) }, { x: (x + 1) * TILE, y: rowY(y) }], [g.key(x, y)]);
        e.signalAtEnd = c.signal;
        w.signalAtEnd = c.signalW;
        const bkey = c.building !== null ? g.buildings.get(c.building)?.key : undefined;
        e.wash = w.wash = bkey === 'bld_wash';
        e.hump = w.hump = bkey === 'bld_hump';
      }
    }

    // --- Gleisteile
    for (const p of g.pieces.values()) {
      const d = PIECES[p.key];
      const cells = g.pieceCells(p);
      d.paths.forEach((lp, i) => {
        this.addBoth(`q:${p.id}:${i}`,
          { t: lp.from.t, x: p.x + lp.from.dx, y: p.y + lp.from.dy },
          { t: lp.to.t, x: p.x + lp.to.dx, y: p.y + lp.to.dy },
          lp.pts.map((v) => ({ x: v.x + p.x * TILE, y: v.y + p.y * TILE })), cells, lp.diverging, !!d.fast && lp.diverging,
          lp.from.t !== 'S' || lp.to.t !== 'S' || (lp.diverging && !d.fast));
      });
    }

    // --- Ladegleise der Privatbahn-Betriebe, Verschubbereiche
    for (const e of this.edges.values()) {
      if (e.cells.some((k) => g.cells[k].shunt)) e.shunt = true;
      const id = e.cells.length ? g.industryCells.get(e.cells[0]) : undefined;
      if (id && e.cells.every((k) => g.industryCells.get(k) === id)) e.industry = id;
    }

    // --- Blöcke: Zellen, die über Ports verbunden sind; Signale trennen
    const parent = new Int32Array(g.w * g.h).map((_, i) => i);
    const find = (a: number): number => {
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
      return a;
    };
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    for (const e of this.edges.values()) for (const k of e.cells) union(k, e.cells[0]);
    // Abstell-, Richtungsgleise und Abrollberg bilden eigene Abschnitte (wie mit Gleissperre gesichert)
    const cls = (k: number) => {
      const c = g.cells[k];
      if (c.sortDest !== null) return `sort${c.sortDest}`;
      const bk = c.building !== null ? g.buildings.get(c.building)?.key : undefined;
      if (bk === 'bld_hump') return 'hump';
      if (bk === 'bld_remise' || bk === 'bld_workshop') return `park${c.building}`;
      return c.siding ? 'siding' : c.shunt ? 'shunt' : 'n';
    };
    for (const [pk, cells] of this.portCells) {
      if (pk.startsWith('S:')) {
        const [x, y] = pk.slice(2).split(',').map(Number);
        if (g.get(x - 1, y)?.signal || g.get(x, y)?.signalW) continue;
      }
      const groups = new Map<string, number>();
      for (const k of cells) {
        const c = cls(k);
        const first = groups.get(c);
        if (first === undefined) groups.set(c, k); else union(k, first);
      }
    }
    const used = new Set<number>();
    for (const e of this.edges.values()) e.cells.forEach((k) => used.add(k));
    for (const k of used) {
      const b = find(k);
      this.blockOf[k] = b;
      if (!this.blockCells.has(b)) this.blockCells.set(b, []);
      this.blockCells.get(b)!.push(k);
    }
    for (const e of this.edges.values()) if (e.cells.length) e.block = this.blockOf[e.cells[0]];

    this.computeAccess();

    // --- Läufe entlang gerader Gleise: Bahnsteigkanten, Abstellplätze, Richtungsgleise
    const plain = (x: number, y: number) => { const c = g.get(x, y); return !!c && c.track && c.piece === null; };
    const scan = <T>(classify: (x: number, y: number) => string | null, make: (x0: number, x1: number, y: number, cls: string) => T,
      attach: (run: T, x0: number, x1: number, y: number) => void) => {
      for (let y = 0; y < g.h; y++) {
        let x0 = -1, cls: string | null = null;
        for (let x = 0; x <= g.w; x++) {
          const c = plain(x, y) ? classify(x, y) : null;
          if (x0 >= 0 && c !== cls) {
            const run = make(x0, x - 1, y, cls!);
            attach(run, x0, x - 1, y);
            x0 = -1;
          }
          if (c !== null && x0 < 0) { x0 = x; cls = c; }
        }
      }
    };
    const ends = (x0: number, x1: number, y: number) => ({ e: this.edges.get(`p:${x1},${y}>`)!, w: this.edges.get(`p:${x0},${y}<`)! });

    scan((x, y) => (g.get(x, y - 1)?.platform || g.get(x, y + 1)?.platform ? 'p' : null),
      (x0, x1, y) => {
        let acc = false;
        for (let x = x0; x <= x1; x++) for (const yy of [y - 1, y + 1]) if (g.inside(x, yy) && this.accessible.has(g.key(x, yy))) acc = true;
        return { id: `${x0},${y}`, row: y, x0, x1, len: x1 - x0 + 1, accessible: acc } as StopRun;
      },
      (run, x0, x1, y) => {
        this.runs.push(run);
        for (let x = x0; x <= x1; x++) {
          this.edges.get(`p:${x},${y}>`)!.atPlatform = true;
          this.edges.get(`p:${x},${y}<`)!.atPlatform = true;
        }
        const { e, w } = ends(x0, x1, y);
        e.stopRun = w.stopRun = run;
      });

    scan((x, y) => {
      const c = g.get(x, y)!;
      const bk = c.building !== null ? g.buildings.get(c.building)?.key : undefined;
      if (bk === 'bld_remise') return 'remise';
      if (bk === 'bld_workshop') return 'workshop';
      return c.siding ? 'siding' : null;
    },
    (x0, x1, y, kind) => ({ id: `${x0},${y}`, row: y, x0, x1, len: x1 - x0 + 1, kind: kind as ParkKind }),
    (run, x0, x1, y) => {
      this.parkRuns.push(run);
      const { e, w } = ends(x0, x1, y);
      e.parkRun = w.parkRun = run;
    });

    scan((x, y) => { const d = g.get(x, y)!.sortDest; return d === null ? null : String(d); },
      (x0, x1, y, d) => ({ id: `${x0},${y}`, row: y, x0, x1, len: x1 - x0 + 1, dest: Number(d) }),
      (run, x0, x1, y) => {
        this.sortRuns.push(run);
        const { e, w } = ends(x0, x1, y);
        e.sortRun = w.sortRun = run;
      });
  }

  /** Bahnsteige mit Zugang: direkt am Empfangsgebäude, oder per Unterführung/Brücke damit verbunden */
  private computeAccess() {
    const g = this.grid;
    const cluster = new Int32Array(g.w * g.h).fill(-1);
    let n = 0;
    g.cells.forEach((c, k) => {
      if (!c.platform || cluster[k] >= 0) return;
      const stack = [k];
      cluster[k] = n;
      while (stack.length) {
        const cur = stack.pop()!;
        const { x, y } = g.xy(cur);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!g.inside(nx, ny)) continue;
          const nk = g.key(nx, ny);
          if (g.cells[nk].platform && cluster[nk] < 0) { cluster[nk] = n; stack.push(nk); }
        }
      }
      n++;
    });
    const open = new Set<number>();
    for (const b of g.buildings.values()) {
      if (!isStation(b.key)) continue;
      for (const k of g.buildingCells(b)) {
        const { x, y } = g.xy(k);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (g.inside(x + dx, y + dy)) { const c = cluster[g.key(x + dx, y + dy)]; if (c >= 0) open.add(c); }
        }
      }
    }
    // Zugänge verbinden die Bahnsteige an beiden Enden
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of g.links.values()) {
        const a = cluster[g.key(l.x, l.y0)], b = cluster[g.key(l.x, l.y1)];
        if (a < 0 || b < 0) continue;
        if (open.has(a) !== open.has(b)) { open.add(a); open.add(b); changed = true; }
      }
    }
    g.cells.forEach((_, k) => { if (cluster[k] >= 0 && open.has(cluster[k])) this.accessible.add(k); });
  }

  /** Gegenstück einer Kante in Gegenrichtung (Ein-/Ausfahrt: Einfahrt Ost <-> Ausfahrt West) */
  twin(e: Edge): Edge | undefined {
    const k = e.key;
    if (k.endsWith('>')) return this.edges.get(k.slice(0, -1) + '<');
    if (k.endsWith('<')) return this.edges.get(k.slice(0, -1) + '>');
    const r = k.split(':')[1];
    const map: Record<string, string> = { IN_E: 'OUT_W', IN_W: 'OUT_E', OUT_E: 'IN_W', OUT_W: 'IN_E' };
    return this.edges.get(`${map[k.split(':')[0]]}:${r}`);
  }

  /** Wege von einem Port bis zu einer Kante, die `goal` erfüllt (z.B. Bahnsteigkante), auch in Stumpfgleise */
  pathsTo(from: string, goal: (e: Edge) => boolean, electric = false, limit = 200): Edge[][] {
    const res: Edge[][] = [];
    const stack: Edge[] = [];
    const dfs = (p: string) => {
      if (res.length >= limit || stack.length > 400 || isOut(p)) return;
      for (const e of this.out.get(p) ?? []) {
        if (electric && !e.electrified) continue;
        stack.push(e);
        if (goal(e)) res.push([...stack]);
        dfs(e.to);
        stack.pop();
      }
    };
    dfs(from);
    return res;
  }

  /** Alle Wege von einem Port bis zur Ausfahrt (begrenzt) */
  private pathCache = new Map<string, Edge[][]>();

  paths(from: string, electric = false, limit = 300): Edge[][] {
    const ck = `${from}|${electric}`;
    const cached = this.pathCache.get(ck);
    if (cached) return cached;
    const res: Edge[][] = [];
    const stack: Edge[] = [];
    const dfs = (p: string) => {
      if (res.length >= limit || stack.length > 400) return;
      if (isOut(p)) { res.push([...stack]); return; }
      const outs = this.out.get(p);
      if (!outs) return;
      for (const e of [...outs].sort((a, b) => Number(a.diverging) - Number(b.diverging))) {
        if (electric && !e.electrified) continue;
        stack.push(e);
        dfs(e.to);
        stack.pop();
      }
    };
    dfs(from);
    this.pathCache.set(ck, res);
    return res;
  }
}
