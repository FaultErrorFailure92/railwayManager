import { CREW, INSPECTORS, staffTip } from '../game/Staff';
import { systemOn } from '../game/Systems';
import { catchRate, FINE, INSPECTOR_MAX, INSPECTOR_WAGE } from '../game/FareDodgers';
import { acceptChance, cancelRisk, fairPrice, PARK_FEE, TRANSIT_FEE } from '../game/Contracts';
import { THROUGH_SHARE } from '../game/Foreign';
import type { Game } from '../game/Game';
import { fmtTime } from '../game/Game';
import { RESEARCH_BY_ID, ResearchId, ResearchTree, TREES, treeOf } from '../game/Research';
import { OP_OVERRIDES, OPERATORS, TRAFFIC_LABEL, trafficClass, type OperatorId } from '../sim/Operators';
import { crest } from '../game/Companies';
import { canBoost } from '../sim/demand';
import { ACHIEVEMENTS } from '../game/Achievements';
import { contactOf, VERBUND } from '../game/Board';
import { portrait } from './portrait';

const eur = (n: number) => Math.round(n).toLocaleString('de-AT');
const ICON = (name: string) => `assets/gen/icons/${name}.png`;
const CARD_W = 136, CARD_H = 96, GAP_X = 40, GAP_Y = 16;

