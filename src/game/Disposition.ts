import type { Game } from './Game';
import type { Train } from '../sim/Simulation';

/** Disposition (RM-FR-OPS-12): Gleisbelegung, Reihenfolge und Wartezeiten einzelner Züge für die nächsten Stunden */

export const DISPO_AHEAD = 2 * 3600;
/** längstes Zurückhalten über die Planabfahrt hinaus */
export const MAX_HOLD = 30 * 60;
/** Mindestabstand zweier Züge am selben Bahnsteig */
const GAP = 60;

export interface DispoSlot {
  t: Train;
  arr: number;
  dep: number;
  /** Bahnsteig (Run-Id) – fest, vom Spieler gewählt oder schon belegt; undefined = automatisch */
  platform?: string;
  /** Bahnsteig steht fest (Zug fährt schon hin oder steht dort) */
  locked: boolean;
  /** nur Aussteigen vor dem Abstellen (Wendezug) – nicht zurückhaltbar */
  alight?: boolean;
  /** automatisch: voraussichtlicher Bahnsteig (erster freier) */
  guess?: string;
}

export interface DispoConflict { a: Train; b: Train; platform?: string; at: number }

function hasStop(t: Train) {
  return t.jobs.some((j) => j.k === 'stop' && j.board);
}

/** Bahnsteig, den der Zug nehmen wird */
function platformOf(g: Game, t: Train): { platform?: string; locked: boolean } {
  const head = t.jobs[0];
  if (t.state === 'dwell' || (t.state === 'running' && head?.k === 'stop')) {
    const id = t.route[t.route.length - 1]?.stopRun?.id;
    if (id) return { platform: id, locked: true };
  }
  const sim = g.sim;
  return { platform: t.anyPlatform ? undefined : t.platform ?? sim.platformPref[`${t.op.id}:${t.dir}`] ?? sim.platformPref[t.op.id], locked: false };
}

/** Planabfahrt ohne Zurückhalten */
export function baseDeparture(g: Game, t: Train) {
  const h = t.holdUntil;
  t.holdUntil = undefined;
  const { dep } = g.sim.stationTimes(t);
  t.holdUntil = h;
  return dep;
}

/** alle Halte am Bahnhof von jetzt bis in zwei Stunden */
export function dispoSlots(g: Game): DispoSlot[] {
  const sim = g.sim, now = sim.time;
  const out: DispoSlot[] = [];
  for (const t of [...sim.trains, ...sim.queue]) {
    if (t.op.kind === 'sort' || t.missedStop) continue;
    const dwelling = t.state === 'dwell' && t.jobs[0]?.k === 'stop';
    if (!dwelling && !hasStop(t)) continue;
    let { arr, dep } = sim.stationTimes(t);
    const parks = !!t.ends || t.jobs.some((j) => j.k === 'park');
    const dwell = (t.op.dwell + (t.passengers / 100) * 20) * sim.dwellFactor;
    const pl = platformOf(g, t);
    if (parks) {
      // Wendezug mit Abstellen: erst kurz Aussteigen, später Einsteigen und Abfahrt
      const first = t.jobs[0];
      if (first?.k === 'stop' && !first.board) {
        let a = arr;
        if (t.state === 'dwell') a = sim.arrivedAt.get(t.id) ?? Math.min(arr, now);
        else if (a < now) a = now;
        const d = t.state === 'dwell' ? now + t.dwellLeft : a + 40 + (t.passengers / 100) * 15;
        if (a <= now + DISPO_AHEAD) out.push({ t, arr: a, dep: d, ...pl, alight: true });
        pl.locked = false;
        pl.platform = t.anyPlatform ? undefined : t.platform ?? sim.platformPref[`${t.op.id}:${t.dir}`] ?? sim.platformPref[t.op.id];
      }
      arr = Math.max(now, dep - dwell - 120);
      if (dwelling) arr = Math.min(arr, sim.arrivedAt.get(t.id) ?? arr);
    }
    if (dwelling && !parks) {
      arr = sim.arrivedAt.get(t.id) ?? Math.min(arr, now);
      dep = Math.max(now + t.dwellLeft, t.holdUntil ?? 0);
    } else if (dwelling) {
      dep = Math.max(now + t.dwellLeft, t.holdUntil ?? 0, dep);
    } else if (arr < now) {
      // verspätet: kommt frühestens jetzt
      const late = now - arr;
      arr += late; dep += late;
    }
    if (arr > now + DISPO_AHEAD) continue;
    out.push({ t, arr, dep, ...pl });
  }
  return out.sort((a, b) => a.arr - b.arr);
}

/** Belegungskonflikte: zwei Züge zur selben Zeit am selben Bahnsteig, oder mehr Züge als Bahnsteige */
export function dispoConflicts(g: Game, slots = dispoSlots(g)): DispoConflict[] {
  const res: DispoConflict[] = [];
  const runs = g.platformRuns().length;
  slots.forEach((x) => { x.guess = undefined; });
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j];
      if (a.t === b.t || !a.platform || a.platform !== b.platform) continue;
      if (b.arr >= a.dep + GAP || a.arr >= b.dep + GAP) continue;
      res.push({ a: a.t, b: b.t, platform: a.platform, at: Math.max(a.arr, b.arr) });
    }
  }
  // automatische Züge: erster freier Bahnsteig; keiner frei → Konflikt
  const ids = g.platformRuns().map((r) => r.id);
  const free = (id: string, a: DispoSlot) => !slots.some((b) => b !== a && b.t !== a.t && (b.platform ?? b.guess) === id && b.arr < a.dep + GAP && a.arr < b.dep + GAP && (b.platform || b.arr <= a.arr));
  for (const a of slots) {
    if (a.platform || !runs) continue;
    a.guess = ids.find((id) => free(id, a));
    if (!a.guess) {
      const other = slots.find((b) => b !== a && b.t !== a.t && b.arr <= a.arr && b.dep > a.arr);
      res.push({ a: other?.t ?? a.t, b: a.t, at: a.arr });
    }
  }
  return res;
}

/** Bahnsteig nur für diesen Zug festlegen (undefined = automatisch) */
export function setTrainPlatform(g: Game, t: Train, run?: string) {
  if (run) { t.platform = run; t.anyPlatform = false; } else t.platform = undefined;
  g.sim.reroute(t);
  const i = g.platformRuns().findIndex((r) => r.id === run);
  g.addLog(`Disposition: ${t.number} ${run ? `auf Bahnsteig ${i + 1}` : 'Bahnsteig automatisch'}`, 'info');
  g.version++;
}

/** Abfahrt bis zu dieser Zeit zurückhalten (auf ganze Minuten, höchstens MAX_HOLD nach Plan) */
export function setHold(g: Game, t: Train, until?: number) {
  const base = baseDeparture(g, t);
  if (until === undefined || until <= base + 30) { t.holdUntil = undefined; g.version++; return; }
  t.holdUntil = Math.min(base + MAX_HOLD, Math.round(until / 60) * 60);
  g.version++;
}

/** Zurückhalten um Minuten ändern */
export function shiftHold(g: Game, t: Train, min: number) {
  const base = baseDeparture(g, t);
  setHold(g, t, Math.max(base, t.holdUntil ?? base) + min * 60);
  const h = t.holdUntil ? Math.round((t.holdUntil - base) / 60) : 0;
  g.addLog(`Disposition: ${t.number} ${h ? `wartet ${h} min länger` : 'fährt planmäßig ab'}`, 'info');
}
