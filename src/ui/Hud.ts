import { COST, STATION_UPGRADE } from '../config';
import { systemOn } from '../game/Systems';
import { DEMO, STEAM_URL } from '../game/Edition';
import { BIG_REPAIR_COST, CANCEL_COST, Game, fmtTime, REPAIR_COST, type LogEntry, type UiEvent } from '../game/Game';
import { CHANGELOG, VERSION } from '../game/changelog';
import { ACHIEVEMENTS } from '../game/Achievements';
import { goalProgress } from '../game/Goals';
import { currentMap } from '../world/maps';
import { Menus } from './Menus';
import type { NewGameSetup } from '../game/FreePlay';
import { activeProfile, CHAPTERS, deleteProfile, listProfiles, setActive, type Profile } from '../game/Profiles';
import { Sound } from '../render/Sound';
import { MISSIONS, ToolId } from '../game/Missions';
import { activateSlot, clearSave, deleteProfileSlots, deleteSlot, importSave, listSlots, readSlot, saveState, writeSave, writeSlot } from '../game/storage';
import { exportSave, FILE_EXT, readSaveFile } from '../game/saveFile';
import { downloadReport } from '../game/crash';
import { Minimap } from './Minimap';
import { findTerm, LEXICON } from '../game/Lexicon';
import { firstPayment, loanLimit, loanOffers, repayLoan, takeLoan, totalInterest } from '../game/Loans';
import { TIERS, tierChecks } from '../game/StationTiers';
import { MENTOR, mentorLine, problems, type Problem } from '../game/Problems';
import { DEFAULT_KEYS, FILTER_CSS, FILTERS, fromUi, KEY_ACTIONS, keyOf, maxUiScale, setSettings, settings, toUi, UI_SCALES, type DisplayFilter, type KeyAction } from '../game/settings';
import { OPERATORS, type OperatorId } from '../sim/Operators';
import { RESEARCH_BY_ID, ResearchId, ResearchTree, TREES } from '../game/Research';
import { cancelRisk } from '../game/Contracts';
import { Timetable } from './Timetable';
import { trainStatus } from '../game/TrainStatus';
import { SEASON_FILTER, SEASON_ICON, SEASON_NAME } from '../game/Seasons';
import { setInspectors } from '../game/FareDodgers';
import { autoCode, cleanCode } from '../game/StationCode';
import { letPass } from '../game/Connections';
import { baseDeparture, dispoConflicts, dispoSlots, setHold, setTrainPlatform, shiftHold } from '../game/Disposition';
import { TitleShow } from '../render/TitleShow';
import { author, newsPhoto, paperName } from './press';
import { BOARD } from '../game/Board';
import { avatar, portrait } from './portrait';
import { BUILDINGS, isStation, SHOPS } from '../world/buildings';
import { toggleForeignMode } from '../game/Foreign';
import { unlockAchievement } from '../platform/Platform';
import { contractsHtml, contractsKey, offerHtml, researchHtml, researchKey, researchTabsHtml, researchTipHtml, statsHtml, statsKey, statsView, TRANSIT_FEE, type StatsTab } from './Screens';
import type { Train } from '../sim/Simulation';
import type { PersonCard } from '../render/People';

/** Text sicher in HTML einsetzen */
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
import type { GameScene, Layer, UiState } from '../render/GameScene';
import { LAYERS, VARIANTS, typing, variantOf } from '../render/GameScene';
import { BUILD_MENU_TREE, curKey, locate, needOf, nextVariant, pickVariant, rotate, rotation, typeLocked, variantLocked, variantOn, type BGroup, type BType, type BVariant } from './BuildMenu';

const $ = (id: string) => document.getElementById(id)!;

/** Laufschrift der Abfahrtstafel: Bahn-Fakten (neben den News aus „Was ist neu?“) */
const RAIL_FACTS = [
  'Wussten Sie? Die erste Bahn auf österreichischem Boden war eine Pferdeeisenbahn: Linz–Budweis, ab 1832.',
  'Wussten Sie? Die Kaiser-Ferdinands-Nordbahn fuhr ab 1837 als erste Dampfeisenbahn Österreichs.',
  'Wussten Sie? Die Semmeringbahn ist die erste normalspurige Gebirgsbahn Europas – und UNESCO-Welterbe.',
  'Wussten Sie? Der Gotthard-Basistunnel ist mit 57 km der längste Eisenbahntunnel der Welt.',
  'Wussten Sie? Normalspur heißt 1435 mm – so breit fahren die meisten Bahnen Europas.',
  'Wussten Sie? Hinter jedem Hauptsignal beginnt ein Blockabschnitt – darin darf immer nur ein Zug sein.',
  'Wussten Sie? Die Bauten der Wiener Stadtbahn stammen großteils von Otto Wagner.',
  'Wussten Sie? Die durchschnittliche Verspätung des japanischen Shinkansen liegt unter einer Minute.',
];
const eur = (n: number) => Math.round(n).toLocaleString('de-AT');
const SPEEDS = [1, 2, 4, 8];
const ICON = (name: string) => `assets/gen/icons/${name}.png`;
const PHOTO_CAPTION: Record<string, string> = {
  fest: 'Schon am Vormittag herrschte reges Treiben am Festplatz.',
  sponsor: 'Der Bahnhofsvorplatz – bald Schauplatz eines großen Festes?',
  fans: 'Archivbild: Fans beim letzten Auswärtsspiel.',
  'vandal-trains': 'Kein Kunstwerk: besprühte Garnitur vor der Waschanlage.',
  'vandal-station': 'Spuren der Verwüstung am Bahnsteig.',
  'special-feiertag': 'Ruhiger Bahnhofsvorplatz – die Ausflügler sind schon unterwegs.',
  'special-heimspiel': 'Archivbild: So voll war es beim letzten Derby.',
  'special-ferien': 'Gepäckberge am Bahnsteig: Die Ferien können kommen.',
  'special-streik': 'Leere Bänke: Hier fährt morgen nichts.',
  'bigfault-tree': 'Hier geht vorerst nichts: Feuerwehr bei der Arbeit.',
  'bigfault-wire': 'Der Fahrdraht hängt durch – Techniker sind unterwegs.',
};

interface ToolDef { id: ToolId; label: string; key: string; icon?: string; cost?: number; help: string }

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Ansehen', key: '1', icon: 'tool_cursor', help: 'Ziehen = Karte verschieben · Mausrad = Zoom · Zug anfahren = Infos' },
  { id: 'land', label: 'Land kaufen', key: '2', icon: 'tool_flag', help: 'Gelbe Parzelle anklicken' },
  { id: 'platform', label: 'Bahnsteig', key: '3', icon: 'platform', cost: COST.platform, help: 'Neben dem Gleis ziehen' },
  { id: 'track', label: 'Gleis', key: '4', icon: 'track', cost: COST.track,
    help: 'Ziehen: waagrecht = gerade, schräg = Diagonale (kreuzt Gleise automatisch)' },
  { id: 'curve', label: 'Kurve', key: '5', cost: COST.curve, help: 'Klicken · R = drehen' },
  { id: 'switch', label: 'Weiche', key: '6', cost: COST.switch, help: 'Gleiswechsel und Abzweige · R = drehen · T = nächste Variante' },
  { id: 'signal', label: 'Signal', key: '7', cost: COST.signal, help: 'Auf Gleis klicken · R = Fahrtrichtung · T = Haupt-/Rangiersignal' },
  { id: 'wire', label: 'Oberleitung', key: '8', icon: 'tool_wire', cost: COST.wire, help: 'Über Gleise ziehen · ohne Oberleitung halten nur Dieselzüge' },
  { id: 'access', label: 'Zugang', key: '9', help: 'Von Bahnsteig zu Bahnsteig quer über die Gleise ziehen' },
  { id: 'road', label: 'Straße', key: '0', icon: 'tool_road', cost: COST.road, help: 'Ziehen · verbindet Empfangsgebäude mit Parkplatz und Busterminal' },
  { id: 'building', label: 'Gebäude', key: 'B', help: 'Klicken zum Bauen · R = drehen · T = nächstes Gebäude' },
  { id: 'facility', label: 'Anlagen', key: 'N', help: 'Auf Gleise setzen bzw. Gleise markieren · T = nächste' },
  { id: 'remove', label: 'Abriss', key: 'X', icon: 'tool_shovel', help: 'Klicken oder Fläche aufziehen · je Feld das oberste Teil: Signal → Gebäude → Zugang → Bahnsteig → Markierung → Gleis' },
];

/** Baumenü (untere Leiste): Gruppe → Typ → Variante → Drehung (siehe BuildMenu.ts) */
const MENU = BUILD_MENU_TREE;
type MenuGroup = BGroup;


export class Hud {
  private ribbonUntil = 0;
  private savedFlash = 0;
  private fresh = new Set<ToolId>();
  private lastVariantsKey = '';
  private lastQuest = -1;
  private pausedBeforeMenu = false;