const hm = (sec: number) => {
  const m = Math.max(0, Math.ceil(sec / 60));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

/** Zustand für das Neuzeichnen (nur bei Änderung) */
export function researchKey(g: Game, tree: ResearchTree, quest?: string) {
  const r = g.research;
  const run = TREES.map((t) => { const c = r.running?.[t.id]; return c ? `${c.id}:${Math.ceil(c.left / 300)}` : '-'; }).join(',');
  return `${tree}|${r.done.join()}|${run}|${r.points}|${Math.floor(g.money / 100)}|${quest}`;
}

/** Reiter oben: drei Bäume mit laufender Forschung */
/** sichtbare Bäume: „Anschlussfragen“ erst, wenn Fremdbahnen im Spiel sind (RM-FR-CPX-01/07) */
export const visibleTrees = (g: Game) => TREES.filter((t) => t.id !== 'link' || systemOn(g, 'foreign'));

export function researchTabsHtml(g: Game, tree: ResearchTree, quest?: string) {
  const questTree = quest ? RESEARCH_BY_ID[quest as ResearchId]?.tree : undefined;
  return visibleTrees(g).map((t) => {
    const cur = g.runningIn(t.id);
    const all = treeOf(t.id), done = all.filter((r) => g.researched(r.id)).length;
    const ready = all.some((r) => !g.researchBlock(r.id));
    const pct = cur ? 100 - (cur.left / (RESEARCH_BY_ID[cur.id].hours * 3600)) * 100 : 0;
    return `<button class="rs-tab${t.id === tree ? ' on' : ''}${questTree === t.id ? ' quest' : ''}" data-tree="${t.id}">
      <img src="${ICON(t.icon)}" alt="" /><span><b>${t.name}</b><small>${cur ? `forscht: ${RESEARCH_BY_ID[cur.id].name}` : ready ? 'bereit für neue Forschung' : t.sub} · ${done}/${all.length}</small></span>
      ${ready && !cur ? '<i class="rs-dot"></i>' : ''}<em class="rs-tabbar"><i style="width:${pct.toFixed(0)}%"></i></em></button>`;
  }).join('');
}

export function researchHtml(g: Game, tree: ResearchTree, quest?: string) {
  const list = treeOf(tree);
  // alle Bäume gleich groß
  const all = TREES.flatMap((t) => treeOf(t.id));
  const cols = Math.max(...all.map((r) => r.col)) + 1;
  const rows = Math.max(...all.map((r) => r.row)) + 1;
  const W = cols * CARD_W + (cols - 1) * GAP_X, H = rows * CARD_H + (rows - 1) * GAP_Y;
  const pos = (id: ResearchId) => {
    const r = RESEARCH_BY_ID[id];
    return { x: r.col * (CARD_W + GAP_X), y: r.row * (CARD_H + GAP_Y) };
  };
  const lines = list.flatMap((r) => r.requires.filter((q) => RESEARCH_BY_ID[q].tree === tree).map((q) => {
    const a = pos(q), b = pos(r.id);
    const x1 = a.x + CARD_W, y1 = a.y + CARD_H / 2, x2 = b.x, y2 = b.y + CARD_H / 2, xm = x1 + GAP_X / 2;
    const on = g.researched(q);
    return `<path d="M${x1} ${y1} H${xm} V${y2} H${x2}" class="${on ? 'on' : ''}" />`;
  })).join('');
  const cards = list.map((r) => {
    const p = pos(r.id);
    const done = g.researched(r.id);
    const cur = g.runningOf(r.id);
    const block = g.researchBlock(r.id);
    const state = done ? 'done' : cur ? 'running' : !block ? 'ready' : r.requires.every((q) => g.researched(q)) ? 'open' : 'locked';
    const pct = cur ? 100 - (cur.left / (r.hours * 3600)) * 100 : 0;
    const mark = done ? '<span class="rs-mark ok">✓</span>' : !block && !cur ? '<span class="rs-mark gold">!</span>' : '';
    // Voraussetzung aus einem anderen Baum: kleiner Hinweis
    const cross = r.requires.filter((q) => RESEARCH_BY_ID[q].tree !== tree && !g.researched(q)).length ? '<span class="rs-cross" title="braucht Forschung aus einem anderen Baum">↗</span>' : '';
    return `<div class="rs-card ${state}${quest === r.id && !done ? ' quest' : ''}" data-tip="${r.id}"${!block && !done && !cur ? ` data-research="${r.id}"` : ''} style="left:${p.x}px;top:${p.y}px;width:${CARD_W}px;height:${CARD_H}px">
      <img class="rs-icon" src="${ICON(r.icon)}" alt="" />${mark}${cross}
      <span class="rs-name">${r.name}</span>
      ${cur ? `<div class="rs-prog"><div style="width:${pct.toFixed(1)}%"></div></div>` : ''}
    </div>`;
  }).join('');
  return `<div class="rs-wrap" style="width:${W}px;height:${H}px"><svg width="${W}" height="${H}">${lines}</svg>${cards}</div>`;
}

/** Statistik: Tagesbilanz, Pünktlichkeit je Unternehmen, Erfolge */
/** Statistik-Reiter (RM-FR-ECO-09) */
export type StatsTab = 'money' | 'ops' | 'ach';
export const statsView: { tab: StatsTab } = { tab: 'money' };

export function statsKey(g: Game) {
  const h = g.history[g.history.length - 1];
  return `${statsView.tab}|${g.history.length}|${h ? Math.round(h.income / 50) + ',' + Math.round(h.expense / 50) + ',' + h.handled : ''}|${g.achievements.length}|${g.stats.handled}`;
}

/** kleines Liniendiagramm (SVG) */
function lineChart(vals: number[], labels: string[], fmt: (v: number) => string, color: string, zero = false) {
  if (vals.length < 2) return '<div class="ct-empty">Ab dem zweiten Tag gibt es hier eine Kurve.</div>';
  const W = 520, H = 120, P = 6;
  const lo = Math.min(zero ? 0 : Infinity, ...vals), hi = Math.max(...vals, lo + 1);
  const x = (i: number) => P + (i / (vals.length - 1)) * (W - 2 * P), y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const z = lo < 0 && hi > 0 ? `<line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" class="ch-zero" />` : '';
  const dots = vals.map((v, i) => `<rect x="${x(i) - 3}" y="${y(v) - 3}" width="6" height="6" fill="${color}"><title>${labels[i]}: ${fmt(v)}</title></rect>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${z}<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" />${dots}</svg>
    <div class="ch-axis"><span>${labels[0]}</span><span>${fmt(vals[vals.length - 1])}</span><span>${labels[labels.length - 1]}</span></div>`;
}

/** Einnahmen und Ausgaben nach Kategorie als Balken (RM-FR-ECO-09) */
function catsHtml(days: Game['history']) {
  const tot: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.cats ?? {})) tot[k] = (tot[k] ?? 0) + v;
  const ins = Object.entries(tot).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const outs = Object.entries(tot).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  if (!ins.length && !outs.length) return '';
  const max = Math.max(1, ...Object.values(tot).map(Math.abs));
  const bar = ([k, v]: [string, number]) => `<div class="st-cat"><span>${k}</span><div class="bar"><div style="width:${(Math.abs(v) / max) * 100}%;background:${v > 0 ? '#3fa34d' : '#c0392b'}"></div></div><b class="${v > 0 ? 'ok' : 'no'}">${v > 0 ? '+' : '−'}${eur(Math.abs(v))} €</b></div>`;
  return `<div class="st-two"><div><div class="st-sec">Einnahmen nach Art</div>${ins.map(bar).join('')}</div><div><div class="st-sec">Ausgaben nach Art</div>${outs.map(bar).join('')}</div></div>`;
}

