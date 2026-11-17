import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { loanLimit, loanOffers, payLoan, repayLoan, takeLoan, totalInterest } from '../src/game/Loans';
import { freshGame } from './helpers';

describe('Kredit aufnehmen (RM-FR-ECO-10)', () => {
  it('Zinsen günstiger als der automatische Kredit (3 %/Tag)', () => {
    for (const o of loanOffers(new Game())) expect(o.rate).toBeLessThan(Game.LOAN_RATE);
  });

  it('Auszahlung zählt nicht als Einnahme, Raten tilgen den Kredit vollständig', () => {
    const g = freshGame();
    g.money = 0;
    const inc = g.today().income;
    expect(takeLoan(g, { amount: 10000, days: 7, rate: 0 })).toBe(true);
    expect(g.money).toBe(10000);
    expect(g.today().income).toBe(inc);
    expect(takeLoan(g, { amount: 10000, days: 7, rate: 0 })).toBe(false);
    for (let d = 0; d < 7; d++) payLoan(g);
    expect(g.loan).toBeNull();
    const paid = 10000 - g.money;
    expect(paid).toBeGreaterThanOrEqual(10000);
    expect(paid - 10000).toBeLessThanOrEqual(totalInterest({ amount: 10000, days: 7, rate: 0.012 }) + 7);
  });

  it('Höchstbetrag hängt an der Bahnhofsstufe', () => {
    const g = freshGame();
    expect(loanOffers(g).find((o) => o.amount > loanLimit(g))?.ok).toBe(false);
    g.tier = 3;
    expect(loanOffers(g).every((o) => o.ok)).toBe(true);
  });

  it('vorzeitig tilgen und Speichern', () => {
    const g = freshGame();
    takeLoan(g, { amount: 25000, days: 14, rate: 0 });
    const g2 = new Game(JSON.parse(JSON.stringify(g.save())));
    expect(g2.loan?.rest).toBe(25000);
    expect(repayLoan(g)).toBe(true);
    expect(g.loan).toBeNull();
  });
});
