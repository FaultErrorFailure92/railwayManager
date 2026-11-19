import { SECOND_ROW } from '../config';
import { OPERATORS } from '../sim/Operators';
import { PIECES } from '../world/pieces';
import { isStation } from '../world/buildings';
import type { Game, Stats } from './Game';
import type { Check, Mission } from './Missions';
import { CHAPTER2_MISSIONS, chapter2Letter } from './Chapter2';

/** Kampagne Kapitel 3–7 (RM-FR-MODE-02): je Karte eigene Aufträge, ein bis zwei neue Systeme (RM-FR-CPX-01) */

type OpId = keyof typeof OPERATORS;
const count = (label: string, n: number, of: number): Check => ({ label: `${label} (${Math.max(0, Math.min(n, of))}/${of})`, done: n >= of });
const active = (g: Game) => Object.entries(g.contracts).filter(([, c]) => c.status === 'active').map(([id]) => OPERATORS[id as OpId]);
const handledOf = (s: Stats, f: (id: OpId) => boolean) => Object.entries(s.opStats ?? {}).filter(([id]) => f(id as OpId)).reduce((a, [, v]) => a + v.handled, 0);
const ownPieces = (g: Game, f: (key: string) => boolean) => [...g.grid.pieces.values()].filter((p) => !g.grid.fixedPieces.has(p.id) && f(p.key)).length;
const ownTrack = (g: Game) => g.grid.cells.filter((c, k) => c.track && !c.fixed && g.grid.isOwned(k % g.grid.w, Math.floor(k / g.grid.w)));

/** Auftrag aus einer Checkliste */
function checklist(title: string, short: string, reward: number, level: number, fp: number, checks: (g: Game, s: Stats, b: Stats) => Check[]): Mission {
  return {
    title, short, reward, level, fp, unlock: [], checks,
    progress: (s, b, g) => {
      const c = checks(g, s, b);
      const n = c.filter((x) => x.done).length;
      return { value: n === c.length ? 1 : n / c.length, text: `${n}/${c.length}` };
    },
  };
}

const arrive = (extra?: { label: string; ok: (g: Game) => boolean }) => checklist('Ankommen', 'Bahnhof bauen und einen ersten Vertrag abschließen', 3000, 6, 6, (g) => [
  { label: 'Bahnhof mit Bahnsteig und Empfangsgebäude', done: [...g.grid.buildings.values()].some((b) => isStation(b.key)) && g.grid.cells.some((c) => c.platform) },
  { label: 'Vertrag mit einem Personen-Unternehmen', done: active(g).some((o) => o.needsStop) },
  ...(extra ? [{ label: extra.label, done: extra.ok(g) }] : []),
]);
const punctual20 = (reward: number): Mission => ({
  title: 'Meisterprüfung', short: '18 der letzten 20 Züge pünktlich', reward, level: 8, fp: 10, unlock: [],
  progress: (s) => {
    const last = s.recent.slice(-20);
    const ok = last.filter(Boolean).length;
    return { value: last.length >= 20 && ok >= 18 ? 1 : Math.min(0.99, ok / 18), text: `${ok}/18` };
  },
});

