/**
 * Anschlüsse (RM-FR-OPS-13): Fahrgäste steigen am Bahnhof zwischen Zügen um.
 * Ein Anschluss ist geplant, wenn ein Zug B 4–15 Minuten nach der geplanten Ankunft von Zug A abfährt
 * (anderes Unternehmen oder andere Richtung). Erreicht: Umsteiger zahlen, beide Unternehmen sind zufriedener.
 * Verpasst: kostet Geld und Zufriedenheit. Ein verspäteter Zubringer kann abgewartet werden (RM-FR-OPS-11).
 */
import type { Game } from './Game';
import type { Train } from '../sim/Simulation';

/** Mindest-Umsteigezeit und größter Abstand für einen Anschluss (Sekunden) */
export const MIN_TRANSFER = 4 * 60;
export const MAX_TRANSFER = 15 * 60;
/** Anteil der Aussteigenden, die umsteigen */
export const TRANSFER_SHARE = 0.12;
/** Einnahme je Umsteiger und Strafe je verpasstem Anschluss */
export const TRANSFER_FEE = 3;
export const MISSED_PENALTY = 150;
/** längstes Abwarten eines Zubringers */
export const MAX_WAIT = 5 * 60;

export interface Connection {
  from: Train;
  to: Train;
  /** geplante Ankunft des Zubringers / Abfahrt des Anschlusszugs */
  arr: number;
  dep: number;
}

/** Personenzüge mit normalem Halt (Züge, die hier enden und abgestellt werden, zählen nicht) */
const isPaxStop = (t: Train) => t.op.needsStop && t.capacity > 0 && !t.missedStop && !t.ends && t.op.kind !== 'sort' && t.op.kind !== 'freight';
const alights = (t: Train) => t.jobs.some((j) => j.k === 'stop' && j.alight) || t.arrDelay !== undefined;
const boards = (t: Train) => t.jobs.some((j) => j.k === 'stop' && j.board);

/** alle geplanten Anschlüsse der Züge, die gerade unterwegs oder angekündigt sind */
export function plannedConnections(g: Game): Connection[] {
  if (!g.stations().length) return [];
  const sim = g.sim;
  const all = [...sim.trains, ...sim.queue].filter(isPaxStop);
  const out: Connection[] = [];
  for (const a of all) {
    if (!alights(a)) continue;
    const arr = sim.stationTimes(a).arr;
    for (const b of all) {
      if (b === a || !boards(b) || (b.op.id === a.op.id && b.dir === a.dir)) continue;
      const dep = sim.stationTimes(b).dep;
      const gap = dep - arr;
      if (gap >= MIN_TRANSFER && gap <= MAX_TRANSFER) out.push({ from: a, to: b, arr, dep });
    }
  }
  return out;
}

/** Zubringer, wie er bei der Ankunft war (Züge verlassen die Karte, bevor der Anschluss abfährt) */
export interface Arrival { id: number; op: Train['op']; dir: Train['dir']; number: string; passengers: number; arr: number; at: number }

/** Ankunft eines Zuges am Bahnhof merken */
export function noteArrival(g: Game, a: Train) {
  if (!isPaxStop(a)) return;
  g.arrivals.set(a.id, { id: a.id, op: a.op, dir: a.dir, number: a.number, passengers: a.passengers, arr: g.sim.stationTimes(a).arr, at: g.sim.time });
}

