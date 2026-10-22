import type { Game } from './Game';
import { currentMap } from '../world/maps';

/** Briefe vom Bahnvorstand: Begrüßung und ab und zu Lob oder Tadel */
export const BOARD_NAME = 'Hofrat Dr. Ferdinand Fahrplan';
export const BOARD_ROLE = 'Vorsitzender des Vorstands';

export interface Letter { title: string; text: string; mood: 'good' | 'bad' | 'info'; bonus?: number }
export interface BoardState { sent: string[]; nextAt: number; good: number; bad: number }

export const newBoard = (): BoardState => ({ sent: [], nextAt: 0, good: 0, bad: 0 });

const eur = (n: number) => Math.round(n).toLocaleString('de-AT');

/** Begrüßung beim neuen Spiel */
export function welcomeLetter(g: Game): Letter {
  const m = currentMap();
  return {
    mood: 'info', title: 'Willkommen an Bord!',
    text: `<p>${g.salutation(`Sehr geehrte Betriebsleitung der ${g.company}`)}</p>
<p>der Vorstand der <b>${g.company}</b> freut sich, Ihnen die Strecke im <b>${m.name}</b> anvertrauen zu dürfen. Sie erhalten ein Startkapital von <b>${eur(m.startMoney)}&nbsp;€</b> – bitte gehen Sie sorgsam damit um, die Bank ist nicht für ihre Geduld bekannt.</p>
<p>Unsere Erwartungen sind einfach: pünktliche Züge, zufriedene Fahrgäste und schwarze Zahlen. Bauen Sie zuerst einen Bahnsteig samt Bahnhof, dann kommen die ersten Züge von ganz allein.</p>
<p>Ich werde Ihnen hin und wieder schreiben. Hoffentlich meistens Erfreuliches.</p>`,
  };
}

/** täglich: passt ein Brief? höchstens einer, mit Pause dazwischen */
export function dailyLetter(g: Game): Letter | undefined {
  const b = g.board;
  const t = g.sim.time;
  if (t < b.nextAt || !g.company) return;
  const day = Math.floor(t / 86400);
  const prev = g.history.find((h) => h.day === day - 1);
  const once = (id: string) => !b.sent.includes(id);
  const cands: (Letter & { id: string; repeat?: boolean })[] = [];
  const punctRate = prev && prev.handled >= 8 ? prev.punctual / prev.handled : -1;
  const bal = prev ? prev.income - prev.expense : 0;

  if (g.money < -20000) cands.push({ id: 'debt-deep', repeat: true, mood: 'bad', title: 'Dringend: Ihre Finanzen',
    text: `<p>die Bank hat mich heute persönlich angerufen. <b>${eur(-g.money)}&nbsp;€ Schulden</b> – bei ${eur(-50000)}&nbsp;€ ist Schluss, dann sperrt man uns die Konten.</p><p>Bitte senken Sie die Kosten, verhandeln Sie bessere Verträge oder bauen Sie Läden. Sofort.</p>` });
  if (punctRate >= 0 && punctRate < 0.7) cands.push({ id: 'late', repeat: true, mood: 'bad', title: 'Beschwerden über Verspätungen',
    text: `<p>gestern waren nur <b>${Math.round(punctRate * 100)} %</b> der Züge pünktlich. Mein Postfach quillt über vor Beschwerden, und der Bürgermeister hat auch schon angerufen.</p><p>Signale, Ausweichgleise, ein zweiter Bahnsteig – tun Sie etwas!</p>` });
  if (g.rating.stars <= 2 && day >= 3) cands.push({ id: 'stars-low', repeat: true, mood: 'bad', title: 'Unser Bahnhof hat einen schlechten Ruf',
    text: `<p>nur <b>${g.rating.stars} Sterne</b> für unseren Bahnhof. Ein paar Bänke, ein Kiosk, etwas Sauberkeit – die Fahrgäste merken das, und sie bleiben sonst weg.</p>` });
  if (punctRate >= 0.97 && prev!.handled >= 12) cands.push({ id: 'punct', repeat: true, mood: 'good', title: 'Pünktlich wie die Schweizer', bonus: 500,
    text: `<p>${prev!.punctual} von ${prev!.handled} Zügen gestern pünktlich – hervorragend! Als kleines Dankeschön überweist der Vorstand <b>500&nbsp;€</b> für die Kaffeekasse.</p>` });
  if (g.rating.stars >= 4 && once('stars4')) cands.push({ id: 'stars4', mood: 'good', title: 'Vier Sterne!', bonus: 2000,
    text: '<p>die Fahrgastzeitung schreibt von „einem der schönsten Bahnhöfe der Region“. Der Vorstand ist stolz auf Sie und gibt <b>2 000&nbsp;€</b> für weitere Verschönerungen frei.</p>' });
  if (g.rating.stars >= 5 && once('stars5')) cands.push({ id: 'stars5', mood: 'good', title: 'Fünf Sterne – unglaublich!', bonus: 5000,
    text: '<p>fünf Sterne! So etwas hat es bei uns noch nie gegeben. Nehmen Sie <b>5 000&nbsp;€</b> Prämie und machen Sie genau so weiter.</p>' });
  if (bal > 5000 && once('balance')) cands.push({ id: 'balance', mood: 'good', title: 'Ein Rekordtag',
    text: `<p><b>+${eur(bal)}&nbsp;€</b> an einem einzigen Tag! Ich habe die Zahlen dreimal nachgerechnet. Der Aufsichtsrat ist begeistert.</p>` });
  if (g.money > 50000 && once('rich')) cands.push({ id: 'rich', mood: 'good', title: 'Volle Kassen',
    text: '<p>über 50 000&nbsp;€ auf dem Konto – Zeit, groß zu denken. Ein zweigleisiger Ausbau oder ein Rangierbahnhof würden sich jetzt lohnen.</p>' });
  if (g.faults.length >= 3) cands.push({ id: 'faults', repeat: true, mood: 'bad', title: 'Störungen beheben!',
    text: `<p>gleich <b>${g.faults.length} Störungen</b> an Weichen und Signalen sind offen. Bitte schicken Sie den Störtrupp los – anklicken genügt.</p>` });
  if (g.achievements.length >= 5 && once('ach5')) cands.push({ id: 'ach5', mood: 'good', title: 'Glückwunsch zu Ihren Erfolgen',
    text: `<p>schon ${g.achievements.length} Erfolge – Sie sind auf dem besten Weg in die Firmenchronik.</p>` });

  // schlechte Nachrichten zuerst, damit Probleme nicht untergehen
  const pick = cands.find((c) => c.mood === 'bad') ?? cands[0];
  if (!pick) return;
  if (!pick.repeat || !b.sent.includes(pick.id)) b.sent.push(pick.id);
  b.nextAt = t + (pick.mood === 'bad' ? 2 : 1.5) * 86400;
  if (pick.mood === 'good') b.good++; else b.bad++;
  return pick;
}

