/**
 * „Was ist los?“ (RM-FR-CPX-03): alle aktuellen Probleme mit Ampel, nach Dringlichkeit sortiert.
 * Jeder Eintrag: ein Satz, optional eine Stelle zum Hinspringen und eine Lösung mit einem Klick.
 */
import { BIG_REPAIR_COST, CANCEL_COST, fmtTime, Game, REPAIR_COST } from './Game';
import { connectionsAtRisk, holdConnection, letPass, MAX_WAIT, swapPlatform } from './Connections';
import { cancelRisk, fairPrice } from './Contracts';
import { OPERATORS, type OperatorId } from '../sim/Operators';
import { SHOPS } from '../world/buildings';
import { RESEARCH } from './Research';
import { SPECIALS } from './SpecialDays';
import { isCommuter, rush } from '../sim/demand';
import { maintain, MAINT_COST, wearOf, wornElements } from './Wear';

export type Level = 'rot' | 'gelb' | 'info';

/** Lösungen, die eine Oberfläche öffnen (macht der Hud) */
export type UiAction = 'inbox' | 'contracts' | 'research' | 'offer';

export interface Problem {
  /** stabile Kennung (für Anzeige ohne Flackern) */
  id: string;
  level: Level;
  text: string;
  /** Stelle auf der Karte: Feld oder Zug */
  at?: { x: number; y: number } | { train: number };
  /** Lösung mit einem Klick */
  fix?: { label: string; run?: (g: Game) => string | void; ui?: UiAction };
}

const ORDER: Record<Level, number> = { rot: 0, gelb: 1, info: 2 };
const eur = (n: number) => Math.round(n).toLocaleString('de-AT');

/** Mentor: der alte Fahrdienstleiter */
export const MENTOR = { name: 'Alois Weichensteller', role: 'Fahrdienstleiter i. R.', avatar: 9 };

export function mentorLine(list: Problem[]) {
  const red = list.filter((p) => p.level === 'rot').length, yellow = list.filter((p) => p.level === 'gelb').length;
  if (red) return red === 1 ? 'Da brennt’s! Eins nach dem anderen – fang oben an.' : `${red} Baustellen, die sofort Aufmerksamkeit brauchen. Ruhig bleiben, oben anfangen.`;
  if (yellow) return 'Nichts Dramatisches, aber ein paar Dinge würde ich mir anschauen.';
  return 'Alles im grünen Bereich. Zeit für einen Kaffee am Bahnsteig.';
}