  constructor(private g: Game, private ui: UiState, private scene: () => GameScene | undefined, private hadSave: boolean, freshStart = false) {
    this.buildHotbar();
    this.minimap = new Minimap($('minimap') as HTMLCanvasElement, g, scene);
    $('bar-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (b) this.setTab(b.dataset.tab!);
    });
    let tab0 = 'trains';
    try { tab0 = localStorage.getItem('rm_tab') ?? 'trains'; } catch { /* egal */ }
    this.setTab(tab0);
    $('mm-zin').onclick = () => this.minimap.zoom(1);
    $('mm-zout').onclick = () => this.minimap.zoom(-1);
    const LAYER_ICON: Record<string, string> = { occupancy: 'signal_E', pax: 'bld_bench', mood: 'bld_cafe', wear: 'tool_shovel' };
    $('layer-btns').innerHTML = LAYERS.map((l) => `<button data-layer="${l.id}" data-tt="Ebene: ${l.name} (Ü)"><img src="${ICON(LAYER_ICON[l.id])}" alt="" /></button>`).join('');
    $('layer-btns').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null;
      if (b) this.setLayer(this.ui.layer === b.dataset.layer ? undefined : b.dataset.layer as Layer);
    });

    $('speed').querySelectorAll('button[data-speed]').forEach((b) => {
      b.addEventListener('click', () => { this.skip = undefined; this.setSpeed(Number((b as HTMLElement).dataset.speed)); });
    });
    $('btn-skip').onclick = () => this.toggleSkip();
    $('dayend').addEventListener('click', () => $('dayend').classList.add('hidden'));
    $('btn-save').onclick = () => {
      const s = this.g.save();
      if (writeSave(s) && writeSlot(`${this.g.company || 'Spiel'} · ${fmtTime(this.g.sim.time)}`, false, s)) this.savedFlash = performance.now() + 1500;
    };
    $('m-load').onclick = () => this.toggleSlots('m-slots');
    $('go-load').onclick = () => this.toggleSlots('go-slots');
    $('go-new').onclick = () => { $('gameover').classList.add('hidden'); this.openMenu(); };
    for (const id of ['m-slots', 'go-slots']) {
      $(id).addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const l = t.closest('[data-load]') as HTMLElement | null;
        if (l && activateSlot(l.dataset.load!)) this.loadActive();
        const d = t.closest('[data-del]') as HTMLElement | null;
        if (d) { deleteSlot(d.dataset.del!); this.renderSlots(id); }
        const x = t.closest('[data-export]') as HTMLElement | null;
        if (x) {
          const s = readSlot(x.dataset.export!);
          const info = listSlots().find((i) => i.id === x.dataset.export);
          if (s) void exportSave(s, info?.label); else this.slotMsg(id, 'Dieser Spielstand ist nicht mehr da.', true);
        }
        if (t.closest('[data-import]')) this.pickImport(id);
      });
    }
    $('p-export').onclick = () => { void exportSave(this.g.save(), `${this.g.company || 'Spiel'} · ${fmtTime(this.g.sim.time)}`); };
    $('p-report').onclick = () => downloadReport();
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
    // im Spiel nur ansehen – ändern geht im Hauptmenü (rechts oben)
    $('company').onclick = () => { const p = listProfiles().find((x) => x.id === this.g.profileId); if (p) this.menus.openStats(p, true); };
    $('name-ok').onclick = () => this.confirmName();
    ($('name-input') as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') this.confirmName(); });
    ($('code-input') as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') this.confirmName(); e.stopPropagation(); });
    // Kürzel-Vorschlag folgt dem Namen
    $('name-input').addEventListener('input', () => { ($('code-input') as HTMLInputElement).placeholder = autoCode(($('name-input') as HTMLInputElement).value || 'Bahnhof'); });
    // Ein-/Ausklappen, Zustand bleibt gespeichert
    let folds: Record<string, boolean> = {};
    try { folds = JSON.parse(localStorage.getItem('rm_folds') ?? '{}'); } catch { /* egal */ }
    document.querySelectorAll('[data-fold]').forEach((h) => {
      const id = (h as HTMLElement).dataset.fold!;
      if (typeof folds[id] === 'boolean') $(id).classList.toggle('closed', folds[id]);
      h.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        folds[id] = $(id).classList.toggle('closed');
        try { localStorage.setItem('rm_folds', JSON.stringify(folds)); } catch { /* egal */ }
      });
    });
    $('q-show').onclick = () => this.showQuest();

    // Listen rechts: Klick zeigt die Details in der linken Spalte (statt Hover-Kärtchen)
    $('trains').addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null;
      if (!li) return;
      const id = Number(li.dataset.id);
      this.detail = { kind: 'train', id };
      const t = this.g.sim.trains.find((x) => x.id === id);
      if (t) this.scene()?.focusTrain(id);
    });
    $('log').addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
      if (li) this.detail = { kind: 'log', entry: this.g.log[Number(li.dataset.i)] };
    });
    $('sat').addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('[data-op]') as HTMLElement | null;
      if (r) this.detail = { kind: 'op', id: r.dataset.op as OperatorId };
    });
    $('bar-detail').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tm],[data-dt],[data-bp]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.dt === 'contracts') { this.openScreen('contracts'); return; }
      if (b.dataset.dt === 'close') { this.detail = null; return; }
      if (b.dataset.bp && this.detail?.kind === 'bld') {
        const bl = this.g.grid.buildings.get(this.detail.id);
        if (!bl) return;
        if (b.dataset.bp === 'rename') this.askStation(bl.id, true);
        if (b.dataset.bp === 'upgrade') this.g.upgradeStation(bl.id);
        if (b.dataset.bp === 'auto') this.g.toggleShopAuto(bl.key);
        if (b.dataset.bp === 'price') this.g.setShopPrice(bl.key, this.g.shopPrices[bl.key] + Number(b.dataset.d) * ((e as MouseEvent).shiftKey ? 2 : 1));
        this.detailActKey = '';
        return;
      }
      if (this.detail?.kind === 'train') this.trainAction(b, this.detail.id);
    });
    $('train-menu').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tm]') as HTMLElement | null;
      if (!b) return;
      this.trainAction(b, Number($('train-menu').dataset.id));
    });
    const trainAction = (b: HTMLElement, id: number) => {
      const box = b.closest('#train-menu, #bar-detail') as HTMLElement;
      if (b.dataset.tm === 'focus') this.scene()?.focusTrain(id);
      if (b.dataset.tm === 'plat') {
        const sim = this.g.sim;
        const t = sim.trains.find((x) => x.id === id) ?? sim.queue.find((x) => x.id === id);
        if (t) {
          const k = `${t.op.id}:${t.dir}`;
          if (b.dataset.run) sim.platformPref[k] = b.dataset.run; else delete sim.platformPref[k];
          this.g.version++;
        }
        box.querySelectorAll('[data-tm="plat"]').forEach((x) => x.classList.toggle('on', x === b));
        this.detailKey = '';
        return;
      }
      if (b.dataset.tm === 'remove') {
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Wirklich? Nochmal klicken'; return; }
        this.g.removeTrain(id);
        if (this.detail?.kind === 'train' && this.detail.id === id) this.detail = null;
      }
      $('train-menu').classList.add('hidden');
    };
    this.trainAction = trainAction;
    document.addEventListener('mousedown', (e) => {
      if (!(e.target as HTMLElement).closest('#train-menu, #trains')) $('train-menu').classList.add('hidden');
    });

    // Hauptmenü
    $('m-continue').onclick = () => this.closeMenu();
    $('m-campaign').onclick = () => this.withProfile(() => this.menus.openCampaign());
    $('m-free').onclick = () => this.withProfile(() => this.menus.openFree());
    $('m-chal').onclick = () => this.withProfile(() => this.menus.openChallenges());
    $('m-stats').onclick = () => this.withProfile(() => this.menus.openStats(activeProfile()!));
    $('m-companies').onclick = () => this.menus.openMaps();
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
    $('ng-no').onclick = () => { $('ng-ask').classList.add('hidden'); this.launchPending(); };
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
    else {
      // Vollversion: Beenden statt Entwickler-Knopf
      $('m-quit').classList.remove('hidden');
      $('m-quit').onclick = () => {
        if (this.g.company) writeSave(this.g.save());
        window.close();
        setTimeout(() => $('quit').classList.remove('hidden'), 200);
      };
      $('quit-back').onclick = () => $('quit').classList.add('hidden');
    }
    if (DEMO) {
      $('m-demo-badge').classList.remove('hidden');
      $('m-steam').classList.remove('hidden');
      $('m-steam').onclick = () => window.open(STEAM_URL, '_blank', 'noopener');
    }
    $('m-help').onclick = () => this.openHelp();
    $('p-help').onclick = () => this.openHelp();
    $('help-close').onclick = () => $('help').classList.add('hidden');
    $('help-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-help]') as HTMLElement | null;
      if (b) this.openHelp(b.dataset.help as 'keys' | 'parts' | 'abc');
    });
    $('m-settings').onclick = () => this.openSettings();
    $('p-settings').onclick = () => this.openSettings();
    $('set-close').onclick = $('set-ok').onclick = () => $('settings').classList.add('hidden');
    $('set-scale').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-scale]') as HTMLButtonElement | null;
      if (b && !b.disabled) { setSettings({ uiScale: Number(b.dataset.scale) }); this.renderSettings(); }
    });
    $('set-sfx').addEventListener('input', () => { setSettings({ sfx: Number(($('set-sfx') as HTMLInputElement).value) }); this.renderSettings(); });
    $('set-sfx').addEventListener('change', () => Sound.gong());
    $('set-music').addEventListener('input', () => { setSettings({ music: Number(($('set-music') as HTMLInputElement).value) }); this.renderSettings(); });
    $('set-scroll').addEventListener('input', () => { setSettings({ scroll: Number(($('set-scroll') as HTMLInputElement).value) }); this.renderSettings(); });
    $('set-contrast').onclick = () => { setSettings({ contrast: !settings.contrast }); this.renderSettings(); };
    $('set-cb').onclick = () => { setSettings({ colorblind: !settings.colorblind }); this.renderSettings(); };
    $('set-filter').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-filter]') as HTMLElement | null;
      if (b) { setSettings({ filter: b.dataset.filter as DisplayFilter }); this.renderSettings(); this.gameFilter = ''; }
    });
    // Tastenbelegung (RM-FR-UI-09): Knopf anklicken, dann Taste drücken
    $('set-keys').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-key-act],[data-key-reset]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.keyReset !== undefined) { setSettings({ keys: { ...DEFAULT_KEYS } }); this.renderSettings(); return; }
      this.rebinding = b.dataset.keyAct as KeyAction;
      b.textContent = '…';
    });
    window.addEventListener('keydown', (e) => {
      if (!this.rebinding) return;
      e.preventDefault(); e.stopPropagation();
      const k = e.key.toLowerCase();
      if (e.key !== 'Escape' && /^[a-zäöüß]$/.test(k)) {
        const taken = (Object.entries(settings.keys) as [KeyAction, string][]).find(([a, v]) => v === k && a !== this.rebinding);
        const keys = { ...settings.keys, [this.rebinding]: k };
        if (taken) keys[taken[0]] = settings.keys[this.rebinding];
        setSettings({ keys });
      }
      this.rebinding = null;
      this.renderSettings();
    }, true);
    $('set-cues').onclick = () => { setSettings({ cues: !settings.cues }); this.renderSettings(); };
    $('set-numbers').onclick = () => { setSettings({ numbers: !settings.numbers }); this.renderSettings(); };
    // Töne als Symbol (RM-FR-UI-13)
    let cueTimer = 0;
    Sound.onCue((kind) => {
      if (!settings.cues) return;
      const c = $('cue');
      c.textContent = kind === 'gong' ? '♪ Gong · Durchsage' : kind === 'whistle' ? '♪ Pfiff · Abfahrt' : '♪ Kasse';
      c.classList.remove('hidden');
      clearTimeout(cueTimer);
      cueTimer = window.setTimeout(() => c.classList.add('hidden'), 1200);
    });
    $('set-anim').onclick = () => { setSettings({ anim: !settings.anim }); this.renderSettings(); };
    window.addEventListener('resize', () => { if (!$('settings').classList.contains('hidden')) this.renderSettings(); });

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
    $('money-wrap').onclick = () => { if (this.g.company && systemOn(this.g, 'loan')) this.openBank(); };
    $('bank-close').onclick = () => $('bank').classList.add('hidden');
    $('bank-body').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-loan],[data-repay]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.repay !== undefined) repayLoan(this.g);
      else { const [amount, days] = b.dataset.loan!.split(':').map(Number); takeLoan(this.g, { amount, days, rate: 0 }); }
      this.openBank();
    });
    $('is-face').innerHTML = avatar(MENTOR.avatar, 36);
    $('is-who').textContent = `${MENTOR.name}, ${MENTOR.role}`;
    $('is-list').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-is]') as HTMLElement | null;
      if (!b) return;
      const p = this.issueList.find((x) => x.id === b.dataset.is);
      if (!p) return;
      if (b.dataset.act === 'show') this.showIssue(p);
      else if (p.fix?.run) { const msg = p.fix.run(this.g); this.flash(msg || `Erledigt: ${p.fix.label}`); this.issueKey = ''; }
      else if (p.fix?.ui === 'inbox') this.openInbox();
      else if (p.fix?.ui === 'contracts') this.openScreen('contracts');
      else if (p.fix?.ui === 'research') this.openScreen('research');
      else if (p.fix?.ui === 'offer') this.showOffer();
    });
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
    $('btn-undo').onclick = () => this.undoRedo(false);
    $('btn-redo').onclick = () => this.undoRedo(true);
    $('btn-timetable').onclick = () => this.openScreen('timetable');
    this.timetable = new Timetable(this.g);
    $('tt-ops').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-shift],[data-plat]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.shift) this.g.shiftTimes(b.dataset.op as keyof typeof OPERATORS, Number(b.dataset.shift));
      if (b.dataset.plat !== undefined) {
        const k = b.dataset.key!;
        if (b.dataset.plat) this.g.sim.platformPref[k] = b.dataset.plat; else delete this.g.sim.platformPref[k];
        this.g.version++;
      }
      this.ttKey = '';
    });
    this.initDispo();
    $('st-body').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-sttab]') as HTMLElement | null;
      if (b) { statsView.tab = b.dataset.sttab as StatsTab; this.renderScreen(true); }
    });
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
      const tw = fromUi(tip.offsetWidth), th = fromUi(tip.offsetHeight);
      const left = r.right + 12 + tw > window.innerWidth ? r.left - 12 - tw : r.right + 12;
      tip.style.left = `${toUi(Math.max(4, left))}px`;
      tip.style.top = `${toUi(Math.max(4, Math.min(window.innerHeight - th - 4, r.top)))}px`;
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
      const au = t.closest('[data-auto]') as HTMLElement | null;
      if (au) this.g.toggleAutoPrice(au.dataset.auto as keyof typeof OPERATORS);
      const sv = t.closest('[data-svc]') as HTMLElement | null;
      if (sv) this.g.toggleService(sv.dataset.svc as keyof typeof OPERATORS);
      const bo = t.closest('[data-boost]') as HTMLElement | null;
      if (bo) this.g.toggleBoost(bo.dataset.boost as keyof typeof OPERATORS);
      const fm = t.closest('[data-fmode]') as HTMLElement | null;
      if (fm) toggleForeignMode(this.g, fm.dataset.fmode as keyof typeof OPERATORS);
      const cr = t.closest('[data-crew]') as HTMLElement | null;
      if (cr) this.g.setCrew(this.g.crew + Number(cr.dataset.crew));
      const ip = t.closest('[data-insp]') as HTMLElement | null;
      if (ip) setInspectors(this.g, this.g.inspectors + Number(ip.dataset.insp));
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
      if (!$('bank').classList.contains('hidden')) {
        if (e.key === 'Escape') { e.preventDefault(); $('bank').classList.add('hidden'); }
        return;
      }
      if (!$('help').classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'F1' || e.key.toLowerCase() === 'h') { e.preventDefault(); $('help').classList.add('hidden'); }
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); this.openHelp(); return; }
      if (!$('settings').classList.contains('hidden')) {
        if (e.key === 'Escape') { e.preventDefault(); $('settings').classList.add('hidden'); }
        return;
      }
      // Schnellspeichern
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) { e.preventDefault(); if (this.g.company) $('btn-save').click(); return; }
      if (!$('event').classList.contains('hidden')) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); this.closeEvent(); }
        return;
      }
      if (!$('modal').classList.contains('hidden') || typing()) return;
      if (this.rebinding) return;
      const K = settings.keys;
      // Rückgängig / Wiederholen (Strg+Z, Strg+Y, Strg+Umschalt+Z; am Mac mit ⌘)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (this.g.company) this.undoRedo(e.key.toLowerCase() === 'y' || e.shiftKey);
        return;
      }
      if (this.screen) {
        const k = e.key.toLowerCase();
        if (e.key === 'Escape' || (k === K.research && this.screen === 'research') || (k === K.contracts && this.screen === 'contracts') || (k === K.timetable && this.screen === 'timetable')) this.closeScreen();
        return;
      }
      const kk = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (!this.ui.menu && kk === K.research && !mod) { this.openScreen('research'); return; }
      if (!this.ui.menu && kk === K.contracts && !mod) { this.openScreen('contracts'); return; }
      if (kk === K.help && !mod) { this.openHelp(); return; }
      if (!this.ui.menu && kk === K.issues && !mod) { this.toggleIssues(); return; }
      if (!this.ui.menu && kk === K.layers && !mod) { this.cycleLayer(); return; }
      if (!this.ui.menu && kk === K.rotate && !mod) { rotate(this.ui, this.g); return; }
      if (!this.ui.menu && kk === K.mail && !mod) { if ($('inbox').classList.contains('hidden')) this.openInbox(); else $('inbox').classList.add('hidden'); return; }
      if (!this.ui.menu && kk === K.variant && !mod) { nextVariant(this.ui, this.g); return; }
      if (!this.ui.menu && kk === K.timetable && !mod) { this.openScreen('timetable'); return; }
      if (!this.ui.menu && kk === K.skip && !mod) { this.toggleSkip(); return; }
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
        if (grp && grp.types.length > 1 && grp.types[idx]) { this.pickType(grp.types[idx], grp); this.groupKeyUntil = 0; return; }
      }
      const grp = MENU.find((m) => m.key === k || m.alt?.toLowerCase() === k);
      if (grp) { this.pickGroup(grp); this.groupKeyUntil = performance.now() + 2000; }
    });

    // neues Spiel aus dem Menü (Profil und Modus stehen schon fest): gleich los
    if (freshStart && this.g.company) {
      this.ui.menu = false;
      $('menu').classList.add('hidden');
      this.g.paused = false;
    } else this.openMenu();
    this.setupTooltips();
    document.addEventListener('mousemove', (e) => {
      const t = e.target as HTMLElement;
      this.mouse = { x: e.clientX, y: e.clientY, onMap: t.tagName === 'CANVAS' && !t.closest('#bar') };
    });
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
    this.refreshMenu();
    $('m-sub').textContent = '';
    $('menu').classList.remove('hidden');
    // erster Start: zuerst ein Profil anlegen (RM-FR-PROF-02)
    if (!activeProfile()) setTimeout(() => this.menus.onboard(() => { this.refreshMenu(); this.menus.openCampaign(); }), 300);
    this.titleShow.start();
  }

  // ------------------------------------------------------------ Pause-Fenster mit Kurzbilanz
  private pausedBeforePause = false;
  private openPause() {
    if (!this.g.company) { this.openMenu(); return; }
    const g = this.g;
    if ($('pause').classList.contains('hidden')) this.pausedBeforePause = g.paused;
    g.paused = true;
    const day = Math.floor(g.sim.time / 86400) + 1;
    $('p-body').innerHTML = `<div class="p-kpis" title="${g.company} · ${currentMap().name} · Tag ${day}, ${fmtTime(g.sim.time)} Uhr">
      <div><b class="${g.money < 0 ? 'no' : ''}">${eur(g.money)} €</b><small>Kasse</small></div>
      <div><b class="gold">${'★'.repeat(g.rating.stars)}${'☆'.repeat(5 - g.rating.stars)}</b><small>Bewertung</small></div>
      <div><b>${g.stats.handled ? `${Math.round(g.punctuality * 100)} %` : '–'}</b><small>pünktlich</small></div>
      <div><b>${g.stats.handled.toLocaleString('de-AT')}</b><small>Züge</small></div>
    </div>`;
    $('p-save').textContent = 'Speichern';
    $('pause').classList.remove('hidden');
  }

  private closePause() {
    $('pause').classList.add('hidden');
    this.g.paused = this.pausedBeforePause;
  }

  private titleShow = new TitleShow($('menu'));

  /** Spielstand ohne Neuladen übernehmen (RM-FR-PERF-04); main.ts setzt den Lader */
  onLoad?: () => boolean;

  /** aktiven Spielstand laden – ohne Neuladen der Seite, notfalls mit */
  private loadActive() {
    if (!this.onLoad?.()) { saveState.disabled = true; location.reload(); return; }
    // alle Zwischenstände der Anzeige verwerfen
    const self = this as unknown as Record<string, unknown>;
    for (const k of Object.keys(self)) if (k.endsWith('Key') && typeof self[k] === 'string') self[k] = '';
    this.lastQuest = -1;
    this.minimap.reset();
    for (const id of ['gameover', 'pause', 'dayend', 'm-slots', 'go-slots']) document.getElementById(id)?.classList.add('hidden');
    this.pausedBeforeMenu = false;
    this.closeMenu();
  }

  private closeMenu() {
    this.titleShow.stop();
    $('menu').classList.add('hidden');
    this.ui.menu = false;
    this.g.paused = this.pausedBeforeMenu;
  }

  // ------------------------------------------------------------ Profile (RM-FR-PROF-01/02)
  private menus = new Menus({
    start: (s) => this.startGame(s),
    switchProfile: (id) => this.switchProfile(id),
    deleteProfile: (p) => this.removeProfile(p),
    changed: () => this.refreshMenu(),
  });

  /** erst ein Profil anlegen, dann weiter */
  private withProfile(then: () => void) {
    if (activeProfile()) then();
    else this.menus.onboard(() => { this.refreshMenu(); then(); });
  }

  private switchProfile(id: string) {
    // laufendes Spiel gehört zum alten Profil: dort sichern, dann frisch starten
    if (this.g.company && this.g.profileId !== id) {
      writeSlot(`${this.g.company} · Profilwechsel`, true, this.g.save());
      saveState.disabled = true;
      clearSave();
      setActive(id);
      location.reload();
      return;
    }
    setActive(id);
    this.menus.renderProfiles();
    this.refreshMenu();
  }

  private removeProfile(p: Profile) {
    deleteProfileSlots(p.id);
    deleteProfile(p.id);
    // laufendes Spiel gehört dazu – oder es war das letzte Profil: neu starten (dann kommt wieder das Onboarding)
    if (this.g.profileId === p.id || !listProfiles().length) { saveState.disabled = true; clearSave(); location.reload(); return; }
    this.menus.renderProfiles();
    this.refreshMenu();
  }

  private clockTimer = 0;

  private refreshMenu() {
    const p = activeProfile();
    // Profil geändert: laufendes Spiel dieses Profils mitziehen
    if (p && this.g.company && this.g.profileId === p.id && (this.g.company !== p.company || this.g.player.avatar !== p.player.avatar || this.g.player.name !== p.player.name || this.g.player.title !== p.player.title)) {
      this.g.company = p.company; this.g.player = { ...p.player }; this.companyKey = '';
    }
    const running = !!this.g.company && (!this.g.profileId || this.g.profileId === p?.id);
    $('m-continue').style.display = running ? '' : 'none';
    this.menus.renderAccount();
    const cs = document.getElementById('m-campaign-sub');
    if (cs) cs.textContent = DEMO ? 'Kapitel 1: Donautal (Demo)' : p ? (p.chapters.length >= CHAPTERS.length ? 'alle Kapitel geschafft!' : `Kapitel ${p.chapters.length + 1} von ${CHAPTERS.length}`) : 'Kapitel für Kapitel zum Hauptbahnhof';
    const sub = document.getElementById('m-continue-sub');
    if (running && sub) sub.textContent = `${this.g.company} · Tag ${Math.floor(this.g.sim.time / 86400) + 1} · ${currentMap().name}`;
    // Abfahrtstafel: Uhr und Laufschrift
    // fehlende Felder (z. B. alte index.html im Browser-Cache) einfach überspringen
    const clock = () => { const c = document.getElementById('mb-clock'); if (c) c.textContent = new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }); };
    clock();
    if (!this.clockTimer) this.clockTimer = window.setInterval(clock, 15000);
    // News der aktuellen Version (kurz) und ein paar Bahn-Fakten im Wechsel
    const plain = (t: string) => { const x = t.replace(/<[^>]+>/g, '').split(' – ')[0]; return x.length > 110 ? `${x.slice(0, x.lastIndexOf(' ', 107))} …` : x; };
    const news = (CHANGELOG[0]?.items ?? []).filter((x) => x.kind === 'neu').map((x) => `Neu in ${CHANGELOG[0].version}: ${plain(x.text)}`);
    const facts = [...RAIL_FACTS].sort(() => Math.random() - 0.5).slice(0, 3);
    const lines: string[] = [];
    news.slice(0, 6).forEach((n, k) => { lines.push(n); if (k % 2 === 1 && facts.length) lines.push(facts.shift()!); });
    lines.push(...facts);
    if (p) lines.unshift(`Willkommen zurück, ${[p.player.title, p.player.name].filter(Boolean).join(' ') || 'Betriebsleitung'} (${p.company})!`);
    const tick = document.getElementById('mb-ticker');
    if (tick) tick.textContent = lines.join('   +++   ');
  }

  /** neues Spiel aus Kampagne / freiem Spiel: laufendes Spiel vorher speichern? */
  private pendingSetup: NewGameSetup | null = null;
  private startGame(setup: NewGameSetup) {
    this.pendingSetup = setup;
    const running = !!this.g.company && this.g.profileId === setup.profileId;
    if (!running) { this.launchPending(); return; }
    $('ng-ask').classList.remove('hidden');
    $('ng-save').classList.add('hidden');
    $('ng-q').classList.remove('hidden');
  }

  private launchPending() {
    const s = this.pendingSetup;
    if (!s) return;
    saveState.disabled = true;
    clearSave();
    try { sessionStorage.setItem('rm_new', '1'); sessionStorage.setItem('rm_map', s.map); sessionStorage.setItem('rm_setup', JSON.stringify(s)); } catch { /* egal */ }
    location.reload();
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
    this.launchPending();
  }

  // ------------------------------------------------------------ Namen (Firma, Bahnhof)
  private naming: { kind: 'station'; id: number } = { kind: 'station', id: -1 };
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

  private askStation(id: number, rename = false) {
    const b = this.g.grid.buildings.get(id);
    if (!b) return;
    this.naming = { kind: 'station', id };
    this.openNameDialog(rename ? 'Bahnhof umbenennen' : 'Neuer Bahnhof', 'Wie soll dieser Bahnhof heißen?', b.name ?? '', 'z.B. Donaufeld');
    const ci = $('code-input') as HTMLInputElement;
    ci.value = b.code ?? '';
    ci.placeholder = autoCode(b.name || 'Bahnhof');
    $('code-row').classList.remove('hidden');
    $('name-ok').textContent = 'Taufen!';
  }

  private confirmName() {
    const v = ($('name-input') as HTMLInputElement).value.trim();
    this.g.stationName(this.naming.id, v || this.g.suggestStationName(), cleanCode(($('code-input') as HTMLInputElement).value));
    $('code-row').classList.add('hidden');
    ($('name-input') as HTMLInputElement).blur();
    $('modal').classList.add('hidden');
    this.g.paused = this.pausedBeforeDialog;
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
    if (this.screen === 'timetable') { this.timetable.draw($('tt-canvas') as HTMLCanvasElement); this.renderDispo(); this.renderTtOps(); return; }
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
  // ------------------------------------------------------------ Spielstände
  // ------------------------------------------------------------ Einstellungen (RM-FR-UI-09, RM-FR-UI-14)
  private openSettings() {
    this.renderSettings();
    $('settings').classList.remove('hidden');
  }

  private renderSettings() {
    const max = maxUiScale();
    $('set-scale').innerHTML = UI_SCALES.map((s) => `<button class="btn${settings.uiScale === s ? ' on' : ''}" data-scale="${s}"${s > max ? ' disabled' : ''}>${s} %</button>`).join('');
    $('set-scale-note').textContent = settings.uiScale > max
      ? `Auf diesem Bildschirm passen höchstens ${max} % – es wird ${max} % verwendet.`
      : `Das Spielfeld bleibt gleich groß (zoomen mit dem Mausrad).${max < UI_SCALES[UI_SCALES.length - 1] ? ' Größere Stufen passen nicht auf diesen Bildschirm.' : ''}`;
    ($('set-music') as HTMLInputElement).value = String(settings.music);
    $('set-music-v').textContent = settings.music ? `${settings.music} %` : 'aus';
    ($('set-sfx') as HTMLInputElement).value = String(settings.sfx);
    $('set-sfx-v').textContent = settings.sfx ? `${settings.sfx} %` : 'aus';
    ($('set-scroll') as HTMLInputElement).value = String(settings.scroll);
    $('set-scroll-v').textContent = `${settings.scroll} %`;
    $('set-contrast').textContent = settings.contrast ? 'An' : 'Aus';
    $('set-contrast').classList.toggle('on', settings.contrast);
    $('set-filter').innerHTML = FILTERS.map((f) => `<button class="btn${settings.filter === f.id ? ' on' : ''}" data-filter="${f.id}">${f.label}</button>`).join('');
    $('set-keys').innerHTML = KEY_ACTIONS.map((a) => `<span class="sk"><button class="btn" data-key-act="${a.id}">${keyOf(a.id)}</button>${a.label}</span>`).join('')
      + '<button class="btn sk-reset" data-key-reset>Standard</button>';
    for (const [id, on] of [['set-cb', settings.colorblind], ['set-cues', settings.cues], ['set-numbers', settings.numbers]] as const) { $(id).textContent = on ? 'An' : 'Aus'; $(id).classList.toggle('on', on); }
    $('set-anim').textContent = settings.anim ? 'An' : 'Aus';
    $('set-anim').classList.toggle('on', settings.anim);
  }

  private minimap!: Minimap;

  /** Ebene ein-/umschalten (RM-FR-UI-12) */
  setLayer(l: Layer | undefined) {
    this.ui.layer = l;
    const def = LAYERS.find((x) => x.id === l);
    document.querySelectorAll<HTMLElement>('#layer-btns [data-layer]').forEach((b) => b.classList.toggle('on', b.dataset.layer === l));
    const leg = $('layer-legend');
    leg.classList.toggle('hidden', !def);
    leg.innerHTML = def ? def.legend.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('') : '';

  }

  private cycleLayer() {
    const i = LAYERS.findIndex((x) => x.id === this.ui.layer);
    this.setLayer(i + 1 < LAYERS.length ? LAYERS[i + 1].id : undefined);
  }

  // ------------------------------------------------------------ Bahnhofsstufen (RM-FR-PROG-08)
  private tierKey = '';
  /** Abschnitte ohne Verwendung ganz ausblenden; rechte Spalte macht dem Dock unten Platz */
  private tab = 'trains';
  private logSeen = 0;

  private setTab(t: string) {
    this.tab = t;
    document.querySelectorAll<HTMLElement>('#bar-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll<HTMLElement>('#bar-info [data-pane]').forEach((p) => p.classList.toggle('on', p.dataset.pane === t));
    if (t === 'log') $('tab-log').classList.remove('new');
    try { localStorage.setItem('rm_tab', t); } catch { /* egal */ }
  }

  private updateLayout() {
    const g = this.g;
    const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);
    show('p-goals', g.goals.length > 0);
    show('p-tier', g.stations().length > 0);
    // Tabs der unteren Leiste sind immer da (leer: Hinweis im Tab)
    if (!document.getElementById(`tab-${this.tab}`) || $(`tab-${this.tab}`).classList.contains('hidden')) {
      const first = ['trains', 'log', 'sat'].find((t) => !$(`tab-${t}`).classList.contains('hidden'));
      if (first) this.setTab(first);
    }
    // neue Meldung: kleiner roter Punkt am Tab
    if (g.log.length !== this.logSeen) { if (this.tab !== 'log' && g.log.length > this.logSeen) $('tab-log').classList.add('new'); this.logSeen = g.log.length; }
    document.documentElement.style.setProperty('--dock-h', `${$('bar').offsetHeight}px`);
  }

  private updateTier() {
    const g = this.g;
    if (!g.stations().length) return;
    const next = g.tier + 1 < TIERS.length ? g.tier + 1 : -1;
    const checks = next > 0 ? tierChecks(g, next) : [];
    const key = `${g.tier}|${checks.map((c) => `${c.have}${c.ok}`).join()}`;
    if (key === this.tierKey) return;
    this.tierKey = key;
    const cur = TIERS[g.tier];
    $('tier').innerHTML = `<div class="tr-steps">${TIERS.map((_, i) => `<i class="${i <= g.tier ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tr-name">${cur.name}</div>${g.tier ? `<div class="tr-bonus">${cur.unlock}</div>` : ''}
      ${next > 0 ? `<div class="tr-next">Nächste Stufe: <b>${TIERS[next].name}</b> – ${TIERS[next].unlock}</div>
        ${checks.map((c) => `<div class="tr-check ${c.ok ? 'ok' : 'no'}"><span>${c.ok ? '✓' : '·'} ${c.label}</span><span>${c.have} / ${c.need}</span></div>`).join('')}`
      : '<div class="tr-next">Höchste Stufe erreicht.</div>'}`;
  }


  // ------------------------------------------------------------ Bank (RM-FR-ECO-10)
  private openBank() {
    const g = this.g, l = g.loan;
    const pct = (r: number) => `${(r * 100).toLocaleString('de-AT', { maximumFractionDigits: 1 })} %`;
    const status = l
      ? `<div class="bk-loan">Laufender Kredit: Restschuld <b>${eur(l.rest)} €</b>, noch ${l.daysLeft} Tage, ${pct(l.rate)} Zinsen pro Tag.
         <button class="btn" data-repay${g.money < l.rest ? ' disabled' : ''}>Restschuld jetzt tilgen (${eur(l.rest)} €)</button></div>`
      : '';
    const rows = loanOffers(g).map((o) => `<tr class="${o.ok ? '' : 'no'}"><td class="bk-amt">${eur(o.amount)} €</td><td>${o.days} Tage</td><td>${pct(o.rate)}</td>
      <td class="bk-amt">${eur(firstPayment(o))} €</td><td class="bk-amt">${eur(totalInterest(o))} €</td>
      <td>${o.ok ? `<button class="btn" data-loan="${o.amount}:${o.days}">Aufnehmen</button>` : `<small>${o.why}</small>`}</td></tr>`).join('');
    $('bank-body').innerHTML = `<p class="bk-intro">Planbarer als der Überziehungskredit (${pct(0.03)} pro Tag): feste Laufzeit, tägliche Rate aus Tilgung und Zinsen. Höchstbetrag für deine Bahnhofsstufe: <b>${eur(loanLimit(g))} €</b>.</p>${status}
      <table class="bk-table"><tr><th>Betrag</th><th>Laufzeit</th><th>Zins/Tag</th><th>1. Rate</th><th>Zinsen gesamt</th><th></th></tr>${rows}</table>`;
    $('bank').classList.remove('hidden');
  }

  // ------------------------------------------------------------ Hilfe (RM-FR-UI-08)
  private openHelp(tab: 'keys' | 'parts' | 'abc' = 'keys', term?: string) {
    $('help-tabs').querySelectorAll('[data-help]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.help === tab));
    if (tab === 'abc') {
      const list = [...LEXICON].sort((a, b) => a.term.localeCompare(b.term, 'de'));
      $('help-body').innerHTML = list.map((e) => `<div class="abc-item${e.term === term ? ' on' : ''}" data-term="${e.term}"><b>${e.term}</b>${e.text}</div>`).join('');
      $('help').classList.remove('hidden');
      if (term) $('help-body').querySelector('.abc-item.on')?.scrollIntoView({ block: 'center' });
      return;
    }
    if (tab === 'keys') {
      const keys: [string, string][] = [
        ['Maus ziehen', 'Karte verschieben'], ['W A S D / Pfeile', 'Karte verschieben'], ['Mausrad', 'Zoom'],
        ['1–9', 'Baumenüs, danach Ziffer = Typ'], ['B', 'Gebäude'], [keyOf('rotate'), 'drehen'], [keyOf('variant'), 'nächste Variante des Typs'],
        ['Abriss', 'Fläche aufziehen'], ['Rechtsklick', 'Abbrechen'], ['Esc', 'Werkzeug weg · Menü'],
        ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen (am Mac ⌘)'], ['F5 / Strg+S', 'Speichern'],
        ['Leertaste', 'Pause'], ['+ / −', 'Tempo'],
        [keyOf('issues'), 'Was ist los?'], [keyOf('layers'), 'Ebenen: Belegung, Fahrgäste, Stimmung, Instandhaltung'], [keyOf('timetable'), 'Fahrplan'], [keyOf('research'), 'Entwickeln (Forschung)'], [keyOf('contracts'), 'Verträge'], [keyOf('mail'), 'Postfach'], [keyOf('skip'), 'Vorspulen bis zum nächsten Halt'],
        [`${keyOf('help')} / F1`, 'Diese Hilfe'], ['?', 'Bahn-ABC zum Begriff im Tooltip'], ['Zug anfahren', 'Infos zum Zug, anklicken für Menü'],
      ];
      $('help-body').innerHTML = `<div class="hp-keys">${keys.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>`;
    } else {
      $('help-body').innerHTML = MENU.filter((g) => g.id !== 'select').map((grp) => `<div class="hp-grp"><h3>${grp.key} · ${grp.label}<small>${grp.help}</small></h3>
        ${grp.types.flatMap((t) => t.variants.map((it) => ({ t, it }))).map(({ t, it }) => {
          const locked = variantLocked(this.g, it);
          const name = t.variants.length > 1 ? `${t.label}: ${it.label}` : it.label;
          return `<div class="hp-item${locked ? ' locked' : ''}"><img src="${ICON(it.icon)}" alt="" /><span>${name}${it.info ? `<small>${it.info}</small>` : ''}${locked ? '<small>noch gesperrt</small>' : ''}</span><span class="cost">${it.cost ? `${eur(it.cost)} €` : ''}</span></div>`;
        }).join('')}</div>`).join('');
    }
    $('help').classList.remove('hidden');
  }


  // ------------------------------------------------------------ „Was ist los?“ (RM-FR-CPX-03)
  private issueList: Problem[] = [];
  private issueKey = '';

  /** L: wie ein Klick auf den Kopf (Zustand bleibt gespeichert) */
  private toggleIssues() {
    (document.querySelector('[data-fold="issues"]') as HTMLElement).click();
    this.issueKey = '';
    this.updateIssues();
  }

  private showIssue(p: Problem) {
    const sc = this.scene();
    if (!sc || !p.at) return;
    if ('train' in p.at) sc.focusTrain(p.at.train);
    else sc.focus(p.at.x, p.at.y);
  }

  private updateIssues() {
    if (!this.g.company) return;
    const list = problems(this.g);
    this.issueList = list;
    const red = list.filter((p) => p.level === 'rot').length, yellow = list.filter((p) => p.level === 'gelb').length;
    $('amp').className = `amp${red ? ' rot' : yellow ? ' gelb' : ''}`;
    $('issue-count').textContent = String(red + yellow);
    $('issue-count').classList.toggle('hidden', !(red + yellow));
    (document.querySelector('[data-fold="issues"]') as HTMLElement).dataset.tt = red || yellow ? `${red ? `${red} dringend` : ''}${red && yellow ? ', ' : ''}${yellow ? `${yellow} zum Anschauen` : ''} · L = auf/zu` : 'Alles in Ordnung · L = auf/zu';
    if ($('issues').classList.contains('closed')) return;
    const key = list.map((p) => `${p.id}|${p.level}|${p.text}|${p.fix?.label ?? ''}`).join('\n');
    if (key === this.issueKey) return;
    this.issueKey = key;
    $('is-say').textContent = mentorLine(list);
    $('is-list').innerHTML = list.length ? list.map((p) => `<li><i class="amp ${p.level}"></i><span>${p.text}</span>
      <span class="is-btns">${p.at ? `<button class="btn" data-is="${p.id}" data-act="show">Zeigen</button>` : ''}${p.fix ? `<button class="btn" data-is="${p.id}" data-act="fix">${p.fix.label}</button>` : ''}</span></li>`).join('')
      : '<li class="is-ok">✓ Keine Probleme</li>';
  }

  private undoKey = '';
  private flashTimer = 0;

  /** Bau-Aktion zurücknehmen oder wiederholen und kurz Bescheid geben */
  private undoRedo(forward: boolean) {
    const r = forward ? this.g.redo() : this.g.undo();
    this.flash(r.text, !r.ok);
  }

  /** kurze Meldung oben in der Mitte */
  private flash(text: string, bad = false) {
    const f = $('flash');
    f.textContent = text;
    f.classList.toggle('bad', bad);
    f.classList.remove('hidden');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => f.classList.add('hidden'), 1800);
  }

  private toggleSlots(id: string) {
    $(id).classList.toggle('hidden');
    this.renderSlots(id);
  }

  private renderSlots(id: string) {
    const list = listSlots(activeProfile()?.id ?? '');
    const head = `<div class="slots-head"><span class="slots-msg" data-msg>Spielstände liegen im Browser. Als Datei sind sie sicher aufgehoben.</span>
      <button class="btn" data-import title="Spielstand-Datei (${FILE_EXT}) öffnen">Datei importieren…</button></div>`;
    $(id).innerHTML = head + (list.length ? list.map((x) => {
      const day = Math.floor(x.gameTime / 86400) + 1;
      const date = new Date(x.saved).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="slot-row${x.auto ? ' auto' : ''}"><div><b>${x.auto ? '⟳ ' : ''}${esc(x.label)}</b><small>${esc(x.company)} · Tag ${day}, ${fmtTime(x.gameTime)} · ${eur(x.money)} € · ${date}</small></div>
        <button class="btn" data-load="${esc(x.id)}">Laden</button><button class="btn" data-export="${esc(x.id)}" title="Als Datei exportieren">⤓</button><button class="btn" data-del="${esc(x.id)}">✕</button></div>`;
    }).join('') : '<div class="slots-empty">Noch keine Spielstände. „Speichern“ oben rechts legt einen an, Aufträge und Forschung speichern automatisch.</div>');
  }

  private slotMsg(id: string, text: string, err = false) {
    const m = $(id).querySelector('[data-msg]');
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('err', err);
  }

  /** Spielstand-Datei wählen, prüfen und laden (RM-FR-SAVE-03, RM-FR-SEC-01) */
  private pickImport(id: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXT},.json,.gz`;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      this.slotMsg(id, 'Prüfe Datei…');
      const r = await readSaveFile(f);
      if (!r.ok) { this.slotMsg(id, r.error, true); return; }
      const label = `Import · ${r.label ?? f.name.replace(/\.[^.]+$/, '')}`.slice(0, 80);
      if (!importSave(r.save, label)) { this.slotMsg(id, 'Speichern fehlgeschlagen – Speicher voll?', true); return; }
      this.loadActive();
    };
    input.click();
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
  /** Mausposition (Bildschirm) und ob sie über dem Spielfeld ist – für die Infozeile am Mauszeiger */
  private mouse = { x: 0, y: 0, onMap: false };

  /** Infozeile zum Werkzeug am Mauszeiger: Name, Fehler, R/T-Hinweise */
  private renderCursorInfo() {
    const tip = $('tooltip');
    const at = locate(this.ui, this.group);
    if (this.ui.menu || this.ui.tool === 'select' || !this.mouse.onMap || !at) { tip.style.display = 'none'; return; }
    const rot = rotation(this.ui, this.g);
    const name = at.type.variants.length > 1 ? `${at.type.label} · ${at.variant.label}` : at.variant.label;
    let html = `<b>${name}</b>`;
    const msg = this.ui.message;
    // Kosten zeigt das Spielfeld selbst – hier nur Probleme
    if (msg && (!/€$/.test(msg) || msg.startsWith('Zu wenig Geld'))) html += `<br><span class="no">${msg}</span>`;
    const keys = [rot.n > 1 ? `${keyOf('rotate')} drehen ${rot.i + 1}/${rot.n}` : '', at.type.variants.length > 1 ? `${keyOf('variant')} nächste Variante` : ''].filter(Boolean);
    if (keys.length) html += `<br><small>${keys.join(' · ')}</small>`;
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.style.display = 'block';
    // über dem Mauszeiger: Teile wachsen in der Iso-Ansicht nach unten (Kurven, Weichen) – dort nichts verdecken
    const w = fromUi(tip.offsetWidth), h = fromUi(tip.offsetHeight);
    const above = this.mouse.y - h - 44;
    tip.style.left = `${toUi(Math.max(6, Math.min(window.innerWidth - w - 8, this.mouse.x - w / 2)))}px`;
    tip.style.top = `${toUi(above > 64 ? above : this.mouse.y + 60)}px`;
  }

  /** zuletzt gewählter Typ je Gruppe und Variante je Typ */
  private lastType: Record<string, string> = {};
  private lastVar: Record<string, number> = {};

  private lockText(v: BVariant) {
    const need = needOf(v);
    return need && !this.g.researched(need) ? `erst erforschen: ${RESEARCH_BY_ID[need].name}` : 'kommt mit einem späteren Auftrag';
  }

  private pickVar(v: BVariant, t: BType, grp: BGroup) {
    if (!this.g.unlocked.has(v.tool)) return;
    pickVariant(this.ui, v, 0);
    this.fresh.delete(v.tool);
    this.group = grp.id;
    this.lastType[grp.id] = t.id;
    this.lastVar[t.id] = t.variants.indexOf(v);
  }

  private pickType(t: BType, grp: BGroup) {
    const last = t.variants[this.lastVar[t.id] ?? -1];
    const v = last && !variantLocked(this.g, last) ? last : t.variants.find((x) => !variantLocked(this.g, x)) ?? t.variants.find((x) => this.g.unlocked.has(x.tool));
    if (v) this.pickVar(v, t, grp);
  }

  private pickGroup(grp: MenuGroup) {
    this.group = grp.id;
    const last = grp.types.find((x) => x.id === this.lastType[grp.id]);
    const t = last && !typeLocked(this.g, last) ? last : grp.types.find((x) => !typeLocked(this.g, x)) ?? grp.types.find((x) => x.variants.some((v) => this.g.unlocked.has(v.tool)));
    if (t) this.pickType(t, grp);
  }

  /** Gruppe/Typ passend zum aktuellen Werkzeug (z. B. nach Esc oder „Zeig mir wo“) */
  private syncGroup() {
    const at = locate(this.ui, this.group);
    if (!at) return;
    this.group = at.grp.id;
    this.lastType[at.grp.id] = at.type.id;
    this.lastVar[at.type.id] = at.type.variants.indexOf(at.variant);
  }

  private buildHotbar() {
    const bar = $('hotbar');
    for (const grp of MENU) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.dataset.group = grp.id;
      b.dataset.tt = grp.label;
      b.innerHTML = `<img alt="" src="${ICON(grp.icon)}" /><span class="key">${grp.key}</span>`;
      b.onclick = () => this.pickGroup(grp);
      bar.appendChild(b);
    }
    // Hover im Baumenü → Vorschaufeld
    $('bm-menu').addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest('[data-group],[data-type],[data-var]') as HTMLElement | null;
      this.hoverBm = el ? { group: el.dataset.group, type: el.dataset.type, var: el.dataset.var !== undefined ? Number(el.dataset.var) : undefined } : null;
    });
    $('bm-menu').addEventListener('mouseleave', () => { this.hoverBm = null; });
    // Freiraum: Typen und Varianten
    $('variants').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-type],[data-var]') as HTMLElement | null;
      const grp = MENU.find((m) => m.id === this.group);
      if (!el || !grp) return;
      if (el.dataset.type) { const t = grp.types.find((x) => x.id === el.dataset.type); if (t) this.pickType(t, grp); return; }
      const at = locate(this.ui, this.group);
      const v = at?.type.variants[Number(el.dataset.var)];
      if (at && v && !variantLocked(this.g, v)) this.pickVar(v, at.type, at.grp);
    });
  }

  /** Vorschau links im Baumenü: großes Bild und Beschreibung (Maus darüber, sonst die Auswahl) */
  private hoverBm: { group?: string; type?: string; var?: number } | null = null;
  private lastPreviewKey = '';

  private renderPreview() {
    const g = this.g, h = this.hoverBm;
    const at = locate(this.ui, this.group);
    let icon = 'tool_cursor', title = '', path = '', info = '', cost: number | undefined, lock = '';
    const hg = h?.group ? MENU.find((m) => m.id === h.group) : MENU.find((m) => m.id === this.group);
    const ht = h?.type ? hg?.types.find((t) => t.id === h.type) : undefined;
    const hv = h?.var !== undefined ? at?.type.variants[h.var] : undefined;
    if (hv && at) {
      icon = hv.icon; title = hv.label; path = `${at.grp.label} › ${at.type.label}`; info = hv.info ?? ''; cost = hv.cost;
      if (variantLocked(g, hv)) lock = this.lockText(hv);
    } else if (ht && hg) {
      const v = ht.variants.length === 1 ? ht.variants[0] : undefined;
      icon = ht.icon; title = ht.label; path = hg.label; info = ht.info ?? v?.info ?? (ht.variants.length > 1 ? `${ht.variants.length} Varianten` : ''); cost = v?.cost;
      if (typeLocked(g, ht)) lock = this.lockText(ht.variants[0]);
    } else if (h?.group && hg) {
      icon = hg.icon; title = hg.label; path = `Taste ${hg.key}${hg.alt ? ` / ${hg.alt}` : ''}`; info = hg.help;
      if (!hg.types.some((t) => t.variants.some((v) => g.unlocked.has(v.tool)))) lock = this.lockText(hg.types[0].variants[0]);
    } else if (at) {
      const multi = at.type.variants.length > 1;
      icon = at.variant.icon; title = multi ? at.variant.label : at.type.label; path = multi ? `${at.grp.label} › ${at.type.label}` : at.grp.label;
      info = at.variant.info ?? at.type.info ?? at.grp.help; cost = at.variant.cost;
    }
    if (info === 'Deko') info = '';
    const key = `${icon}|${title}|${path}|${info}|${cost}|${lock}`;
    if (key === this.lastPreviewKey) return;
    this.lastPreviewKey = key;
    $('bm-preview').innerHTML = `<div class="bp-pic"><img src="${ICON(icon)}" alt="" /></div><div class="bp-txt"><small>${path}</small><b>${title}</b>
      ${info ? `<p>${info}</p>` : ''}${lock ? `<p class="no">${lock}</p>` : cost ? `<span class="bp-cost">${eur(cost)} €</span>` : ''}</div>`;
  }

  /** Freiraum unter den Gruppen: Typen der Gruppe, darunter die Varianten des gewählten Typs (eingerückt) */
  private renderVariants() {
    this.syncGroup();
    const g = this.g;
    const grp = MENU.find((m) => m.id === this.group)!;
    const at = locate(this.ui, this.group);
    const mt = g.missionTool();
    const key = `${grp.id}|${this.ui.tool}|${curKey(this.ui)}|${g.buildRot}|${mt?.tool}${mt?.variant}|${g.research.done.length}|${[...g.unlocked].length}`;
    if (key === this.lastVariantsKey) return;
    this.lastVariantsKey = key;
    const isQuest = (v: BVariant) => !!mt && mt.tool === v.tool && (!mt.variant || v.keys.includes(mt.variant)) && !variantOn(this.ui, v);
    // nur Symbole – den Namen zeigt der Tooltip, die Details das Vorschaufeld links
    const types = grp.types.length > 1 || grp.types[0].variants.length > 1
      ? `<div class="bm-types">${grp.types.map((t, i) => {
        const locked = typeLocked(g, t);
        const q = t.variants.some(isQuest);
        return `<button class="bm-type${at?.type === t ? ' on' : ''}${locked ? ' locked' : ''}${q ? ' quest' : ''}" data-type="${t.id}" data-tt="${t.label}"><span class="key">${i + 1}</span><img src="${ICON(t.icon)}" alt="" /></button>`;
      }).join('')}</div>`
      : '';
    const sub = at && at.type.variants.length > 1
      ? `<div class="bm-vars">${at.type.variants.map((v, i) => {
        const locked = variantLocked(g, v);
        return `<button class="bm-var${v === at.variant ? ' on' : ''}${locked ? ' locked' : ''}${isQuest(v) ? ' quest' : ''}" data-var="${i}" data-tt="${v.label}"><img src="${ICON(v.icon)}" alt="" /></button>`;
      }).join('')}</div>`
      : '';
    $('variants').innerHTML = types + sub;
  }

  private setSpeed(s: number) {
    if (s === 0) this.g.paused = true;
    else { this.g.paused = false; this.g.speed = s; }
  }

  /** Vorspulen bis zum nächsten Halt (RM-FR-FEEL-01) */
  private skip?: { speed: number; until: number; seen: Set<number> };
  private toggleSkip() {
    const g = this.g;
    if (this.skip) { g.speed = this.skip.speed; this.skip = undefined; return; }
    const dwelling = g.sim.trains.filter((t) => t.state === 'dwell').map((t) => t.id);
    this.skip = { speed: g.speed, until: g.sim.time + 3 * 3600, seen: new Set(dwelling) };
    g.paused = false;
    g.speed = 16;
  }
  private updateSkip() {
    const s = this.skip, g = this.g;
    if (!s) return;
    const arrived = g.sim.trains.some((t) => t.state === 'dwell' && !s.seen.has(t.id));
    const red = problems(g).some((p) => p.level === 'rot');
    if (arrived || red || g.sim.time >= s.until || g.gameOver || !$('event').classList.contains('hidden')) {
      g.speed = s.speed;
      this.skip = undefined;
    }
  }

  /** Tagesabschluss: kleine Karte um Mitternacht */
  private showDayEnd(ev: Extract<UiEvent, { type: 'dayEnd' }>) {
    const bal = ev.income - ev.expense;
    $('dayend').innerHTML = `<div class="de-head"><b>Tag ${ev.day} geschafft</b><span>✕</span></div>
      <div class="de-kpis"><div><b class="${bal >= 0 ? 'ok' : 'no'}">${bal >= 0 ? '+' : '−'}${eur(Math.abs(bal))} €</b><small>Bilanz</small></div>
      <div><b>${ev.handled ? `${Math.round((ev.punctual / ev.handled) * 100)} %` : '–'}</b><small>pünktlich</small></div>
      <div><b>${ev.pax.toLocaleString('de-AT')}</b><small>Fahrgäste</small></div>
      <div><b>${ev.goalsDone}/${ev.goalsTotal}</b><small>Tagesziele</small></div></div>`;
    $('dayend').classList.remove('hidden');
    clearTimeout(this.dayEndTimer);
    this.dayEndTimer = window.setTimeout(() => $('dayend').classList.add('hidden'), 12000);
  }
  private dayEndTimer = 0;
  private gameFilter = '';
  /** Tastenbelegung: wartet auf die neue Taste */
  private rebinding: KeyAction | null = null;

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
  private status(t: Train): string { return trainStatus(this.g, t); }




  /** Fahrplan-Seitenleiste: nächste Abfahrten verschieben, Bahnsteig je Richtung festlegen */
  private ttKey = '';
  private renderTtOps() {
    const g = this.g, sim = g.sim;
    const ops = g.activeOperators().filter((o) => o.kind !== 'sort' && !o.industry);
    const runs = g.platformRuns();
    const next = (id: string, dir: string) => sim.queue.filter((t) => t.op.id === id && t.dir === dir).slice(0, 2).map((t) => fmtTime(t.plannedSpawn)).join(', ') || '–';
    const key = ops.map((o) => `${o.id}${next(o.id, 'E')}${next(o.id, 'W')}${sim.platformPref[`${o.id}:E`]}${sim.platformPref[`${o.id}:W`]}`).join('|') + runs.length;
    if (key === this.ttKey) return;
    this.ttKey = key;
    const plat = (o: (typeof ops)[number], dir: 'E' | 'W') => {
      if (!o.needsStop || runs.length < 2) return '';
      const k = `${o.id}:${dir}`, cur = sim.platformPref[k];
      return `<div class="tto-pl" title="Bahnsteig für alle Züge Richtung ${dir === 'E' ? 'Osten' : 'Westen'}"><span>${dir === 'E' ? '→' : '←'}</span><button class="btn${!cur ? ' on' : ''}" data-plat="" data-key="${k}">A</button>${runs.map((r, i) =>
        `<button class="btn${cur === r.id ? ' on' : ''}" data-plat="${r.id}" data-key="${k}">${i + 1}</button>`).join('')}</div>`;
    };
    $('tt-ops').innerHTML = ops.length ? ops.map((o) => `<div class="tto">
      <div class="tto-h" title="${o.name} · nächste → ${next(o.id, 'E')} · ← ${next(o.id, 'W')}"><span class="dot" style="background:${o.color}"></span><b>${o.short}</b><span class="tto-sh"><button class="btn" data-op="${o.id}" data-shift="-5" title="alle Züge 5 min früher">−5</button><button class="btn" data-op="${o.id}" data-shift="5" title="alle Züge 5 min später">+5</button></span></div>
      ${plat(o, 'E')}${plat(o, 'W')}</div>`).join('') : '<small>Noch keine Verträge.</small>';
  }

  /** Disposition (RM-FR-OPS-12): Zug im Weg-Zeit-Diagramm wählen, Bahnsteig (waagrecht) und Abfahrt (senkrecht) ziehen */
  private initDispo() {
    const cv = $('tt-canvas') as HTMLCanvasElement, tt = this.timetable;
    const pos = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    let start: { x: number; y: number; id: number; axis?: 'x' | 'y' } | undefined;
    const find = (id: number) => [...this.g.sim.trains, ...this.g.sim.queue].find((t) => t.id === id);
    cv.addEventListener('mousedown', (e) => {
      if (!systemOn(this.g, 'dispo')) return;
      const p = pos(e), id = tt.pick(p.x, p.y);
      tt.sel = id;
      start = id !== undefined ? { ...p, id } : undefined;
      this.dispoKey = '';
    });
    window.addEventListener('mousemove', (e) => {
      if (this.screen !== 'timetable') return;
      const p = pos(e);
      if (!start) { cv.style.cursor = tt.pick(p.x, p.y) !== undefined ? 'pointer' : ''; return; }
      if (!start.axis && Math.hypot(p.x - start.x, p.y - start.y) > 8) start.axis = Math.abs(p.x - start.x) > Math.abs(p.y - start.y) && !tt.isLocked(start.id) ? 'x' : 'y';
      if (start.axis === 'x') { const l = tt.laneAt(p.x); tt.drag = { id: start.id, lane: l === undefined ? tt.drag?.lane : l }; }
      if (start.axis === 'y') {
        const t = find(start.id);
        if (t) { const base = baseDeparture(this.g, t); tt.drag = { id: start.id, dep: Math.max(base, Math.min(base + 30 * 60, Math.round(tt.timeAt(p.y) / 60) * 60)) }; }
      }
    });
    window.addEventListener('mouseup', () => {
      const d = tt.drag, t = start && find(start.id);
      start = undefined; tt.drag = undefined;
      if (!d || !t) return;
      if (d.lane !== undefined && (d.lane ?? undefined) !== t.platform) setTrainPlatform(this.g, t, d.lane ?? undefined);
      if (d.dep !== undefined) { setHold(this.g, t, d.dep); shiftHold(this.g, t, 0); }
      this.dispoKey = '';
    });
    $('tt-dispo').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-dp],[data-dsel]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.dsel) { tt.sel = Number(b.dataset.dsel) || undefined; this.dispoKey = ''; return; }
      const t = tt.sel !== undefined ? find(tt.sel) : undefined;
      if (!t) return;
      const a = b.dataset.dp!;
      if (a === 'plat') setTrainPlatform(this.g, t, b.dataset.run || undefined);
      else if (a === 'hold') shiftHold(this.g, t, Number(b.dataset.min));
      else if (a === 'plan') { setHold(this.g, t, undefined); shiftHold(this.g, t, 0); }
      else if (a === 'pass') letPass(this.g, t);
      this.dispoKey = '';
    });
  }

  private dispoKey = '';
  private renderDispo() {
    const g = this.g, tt = this.timetable, on = systemOn(g, 'dispo');
    $('tt-dispo-h').classList.toggle('hidden', !on);
    $('tt-dispo').classList.toggle('hidden', !on);
    if (!on) { tt.sel = undefined; return; }
    const slots = dispoSlots(g), conf = dispoConflicts(g, slots), runs = g.platformRuns();
    const sl = slots.find((s) => s.t.id === tt.sel && !s.alight);
    if (tt.sel !== undefined && !sl) tt.sel = undefined;
    const key = `${tt.sel}|${sl ? `${sl.platform}${sl.locked}${Math.round(sl.arr / 60)}${Math.round(sl.dep / 60)}${sl.t.letPass}` : ''}|${conf.map((c) => `${c.a.id}-${c.b.id}`).join(',')}|${runs.length}`;
    if (key === this.dispoKey) return;
    this.dispoKey = key;
    const runNo = (id?: string) => { const i = runs.findIndex((r) => r.id === id); return i < 0 ? 'auto' : `Gleis ${i + 1}`; };
    const confHtml = (list: typeof conf) => list.map((c) => `<div class="dp-c" data-dsel="${c.b.id}" title="${c.platform ? `Beide Züge zur selben Zeit an ${runNo(c.platform)}` : 'Alle Bahnsteige belegt, wenn der Zug ankommt'} – anklicken zum Bearbeiten">✗ ${c.a.number} ↔ ${c.b.number} · ${fmtTime(c.at)}</div>`).join('');
    if (!sl) {
      $('tt-dispo').innerHTML = conf.length ? `<div class="dp-cl">${confHtml(conf)}</div>` : '<small class="dp-ok">✓ keine Konflikte</small>';
      return;
    }
    const t = sl.t, base = baseDeparture(g, t), held = Math.max(0, Math.round((sl.dep - base) / 60));
    const mine = conf.filter((c) => c.a === t || c.b === t);
    const plat = runs.length > 1 ? `<div class="tto-pl"${sl.locked ? ' title="Zug fährt schon hin – Bahnsteig fest"' : ''}><span>Gleis</span><button class="btn${!t.platform ? ' on' : ''}" data-dp="plat" data-run=""${sl.locked ? ' disabled' : ''} title="automatisch${sl.guess ? `, voraussichtlich ${runNo(sl.guess)}` : ''}">A</button>${runs.map((r, i) =>
      `<button class="btn${(t.platform ?? sl.platform) === r.id ? ' on' : ''}" data-dp="plat" data-run="${r.id}"${sl.locked ? ' disabled' : ''}>${i + 1}</button>`).join('')}</div>` : '';
    $('tt-dispo').innerHTML = `<div class="tto">
      <div class="tto-h"><span class="dot" style="background:${t.op.color}"></span><b>${t.number}</b><button class="btn dp-x" data-dsel="0">×</button></div>
      <div class="tto-t"><small>${fmtTime(sl.arr)}–${fmtTime(sl.dep)}${held ? ` (+${held})` : ''}</small></div>
      ${plat}
      <div class="tto-b"><span>Abfahrt</span><button class="btn" data-dp="hold" data-min="-5">−5</button><button class="btn" data-dp="hold" data-min="-1">−1</button><button class="btn" data-dp="hold" data-min="1">+1</button><button class="btn" data-dp="hold" data-min="5">+5</button>${held ? '<button class="btn" data-dp="plan" title="planmäßig abfahren">↺</button>' : ''}</div>
      ${t.state === 'queued' && t.extDelay && !t.letPass ? '<div class="tto-b"><button class="btn" data-dp="pass" title="verspätet – nachfolgende Züge dürfen vorfahren">vorlassen</button></div>' : ''}
      ${mine.length ? `<div class="dp-cl">${confHtml(mine)}</div>` : ''}
    </div>`;
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
    return `<div class="bar" title="${Math.round(v)} %"><div style="width:${Math.round(Math.max(0, Math.min(100, v)))}%;background:${color}"></div></div>`;
  }

  private personHover: { id: number | null; since: number } = { id: null, since: 0 };

  /** Steckbrief eines Fahrgasts (RM-FR-EVT-06) */
  private personHtml(p: PersonCard) {
    const [word, level] = ({ gut: ['zufrieden', 'ok'], naja: ['ungeduldig', 'gelb'], sauer: ['sauer', 'rot'] } as const)[p.mood];
    return this.oc({ head: `<img src="${ICON('bld_bench')}" alt="" />`, title: p.name, sub: 'Fahrgast', state: word, level,
      rows: p.lines.map((l) => `<div class="pc-line ${l.cls ?? ''}">${l.text}</div>`).join('') });
  }


  /** Einheitliche Objektkarte (RM-FR-CPX-04): Kopf → Zustand (Ampel) → Zahlen; Aktionen kommen darunter */
  private oc(o: { head: string; title: string; sub: string; state: string; level: 'ok' | 'gelb' | 'rot'; rows: string }) {
    return `<div class="oc"><div class="oc-head">${o.head}<div><b>${o.title}</b><small>${o.sub}</small></div></div>
      <div class="oc-state"><i class="amp${o.level === 'ok' ? '' : ` ${o.level}`}"></i><span>${o.state}</span></div><div class="oc-nums">${o.rows}</div></div>`;
  }

  private card(t: Train) {
    const delay = Math.round(this.g.sim.delayNow(t));
    const isPax = t.capacity > 0;
    const load = isPax ? (t.passengers / t.capacity) * 100 : 0;
    const kmh = Math.round(t.v * 15);
    const cars = t.cars.map((c, i) => `<img src="assets/gen/car_${t.op.id}_${c === 'ecab' ? (i ? 'ecabW' : 'ecabE') : c}_0.png" alt="" />`).join('');
    const why = this.g.sim.waitReason(t) ?? (t.note && /kein/.test(t.note) ? t.note : null);
    const stuck = this.g.sim.stuck(t) && !!why;
    const timed = t.op.kind !== 'sort' && t.state !== 'rolling' && t.state !== 'stored';
    const rows = [`<div class="tc-cars">${cars}</div>`];
    if (t.state !== 'queued') rows.push(`<div class="tc-row num-row"><span>Tempo</span><span>${kmh} km/h</span></div>`);
    if (timed) rows.push(`<div class="tc-row"><span>Fahrplan</span><span class="${delay > 3 ? 'no' : 'ok'}">${delay > 0 ? `+${delay} min` : 'pünktlich'}</span></div>`);
    if (why) rows.push(`<div class="tc-row"><span>Wartet</span><span class="no">${why}</span></div>`);
    if (stuck) rows.push(`<div class="tc-help">! ${this.fixHint(why!)}</div>`);
    if (isPax) rows.push(`<div class="tc-row"><span>Auslastung</span>${this.bar(load, load > 85 ? '#d9534f' : '#6cc04a')}<span class="num" title="${t.passengers} von ${t.capacity} Plätzen">${t.passengers}/${t.capacity}</span></div>`);
    rows.push(`<div class="tc-row"><span>Antrieb</span><span>${t.op.traction === 'electric' ? '⚡ elektrisch' : '⛽ Diesel'}</span></div>`);
    rows.push(`<div class="tc-row"><span>Schmutz</span>${this.bar(t.dirt, '#9a7a4a')}<span class="num">${Math.round(t.dirt)}</span></div>`);
    rows.push(`<div class="tc-row"><span>Verschleiß</span>${this.bar(t.wear, '#b0623a')}<span class="num">${Math.round(t.wear)}</span></div>`);
    if (t.dest !== undefined) rows.push(`<div class="tc-row"><span>Ziel</span><span>Richtung ${['Nord', 'Süd', 'West'][t.dest]}</span></div>`);
    return this.oc({
      head: `<span class="dot" style="background:${t.op.color}"></span>`,
      title: t.number,
      sub: `${t.op.category} · ${t.op.name} · ${t.dir === 'E' ? '→ Ost' : '← West'}${t.boost ? ' · Verstärkerzug' : ''}${t.extDelay ? ` · kam ${Math.round(t.extDelay / 60)} min verspätet von außen` : ''}`,
      state: this.status(t),
      level: stuck ? 'rot' : timed && delay > 3 ? 'gelb' : 'ok',
      rows: rows.join(''),
    });
  }

  // ------------------------------------------------------------ Details links in der Infospalte
  private detail: { kind: 'train'; id: number } | { kind: 'log'; entry: LogEntry } | { kind: 'op'; id: OperatorId } | { kind: 'bld'; id: number } | { kind: 'person'; id: number } | null = null;
  private detailKey = '';
  private detailActKey = '';
  private trainAction: (b: HTMLElement, id: number) => void = () => undefined;

  private renderDetail() {
    const d = this.detail, g = this.g, sim = g.sim;
    let body = '', acts = '';
    if (d?.kind === 'train') {
      const t = sim.trains.find((x) => x.id === d.id) ?? sim.queue.find((x) => x.id === d.id);
      if (!t) this.detail = null;
      else {
        body = this.card(t);
        const runs = g.platformRuns();
        const cur = sim.platformPref[`${t.op.id}:${t.dir}`];
        const plat = t.op.needsStop && runs.length > 1 ? `<div class="tm-plat"><small>Bahnsteig für ${t.op.short} ${t.dir === 'E' ? '→' : '←'} (alle Züge):</small><div>
          <button class="btn${!cur ? ' on' : ''}" data-tm="plat" data-run="">Auto</button>${runs.map((r, i) => `<button class="btn${cur === r.id ? ' on' : ''}" data-tm="plat" data-run="${r.id}" data-tt="${r.len} Felder lang">Gleis ${i + 1}</button>`).join('')}</div></div>` : '';
        acts = `${t.id}|${cur}|${t.state === 'queued'}` + `<div class="bd-btns">${t.state !== 'queued' ? '<button class="btn" data-tm="focus">Zeigen</button>' : ''}<button class="btn warn" data-tm="remove" data-tt="Das Unternehmen ist darüber nicht erfreut.">Aus dem Verkehr (−${eur(CANCEL_COST)} €)</button></div>${plat}`;
      }
    } else if (d?.kind === 'log') {
      body = this.oc({ head: `<img src="${ICON('bld_clock')}" alt="" />`, title: `Meldung ${fmtTime(d.entry.time)}`, sub: 'aus dem Betrieb',
        state: d.entry.text, level: d.entry.kind === 'bad' ? 'rot' : 'ok', rows: '' });
    } else if (d?.kind === 'op') {
      const o = OPERATORS[d.id], c = g.contracts[d.id];
      if (o && c) {
        const sat = Math.round(g.satisfaction[d.id]);
        const trains = sim.trains.filter((x) => x.op === o).length + sim.queue.filter((x) => x.op === o).length;
        body = this.oc({ head: `<span class="dot" style="background:${o.color}"></span>`, title: o.name, sub: o.category,
          state: c.status === 'active' ? 'Vertrag läuft' : c.status === 'cancelled' ? 'Vertrag gekündigt' : 'kein Vertrag',
          level: c.status === 'cancelled' || sat < 40 ? 'rot' : sat < 60 ? 'gelb' : 'ok',
          rows: `<div class="tc-row"><span>Zufriedenheit</span>${this.bar(sat, o.color)}<span>${sat}</span></div>
            ${c.status === 'active' ? `<div class="tc-row"><span>Takt</span><span>alle ${c.takt} min</span></div>
            <div class="tc-row"><span>Preis je Zug</span><span>${(Object.values(c.price) as number[]).map((p) => `${eur(p)} €`).join(' / ')}</span></div>` : ''}
            <div class="tc-row"><span>Züge unterwegs</span><span>${trains}</span></div>` });
        acts = `op|${d.id}<div class="bd-btns"><button class="btn" data-dt="contracts">Verträge öffnen</button></div>`;
      } else this.detail = null;
    } else if (d?.kind === 'bld') {
      const b = g.grid.buildings.get(d.id);
      if (!b) this.detail = null;
      else if (isStation(b.key)) {
        const lvl = g.stationLevel(b.key), c = g.connections(b.id), bonus = Math.round(g.stationBonus(b.id) * 100);
        const block = g.upgradeBlock(b.id);
        body = this.oc({ head: `<img src="${ICON(b.key)}" alt="" />`, title: b.name ?? 'Bahnhof', sub: `<span class="st-code">${g.stationCode(b)}</span> ${BUILDINGS[b.key].label} · Stufe ${lvl}`,
          state: `Einnahmen +${bonus} %`, level: c.parking && c.bus ? 'ok' : 'gelb',
          rows: `<div class="tc-row"><span>Parkplatz</span><span class="${c.parking ? 'ok' : 'no'}">${c.parking ? '✓ angebunden (+10 %)' : '✗ nicht angebunden'}</span></div>
            <div class="tc-row"><span>Busterminal</span><span class="${c.bus ? 'ok' : 'no'}">${c.bus ? '✓ angebunden (+15 %)' : '✗ nicht angebunden'}</span></div>
            <div class="tc-row" title="Eigene Straße vom Bahnhof bis zur Straße der Gemeinde: mehr Laufkundschaft und +5 % Einnahmen"><span>Straßennetz</span><span class="${c.street ? 'ok' : 'no'}">${c.street ? '✓ angebunden (+5 %)' : '✗ nicht angebunden'}</span></div>
            ${lvl < 3 && block ? `<div class="tc-help">${block}</div>` : ''}` });
        acts = `s${b.id}|${b.name}|${b.code}|${lvl}|${block}` + `<div class="bd-btns"><button class="btn" data-bp="rename">Umbenennen</button>${lvl < 3 ? `<button class="btn${block ? ' off' : ''}" data-bp="upgrade">Ausbauen · ${eur(STATION_UPGRADE[lvl + 1])} €</button>` : ''}</div>`;
      } else if (SHOPS[b.key]) {
        const sh = SHOPS[b.key], price = g.shopPrices[b.key], rate = g.shopRate(b.key), r = price / sh.ref;
        body = this.oc({ head: `<img src="${ICON(b.key)}" alt="" />`, title: sh.name, sub: `Preis gilt für alle ${sh.name === 'Café' ? 'Cafés' : sh.name === 'Kiosk' ? 'Kioske' : 'Automaten'}`,
          state: r > 1.3 ? 'Zu teuer – Fahrgäste ärgern sich' : r < 0.85 ? 'Günstig – Fahrgäste freuen sich' : 'Fairer Preis', level: r > 1.3 ? 'rot' : 'ok',
          rows: `<div class="tc-row"><span>Preis</span><span>${price.toFixed(2).replace('.', ',')} € (üblich ${sh.ref.toFixed(2).replace('.', ',')} €)</span></div>
            <div class="tc-row"><span>Kunden</span><span>${Math.round(rate * 100)} von 100 Fahrgästen</span></div>
            <div class="tc-row"><span>Umsatz</span><span>${(rate * price * 100).toFixed(0)} € je 100 Fahrgäste</span></div>` });
        acts = `p${b.key}${g.shopAuto[b.key] ? 'a' : ''}` + `<div class="bd-btns"><button class="btn" data-bp="price" data-d="-0.5">Preis −</button><button class="btn" data-bp="price" data-d="0.5">Preis +</button><button class="btn${g.shopAuto[b.key] ? ' on' : ''}" data-bp="auto" title="Automatik: immer der übliche Preis">Auto</button></div>`;
      } else this.detail = null;
    } else if (d?.kind === 'person') {
      const pc = this.scene()?.personCard(d.id);
      if (!pc) this.detail = null;
      else body = this.personHtml(pc);
    }
    if (!body) body = this.overviewHtml();
    if (body !== this.detailKey) { this.detailKey = body; ($('bar-detail').querySelector('.bd-body') ?? $('bar-detail')).innerHTML = body; }
    // Knöpfe nur neu, wenn sich wirklich etwas ändert (sonst geht „Wirklich?“ verloren)
    if (acts !== this.detailActKey) {
      this.detailActKey = acts;
      const a = $('bar-detail').querySelector('.bd-acts') as HTMLElement;
      a.innerHTML = acts ? acts.slice(acts.indexOf('<')) : '';
    }
  }

  /** Detailfeld ohne Auswahl: nächste Halte am Bahnhof und Zustand (RM-FR-UI-16) */
  private overviewHtml() {
    const g = this.g, st = g.stations()[0];
    if (!st) return '<div class="bd-empty">Etwas anklicken für Details</div>';
    const runs = g.platformRuns();
    const slots = dispoSlots(g).filter((x) => !x.alight && x.dep >= g.sim.time).slice(0, 5);
    const gl = (id?: string) => { const i = runs.findIndex((r) => r.id === id); return i < 0 ? '–' : String(i + 1); };
    const rows = slots.map((x) => {
      const late = x.t.state === 'queued' ? Math.max(0, g.sim.time - x.t.plannedSpawn) : 0;
      return `<div class="ov-row"><span class="dot" style="background:${x.t.op.color}"></span><span>${x.t.number}</span><span>${fmtTime(x.dep)}</span><span class="${late > 60 ? 'no' : ''}">${late > 60 ? `+${Math.ceil(late / 60)}` : ''}</span><span title="Bahnsteig">${gl(x.platform ?? x.guess)}</span></div>`;
    }).join('') || '<div class="bd-empty">Keine Halte in den nächsten 2 Stunden</div>';
    const d = g.history[g.history.length - 1];
    const p = d?.handled ? `${Math.round((d.punctual / d.handled) * 100)} %` : '–';
    return `<div class="ov"><div class="ov-head"><b>${st.name ?? 'Bahnhof'}</b><span class="st-code">${g.stationCode(st)}</span><span class="ov-kpi" title="heute pünktlich">${p}</span><span class="ov-kpi" title="Fahrgäste heute">${(d?.pax ?? 0).toLocaleString('de-AT')} Fahrg.</span></div>
      <div class="ov-row ov-th"><span></span><span>Zug</span><span>ab</span><span></span><span>Gl.</span></div>${rows}</div>`;
  }

  private updateCard() {
    const box = $('traincard');
    const sim = this.g.sim;
    const find = (id: number) => sim.trains.find((t) => t.id === id) ?? sim.queue.find((t) => t.id === id);
    let t: Train | undefined, x = 0, y = 0;
    if (this.ui.hoverTrain !== null && !this.ui.menu) {
      t = find(this.ui.hoverTrain);
      x = this.ui.mouse.x + 18; y = this.ui.mouse.y + 18;
    }
    // Fahrgast erst nach kurzem Verweilen zeigen (nicht bei jedem Vorbeifahren mit der Maus)
    const hp = this.ui.hoverPerson ?? null;
    if (hp !== this.personHover.id) this.personHover = { id: hp, since: performance.now() };
    const pc = !t && hp !== null && !this.ui.menu && performance.now() - this.personHover.since > 350 ? this.scene()?.personCard(hp) : null;
    if (pc) { t = undefined; x = this.ui.mouse.x + 18; y = this.ui.mouse.y + 18; }
    if ((!t && !pc) || !$('train-menu').classList.contains('hidden')) { box.classList.add('hidden'); return; }
    box.innerHTML = t ? this.card(t) : this.personHtml(pc!);
    box.classList.remove('hidden');
    const w = fromUi(box.offsetWidth), h = fromUi(box.offsetHeight);
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    box.style.left = `${toUi(x)}px`;
    box.style.top = `${toUi(y)}px`;
  }

  // ------------------------------------------------------------ Aktualisieren
  update() {
    const g = this.g, sim = g.sim;
    const now = performance.now();
    this.minimap.draw();
    this.updateIssues();
    this.updateLayout();
    this.updateTier();
    // Rückgängig-Knöpfe
    const ul = g.undoLog, uk = `${ul.canUndo}|${ul.canRedo}|${ul.peekUndo()?.label}|${ul.peekRedo()?.label}`;
    if (uk !== this.undoKey) {
      this.undoKey = uk;
      ($('btn-undo') as HTMLButtonElement).disabled = !ul.canUndo;
      ($('btn-redo') as HTMLButtonElement).disabled = !ul.canRedo;
      $('btn-undo').title = ul.canUndo ? `Rückgängig: ${ul.peekUndo()!.label} (Strg+Z)` : 'Rückgängig (Strg+Z)';
      $('btn-redo').title = ul.canRedo ? `Wiederholen: ${ul.peekRedo()!.label} (Strg+Y)` : 'Wiederholen (Strg+Y)';
    }

    $('company-name').textContent = g.company || '…';
    // Avatar in der Titelleiste
    const avk = `${g.player.avatar}|${g.player.name}|${g.company}`;
    if (avk !== this.companyKey) {
      this.companyKey = avk;
      const img = $('company').querySelector('img, svg');
      if (img) img.outerHTML = g.company ? avatar(g.player.avatar, 22) : '<img src="assets/gen/ui/train.png" alt="" />';
      $('company').dataset.tt = g.player.name ? `${g.player.title ? g.player.title + ' ' : ''}${g.player.name} · ${g.company} · Klick: Dienstakte` : g.company;
    }
    $('clock').textContent = fmtTime(sim.time);
    const season = g.season;
    $('day').textContent = `Tag ${Math.floor(sim.time / 86400) + 1} ${SEASON_ICON[season]}`;
    $('day').title = SEASON_NAME[season];
    // Farbton der Jahreszeit und Darstellungsfilter aufs Spielfeld (RM-FR-EVT-10, RM-FR-UI-15)
    const filt = `${SEASON_FILTER[season]} ${FILTER_CSS[settings.filter]}`.trim();
    if (filt !== this.gameFilter) { this.gameFilter = filt; $('game').style.filter = filt; }
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

    this.updateSkip();
    $('speed').querySelectorAll('button[data-speed]').forEach((b) => {
      const s = Number((b as HTMLElement).dataset.speed);
      b.classList.toggle('on', !this.skip && (g.paused ? s === 0 : s === g.speed));
    });
    $('btn-skip').classList.toggle('on', !!this.skip);
    $('fp').textContent = String(g.research.points);
    // Mini-Balken: weiteste laufende Forschung; Punkt, wenn ein Baum frei ist
    const prog = TREES.map((t) => g.runningIn(t.id)).filter(Boolean).map((rc) => 100 - (rc!.left / (RESEARCH_BY_ID[rc!.id].hours * 3600)) * 100);
    $('rs-mini').style.width = prog.length ? `${Math.max(...prog).toFixed(0)}%` : '0';
    // Knöpfe erst zeigen, wenn sie gebraucht werden
    $('btn-research').classList.toggle('hidden', !g.unlocked.has('research'));
    const anyContract = Object.values(g.contracts).some((c) => c.status !== 'none');
    $('btn-contracts').classList.toggle('hidden', !g.stations().length && !anyContract && !g.offers.open);
    $('btn-timetable').classList.toggle('hidden', !anyContract);
    $('btn-mail').classList.toggle('hidden', !g.inbox.length);
    const mtq = g.missionTool();
    $('btn-research').classList.toggle('quest', mtq?.tool === 'research' && this.screen !== 'research');
    const warn = Object.values(OPERATORS).some((o) => {
      const c = g.contracts[o.id];
      return c.status === 'cancelled' ? g.sim.time >= c.talkAfter : c.status === 'active' && cancelRisk(o, c, g.satisfaction[o.id]) > 0;
    });
    $('ct-warn').textContent = warn ? '!' : '';
    this.renderScreen();
    $('btn-save').classList.toggle('saved', now < this.savedFlash);
    // Zug auf der Karte angeklickt: gleiches Menü wie in der Zugliste
    if (this.ui.trainClick) { const c = this.ui.trainClick; this.ui.trainClick = null; this.detail = { kind: 'train', id: c.id }; this.setTab('trains'); }
    this.updateFaultPop(now);
    this.updateStationPop();
    const unread = this.g.inbox.filter((e) => !e.read).length;
    $('mail-count').textContent = String(unread);
    $('mail-count').classList.toggle('hidden', !unread);

    // Baumenü: Gruppen-Symbole, gesperrt/neu/Auftrag
    const mt = g.missionTool();
    this.syncGroup();
    $('hotbar').querySelectorAll('.slot').forEach((el) => {
      const b = el as HTMLElement;
      const grp = MENU.find((m) => m.id === b.dataset.group)!;
      const vars = grp.types.flatMap((t) => t.variants);
      const locked = !vars.some((v) => g.unlocked.has(v.tool));
      b.classList.toggle('locked', locked);
      b.classList.toggle('on', this.group === grp.id);
      const isQuest = !!mt && vars.some((v) => v.tool === mt.tool) && this.ui.tool !== mt.tool && !locked && !g.questUsed.has(`${g.missionIdx}:${mt.tool}`);
      b.classList.toggle('quest', isQuest);
      const badge = isQuest ? '!' : vars.some((v) => this.fresh.has(v.tool)) ? 'NEU' : '';
      let el2 = b.querySelector('.badge') as HTMLElement | null;
      if (badge && !el2) { el2 = document.createElement('span'); b.appendChild(el2); }
      if (el2) {
        if (!badge) el2.remove();
        else { el2.textContent = badge; el2.className = `badge${badge === 'NEU' ? ' new' : ''}`; }
      }
    });
    this.renderVariants();
    this.renderPreview();
    this.renderCursorInfo();

    // Auftrag
    const m = g.mission;
    const q = g.missionInfo();
    $('q-count').textContent = m ? `AUFTRAG ${q.index + 1}/${q.total}` : g.mode === 'free' ? (g.sandbox ? 'SANDKASTEN' : 'FREIES SPIEL') : g.mode === 'challenge' ? 'HERAUSFORDERUNG' : 'ALLE AUFTRÄGE ERLEDIGT';
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
      .filter((o) => sim.queue.some((x) => x.op === o && !x.deco) || sim.trains.some((x) => x.op === o && !x.deco))
      .map((o) => {
        const val = Math.round(g.satisfaction[o.id]);
        return `<div class="sat-row" data-op="${o.id}"><span>${o.name}</span><div class="bar" title="Zufriedenheit ${val} %"><div style="width:${val}%;background:${o.color}"></div></div><span class="num">${val}</span></div>`;
      }).join('') || '<div class="bar-empty">Noch keine Vertragspartner – im Postfach warten Angebote.</div>';
    if ($('sat').innerHTML !== satHtml) $('sat').innerHTML = satHtml;
    const rows: string[] = [];
    let wagons = 0;
    for (const tr of sim.trains) {
      if (tr.deco) continue; // Fremdbahn ohne Vertrag: nur Kulisse
      if (tr.state === 'rolling' || tr.state === 'stored') { wagons++; continue; }
      const st = this.status(tr);
      const arrow = this.g.sim.isTurn(tr) && !tr.turned ? '↩' : tr.dir;
      rows.push(this.row(tr.id, tr.op.color, tr.boost ? `${tr.number} V` : tr.number, arrow, st, tr.waiting && !!tr.note));
    }
    for (const tr of sim.queue.filter((q) => !q.deco).slice(0, Math.max(3, 8 - rows.length))) {
      const late = sim.time - tr.plannedSpawn;
      rows.push(this.row(tr.id, tr.op.color, tr.boost ? `${tr.number} V` : tr.number, this.g.sim.isTurn(tr) ? '↩' : tr.dir,
        late > 0 ? `wartet +${Math.ceil(late / 60)} min` : fmtTime(tr.plannedSpawn), late > 60));
    }
    if (wagons) rows.push(`<li class="wag"><span class="dot" style="background:#9c4a2c"></span><span class="tnum">${wagons} Wagen</span><span class="tstat">im Rangierbahnhof</span></li>`);
    const listHtml = rows.join('') || '<li class="bar-empty">Noch kein Zugverkehr – erst mit einem Vertrag fahren Züge.</li>';
    if ($('trains').dataset.h !== listHtml) {
      $('trains').dataset.h = listHtml;
      $('trains').innerHTML = listHtml;
    }
    const logHtml = g.log.slice(0, 14)
      .map((l, i) => `<li data-i="${i}"><span class="t">${fmtTime(l.time)}</span><span class="${l.kind}">${l.text}</span></li>`).join('') || '<li class="bar-empty">Noch keine Meldungen.</li>';
    if ($('log').innerHTML !== logHtml) $('log').innerHTML = logHtml;

    this.updateCard();
    this.renderDetail();

    // Ereignisse
    if (this.ui.stationClick !== null) { this.detail = { kind: 'bld', id: this.ui.stationClick }; this.ui.stationClick = null; }
    if (this.ui.personClick != null) { this.detail = { kind: 'person', id: this.ui.personClick }; this.ui.personClick = null; }
    this.timetable.sample();
    document.body.classList.toggle('in-menu', !$('menu').classList.contains('hidden'));
    // Stau-Warnung mit Countdown
    const dl = g.sim.deadlock && g.deadlockSince && !g.gameOver;
    $('deadlock').classList.toggle('hidden', !dl);
    if (dl) {
      const names = g.sim.deadlock!.map((i) => g.sim.trains.find((x) => x.id === i)?.number).filter(Boolean).join(', ');
      $('dl-text').textContent = `${names} · noch ${Math.ceil(g.deadlockLeft / 60)} min bis Game Over – Gleis bauen oder einen Zug aufgeben`;
    }
    if (this.g.offers.open && $('modal').classList.contains('hidden') && $('event').classList.contains('hidden') && !this.ui.menu) this.showOffer();
    for (const ev of g.uiEvents.splice(0)) {
      if (ev.type === 'station') { this.askStation(ev.id); continue; }
      if (ev.type === 'offer' || ev.type === 'deadlock') continue;
      if (ev.type === 'autosave') { writeSlot(ev.label, true, this.g.save()); this.savedFlash = now + 1500; continue; }
      if (ev.type === 'gameover') {
        const debt = ev.reason === 'debt';
        $('go-title').textContent = debt ? 'Pleite!' : 'Deine Strecke ist dicht.';
        $('go-info').textContent = debt ? `Die Schulden haben ${eur(-this.g.debtLimit)} € erreicht – die Bank dreht den Hahn zu. Lade einen Spielstand oder fang neu an.`
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
      if (ev.type === 'dayEnd') { if (g.stations().length) this.showDayEnd(ev); continue; }
      if (ev.type === 'streak') { Sound.gong(); this.flash(`★ ${ev.n} pünktlich in Folge!`); continue; }
      if (ev.type === 'letter') {
        const day = Math.floor(g.sim.time / 86400) + 1;
        const from = ev.from ?? BOARD(g.company || 'Bahngesellschaft');
        const html = `<div class="letter ${ev.mood}${ev.from ? ' ext' : ''}"><div class="lt-head"><b>${from.org}</b><span>${ev.from ? from.role : 'Der Vorstand'} · Tag ${day}</span></div>
          <div class="lt-title">${ev.title}</div><div class="lt-text">${/^<p>(Sehr|Guten)/.test(ev.text) ? '' : `<p>${g.salutation()}</p>`}${ev.text}</div>
          ${ev.bonus ? `<div class="lt-bonus"><img src="assets/gen/ui/coin.png" alt="" />+${eur(ev.bonus)} €</div>` : ''}
          <div class="lt-sign">${portrait(from.seed, 40)}<div><i>${ev.mood === 'bad' ? 'Mit ernsten Grüßen' : 'Mit freundlichen Grüßen'}</i><b>${from.name}</b><small>${from.role}</small></div></div></div>`;
        // Begrüßung gleich öffnen, alles andere landet im Postfach
        this.mail('letter', ev.title, `${from.name}, ${from.org}`, html, ev.open || ev.title === 'Willkommen an Bord!');
        continue;
      }
      if (ev.type === 'achievement') {
        const a = ACHIEVEMENTS.find((x) => x.id === ev.id);
        unlockAchievement(ev.id);
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
    if (cur.cells) {
      // Großstörung (RM-FR-EVT-09)
      const left = Math.max(1, Math.ceil(((cur.until ?? 0) - this.g.sim.time) / 60));
      const key = `big|${at.x},${at.y}|${left}|${!!cur.boosted}|${this.g.money >= BIG_REPAIR_COST}`;
      if (key !== this.faultKey) {
        this.faultKey = key;
        pop.innerHTML = `<b>${cur.kind === 'tree' ? 'Baum auf der Strecke' : 'Oberleitungsschaden'}</b><small>Streckengleis gesperrt – noch ${left} min</small>
          ${cur.boosted ? '<span class="ok">Großeinsatz läuft</span>'
            : `<button class="btn" data-repair="${at.x},${at.y}"${this.g.money < BIG_REPAIR_COST ? ' disabled' : ''}>Großeinsatz (${eur(BIG_REPAIR_COST)} €): halbe Zeit</button>`}
          <small>Züge über ein zweites Gleis umleiten oder ausfallen lassen</small>`;
      }
      const p = sc.cellToScreen(at.x, at.y);
      pop.style.left = `${Math.round(toUi(Math.min(window.innerWidth - fromUi(pop.offsetWidth) - 6, p.x + 18)))}px`;
      pop.style.top = `${Math.round(toUi(Math.max(60, p.y - fromUi(pop.offsetHeight) - 14)))}px`;
      pop.classList.remove('hidden');
      return;
    }
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
    pop.style.left = `${Math.round(toUi(Math.min(window.innerWidth - fromUi(pop.offsetWidth) - 6, p.x + 18)))}px`;
    pop.style.top = `${Math.round(toUi(Math.max(60, p.y - fromUi(pop.offsetHeight) - 14)))}px`;
    pop.classList.remove('hidden');
  }

  // ------------------------------------------------------------ Bahnhof: Kurzinfo beim Hovern
  private stKey = '';
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
    const x = Math.min(window.innerWidth - fromUi(pop.offsetWidth) - 8, this.ui.mouse.x + 18), y = Math.min(window.innerHeight - fromUi(pop.offsetHeight) - 8, this.ui.mouse.y + 18);
    pop.style.left = `${toUi(x)}px`; pop.style.top = `${toUi(y)}px`;
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
  /** Begriff im gerade sichtbaren Tooltip (für „?“ → Bahn-ABC) */
  private ttTerm: string | undefined;

  private setupTooltips() {
    const tt = $('tt');
    let cur: HTMLElement | null = null;
    const place = (e: MouseEvent) => {
      const tw = fromUi(tt.offsetWidth), th = fromUi(tt.offsetHeight);
      const x = Math.min(window.innerWidth - tw - 6, e.clientX + 14);
      const y = e.clientY + 18 + th > window.innerHeight ? e.clientY - th - 10 : e.clientY + 18;
      tt.style.left = `${toUi(Math.max(4, x))}px`; tt.style.top = `${toUi(Math.max(4, y))}px`;
    };
    document.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest?.('[title],[data-tt],#money-wrap,#daycost-wrap') as HTMLElement | null;
      if (el?.title) { el.dataset.tt = el.title; el.removeAttribute('title'); }
      cur = el;
      if (!el) { tt.style.display = 'none'; return; }
      const fin = el.id === 'money-wrap' || el.id === 'daycost-wrap';
      if (!fin && !el.dataset.tt) { tt.style.display = 'none'; return; }
      const text = fin ? '' : el.dataset.tt!;
      const bank = el.id === 'money-wrap' && systemOn(this.g, 'loan');
      this.ttTerm = fin ? (bank ? 'Kredit' : undefined) : findTerm(text)?.term;
      tt.innerHTML = (fin ? `${this.financeHtml()}${bank ? '<small class="tt-abc">Klicken: Bank (Kredit)</small>' : ''}` : text.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
        + (this.ttTerm ? `<small class="tt-abc">„?“ – ${this.ttTerm} im Bahn-ABC</small>` : '');
      tt.style.display = 'block';
      place(e);
    });
    document.addEventListener('mousemove', (e) => { if (cur && tt.style.display === 'block') place(e); });
    document.addEventListener('mousedown', () => { tt.style.display = 'none'; });
    // „?“ öffnet das Bahn-ABC beim Begriff des sichtbaren Tooltips (sonst die Liste)
    document.addEventListener('keydown', (e) => {
      if (e.key !== '?' || typing()) return;
      e.preventDefault();
      this.openHelp('abc', tt.style.display === 'block' ? this.ttTerm : undefined);
    });
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
    return `<li data-id="${id}"><span class="dot" style="background:${color}"></span><span class="tnum">${num} ${arrow}</span><span class="tstat${late ? ' late' : ''}" title="${status}">${status}</span></li>`;
  }
}

export const MISSION_COUNT = MISSIONS.length;
