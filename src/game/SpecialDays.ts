/**
 * Besondere Tage (RM-FR-EVT-08): Feiertag, Heimspiel, Ferienbeginn, Streik.
 * Werden am Vorabend in der Zeitung angekündigt und ändern den Verkehr des ganzen Tages spürbar.
 */
import type { Game } from './Game';
import { OPERATORS, type Operator, type OperatorId } from '../sim/Operators';

export type SpecialId = 'feiertag' | 'heimspiel' | 'ferien' | 'streik';

export interface SpecialDay {
  /** Spieltag (0 = erster Tag) */
  day: number;
  id: SpecialId;
  /** Streik: dieses Unternehmen fährt nicht */
  op?: OperatorId;
  /** schon am Morgen ausgelöst (z. B. Sonderzug bestellt) */
  started?: boolean;
}

const commuter = (op: Operator) => op.kind === 'regio' || op.kind === 'sbahn';
const longDistance = (op: Operator) => op.kind === 'ic' || op.kind === 'night';
const hourOf = (t: number) => Math.floor(t / 3600) % 24;

interface Def {
  name: string;
  /** kurzer Hinweis für „Was ist los?“ */
  hint: string;
  /** Faktor auf die Fahrgäste eines Zuges, der zu dieser Zeit ankommt */
  pax(op: Operator, hour: number, sd: SpecialDay): number;
  paper(g: Game, sd: SpecialDay): { title: string; text: string };
}

export const SPECIALS: Record<SpecialId, Def> = {
  feiertag: {
    name: 'Feiertag',
    hint: 'kaum Pendler, dafür viele Ausflügler im Fernverkehr',
    pax: (op) => (commuter(op) ? 0.55 : longDistance(op) ? 1.45 : op.kind === 'museum' ? 2 : 1),
    paper: () => ({
      title: 'Morgen ist Feiertag: Büros zu, Ausflugsziele voll',
      text: 'Wer morgen nicht arbeiten muss, fährt ins Grüne. In den Regional- und S-Bahn-Zügen wird es ruhig, dafür sind Fernzüge und Museumsbahn gut gefüllt.',
    }),
  },
  heimspiel: {
    name: 'Heimspiel',
    hint: 'ab 14 Uhr volle Regionalzüge, Fan-Sonderzug um 17:30',
    pax: (op, h) => (op.special || (commuter(op) && h >= 14 && h < 23) ? 1.9 : 1),
    paper: () => ({
      title: 'Morgen Heimspiel: Tausende Fans erwartet',
      text: 'Der Verein spielt morgen zu Hause. Ab dem frühen Nachmittag sind Regional- und S-Bahn-Züge brechend voll, der Fanclub kommt mit einem Sonderzug um 17:30 Uhr. Pünktlich gibt es eine Prämie – sonst Ärger.',
    }),
  },
  ferien: {
    name: 'Ferienbeginn',
    hint: 'volle Fern- und Nachtzüge',
    pax: (op) => (longDistance(op) ? 1.7 : commuter(op) ? 1.15 : 1),
    paper: () => ({
      title: 'Ferienbeginn: Koffer, Kinder, volle Züge',
      text: 'Ab morgen sind Ferien. Ganze Familien fahren in den Urlaub – Fern- und Nachtzüge sind ausgebucht, auch in den Regionalzügen wird es enger.',
    }),
  },
  streik: {
    name: 'Streik',
    hint: 'ein Unternehmen fährt nicht, die anderen sind voller',
    pax: (op, _h, sd) => (op.id === sd.op ? 0 : op.needsStop ? 1.3 : 1),
    paper: (_g, sd) => {
      const name = sd.op ? OPERATORS[sd.op].name : 'ein Nachbarunternehmen';
      return {
        title: `Streik bei ${name}: Züge fallen morgen aus`,
        text: `Die Belegschaft von ${name} legt morgen den ganzen Tag die Arbeit nieder. Deren Züge fahren nicht – die Fahrgäste weichen auf die anderen Züge aus, die dadurch deutlich voller werden.`,
      };
    },
  },
};

/** besonderer Tag für eine Spielzeit (oder keiner) */
export function specialAt(g: Game, t: number): SpecialDay | undefined {
  const day = Math.floor(t / 86400);
  return g.specials.find((s) => s.day === day);
}

/** Faktor auf die Fahrgäste eines Zuges */
export function specialPax(g: Game, op: Operator, at: number) {
  const sd = specialAt(g, at);
  return sd ? SPECIALS[sd.id].pax(op, hourOf(at), sd) : 1;
}

/** fährt dieses Unternehmen zu dieser Zeit? (Streik) */
export function specialRuns(g: Game, op: Operator, at: number) {
  const sd = specialAt(g, at);
  return !(sd?.id === 'streik' && sd.op === op.id);
}

/** am Vorabend (18 Uhr) vielleicht einen besonderen Tag für morgen ansetzen */
export function rollSpecial(g: Game, chance = 0.3): SpecialDay | undefined {
  const today = Math.floor(g.sim.time / 86400), tomorrow = today + 1;
  g.specials = g.specials.filter((s) => s.day >= today);
  if (g.specials.some((s) => s.day === tomorrow || s.day === today)) return undefined;
  if (Math.random() >= chance) return undefined;
  const strikable = (Object.keys(OPERATORS) as OperatorId[]).filter((id) => g.contracts[id].status === 'active' && OPERATORS[id].needsStop && !OPERATORS[id].special);
  const pool: SpecialId[] = ['feiertag', 'heimspiel', 'ferien', ...(strikable.length >= 2 ? ['streik' as const] : [])];
  const id = pool[Math.floor(Math.random() * pool.length)];
  const sd: SpecialDay = { day: tomorrow, id, op: id === 'streik' ? strikable[Math.floor(Math.random() * strikable.length)] : undefined };
  g.specials.push(sd);
  return sd;
}
