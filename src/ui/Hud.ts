import { COST, STATION_UPGRADE } from '../config';
import { CANCEL_COST, Game, fmtTime, REPAIR_COST } from '../game/Game';
import { CHANGELOG, VERSION } from '../game/changelog';
import { ACHIEVEMENTS } from '../game/Achievements';
import { goalProgress } from '../game/Goals';
import { currentMap, MAPS } from '../world/maps';
import { Sound } from '../render/Sound';
import { MISSIONS, ToolId } from '../game/Missions';
import { activateSlot, clearSave, deleteSlot, listSlots, saveState, writeSave, writeSlot } from '../game/storage';
import { OPERATORS } from '../sim/Operators';
import { FACILITY_RESEARCH, RESEARCH_BY_ID, ResearchId, ResearchTree, TREES } from '../game/Research';
import { cancelRisk } from '../game/Contracts';
import { Timetable } from './Timetable';
import { author, newsPhoto, paperName } from './press';
import { BOARD } from '../game/Board';
import { avatar, AVATARS, portrait } from './portrait';
import { BUILDING_RESEARCH, BUILDINGS, isStation, SHOPS } from '../world/buildings';
import { contractsHtml, contractsKey, offerHtml, researchHtml, researchKey, researchTabsHtml, researchTipHtml, statsHtml, statsKey, TRANSIT_FEE } from './Screens';
import type { Train } from '../sim/Simulation';
import type { GameScene, UiState } from '../render/GameScene';
import { VARIANTS, typing, variantOf } from '../render/GameScene';

const $ = (id: string) => document.getElementById(id)!;
const eur = (n: number) => Math.round(n).toLocaleString('de-AT');
const SPEEDS = [1, 2, 4, 8];
const ICON = (name: string) => `assets/gen/icons/${name}.png`;
const PHOTO_CAPTION: Record<string, string> = {
  fest: 'Schon am Vormittag herrschte reges Treiben am Festplatz.',
  sponsor: 'Der Bahnhofsvorplatz – bald Schauplatz eines großen Festes?',
  fans: 'Archivbild: Fans beim letzten Auswärtsspiel.',
  'vandal-trains': 'Kein Kunstwerk: besprühte Garnitur vor der Waschanlage.',
  'vandal-station': 'Spuren der Verwüstung am Bahnsteig.',
};

interface ToolDef { id: ToolId; label: string; key: string; icon?: string; cost?: number; help: string }

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Ansehen', key: '1', icon: 'tool_cursor', help: 'Ziehen = Karte verschieben · Mausrad = Zoom · Zug anfahren = Infos' },
  { id: 'land', label: 'Land kaufen', key: '2', icon: 'tool_flag', help: 'Gelbe Parzelle anklicken' },
  { id: 'platform', label: 'Bahnsteig', key: '3', icon: 'platform', cost: COST.platform, help: 'Neben dem Gleis ziehen' },
  { id: 'track', label: 'Gleis', key: '4', icon: 'track', cost: COST.track,
    help: 'Ziehen: waagrecht = gerade, schräg = Diagonale (kreuzt Gleise automatisch)' },
  { id: 'curve', label: 'Kurve', key: '5', cost: COST.curve, help: 'Klicken · R = nächste Variante' },
  { id: 'switch', label: 'Weiche', key: '6', cost: COST.switch, help: 'Gleiswechsel und Abzweige · R = nächste Variante' },
  { id: 'signal', label: 'Signal', key: '7', cost: COST.signal, help: 'Auf Gleis klicken · R = Fahrtrichtung' },
  { id: 'wire', label: 'Oberleitung', key: '8', icon: 'tool_wire', cost: COST.wire, help: 'Über Gleise ziehen · ohne Oberleitung halten nur Dieselzüge' },
  { id: 'access', label: 'Zugang', key: '9', help: 'Von Bahnsteig zu Bahnsteig quer über die Gleise ziehen' },
  { id: 'road', label: 'Straße', key: '0', icon: 'tool_road', cost: COST.road, help: 'Ziehen · verbindet Empfangsgebäude mit Parkplatz und Busterminal' },
  { id: 'building', label: 'Gebäude', key: 'B', help: 'Klicken zum Bauen · R = nächstes Gebäude' },
  { id: 'facility', label: 'Anlagen', key: 'N', help: 'Auf Gleise setzen bzw. Gleise markieren · R = nächste' },
  { id: 'remove', label: 'Abriss', key: 'X', icon: 'tool_shovel', help: 'Klicken oder Fläche aufziehen · je Feld das oberste Teil: Signal → Gebäude → Zugang → Bahnsteig → Markierung → Gleis' },
];

/** Baumenü: Gruppen (Leiste unten) mit Einträgen (Reihen darüber) */
interface MenuItem { tool: ToolId; variant?: string; icon: string; label: string; cost?: number; info?: string }
interface MenuGroup { id: string; label: string; key: string; alt?: string; icon: string; help: string; items: MenuItem[] }

const vItems = (tool: ToolId, filter: (key: string) => boolean = () => true): MenuItem[] =>
  (VARIANTS[tool] ?? []).filter((v) => filter(v.key)).map((v) => ({ tool, variant: v.key, icon: v.icon, label: v.label, cost: v.cost, info: v.info }));
const tItem = (id: ToolId): MenuItem => { const t = TOOLS.find((x) => x.id === id)!; return { tool: id, icon: t.icon ?? 'track', label: t.label, cost: t.cost, info: t.help }; };

const MENU: MenuGroup[] = [
  { id: 'select', label: 'Ansehen', key: '1', icon: 'tool_cursor', help: TOOLS[0].help, items: [tItem('select')] },
  { id: 'land', label: 'Land kaufen', key: '2', icon: 'tool_flag', help: 'Gelbe Parzelle anklicken', items: [tItem('land')] },
  { id: 'platform', label: 'Bahnsteig & Zugänge', key: '3', icon: 'platform', help: 'Bahnsteige neben dem Gleis ziehen · Unterführung/Brücke von Bahnsteig zu Bahnsteig',
    items: [tItem('platform'), ...vItems('access')] },
  { id: 'tracks', label: 'Gleisbau', key: '4', icon: 'track', help: 'Gleise ziehen (schräg = Diagonale), Kurven und Weichen klicken',
    items: [tItem('track'), ...vItems('curve'), ...vItems('switch')] },
  { id: 'ops', label: 'Bahnbetrieb', key: '5', icon: 'signal_E', help: 'Signale, Oberleitung, Verschubbereiche und Gleismarkierungen',
    items: [...vItems('signal'), tItem('wire'), ...vItems('facility', (k) => k.startsWith('mark_'))] },
  { id: 'facility', label: 'Unterstützungsanlagen', key: '6', icon: 'bld_remise', help: 'Remise, Werkstatt, Waschanlage und Abrollberg auf Gleise setzen',
    items: vItems('facility', (k) => !k.startsWith('mark_')) },
  { id: 'road', label: 'Straße & Bahnübergang', key: '7', icon: 'tool_road', help: 'Straßen ziehen · verbindet Empfangsgebäude mit Parkplatz und Busterminal', items: [tItem('road')] },
  { id: 'building', label: 'Gebäude', key: '8', alt: 'B', icon: 'bld_station', help: 'Klicken zum Bauen · R = nächstes Gebäude · Q = drehen', items: vItems('building') },
  { id: 'remove', label: 'Abriss', key: '9', alt: 'X', icon: 'tool_shovel', help: TOOLS.find((t) => t.id === 'remove')!.help, items: [tItem('remove')] },
];

const STATE_TEXT: Record<string, string> = {
  queued: 'angekündigt', running: 'fährt', dwell: 'hält am Bahnsteig', parked: 'abgestellt',
  rolling: 'rollt ab', stored: 'im Richtungsgleis', done: 'fertig',
};

