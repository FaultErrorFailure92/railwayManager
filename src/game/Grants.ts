import type { Game } from './Game';

/** Förderungen (RM-FR-ECO-11): Land/EU zahlt vorab, Bedingung bis zur Frist – sonst zurückzahlen */

export interface Grant { id: string; title: string; from: string; text: string; amount: number; days: number; available: (g: Game) => boolean; done: (g: Game) => boolean }
export interface GrantState { id: string; until: number; amount: number }

const station = (g: Game) => g.stations()[0];
const ownTrack = (g: Game) => g.grid.cells.filter((c, k) => c.track && !c.fixed && g.grid.isOwned(k % g.grid.w, Math.floor(k / g.grid.w)));

export const GRANTS: Grant[] = [
  {
    id: 'access', title: 'Barrierefreier Bahnhof', from: 'Land Niederösterreich', amount: 5000, days: 3,
    text: 'Alle Bahnsteige sollen über Unterführung oder Brücke erreichbar sein (mindestens 2 Bahnsteige).',
    available: (g) => g.researched('access') && g.net.runs.length >= 2 && g.net.runs.some((r) => !r.accessible),
    done: (g) => g.net.runs.length >= 2 && g.net.runs.every((r) => r.accessible),
  },
  {
    id: 'wire', title: 'Elektrifizierung', from: 'EU-Klimafonds', amount: 6000, days: 3,
    text: 'Alle eigenen Gleise sollen einen Fahrdraht bekommen.',
    available: (g) => g.researched('wire') && ownTrack(g).some((c) => !c.wire),
    done: (g) => { const t = ownTrack(g); return t.length > 0 && t.every((c) => c.wire); },
  },
  {
    id: 'bus', title: 'Öffi-Knoten', from: 'Verkehrsverbund', amount: 4000, days: 2,
    text: 'Der Bahnhof soll per Straße an ein Busterminal angebunden werden.',
    available: (g) => g.researched('road') && !!station(g) && !g.connections(station(g)!.id).bus,
    done: (g) => !!station(g) && g.connections(station(g)!.id).bus,
  },
];

export function grantById(id: string) { return GRANTS.find((x) => x.id === id); }

/** passende Förderung zum Anbieten, falls keine läuft */
export function pickGrant(g: Game) {
  if (g.grant) return undefined;
  const list = GRANTS.filter((x) => x.available(g) && !g.grantsDone.includes(x.id));
  return list[Math.floor(Math.random() * list.length)];
}

/** Förderung angenommen: Geld sofort, Frist läuft */
export function acceptGrant(g: Game, id: string) {
  const gr = grantById(id);
  if (!gr) return;
  g.book('Förderung', gr.amount);
  g.grant = { id, until: g.sim.time + gr.days * 86400, amount: gr.amount };
  g.addLog(`Förderung „${gr.title}“: +${gr.amount.toLocaleString('de-AT')} € – Frist ${gr.days} Tage`, 'good');
}

/** stündlich: erfüllt oder Frist abgelaufen? */
export function grantTick(g: Game) {
  const s = g.grant;
  if (!s) return;
  const gr = grantById(s.id);
  if (!gr) { g.grant = undefined; return; }
  if (gr.done(g)) {
    g.grant = undefined;
    g.grantsDone.push(s.id);
    g.uiEvents.push({ type: 'letter', mood: 'good', title: `Förderung „${gr.title}“ erfüllt`, from: { org: gr.from, role: 'Förderstelle', name: 'Mag. Franziska Fördermittl', seed: 21 },
      text: '<p>Wir haben die Umsetzung geprüft – alles bestens. Die Förderung gehört Ihnen.</p>' });
    g.addLog(`Förderung „${gr.title}“ erfüllt`, 'good');
  } else if (g.sim.time >= s.until) {
    g.grant = undefined;
    g.book('Förderung', -s.amount);
    g.uiEvents.push({ type: 'letter', mood: 'bad', title: `Förderung „${gr.title}“: Rückforderung`, from: { org: gr.from, role: 'Förderstelle', name: 'Mag. Franziska Fördermittl', seed: 21 },
      text: `<p>Leider wurde die Bedingung nicht fristgerecht erfüllt. Wir müssen die ${s.amount.toLocaleString('de-AT')} € zurückfordern.</p>` });
    g.addLog(`Förderung „${gr.title}“ zurückgezahlt (−${s.amount.toLocaleString('de-AT')} €)`, 'bad');
  }
}