export const CHAPTER_MISSIONS: Record<string, Mission[]> = {
  ebene: CHAPTER2_MISSIONS,
  // ---- Kapitel 3: Betriebe und Rangieren
  revier: [
    arrive(),
    checklist('Werksanschluss', 'Eine Privatbahn anschließen und 8 Fahrten abwickeln', 5000, 6, 6, (g, s, b) => [
      { label: 'Vertrag mit einer Privatbahn (Werk an der Strecke)', done: active(g).some((o) => !!o.industry) },
      count('Fahrten der Privatbahn', handledOf(s, (id) => !!OPERATORS[id].industry) - handledOf(b, (id) => !!OPERATORS[id].industry), 8),
    ]),
    checklist('Rangierbahnhof', 'Abrollberg bauen und 30 Wagen sortieren', 7000, 7, 8, (g, s, b) => [
      { label: '„Schwerkraft macht’s“ erforschen', done: g.researched('hump') },
      { label: 'Abrollberg bauen', done: [...g.grid.buildings.values()].some((x) => x.key === 'bld_hump') },
      count('Wagen sortiert', s.sortedWagons - b.sortedWagons, 30),
    ]),
    checklist('Güterdrehscheibe', '25 Güterzüge pünktlich durch den Bahnhof', 6000, 7, 8, (_g, s, b) => [
      count('Güterzüge abgefertigt', handledOf(s, (id) => OPERATORS[id].kind === 'freight') - handledOf(b, (id) => OPERATORS[id].kind === 'freight'), 25),
    ]),
    punctual20(9000),
  ],
  // ---- Kapitel 4: Wetter und Störungen
  schnee: [
    arrive(),
    checklist('Weichenheizung', 'Weichen gegen Frost schützen und Instandhalter einstellen', 5000, 6, 6, (g) => [
      { label: '„Föhn für Weichen“ erforschen', done: g.researched('switchHeat') },
      { label: '2 Instandhalter eingestellt', done: g.crew >= 2 },
    ]),
    checklist('Winterdienst', '10 Störungen beheben', 6000, 7, 8, (g) => [count('Störungen behoben', g.repairs, 10)]),
    checklist('Pünktlich trotz Schnee', '25 Züge in Folge pünktlich', 7000, 7, 8, (_g, s) => [count('Züge in Folge pünktlich', s.streak, 25)]),
    checklist('Durch den Winter', 'Bewertung 4 Sterne und 5 Tage durchhalten', 9000, 8, 10, (g) => [
      { label: 'Bahnhof mit 4 Sternen bewertet', done: g.rating.stars >= 4 },
      count('Spieltage', Math.floor(g.sim.time / 86400) + 1, 5),
    ]),
  ],
  // ---- Kapitel 5: Berge
  alpen: [
    arrive(),
    checklist('Bergbahnhof', 'Bahnhof ausbauen und einen Fernzug gewinnen', 5000, 6, 6, (g) => [
      { label: 'Bahnhofsstufe „Bahnhof“ erreicht', done: g.tier >= 1 },
      { label: 'Vertrag mit einem Fernzug-Unternehmen', done: active(g).some((o) => o.kind === 'ic') },
    ]),
    checklist('Kreuzungsbahnhof', 'Zweigleisig ausbauen, zwei Gleiswechsel bauen', 7000, 7, 8, (g) => [
      { label: '2. Streckengleis durchgehend', done: g.grid.mainRows.includes(SECOND_ROW) },
      count('eigene Gleiswechsel', ownPieces(g, (k) => k.startsWith('xover')), 2),
    ]),
    checklist('Ausflugsverkehr', '30 000 Fahrgäste befördern', 7000, 7, 8, (_g, s, b) => [count('Fahrgäste', s.passengers - b.passengers, 30000)]),
    checklist('Schweizer Präzision', '50 Züge in Folge pünktlich', 10000, 8, 10, (_g, s) => [count('Züge in Folge pünktlich', s.streak, 50)]),
  ],
  // ---- Kapitel 6: Schnellverkehr, lange Strecken
  wueste: [
    arrive(),
    checklist('Hochgeschwindigkeit', 'Schnellfahrweichen erforschen und zwei bauen', 6000, 6, 6, (g) => [
      { label: 'Schnellfahrweichen erforschen', done: g.researched('fastSwitch') },
      count('Schnellfahrweichen gebaut', ownPieces(g, (k) => !!PIECES[k]?.fast), 2),
    ]),
    checklist('Unter Strom', 'Alle eigenen Gleise elektrifizieren', 6000, 7, 8, (g) => {
      const t = ownTrack(g);
      return [{ label: 'Fahrdraht erforschen', done: g.researched('wire') }, { label: 'Alle eigenen Gleise mit Fahrdraht', done: t.length > 0 && t.every((c) => c.wire) }];
    }),
    checklist('Fernverkehrsknoten', '2 Fernzug-Unternehmen und 40 Fernzug-Halte', 8000, 8, 8, (g, s, b) => [
      count('Fernzug-Verträge', active(g).filter((o) => o.kind === 'ic' || o.kind === 'night').length, 2),
      count('Fernzug-Halte', s.stopsIC - b.stopsIC, 40),
    ]),
    punctual20(12000),
  ],
  // ---- Kapitel 7: Großstadt (Finale) – alles auf einmal
  stadt: [
    arrive(),
    checklist('S-Bahn-Takt', 'S-Bahn gewinnen und 40 S-Bahn-Halte abwickeln', 7000, 7, 8, (g, s, b) => [
      { label: 'Vertrag mit der S-Bahn', done: active(g).some((o) => o.kind === 'sbahn') },
      count('S-Bahn-Fahrten', handledOf(s, (id) => OPERATORS[id].kind === 'sbahn') - handledOf(b, (id) => OPERATORS[id].kind === 'sbahn'), 40),
    ]),
    checklist('Knotenbahnhof', 'Bahnhofsstufe „Knotenbahnhof“ und 30 Anschlüsse', 9000, 8, 10, (g, s, b) => [
      { label: 'Bahnhofsstufe „Knotenbahnhof“ erreicht', done: g.tier >= 2 },
      count('Anschlüsse erreicht', (s.connOk ?? 0) - (b.connOk ?? 0), 30),
    ]),
    checklist('Pendlerstrom', '60 000 Fahrgäste und 3 Fernzug- oder S-Bahn-Unternehmen', 10000, 8, 10, (g, s, b) => [
      count('Fahrgäste', s.passengers - b.passengers, 60000),
      count('Verträge Fernzug/S-Bahn', active(g).filter((o) => o.kind === 'ic' || o.kind === 'night' || o.kind === 'sbahn').length, 3),
    ]),
    checklist('Hauptbahnhof', 'Hauptbahnhof werden und 50 Züge in Folge pünktlich', 20000, 9, 12, (g, s) => [
      { label: 'Bahnhofsstufe „Hauptbahnhof“ erreicht', done: g.tier >= 3 },
      count('Züge in Folge pünktlich', s.streak, 50),
    ]),
  ],
};