export function statsHtml(g: Game) {
  const tab = statsView.tab;
  const tabs = `<div class="st-tabs">${([['money', 'Finanzen'], ['ops', 'Betrieb'], ['ach', `Erfolge ${g.achievements.length}/${ACHIEVEMENTS.length}`]] as const)
    .map(([id, l]) => `<button class="btn${tab === id ? ' on' : ''}" data-sttab="${id}">${l}</button>`).join('')}</div>`;
  const days = g.history.slice(-14);
  const lbl = days.map((d) => `Tag ${d.day + 1}`);
  if (tab === 'money') {
    const week = days.slice(-7);
    const max = Math.max(1, ...week.map((d) => Math.max(d.income, d.expense)));
    const bars = week.map((d) => {
      const bal = d.income - d.expense;
      return `<div class="st-day" title="Tag ${d.day + 1}: Einnahmen ${eur(d.income)} €, Ausgaben ${eur(d.expense)} €"><div class="st-bars"><div class="st-in" style="height:${(d.income / max) * 100}%"></div><div class="st-out" style="height:${(d.expense / max) * 100}%"></div></div>
        <b class="${bal >= 0 ? 'ok' : 'no'}">${bal >= 0 ? '+' : '−'}${eur(Math.abs(bal))}</b><small>Tag ${d.day + 1}</small></div>`;
    }).join('');
    const cash = days.map((d) => d.cash ?? 0);
    const shop = days.reduce((a, d) => a + (d.shop ?? 0), 0), inc = days.reduce((a, d) => a + d.income, 0), out = days.reduce((a, d) => a + d.expense, 0);
    return `${tabs}<div class="st-kpis"><div><b class="ok">+${eur(inc)} €</b><small>Einnahmen</small></div><div><b class="no">−${eur(out)} €</b><small>Ausgaben</small></div>
      <div><b>${eur(shop)} €</b><small>davon Läden</small></div><div><b class="${inc - out >= 0 ? 'ok' : 'no'}">${inc - out >= 0 ? '+' : '−'}${eur(Math.abs(inc - out))} €</b><small>Bilanz (${days.length} Tage)</small></div></div>
      <div class="st-sec">Kontostand</div>${lineChart(cash, lbl, (v) => `${eur(v)} €`, '#e0b84a', true)}
      ${catsHtml(days)}
      <div class="st-sec" title="grün Einnahmen, rot Ausgaben">Tagesbilanz</div><div class="st-days">${bars}</div>`;
  }
  if (tab === 'ops') {
    const ops = Object.entries(g.stats.opStats ?? {}).filter(([, s]) => s.handled > 0)
      .sort((a, b) => b[1].handled - a[1].handled)
      .map(([id, s]) => {
        const o = OPERATORS[id as keyof typeof OPERATORS];
        const p = Math.round((s.punctual / s.handled) * 100);
        return `<div class="st-op"><span class="dot" style="background:${o.color}"></span><span>${o.name}</span><span>${s.handled} Züge</span>
          <div class="bar"><div style="width:${p}%;background:${p < 70 ? '#d9534f' : o.color}"></div></div><span class="${p < 70 ? 'no' : 'ok'}">${p} %</span></div>`;
      }).join('') || '<div class="ct-empty">Noch keine Züge abgefertigt.</div>';
    const cOk = g.stats.connOk ?? 0, cMiss = g.stats.connMissed ?? 0, conn = cOk + cMiss;
    const cP = conn ? Math.round((cOk / conn) * 100) : 0;
    const punct = days.map((d) => (d.handled ? Math.round((d.punctual / d.handled) * 100) : 100));
    return `${tabs}<div class="st-two"><div><div class="st-sec">Pünktlichkeit</div>${lineChart(punct, lbl, (v) => `${v} %`, '#6fbf73')}</div>
      <div><div class="st-sec">Fahrgäste</div>${lineChart(days.map((d) => d.pax), lbl, (v) => v.toLocaleString('de-AT'), '#8fd0ff', true)}</div></div>
      <div class="st-sec">Pünktlichkeit je Unternehmen</div><div class="st-ops">${ops}</div>
      ${conn ? `<div class="st-sec">Anschlüsse</div><div class="st-ops"><div class="st-op"><span>erreicht ${cOk}</span><span>verpasst ${cMiss}</span>
        <div class="bar"><div style="width:${cP}%;background:${cP < 80 ? '#d9534f' : '#3fa34d'}"></div></div><span class="${cP < 80 ? 'no' : 'ok'}">${cP} %</span></div></div>` : ''}`;
  }
  const ach = ACHIEVEMENTS.map((a) => {
    const on = g.achievements.includes(a.id);
    return `<div class="st-ach${on ? ' on' : ''}" title="${a.info}"><span class="slot"><img src="${ICON(a.icon)}" alt="" /></span><b>${a.name}</b><small>${a.info}</small></div>`;
  }).join('');
  return `${tabs}<div class="st-achs">${ach}</div>`;
}