/** Zug B fährt gerade ab: alle Anschlüsse auf B auswerten */
export function settleDeparture(g: Game, b: Train) {
  const sim = g.sim;
  if (!isPaxStop(b)) return;
  const dep = sim.stationTimes(b).dep;
  const same = (op: Train['op'], dir: Train['dir']) => op.id === b.op.id && dir === b.dir;
  // angekommene Zubringer und solche, die noch unterwegs sind
  const cands: { id: number; number: string; op: Train['op']; dir: Train['dir']; passengers: number; arr: number; at?: number }[] = [
    ...[...g.arrivals.values()],
    ...[...sim.trains, ...sim.queue].filter((a) => a !== b && isPaxStop(a) && alights(a) && !g.arrivals.has(a.id))
      .map((a) => ({ id: a.id, number: a.number, op: a.op, dir: a.dir, passengers: a.passengers, arr: sim.stationTimes(a).arr })),
  ];
  for (const a of cands) {
    if (a.id === b.id || same(a.op, a.dir)) continue;
    const gap = dep - a.arr;
    if (gap < MIN_TRANSFER || gap > MAX_TRANSFER) continue;
    const key = `${a.id}>${b.id}`;
    if (g.connResults.has(key)) continue;
    if (a.at !== undefined && a.at <= sim.time - 60) {
      // erreicht
      const n = Math.max(1, Math.round(a.passengers * TRANSFER_SHARE));
      const fee = n * TRANSFER_FEE;
      g.money += fee;
      g.stats.connOk = (g.stats.connOk ?? 0) + 1;
      const td = g.today(); td.conn = (td.conn ?? 0) + 1;
      g.bump('connOk');
      g.satisfaction[a.op.id] = Math.min(100, g.satisfaction[a.op.id] + 1);
      g.satisfaction[b.op.id] = Math.min(100, g.satisfaction[b.op.id] + 1);
      g.connResults.set(key, { ok: true, at: sim.time, arr: a.arr, dep, fromNo: a.number, toNo: b.number });
      g.addLog(`Anschluss ${a.number} → ${b.number}: ${n} Umsteiger · +${fee} €`, 'good');
    } else {
      // Zubringer noch nicht da oder zu knapp: Anschluss verpasst
      g.money -= MISSED_PENALTY;
      g.stats.connMissed = (g.stats.connMissed ?? 0) + 1; g.bump('connMissed');
      g.satisfaction[b.op.id] = Math.max(0, g.satisfaction[b.op.id] - 3);
      g.connResults.set(key, { ok: false, at: sim.time, arr: a.arr, dep, fromNo: a.number, toNo: b.number });
      g.addLog(`Anschluss verpasst: ${a.number} → ${b.number} (${a.number} zu spät) · −${MISSED_PENALTY} €`, 'bad');
    }
  }
  // Altes vergessen
  for (const [k, r] of g.connResults) if (r.at < sim.time - 3 * 3600) g.connResults.delete(k);
  for (const [id, a] of g.arrivals) if (a.at < sim.time - MAX_TRANSFER - 3600) g.arrivals.delete(id);
  sim.pruneArrivals();
}

/** Anschlüsse in Gefahr: Zubringer kommt voraussichtlich zu spät */
export function connectionsAtRisk(g: Game) {
  const sim = g.sim;
  return plannedConnections(g).filter((c) => {
    if (sim.arrivedAt.has(c.from.id) || g.connResults.has(`${c.from.id}>${c.to.id}`)) return false;
    if (c.dep < sim.time || c.dep > sim.time + 45 * 60) return false;
    const expectArr = c.arr + sim.delayNow(c.from) * 60;
    return expectArr > c.dep - MIN_TRANSFER;
  });
}

/** Anschlusszug wartet auf den Zubringer (höchstens MAX_WAIT über die Abfahrt hinaus) */
export function holdConnection(g: Game, c: Connection) {
  c.to.waitFor = c.from.id;
  c.to.waitUntil = c.dep + MAX_WAIT;
  g.addLog(`${c.to.number} wartet auf ${c.from.number} (höchstens ${MAX_WAIT / 60} min)`, 'info');
}

// ------------------------------------------------------------ Verspätungen von außen (RM-FR-OPS-11)

/** verspäteter Zug lässt die nachfolgenden Züge derselben Richtung vor */
export function letPass(g: Game, t: Train) {
  const behind = g.sim.blockedBehind(t);
  t.letPass = true;
  g.addLog(`${behind.map((q) => q.number).join(', ') || 'Folgezüge'} ${behind.length > 1 ? 'fahren' : 'fährt'} vor ${t.number}`, 'info');
}

/** Zug nimmt statt des festgelegten (belegten) Bahnsteigs einen freien */
export function swapPlatform(g: Game, t: Train) {
  t.anyPlatform = true;
  g.sim.reroute(t);
  g.addLog(`${t.number} weicht auf einen anderen Bahnsteig aus`, 'info');
}