const INTRO: Record<string, string> = {
  revier: 'Im <b>Industrierevier</b> rauchen die Schlote: Werke wollen angeschlossen werden, und Güterwagen müssen sortiert werden. Ein Abrollberg wäre kein Luxus.',
  schnee: 'Im <b>Schneeland</b> ist der Winter Ihr ärgster Gegner: eingefrorene Weichen, Störungen, Verspätungen. Halten Sie den Betrieb trotzdem am Laufen.',
  alpen: 'Auf der <b>Alpenbahn</b> ist der Platz knapp und die Züge sind voll mit Ausflüglern. Ein Kreuzungsbahnhof mit zwei Gleisen wird nötig sein.',
  wueste: 'Die <b>Wüstenbahn</b> ist lang und schnell: Fernzüge rasen durch, der Fahrdraht muss überall hängen, und Weichen müssen Tempo vertragen.',
  stadt: 'Willkommen in der <b>Großstadt</b>. Hier kommt alles zusammen: S-Bahn im Takt, Fernzüge, Güter, Anschlüsse – und Grund ist teuer, weil überall schon Häuser stehen. Quer über Ihr Gelände führt die Hochbahn: Darunter dürfen Gleise liegen, aber keine Gebäude stehen – und an den Pfeilern kommt niemand vorbei. Machen Sie daraus einen Hauptbahnhof. Es ist das letzte Kapitel.',
};

/** Brief zum Kapitelstart */
export function chapterLetter(map: string, n: number, title: string, salutation: string) {
  if (map === 'ebene') return chapter2Letter(salutation);
  return { title: `Kapitel ${n}: ${title}`, text: `<p>${salutation}</p><p>${INTRO[map] ?? ''}</p><p>Alle Werkzeuge aus den bisherigen Kapiteln stehen Ihnen zur Verfügung, die Forschung beginnt wieder von vorn.</p>` };
}
