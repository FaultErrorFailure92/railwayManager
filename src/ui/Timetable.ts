import { MAP_W, TILE } from '../config';
import type { Game } from '../game/Game';
import { fmtTime } from '../game/Game';
import type { Train } from '../sim/Simulation';
import { BUILDINGS } from '../world/buildings';
import { pointOnEdge } from '../world/Network';

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
      if (t.state === 'rolling' || t.state === 'stored' || t.state === 'queued' || !t.route.length) continue;
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
    if (!t.op.turnback || t.transit) return [[t.plannedSpawn, from], [t.plannedExit, to]];
    // Wendezug: bis zum Bahnhof (Kartenmitte) und zurück
    const st = this.g.stations()[0];
    const sx = st ? st.x + 1.5 : MAP_W / 2;
    const half = (t.plannedExit - t.plannedSpawn - t.layover * 60) / 2;
    return [[t.plannedSpawn, from], [t.plannedSpawn + half, sx], [t.plannedSpawn + half + t.layover * 60, sx], [t.plannedExit, from]];
  }

  private off?: HTMLCanvasElement;

  /** gezeichneter Look: Papier, Bleistift-Raster, wackelige Tintenlinien – halbe Auflösung, pixelig hochskaliert */
  draw(canvas: HTMLCanvasElement) {
    const S = 2;
    const W = Math.floor(canvas.width / S), H = Math.floor(canvas.height / S);
    if (!this.off || this.off.width !== W) { this.off = document.createElement('canvas'); this.off.width = W; this.off.height = H; }
    const ctx = this.off.getContext('2d')!;
    const L = 34, T = 18, R = 8, B = 8;
    const now = this.g.sim.time, t0 = now - PAST, t1 = now + FUTURE;
    const X = (x: number) => L + (x / MAP_W) * (W - L - R);
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
      ctx.fillText(st.name ?? 'Bahnhof', (xa + xb) / 2, T - 8);
    }
    ctx.fillStyle = '#6b5a3c';
    ctx.textAlign = 'left'; ctx.fillText('West', L, T - 8);
    ctx.textAlign = 'right'; ctx.fillText('Ost', W - R, T - 8);
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
      if (t.op.kind === 'sort' || t.state === 'rolling' || t.state === 'stored') continue;
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