/** Tooltip einer Forschung */
export function researchTipHtml(g: Game, id: ResearchId) {
  const r = RESEARCH_BY_ID[id];
  const done = g.researched(id);
  const cur = g.runningOf(id);
  const block = g.researchBlock(id);
  const foot = done ? '<span class="ok">✓ erforscht</span>' : cur ? `<span>läuft · noch ${hm(cur.left)}</span>`
    : !block ? '<span class="gold">Klicken zum Erforschen</span>' : `<span class="no">${block}</span>`;
  const tn = (q: ResearchId) => RESEARCH_BY_ID[q].tree === r.tree ? RESEARCH_BY_ID[q].name : `${RESEARCH_BY_ID[q].name} (${TREES.find((t) => t.id === RESEARCH_BY_ID[q].tree)!.name})`;
  const req = r.requires.length ? `<small>braucht: ${r.requires.map(tn).join(', ')}</small>` : '';
  return `<b>${r.name}</b><div class="rs-unl">→ ${r.unlocks}</div><div>${r.info}</div>
    <div class="rs-cost"><span><img src="assets/gen/ui/flask.png" alt="" />${r.fp}</span><span><img src="assets/gen/ui/coin.png" alt="" />${eur(r.cost)}</span><span><img src="assets/gen/ui/clock.png" alt="" />${r.hours} h</span></div>
    ${req}<div>${foot}</div>`;
}

/** Unternehmen für die Vertragsliste */
function contractOps(g: Game) {
  return g.activeOperators().filter((o) => o.kind !== 'sort' || true);
}

export function contractsKey(g: Game) {
  return contractOps(g).map((o) => {
    const c = g.contracts[o.id];
    return `${o.id}${c.status}${c.takt}${c.price.short},${c.price.long},${Math.round(g.satisfaction[o.id])},${g.sim.time >= c.talkAfter}${c.mode ?? ''}`;
  }).join('|') + g.researched('linkThru') + Object.values(g.contracts).map((c) => `${+!!c.service}${c.lines ?? 1}`).join('') + Object.values(g.contracts).map((c) => +!!c.auto).join('') + g.minTakt + `c${g.crew}${g.researched('crew')}${g.researched('crew2')}i${g.inspectors}${g.researched('ticket')}`;
}

/** Personal: eigene Instandhalter */
function crewHtml(g: Game) {
  if (!systemOn(g, 'staff')) return '';
  if (!g.researched('crew')) {
    return `<div class="ct-crew off" title="Erforsche „Die Schrauber-Brigade“ (Stellwerk), um eigene Instandhalter einzustellen. Bis dahin: Störung anklicken und Störtrupp rufen."><img src="${ICON('tool_shovel')}" alt="" /><div><b>Instandhaltungsteam</b><small>noch nicht erforscht</small></div></div>`;
  }
  const n = g.crew;
  const workers = Array.from({ length: Game_CREW_MAX }, (_, i) => `<span class="cw${i < n ? ' on' : ''}" title="${staffTip(CREW[i])}">${portrait(31 + i * 17, 28)}</span>`).join('');
  return `<div class="ct-crew"><img src="${ICON('tool_shovel')}" alt="" />
    <div title="${n ? `rücken bei Störungen selbst aus · Reparatur ${g.repairMinutes} min · ${Math.round(15 * n)} % weniger Ausfälle` : 'noch niemand eingestellt'}${g.researched('crew2') ? ' · vorbeugende Wartung aktiv' : ''}"><b>Instandhaltungsteam</b></div>
    <div class="cw-list">${workers}</div>
    <div class="ct-price"><button class="btn" data-crew="-1"${n <= 0 ? ' disabled' : ''}>−</button><span>${n}</span><button class="btn" data-crew="1"${n >= Game_CREW_MAX ? ' disabled' : ''}>+</button>
    <small>${eur(n * 250)} €/Tag</small></div></div>`;
}
const Game_CREW_MAX = 4;