export class Hud {
  private ribbonUntil = 0;
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
    $('btn-save').onclick = () => {
      const s = this.g.save();
      if (writeSave(s) && writeSlot(`${this.g.company || 'Spiel'} · ${fmtTime(this.g.sim.time)}`, false, s)) this.savedFlash = performance.now() + 1500;
    };
    $('m-load').onclick = () => this.toggleSlots('m-slots');
    $('go-load').onclick = () => this.toggleSlots('go-slots');
    $('go-new').onclick = () => { $('gameover').classList.add('hidden'); this.openMapPick(); };
    $('mp-close').onclick = () => $('mappick').classList.add('hidden');
    // Kartenauswahl per Pfeiltasten wie in alten Spielen
    $('mp-cards').addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest('[data-map]') as HTMLElement | null;
      if (b) { $('mp-cards').querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }
    });
    $('mappick').addEventListener('keydown', (e) => {
      const list = Array.from($('mp-cards').querySelectorAll<HTMLElement>('[data-map]'));
      const i = list.findIndex((x) => x.classList.contains('sel'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length];
        list.forEach((x) => x.classList.remove('sel'));
        n.classList.add('sel'); n.focus(); n.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); this.startOnMap(list[i].dataset.map!); }
      else if (e.key === 'Escape') $('mappick').classList.add('hidden');
      e.stopPropagation();
    });
    $('mp-cards').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-map]') as HTMLElement | null;
      if (b) this.startOnMap(b.dataset.map!);
    });
    for (const id of ['m-slots', 'go-slots']) {
      $(id).addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const l = t.closest('[data-load]') as HTMLElement | null;
        if (l && activateSlot(l.dataset.load!)) { saveState.disabled = true; location.reload(); }
        const d = t.closest('[data-del]') as HTMLElement | null;
        if (d) { deleteSlot(d.dataset.del!); this.renderSlots(id); }
      });
    }
    $('dl-show').onclick = () => { const id = this.g.sim.deadlock?.[0]; if (id) this.scene()?.focusTrain(id); };
    $('dl-cancel').onclick = () => {
      const ids = this.g.sim.deadlock;
      if (!ids?.length) return;
      // jüngsten Zug im Kreis aufgeben
      const t = ids.map((i) => this.g.sim.trains.find((x) => x.id === i)).filter(Boolean).sort((a, b) => b!.plannedSpawn - a!.plannedSpawn)[0];
      if (t) this.g.sim.cancelTrain(t.id);
    };
    $('btn-menu').onclick = () => this.openPause();
    $('p-continue').onclick = () => this.closePause();
    $('p-close').onclick = () => this.closePause();
    $('p-save').onclick = () => { $('btn-save').click(); $('p-save').textContent = 'Gespeichert ✓'; };
    $('p-main').onclick = () => { this.closePause(); this.openMenu(); };
    $('company').onclick = () => this.askName();
    $('name-ok').onclick = () => this.confirmName();
    $('pl-avatars').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-av]') as HTMLElement | null;
      if (!b) return;
      this.plAvatar = Number(b.dataset.av);
      $('pl-avatars').querySelectorAll('.pl-av').forEach((x) => x.classList.toggle('on', x === b));
    });
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
    // Klick in der Zugliste: kleines Menü (zeigen / aus dem Verkehr nehmen)
    list.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null;
      if (li) this.openTrainMenu(Number(li.dataset.id), li);
    });
    $('train-menu').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tm]') as HTMLElement | null;
      if (!b) return;
      const id = Number($('train-menu').dataset.id);
      if (b.dataset.tm === 'focus') this.scene()?.focusTrain(id);
      if (b.dataset.tm === 'plat') {
        const sim = this.g.sim;
        const t = sim.trains.find((x) => x.id === id) ?? sim.queue.find((x) => x.id === id);
        if (t) {
          const k = `${t.op.id}:${t.dir}`;
          if (b.dataset.run) sim.platformPref[k] = b.dataset.run; else delete sim.platformPref[k];
          this.g.version++;
        }
        $('train-menu').querySelectorAll('[data-tm="plat"]').forEach((x) => x.classList.toggle('on', x === b));
        return;
      }
      if (b.dataset.tm === 'remove') {
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Wirklich? Nochmal klicken'; return; }
        this.g.removeTrain(id);
      }
      $('train-menu').classList.add('hidden');
    });
    document.addEventListener('mousedown', (e) => {
      if (!(e.target as HTMLElement).closest('#train-menu, #trains')) $('train-menu').classList.add('hidden');
    });

    // Hauptmenü
    $('m-continue').onclick = () => this.closeMenu();
    $('m-new').onclick = () => this.newGame();
    $('btn-mail').onclick = () => this.openInbox();
    $('ib-close').onclick = () => $('inbox').classList.add('hidden');
    $('ib-list').addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('[data-mail]') as HTMLElement | null;
      if (r) { $('inbox').classList.add('hidden'); this.openMail(Number(r.dataset.mail)); }
    });
    $('toasts').addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('[data-mail]') as HTMLElement | null;
      if (r) this.openMail(Number(r.dataset.mail));
    });
    $('ng-yes').onclick = () => this.saveDialog();
    $('ng-no').onclick = () => { $('ng-ask').classList.add('hidden'); this.openMapPick(); };
    $('ng-cancel').onclick = () => $('ng-ask').classList.add('hidden');
    $('ng-back').onclick = () => $('ng-ask').classList.add('hidden');
    $('ng-ok').onclick = () => this.saveAndNew();
    $('ng-name').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') this.saveAndNew(); e.stopPropagation(); });
    if (import.meta.env.DEV) {
      $('m-demo').classList.remove('hidden');
      $('m-demo').onclick = () => {
        saveState.disabled = true;
        try { sessionStorage.setItem('rm_new', '1'); sessionStorage.setItem('rm_map', 'donau'); sessionStorage.setItem('rm_demo', '1'); } catch { /* egal */ }
        location.reload();
      };
    }
    $('m-help').onclick = () => $('m-helpbox').classList.toggle('hidden');

    $('ev-ok').onclick = () => this.closeEvent();
    $('m-news').onclick = () => this.openChangelog(0);
    $('cl-close').onclick = () => this.closeChangelog();
    $('cl-ok').onclick = () => this.closeChangelog();
    $('cl-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-rel]') as HTMLElement | null;
      if (b) this.openChangelog(Number(b.dataset.rel));
    });
    $('ev-body').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-decide]') as HTMLElement | null;
      if (!b) return;
      this.g.decide(b.dataset.decide === '1');
      b.parentElement!.remove();
      this.closeEvent();
    });
    $('offer').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const a = t.closest('[data-accept]') as HTMLElement | null;
      if (a && this.g.acceptOffer(a.dataset.accept as keyof typeof OPERATORS)) this.closeOffer();
      if (t.closest('[data-decline]')) { this.g.declineOffer(); this.closeOffer(); }
    });
    $('btn-research').onclick = () => this.openScreen('research');
    $('btn-contracts').onclick = () => this.openScreen('contracts');
    $('btn-stats').onclick = () => this.openScreen('stats');
    // Pixel-Lautsprecher: Wellen = an, Kreuz = stumm
    const soundLabel = () => {
      const body = '<path d="M1 4h2v3H1zM3 4h1V3h1V2h1v7H5V8H4V7H3z"/>';
      const extra = Sound.muted ? '<path d="M8 4h1v1H8zM10 4h1v1h-1zM9 5h1v1H9zM8 6h1v1H8zM10 6h1v1h-1z"/>' : '<path d="M8 4h1v3H8zM10 3h1v5h-1zM9 2h1v1H9zM9 8h1v1H9z"/>';
      $('btn-sound').innerHTML = `<svg viewBox="0 0 12 11" width="24" height="22" shape-rendering="crispEdges" fill="currentColor">${body}${extra}</svg>`;
      $('btn-sound').title = Sound.muted ? 'Ton ist aus – klicken zum Einschalten' : 'Ton ist an – klicken zum Ausschalten';
    };
    soundLabel();
    $('btn-sound').onclick = () => { Sound.toggle(); soundLabel(); };
    $('btn-timetable').onclick = () => this.openScreen('timetable');
    this.timetable = new Timetable(this.g);
    $('bpanel').addEventListener('click', (e) => this.onPanelClick(e as MouseEvent));
    document.querySelectorAll('[data-close]').forEach((b) => {
      (b as HTMLElement).onclick = () => this.closeScreen();
    });
    $('ct-transit').textContent = String(TRANSIT_FEE);
    // Forschungsbaum: Details als Tooltip neben dem Feld
    $('rs-tree').addEventListener('mousemove', (e) => {
      const c = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      const tip = $('rs-tip');
      if (!c) { tip.style.display = 'none'; this.rsTipId = undefined; return; }
      if (this.rsTipId !== c.dataset.tip) { this.rsTipId = c.dataset.tip; tip.innerHTML = researchTipHtml(this.g, c.dataset.tip as ResearchId); }
      tip.style.display = 'flex';
      const r = c.getBoundingClientRect();
      const left = r.right + 12 + tip.offsetWidth > window.innerWidth ? r.left - 12 - tip.offsetWidth : r.right + 12;
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = `${Math.max(4, Math.min(window.innerHeight - tip.offsetHeight - 4, r.top))}px`;
    });
    $('rs-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tree]') as HTMLElement | null;
      if (b) { this.rsTree = b.dataset.tree as ResearchTree; $('rs-tip').style.display = 'none'; this.renderScreen(true); }
    });
    $('rs-tree').addEventListener('mouseleave', () => { $('rs-tip').style.display = 'none'; this.rsTipId = undefined; });
    $('rs-tree').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-research]') as HTMLElement | null;
      if (b && this.g.startResearch(b.dataset.research as ResearchId)) { this.rsTipId = undefined; $('rs-tip').style.display = 'none'; this.renderScreen(true); }
    });
    $('ct-table').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest('[data-op]') as HTMLElement | null;
      if (b && b.dataset.cls) {
        const op = b.dataset.op as keyof typeof OPERATORS, cls = b.dataset.cls as 'short' | 'long';
        const step = Number(b.dataset.d) * ((e as MouseEvent).shiftKey ? 5 : 1);
        this.g.setPrice(op, cls, this.g.contracts[op].price[cls] + step);
      }
      const cr = t.closest('[data-crew]') as HTMLElement | null;
      if (cr) this.g.setCrew(this.g.crew + Number(cr.dataset.crew));
      const tk = t.closest('[data-takt]') as HTMLElement | null;
      if (tk) this.g.stepTakt(tk.dataset.takt as keyof typeof OPERATORS, Number(tk.dataset.d));
      const o = t.closest('[data-offer]') as HTMLElement | null;
      if (o) this.g.offer(o.dataset.offer as keyof typeof OPERATORS);
      this.renderScreen(true);
    });
    window.addEventListener('keydown', (e) => {
      if (!$('changelog').classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); this.closeChangelog(); }
        return;
      }
      // Schnellspeichern
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) { e.preventDefault(); if (this.g.company) $('btn-save').click(); return; }
      if (!$('event').classList.contains('hidden')) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); this.closeEvent(); }
        return;
      }
      if (!$('modal').classList.contains('hidden') || typing()) return;
      if (this.screen) {
        const k = e.key.toLowerCase();
        if (e.key === 'Escape' || (k === 'f' && this.screen === 'research') || (k === 'v' && this.screen === 'contracts') || (k === 't' && this.screen === 'timetable')) this.closeScreen();
        return;
      }
      if (!this.ui.menu && e.key.toLowerCase() === 'f') { this.openScreen('research'); return; }
      if (!this.ui.menu && e.key.toLowerCase() === 'v') { this.openScreen('contracts'); return; }
      if (!this.ui.menu && e.key.toLowerCase() === 'p') { if ($('inbox').classList.contains('hidden')) this.openInbox(); else $('inbox').classList.add('hidden'); return; }
      if (!this.ui.menu && e.key.toLowerCase() === 't') { this.openScreen('timetable'); return; }
      if (e.key === 'Escape' && !$('bpanel').classList.contains('hidden')) { this.closePanel(); return; }
      if (e.key === 'Escape') {
        if (!$('pause').classList.contains('hidden')) { this.closePause(); return; }
        if (!$('inbox').classList.contains('hidden')) { $('inbox').classList.add('hidden'); return; }
        if (this.ui.menu) { if (this.hadSave || this.g.company) this.closeMenu(); }
        else if (this.ui.tool !== 'select') this.ui.tool = 'select';
        else this.openPause();
        return;
      }
      if (this.ui.menu) return;
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.g.paused ? this.g.speed : 0); }
      if (e.key === '+' || e.key === '.') this.stepSpeed(1);
      if (e.key === '-' || e.key === ',') this.stepSpeed(-1);
      // Ziffer kurz nach einer Gruppe = Eintrag in dieser Gruppe (z. B. 8 dann 1 = Bahnhof)
      const k = e.key.toLowerCase();
      if (/^[0-9]$/.test(k) && performance.now() < this.groupKeyUntil) {
        const grp = MENU.find((m) => m.id === this.group);
        const idx = k === '0' ? 9 : Number(k) - 1;
        if (grp && grp.items.length > 1 && grp.items[idx]) { this.pickItem(grp.items[idx]); this.groupKeyUntil = 0; return; }
      }
      const grp = MENU.find((m) => m.key === k || m.alt?.toLowerCase() === k);
      if (grp) { this.pickGroup(grp); this.groupKeyUntil = performance.now() + 2000; }
    });

    if (freshStart) {
      this.ui.menu = false;
      $('menu').classList.add('hidden');
      this.askName();
    } else this.openMenu();
    this.setupTooltips();
    $('fault-pop').addEventListener('mouseenter', () => { this.faultHold = true; });
    $('fault-pop').addEventListener('mouseleave', () => { this.faultHold = false; this.faultUntil = performance.now() + 400; });
    $('fault-pop').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-repair]') as HTMLElement | null;
      if (!b) return;
      const [x, y] = b.dataset.repair!.split(',').map(Number);
      this.g.repairFault(x, y);
      this.faultKey = '';
    });
    this.showChangelog();
    this.update();
    setInterval(() => this.update(), 120);
  }

  /** einmal je Version: was ist neu? */
  private showChangelog() {
    let seen = '';
    try { seen = localStorage.getItem('rm_seen_version') ?? ''; } catch { /* egal */ }
    if (seen === VERSION) return;
    try { localStorage.setItem('rm_seen_version', VERSION); } catch { /* egal */ }
    this.openChangelog(0);
  }

  /** Änderungsprotokoll: links die Versionen, rechts die Neuerungen */
  private openChangelog(idx: number) {
    const tabs = CHANGELOG.map((r, i) => `<button class="cl-tab${i === idx ? ' on' : ''}" data-rel="${i}"><b>${r.version}</b><small>${r.date}</small></button>`).join('');
    const r = CHANGELOG[idx];
    const label: Record<string, string> = { neu: 'NEU', besser: 'BESSER', fix: 'BEHOBEN' };
    const items = r.items.map((it) => `<li class="cl-item"><span class="slot">${it.icon ? `<img src="${ICON(it.icon)}" alt="" />` : ''}</span>
      <span class="cl-tag ${it.kind}">${label[it.kind]}</span><span class="cl-text">${it.text}</span></li>`).join('');
    $('cl-tabs').innerHTML = tabs;
    $('cl-body').innerHTML = `<div class="cl-ver">Version ${r.version}${idx === 0 ? ' <span class="cl-latest">aktuell</span>' : ''}</div><div class="cl-title">${r.title}</div><ul class="cl-list">${items}</ul>`;
    $('changelog').classList.remove('hidden');
  }

  private closeChangelog() { $('changelog').classList.add('hidden'); }

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
    $('m-sub').textContent = '';
    void running;
    $('menu').classList.remove('hidden');
  }

  // ------------------------------------------------------------ Pause-Fenster mit Kurzbilanz
  private pausedBeforePause = false;
  private openPause() {
    if (!this.g.company) { this.openMenu(); return; }
    const g = this.g;
    if ($('pause').classList.contains('hidden')) this.pausedBeforePause = g.paused;
    g.paused = true;
    const day = Math.floor(g.sim.time / 86400) + 1;
    const prev = g.history.find((h) => h.day === day - 2);
    const contracts = Object.values(g.contracts).filter((c) => c.status === 'active').length;
    const row = (l: string, v: string, cls = '') => `<span>${l}</span><span class="${cls}">${v}</span>`;
    $('p-body').innerHTML = `<div class="fin">
      <span class="h">${g.company} · ${currentMap().name}</span>
      ${row('Spielzeit', `Tag ${day}, ${fmtTime(g.sim.time)} Uhr`)}
      ${row('Kasse', `${eur(g.money)} €`, g.money < 0 ? 'no' : 'ok')}
      ${prev ? row('Bilanz gestern', `${prev.income - prev.expense >= 0 ? '+' : '−'}${eur(Math.abs(prev.income - prev.expense))} €`, prev.income - prev.expense >= 0 ? 'ok' : 'no') : ''}
      ${row('Bewertung', '★'.repeat(g.rating.stars) + '☆'.repeat(5 - g.rating.stars), 'gold')}
      ${row('Pünktlichkeit', g.stats.handled ? `${Math.round(g.punctuality * 100)} %` : '–')}
      ${row('Züge abgefertigt', g.stats.handled.toLocaleString('de-AT'))}
      ${row('Fahrgäste gesamt', g.stats.passengers.toLocaleString('de-AT'))}
      ${row('Bahnhöfe', String(g.stations().length))}
      ${row('Verträge', String(contracts))}
      ${row('Forschungen', String(g.research.done.length))}
      ${row('Erfolge', `${g.achievements.length}/${ACHIEVEMENTS.length}`)}
      ${row('Auftrag', g.mission ? `${g.missionIdx + 1}/${MISSIONS.length}: ${g.mission.title}` : 'alle erledigt')}
    </div>`;
    $('p-save').textContent = 'Speichern';
    $('pause').classList.remove('hidden');
  }

  private closePause() {
    $('pause').classList.add('hidden');
    this.g.paused = this.pausedBeforePause;
  }

  private closeMenu() {
    $('menu').classList.add('hidden');
    this.ui.menu = false;
    this.g.paused = this.pausedBeforeMenu;
    if (!this.g.company) this.askName();
  }

  private newGame() {
    const running = this.hadSave || !!this.g.company;
    if (!running) { this.openMapPick(); return; }
    // laufendes Spiel: vorher speichern?
    $('ng-ask').classList.remove('hidden');
    $('ng-save').classList.add('hidden');
    $('ng-q').classList.remove('hidden');
  }

  private saveDialog() {
    $('ng-q').classList.add('hidden');
    $('ng-save').classList.remove('hidden');
    const inp = $('ng-name') as HTMLInputElement;
    inp.value = `${this.g.company || 'Spiel'} · Tag ${Math.floor(this.g.sim.time / 86400) + 1}, ${fmtTime(this.g.sim.time)}`;
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  }

  private saveAndNew() {
    const s = this.g.save();
    const label = ($('ng-name') as HTMLInputElement).value.trim() || this.g.company || 'Spiel';
    if (!writeSlot(label, false, s)) { $('ng-err').textContent = 'Speichern fehlgeschlagen – Speicher voll?'; return; }
    $('ng-ask').classList.add('hidden');
    this.openMapPick();
  }

  /** Kartenauswahl vor einem neuen Spiel */
  private openMapPick() {
    const diff: Record<string, string> = { leicht: '★', mittel: '★★', schwer: '★★★' };
    const bg = (m: (typeof MAPS)[number]) => m.ground === 'sand' ? '#d8b878' : m.ground === 'snow' ? '#e4ebf4'
      : `color-mix(in srgb, #6c9a3c 80%, #${m.tint.toString(16).padStart(6, '0')})`;
    $('mp-cards').innerHTML = MAPS.map((m, i) => `<button class="mp-card${i === 0 ? ' sel' : ''}" data-map="${m.id}">
      <span class="mp-arrow">▶</span><div class="mp-prev" style="background:${bg(m)}"><img src="assets/maps/${m.id}.png" alt="" onerror="this.remove()" />${this.mapPreview(m)}</div>
      <div class="mp-txt"><b>${m.name}</b><span class="mp-theme">${m.theme} · Schwierigkeit ${diff[m.difficulty]}</span><small>${m.info}</small></div>
      <span class="mp-money">Start<br>${eur(m.startMoney)} €</span></button>`).join('');
    $('mappick').classList.remove('hidden');
    ($('mp-cards').firstElementChild as HTMLElement).focus();
  }

  /** kleine Vorschau: Fels, Wasser, Wald grob als Pixel */
  private mapPreview(m: (typeof MAPS)[number]) {
    const W = 64, H = 16, px: string[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gx = x * 4, gy = y * 4;
      let c = '';
      if (m.rocks.some((r) => gx >= r.x0 && gx < r.x1 && gy >= r.y0 && gy < r.y1 && (r.edge === 'N' ? gy < r.y0 + (r.y1 - r.y0) * 0.7 : gy > r.y0 + (r.y1 - r.y0) * 0.3))) c = '#8f887c';
      if (m.lakes.some((l) => ((gx - l.x) / (l.rx + 1)) ** 2 + ((gy - l.y) / (l.ry + 1)) ** 2 <= 1)) c = '#4a7fc4';
      if (m.rivers.some((rv) => Math.abs(gx - rv.x) <= 2)) c = '#4a7fc4';
      if (gy === 28 || gy === 32) c = '#5a4632';
      if (m.industries.some((i) => Math.abs(gx - i.x) <= 3 && Math.abs(gy - i.y) <= 3)) c = '#c0392b';
      if (c) px.push(`<i style="left:${x * 3}px;top:${y * 3}px;background:${c}"></i>`);
    }
    return px.join('');
  }

  private startOnMap(id: string) {
    const running = this.hadSave || !!this.g.company;
    $('mappick').classList.add('hidden');
    // erstes Spiel auf der schon geladenen Karte: kein Neuladen nötig
    if (!running && id === currentMap().id) { this.pausedBeforeMenu = false; this.closeMenu(); return; }
    saveState.disabled = true;
    clearSave();
    try { sessionStorage.setItem('rm_new', '1'); sessionStorage.setItem('rm_map', id); } catch { /* egal */ }
    location.reload();
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
    // Spieler: Name, Anrede, Avatar
    const pl = this.g.player;
    ($('pl-name') as HTMLInputElement).value = pl.name;
    ($('pl-title') as HTMLSelectElement).value = pl.title;
    this.plAvatar = pl.avatar;
    $('pl-avatars').innerHTML = AVATARS.map((_, i) => `<button class="pl-av${i === pl.avatar ? ' on' : ''}" data-av="${i}">${avatar(i, 40)}</button>`).join('');
    $('pl-box').classList.remove('hidden');
    // neues Spiel: Tutorial an- oder abwählen
    $('tut-row').classList.toggle('hidden', !!this.g.company || this.g.missionIdx > 0);
  }

  private askStation(id: number) {
    const b = this.g.grid.buildings.get(id);
    if (!b) return;
    this.naming = { kind: 'station', id };
    this.openNameDialog('Neuer Bahnhof', 'Wie soll dieser Bahnhof heißen?', b.name ?? '', 'z.B. Donaufeld');
    $('pl-box').classList.add('hidden');
    $('name-ok').textContent = 'Taufen!';
    $('tut-row').classList.add('hidden');
  }

  private confirmName() {
    const v = ($('name-input') as HTMLInputElement).value.trim();
    const first = !this.g.company;
    if (this.naming.kind === 'company') {
      if (first && !$('tut-row').classList.contains('hidden') && !($('tut-check') as HTMLInputElement).checked) this.g.skipTutorial();
      this.g.company = v || 'Meine Bahn AG';
      this.g.player = { name: ($('pl-name') as HTMLInputElement).value.trim(), title: ($('pl-title') as HTMLSelectElement).value as '' | 'Frau' | 'Herr', avatar: this.plAvatar };
      this.companyKey = '';
      if (first) this.g.welcome();
    }
    else this.g.stationName(this.naming.id, v || this.g.suggestStationName());
    ($('name-input') as HTMLInputElement).blur();
    $('modal').classList.add('hidden');
    this.g.paused = first && this.naming.kind === 'company' ? false : this.pausedBeforeDialog;
  }

  // ------------------------------------------------------------ Forschung / Verträge
  private screen: 'research' | 'contracts' | 'timetable' | 'stats' | null = null;
  private timetable!: Timetable;
  private rsTipId?: string;
  private maintVersion = -1;
  private goalsKey = '';
  private maintAt = 0;
  private pausedBeforeScreen = false;
  private screenKey = '';

  /** gerade gezeigter Forschungsbaum */
  private rsTree: ResearchTree = 'ops';

  private openScreen(name: 'research' | 'contracts' | 'timetable' | 'stats') {
    if (name === 'research' && !this.g.unlocked.has('research')) return;
    // Auftrag will eine Forschung: gleich den passenden Baum zeigen
    if (name === 'research') {
      const mt = this.g.missionTool();
      const q = mt?.tool === 'research' && mt.variant ? RESEARCH_BY_ID[mt.variant as ResearchId] : undefined;
      if (q && !this.g.researched(q.id)) this.rsTree = q.tree;
    }
    if (this.screen === name) { this.closeScreen(); return; }
    // Fahrplan, Verträge, Forschung: Zeit läuft weiter; nur die Statistik hält an
    if (!this.screen) this.pausedBeforeScreen = this.g.paused;
    else $(this.screen).classList.add('hidden');
    this.g.paused = name === 'stats' ? true : this.pausedBeforeScreen;
    this.screen = name;
    this.ui.tool = 'select';
    $(name).classList.remove('hidden');
    this.renderScreen(true);
  }

  private closeScreen() {
    $('rs-tip').style.display = 'none';
    if (!this.screen) return;
    $(this.screen).classList.add('hidden');
    this.screen = null;
    this.g.paused = this.pausedBeforeScreen;
  }

  private renderScreen(force = false) {
    if (!this.screen) return;
    if (this.screen === 'timetable') { this.timetable.draw($('tt-canvas') as HTMLCanvasElement); return; }
    const mt = this.g.missionTool();
    const quest = mt?.tool === 'research' ? mt.variant : undefined;
    const key = this.screen === 'research' ? researchKey(this.g, this.rsTree, quest) : this.screen === 'stats' ? statsKey(this.g) : contractsKey(this.g);
    if (!force && key === this.screenKey) return;
    this.screenKey = key;
    if (this.screen === 'research') {
      $('rs-fp').textContent = String(this.g.research.points);
      $('rs-money').textContent = eur(this.g.money);
      $('rs-tabs').innerHTML = researchTabsHtml(this.g, this.rsTree, quest);
      $('rs-tree').innerHTML = researchHtml(this.g, this.rsTree, quest);
    } else if (this.screen === 'stats') $('st-body').innerHTML = statsHtml(this.g);
    else $('ct-table').innerHTML = contractsHtml(this.g);
  }

  // ------------------------------------------------------------ Infofenster für Bahnhof / Laden
  private panelId: number | null = null;
  private panelKey = '';

  private closePanel() { this.panelId = null; $('bpanel').classList.add('hidden'); }

  private renderPanel() {
    const box = $('bpanel');
    const b = this.panelId !== null ? this.g.grid.buildings.get(this.panelId) : undefined;
    if (!b) { box.classList.add('hidden'); this.panelId = null; return; }
    const g = this.g;
    let key: string, html: string;
    if (isStation(b.key)) {
      const lvl = g.stationLevel(b.key), c = g.connections(b.id), bonus = Math.round(g.stationBonus(b.id) * 100);
      const block = g.upgradeBlock(b.id);
      key = `s${b.id}${b.key}${b.name}${c.parking}${c.bus}${block}`;
      html = `<div class="bp-head"><img src="assets/gen/icons/${b.key}.png" alt="" /><div><b>${b.name ?? 'Bahnhof'}</b><small>${BUILDINGS[b.key].label} · Stufe ${lvl}</small></div><button class="btn" data-bp="close">✕</button></div>
        <div class="bp-row"><span>Einnahmen</span><span class="ok">+${bonus} %</span></div>
        <div class="bp-row"><span>Parkplatz</span><span class="${c.parking ? 'ok' : 'no'}">${c.parking ? '✓ über Straße angebunden (+10 %)' : '✗ nicht angebunden'}</span></div>
        <div class="bp-row"><span>Busterminal</span><span class="${c.bus ? 'ok' : 'no'}">${c.bus ? '✓ über Straße angebunden (+15 %)' : '✗ nicht angebunden'}</span></div>
        <div class="bp-btns"><button class="btn" data-bp="rename">Umbenennen</button>
        ${lvl < 3 ? `<button class="btn${block ? ' off' : ''}" data-bp="upgrade" title="${block ?? ''}">Ausbauen · ${eur(STATION_UPGRADE[lvl + 1])} €</button>` : ''}</div>
        ${lvl < 3 && block ? `<div class="bp-note no">${block}</div>` : ''}`;
    } else if (SHOPS[b.key]) {
      const sh = SHOPS[b.key], price = g.shopPrices[b.key], rate = g.shopRate(b.key);
      const r = price / sh.ref;
      key = `p${b.key}${price}`;
      html = `<div class="bp-head"><img src="assets/gen/icons/${b.key}.png" alt="" /><div><b>${sh.name}</b><small>Preis gilt für alle ${sh.name === 'Café' ? 'Cafés' : sh.name === 'Kiosk' ? 'Kioske' : 'Automaten'}</small></div><button class="btn" data-bp="close">✕</button></div>
        <div class="bp-row"><span>Preis</span><span class="ct-price"><button class="btn" data-bp="price" data-d="-0.5">−</button><b>${price.toFixed(2).replace('.', ',')} €</b><button class="btn" data-bp="price" data-d="0.5">+</button></span></div>
        <div class="bp-row"><span>üblich</span><span>${sh.ref.toFixed(2).replace('.', ',')} €</span></div>
        <div class="bp-row"><span>Kunden</span><span>${Math.round(rate * 100)} von 100 Fahrgästen</span></div>
        <div class="bp-row"><span>Umsatz</span><span>${(rate * price * 100).toFixed(0)} € je 100 Fahrgäste</span></div>
        <div class="bp-note ${r > 1.3 ? 'no' : r < 0.85 ? 'ok' : ''}">${r > 1.3 ? 'Zu teuer – Fahrgäste ärgern sich' : r < 0.85 ? 'Günstig – Fahrgäste freuen sich' : 'Fairer Preis'}</div>`;
    } else { this.closePanel(); return; }
    if (key !== this.panelKey) { this.panelKey = key; box.innerHTML = html; }
    box.classList.remove('hidden');
  }

  private onPanelClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-bp]') as HTMLElement | null;
    if (!t || this.panelId === null) return;
    const b = this.g.grid.buildings.get(this.panelId);
    if (!b) return;
    const act = t.dataset.bp;
    if (act === 'close') this.closePanel();
    if (act === 'rename') this.askStation(b.id);
    if (act === 'upgrade') this.g.upgradeStation(b.id);
    if (act === 'price') this.g.setShopPrice(b.key, this.g.shopPrices[b.key] + Number(t.dataset.d) * (e.shiftKey ? 2 : 1));
    this.panelKey = '';
    this.renderPanel();
  }

  // ------------------------------------------------------------ Spielstände
  private toggleSlots(id: string) {
    $(id).classList.toggle('hidden');
    this.renderSlots(id);
  }

  private renderSlots(id: string) {
    const list = listSlots();
    $(id).innerHTML = list.length ? list.map((x) => {
      const day = Math.floor(x.gameTime / 86400) + 1;
      const date = new Date(x.saved).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="slot-row${x.auto ? ' auto' : ''}"><div><b>${x.auto ? '⟳ ' : ''}${x.label}</b><small>${x.company} · Tag ${day}, ${fmtTime(x.gameTime)} · ${eur(x.money)} € · ${date}</small></div>
        <button class="btn" data-load="${x.id}">Laden</button><button class="btn" data-del="${x.id}">✕</button></div>`;
    }).join('') : '<div class="slots-empty">Noch keine Spielstände. „Speichern“ oben rechts legt einen an, Aufträge und Forschung speichern automatisch.</div>';
  }

  // ------------------------------------------------------------ Ausschreibung / Anfrage
  private pausedBeforeOffer = false;

  private showOffer() {
    if (!this.g.offers.open || !$('offer').classList.contains('hidden')) return;
    this.pausedBeforeOffer = this.g.paused;
    this.g.paused = true;
    $('of-body').innerHTML = offerHtml(this.g);
    $('offer').classList.remove('hidden');
  }

  private closeOffer() {
    $('offer').classList.add('hidden');
    this.g.paused = this.pausedBeforeOffer;
  }

  // ------------------------------------------------------------ Ereignis-Screen (Auftrag erfüllt)
  private eventQueue: string[] = [];
  private pausedBeforeEvent = false;

  private showEvent(html: string, confetti = true) {
    if (!$('event').classList.contains('hidden')) { this.eventQueue.push(html); return; }
    this.pausedBeforeEvent = this.g.paused;
    this.g.paused = true;
    $('ev-body').innerHTML = html;
    $('ev-ok').classList.toggle('hidden', html.includes('data-decide'));
    const conf = $('ev-confetti');
    conf.innerHTML = !confetti || html.startsWith('<div class="news"') ? '' : Array.from({ length: 40 }, (_, i) => {
      const c = ['#ffd23c', '#ff6a5a', '#7dff8a', '#5ab4ff', '#ffffff'][i % 5];
      return `<i style="left:${Math.random() * 100}%;background:${c};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s"></i>`;
    }).join('');
    $('event').classList.remove('hidden');
  }

  private closeEvent() {
    // offene Zeitungs-Anfrage ohne Antwort = abgelehnt
    if ($('ev-body').querySelector('[data-decide]')) this.g.decide(false);
    $('event').classList.add('hidden');
    $('event').classList.remove('top');
    this.g.paused = this.pausedBeforeEvent;
    const next = this.eventQueue.shift();
    if (next) this.showEvent(next);
  }

  // ------------------------------------------------------------ Werkzeuge
  private pick(id: ToolId) {
    if (!this.g.unlocked.has(id)) return;
    this.ui.tool = id;
    this.fresh.delete(id);
    this.syncGroup();
  }

  private toolIcon(t: ToolDef) {
    return VARIANTS[t.id] ? variantOf(this.ui, t.id)!.icon : t.icon!;
  }

  // ------------------------------------------------------------ Baumenü (Gruppen + Einträge)
  private group = 'select';
  private groupKeyUntil = 0;
  /** zuletzt gewählter Eintrag je Gruppe */
  private lastItem: Record<string, number> = {};
  private hoverItem: MenuItem | null = null;

  /** Forschung, die ein Eintrag braucht */
  private needOf(it: MenuItem): ResearchId | undefined {
    const k = it.variant ?? '';
    if (it.tool === 'facility') return FACILITY_RESEARCH[k];
    if (it.tool === 'switch') return k.endsWith('_fast') ? 'fastSwitch' : k.startsWith('xover') ? 'double' : undefined;
    if (it.tool === 'signal' && k.startsWith('S')) return 'shunt';
    if (it.tool === 'building') return BUILDING_RESEARCH[k] as ResearchId | undefined;
    return undefined;
  }

  private itemLocked(it: MenuItem) {
    const need = this.needOf(it);
    return !this.g.unlocked.has(it.tool) || (!!need && !this.g.researched(need));
  }

  private itemOn(it: MenuItem) {
    return this.ui.tool === it.tool && (!it.variant || variantOf(this.ui, it.tool)?.key === it.variant);
  }

  private pickItem(it: MenuItem) {
    if (!this.g.unlocked.has(it.tool)) return;
    this.ui.tool = it.tool;
    if (it.variant) {
      const idx = VARIANTS[it.tool]?.findIndex((v) => v.key === it.variant) ?? -1;
      if (idx >= 0) this.ui.variant[it.tool] = idx;
    }
    this.fresh.delete(it.tool);
    const grp = MENU.find((m) => m.items.includes(it));
    if (grp) { this.group = grp.id; this.lastItem[grp.id] = grp.items.indexOf(it); }
  }

  private pickGroup(grp: MenuGroup) {
    this.group = grp.id;
    const last = grp.items[this.lastItem[grp.id] ?? -1];
    const it = last && !this.itemLocked(last) ? last : grp.items.find((x) => !this.itemLocked(x)) ?? grp.items.find((x) => this.g.unlocked.has(x.tool));
    if (it) this.pickItem(it);
  }

  /** Gruppe passend zum aktuellen Werkzeug (z. B. nach Esc oder „Zeig mir wo“) */
  private syncGroup() {
    const cur = MENU.find((m) => m.id === this.group);
    if (cur?.items.some((it) => this.itemOn(it))) return;
    const g2 = MENU.find((m) => m.items.some((it) => this.itemOn(it))) ?? MENU.find((m) => m.items.some((it) => it.tool === this.ui.tool));
    if (g2) this.group = g2.id;
  }

  private buildHotbar() {
    const bar = $('hotbar');
    for (const grp of MENU) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.dataset.group = grp.id;
      b.innerHTML = `<img alt="" src="${ICON(grp.icon)}" /><span class="key">${grp.key}</span>${grp.items.length > 1 ? '<span class="more">▴</span>' : ''}`;
      b.onclick = () => this.pickGroup(grp);
      b.onmouseenter = () => (b.dataset.hover = '1');
      b.onmouseleave = () => delete b.dataset.hover;
      bar.appendChild(b);
    }
  }

  /** Einträge der aktiven Gruppe in Reihen (Nummern = Kurztasten) */
  private renderVariants() {
    this.syncGroup();
    const grp = MENU.find((m) => m.id === this.group)!;
    const mt = this.g.missionTool();
    const key = `${grp.id}|${this.ui.tool}|${this.ui.variant[this.ui.tool] ?? 0}|${mt?.tool}${mt?.variant}|${this.g.research.done.length}|${[...this.g.unlocked].length}`;
    if (key === this.lastVariantsKey) return;
    this.lastVariantsKey = key;
    const box = $('variants');
    box.innerHTML = '';
    this.hoverItem = null;
    if (grp.items.length < 2) return;
    box.style.setProperty('--cols', String(Math.min(grp.items.length, grp.items.length > 20 ? 11 : 10)));
    grp.items.forEach((it, i) => {
      const b = document.createElement('button');
      const locked = this.itemLocked(it);
      const on = this.itemOn(it);
      const quest = !!mt && mt.tool === it.tool && (!mt.variant || mt.variant === it.variant) && !on;
      b.className = `slot${on ? ' on' : ''}${quest ? ' quest' : ''}${locked ? ' locked' : ''}`;
      const need = this.needOf(it);
      b.dataset.tt = locked ? `${it.label} – ${need && !this.g.researched(need) ? `erst erforschen: ${RESEARCH_BY_ID[need].name}` : 'kommt mit einem späteren Auftrag'}` : `${it.label}${it.info && it.info !== 'Deko' ? `\n${it.info}` : ''}`;
      b.innerHTML = `<img src="${ICON(it.icon)}" alt="" />${i < 10 ? `<span class="key">${(i + 1) % 10}</span>` : ''}${it.cost ? `<span class="cost">${it.cost}</span>` : ''}`;
      b.onclick = () => { if (!locked || this.g.unlocked.has(it.tool)) this.pickItem(it); };
      b.onmouseenter = () => { this.hoverItem = it; };
      b.onmouseleave = () => { this.hoverItem = null; };
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

  private openTrainMenu(id: number, li: HTMLElement) {
    const sim = this.g.sim;
    const t = sim.trains.find((x) => x.id === id) ?? sim.queue.find((x) => x.id === id);
    if (!t) return;
    const m = $('train-menu');
    m.dataset.id = String(id);
    const shown = t.state !== 'queued';
    // Bahnsteig festlegen: gilt für alle Züge dieses Unternehmens in dieser Richtung
    const runs = this.g.platformRuns();
    const key = `${t.op.id}:${t.dir}`;
    const cur = sim.platformPref[key];
    const plat = t.op.needsStop && runs.length > 1 ? `<div class="tm-plat"><small>Bahnsteig für ${t.op.short} ${t.dir === 'E' ? '→' : '←'} (alle Züge):</small><div>
      <button class="btn${!cur ? ' on' : ''}" data-tm="plat" data-run="">Auto</button>${runs.map((r, i) => `<button class="btn${cur === r.id ? ' on' : ''}" data-tm="plat" data-run="${r.id}" data-tt="${r.len} Felder lang">Gleis ${i + 1}</button>`).join('')}</div></div>` : '';
    m.innerHTML = `<b>${t.number}</b>
      ${shown ? '<button class="btn" data-tm="focus">Zug zeigen</button>' : `<small>angekündigt für ${fmtTime(t.plannedSpawn)}</small>`}${plat}
      <button class="btn warn" data-tm="remove">Aus dem Verkehr nehmen (−${eur(CANCEL_COST)} €)</button>
      <small>Das Unternehmen ist darüber nicht erfreut.</small>`;
    m.classList.remove('hidden');
    const r = li.getBoundingClientRect();
    m.style.left = `${Math.max(8, r.left - m.offsetWidth - 12)}px`;
    m.style.top = `${Math.min(window.innerHeight - m.offsetHeight - 8, r.top)}px`;
    if (shown) this.scene()?.focusTrain(id);
  }

  /** was hilft, wenn ein Zug nicht weiterkommt */
  private fixHint(why: string) {
    if (/Störung/.test(why)) return 'Störung anklicken und den Störtrupp schicken – oder Instandhalter erforschen.';
    if (/kein Weg/.test(why)) return 'Der Zug findet keine Verbindung zur Strecke: Gleise und Weichen prüfen.';
    if (/Bahnsteig/.test(why)) return 'Kein passender Bahnsteig: Länge, Zugang zum Empfangsgebäude und Oberleitung prüfen.';
    if (/Gleis belegt/.test(why)) return 'Der Abschnitt ist belegt. Zusätzliche Signale, ein zweites Gleis oder ein Ausweichgleis verkürzen die Wartezeit. Notfalls: Zug in der Zugliste anklicken und aus dem Verkehr nehmen.';
    return 'Ein Gegenzug hat Vorrang. Mehr Signale und Kreuzungsmöglichkeiten helfen.';
  }

  private bar(v: number, color: string) {
    return `<div class="bar"><div style="width:${Math.round(Math.max(0, Math.min(100, v)))}%;background:${color}"></div></div>`;
  }

  private card(t: Train) {
    const delay = Math.round(this.g.sim.delayNow(t));
    const isPax = t.capacity > 0;
    const load = isPax ? (t.passengers / t.capacity) * 100 : 0;
    const kmh = Math.round(t.v * 15);
    const cars = t.cars.map((c, i) => `<img src="assets/gen/car_${t.op.id}_${c === 'ecab' ? (i ? 'ecabW' : 'ecabE') : c}_0.png" alt="" />`).join('');
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
    const why = this.g.sim.waitReason(t) ?? (t.note && /kein/.test(t.note) ? t.note : null);
    if (why) rows.push(`<div class="tc-row"><span>Wartet</span><span class="no">${why}</span></div>`);
    if (this.g.sim.stuck(t) && why) rows.push(`<div class="tc-help">! ${this.fixHint(why)}</div>`);
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
    if (!t || !$('train-menu').classList.contains('hidden')) { box.classList.add('hidden'); return; }
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
    // Avatar in der Titelleiste
    const avk = `${g.player.avatar}|${g.player.name}|${g.company}`;
    if (avk !== this.companyKey) {
      this.companyKey = avk;
      const img = $('company').querySelector('img, svg');
      if (img) img.outerHTML = g.company ? avatar(g.player.avatar, 22) : '<img src="assets/gen/ui/train.png" alt="" />';
      $('company').dataset.tt = g.player.name ? `${g.player.title ? g.player.title + ' ' : ''}${g.player.name} · ${g.company} – klicken zum Ändern` : 'Namen ändern';
    }
    $('clock').textContent = fmtTime(sim.time);
    $('money').textContent = `${eur(g.money)} €`;
    $('money').style.color = g.money < 0 ? 'var(--bad)' : '';
    $('loan').classList.toggle('hidden', g.money >= 0);
    // Bahnhofs-Bewertung und Tagesziele
    const st = g.rating.stars;
    $('stars').textContent = '★'.repeat(st) + '☆'.repeat(5 - st);
    $('stars-wrap').title = `Bahnhofs-Bewertung – mehr Sterne bringen mehr Fahrgäste (×${(0.8 + 0.1 * st).toFixed(1)})\n`
      + Object.entries(g.rating.parts).map(([k, v]) => `${k}: ${Math.round(v * 100)} %`).join('\n');
    const gk = g.goals.map((x) => `${x.kind}${x.done}${x.failed}`).join() + '|' + (g.history[g.history.length - 1]?.handled ?? 0) + (g.history[g.history.length - 1]?.pax ?? 0);
    if (gk !== this.goalsKey) {
      this.goalsKey = gk;
      const d = g.history[g.history.length - 1];
      $('goals').innerHTML = g.goals.length ? g.goals.map((x) => {
        const p = goalProgress(x, d, g);
        const cls = x.done ? 'ok' : x.failed ? 'no' : '';
        return `<li class="gl ${cls}"><span class="gl-mark">${x.done ? '✓' : x.failed ? '✗' : '○'}</span><span class="gl-text">${p.label}<small>${x.done ? 'geschafft' : p.text} · +${eur(x.reward)} €</small></span></li>`;
      }).join('') : '<li class="gl"><span class="gl-text"><small>Ab dem ersten Bahnhof gibt es jeden Tag neue Ziele</small></span></li>';
    }
    if (g.version !== this.maintVersion || now > this.maintAt) {
      this.maintVersion = g.version; this.maintAt = now + 5000;
      // erwarteter Umsatz heute: hochgerechnet, am Morgen noch der von gestern
      const exp = this.expectedIncome();
      $('daycost').textContent = `≈ +${eur(exp)} €/Tag`;
    }
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
    // Mini-Balken: weiteste laufende Forschung; Punkt, wenn ein Baum frei ist
    const prog = TREES.map((t) => g.runningIn(t.id)).filter(Boolean).map((rc) => 100 - (rc!.left / (RESEARCH_BY_ID[rc!.id].hours * 3600)) * 100);
    $('rs-mini').style.width = prog.length ? `${Math.max(...prog).toFixed(0)}%` : '0';
    $('btn-research').classList.toggle('locked', !g.unlocked.has('research'));
    const mtq = g.missionTool();
    $('btn-research').classList.toggle('quest', mtq?.tool === 'research' && this.screen !== 'research');
    const warn = Object.values(OPERATORS).some((o) => {
      const c = g.contracts[o.id];
      return c.status === 'cancelled' ? g.sim.time >= c.talkAfter : c.status === 'active' && cancelRisk(o, c, g.satisfaction[o.id]) > 0;
    });
    $('ct-warn').textContent = warn ? '!' : '';
    this.renderScreen();
    $('btn-save').classList.toggle('saved', now < this.savedFlash);
    this.updateFaultPop(now);
    this.updateStationPop();
    const unread = this.g.inbox.filter((e) => !e.read).length;
    $('mail-count').textContent = String(unread);
    $('mail-count').classList.toggle('hidden', !unread);

    // Baumenü
    const mt = g.missionTool();
    let hoveredGroup: MenuGroup | undefined;
    this.syncGroup();
    $('hotbar').querySelectorAll('.slot').forEach((el) => {
      const b = el as HTMLElement;
      const grp = MENU.find((m) => m.id === b.dataset.group)!;
      const img = b.querySelector('img')!;
      // Symbol = gewählter Eintrag der Gruppe
      const shown = grp.items[this.lastItem[grp.id] ?? 0] ?? grp.items[0];
      const src = ICON(grp.items.length > 1 ? shown.icon : grp.icon);
      if (!img.src.endsWith(src)) img.src = src;
      const locked = !grp.items.some((it) => g.unlocked.has(it.tool));
      b.classList.toggle('locked', locked);
      b.classList.toggle('on', this.group === grp.id);
      const isQuest = !!mt && grp.items.some((it) => it.tool === mt.tool) && this.ui.tool !== mt.tool && !locked && !g.questUsed.has(`${g.missionIdx}:${mt.tool}`);
      b.classList.toggle('quest', isQuest);
      const badge = isQuest ? '!' : grp.items.some((it) => this.fresh.has(it.tool)) ? 'NEU' : '';
      let el2 = b.querySelector('.badge') as HTMLElement | null;
      if (badge && !el2) { el2 = document.createElement('span'); b.appendChild(el2); }
      if (el2) {
        if (!badge) el2.remove();
        else { el2.textContent = badge; el2.className = `badge${badge === 'NEU' ? ' new' : ''}`; }
      }
      if (b.dataset.hover) hoveredGroup = grp;
    });
    this.renderVariants();

    // Hinweiszeile: Gruppe · Eintrag · Kosten/Grund
    const viaResearch: Partial<Record<ToolId, string>> = { wire: RESEARCH_BY_ID.wire.name, access: RESEARCH_BY_ID.access.name, facility: RESEARCH_BY_ID.siding.name, road: RESEARCH_BY_ID.road.name };
    let html = '';
    if (hoveredGroup) {
      const locked = !hoveredGroup.items.some((it) => g.unlocked.has(it.tool));
      const via = hoveredGroup.items.map((it) => viaResearch[it.tool]).find(Boolean);
      html = `<b>${hoveredGroup.label}</b> <small>· Taste ${hoveredGroup.key}${hoveredGroup.alt ? `/${hoveredGroup.alt}` : ''}${hoveredGroup.items.length > 1 ? ', dann Ziffer für den Eintrag' : ''}</small>`
        + (locked ? ` <span class="no">· ${via ? `erst erforschen: „${via}“` : 'kommt mit einem späteren Auftrag'}</span>` : ` <small>· ${hoveredGroup.help}</small>`);
    } else if (this.ui.tool !== 'select') {
      const grp = MENU.find((m) => m.id === this.group)!;
      const hv = this.hoverItem && grp.items.includes(this.hoverItem) ? this.hoverItem : null;
      const it = hv ?? grp.items.find((x) => this.itemOn(x));
      html = `<b>${grp.label}</b>${it && grp.items.length > 1 ? ` · ${it.label}` : ''}`;
      if (it?.info && it.info !== 'Deko' && grp.items.length > 1) html += ` <small>(${it.info})</small>`;
      if (grp.id === 'building' && it && Game.canRotate(it.variant ?? '')) html += ` <small>· ${this.g.buildRot ? 'gedreht' : 'normal'} (Q = drehen)</small>`;
      if (!hv && this.ui.message) {
        const bad = !/€$/.test(this.ui.message);
        html += ` · <span class="${bad ? 'no' : 'ok'}">${this.ui.message}</span>`;
      } else if (grp.items.length < 2) html += ` <small>· ${grp.help}</small>`;
    }
    $('tooltip').innerHTML = html;

    // Auftrag
    const m = g.mission;
    const q = g.missionInfo();
    $('q-count').textContent = m ? `AUFTRAG ${q.index + 1}/${q.total}` : 'ALLE AUFTRÄGE ERLEDIGT';
    $('q-title').textContent = q.title;
    $('q-short').textContent = q.short;
    // Checkliste: Teilschritte abhaken
    const checks = 'checks' in q ? q.checks : undefined;
    const ck = checks ? checks.map((c) => `${+c.done}${c.label}`).join('|') : '';
    if ($('q-checks').dataset.k !== ck) {
      $('q-checks').dataset.k = ck;
      const next = checks?.findIndex((c) => !c.done) ?? -1;
      $('q-checks').innerHTML = (checks ?? []).map((c, i) => `<li class="${c.done ? 'ok' : i === next ? 'next' : ''}"><span class="q-box">${c.done ? '✓' : ''}</span>${c.label}</li>`).join('');
    }
    $('q-short').classList.toggle('hidden', !!checks?.length);
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
    if (this.ui.stationClick !== null) { this.panelId = this.ui.stationClick; this.ui.stationClick = null; this.panelKey = ''; }
    this.timetable.sample();
    // Stau-Warnung mit Countdown
    const dl = g.sim.deadlock && g.deadlockSince && !g.gameOver;
    $('deadlock').classList.toggle('hidden', !dl);
    if (dl) {
      const names = g.sim.deadlock!.map((i) => g.sim.trains.find((x) => x.id === i)?.number).filter(Boolean).join(', ');
      $('dl-text').textContent = `${names} · noch ${Math.ceil(g.deadlockLeft / 60)} min bis Game Over – Gleis bauen oder einen Zug aufgeben`;
    }
    if (this.g.offers.open && $('modal').classList.contains('hidden') && $('event').classList.contains('hidden') && !this.ui.menu) this.showOffer();
    this.renderPanel();
    for (const ev of g.uiEvents.splice(0)) {
      if (ev.type === 'station') { this.askStation(ev.id); continue; }
      if (ev.type === 'offer' || ev.type === 'deadlock') continue;
      if (ev.type === 'autosave') { writeSlot(ev.label, true, this.g.save()); this.savedFlash = now + 1500; continue; }
      if (ev.type === 'gameover') {
        const debt = ev.reason === 'debt';
        $('go-title').textContent = debt ? 'Pleite!' : 'Deine Strecke ist dicht.';
        $('go-info').textContent = debt ? `Die Schulden haben ${eur(-Game.DEBT_LIMIT)} € erreicht – die Bank dreht den Hahn zu. Lade einen Spielstand oder fang neu an.`
          : 'Die Züge haben sich eine Stunde lang gegenseitig blockiert. Lade einen Spielstand oder fang neu an.';
        $('gameover').classList.remove('hidden');
        continue;
      }
      if (ev.type === 'research') {
        const r = RESEARCH_BY_ID[ev.id];
        this.showEvent(`<h1 class="blue">FORSCHUNG FERTIG!</h1>
          <div class="ev-tools"><div class="ev-tool big"><span class="slot"><img src="${ICON(r.icon)}" alt="" /></span></div></div>
          <div class="ev-title">${r.name}</div><div class="ev-info">${r.info}</div>`);
        continue;
      }
      if (ev.type === 'decision') {
        const day = Math.floor(g.sim.time / 86400) + 1;
        const paper = this.paper(day, 'Anfrage', ev.title, ev.text, ev.tag);
        this.mail('decision', ev.title, paperName(), paper, false, true);
        this.showEvent(`${paper}
          <div class="dc-btns"><button class="btn big" data-decide="1">${ev.yes}</button><button class="btn" data-decide="0">${ev.no}</button></div>`, false);
        continue;
      }
      if (ev.type === 'goal') { Sound.coin(); continue; }
      if (ev.type === 'letter') {
        const day = Math.floor(g.sim.time / 86400) + 1;
        const from = ev.from ?? BOARD(g.company || 'Bahngesellschaft');
        const html = `<div class="letter ${ev.mood}${ev.from ? ' ext' : ''}"><div class="lt-head"><b>${from.org}</b><span>${ev.from ? from.role : 'Der Vorstand'} · Tag ${day}</span></div>
          <div class="lt-title">${ev.title}</div><div class="lt-text">${/^<p>(Sehr|Guten)/.test(ev.text) ? '' : `<p>${g.salutation()}</p>`}${ev.text}</div>
          ${ev.bonus ? `<div class="lt-bonus"><img src="assets/gen/ui/coin.png" alt="" />+${eur(ev.bonus)} €</div>` : ''}
          <div class="lt-sign">${portrait(from.seed, 40)}<div><i>${ev.mood === 'bad' ? 'Mit ernsten Grüßen' : 'Mit freundlichen Grüßen'}</i><b>${from.name}</b><small>${from.role}</small></div></div></div>`;
        // Begrüßung gleich öffnen, alles andere landet im Postfach
        this.mail('letter', ev.title, `${from.name}, ${from.org}`, html, ev.title === 'Willkommen an Bord!');
        continue;
      }
      if (ev.type === 'achievement') {
        const a = ACHIEVEMENTS.find((x) => x.id === ev.id);
        Sound.coin();
        if (a) this.showEvent(`<h1>ERFOLG!</h1><div class="ev-tools"><div class="ev-tool big"><span class="slot"><img src="${ICON(a.icon)}" alt="" /></span></div></div>
          <div class="ev-title">${a.name}</div><div class="ev-info">${a.info}</div>`);
        continue;
      }
      if (ev.type === 'news') {
        const day = Math.floor(g.sim.time / 86400) + 1;
        this.mail('news', ev.title, paperName(), this.paper(day, 'Lokales', ev.title, ev.text, ev.tag));
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

  // ------------------------------------------------------------ Störung: Fenster beim Hovern
  private faultHold = false;
  private faultUntil = 0;
  private faultAt: { x: number; y: number } | null = null;
  private faultKey = '';

  private updateFaultPop(now: number) {
    const sc = this.scene();
    const pop = $('fault-pop');
    const h = sc?.hovered;
    const f = h && this.ui.tool === 'select' ? this.g.faultAt(h.x, h.y) : undefined;
    if (f && h) { this.faultAt = { x: h.x, y: h.y }; this.faultUntil = now + 900; }
    const at = this.faultAt;
    const cur = at ? this.g.faultAt(at.x, at.y) : undefined;
    if (!sc || !at || !cur || (!this.faultHold && now > this.faultUntil)) { pop.classList.add('hidden'); this.faultAt = null; return; }
    const kind = cur.kind === 'switch' ? 'Weiche' : 'Signal';
    const mins = Math.round((this.g.sim.time - cur.since) / 60);
    const left = cur.repairAt ? Math.max(0, Math.ceil((cur.repairAt - this.g.sim.time) / 60)) : 0;
    const key = `${at.x},${at.y}|${!!cur.repairAt}|${left}|${mins}|${this.g.money >= REPAIR_COST}`;
    if (key !== this.faultKey) {
      this.faultKey = key;
      pop.innerHTML = `<b>Störung: ${kind} defekt</b><small>seit ${mins} min · Züge kommen hier nicht vorbei</small>
        ${cur.repairAt ? `<span class="ok">Störtrupp ist unterwegs – fertig in ${left} min</span>`
          : `<button class="btn" data-repair="${at.x},${at.y}"${this.g.money < REPAIR_COST ? ' disabled' : ''}>Störtrupp schicken (${eur(REPAIR_COST)} €)</button>
             <small>${this.g.crew ? 'Deine Instandhalter rücken gleich selbst aus' : 'ohne Trupp nach ein paar Stunden von selbst behoben – aber die Unternehmen ärgern sich'}</small>`}`;
    }
    const p = sc.cellToScreen(at.x, at.y);
    pop.style.left = `${Math.round(Math.min(window.innerWidth - pop.offsetWidth - 6, p.x + 18))}px`;
    pop.style.top = `${Math.round(Math.max(60, p.y - pop.offsetHeight - 14))}px`;
    pop.classList.remove('hidden');
  }

  // ------------------------------------------------------------ Bahnhof: Kurzinfo beim Hovern
  private stKey = '';
  private plAvatar = 0;
  private companyKey = '';
  private updateStationPop() {
    const pop = $('st-pop');
    const h = this.scene()?.hovered;
    const id = h && this.ui.tool === 'select' && !this.ui.menu && !this.screen ? this.g.grid.get(h.x, h.y)?.building : null;
    const b = id != null ? this.g.grid.buildings.get(id) : undefined;
    if (!b || !isStation(b.key) || this.ui.hoverTrain !== null) { pop.classList.add('hidden'); return; }
    const g = this.g, t = g.today(), prev = g.history.find((x) => x.day === t.day - 1);
    const shops = [...g.grid.buildings.values()].filter((x) => !x.decor && (SHOPS[x.key] || x.key === 'bld_billboard'));
    const plats = g.net.runs.filter((r) => r.accessible).length;
    const m = g.maintenance();
    const key = `${b.id}|${b.name}|${t.pax}|${t.income}|${t.shop}|${shops.length}|${plats}|${g.rating.stars}|${Math.round(m.total)}`;
    if (key !== this.stKey) {
      this.stKey = key;
      const row = (l: string, v: string, cls = '') => `<span>${l}</span><span class="${cls}">${v}</span>`;
      pop.innerHTML = `<div class="fin"><span class="h">${b.name ?? 'Bahnhof'} · ${BUILDINGS[b.key].label}</span>
        ${row('Bewertung', '★'.repeat(g.rating.stars) + '☆'.repeat(5 - g.rating.stars), 'gold')}
        ${row('Einnahmen-Bonus', `+${Math.round(g.stationBonus(b.id) * 100)} %`, 'ok')}
        ${row('Bahnsteiggleise', String(plats))}
        ${row('Fahrgäste heute', t.pax.toLocaleString('de-AT'))}${prev ? row('Fahrgäste gestern', prev.pax.toLocaleString('de-AT')) : ''}
        ${row('Läden & Werbung', `${shops.length} · heute +${eur(t.shop ?? 0)} €`, 'ok')}
        ${row('Umsatz heute', `+${eur(t.income)} €`, 'ok')}
        ${row('Fixkosten pro Tag', `−${eur(m.total)} €`, 'no')}
        <span class="h"><small>Klicken: umbenennen und ausbauen</small></span></div>`;
    }
    pop.classList.remove('hidden');
    const x = Math.min(window.innerWidth - pop.offsetWidth - 8, this.ui.mouse.x + 18), y = Math.min(window.innerHeight - pop.offsetHeight - 8, this.ui.mouse.y + 18);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  }

  /** erwarteter Umsatz des Tages */
  private expectedIncome() {
    const g = this.g;
    const t = g.today(), frac = (g.sim.time % 86400) / 86400;
    const prev = g.history.find((h) => h.day === t.day - 1);
    if (frac < 0.25 || !t.income) return prev?.income ?? t.income;
    // Betriebszeit ca. 5–24 Uhr: Hochrechnung auf den restlichen Tag
    const run = Math.max(0.1, Math.min(1, (frac - 5 / 24) / (19 / 24)));
    return Math.round(t.income / run);
  }

  /** Tooltip: Einnahmen und Ausgaben */
  private financeHtml() {
    const g = this.g, t = g.today(), m = g.maintenance(), zins = g.interest;
    const prev = g.history.find((h) => h.day === t.day - 1);
    const fix = (m.total - m.Personal) * (m.vandal ? 2 : 1) + m.Personal + zins;
    const row = (l: string, v: number) => `<span>${l}</span><span class="${v > 0 ? 'ok' : v < 0 ? 'no' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${eur(Math.abs(v))} €</span>`;
    return `<div class="fin"><span class="h">Heute bisher</span>${row('Einnahmen', t.income)}${row('Ausgaben', -t.expense)}${t.shop ? row('davon Läden & Werbung', t.shop) : ''}
      <span class="h">Erwartet heute</span>${row('Umsatz', this.expectedIncome())}${row('Fixkosten um Mitternacht', -fix)}${row('Ergebnis (geschätzt)', this.expectedIncome() - t.expense - fix)}
      <span class="h">Fixkosten pro Tag</span>${row('Gleise', -m.Gleise)}${row('Bahnsteige', -m.Bahnsteige)}${row('Gebäude', -m.Gebäude)}${m.Personal ? row('Personal', -m.Personal) : ''}${zins ? row('Kreditzinsen', -zins) : ''}
      ${m.vandal ? '<span class="h no">Heute doppelt (Vandalismus)</span>' : ''}
      ${prev ? `<span class="h">Gestern</span>${row('Bilanz', prev.income - prev.expense)}` : ''}</div>`;
  }

  /** eigene Tooltips im Spiel-Look statt der Browser-Tooltips */
  private setupTooltips() {
    const tt = $('tt');
    let cur: HTMLElement | null = null;
    const place = (e: MouseEvent) => {
      const x = Math.min(window.innerWidth - tt.offsetWidth - 6, e.clientX + 14);
      const y = e.clientY + 18 + tt.offsetHeight > window.innerHeight ? e.clientY - tt.offsetHeight - 10 : e.clientY + 18;
      tt.style.left = `${Math.max(4, x)}px`; tt.style.top = `${Math.max(4, y)}px`;
    };
    document.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest?.('[title],[data-tt],#money-wrap,#daycost-wrap') as HTMLElement | null;
      if (el?.title) { el.dataset.tt = el.title; el.removeAttribute('title'); }
      cur = el;
      if (!el) { tt.style.display = 'none'; return; }
      const fin = el.id === 'money-wrap' || el.id === 'daycost-wrap';
      if (!fin && !el.dataset.tt) { tt.style.display = 'none'; return; }
      tt.innerHTML = fin ? this.financeHtml() : el.dataset.tt!.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      tt.style.display = 'block';
      place(e);
    });
    document.addEventListener('mousemove', (e) => { if (cur && tt.style.display === 'block') place(e); });
    document.addEventListener('mousedown', () => { tt.style.display = 'none'; });
  }

  // ------------------------------------------------------------ Postfach
  /** Nachricht ablegen; Hinweis unten rechts zum Anklicken (oder gleich öffnen) */
  private mail(kind: 'letter' | 'news' | 'decision', title: string, from: string, html: string, open = false, read = false) {
    const g = this.g;
    const id = (g.inbox[0]?.id ?? 0) + 1;
    const e = { id, time: g.sim.time, kind, title, from, html, read: read || open };
    g.inbox.unshift(e);
    if (g.inbox.length > 40) g.inbox.length = 40;
    if (open) { this.showEvent(html, false); return; }
    if (read) return;
    Sound.coin();
    const t = document.createElement('button');
    t.className = 'toast panel';
    t.dataset.mail = String(id);
    t.innerHTML = `<span class="ib-ico">${kind === 'news' ? '📰' : '✉'}</span><span><b>${kind === 'news' ? 'Zeitung' : 'Neuer Brief'}</b><small>${title}</small></span>`;
    $('toasts').prepend(t);
    while ($('toasts').children.length > 4) $('toasts').lastElementChild!.remove();
    setTimeout(() => t.remove(), 25000);
  }

  private openMail(id: number) {
    const e = this.g.inbox.find((x) => x.id === id);
    if (!e) return;
    e.read = true;
    $('toasts').querySelectorAll(`[data-mail="${id}"]`).forEach((x) => x.remove());
    this.showEvent(e.html, false);
  }

  private openInbox() {
    const g = this.g;
    const day = (t: number) => Math.floor(t / 86400) + 1;
    $('ib-list').innerHTML = g.inbox.length ? g.inbox.map((e) => `<button class="ib-row${e.read ? '' : ' unread'}" data-mail="${e.id}">
      <span class="ib-ico">${e.kind === 'news' ? '📰' : e.kind === 'decision' ? '❓' : '✉'}</span>
      <span class="ib-t"><b>${e.title}</b><small>${e.from}</small></span><span class="ib-d">Tag ${day(e.time)} · ${fmtTime(e.time)}</span></button>`).join('')
      : '<div class="slots-empty">Noch keine Post. Briefe vom Vorstand, der Bank und Zeitungsmeldungen landen hier.</div>';
    $('inbox').classList.remove('hidden');
  }

  /** Zeitungsseite mit Kopf, Redakteur und Foto */
  private paper(day: number, section: string, title: string, text: string, tag: string) {
    return `<div class="news"><div class="nw-head">${paperName()}</div><div class="nw-date">Tag ${day} · ${fmtTime(this.g.sim.time)} Uhr · ${section}</div>
      <div class="nw-title">${title}</div>${newsPhoto(tag, PHOTO_CAPTION[tag] ?? title)}<div class="nw-text">${text}</div>
      <div class="nw-author">von ${author()}</div></div>`;
  }

  private row(id: number, color: string, num: string, dir: string, status: string, late: boolean) {
    const arrow = dir === 'E' ? '→' : dir === 'W' ? '←' : dir;
    return `<li data-id="${id}"><span class="dot" style="background:${color}"></span><span class="tnum">${num} ${arrow}</span><span class="tstat${late ? ' late' : ''}">${status}</span></li>`;
  }
}

export const MISSION_COUNT = MISSIONS.length;
