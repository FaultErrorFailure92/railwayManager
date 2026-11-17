/**
 * Fenster aus dem Hauptmenü: Profile (RM-FR-PROF-02), Kampagne (RM-FR-MODE-02), freies Spiel einrichten (RM-FR-MODE-06).
 */
import { CHALLENGES } from '../game/Challenges';
import { FREE_SLIDERS, freeDefaults, type FreeCfg, type NewGameSetup } from '../game/FreePlay';
import { activeProfile, chapterOpen, CHAPTERS, createProfile, listProfiles, mapOpen, updateProfile, type Player, type Profile, chapterStars } from '../game/Profiles';
import { lifeLines } from '../game/Lifetime';
import { listSlots } from '../game/storage';
import { MAPS, type MapDef } from '../world/maps';
import { avatar, AVATARS } from './portrait';

const ICON = (name: string) => `assets/gen/icons/${name}.png`;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface MenuHooks {
  /** neues Spiel starten (fragt ggf. vorher nach dem Speichern) */
  start: (s: NewGameSetup) => void;
  /** Profil wechseln */
  switchProfile: (id: string) => void;
  /** Profil löschen (Rückfrage macht das Kündigungsschreiben) */
  deleteProfile: (p: Profile) => void;
  /** Profil hat sich geändert (Menü auffrischen) */
  changed: () => void;
}

const setupFor = (p: Profile, rest: Omit<NewGameSetup, 'profileId' | 'company' | 'player'>): NewGameSetup =>
  ({ ...rest, profileId: p.id, company: p.company, player: p.player });

export class Menus {
  private cfg: FreeCfg | null = null;

