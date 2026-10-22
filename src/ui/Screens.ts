import { acceptChance, cancelRisk, fairPrice, TRANSIT_FEE } from '../game/Contracts';
import type { Game } from '../game/Game';
import { fmtTime } from '../game/Game';
import { RESEARCH_BY_ID, ResearchId, ResearchTree, TREES, treeOf } from '../game/Research';
import { OPERATORS, TRAFFIC_LABEL, trafficClass } from '../sim/Operators';
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
export function researchTabsHtml(g: Game, tree: ResearchTree, quest?: string) {
  const questTree = quest ? RESEARCH_BY_ID[quest as ResearchId]?.tree : undefined;
  return TREES.map((t) => {
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
  const cols = Math.max(...list.map((r) => r.col)) + 1;
  const rows = Math.max(...list.map((r) => r.row)) + 1;
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
export function statsKey(g: Game) {
  const h = g.history[g.history.length - 1];
  return `${g.history.length}|${h ? Math.round(h.income / 50) + ',' + Math.round(h.expense / 50) + ',' + h.handled : ''}|${g.achievements.length}|${g.stats.handled}`;
}

export function statsHtml(g: Game) {
  const days = g.history.slice(-7);
  const max = Math.max(1, ...days.map((d) => Math.max(d.income, d.expense)));
  const bars = days.map((d) => {
    const bal = d.income - d.expense;
    return `<div class="st-day"><div class="st-bars"><div class="st-in" style="height:${(d.income / max) * 100}%" title="Einnahmen ${eur(d.income)} €"></div><div class="st-out" style="height:${(d.expense / max) * 100}%" title="Ausgaben ${eur(d.expense)} €"></div></div>
      <b class="${bal >= 0 ? 'ok' : 'no'}">${bal >= 0 ? '+' : '−'}${eur(Math.abs(bal))}</b><small>Tag ${d.day + 1}</small>
      <small>${d.handled ? Math.round((d.punctual / d.handled) * 100) + ' % pünktl.' : '–'}</small></div>`;
  }).join('') || '<div class="ct-empty">Noch keine Tage gespielt.</div>';
  const ops = Object.entries(g.stats.opStats ?? {}).filter(([, s]) => s.handled > 0)
    .sort((a, b) => b[1].handled - a[1].handled)
    .map(([id, s]) => {
      const o = OPERATORS[id as keyof typeof OPERATORS];
      const p = Math.round((s.punctual / s.handled) * 100);
      return `<div class="st-op"><span class="dot" style="background:${o.color}"></span><span>${o.name}</span><span>${s.handled} Züge</span>
        <div class="bar"><div style="width:${p}%;background:${p < 70 ? '#d9534f' : o.color}"></div></div><span class="${p < 70 ? 'no' : 'ok'}">${p} %</span></div>`;
    }).join('') || '<div class="ct-empty">Noch keine Züge abgefertigt.</div>';
  const ach = ACHIEVEMENTS.map((a) => {
    const on = g.achievements.includes(a.id);
    return `<div class="st-ach${on ? ' on' : ''}" title="${a.info}"><span class="slot"><img src="${ICON(a.icon)}" alt="" /></span><b>${a.name}</b><small>${a.info}</small></div>`;
  }).join('');
  return `<div class="st-sec">Tagesbilanz <small>(grün Einnahmen, rot Ausgaben)</small></div><div class="st-days">${bars}</div>
    <div class="st-sec">Pünktlichkeit je Unternehmen</div><div class="st-ops">${ops}</div>
    <div class="st-sec">Erfolge ${g.achievements.length}/${ACHIEVEMENTS.length}</div><div class="st-achs">${ach}</div>`;
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
    return `${o.id}${c.status}${c.takt}${c.price.short},${c.price.long},${Math.round(g.satisfaction[o.id])},${g.sim.time >= c.talkAfter}`;
  }).join('|') + g.minTakt + `c${g.crew}${g.researched('crew')}${g.researched('crew2')}`;
}

/** Personal: eigene Instandhalter */
function crewHtml(g: Game) {
  if (!g.researched('crew')) {
    return `<div class="ct-crew off"><img src="${ICON('tool_shovel')}" alt="" /><div><b>Instandhaltungsteam</b><small>Erforsche „Die Schrauber-Brigade“ (Stellwerk), um eigene Instandhalter einzustellen. Bis dahin: Störung anklicken und Störtrupp rufen.</small></div></div>`;
  }
  const n = g.crew;
  const workers = Array.from({ length: Game_CREW_MAX }, (_, i) => `<span class="cw${i < n ? ' on' : ''}">${portrait(31 + i * 17, 28)}</span>`).join('');
  return `<div class="ct-crew"><img src="${ICON('tool_shovel')}" alt="" />
    <div><b>Instandhaltungsteam</b><small>${n ? `rücken bei Störungen selbst aus · Reparatur ${g.repairMinutes} min · ${Math.round(15 * n)} % weniger Ausfälle` : 'noch niemand eingestellt'}${g.researched('crew2') ? ' · vorbeugende Wartung aktiv' : ''}</small></div>
    <div class="cw-list">${workers}</div>
    <div class="ct-price"><button class="btn" data-crew="-1"${n <= 0 ? ' disabled' : ''}>−</button><span>${n}</span><button class="btn" data-crew="1"${n >= Game_CREW_MAX ? ' disabled' : ''}>+</button>
    <small>${eur(n * 250)} €/Tag</small></div></div>`;
}
const Game_CREW_MAX = 4;

export function contractsHtml(g: Game) {
  const ops = contractOps(g);
  if (!ops.length) return crewHtml(g) + '<div class="ct-empty">Noch keine Verträge. Sobald dein Empfangsgebäude steht, gibt es eine Ausschreibung.</div>';
  const rows = ops.map((o) => {
    const c = g.contracts[o.id];
    const sat = Math.round(g.satisfaction[o.id]);
    const price = (cls: 'short' | 'long') => {
      const fair = fairPrice(o, cls);
      const v = c.price[cls];
      const tone = v > fair * 1.15 ? 'no' : v < fair * 0.95 ? 'ok' : '';
      return `<div class="ct-price"><button class="btn" data-op="${o.id}" data-cls="${cls}" data-d="-10">−</button>
        <span class="${tone}">${eur(v)} €</span><button class="btn" data-op="${o.id}" data-cls="${cls}" data-d="10">+</button>
        <small>fair ${eur(fair)}</small></div>`;
    };
    const takt = `<div class="ct-price"><button class="btn" data-takt="${o.id}" data-d="1">−</button>
      <span>${c.takt} min</span><button class="btn" data-takt="${o.id}" data-d="-1"${c.takt <= g.minTakt ? ' disabled' : ''}>+</button>
      <small>${c.takt <= g.minTakt && g.minTakt > 15 ? 'öfter erst mit 2. Gleis' : ''}</small></div>`;
    let status: string;
    if (c.status === 'active') {
      const risk = cancelRisk(o, c, sat);
      status = risk > 0 ? `<span class="no">⚠ Kündigung droht (${Math.round(risk * 100)} %/h)</span>` : '<span class="ok">Vertrag läuft</span>';
    } else if (g.sim.time < c.talkAfter) {
      status = `<span class="no">gekündigt · Gespräch ab ${fmtTime(c.talkAfter)}</span>`;
    } else {
      const ch = Math.round(acceptChance(o, c, sat) * 100);
      status = `<button class="btn ct-offer" data-offer="${o.id}">Angebot senden · ${ch} %</button>`;
    }
    return `<div class="ct-row${c.status === 'active' ? '' : ' off'}">
      <div class="ct-name"><span class="dot" style="background:${o.color}"></span><div><b>${o.name}</b><small>${TRAFFIC_LABEL[trafficClass(o)]} · ${o.category}</small></div></div>
      <div><small class="ct-lbl">Takt</small>${takt}</div>
      <div><small class="ct-lbl">kurzer Zug</small>${price('short')}</div>
      <div><small class="ct-lbl">langer Zug</small>${price('long')}</div>
      <div class="ct-sat"><small class="ct-lbl">Zufriedenheit</small><div class="bar"><div style="width:${sat}%;background:${sat < 35 ? '#d9534f' : o.color}"></div></div></div>
      <div class="ct-status">${status}</div>
    </div>`;
  }).join('');
  return crewHtml(g) + rows;
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
      <div class="tc-row"><span>Takt</span><span>alle ${Math.max(g.minTakt, op.takt)} min</span></div>
      <div class="tc-row"><span>Preis</span><span>${fair('short')} € / ${fair('long')} € lang</span></div>
      <div class="tc-row"><span>Halt</span><span>${op.needsStop ? (op.turnback ? 'endet hier, wendet' : 'hält bei dir') : 'fährt durch'}</span></div>
      <div class="of-space"></div>
      ${block ? `<div class="no of-block">${block}</div>` : `<button class="btn big" data-accept="${id}">${o.kind === 'tender' ? 'Wählen' : 'Annehmen'}</button>`}
    </div>`;
  }).join('');
  // ein Mensch meldet sich: Brief vom Verkehrsverbund oder Anruf vom Unternehmen
  const first = OPERATORS[o.ops[0]];
  const who = o.kind === 'tender' ? VERBUND() : contactOf(first.id, first.name);
  let say = o.text;
  if (o.kind === 'inquiry') say = `Grüß Gott, ${who.name} von ${first.name} hier! Wir würden gern bei Ihnen fahren – ${first.category}. Die Eckdaten sehen Sie unten. Kommen wir ins Geschäft?`;
  else if (/Regional/.test(o.title)) say = 'Gratulation zur Bahnhofseröffnung! Wir vergeben jetzt den Regionalverkehr. Drei Bahnunternehmen haben sich beworben – Sie dürfen EINES auswählen.';
  else if (/Güter/.test(o.title)) say = 'Auch der Güterverkehr wird neu vergeben. Güterzüge fahren bei Ihnen durch und zahlen für die Trasse. Wählen Sie EIN Unternehmen.';
  else if (/Wende/.test(o.title)) say = 'Wir suchen einen Partner für Wendezüge: Diese Züge enden bei Ihnen und fahren wieder zurück. Wen nehmen Sie?';
  const call = `<div class="call ${o.kind}"><div class="call-pic">${portrait(who.seed, 54)}</div>
    <div class="call-body"><div class="call-who"><b>${who.name}</b><small>${who.role} · ${who.org}</small></div><div class="call-say">„${say}“</div></div>
    <span class="call-tag">${o.kind === 'tender' ? '✉ BRIEF' : '☎ ANRUF'}</span></div>`;
  return `<h1 class="${o.kind === 'tender' ? '' : 'blue'}">${o.title.toUpperCase()}</h1>${call}
    <div class="of-cards">${cards}</div>
    ${o.kind === 'inquiry' ? '<button class="btn" data-decline="1">Ablehnen</button>' : ''}`;
}

export { TRANSIT_FEE };
