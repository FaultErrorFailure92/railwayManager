import { currentMap } from '../world/maps';
import { BANK, VERBUND, type Sender } from './Board';
import type { Game } from './Game';

/** Geschichte und Figuren (RM-FR-MODE-03): Briefe der bekannten Figuren nach Kampagnen-Aufträgen */

type Who = 'board' | 'bank' | 'verbund' | 'paper';
interface Beat { who: Who; title: string; text: string }

const PRESS = (): Sender => ({ name: 'Ressort Verkehr', role: 'Redaktion', org: currentMap().paper ?? 'Lokalzeitung', seed: 33 });

/** je Karte: Auftrags-Nummer (nach dem Erledigen) → Brief */
const STORY: Record<string, Record<number, Beat>> = {
  donau: {
    1: { who: 'paper', title: 'Neuer Bahnhof eröffnet!', text: 'Die Gemeinde staunt: Nach Jahren hält wieder ein Zug. Ein Pensionist hat aus Rührung den Bahnsteig gekehrt.' },
    5: { who: 'bank', title: 'Ihre Bonität', text: 'Wir beobachten Ihre Geschäfte mit Interesse. Sollten Sie einmal investieren wollen – unsere Tür steht offen. Zu marktüblichen Zinsen, versteht sich.' },
    8: { who: 'verbund', title: 'Mehr Takt gewünscht', text: 'Die Fahrgastzahlen im Tal steigen. Wir würden gerne öfter fahren – sofern Ihr Bahnhof mitspielt.' },
  },
  ebene: {
    1: { who: 'paper', title: 'Rübenernte rollt auf der Schiene', text: 'Die Bauern sind zufrieden: Statt Traktorkolonnen fahren jetzt Güterzüge. Nur die Gänse am Bahndamm beschweren sich.' },
    3: { who: 'verbund', title: 'Umsteigen leicht gemacht', text: 'Ihr Bahnhof wird zum Knoten. Bitte achten Sie auf die Anschlüsse – Pendler verzeihen alles außer einem abfahrenden Zug vor der Nase.' },
  },
  revier: {
    1: { who: 'board', title: 'Rauch über dem Revier', text: 'Die Werke sind begeistert von Ihrem Anschluss. Der Werksdirektor hat angeblich eine Zigarre auf Sie angezündet.' },
    3: { who: 'bank', title: 'Kredit für den Abrollberg?', text: 'Ein Rangierbahnhof ist eine ernste Investition. Falls die Kasse knapp wird: Wir finanzieren gerne. Zu Bedingungen, über die man reden kann.' },
  },
  schnee: {
    1: { who: 'paper', title: 'Kälteeinbruch!', text: 'Minus zwanzig Grad, und die Weichen frieren. Wer jetzt pünktlich fährt, wird im Ort als Held gefeiert.' },
    3: { who: 'board', title: 'Ein Wort zum Winter', text: 'Ich habe gehört, Ihre Leute arbeiten mit Thermoskanne und Stirnlampe. Richten Sie Ihnen meinen Dank aus. Und Tee auf Firmenkosten.' },
  },
  alpen: {
    1: { who: 'verbund', title: 'Saisonbeginn', text: 'Die Wandersaison beginnt. Rechnen Sie mit vollen Zügen, Rucksäcken in den Gängen und Kühen, die grundsätzlich nicht ausweichen.' },
    3: { who: 'paper', title: 'Ansturm auf die Berge', text: 'Ausflügler in Scharen: Am Bahnhof wurde gestern ein Rekord gezählt. Der Kiosk verkauft mittlerweile auch Pflaster für Blasen.' },
  },
  wueste: {
    1: { who: 'paper', title: 'Schneller als die Karawane', text: 'Die Schnellfahrweichen sind in Betrieb. Ein Kamelhändler soll gesagt haben: „Das ist unfair.“' },
    3: { who: 'board', title: 'Fast geschafft', text: 'Was Sie aus dieser Strecke gemacht haben, hätte ich nie für möglich gehalten. Bleiben Sie dran – die Großstadt wartet schon.' },
  },
  stadt: {
    0: { who: 'paper', title: 'Neuer Bahnhof mitten in der Stadt', text: 'Die Anrainer sind gespalten: Die einen freuen sich über die S-Bahn, die anderen über den Baulärm eher weniger. Der Bürgermeister hat beides gelobt.' },
    1: { who: 'verbund', title: 'Takt ist alles', text: 'In der Stadt wartet niemand länger als zehn Minuten. Wenn Ihre S-Bahn pünktlich ist, sind es unsere Fahrgäste auch – und dann sind alle glücklich.' },
    2: { who: 'bank', title: 'Grundstückspreise', text: 'Sie kaufen in der Innenstadt Grund? Mutig. Wir haben unsere Zinsen vorsichtshalber schon einmal nicht erhöht. Noch nicht.' },
    3: { who: 'board', title: 'Ein persönliches Wort', text: 'Ich bin seit 38 Jahren im Vorstand. So einen Bahnhof habe ich noch nie gesehen. Bringen Sie es zu Ende – ich habe schon einen Anzug für die Eröffnungsfeier gekauft.' },
  },
};

/** nach einem erledigten Auftrag: passt ein Brief? */
export function storyAfterMission(g: Game, doneIdx: number) {
  if (g.mode !== 'campaign') return;
  const beat = STORY[currentMap().id]?.[doneIdx];
  if (!beat) return;
  const from = beat.who === 'bank' ? BANK() : beat.who === 'verbund' ? VERBUND() : beat.who === 'paper' ? PRESS() : undefined;
  g.uiEvents.push({ type: 'letter', mood: 'info', title: beat.title, from, text: `<p>${g.salutation()}</p><p>${beat.text}</p>` });
}

/** Anzahl Briefe je Karte (für Tests) */
export const storyCount = (map: string) => Object.keys(STORY[map] ?? {}).length;
