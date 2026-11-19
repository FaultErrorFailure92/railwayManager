import { currentMap } from '../world/maps';
import { MAP_W, TILE } from '../config';
import type { Game } from '../game/Game';
import { fmtTime } from '../game/Game';
import type { Train } from '../sim/Simulation';
import { BUILDINGS } from '../world/buildings';
import { pointOnEdge } from '../world/Network';
import { connectionsAtRisk, plannedConnections } from '../game/Connections';
import { baseDeparture, dispoConflicts, dispoSlots } from '../game/Disposition';

/** Weg-Zeit-Diagramm: Strecke waagrecht (West → Ost), Zeit senkrecht (oben früher, unten später) */
const PAST = 60 * 60, FUTURE = 120 * 60;

interface Trace { color: string; number: string; pts: [number, number][] }

export class Timetable {
  private traces = new Map<number, Trace>();
  private lastSample = 0;

  constructor(private g: Game) {}

  /** Positionen der fahrenden Züge mitschreiben (jede Spielminute) */
  sample() {
    const sim = this.g.sim;
    if (sim.time - this.lastSample < 60) return;
    this.lastSample = sim.time;
    for (const t of sim.trains) {
      if (t.deco || t.state === 'rolling' || t.state === 'stored' || t.state === 'queued' || !t.route.length) continue;
      const { i, d } = sim.posOnTrain(t, 0);
      const e = t.route[i];
      if (!e) continue;
      const p = pointOnEdge(e, d);
      const x = Math.max(0, Math.min(MAP_W, p.x / TILE));
      let tr = this.traces.get(t.id);
      if (!tr) { tr = { color: t.op.color, number: t.number, pts: [] }; this.traces.set(t.id, tr); }
      tr.pts.push([sim.time, x]);
    }
    for (const [id, tr] of this.traces) {
      while (tr.pts.length && tr.pts[0][0] < sim.time - PAST - 600) tr.pts.shift();
      if (!tr.pts.length) this.traces.delete(id);
    }
  }

  /** Planlinie eines Zuges */
  private planned(t: Train): [number, number][] {
    const from = t.dir === 'E' ? 0 : MAP_W, to = t.dir === 'E' ? MAP_W : 0;
    if (!(t.op.turnback || t.ends) || t.transit) return [[t.plannedSpawn, from], [t.plannedExit, to]];
    // Wendezug: bis zum Bahnhof (Kartenmitte) und zurück
    const st = this.g.stations()[0];
    const sx = st ? st.x + 1.5 : MAP_W / 2;
    const half = (t.plannedExit - t.plannedSpawn - t.layover * 60) / 2;
    return [[t.plannedSpawn, from], [t.plannedSpawn + half, sx], [t.plannedSpawn + half + t.layover * 60, sx], [t.plannedExit, from]];
  }

  private off?: HTMLCanvasElement;

  /** Disposition (RM-FR-OPS-12): gewählter Zug und Vorschau beim Ziehen */
  sel?: number;
  drag?: { id: number; lane?: string | null; dep?: number };
  private hits: { id: number; x: number; ya: number; yb: number; locked: boolean }[] = [];
  private geo?: { T: number; B: number; H: number; t0: number; t1: number; lanes: { id?: string; x: number }[]; lw: number };

  /** Zug an dieser Stelle (Canvas-Pixel) */
  pick(px: number, py: number) {
    const x = px / 2, y = py / 2;
    let best: { id: number; d: number } | undefined;
    for (const h of this.hits) {
      const d = Math.abs(h.x - x);
      if (d <= 4 && y >= h.ya - 3 && y <= h.yb + 3 && (!best || d < best.d)) best = { id: h.id, d };
    }
    return best?.id;
  }

  /** Bahnsteig-Spalte (null = automatisch) unter dieser Stelle */
  laneAt(px: number): string | null | undefined {
    const g = this.geo;
    if (!g) return undefined;
    const x = px / 2;
    const l = g.lanes.find((ln) => Math.abs(ln.x - x) <= g.lw / 2);
    return l ? l.id ?? null : undefined;
  }

  /** Spielzeit an dieser Höhe */
  timeAt(py: number) {
    const g = this.geo!;
    return g.t0 + ((py / 2 - g.T) / (g.H - g.T - g.B)) * (g.t1 - g.t0);
  }

  isLocked(id: number) { return !!this.hits.find((h) => h.id === id)?.locked; }