/** Kontrolleure (RM-FR-ECO-13) */
function inspectorsHtml(g: Game) {
  if (!g.researched('ticket') || !systemOn(g, 'staff')) return '';
  const n = g.inspectors;
  const workers = Array.from({ length: INSPECTOR_MAX }, (_, i) => `<span class="cw${i < n ? ' on' : ''}" title="${staffTip(INSPECTORS[i])}">${portrait(77 + i * 13, 28)}</span>`).join('');
  return `<div class="ct-crew"><img src="${ICON('bld_statue')}" alt="" />
    <div title="Erwischen ${Math.round(catchRate(n) * 100)} % der Schwarzfahrer · ${FINE} € je Erwischtem · bisher ${(g.stats.caught ?? 0).toLocaleString('de-AT')} von ${(g.stats.dodgers ?? 0).toLocaleString('de-AT')}"><b>Kontrolleure</b></div>
    <div class="cw-list">${workers}</div>
    <div class="ct-price"><button class="btn" data-insp="-1"${n <= 0 ? ' disabled' : ''}>−</button><span>${n}</span><button class="btn" data-insp="1"${n >= INSPECTOR_MAX ? ' disabled' : ''}>+</button>
    <small>${eur(n * INSPECTOR_WAGE)} €/Tag</small></div></div>`;
}

