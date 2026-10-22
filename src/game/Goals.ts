import type { DayStat, Game } from './Game';

/** Tagesziel: kleine Aufgabe für den aktuellen Spieltag */
export interface Goal {
  kind: 'punct' | 'pax' | 'noLate' | 'shop' | 'balance';
  target: number;
  reward: number;
  fp: number;
  done: boolean;
  failed?: boolean;
}

/** Fortschritt 0..1 und Text */
export function goalProgress(goal: Goal, d: DayStat | undefined, g: Game): { value: number; text: string; label: string } {
  const eur = (n: number) => Math.round(n).toLocaleString('de-AT');
  switch (goal.kind) {
    case 'punct': {
      const n = d?.punctual ?? 0;
      return { value: Math.min(1, n / goal.target), text: `${Math.min(n, goal.target)}/${goal.target}`, label: `${goal.target} Züge pünktlich` };
    }
    case 'pax': {
      const n = d?.pax ?? 0;
      return { value: Math.min(1, n / goal.target), text: `${eur(Math.min(n, goal.target))}/${eur(goal.target)}`, label: `${eur(goal.target)} Fahrgäste` };
    }
    case 'shop': {
      const n = d?.shop ?? 0;
      return { value: Math.min(1, n / goal.target), text: `${eur(Math.min(n, goal.target))}/${eur(goal.target)} €`, label: `Läden: ${eur(goal.target)} € Umsatz` };
    }
    case 'noLate': {
      return { value: goal.failed ? 0 : 1, text: goal.failed ? 'verpasst' : 'bis Mitternacht', label: `Kein Zug über ${goal.target} min zu spät` };
    }
    case 'balance': {
      const b = d ? d.income - d.expense : 0;
      return { value: b > 0 ? 1 : 0, text: `${b >= 0 ? '+' : '−'}${eur(Math.abs(b))} €`, label: 'Tagesbilanz im Plus' };
    }
  }
  void g;
}

/** drei passende Ziele für den neuen Tag */
export function newGoals(g: Game, prev: DayStat | undefined): Goal[] {
  const level = g.sim.level;
  const pool: Goal[] = [];
  const punct = Math.max(4, Math.round((prev?.punctual ?? 4) * 1.05 + level / 2));
  pool.push({ kind: 'punct', target: punct, reward: 300 + punct * 40, fp: 1, done: false });
  const pax = Math.max(300, Math.round(((prev?.pax ?? 0) * 1.05) / 50) * 50);
  pool.push({ kind: 'pax', target: pax, reward: 400 + Math.round(pax / 4), fp: 1, done: false });
  pool.push({ kind: 'noLate', target: 10, reward: 800, fp: 2, done: false });
  pool.push({ kind: 'balance', target: 0, reward: 600, fp: 1, done: false });
  const shops = [...g.grid.buildings.values()].some((b) => !b.decor && ['bld_kiosk', 'bld_cafe', 'bld_vending', 'bld_inn', 'bld_wc'].includes(b.key));
  if (shops) {
    const shop = Math.max(150, Math.round(((prev?.shop ?? 0) * 1.2) / 50) * 50);
    pool.push({ kind: 'shop', target: shop, reward: 300 + Math.round(shop / 2), fp: 1, done: false });
  }
  // zufällig drei verschiedene
  const out: Goal[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
