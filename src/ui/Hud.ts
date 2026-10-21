import { COST } from '../config';
import { Game, fmtTime } from '../game/Game';
import { MISSIONS, ToolId } from '../game/Missions';
import { clearSave, saveState, writeSave } from '../game/storage';
import { OPERATORS } from '../sim/Operators';
import { FACILITY_RESEARCH, RESEARCH_BY_ID, ResearchId } from '../game/Research';
import { cancelRisk } from '../game/Contracts';
import { contractsHtml, contractsKey, researchHtml, researchKey, TRANSIT_FEE } from './Screens';
import type { Train } from '../sim/Simulation';
import type { GameScene, UiState } from '../render/GameScene';
import { VARIANTS, typing, variantOf } from '../render/GameScene';

const $ = (id: string) => document.getElementById(id)!;
const eur = (n: number) => Math.round(n).toLocaleString('de-AT');
const SPEEDS = [1, 2, 4, 8];
const ICON = (name: string) => `assets/gen/icons/${name}.png`;

interface ToolDef { id: ToolId; label: string; key: string; icon?: string; cost?: number; help: string }

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Ansehen', key: '1', icon: 'tool_cursor', help: 'Ziehen = Karte verschieben · Mausrad = Zoom · Zug anfahren = Infos' },
  { id: 'land', label: 'Land kaufen', key: '2', icon: 'tool_flag', help: 'Gelbe Parzelle anklicken' },
  { id: 'platform', label: 'Bahnsteig', key: '3', icon: 'platform', cost: COST.platform, help: 'Neben dem Gleis ziehen' },
  { id: 'track', label: 'Gleis', key: '4', icon: 'track', cost: COST.track,
    help: 'Ziehen: gerade oder schräg in eine andere Reihe – Kurven, Weichen und Kreuzungen setzt das Spiel selbst' },
  { id: 'switch', label: 'Weiche', key: '5', cost: COST.switch, help: 'Gleiswechsel und Abzweige · R = nächste Variante' },
  { id: 'signal', label: 'Signal', key: '6', cost: COST.signal, help: 'Auf Gleis klicken · R = Fahrtrichtung' },
  { id: 'wire', label: 'Oberleitung', key: '7', icon: 'tool_wire', cost: COST.wire, help: 'Über Gleise ziehen · ohne Oberleitung halten nur Dieselzüge' },
  { id: 'access', label: 'Zugang', key: '8', help: 'Von Bahnsteig zu Bahnsteig quer über die Gleise ziehen' },
  { id: 'building', label: 'Gebäude', key: 'B', help: 'Klicken zum Bauen · R = nächstes Gebäude' },
  { id: 'facility', label: 'Anlagen', key: 'N', help: 'Auf Gleise setzen bzw. Gleise markieren · R = nächste' },
  { id: 'remove', label: 'Abriss', key: 'X', icon: 'tool_shovel', help: 'Klick: Signal → Gebäude → Zugang → Bahnsteig → Markierung → Gleis' },
];

const STATE_TEXT: Record<string, string> = {
  queued: 'angekündigt', running: 'fährt', dwell: 'hält am Bahnsteig', parked: 'abgestellt',
  rolling: 'rollt ab', stored: 'im Richtungsgleis', done: 'fertig',
};

export class Hud {
  private ribbonUntil = 0;
  private newGameArmed = 0;
  private savedFlash = 0;
  private fresh = new Set<ToolId>();
  private lastVariantsKey = '';
  private lastQuest = -1;
  /** Zug unter der Maus in der Zugliste */
  private listHover: { id: number; el: HTMLElement } | null = null;
  private pausedBeforeMenu = false;