/** Absender von Briefen und Anrufen */
export interface Sender { name: string; role: string; org: string; seed: number }

export const BANK = (): Sender => ({ name: 'Direktor Gustav Groschen', role: 'Kreditabteilung', org: `Sparkasse ${currentMap().name}`, seed: 7 });
export const VERBUND = (): Sender => ({ name: 'Ing. Waltraud Wagenstand', role: 'Leiterin Ausschreibungen', org: `Verkehrsverbund ${currentMap().name}`, seed: 12 });

const FIRST = ['Petra', 'Klaus', 'Monika', 'Herbert', 'Sabine', 'Günther', 'Ingrid', 'Walter', 'Renate', 'Helmut', 'Brigitte', 'Josef', 'Elfriede', 'Manfred'];
const LAST = ['Pendel', 'Schaffner', 'Taktmann', 'Weichhuber', 'Signalbauer', 'Gleisner', 'Fahrnberger', 'Pufferl', 'Achsenmayr', 'Lokinger', 'Kursbuch', 'Bremser', 'Zugmayr', 'Anschluss'];
const TITLE = ['', 'Mag. ', 'Dr. ', 'Ing. ', 'DI '];
const ROLE = ['Leitung Fahrplan', 'Vertrieb', 'Betriebsleitung', 'Geschäftsführung', 'Disposition'];

/** feste Ansprechperson je Bahnunternehmen */
export function contactOf(op: string, opName: string): Sender {
  let h = 0;
  for (const c of op) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { name: `${TITLE[h % TITLE.length]}${FIRST[(h >> 3) % FIRST.length]} ${LAST[(h >> 7) % LAST.length]}`, role: ROLE[(h >> 11) % ROLE.length], org: opName, seed: h };
}

export const BOARD = (company: string): Sender => ({ name: BOARD_NAME, role: BOARD_ROLE, org: company, seed: 3 });