export function contractsHtml(g: Game) {
  const ops = contractOps(g);
  if (!ops.length) return crewHtml(g) + inspectorsHtml(g) + '<div class="ct-empty">Noch keine Verträge. Sobald dein Empfangsgebäude steht, gibt es eine Ausschreibung.</div>';
  const rows = ops.map((o) => {
    const c = g.contracts[o.id];
    const sat = Math.round(g.satisfaction[o.id]);
    const price = (cls: 'short' | 'long') => {
      const fair = fairPrice(o, cls);
      const v = c.price[cls];
      const tone = v > fair * 1.15 ? 'no' : v < fair * 0.95 ? 'ok' : '';
      return `<div class="ct-price" title="${cls === 'short' ? 'kurzer' : 'langer'} Zug · fair wären ${eur(fair)} € – zu teuer macht unzufrieden"><button class="btn" data-op="${o.id}" data-cls="${cls}" data-d="-10">−</button>
        <span class="${tone}">${eur(v)} €</span><button class="btn" data-op="${o.id}" data-cls="${cls}" data-d="10">+</button></div>`;
    };
    const night = o.kind === 'night';
    const takt = night ? `<div class="ct-price"><button class="btn" data-takt="${o.id}" data-d="1"${(c.lines ?? 1) <= 1 ? ' disabled' : ''}>−</button>
      <span>${c.lines ?? 1} Linie${(c.lines ?? 1) > 1 ? 'n' : ''}</span><button class="btn" data-takt="${o.id}" data-d="-1"${(c.lines ?? 1) >= 3 ? ' disabled' : ''}>+</button>
</div>`
      : `<div class="ct-price"${c.takt <= g.minTakt && g.minTakt > 15 ? ' title="öfter erst mit 2. Streckengleis"' : ''}><button class="btn" data-takt="${o.id}" data-d="1" title="seltener">−</button>
      <span>${c.takt} min</span><button class="btn" data-takt="${o.id}" data-d="-1"${c.takt <= g.minTakt ? ' disabled' : ''} title="öfter">+</button></div>`;
    let status: string;
    if (c.status === 'active') {
      const risk = cancelRisk(o, c, sat);
      status = risk > 0 ? `<span class="no" title="Kündigung droht: ${Math.round(risk * 100)} % je Stunde – Preis senken oder pünktlicher werden">⚠ ${Math.round(risk * 100)} %/h</span>` : '<span class="ok" title="Vertrag läuft">✓</span>';
    } else if (g.sim.time < c.talkAfter) {
      status = `<span class="no" title="gekündigt – neues Gespräch ab ${fmtTime(c.talkAfter)}">✗ ${fmtTime(c.talkAfter)}</span>`;
    } else {
      const ch = Math.round(acceptChance(o, c, sat) * 100);
      status = `<button class="btn ct-offer" data-offer="${o.id}" title="Angebot senden – Chance ${ch} %">Angebot · ${ch} %</button>`;
    }
    return `<div class="ct-row${c.status === 'active' ? '' : ' off'}">
      <div class="ct-name" title="${TRAFFIC_LABEL[trafficClass(o)]} · ${o.category}"><span class="dot" style="background:${o.color}"></span><b>${o.name}</b></div>
      <div${night ? ' title="Nachtlinien: je Nacht 1 Zug pro Richtung"' : ''}>${takt}</div>
      <div class="ct-pp">${price('short')}</div>
      <div class="ct-pp">${price('long')}<button class="btn ct-auto${c.auto ? ' on' : ''}" data-auto="${o.id}" title="Automatik: Preise immer fair halten (verstellen schaltet sie aus)">A</button></div>
      <div class="ct-sat" title="Zufriedenheit ${sat} %"><div class="bar"><div style="width:${sat}%;background:${sat < 35 ? '#d9534f' : o.color}"></div></div></div>
      <div class="ct-status">${status}${c.status === 'active' && o.foreign ? foreignModeBtn(g, o.id) : ''}${c.status === 'active' && o.needsStop && o.kind !== 'freight' && !o.foreign ? `<button class="btn ct-svc${c.service ? ' on' : ''}" data-svc="${o.id}" data-tt="Abstellen &amp; Pflege: ${o.turnback ? 'jeder Wendezug' : 'jeder zweite Zug endet hier,'} wird abgestellt (Remise bevorzugt), gereinigt, gewaschen oder repariert und fährt zurück. Je Abstellung ${PARK_FEE.siding}–${PARK_FEE.remise} € plus Pflege-Preise.">${c.service ? '✓' : '○'} Pflege</button>` : ''}${c.status === 'active' && canBoost(o, g.sim.taktOf(o.id)) ? `<button class="btn ct-svc${c.boost ? ' on' : ''}" data-boost="${o.id}" data-tt="Verstärkerzüge: In der Stoßzeit (6–9 und 16–19 Uhr) schickt ${o.name} zusätzlich einen Zug zwischen zwei Regelzügen – mehr Halte, mehr Einnahmen, aber auch mehr Betrieb. Nur einschalten, wenn der Bahnhof genug Bahnsteige hat.">${c.boost ? '✓' : '○'} Verstärker</button>` : ''}</div>
    </div>`;
  }).join('');
  return crewHtml(g) + inspectorsHtml(g) + `<div class="ct-row ct-headrow"><span>Unternehmen</span><span>Takt</span><span>kurzer Zug</span><span>langer Zug</span><span>Zufriedenheit</span><span></span></div>` + rows;
}

/** Fremdbahn-Vertrag: Halten oder Durchfahren (RM-FR-MAP-09) */
function foreignModeBtn(g: Game, op: OperatorId) {
  const mode = g.contracts[op].mode ?? 'stop';
  const can = g.researched('linkThru');
  const tip = mode === 'stop'
    ? `Halten: Züge der ${OPERATORS[op].name} halten bei dir, Fahrgäste steigen um (+${Math.round((g.researched('linkPax') ? 0.1 : 0.05) * 100)} % Fahrgäste für alle Züge).${can ? ' Klicken: Durchfahrt.' : ' Durchfahrt erst mit „Freie Fahrt für fremde Bahnen“ (Anschlussfragen).'}`
    : `Durchfahren: Züge fahren ohne Halt über deine Gleise und zahlen ${Math.round(THROUGH_SHARE * 100)} % des Preises. Klicken: wieder halten.`;
  return `<button class="btn ct-svc on" data-fmode="${op}" data-tt="${tip}"${!can && mode === 'stop' ? ' disabled' : ''}>${mode === 'stop' ? '⏸ Halten' : '⇥ Durchfahren'}</button>`;
}