  constructor(private g: Game, private ui: UiState, private scene: () => GameScene | undefined, private hadSave: boolean, freshStart = false) {
    this.buildHotbar();

    $('speed').querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => this.setSpeed(Number((b as HTMLElement).dataset.speed)));
    });
    $('btn-save').onclick = () => { if (writeSave(this.g.save())) this.savedFlash = performance.now() + 1500; };
    $('btn-menu').onclick = () => this.openMenu();
    $('company').onclick = () => this.askName();
    $('name-ok').onclick = () => this.confirmName();
    ($('name-input') as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') this.confirmName(); });
    document.querySelectorAll('[data-fold]').forEach((h) => {
      h.addEventListener('click', () => $((h as HTMLElement).dataset.fold!).classList.toggle('closed'));
    });
    $('q-show').onclick = () => this.showQuest();

    // Zugliste: Hover = Vorschau, Klick = hinschwenken
    const list = $('trains');
    list.addEventListener('mouseover', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null;
      this.listHover = li ? { id: Number(li.dataset.id), el: li } : null;
    });
    list.addEventListener('mouseleave', () => { this.listHover = null; });
    list.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null;
      if (li) this.scene()?.focusTrain(Number(li.dataset.id));
    });

    // Hauptmenü
    $('m-continue').onclick = () => this.closeMenu();
    $('m-new').onclick = () => this.newGame();
    $('m-help').onclick = () => $('m-helpbox').classList.toggle('hidden');

    $('ev-ok').onclick = () => this.closeEvent();
    $('btn-research').onclick = () => this.openScreen('research');
    $('btn-contracts').onclick = () => this.openScreen('contracts');
    document.querySelectorAll('[data-close]').forEach((b) => {
      (b as HTMLElement).onclick = () => this.closeScreen();
    });
    $('ct-transit').textContent = String(TRANSIT_FEE);
    $('rs-tree').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-research]') as HTMLElement | null;
      if (b && this.g.startResearch(b.dataset.research as ResearchId)) this.renderScreen(true);
    });
    $('ct-table').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest('[data-op]') as HTMLElement | null;
      if (b) {
        const op = b.dataset.op as keyof typeof OPERATORS, cls = b.dataset.cls as 'short' | 'long';
        const step = Number(b.dataset.d) * ((e as MouseEvent).shiftKey ? 5 : 1);
        this.g.setPrice(op, cls, this.g.contracts[op].price[cls] + step);
      }
      const o = t.closest('[data-offer]') as HTMLElement | null;
      if (o) this.g.offer(o.dataset.offer as keyof typeof OPERATORS);
      this.renderScreen(true);
    });
    window.addEventListener('keydown', (e) => {
      if (!$('event').classList.contains('hidden')) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); this.closeEvent(); }
        return;
      }
      if (!$('modal').classList.contains('hidden') || typing()) return;
      if (this.screen) {
        if (e.key === 'Escape' || (e.key.toLowerCase() === 'f' && this.screen === 'research') || (e.key.toLowerCase() === 'v' && this.screen === 'contracts')) this.closeScreen();
        return;
      }
      if (!this.ui.menu && e.key.toLowerCase() === 'f') { this.openScreen('research'); return; }
      if (!this.ui.menu && e.key.toLowerCase() === 'v') { this.openScreen('contracts'); return; }
      if (e.key === 'Escape') {
        if (this.ui.menu) { if (this.hadSave || this.g.company) this.closeMenu(); }
        else if (this.ui.tool !== 'select') this.ui.tool = 'select';
        else this.openMenu();
        return;
      }
      if (this.ui.menu) return;
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.g.paused ? this.g.speed : 0); }
      if (e.key === '+' || e.key === '.') this.stepSpeed(1);
      if (e.key === '-' || e.key === ',') this.stepSpeed(-1);
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) this.pick(t.id);
    });

    if (freshStart) {
      this.ui.menu = false;
      $('menu').classList.add('hidden');
      this.askName();
    } else this.openMenu();
    this.update();
    setInterval(() => this.update(), 120);
  }

  // ------------------------------------------------------------ Hauptmenü
  private openMenu() {
    if (this.ui.menu && !$('menu').classList.contains('hidden')) return;
    this.pausedBeforeMenu = this.g.paused;
    this.g.paused = true;
    this.ui.menu = true;
    this.ui.tool = 'select';
    const running = this.hadSave || !!this.g.company;
    $('m-continue').style.display = running ? '' : 'none';
    $('m-new').textContent = running ? 'Neues Spiel' : 'Spiel starten';
    $('m-sub').textContent = running ? (this.g.company || '') : '';
    this.newGameArmed = 0;
    $('menu').classList.remove('hidden');
  }

  private closeMenu() {
    $('menu').classList.add('hidden');
    this.ui.menu = false;
    this.g.paused = this.pausedBeforeMenu;
    if (!this.g.company) this.askName();
  }

  private newGame() {
    const running = this.hadSave || !!this.g.company;
    if (!running) { this.pausedBeforeMenu = false; this.closeMenu(); return; }
    if (performance.now() < this.newGameArmed) {
      saveState.disabled = true;
      clearSave();
      try { sessionStorage.setItem('rm_new', '1'); } catch { /* egal */ }
      location.reload();
    } else this.newGameArmed = performance.now() + 5000;
  }

  // ------------------------------------------------------------ Namen (Firma, Bahnhof)
  private naming: { kind: 'company' } | { kind: 'station'; id: number } = { kind: 'company' };
  private pausedBeforeDialog = false;

  private openNameDialog(title: string, text: string, value: string, placeholder: string) {
    const m = $('modal');
    if (m.classList.contains('hidden')) this.pausedBeforeDialog = this.g.paused;
    m.querySelector('h2')!.textContent = title;
    m.querySelector('p')!.textContent = text;
    const inp = $('name-input') as HTMLInputElement;
    inp.value = value;
    inp.placeholder = placeholder;
    m.classList.remove('hidden');
    this.g.paused = true;
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  }

  private askName() {
    this.naming = { kind: 'company' };
    this.openNameDialog('Deine Bahngesellschaft', 'Wie soll dein Unternehmen heißen?', this.g.company, 'z.B. Donaubahn AG');
    $('name-ok').textContent = this.g.company ? 'Passt!' : "Los geht's!";
  }

  private askStation(id: number) {
    const b = this.g.grid.buildings.get(id);
    if (!b) return;
    this.naming = { kind: 'station', id };
    this.openNameDialog('Neuer Bahnhof', 'Wie soll dieser Bahnhof heißen?', b.name ?? '', 'z.B. Donaufeld');
    $('name-ok').textContent = 'Taufen!';
  }

  private confirmName() {
    const v = ($('name-input') as HTMLInputElement).value.trim();
    const first = !this.g.company;
    if (this.naming.kind === 'company') this.g.company = v || 'Meine Bahn AG';
    else this.g.stationName(this.naming.id, v || this.g.suggestStationName());
    ($('name-input') as HTMLInputElement).blur();
    $('modal').classList.add('hidden');
    this.g.paused = first && this.naming.kind === 'company' ? false : this.pausedBeforeDialog;
  }

  // ------------------------------------------------------------ Forschung / Verträge
  private screen: 'research' | 'contracts' | null = null;
  private pausedBeforeScreen = false;
  private screenKey = '';

  private openScreen(name: 'research' | 'contracts') {
    if (name === 'research' && !this.g.unlocked.has('research')) return;
    if (this.screen === name) { this.closeScreen(); return; }
    if (!this.screen) { this.pausedBeforeScreen = this.g.paused; this.g.paused = true; }
    else $(this.screen).classList.add('hidden');
    this.screen = name;
    this.ui.tool = 'select';
    $(name).classList.remove('hidden');
    this.renderScreen(true);
  }

  private closeScreen() {
    if (!this.screen) return;
    $(this.screen).classList.add('hidden');
    this.screen = null;
    this.g.paused = this.pausedBeforeScreen;
  }

  private renderScreen(force = false) {
    if (!this.screen) return;
    const mt = this.g.missionTool();
    const quest = mt?.tool === 'research' ? mt.variant : undefined;
    const key = this.screen === 'research' ? researchKey(this.g, quest) : contractsKey(this.g);
    if (!force && key === this.screenKey) return;
    this.screenKey = key;
    if (this.screen === 'research') {
      $('rs-fp').textContent = String(this.g.research.points);
      $('rs-money').textContent = eur(this.g.money);
      $('rs-tree').innerHTML = researchHtml(this.g, quest);
    } else $('ct-table').innerHTML = contractsHtml(this.g);
  }

  // ------------------------------------------------------------ Ereignis-Screen (Auftrag erfüllt)
  private eventQueue: string[] = [];
  private pausedBeforeEvent = false;

  private showEvent(html: string) {
    if (!$('event').classList.contains('hidden')) { this.eventQueue.push(html); return; }
    this.pausedBeforeEvent = this.g.paused;
    this.g.paused = true;
    $('ev-body').innerHTML = html;
    const conf = $('ev-confetti');
    conf.innerHTML = Array.from({ length: 40 }, (_, i) => {
      const c = ['#ffd23c', '#ff6a5a', '#7dff8a', '#5ab4ff', '#ffffff'][i % 5];
      return `<i style="left:${Math.random() * 100}%;background:${c};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s"></i>`;
    }).join('');
    $('event').classList.remove('hidden');
  }

  private closeEvent() {
    $('event').classList.add('hidden');
    this.g.paused = this.pausedBeforeEvent;
    const next = this.eventQueue.shift();
    if (next) this.showEvent(next);
  }

  // ------------------------------------------------------------ Werkzeuge
  private pick(id: ToolId) {
    if (!this.g.unlocked.has(id)) return;
    this.ui.tool = id;
    this.fresh.delete(id);
  }

  private toolIcon(t: ToolDef) {
    return VARIANTS[t.id] ? variantOf(this.ui, t.id)!.icon : t.icon!;
  }

  private buildHotbar() {
    const bar = $('hotbar');
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.dataset.tool = t.id;
      b.innerHTML = `<img alt="" /><span class="key">${t.key}</span>${t.cost ? `<span class="cost">${t.cost}</span>` : ''}`;
      b.onclick = () => this.pick(t.id);
      b.onmouseenter = () => (b.dataset.hover = '1');
      b.onmouseleave = () => delete b.dataset.hover;
      bar.appendChild(b);
    }
  }

  private renderVariants() {
    const v = VARIANTS[this.ui.tool];
    const sel = this.ui.variant[this.ui.tool] ?? 0;
    const mt = this.g.missionTool();
    const questVariant = mt?.tool === this.ui.tool ? mt.variant : undefined;
    const key = `${this.ui.tool}|${sel}|${questVariant}|${this.g.research.done.length}`;
    if (key === this.lastVariantsKey) return;
    this.lastVariantsKey = key;
    const box = $('variants');
    box.innerHTML = '';
    if (!v || v.length < 2) return;
    v.forEach((item, i) => {
      const b = document.createElement('button');
      const need = this.ui.tool === 'facility' ? FACILITY_RESEARCH[item.key] : undefined;
      const lockedV = !!need && !this.g.researched(need);
      b.className = `slot${i === sel ? ' on' : ''}${item.key === questVariant && i !== sel ? ' quest' : ''}${lockedV ? ' locked' : ''}`;
      b.title = item.label;
      b.innerHTML = `<img src="${ICON(item.icon)}" alt="" />${item.cost ? `<span class="cost">${item.cost}</span>` : ''}`;
      b.onclick = () => { this.ui.variant[this.ui.tool] = i; };
      box.appendChild(b);
    });
  }

  private setSpeed(s: number) {
    if (s === 0) this.g.paused = true;
    else { this.g.paused = false; this.g.speed = s; }
  }

  private stepSpeed(d: number) {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.g.speed) + d));
    this.setSpeed(SPEEDS[i]);
  }

  /** Karte zum Auftrag schwenken und Werkzeug wählen */
  private showQuest() {
    const mt = this.g.missionTool();
    if (mt?.tool === 'research') { this.openScreen('research'); return; }
    if (mt) {
      this.pick(mt.tool);
      if (mt.variant) {
        const idx = VARIANTS[mt.tool]?.findIndex((v) => v.key === mt.variant) ?? -1;
        if (idx >= 0) this.ui.variant[mt.tool] = idx;
      }
    }
    const h = this.scene()?.hint ?? [];
    if (h.length) {
      const c = h[Math.floor(h.length / 2)];
      this.scene()?.focus(c.x, c.y);
    }
  }

  // ------------------------------------------------------------ Zuginfo
  private status(t: Train): string {
    const sim = this.g.sim;
    if (t.state === 'queued') {
      const late = sim.time - t.plannedSpawn;
      return late > 0 ? `wartet vor der Einfahrt +${Math.ceil(late / 60)} min` : `Einfahrt ${fmtTime(t.plannedSpawn)}`;
    }
    if (t.state === 'dwell') return t.op.turnback && !t.turned ? 'hält, wendet hier' : 'hält am Bahnsteig';
    if (t.state === 'parked') {
      const where = t.parkKind === 'remise' ? 'in der Remise' : t.parkKind === 'workshop' ? 'in der Werkstatt' : 'auf dem Abstellgleis';
      return where;
    }
    if (t.state !== 'running') return STATE_TEXT[t.state];
    if (t.waiting) return t.note ?? 'wartet am Signal';
    const j = t.jobs[0];
    if (!j) return 'fährt';
    if (j.k === 'stop') return 'fährt zum Bahnsteig';
    if (j.k === 'park') return j.wash ? 'fährt zur Pflege' : 'fährt zum Abstellen';
    if (j.k === 'hump') return 'fährt zum Abrollberg';
    return t.departure ? 'fährt sortiert ab' : 'fährt aus';
  }

  private bar(v: number, color: string) {
    return `<div class="bar"><div style="width:${Math.round(Math.max(0, Math.min(100, v)))}%;background:${color}"></div></div>`;
  }

  private card(t: Train) {
    const delay = Math.round(this.g.sim.delayNow(t));
    const isPax = t.capacity > 0;
    const load = isPax ? (t.passengers / t.capacity) * 100 : 0;
    const kmh = Math.round(t.v * 15);
    const cars = t.cars.map((c) => `<img src="assets/gen/car_${t.op.id}_${c}_0.png" alt="" />`).join('');
    const dirTxt = t.dir === 'E' ? '→ Ost' : '← West';
    const rows = [
      `<div class="tc-head"><span class="dot" style="background:${t.op.color}"></span><b>${t.number}</b><span class="muted">${dirTxt}</span></div>`,
      `<div class="tc-sub">${t.op.category} · ${t.op.name}</div>`,
      `<div class="tc-cars">${cars}</div>`,
      `<div class="tc-row"><span>Status</span><span>${this.status(t)}</span></div>`,
    ];
    if (t.state !== 'queued') rows.push(`<div class="tc-row"><span>Tempo</span><span>${kmh} km/h</span></div>`);
    if (t.op.kind !== 'sort' && t.state !== 'rolling' && t.state !== 'stored') {
      rows.push(`<div class="tc-row"><span>Fahrplan</span><span class="${delay > 3 ? 'no' : 'ok'}">${delay > 0 ? `+${delay} min` : 'pünktlich'}</span></div>`);
    }
    if (isPax) rows.push(`<div class="tc-row"><span>Auslastung</span>${this.bar(load, load > 85 ? '#d9534f' : '#6cc04a')}<span>${t.passengers}/${t.capacity}</span></div>`);
    rows.push(`<div class="tc-row"><span>Antrieb</span><span>${t.op.traction === 'electric' ? '⚡ elektrisch' : '⛽ Diesel'}</span></div>`);
    rows.push(`<div class="tc-row"><span>Schmutz</span>${this.bar(t.dirt, '#9a7a4a')}<span>${Math.round(t.dirt)}</span></div>`);
    rows.push(`<div class="tc-row"><span>Verschleiß</span>${this.bar(t.wear, '#b0623a')}<span>${Math.round(t.wear)}</span></div>`);
    if (t.dest !== undefined) rows.push(`<div class="tc-row"><span>Ziel</span><span>Richtung ${['Nord', 'Süd', 'West'][t.dest]}</span></div>`);
    return rows.join('');
  }

  private updateCard() {
    const box = $('traincard');
    const sim = this.g.sim;
    const find = (id: number) => sim.trains.find((t) => t.id === id) ?? sim.queue.find((t) => t.id === id);
    let t: Train | undefined, x = 0, y = 0, side: 'mouse' | 'list' = 'mouse';
    if (this.listHover && document.body.contains(this.listHover.el)) {
      t = find(this.listHover.id);
      const r = this.listHover.el.getBoundingClientRect();
      x = r.left - 12; y = r.top; side = 'list';
      this.ui.hoverTrain = t ? t.id : null;
    } else if (this.ui.hoverTrain !== null && !this.ui.menu) {
      t = find(this.ui.hoverTrain);
      x = this.ui.mouse.x + 18; y = this.ui.mouse.y + 18;
    }
    if (!t) { box.classList.add('hidden'); return; }
    box.innerHTML = this.card(t);
    box.classList.remove('hidden');
    const w = box.offsetWidth, h = box.offsetHeight;
    if (side === 'list') x -= w;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }

  // ------------------------------------------------------------ Aktualisieren
  update() {
    const g = this.g, sim = g.sim;
    const now = performance.now();

    $('company-name').textContent = g.company || '…';
    $('clock').textContent = fmtTime(sim.time);
    $('money').textContent = `${eur(g.money)} €`;
    $('money').style.color = g.money < 0 ? 'var(--bad)' : '';
    $('punct').textContent = g.stats.handled ? `${Math.round(g.punctuality * 100)} %` : '–';
    $('pax').textContent = g.stats.passengers.toLocaleString('de-AT');
    const mood = this.scene()?.peopleMood();
    if (mood) {
      $('mood').textContent = mood.waiting ? (mood.angry ? `${mood.angry} verärgert` : 'zufrieden') : '–';
      $('mood').classList.toggle('bad', mood.angry > 0);
    }

    $('speed').querySelectorAll('button').forEach((b) => {
      const s = Number((b as HTMLElement).dataset.speed);
      b.classList.toggle('on', g.paused ? s === 0 : s === g.speed);
    });
    $('fp').textContent = String(g.research.points);
    const rc = g.research.current;
    $('rs-mini').style.width = rc ? `${(100 - (rc.left / (RESEARCH_BY_ID[rc.id].hours * 3600)) * 100).toFixed(0)}%` : '0';
    $('btn-research').classList.toggle('locked', !g.unlocked.has('research'));
    const mtq = g.missionTool();
    $('btn-research').classList.toggle('quest', mtq?.tool === 'research' && this.screen !== 'research');
    const warn = Object.values(OPERATORS).some((o) => {
      const c = g.contracts[o.id];
      return o.kind !== 'sort' && (!c.active ? g.sim.time >= c.talkAfter && g.activeOperators().includes(o) : cancelRisk(o, c, g.satisfaction[o.id]) > 0);
    });
    $('ct-warn').textContent = warn ? '!' : '';
    this.renderScreen();
    $('btn-save').textContent = now < this.savedFlash ? 'Gespeichert ✓' : 'Speichern';
    if (this.ui.menu) {
      const armed = now < this.newGameArmed;
      if (this.hadSave || g.company) $('m-new').textContent = armed ? 'Wirklich? Spielstand weg!' : 'Neues Spiel';
      $('m-new').classList.toggle('warn', armed);
    }

    // Baumenü
    const mt = g.missionTool();
    let hovered: ToolDef | undefined;
    $('hotbar').querySelectorAll('.slot').forEach((el) => {
      const b = el as HTMLElement;
      const t = TOOLS.find((x) => x.id === b.dataset.tool)!;
      const img = b.querySelector('img')!;
      const src = ICON(this.toolIcon(t));
      if (!img.src.endsWith(src)) img.src = src;
      const locked = !g.unlocked.has(t.id);
      b.classList.toggle('locked', locked);
      b.classList.toggle('on', this.ui.tool === t.id);
      const isQuest = !!mt && mt.tool === t.id && this.ui.tool !== t.id && !locked;
      b.classList.toggle('quest', isQuest);
      const badge = isQuest ? '!' : this.fresh.has(t.id) ? 'NEU' : '';
      let el2 = b.querySelector('.badge') as HTMLElement | null;
      if (badge && !el2) { el2 = document.createElement('span'); b.appendChild(el2); }
      if (el2) {
        if (!badge) el2.remove();
        else { el2.textContent = badge; el2.className = `badge${badge === 'NEU' ? ' new' : ''}`; }
      }
      if (b.dataset.hover) hovered = t;
    });
    this.renderVariants();

    // Tooltip: Werkzeug + Variante + Kosten/Grund
    const t = hovered ?? TOOLS.find((x) => x.id === this.ui.tool)!;
    const v = variantOf(this.ui, t.id);
    const locked = !g.unlocked.has(t.id);
    let html = `<b>${t.label}</b>${v ? ` · ${v.label}` : ''}`;
    if (v?.info && v.info !== 'Deko') html += ` <small>(${v.info})</small>`;
    const viaResearch: Partial<Record<ToolId, string>> = { wire: 'Oberleitung', access: 'Bahnsteigzugänge', facility: 'Abstellgleise' };
    if (locked) html += ` <span class="no">· ${viaResearch[t.id] ? `im Forschungsbaum: ${viaResearch[t.id]}` : 'kommt mit einem späteren Auftrag'}</span>`;
    else if (!hovered && this.ui.message) {
      const bad = !/€$/.test(this.ui.message);
      html += ` · <span class="${bad ? 'no' : 'ok'}">${this.ui.message}</span>`;
    } else html += ` <small>· ${t.help}</small>`;
    if (t.id === 'select' && !hovered) html = '';
    $('tooltip').innerHTML = html;

    // Auftrag
    const m = g.mission;
    const q = g.missionInfo();
    $('q-count').textContent = m ? `AUFTRAG ${q.index + 1}/${q.total}` : 'ALLE AUFTRÄGE ERLEDIGT';
    $('q-title').textContent = q.title;
    $('q-short').textContent = q.short;
    const [n, total] = q.text.split('/').map(Number);
    const segs = total && total <= 10 ? total : 10;
    const filled = total && total <= 10 ? n : Math.round(q.value * 10);
    const barKey = `${segs}|${filled}`;
    if ($('q-bar').dataset.k !== barKey) {
      $('q-bar').dataset.k = barKey;
      $('q-bar').innerHTML = Array.from({ length: segs }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
    }
    $('q-num').textContent = q.text;
    $('q-reward').innerHTML = q.reward ? `<img src="assets/gen/ui/coin.png" alt="" />${eur(q.reward)}` : '';
    $('quest').classList.toggle('done', !m);
    ($('q-show') as HTMLElement).style.display = m && (mt || (this.scene()?.hint.length ?? 0)) ? '' : 'none';
    if (this.lastQuest !== g.missionIdx) {
      if (this.lastQuest >= 0) this.ribbonUntil = now + 4000;
      this.lastQuest = g.missionIdx;
    }
    $('q-ribbon').classList.toggle('show', now < this.ribbonUntil);

    // Seitenleiste
    const satHtml = Object.values(OPERATORS)
      .filter((o) => sim.queue.some((x) => x.op === o) || sim.trains.some((x) => x.op === o))
      .map((o) => {
        const val = Math.round(g.satisfaction[o.id]);
        return `<div class="sat-row"><span>${o.name}</span><div class="bar"><div style="width:${val}%;background:${o.color}"></div></div><span>${val}</span></div>`;
      }).join('');
    if ($('sat').innerHTML !== satHtml) $('sat').innerHTML = satHtml;
    const rows: string[] = [];
    let wagons = 0;
    for (const tr of sim.trains) {
      if (tr.state === 'rolling' || tr.state === 'stored') { wagons++; continue; }
      const st = this.status(tr);
      const arrow = tr.op.turnback && !tr.turned ? '↩' : tr.dir;
      rows.push(this.row(tr.id, tr.op.color, tr.number, arrow, st, tr.waiting && !!tr.note));
    }
    for (const tr of sim.queue.slice(0, Math.max(3, 8 - rows.length))) {
      const late = sim.time - tr.plannedSpawn;
      rows.push(this.row(tr.id, tr.op.color, tr.number, tr.op.turnback ? '↩' : tr.dir,
        late > 0 ? `wartet +${Math.ceil(late / 60)} min` : fmtTime(tr.plannedSpawn), late > 60));
    }
    if (wagons) rows.push(`<li class="wag"><span class="dot" style="background:#9c4a2c"></span><span class="tnum">${wagons} Wagen</span><span class="tstat">im Rangierbahnhof</span></li>`);
    const listHtml = rows.join('');
    if ($('trains').dataset.h !== listHtml) {
      $('trains').dataset.h = listHtml;
      $('trains').innerHTML = listHtml;
      if (this.listHover) {
        const el = $('trains').querySelector(`li[data-id="${this.listHover.id}"]`) as HTMLElement | null;
        this.listHover = el && el.matches(':hover') ? { id: this.listHover.id, el } : null;
      }
    }
    const logHtml = g.log.slice(0, 14)
      .map((l) => `<li><span class="t">${fmtTime(l.time)}</span><span class="${l.kind}">${l.text}</span></li>`).join('');
    if ($('log').innerHTML !== logHtml) $('log').innerHTML = logHtml;

    this.updateCard();

    // Ereignisse
    if (this.ui.stationClick !== null) { this.askStation(this.ui.stationClick); this.ui.stationClick = null; }
    for (const ev of g.uiEvents.splice(0)) {
      if (ev.type === 'station') { this.askStation(ev.id); continue; }
      if (ev.type === 'research') {
        const r = RESEARCH_BY_ID[ev.id];
        this.showEvent(`<h1 class="blue">FORSCHUNG FERTIG!</h1>
          <div class="ev-tools"><div class="ev-tool big"><span class="slot"><img src="${ICON(r.icon)}" alt="" /></span></div></div>
          <div class="ev-title">${r.name}</div><div class="ev-info">${r.info}</div>`);
        continue;
      }
      if (ev.type === 'contract') {
        const o = OPERATORS[ev.op];
        if (ev.kind === 'cancel') {
          this.showEvent(`<h1 class="red">VERTRAG GEKÜNDIGT!</h1><div class="ev-title">${o.name}</div>
            <div class="ev-info">Die Preise waren zu hoch. Ihre Züge halten nicht mehr und zahlen nur ${TRANSIT_FEE} € Trassenentgelt.<br>Später kannst du unter „Verträge“ ein neues Angebot machen.</div>`);
        }
        continue;
      }
      if (ev.type !== 'mission') continue;
      ev.unlocked.forEach((u) => this.fresh.add(u));
      const tools = ev.unlocked.map((u) => TOOLS.find((x) => x.id === u)).filter(Boolean)
        .map((x) => `<div class="ev-tool"><span class="slot"><img src="${ICON(this.toolIcon(x!))}" alt="" /></span><span>${x!.label}</span></div>`).join('');
      const next = g.mission;
      this.showEvent(`<h1>AUFTRAG ERFÜLLT!</h1>
        <div class="ev-title">${ev.title}</div>
        <div class="ev-reward"><img src="assets/gen/ui/coin.png" alt="" />+${eur(ev.reward)} €${ev.fp ? `<img src="assets/gen/ui/flask.png" alt="" />+${ev.fp}` : ''}</div>
        ${tools ? `<div class="ev-sub">Neu freigeschaltet</div><div class="ev-tools">${tools}</div>` : ''}
        ${next ? `<div class="ev-next"><span>Nächster Auftrag</span><b>${next.title}</b><small>${next.short}</small></div>`
          : '<div class="ev-next"><b>Alle Aufträge erledigt!</b><small>Freies Spiel – bau weiter, so groß du willst</small></div>'}`);
    }
  }

  private row(id: number, color: string, num: string, dir: string, status: string, late: boolean) {
    const arrow = dir === 'E' ? '→' : dir === 'W' ? '←' : dir;
    return `<li data-id="${id}"><span class="dot" style="background:${color}"></span><span class="tnum">${num} ${arrow}</span><span class="tstat${late ? ' late' : ''}">${status}</span></li>`;
  }
}

export const MISSION_COUNT = MISSIONS.length;