  constructor(private hooks: MenuHooks) {
    $('ls-close').onclick = () => $('lifestats').classList.add('hidden');
    $('acc-btn').onclick = (e) => { e.stopPropagation(); this.renderAccount(); $('acc-menu').classList.toggle('hidden'); };
    document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('#m-account')) $('acc-menu').classList.add('hidden'); });
    $('acc-menu').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      $('acc-menu').classList.add('hidden');
      const p = activeProfile();
      if (b.dataset.sw) hooks.switchProfile(b.dataset.sw);
      else if (b.dataset.acc === 'new') this.onboard(() => hooks.changed(), true);
      else if (b.dataset.acc === 'edit' && p) this.editDoc(p, () => hooks.changed());
      else if (b.dataset.acc === 'stats' && p) this.openStats(p);
      else if (b.dataset.acc === 'manage') this.openProfiles();
    });
    $('ob-box').addEventListener('click', (e) => this.onboardClick(e));
    $('pf-close').onclick = () => $('profiles').classList.add('hidden');
    $('cp-close').onclick = () => $('campaign').classList.add('hidden');
    $('fs-close').onclick = () => $('freesetup').classList.add('hidden');
    $('pf-new').onclick = () => this.onboard(() => { hooks.changed(); this.renderProfiles(); }, true);
    $('pf-list').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const id = (t.closest('[data-pf]') as HTMLElement | null)?.dataset.pf;
      const p = listProfiles().find((x) => x.id === id);
      if (!p) return;
      if (t.closest('[data-use]')) hooks.switchProfile(p.id);
      else if (t.closest('[data-edit]')) this.editDoc(p, () => { hooks.changed(); this.renderProfiles(); });
      else if (t.closest('[data-del]')) this.deleteDoc(p);
    });
    $('ch-close').onclick = () => $('challenges').classList.add('hidden');
    $('ch-list').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-chal]') as HTMLElement | null;
      const p = activeProfile();
      if (!b || !p) return;
      $('challenges').classList.add('hidden');
      hooks.start(setupFor(p, { mode: 'challenge', map: 'donau', challenge: b.dataset.chal }));
    });
    $('cp-list').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-chapter]') as HTMLElement | null;
      const p = activeProfile();
      if (!b || !p) return;
      const i = Number(b.dataset.chapter);
      $('campaign').classList.add('hidden');
      // Kapitel 1 beginnt immer mit der Einschulung
      hooks.start(setupFor(p, { mode: 'campaign', map: CHAPTERS[i].map, tutorial: i === 0 }));
    });
    $('fs-maps').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-map]') as HTMLButtonElement | null;
      if (!b || b.disabled || !this.cfg) return;
      const m = MAPS.find((x) => x.id === b.dataset.map)!;
      // Startgeld folgt der Karte, solange es nicht verstellt wurde
      if (this.cfg.money === MAPS.find((x) => x.id === this.cfg!.map)?.startMoney) this.cfg.money = m.startMoney;
      this.cfg.map = m.id;
      this.renderFree();
    });
    $('fs-sliders').addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement;
      const key = inp.dataset.key as (typeof FREE_SLIDERS)[number]['key'] | undefined;
      if (!key || !this.cfg) return;
      this.cfg[key] = Number(inp.value);
      const s = FREE_SLIDERS.find((x) => x.key === key)!;
      inp.closest('.fs-row')!.querySelector('b')!.textContent = s.fmt(this.cfg[key]);
    });
    $('fs-growth').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-growth]') as HTMLElement | null;
      if (!b || !this.cfg) return;
      this.cfg.growth = b.dataset.growth as FreeCfg['growth'];
      this.renderFree();
    });
    $('fs-reset').onclick = () => { if (this.cfg) { const m = MAPS.find((x) => x.id === this.cfg!.map)!; this.cfg = freeDefaults(m.id, m.startMoney); this.renderFree(); } };
    $('fs-start').onclick = () => {
      const p = activeProfile();
      if (!p || !this.cfg) return;
      $('freesetup').classList.add('hidden');
      hooks.start(setupFor(p, { mode: 'free', map: this.cfg.map, cfg: { ...this.cfg } }));
    };
  }

  // ------------------------------------------------------------ Profile
  openProfiles() { this.renderProfiles(); $('profiles').classList.remove('hidden'); }

  renderProfiles() {
    const act = activeProfile();
    $('pf-list').innerHTML = listProfiles().map((p) => {
      const saves = listSlots(p.id).length;
      const who = [p.player.title, p.player.name].filter(Boolean).join(' ') || 'Betriebsleitung';
      return `<div class="doc-card${p.id === act?.id ? ' on' : ''}" data-pf="${esc(p.id)}">${avatar(p.player.avatar, 48)}
        <div><b>${esc(who)}</b><small>Betriebsleitung der ${esc(p.company)}</small><small>Kampagne ${p.chapters.length}/${CHAPTERS.length} Kapitel · ${saves} ${saves === 1 ? 'Spielstand' : 'Spielstände'} · seit ${new Date(p.created).toLocaleDateString('de-AT')}</small></div>
        <div class="doc-btns">${p.id === act?.id ? '<span class="doc-stamp small">IM DIENST</span>' : '<button class="btn" data-use>Einsetzen</button>'}
          <button class="btn" data-edit>Ändern</button><button class="btn" data-del title="Dienstverhältnis beenden (Profil löschen)">Kündigen</button></div></div>`;
    }).join('') || '<p>Das Verzeichnis ist leer. Ein Zustand, den die Personalabteilung nicht lange duldet.</p>';
  }

  // ------------------------------------------------------------ Kampagne
  openCampaign() {
    const p = activeProfile();
    const done = p?.chapters.length ?? 0;
    const quote = done === 0 ? '„Jede große Bahn beginnt mit einem kleinen Bahnsteig. Und einer noch kleineren Bank.“'
      : done < 3 ? '„Ausgezeichnet! Der Vorstand hat sich erlaubt, Ihnen mehr Arbeit zu geben.“'
        : '„Sie sind eine Legende. Die Kantine hat ein Schnitzel nach Ihnen benannt.“';
    const rows: string[] = [], tiles: string[] = [];
    CHAPTERS.forEach((c, i) => {
      const ok = !!p?.chapters.includes(c.map);
      const open = chapterOpen(p, i);
      const playable = open && c.ready;
      const map = MAPS.find((m) => m.id === c.map);
      const pic = map ? mapPic(map) : '<i style="inset:0;width:auto;height:auto;background:#3a3a44"></i>';
      if (!open) {
        // gesperrt: nur kleine Kachel, Details beim Drüberfahren
        tiles.push(`<div class="cp-tile" title="${esc(c.topic)} – erst Kapitel ${i} schaffen&#10;${(TEASE[i] ?? '').replace(/"/g, '&quot;')}"><div class="cp-pic">${pic}</div><b>${i + 1} · ${esc(c.title)}</b></div>`);
        return;
      }
      const state = ok ? '' : !c.ready ? 'in Arbeit' : '';
      rows.push(`<div class="cp-row${ok ? ' done' : ''}"><div class="cp-pic">${pic}<span class="cp-train"></span></div>
        <div title="${(TEASE[i] ?? '').replace(/"/g, '&quot;')}"><b>Kapitel ${i + 1}: ${esc(c.title)}</b><small>${esc(c.topic)}${state ? ` · ${state}` : ''}</small>${chapterStars(p, c.map)}</div>
        <div class="cp-btns">${playable ? `<button class="btn big" data-chapter="${i}">${ok ? 'Nochmal' : i === 0 && !ok ? 'Los geht’s' : 'Spielen'}</button>` : ''}</div>
        ${ok ? '<span class="cp-done-stamp">ERLEDIGT</span>' : ''}</div>`);
    });
    $('cp-list').innerHTML = `<p class="cp-quote">${quote}</p>` + rows.join('') + (tiles.length ? `<div class="cp-tiles">${tiles.join('')}</div>` : '');
    $('campaign').classList.remove('hidden');
  }

  /** Herausforderungen (RM-FR-MODE-08) */
  openChallenges() {
    const p = activeProfile();
    $('ch-list').innerHTML = CHALLENGES.map((c) => {
      const best = p?.challenges?.[c.id];
      return `<div class="cp-row ch-row${best ? ' done' : ''}"><div class="ch-time">${c.hours} h</div>
        <div><b>${esc(c.title)}</b><small>${esc(c.short)}</small>${best ? `<small class="ok">Bestzeit ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')} h</small>` : ''}</div>
        <div class="cp-btns"><button class="btn big" data-chal="${c.id}">${best ? 'Nochmal' : 'Start'}</button></div></div>`;
    }).join('');
    $('challenges').classList.remove('hidden');
  }

  // ------------------------------------------------------------ Account rechts oben
  renderAccount() {
    const p = activeProfile();
    if (!document.getElementById('acc-btn')) return;
    $('m-account').classList.toggle('hidden', !p);
    const who = p ? [p.player.title, p.player.name].filter(Boolean).join(' ') : '';
    $('acc-btn').innerHTML = p ? `${avatar(p.player.avatar, 36)}<span><b>${esc(p.company)}</b><small>${esc(who || 'Betriebsleitung')}</small></span><span class="caret">▾</span>`
      : '<span><b>Kein Profil</b><small>Profil anlegen</small></span>';
    const list = listProfiles();
    $('acc-menu').innerHTML = (list.length > 1 ? '<div class="acc-sec">Profil wechseln</div>' + list.map((x) =>
      `<button data-sw="${esc(x.id)}" class="${x.id === p?.id ? 'on' : ''}">${avatar(x.player.avatar, 24)}${esc(x.company)}${x.id === p?.id ? ' ✓' : ''}</button>`).join('') + '<hr>' : '')
      + '<button data-acc="new">+ Neues Profil anlegen</button>'
      + (p ? '<button data-acc="edit">Profil bearbeiten</button><button data-acc="stats">Dienstakte (Statistik)</button>' : '')
      + '<button data-acc="manage">Profile verwalten…</button>';
  }

  // ------------------------------------------------------------ Dienstakte (Statistik)
  openStats(p: Profile, inGame = false) {
    const who = [p.player.title, p.player.name].filter(Boolean).join(' ') || 'Betriebsleitung';
    const lines = lifeLines(p);
    $('ls-body').innerHTML = `<div class="doc-card on">${avatar(p.player.avatar, 64)}<div><b>${esc(who)}</b><small>Betriebsleitung der ${esc(p.company)}</small>
        <small>Im Dienst seit ${new Date(p.created).toLocaleDateString('de-AT')} · Kampagne ${p.chapters.length}/${CHAPTERS.length} Kapitel</small></div><span class="doc-stamp">VERTRAULICH</span></div>
      <div class="ls-list">${lines.map((l) => `<div class="ls-item"><img src="${ICON(l.icon)}" alt="" /><div><small>${esc(l.label)}</small><b>${esc(l.value)}</b>${l.quip ? `<small><i>${esc(l.quip)}</i></small>` : ''}</div></div>`).join('')}</div>
      <p class="doc-foot">${inGame ? 'Änderungen am Profil nur über das Hauptmenü (rechts oben) – Dienstweg ist Dienstweg. ' : ''}Gezählt wird über alle Spiele dieses Profils. Gez. Personalabteilung.</p>`;
    $('lifestats').classList.remove('hidden');
  }

  // ------------------------------------------------------------ Profil ändern / löschen (Dokumente)
  private doc: { kind: 'onboard' | 'edit' | 'delete'; profile?: Profile } = { kind: 'onboard' };

  /** Änderungsantrag: Firma, Spieler, Bild */
  editDoc(p: Profile, then: () => void) {
    this.doc = { kind: 'edit', profile: p };
    this.ob = { step: 9, company: p.company, player: { ...p.player }, then, cancel: true };
    this.renderOnboard();
    $('onboard').classList.remove('hidden');
  }

  /** Kündigungsschreiben: Profil löschen mit Rückfrage */
  deleteDoc(p: Profile) {
    this.doc = { kind: 'delete', profile: p };
    this.ob = { step: 9, company: p.company, player: { ...p.player }, then: () => {}, cancel: true };
    this.renderOnboard();
    $('onboard').classList.remove('hidden');
  }

  // ------------------------------------------------------------ Onboarding beim ersten Start
  private ob = { step: 0, company: '', player: { name: '', title: '' as Player['title'], avatar: 0 }, then: () => {}, cancel: false };

  /** neues Profil: beim ersten Start Pflicht, sonst abbrechbar */
  onboard(then: () => void, cancel = false) {
    this.doc = { kind: 'onboard' };
    this.ob = { step: 0, company: '', player: { name: '', title: '', avatar: Math.floor(Math.random() * AVATARS.length) }, then, cancel };
    this.renderOnboard();
    $('onboard').classList.remove('hidden');
  }

  private readOnboard() {
    const c = document.getElementById('ob-company') as HTMLInputElement | null;
    if (c) this.ob.company = c.value.trim();
    const n = document.getElementById('ob-name') as HTMLInputElement | null;
    if (n) this.ob.player.name = n.value.trim();
    const t = document.getElementById('ob-title') as HTMLSelectElement | null;
    if (t) this.ob.player.title = t.value as Player['title'];
  }

  private onboardClick(e: Event) {
    const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
    if (!b) return;
    this.readOnboard();
    if (b.dataset.av !== undefined) { this.ob.player.avatar = Number(b.dataset.av); this.renderOnboard(); return; }
    if (b.dataset.ob === 'dice') { this.ob.company = NAMES[Math.floor(Math.random() * NAMES.length)]; this.renderOnboard(); return; }
    if (b.dataset.ob === 'back') { this.ob.step--; this.renderOnboard(); return; }
    if (b.dataset.ob === 'cancel') { $('onboard').classList.add('hidden'); return; }
    if (b.dataset.ob === 'save' && this.doc.profile) {
      if (!this.ob.company) { $('ob-quip').textContent = 'Ein Firmenname ist Pflicht. Formular unvollständig, Antrag abgelehnt.'; return; }
      updateProfile(this.doc.profile.id, { company: this.ob.company, player: { ...this.ob.player } });
      $('onboard').classList.add('hidden');
      this.ob.then();
      return;
    }
    if (b.dataset.ob === 'fire' && this.doc.profile) {
      $('onboard').classList.add('hidden');
      this.hooks.deleteProfile(this.doc.profile);
      this.renderProfiles();
      return;
    }
    if (b.dataset.ob === 'next') {
      if (this.ob.step === 1 && !this.ob.company) { $('ob-quip').textContent = 'Ohne Namen kein Firmenbuch-Eintrag. Und ohne Eintrag keine Züge. So ist das Gesetz.'; return; }
      if (this.ob.step === 3) {
        createProfile(this.ob.company, { ...this.ob.player });
        $('onboard').classList.add('hidden');
        this.ob.then();
        return;
      }
      this.ob.step++;
      this.renderOnboard();
    }
  }

  /** Änderungsantrag oder Kündigungsschreiben */
  private otherDoc() {
    const o = this.ob, p = this.doc.profile!;
    const who = [o.player.title, o.player.name].filter(Boolean).join(' ') || 'Betriebsleitung';
    if (this.doc.kind === 'edit') return `<div class="ob-step">FORMULAR B-17/Ö-Ä · ÄNDERUNGSANTRAG</div><h2>Profil ändern</h2>
      ${fields(o)}<div class="ob-quip" id="ob-quip">Änderungen werden nach Abstempeln sofort wirksam. Ausnahmsweise.</div>
      <div class="dc-btns"><button class="btn" data-ob="cancel">Abbrechen</button><button class="btn big" data-ob="save">Abstempeln</button></div>`;
    const saves = listSlots(p.id).length;
    return `<div class="ob-step">PERSONALABTEILUNG · KÜNDIGUNGSSCHREIBEN</div><h2>Dienstverhältnis beenden?</h2>
      <div class="ob-letter"><p>Betreff: ${esc(who)}, ${esc(p.company)}</p>
      <p>Hiermit wird das Dienstverhältnis aufgelöst. Dabei wandern <b>${saves} ${saves === 1 ? 'Spielstand' : 'Spielstände'}</b>, der Kampagnen-Fortschritt (${p.chapters.length}/${CHAPTERS.length} Kapitel) und die gesamte Dienstakte in den Aktenvernichter.</p>
      <p><b>Das lässt sich nicht rückgängig machen.</b> Auch nicht mit Formular B-17/Ö-R.</p></div>
      <div class="dc-btns"><button class="btn big" data-ob="cancel">Doch nicht</button><button class="btn warn" data-ob="fire">Kündigen</button></div>`;
  }

  private renderOnboard() {
    const o = this.ob;
    if (this.doc.kind !== 'onboard') { $('ob-box').innerHTML = this.otherDoc(); return; }
    const steps = ['Willkommen', 'Firma', 'Leitung', 'Dienstausweis'];
    const head = `<div class="ob-step">SCHRITT ${o.step + 1} VON 4 · ${steps[o.step].toUpperCase()}</div>`;
    const nav = (next: string) => `<div class="dc-btns">${o.cancel ? '<button class="btn" data-ob="cancel">Abbrechen</button>' : ''}${o.step ? '<button class="btn" data-ob="back">Zurück</button>' : ''}<button class="btn big" data-ob="next">${next}</button></div>`;
    let html = '';
    if (o.step === 0 && o.cancel) html = `<h2>Neue Bahngesellschaft</h2><div class="ob-letter"><p>Sie möchten eine weitere Bahngesellschaft gründen? Ehrgeizig!</p>
      <p>Formular B-17/Ö kennen Sie ja schon. Diesmal füllen wir sogar zweieinhalb Ausfertigungen selbst aus.</p>
      <div class="ob-from">${avatar(3, 36)}<span>Hofrat Dr. Ferdinand Fahrplan<br><small>Vorsitzender des Vorstands</small></span></div></div>${nav('Formular ausfüllen')}`;
    else if (o.step === 0) html = `<h2>Herzlich willkommen!</h2><div class="ob-letter"><p>Sehr geehrte zukünftige Betriebsleitung,</p>
      <p>wie wir hören, möchten Sie einen Bahnhof führen. Ausgezeichnet! Bevor wir Sie auf die Gleise lassen, brauchen wir nur <b>Formular B-17/Ö</b> in dreifacher Ausfertigung.</p>
      <p>Keine Sorge: zwei Ausfertigungen füllen wir selbst aus. Für die dritte brauchen wir Sie – es dauert keine zwei Minuten. Versprochen. Ungefähr.</p>
      <div class="ob-from">${avatar(3, 36)}<span>Hofrat Dr. Ferdinand Fahrplan<br><small>Vorsitzender des Vorstands</small></span></div></div>${nav('Formular ausfüllen')}`;
    else if (o.step === 1) html = `<h2>Ihre Bahngesellschaft</h2><p>Wie soll Ihre Firma heißen? Sie steht später auf jedem Fahrschein.</p>
      <div class="ob-row"><input id="ob-company" maxlength="28" placeholder="z.B. Donaubahn AG" value="${esc(o.company)}" /><button class="btn" data-ob="dice" title="Namen würfeln">🎲</button></div>
      <div class="ob-quip" id="ob-quip">${o.company ? esc(QUIP(o.company)) : 'Kein Name fällt Ihnen ein? Der Würfel hilft.'}</div>${nav('Weiter')}`;
    else if (o.step === 2) html = `<h2>Und wer leitet sie?</h2><p>Für die Briefe des Vorstands – damit er Sie richtig ansprechen kann.</p>
      <div class="pl-row"><select id="ob-title"><option value="">–</option><option value="Frau"${o.player.title === 'Frau' ? ' selected' : ''}>Frau</option><option value="Herr"${o.player.title === 'Herr' ? ' selected' : ''}>Herr</option></select>
        <input id="ob-name" maxlength="24" placeholder="Dein Name" value="${esc(o.player.name)}" /></div>
      <p>Ihr Foto für den Dienstausweis:</p>
      <div class="pl-avatars">${AVATARS.map((_, i) => `<button class="pl-av${i === o.player.avatar ? ' on' : ''}" data-av="${i}">${avatar(i, 40)}</button>`).join('')}</div>${nav('Weiter')}`;
    else {
      const who = [o.player.title, o.player.name].filter(Boolean).join(' ') || 'Betriebsleitung';
      html = `<h2>Ihr Dienstausweis</h2><div class="ob-card">${avatar(o.player.avatar, 72)}<div><small>BAHNHOFSMANAGER · DIENSTAUSWEIS</small><b>${esc(who)}</b><small>Betriebsleitung der ${esc(o.company)}</small>
        <small>Ausgestellt: ${new Date().toLocaleDateString('de-AT')} · Gültig bis: Pension</small><small>Berechtigt zu: Weichen stellen, Kaffee trinken, Verspätungen erklären</small></div><span class="ob-stamp">GENEHMIGT</span></div>
        <p>Den Ausweis (und alles andere) finden Sie im Hauptmenü rechts oben.</p>${nav('Dienst antreten!')}`;
    }
    $('ob-box').innerHTML = head + html;
    setTimeout(() => (document.getElementById(o.step === 1 ? 'ob-company' : 'ob-name') as HTMLInputElement | null)?.focus(), 30);
  }

  // ------------------------------------------------------------ freies Spiel
  openFree() {
    if (!this.cfg) this.cfg = freeDefaults(MAPS[0].id, MAPS[0].startMoney);
    if (!mapOpen(activeProfile(), this.cfg.map)) { this.cfg.map = MAPS[0].id; this.cfg.money = MAPS[0].startMoney; }
    this.renderFree();
    $('freesetup').classList.remove('hidden');
  }

  private renderFree() {
    const cfg = this.cfg!, p = activeProfile();
    const order = [...MAPS].sort((a, b) => idx(a.id) - idx(b.id));
    $('fs-maps').innerHTML = order.map((m) => {
      const open = mapOpen(p, m.id);
      const ch = CHAPTERS.findIndex((c) => c.map === m.id);
      return `<button class="btn fs-map${m.id === cfg.map ? ' on' : ''}" data-map="${m.id}"${open ? '' : ' disabled'}
        title="${open ? esc(m.info) : `Freispielen: Kapitel ${ch} der Kampagne schaffen`}"><b>${open ? '' : '🔒 '}${esc(m.name)}</b><small>${esc(m.theme)} · ${m.difficulty}</small></button>`;
    }).join('');
    $('fs-sliders').innerHTML = FREE_SLIDERS.map((s) => `<div class="fs-row" title="${s.hint}"><label>${s.label}<b>${s.fmt(cfg[s.key])}</b></label>
      <input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${cfg[s.key]}" /></div>`).join('');
    $('fs-growth').innerHTML = `<button class="btn${cfg.growth === 'tier' ? ' on' : ''}" data-growth="tier" title="Neue Unternehmen erst, wenn der Bahnhof wächst">mit dem Bahnhof</button>
      <button class="btn${cfg.growth === 'instant' ? ' on' : ''}" data-growth="instant" title="Alle Unternehmen melden sich von Anfang an">sofort voll</button>`;
  }
}

/** Kartenreihenfolge wie in der Kampagne */
const idx = (map: string) => { const i = CHAPTERS.findIndex((c) => c.map === map); return i < 0 ? 99 : i; };

/** Formularfelder für Firma/Spieler (Onboarding und Änderungsantrag) */
function fields(o: { company: string; player: Player }) {
  return `<label class="doc-field"><span>Firma</span><span class="ob-row"><input id="ob-company" maxlength="28" value="${esc(o.company)}" /><button class="btn" data-ob="dice" title="Namen würfeln">🎲</button></span></label>
    <label class="doc-field"><span>Anrede, Name</span><span class="pl-row"><select id="ob-title"><option value="">–</option><option value="Frau"${o.player.title === 'Frau' ? ' selected' : ''}>Frau</option><option value="Herr"${o.player.title === 'Herr' ? ' selected' : ''}>Herr</option></select>
      <input id="ob-name" maxlength="24" placeholder="Dein Name" value="${esc(o.player.name)}" /></span></label>
    <div class="doc-field"><span>Lichtbild</span><div class="pl-avatars">${AVATARS.map((_, i) => `<button class="pl-av${i === o.player.avatar ? ' on' : ''}" data-av="${i}">${avatar(i, 36)}</button>`).join('')}</div></div>`;
}

const TEASE = [
  'Ein Bahnsteig, ein Schild, eine Bank. Der Rest liegt bei Ihnen.',
  'Flach wie ein Fahrplan – aber die Güterzüge kommen im Takt.',
  'Kohle, Erz und Rangierer mit sehr eigenen Vorstellungen.',
  'Weichenheizung? Gute Frage. Nächste Frage.',
  'Steigungen, Tunnel und Kühe, die grundsätzlich nicht ausweichen.',
  'Viel Sand, wenig Schatten und sehr, sehr schnelle Züge.',
  'Alle wollen gleichzeitig weg. Willkommen im Finale.',
];

const NAMES = ['Pünktlich & Söhne KG', 'Prellbock & Partner', 'Dampf & Dunst AG', 'Bummelbahn GmbH', 'Taktvoll AG', 'Weichenzauber KG', 'Schiene & Schnitzel GmbH',
  'Fahrplan-Fanatiker AG', 'Donau-Express AG', 'Signalrot Verkehrsbetriebe', 'Gleisgold AG', 'Rauchkuchl-Bahn GmbH', 'Melange-Express KG', 'Hans Dampf Verkehrs-AG'];

const QUIP = (name: string) => /express/i.test(name) ? 'Express – das verpflichtet. Hoffentlich auch die Züge.'
  : /gmbh/i.test(name) ? 'Eine GmbH. Sehr vernünftig. Die Bank nickt anerkennend.'
    : /ag\b/i.test(name) ? 'Eine Aktiengesellschaft! Die Aktionäre freuen sich schon.'
      : /kg\b/i.test(name) ? 'Eine KG. Familiär, aber ehrgeizig.' : 'Klingt nach Pünktlichkeit. Fast.';

/** kleines Kartenbild aus den Kartendaten: Gelände, Wasser, Fels, Betriebe, Strecke */
function mapPic(m: MapDef) {
  const W = 64, H = 16, px: string[] = [];
  const ground = m.ground === 'sand' ? '#d8b878' : m.ground === 'snow' ? '#e4ebf4' : `color-mix(in srgb, #6c9a3c 80%, #${m.tint.toString(16).padStart(6, '0')})`;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = x * 4, gy = y * 4;
    let c = '';
    if (m.rocks.some((r) => gx >= r.x0 && gx < r.x1 && gy >= r.y0 && gy < r.y1 && (r.edge === 'N' ? gy < r.y0 + (r.y1 - r.y0) * 0.7 : gy > r.y0 + (r.y1 - r.y0) * 0.3))) c = '#8f887c';
    if (m.lakes.some((l) => ((gx - l.x) / (l.rx + 1)) ** 2 + ((gy - l.y) / (l.ry + 1)) ** 2 <= 1)) c = '#4a7fc4';
    if (m.rivers.some((rv) => Math.abs(gx - rv.x) <= 2)) c = '#4a7fc4';
    if (gy === 28 || gy === 32) c = '#5a4632';
    if (m.industries.some((i) => Math.abs(gx - i.x) <= 3 && Math.abs(gy - i.y) <= 3)) c = '#c0392b';
    if (c) px.push(`<i style="left:${x * 3}px;top:${y * 4}px;background:${c}"></i>`);
  }
  return `<i style="inset:0;width:auto;height:auto;background:${ground}"></i>${px.join('')}`;
}