  /** gezeichneter Look: Papier, Bleistift-Raster, wackelige Tintenlinien – halbe Auflösung, pixelig hochskaliert */
  draw(canvas: HTMLCanvasElement) {
    const S = 2;
    const W = Math.floor(canvas.width / S), H = Math.floor(canvas.height / S);
    if (!this.off || this.off.width !== W) { this.off = document.createElement('canvas'); this.off.width = W; this.off.height = H; }
    const ctx = this.off.getContext('2d')!;
    const L = 34, T = 18, R = 8, B = 8;
    const now = this.g.sim.time, t0 = now - PAST, t1 = now + FUTURE;
    // Hauptbahnhof breiter zeichnen, damit die Gleisbelegung (eine Spalte je Bahnsteig) Platz hat
    const stA = this.g.stations()[0];
    const sa = stA ? Math.max(0, stA.x - 2) : MAP_W / 2, sb = stA ? Math.min(MAP_W, stA.x + BUILDINGS[stA.key].w + 2) : MAP_W / 2;
    const span = W - L - R;
    const ws = stA ? Math.max(span * (sb - sa) / MAP_W, Math.min(span * 0.4, 20 * (this.g.platformRuns().length + 1))) : 0;
    const k = (span - ws) / Math.max(1, MAP_W - (sb - sa));
    const X = (x: number) => x <= sa ? L + x * k : x >= sb ? L + sa * k + ws + (x - sb) * k : L + sa * k + ((x - sa) / Math.max(0.01, sb - sa)) * ws;
    const Y = (t: number) => T + ((t - t0) / (t1 - t0)) * (H - T - B);
    // fester Zufall je Linie, damit nichts flackert
    const jit = (seed: number) => { let s2 = seed * 9301 + 49297; return () => { s2 = (s2 * 9301 + 49297) % 233280; return s2 / 233280 - 0.5; }; };
    const wobbly = (pts: [number, number][], seed: number, amp: number) => {
      const r = jit(seed);
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        if (!i) { ctx.moveTo(x, y); return; }
        const [px, py] = pts[i - 1];
        const n = Math.max(1, Math.round(Math.hypot(x - px, y - py) / 6));
        for (let k = 1; k <= n; k++) {
          const f = k / n;
          ctx.lineTo(px + (x - px) * f + (k < n ? r() * amp : 0), py + (y - py) * f + (k < n ? r() * amp : 0));
        }
      });
      ctx.stroke();
    };
    // Papier
    ctx.fillStyle = '#efe4c8';
    ctx.fillRect(0, 0, W, H);
    const pr = jit(7);
    for (let i = 0; i < W * H / 40; i++) {
      ctx.fillStyle = pr() > 0 ? 'rgba(160,130,80,0.10)' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(Math.floor((pr() + 0.5) * W), Math.floor((pr() + 0.5) * H), 1, 1);
    }
    ctx.font = '10px VT323, monospace';
    ctx.textBaseline = 'middle';
    // Bahnhöfe: schraffierte Bänder
    for (const st of this.g.stations()) {
      const w = BUILDINGS[st.key].w;
      const xa = X(st.x - 2), xb = X(st.x + w + 2);
      ctx.strokeStyle = 'rgba(60,90,150,0.35)';
      ctx.lineWidth = 1;
      for (let y = T; y < H - B; y += 4) { ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y + 3); ctx.stroke(); }
      ctx.fillStyle = '#2a3f6e';
      ctx.textAlign = 'center';
      ctx.fillText(`${st.name ?? 'Bahnhof'} (${this.g.stationCode(st)})`, (xa + xb) / 2, T - 8);
    }
    ctx.fillStyle = '#6b5a3c';
    ctx.textAlign = 'left'; ctx.fillText(`← ${currentMap().ends[0]} (West)`, L, T - 8);
    ctx.textAlign = 'right'; ctx.fillText(`${currentMap().ends[1]} (Ost) →`, W - R, T - 8);
    // Zeitraster in Bleistift
    for (let m = Math.ceil(t0 / 1800) * 1800; m <= t1; m += 1800) {
      ctx.strokeStyle = m % 3600 === 0 ? 'rgba(90,80,60,0.45)' : 'rgba(90,80,60,0.2)';
      ctx.lineWidth = 1;
      wobbly([[L, Y(m)], [W - R, Y(m)]], m, 0.6);
      ctx.fillStyle = '#5a4a30';
      ctx.textAlign = 'right';
      ctx.fillText(fmtTime(m), L - 3, Y(m));
    }
    ctx.strokeStyle = 'rgba(90,80,60,0.6)';
    wobbly([[L, T], [L, H - B]], 3, 0.5);
    // Planlinien: dünn, gestrichelt
    const sim = this.g.sim;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    for (const t of [...sim.queue, ...sim.trains]) {
      if (t.deco || t.op.kind === 'sort' || t.state === 'rolling' || t.state === 'stored') continue;
      const pts = this.planned(t);
      if (pts[pts.length - 1][0] < t0 || pts[0][0] > t1) continue;
      ctx.strokeStyle = t.op.color;
      ctx.globalAlpha = 0.55;
      wobbly(pts.map(([tt, x]) => [X(x), Y(tt)]), t.id, 0.8);
      ctx.globalAlpha = 1;
      if (t.state === 'queued') {
        ctx.fillStyle = t.op.color;
        ctx.textAlign = t.dir === 'E' ? 'left' : 'right';
        ctx.fillText(t.number, X(pts[0][1]) + (t.dir === 'E' ? 3 : -3), Y(pts[0][0]) - 5);
      }
    }
    ctx.setLineDash([]);
    // Anschlüsse am Bahnhof (RM-FR-OPS-13): Klammer von Ankunft (Zubringer) bis Abfahrt (Anschlusszug)
    const st0 = this.g.stations()[0];
    if (st0) {
      const cx = X(st0.x + BUILDINGS[st0.key].w + 2) + 3;
      const risk = new Set(connectionsAtRisk(this.g).map((c) => `${c.from.id}>${c.to.id}`));
      const marks: { arr: number; dep: number; col: string; label: string }[] = [];
      for (const c of plannedConnections(this.g)) {
        const k = `${c.from.id}>${c.to.id}`;
        if (this.g.connResults.has(k)) continue;
        marks.push({ arr: c.arr, dep: c.dep, col: risk.has(k) ? '#d9822b' : '#2e7d32', label: `${c.from.number}→${c.to.number}` });
      }
      for (const r of this.g.connResults.values()) marks.push({ arr: r.arr, dep: r.dep, col: r.ok ? '#2e7d32' : '#c0392b', label: r.ok ? '✓' : '✗' });
      let lane = 0;
      for (const m of marks.sort((a, b) => a.arr - b.arr)) {
        if (m.dep < t0 || m.arr > t1) continue;
        const x = cx + (lane++ % 4) * 4, ya = Y(m.arr), yb = Y(m.dep);
        ctx.strokeStyle = m.col;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 3, ya); ctx.lineTo(x, ya); ctx.lineTo(x, yb); ctx.lineTo(x - 3, yb); ctx.stroke();
        ctx.fillStyle = m.col;
        ctx.fillRect(x - 1, yb - 1, 3, 3);
        if (m.label.length <= 2) { ctx.textAlign = 'left'; ctx.fillText(m.label, x + 3, (ya + yb) / 2); }
      }
    }
    // Disposition: Gleisbelegung am Bahnhof, eine Spalte je Bahnsteig (+ automatisch)
    this.hits = [];
    if (st0) {
      const runs = this.g.platformRuns();
      const xa = X(st0.x - 2), xb = X(st0.x + BUILDINGS[st0.key].w + 2);
      const ids: (string | undefined)[] = [undefined, ...runs.map((r) => r.id)];
      const lw = (xb - xa) / ids.length;
      const lanes = ids.map((id, i) => ({ id, x: xa + (i + 0.5) * lw }));
      this.geo = { T, B, H, t0, t1, lanes, lw };
      ctx.fillStyle = 'rgba(239,228,200,0.85)';
      ctx.fillRect(xa + 1, T, xb - xa - 2, H - B - T);
      ctx.strokeStyle = 'rgba(60,90,150,0.25)'; ctx.lineWidth = 1;
      lanes.forEach((ln) => { ctx.beginPath(); ctx.moveTo(Math.round(ln.x) + 0.5, T); ctx.lineTo(Math.round(ln.x) + 0.5, H - B - 9); ctx.stroke(); });
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2a3f6e';
      lanes.forEach((ln, i) => ctx.fillText(i ? String(i) : 'A', ln.x, H - B - 4));
      const slots = dispoSlots(this.g);
      const bad = new Set<number>();
      const conf = dispoConflicts(this.g, slots);
      conf.forEach((c) => { bad.add(c.a.id); bad.add(c.b.id); });
      for (const sl of slots) {
        const dr = this.drag?.id === sl.t.id ? this.drag : undefined;
        const auto = dr?.lane !== undefined && !sl.alight ? dr.lane === null : !sl.platform;
        const pl = dr?.lane !== undefined && !sl.alight ? dr.lane ?? undefined : sl.platform ?? sl.guess;
        const ln = lanes.find((l) => l.id === pl) ?? lanes[0];
        const dep = (!sl.alight && dr?.dep) || sl.dep;
        if (dep < t0 || sl.arr > t1) continue;
        const x = Math.round(ln.x), ya = Y(sl.arr), yb = Y(dep);
        if (!sl.alight) this.hits.push({ id: sl.t.id, x, ya, yb, locked: sl.locked });
        const on = this.sel === sl.t.id;
        if (on) { ctx.fillStyle = '#3a2e1c'; ctx.fillRect(x - 3, ya - 1, 7, yb - ya + 2); }
        ctx.fillStyle = sl.t.op.color;
        if (sl.alight) ctx.globalAlpha = 0.45;
        if (auto && !dr) {
          // automatisch: nur voraussichtlich – hohl gezeichnet
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x - 2, ya, 5, Math.max(2, yb - ya));
          ctx.globalAlpha = 1;
          ctx.fillRect(x - 2, ya, 1, Math.max(2, yb - ya)); ctx.fillRect(x + 2, ya, 1, Math.max(2, yb - ya)); ctx.fillRect(x - 2, ya, 5, 1);
        } else ctx.fillRect(x - 2, ya, 5, Math.max(2, yb - ya));
        ctx.globalAlpha = 1;
        // zurückgehalten: Wartezeit schraffiert
        const base = baseDeparture(this.g, sl.t);
        if (dep > base + 30) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          for (let y = Y(Math.max(base, sl.arr)); y < yb; y += 3) ctx.fillRect(x - 2, y, 5, 1);
        }
        if (bad.has(sl.t.id)) { ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, ya - 1.5, 8, yb - ya + 3); }
        ctx.fillStyle = '#3a2e1c';
        ctx.fillRect(x - 3, yb, 7, 1);
        if (on || dr) { ctx.textAlign = 'left'; ctx.fillText(`${sl.t.number} ${fmtTime(dep)}`, x + 5, yb); }
      }
      // Konflikte: rote Kreuze
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
      for (const c of conf) {
        const h = this.hits.find((x) => x.id === c.b.id);
        if (!h) continue;
        const y = Y(c.at);
        ctx.beginPath(); ctx.moveTo(h.x - 6, y - 3); ctx.lineTo(h.x - 12, y + 3); ctx.moveTo(h.x - 12, y - 3); ctx.lineTo(h.x - 6, y + 3); ctx.stroke();
      }
    }
    // tatsächlich gefahren: kräftige Tinte
    ctx.lineWidth = 2;
    for (const [id, tr] of this.traces) {
      if (tr.pts.length < 2) continue;
      ctx.strokeStyle = tr.color;
      wobbly(tr.pts.map(([tt, x]) => [X(x), Y(tt)]), id + 99, 0.7);
    }
    for (const t of sim.trains) {
      const tr = this.traces.get(t.id);
      if (!tr?.pts.length) continue;
      const [, x] = tr.pts[tr.pts.length - 1];
      ctx.fillStyle = t.op.color;
      ctx.fillRect(Math.round(X(x)) - 2, Math.round(Y(now)) - 2, 5, 5);
      ctx.fillStyle = '#3a2e1c';
      ctx.textAlign = 'left';
      ctx.fillText(t.number, X(x) + 4, Y(now) + 6);
    }
    // jetzt: Rotstift
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.5;
    wobbly([[L, Y(now)], [W - R, Y(now)]], 11, 0.8);
    ctx.fillStyle = '#c0392b';
    ctx.textAlign = 'right';
    ctx.fillText('jetzt', W - R - 2, Y(now) - 6);
    // hochskalieren
    const out = canvas.getContext('2d')!;
    out.imageSmoothingEnabled = false;
    out.drawImage(this.off, 0, 0, W * S, H * S);
  }
}