/** Ausschreibung / Anfrage als Karten */
export function offerHtml(g: Game) {
  const o = g.offers.open;
  if (!o) return '';
  const cards = o.ops.map((id) => {
    const op = OPERATORS[id];
    const block = g.canRun(id);
    const cars = op.cars.map((c, i) => `<img src="assets/gen/car_${op.id}_${c === 'wagon' ? 'wagon0' : c === 'ecab' ? (i ? 'ecabW' : 'ecabE') : c}_0.png" alt="" />`).join('');
    const fair = (cls: 'short' | 'long') => eur(fairPrice(op, cls));
    return `<div class="of-card${block ? ' off' : ''}">
      <div class="tc-head"><span class="dot" style="background:${op.color}"></span><b>${op.name}</b></div>
      <div class="tc-sub">${TRAFFIC_LABEL[trafficClass(op)]} · ${op.category}</div>
      <div class="tc-cars">${cars}</div>
      <div class="tc-row"><span>Antrieb</span><span>${op.traction === 'electric' ? '⚡ elektrisch' : op.traction === 'steam' ? '♨ Dampf' : '⛽ Diesel'}</span></div>
      <div class="tc-row"><span>Takt</span><span>${op.kind === 'night' ? 'nachts, 1–3 Linien' : `alle ${Math.max(g.minTakt, op.takt)} min`}</span></div>
      <div class="tc-row"><span>Preis</span><span>${fair('short')} € / ${fair('long')} € lang</span></div>
      <div class="tc-row"><span>Halt</span><span>${op.foreign ? 'hält bei dir, Umsteiger' : op.needsStop ? (op.turnback ? 'endet hier, wendet' : 'hält bei dir') : 'fährt durch'}</span></div>
      <div class="of-space"></div>
      ${block ? `<div class="no of-block">${block}</div>` : `<button class="btn big" data-accept="${id}">${o.kind === 'tender' ? 'Wählen' : 'Annehmen'}</button>`}
    </div>`;
  }).join('');
  // ein Mensch meldet sich: Brief vom Verkehrsverbund oder Anruf vom Unternehmen
  const first = OPERATORS[o.ops[0]];
  const who = o.kind === 'tender' ? VERBUND() : contactOf(first.id, first.name);
  let say = o.text;
  const own = OP_OVERRIDES[first.id];
  if (o.kind === 'inquiry') say = `Grüß Gott, ${who.name} von ${first.name} hier!${own?.motto ? ` ${own.motto} –` : ''} Wir würden gern bei Ihnen fahren – ${first.category}. Die Eckdaten sehen Sie unten. Kommen wir ins Geschäft?`;
  if (o.kind === 'inquiry' && first.foreign) say = `Grüß Gott, ${who.name} von der ${first.name}! Unsere Strecke hängt jetzt an Ihren Gleisen. Sollen unsere Züge bei Ihnen halten? Unsere Fahrgäste steigen um – das bringt Ihnen mehr Kundschaft. Ob halten oder nur durchfahren, regeln wir im Vertrag.`;
  else if (/Regional/.test(o.title)) say = 'Gratulation zur Bahnhofseröffnung! Wir vergeben jetzt den Regionalverkehr. Drei Bahnunternehmen haben sich beworben – Sie dürfen EINES auswählen.';
  else if (/Güter/.test(o.title)) say = 'Auch der Güterverkehr wird neu vergeben. Güterzüge fahren bei Ihnen durch und zahlen für die Trasse. Wählen Sie EIN Unternehmen.';
  else if (/Wende/.test(o.title)) say = 'Wir suchen einen Partner für Wendezüge: Diese Züge enden bei Ihnen und fahren wieder zurück. Wen nehmen Sie?';
  const call = `<div class="call ${o.kind}"><div class="call-pic">${portrait(who.seed, 54)}${own && o.kind === 'inquiry' ? crest(own, 26) : ''}</div>
    <div class="call-body"><div class="call-who"><b>${who.name}</b><small>${who.role} · ${who.org}</small></div><div class="call-say">„${say}“</div></div>
    <span class="call-tag">${o.kind === 'tender' ? '✉ BRIEF' : '☎ ANRUF'}</span></div>`;
  return `<h1 class="${o.kind === 'tender' ? '' : 'blue'}">${o.title.toUpperCase()}</h1>${call}
    <div class="of-cards">${cards}</div>
    ${o.kind === 'inquiry' ? '<button class="btn" data-decline="1">Ablehnen</button>' : ''}`;
}

export { TRANSIT_FEE };
