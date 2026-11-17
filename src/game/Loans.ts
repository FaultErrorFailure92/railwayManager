/**
 * Kredit aufnehmen (RM-FR-ECO-10): aktiv bei der Bank, mit Laufzeit und besseren Zinsen als der automatische Kredit.
 * Täglich wird eine Rate fällig (Tilgung + Zinsen auf die Restschuld). Vorzeitige Tilgung ist jederzeit möglich.
 */
import type { Game } from './Game';

export interface Loan {
  /** Restschuld */
  rest: number;
  /** Tilgung pro Tag (ohne Zinsen) */
  share: number;
  /** Zinssatz pro Tag */
  rate: number;
  daysLeft: number;
}

export interface LoanOffer { amount: number; days: number; rate: number }

/** Laufzeiten und Tageszinsen (automatischer Kredit: 3 % pro Tag) */
export const LOAN_TERMS = [{ days: 7, rate: 0.012 }, { days: 14, rate: 0.008 }];
export const LOAN_AMOUNTS = [10000, 25000, 50000, 100000];

/** höchster Kredit: wächst mit der Bahnhofsstufe */
export const loanLimit = (g: Game) => 25000 * (1 + g.tier * 1.5);

export function loanOffers(g: Game): (LoanOffer & { ok: boolean; why?: string })[] {
  const out: (LoanOffer & { ok: boolean; why?: string })[] = [];
  for (const amount of LOAN_AMOUNTS) {
    for (const t of LOAN_TERMS) {
      const why = g.loan ? 'Erst den laufenden Kredit tilgen' : amount > loanLimit(g) ? 'Zu hoch für deine Bahnhofsstufe' : undefined;
      out.push({ amount, days: t.days, rate: t.rate, ok: !why, why });
    }
  }
  return out;
}

/** Rate des ersten Tages (zur Anzeige) */
export const firstPayment = (o: LoanOffer) => Math.round(o.amount / o.days + o.amount * o.rate);
/** Summe aller Zinsen über die Laufzeit */
export function totalInterest(o: LoanOffer) {
  let rest = o.amount, sum = 0;
  for (let d = 0; d < o.days; d++) { sum += rest * o.rate; rest -= o.amount / o.days; }
  return Math.round(sum);
}

export function takeLoan(g: Game, o: LoanOffer) {
  const offer = loanOffers(g).find((x) => x.amount === o.amount && x.days === o.days);
  if (!offer?.ok) return false;
  g.loan = { rest: o.amount, share: o.amount / o.days, rate: offer.rate, daysLeft: o.days };
  g.addCash(o.amount);
  g.addLog(`Kredit aufgenommen: ${o.amount.toLocaleString('de-AT')} € auf ${o.days} Tage (${(offer.rate * 100).toLocaleString('de-AT')} % pro Tag)`, 'good');
  return true;
}

/** einmal am Tag: Rate abbuchen */
export function payLoan(g: Game) {
  const l = g.loan;
  if (!l) return;
  const interest = Math.round(l.rest * l.rate);
  const share = Math.min(l.rest, Math.round(l.share));
  g.book('Zinsen', -(interest + share));
  l.rest -= share;
  l.daysLeft--;
  if (l.rest <= 0.5 || l.daysLeft <= 0) {
    if (l.rest > 0.5) g.money -= Math.round(l.rest);
    g.loan = null;
    g.addLog('Kredit vollständig zurückgezahlt', 'good');
  } else {
    g.addLog(`Kreditrate: −${(interest + share).toLocaleString('de-AT')} € (Restschuld ${Math.round(l.rest).toLocaleString('de-AT')} €)`, 'info');
  }
}

/** vorzeitig tilgen (ohne weitere Zinsen) */
export function repayLoan(g: Game) {
  const l = g.loan;
  if (!l || g.money < l.rest) return false;
  g.money -= Math.round(l.rest);
  g.loan = null;
  g.addLog('Kredit vorzeitig getilgt', 'good');
  return true;
}
