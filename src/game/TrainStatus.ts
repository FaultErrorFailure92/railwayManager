import type { Game } from './Game';
import { fmtTime } from './Game';
import type { Train } from '../sim/Simulation';
import { TILE } from '../config';
import { BUILDINGS } from '../world/buildings';
import { pointOnEdge } from '../world/Network';
import { currentMap } from '../world/maps';

/** Zugstatus mit Ortsangabe: „fährt in Dmh ein“, „fährt durch Dmh“, „fährt aus Dmh aus“ … */

const STATE_TEXT: Record<string, string> = {
  queued: 'angekündigt', running: 'fährt', dwell: 'hält', parked: 'abgestellt',
  rolling: 'rollt ab', stored: 'im Richtungsgleis', done: 'fertig',
};
/** so viele Kacheln vor dem Bahnhof heißt es schon „fährt ein“ */
const NEAR = 12;

function headX(g: Game, t: Train): number | undefined {
  if (!t.route.length) return undefined;
  const { i, d } = g.sim.posOnTrain(t, 0);
  const e = t.route[i];
  return e ? pointOnEdge(e, d).x / TILE : undefined;
}

function stationSpans(g: Game) {
  return g.stations().map((b) => ({ b, x0: b.x - 2, x1: b.x + BUILDINGS[b.key].w + 2, code: g.stationCode(b) }));
}

/** Fahrtrichtung gerade: +1 nach Osten, −1 nach Westen */
function heading(t: Train) {
  const east = t.dir === 'E';
  return (t.turned ? !east : east) ? 1 : -1;
}

export function trainStatus(g: Game, t: Train): string {
  const sim = g.sim;
  const [west, east] = currentMap().ends;
  const origin = t.dir === 'E' ? west : east;
  if (t.state === 'queued') {
    const late = sim.time - t.plannedSpawn;
    return late > 0 ? `wartet vor ${origin} +${Math.ceil(late / 60)} min` : `kommt aus ${origin} · ${fmtTime(t.plannedSpawn)}`;
  }
  const spans = stationSpans(g);
  const x = headX(g, t);
  const at = x === undefined ? undefined : spans.find((s) => x >= s.x0 && x <= s.x1);
  const dir = heading(t);
  const ahead = x === undefined ? undefined : spans.filter((s) => (dir > 0 ? s.x0 - x : x - s.x1) > 0).sort((a, b) => (dir > 0 ? a.x0 - b.x0 : b.x1 - a.x1))[0];
  // Bahnhof am Ziel der aktuellen Route (Bahnsteig, zu dem der Zug fährt)
  const endX = t.route.length ? pointOnEdge(t.route[t.route.length - 1], 0).x / TILE : undefined;
  const target = endX === undefined ? undefined : spans.find((s) => endX >= s.x0 && endX <= s.x1) ?? spans[0];
  const here = at ?? target ?? spans[0];
  const K = here?.code ?? 'Bf';
  if (t.state === 'dwell') return sim.isTurn(t) && !t.turned ? (t.ends ? `endet in ${K} (Pflege)` : `hält in ${K}, wendet`) : `hält in ${K}`;
  if (t.state === 'parked') return t.parkKind === 'remise' ? `in der Remise ${K}` : t.parkKind === 'workshop' ? `in der Werkstatt ${K}` : `abgestellt in ${K}`;
  if (t.state !== 'running') return STATE_TEXT[t.state];
  const toward = dir > 0 ? east : west;
  if (t.waiting) return t.note ?? (ahead && x !== undefined && Math.min(Math.abs(ahead.x0 - x), Math.abs(ahead.x1 - x)) < NEAR ? `wartet am Signal vor ${ahead.code}` : at ? `wartet am Signal in ${at.code}` : 'wartet am Signal');
  const j = t.jobs[0];
  if (j?.k === 'stop') {
    const st = target ?? ahead;
    if (!st) return 'fährt zum Bahnsteig';
    const near = at === st || (x !== undefined && Math.min(Math.abs(st.x0 - x), Math.abs(st.x1 - x)) < NEAR);
    return near ? `fährt in ${st.code} ein` : `unterwegs nach ${st.code}`;
  }
  if (j?.k === 'park') return j.wash ? `fährt zur Pflege (${K})` : `fährt zum Abstellen (${K})`;
  if (j?.k === 'hump') return `fährt zum Abrollberg (${K})`;
  if (t.departure) return at ? `fährt aus ${at.code} aus (sortiert)` : `fährt Richtung ${toward}`;
  // Ausfahrt Richtung Kartenrand
  const stopped = sim.arrivedAt.has(t.id) || !!t.turned;
  if (at) return stopped ? `fährt aus ${at.code} aus` : `fährt durch ${at.code}`;
  if (ahead && x !== undefined && Math.min(Math.abs(ahead.x0 - x), Math.abs(ahead.x1 - x)) < NEAR) return `fährt gleich durch ${ahead.code}`;
  return `fährt Richtung ${toward}`;
}