export function problems(g: Game): Problem[] {
  const out: Problem[] = [];
  const sim = g.sim;

  // Züge blockieren sich gegenseitig
  if (sim.deadlock?.length) {
    const ids = sim.deadlock;
    out.push({
      id: 'deadlock', level: 'rot', at: { train: ids[0] },
      text: `${ids.length} Züge blockieren sich gegenseitig – hier geht nichts mehr vor und zurück.`,
      fix: {
        label: `Jüngsten Zug aufgeben (−${eur(CANCEL_COST)} €)`,
        run: (gg) => {
          const t = (gg.sim.deadlock ?? []).map((i) => gg.sim.trains.find((x) => x.id === i)).filter(Boolean).sort((a, b) => b!.plannedSpawn - a!.plannedSpawn)[0];
          if (t) gg.sim.cancelTrain(t.id);
        },
      },
    });
  }

  // Störungen
  for (const f of g.faults) {
    const { x, y } = g.grid.xy(f.k);
    if (f.cells) {
      const left = Math.max(1, Math.ceil(((f.until ?? sim.time) - sim.time) / 60));
      const what = f.kind === 'tree' ? 'Baum auf der Strecke' : 'Oberleitungsschaden';
      out.push({
        id: `big${f.k}`, level: 'rot', at: { x, y },
        text: `${what}: Streckengleis noch ${left} min gesperrt. Über ein zweites Gleis umleiten oder Züge ausfallen lassen.`,
        fix: !f.boosted && g.money >= BIG_REPAIR_COST ? { label: `Großeinsatz (−${eur(BIG_REPAIR_COST)} €): halbe Zeit`, run: (gg) => { gg.boostBigFault(f); } } : undefined,
      });
      continue;
    }
    const what = f.kind === 'switch' ? 'Weiche' : 'Signal';
    if (f.repairAt) {
      out.push({ id: `fault${f.k}`, level: 'info', at: { x, y }, text: `${what} gestört – Störtrupp ist unterwegs (fertig in ${Math.max(1, Math.ceil((f.repairAt - sim.time) / 60))} min).` });
    } else {
      out.push({
        id: `fault${f.k}`, level: 'rot', at: { x, y }, text: `${what} gestört – Züge kommen hier nicht durch.`,
        fix: g.money >= REPAIR_COST ? { label: `Störtrupp schicken (−${eur(REPAIR_COST)} €)`, run: (gg) => { gg.repairFault(x, y); } } : undefined,
      });
    }
  }

  // Geld
  if (g.money < 0) {
    out.push({
      id: 'debt', level: g.money < g.debtLimit / 2 ? 'rot' : 'gelb',
      text: `Konto im Minus (${eur(g.money)} €). Bei ${eur(g.debtLimit)} € kündigt die Bank – Zinsen laufen täglich.`,
      fix: { label: 'Verträge ansehen', ui: 'contracts' },
    });
  }

  // Verträge
  for (const id of Object.keys(OPERATORS) as OperatorId[]) {
    const c = g.contracts[id], op = OPERATORS[id];
    if (c.status !== 'active') continue;
    const sat = g.satisfaction[id];
    if (cancelRisk(op, c, sat) > 0) {
      out.push({
        id: `risk${id}`, level: 'gelb',
        text: `${op.name}: Der Preis ist für die Stimmung (${Math.round(sat)} %) zu hoch – eine Kündigung droht.`,
        fix: { label: 'Preis auf fair senken', run: (gg) => { gg.setPrice(id, 'short', fairPrice(op, 'short')); gg.setPrice(id, 'long', fairPrice(op, 'long')); } },
      });
    } else if (sat < 40) {
      out.push({ id: `sat${id}`, level: 'gelb', text: `${op.name} ist unzufrieden (${Math.round(sat)} %). Pünktlichkeit und saubere Züge helfen.`, fix: { label: 'Verträge ansehen', ui: 'contracts' } });
    }
  }

  // Züge, die lange warten
  for (const t of sim.trains) {
    if (t.waitSince === undefined || !t.waiting) continue;
    const min = Math.floor((sim.time - t.waitSince) / 60);
    if (min < 10) continue;
    out.push({ id: `wait${t.id}`, level: min >= 30 ? 'rot' : 'gelb', at: { train: t.id }, text: `${t.number} wartet seit ${min} min${t.note ? `: ${t.note}` : '.'}` });
  }

  // Ladenpreise
  for (const key of Object.keys(SHOPS)) {
    if (!g.count(key)) continue;
    const ref = SHOPS[key].ref, price = g.shopPrices[key];
    if (price / ref > 1.3) {
      out.push({
        id: `shop${key}`, level: 'gelb', text: `${SHOPS[key].name} ist zu teuer – das verärgert die Fahrgäste.`,
        fix: { label: `Preis auf Richtwert (${ref.toLocaleString('de-AT')} €)`, run: (gg) => { gg.setShopPrice(key, ref); } },
      });
    }
  }

  // Abnutzung (RM-FR-UI-12)
  const worn = wornElements(g).sort((a, b) => wearOf(g, b.k) - wearOf(g, a.k));
  if (worn.length) {
    const w = worn[0], { x, y } = g.grid.xy(w.k);
    const what = w.kind === 'switch' ? 'Weiche' : 'Signal';
    out.push({ id: 'wear', level: 'gelb', at: { x, y },
      text: `${worn.length > 1 ? `${worn.length} Weichen/Signale sind` : `Ein${w.kind === 'switch' ? 'e Weiche ist' : ' Signal ist'}`} stark abgenutzt und fallen bald aus (Ebene „Instandhaltung“: Taste Ü).`,
      fix: g.money >= MAINT_COST ? { label: `${what} (${Math.round(wearOf(g, w.k))} %) warten (−${eur(MAINT_COST)} €)`, run: (gg) => { maintain(gg, w.k); gg.addLog(`${what} gewartet (−${MAINT_COST} €)`, 'info'); } } : undefined });
  }

  // Verspätungen von außen (RM-FR-OPS-11)
  for (const t of sim.queue) {
    if (!t.extDelay || sim.ready(t) || t.plannedSpawn > sim.time + 30 * 60) continue;
    const min = Math.round(t.extDelay / 60);
    const behind = sim.blockedBehind(t).filter((q) => q.plannedSpawn <= sim.time + 10 * 60);
    if (behind.length) {
      const names = behind.map((q) => q.number).join(', ');
      out.push({ id: `ext${t.id}`, level: 'gelb',
        text: `${t.number} kommt ${min} min zu spät von außen und hält ${names} auf.`,
        fix: { label: `${names} vorlassen`, run: (gg) => { letPass(gg, t); } } });
    } else if (!t.letPass) {
      out.push({ id: `ext${t.id}`, level: 'info', text: `${t.number} kommt ${min} min zu spät von außen (nicht deine Schuld – zählt nicht gegen dich).` });
    }
  }

  // festgelegter Bahnsteig belegt (RM-FR-OPS-11)
  for (const t of sim.trains) {
    if (t.anyPlatform || !t.waiting || t.waitSince === undefined || sim.time - t.waitSince < 60) continue;
    if (t.jobs[0]?.k !== 'stop' || !t.note?.startsWith('Gleis belegt')) continue;
    const pref = sim.platformPref[`${t.op.id}:${t.dir}`] ?? sim.platformPref[t.op.id];
    if (!pref || t.route[t.route.length - 1]?.stopRun?.id !== pref) continue;
    out.push({ id: `plat${t.id}`, level: 'gelb', at: { train: t.id },
      text: `${t.number} wartet vor dem Bahnhof: sein festgelegter Bahnsteig ist belegt.`,
      fix: { label: 'Anderen Bahnsteig nehmen', run: (gg) => { swapPlatform(gg, t); } } });
  }

  // Anschlüsse in Gefahr (RM-FR-OPS-11/13)
  for (const c of connectionsAtRisk(g)) {
    const late = Math.round(sim.delayNow(c.from));
    const waiting = c.to.waitFor === c.from.id;
    out.push({
      id: `conn${c.from.id}>${c.to.id}`, level: 'gelb', at: { train: c.from.id },
      text: waiting ? `${c.to.number} wartet auf ${c.from.number} (+${late} min), damit die Umsteiger mitkommen.`
        : `Anschluss in Gefahr: ${c.from.number} ist ${late} min zu spät, ${c.to.number} fährt ${fmtTime(c.dep)}.`,
      fix: waiting ? undefined : { label: `${c.to.number} wartet (höchstens ${MAX_WAIT / 60} min)`, run: (gg) => { holdConnection(gg, c); } },
    });
  }

  // Stoßzeit (RM-FR-ECO-08)
  const r = rush(sim.time);
  if (r && g.stations().length) {
    const late = sim.trains.filter((t) => isCommuter(t.op) && sim.delayNow(t) >= 3).length;
    out.push({ id: 'rush', level: late ? 'gelb' : 'info',
      text: `Stoßzeit ${r}: volle Pendlerzüge, Verstärkerzüge unterwegs – Verspätungen kosten jetzt 50 % mehr${late ? ` (${late} ${late > 1 ? 'Pendlerzüge' : 'Pendlerzug'} verspätet)` : ''}.` });
  }

  // Kredit
  if (g.loan) out.push({ id: 'loan', level: 'info', text: `Kredit: Restschuld ${eur(g.loan.rest)} €, noch ${g.loan.daysLeft} Tage – Rate täglich um Mitternacht.` });

  // besondere Tage
  const day = Math.floor(sim.time / 86400);
  for (const sd of g.specials) {
    if (sd.day !== day && sd.day !== day + 1) continue;
    const s = SPECIALS[sd.id];
    const who = sd.op ? ` (${OPERATORS[sd.op].name})` : '';
    out.push({ id: `special${sd.day}`, level: 'info', text: `${sd.day === day ? 'Heute' : 'Morgen'}: ${s.name}${who} – ${s.hint}.` });
  }

  // Post und Angebote
  if (g.offers.open) out.push({ id: 'offer', level: 'info', text: `Offene Anfrage: ${g.offers.open.title}`, fix: { label: 'Ansehen', ui: 'offer' } });
  const unread = g.inbox.filter((e) => !e.read).length;
  if (unread) out.push({ id: 'mail', level: 'info', text: unread === 1 ? 'Ein ungelesener Brief im Postfach.' : `${unread} ungelesene Briefe im Postfach.`, fix: { label: 'Postfach öffnen', ui: 'inbox' } });

  // Forschung steht still, obwohl etwas ginge
  if (g.unlocked.has('research') && RESEARCH.some((r) => !g.researchBlock(r.id))) {
    out.push({ id: 'research', level: 'info', text: 'Es gibt Forschung, die du jetzt starten könntest.', fix: { label: 'Forschung öffnen', ui: 'research' } });
  }

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
