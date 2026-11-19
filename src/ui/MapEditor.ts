/**
 * Kartenwerkstatt (RM-FR-MOD-04, MOD-05): eigene Karten aus Vorlagen, mit eigenen Unternehmen (RM-FR-MOD-01 … 03).
 * Links die Liste, rechts Vorschau und Reiter. Änderungen werden sofort gespeichert.
 */
import { MAIN_ROW, MAP_H, MAP_W, ROW0, SECOND_ROW } from '../config';
import {
  checkMap, exportMap, importMap, LIMITS, loadMaps, migrateCompanies, newMap, previewGrid, saveMaps, START_AREA, toMapDef, type CustomMap,
} from '../game/CustomMaps';
import { crest, importCompanies, newCompany, TEMPLATES, type CustomCompany } from '../game/Companies';
import { activeProfile, mapOpen } from '../game/Profiles';
import { OP_DEFAULTS, OPERATORS, type OperatorId } from '../sim/Operators';
import { BUILDINGS } from '../world/buildings';
import { GRASS, ROCK, WATER, type Grid } from '../world/Grid';
import { MAPS } from '../world/maps';
import { portrait } from './portrait';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const plain = (v: string, max: number) => v.replace(/[<>]/g, '').slice(0, max);
/** Lage der Werke (Gebäude) in der Vorschau */
const SAW_Y = 22 + ROW0, MINE_Y = 41 + ROW0;
/** Bildpunkte je Feld in der Vorschau */
const S = 3;

type Tab = 'allg' | 'land' | 'strecke' | 'firmen' | 'pruefen';
type Tool = 'move' | 'village' | 'lake' | 'river' | 'road' | 'del';
type Hit = { kind: 'village' | 'lake' | 'river' | 'road' | 'sawmill' | 'mine'; i: number };

const TABS: [Tab, string][] = [['allg', 'Allgemein'], ['land', 'Landschaft'], ['strecke', 'Strecken'], ['firmen', 'Unternehmen'], ['pruefen', 'Prüfen']];

export class MapEditor {
  private list: CustomMap[] = [];
  /** gewählt: Kennung einer eigenen Karte oder `tpl:<Vorlage>` */
  private sel = '';
  private tab: Tab = 'allg';
  private tool: Tool = 'move';
  private grid?: Grid;
  private gridFor = '';
  private drag?: Hit;
  private selHit?: Hit;
  private coSel = '';
  private timer = 0;

  constructor(private play: (mapId: string) => void) {
    $('me-close').onclick = () => $('maped').classList.add('hidden');
    $('me-list').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-me]') as HTMLElement | null;
      if (!b) return;
      this.sel = b.dataset.me!;
      this.selHit = undefined;
      this.coSel = '';
      this.render();
    });
    $('me-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (!b) return;
      this.tab = b.dataset.tab as Tab;
      this.tool = 'move';
      this.selHit = undefined;
      this.render();
    });
    $('me-tools').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
      if (!b) return;
      this.tool = b.dataset.tool as Tool;
      this.renderTools();
    });
    $('me-body').addEventListener('click', (e) => this.click(e));
    $('me-body').addEventListener('input', (e) => this.input(e));
    $('me-body').addEventListener('change', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('select[data-use]')) { this.pickUse(t as HTMLSelectElement); return; }
      if (t.matches('select, input[type=checkbox]')) this.input(e);
    });
    const cv = $('me-canvas') as HTMLCanvasElement;
    cv.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', () => { if (this.drag) { this.drag = undefined; this.changed(true); } });
    $('me-export').onclick = () => {
      const c = this.cur();
      if (!c) { this.msg('Erst eine eigene Karte wählen.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportMap(c)], { type: 'application/json' }));
      a.download = `${c.name.replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'karte'}.karte.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.msg('Karte gespeichert – samt Unternehmen.');
    };
    $('me-import').onclick = () => ($('me-file') as HTMLInputElement).click();
    $('me-file').addEventListener('change', async (e) => {
      const inp = e.target as HTMLInputElement, file = inp.files?.[0];
      inp.value = '';
      if (!file) return;
      const text = await file.text();
      const r = importMap(text, this.list);
      if (r.map) {
        this.list = r.list; this.sel = r.map.id; this.save();
        this.msg(`„${r.map.name}“ übernommen.`);
      } else {
        // alte Unternehmens-Datei: in die gewählte Karte übernehmen
        const c = this.cur();
        const rc = c ? importCompanies(text, c.companies) : undefined;
        if (!c || !rc || rc.error) { this.msg(c ? r.error ?? 'Unbekannte Datei.' : 'Für Unternehmen erst eine eigene Karte wählen.'); return; }
        c.companies = rc.list;
        this.save();
        this.tab = 'firmen';
        this.msg(`${rc.added} Unternehmen in „${c.name}“ übernommen.`);
      }
      this.render();
    });
    $('me-play').onclick = () => {
      const c = this.cur();
      if (!c) return;
      if (checkMap(c, this.gridOf(c)).some((x) => x.level === 'error')) { this.tab = 'pruefen'; this.render(); this.msg('Erst die roten Punkte beheben.'); return; }
      if (!mapOpen(activeProfile(), c.base)) { this.msg('Die Vorlage ist in der Kampagne noch nicht freigespielt.'); return; }
      $('maped').classList.add('hidden');
      this.play(c.id);
    };
  }

  open() {
    const moved = migrateCompanies();
    this.list = loadMaps();
    if (!this.sel || (!this.sel.startsWith('tpl:') && !this.list.some((m) => m.id === this.sel))) this.sel = this.list[0]?.id ?? `tpl:${MAPS[0].id}`;
    if (moved) { this.sel = moved.id; this.tab = 'firmen'; }
    this.msg(moved ? 'Deine Unternehmen wohnen jetzt in der Karte „Donautal (meine Unternehmen)“.' : '');
    this.render();
    $('maped').classList.remove('hidden');
  }

  // ------------------------------------------------------------ Zustand
  private cur() { return this.list.find((m) => m.id === this.sel); }
  private shown(): CustomMap { return this.cur() ?? { ...newMap(this.sel.slice(4)), id: 'eigen-vorschau' }; }
  private msg(t: string) { $('me-msg').textContent = t; }
  private save() { saveMaps(this.list); }
  /** Vorschau-Gelände: nur neu erzeugen, wenn sich etwas an der Landschaft geändert hat */
  private gridOf(c: CustomMap) {
    const key = JSON.stringify({ ...c, companies: [], names: {}, off: [], use: {}, name: '', paper: '', ends: [], startMoney: 0, difficulty: '', weather: {} });
    if (!this.grid || this.gridFor !== key) { this.grid = previewGrid(c); this.gridFor = key; }
    return this.grid;
  }
  /** nach jeder Änderung: speichern, Vorschau kurz danach neu zeichnen */
  private changed(body = false) {
    this.save();
    this.renderList();
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.draw(); if (body || this.tab === 'pruefen') this.renderBody(); }, 60);
  }

  // ------------------------------------------------------------ Zeichnen
  private render() {
    this.renderList();
    const c = this.cur();
    $('me-tabs').innerHTML = c ? TABS.map(([id, l]) => `<button class="btn me-tab${id === this.tab ? ' on' : ''}" data-tab="${id}">${l}</button>`).join('') : '';
    $('me-export').toggleAttribute('disabled', !c);
    $('me-play').toggleAttribute('disabled', !c);
    this.renderBody();
    this.draw();
  }

  private renderList() {
    const row = (key: string, title: string, sub: string) =>
      `<button class="co-item${this.sel === key ? ' on' : ''}" data-me="${key}"><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`;
    $('me-list').innerHTML = `<div class="co-sec">Eigene Karten (${this.list.length})</div>`
      + (this.list.length ? this.list.map((m) => row(m.id, m.name, `Vorlage ${MAPS.find((x) => x.id === m.base)?.name ?? m.base} · ${m.companies.length} eigene Unternehmen`)).join('') : '<p class="co-hint">Noch keine – unten eine Vorlage wählen.</p>')
      + '<div class="co-sec">Vorlagen</div>'
      + MAPS.map((m) => row(`tpl:${m.id}`, m.name, `${m.theme} · ${m.difficulty}`)).join('');
  }

  private renderBody() {
    const c = this.cur();
    this.renderTools();
    if (!c) {
      const m = MAPS.find((x) => `tpl:${x.id}` === this.sel) ?? MAPS[0];
      const open = mapOpen(activeProfile(), m.id);
      $('me-body').innerHTML = `<div class="co-preview"><div><b>${esc(m.name)}</b><small>${esc(m.theme)} · ${m.difficulty} · mitgeliefert, nicht änderbar</small><small>${esc(m.info)}</small></div></div>
        <p class="co-hint">Eine eigene Karte übernimmt Boden, Bäume, Häuser, Fahrzeuge und Musik der Vorlage. Alles andere stellst du ein: Landschaft, Straßen, Werke, Fremdbahnen und Unternehmen.</p>
        <div class="dc-btns"><button class="btn big" data-act="new">Eigene Karte daraus</button></div>${open ? '' : '<p class="co-hint">Spielen kannst du sie erst, wenn die Vorlage in der Kampagne freigespielt ist.</p>'}`;
      return;
    }
    const head = '<div class="dc-btns me-acts"><button class="btn" data-act="copy">Kopieren</button><button class="btn" data-act="del">Löschen</button></div>';
    const slider = (key: string, label: string, v: number, min: number, max: number, step: number, fmt: string) =>
      `<div class="fs-row"><label>${label}<b>${fmt}</b></label><input type="range" data-f="${key}" min="${min}" max="${max}" step="${step}" value="${v}" /></div>`;
    let html = '';
    if (this.tab === 'allg') {
      html = `<label>Name<input data-f="name" maxlength="32" value="${esc(c.name)}" /></label>
        <label>Lokalzeitung<input data-f="paper" maxlength="32" value="${esc(c.paper)}" /></label>
        <div class="co-row"><label>Endpunkt West<input data-f="end0" maxlength="20" value="${esc(c.ends[0])}" /></label><label>Endpunkt Ost<input data-f="end1" maxlength="20" value="${esc(c.ends[1])}" /></label></div>
        <label>Schwierigkeit<select data-f="difficulty">${(['leicht', 'mittel', 'schwer'] as const).map((d) => `<option${d === c.difficulty ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        ${slider('startMoney', 'Startkapital', c.startMoney, LIMITS.money[0], LIMITS.money[1], 500, `${c.startMoney.toLocaleString('de-AT')} €`)}
        ${slider('rain', 'Regen', c.weather.rain, 0, 0.6, 0.01, `${Math.round(c.weather.rain * 100)} %`)}
        ${slider('snow', 'Schnee', c.weather.snow, 0, 0.6, 0.01, `${Math.round(c.weather.snow * 100)} %`)}`;
    } else if (this.tab === 'land') {
      const h = this.selHit;
      let extra = '';
      if (h?.kind === 'lake' && c.lakes[h.i]) {
        const l = c.lakes[h.i];
        extra = `<div class="me-selbox"><b>See</b>${slider('lakeRx', 'Breite', l.rx, LIMITS.lakeR[0], LIMITS.lakeR[1], 1, String(l.rx))}${slider('lakeRy', 'Tiefe', l.ry, LIMITS.lakeR[0], LIMITS.lakeR[1], 1, String(l.ry))}</div>`;
      }
      if (h?.kind === 'river' && c.rivers[h.i]) {
        const r = c.rivers[h.i];
        extra = `<div class="me-selbox"><b>Fluss</b>${slider('rivA', 'Mäander', r.a, 0, 12, 1, String(r.a))}${slider('rivW', 'Breite', r.w, 1, 2, 0.1, r.w.toFixed(1))}</div>`;
      }
      html = `<p class="co-hint">Werkzeug wählen, dann in die Vorschau klicken. „Verschieben“: Punkte ziehen, Seen und Flüsse anklicken für die Größe. ${c.villages.length}/${LIMITS.villages} Dörfer · ${c.lakes.length}/${LIMITS.lakes} Seen · ${c.rivers.length}/${LIMITS.rivers} Flüsse</p>
        ${slider('forests', 'Wälder', c.forests, 0, LIMITS.forests, 1, String(c.forests))}
        <label class="me-check"><input type="checkbox" data-f="rocks"${c.rocks ? ' checked' : ''} /> Felsränder der Vorlage</label>
        <div class="dc-btns"><button class="btn" data-act="seedT" title="Felsen anders verteilen">🎲 Gelände</button><button class="btn" data-act="seedL" title="Bäume und Häuser anders verteilen">🎲 Bäume &amp; Häuser</button></div>${extra}`;
    } else if (this.tab === 'strecke') {
      const name = (op: OperatorId, def: string) => `<input class="me-opname" data-name="${op}" maxlength="32" value="${esc(c.names[op] ?? def)}" title="Name auf dieser Karte" />`;
      const work = (key: 'sawmill' | 'mine', label: string, op: OperatorId) => `<div class="me-work"><label class="me-check"><input type="checkbox" data-f="${key}On"${c[key] !== null ? ' checked' : ''} /> ${label}</label>
        ${c[key] !== null ? `${name(op, OPERATORS[op].name)}${slider(`${key}X`, 'Lage', c[key]!, 8, MAP_W - 10, 1, `Spalte ${c[key]}`)}` : ''}</div>`;
      const line = (key: 'ln' | 'ls', label: string) => `<div class="me-work"><label class="me-check"><input type="checkbox" data-f="${key}"${c[key] ? ' checked' : ''} /> ${label}</label>${c[key] ? name(key, OPERATORS[key].name) : ''}</div>`;
      html = `<p class="co-hint">Straßen: Werkzeug „+ Straße“, dann in die Vorschau klicken (höchstens ${LIMITS.roads}). Das Sägewerk liegt nördlich, das Bergwerk südlich der Strecke.</p>
        <div class="me-roads">Straßen: ${c.roads.length ? c.roads.map((r) => `<span>Spalte ${r}</span>`).join(' ') : 'keine'}</div>
        ${work('sawmill', 'Sägewerk mit Ladegleis', 'sw')}
        ${work('mine', 'Bergwerk mit Ladegleis', 'mn')}
        ${line('ln', 'Fremdbahn Nord')}
        ${line('ls', 'Fremdbahn Süd')}`;
    } else if (this.tab === 'firmen') {
      html = this.companiesHtml(c);
    } else {
      const checks = checkMap(c, this.gridOf(c));
      html = `<div class="me-checks">${checks.map((x) => `<div class="me-ck ${x.level}"><i></i>${esc(x.text)}</div>`).join('')}</div>
        <p class="co-hint">Gespielt wird eine eigene Karte im freien Spiel – die Vorlage muss in der Kampagne freigespielt sein. Die Karte reist im Spielstand mit.</p>`;
    }
    $('me-body').innerHTML = head + html;
  }

  private renderTools() {
    const tools: [Tool, string, string][] = !this.cur() ? []
      : this.tab === 'land' ? [['move', 'Verschieben', 'Punkte ziehen, anklicken'], ['village', '+ Dorf', 'Dorf setzen'], ['lake', '+ See', 'See setzen'], ['river', '+ Fluss', 'Fluss (Nord–Süd) setzen'], ['del', 'Entfernen', 'Dorf, See oder Fluss anklicken']]
        : this.tab === 'strecke' ? [['move', 'Verschieben', 'Straßen und Werke ziehen'], ['road', '+ Straße', 'Straße quer zur Strecke'], ['del', 'Entfernen', 'Straße anklicken']] : [];
    $('me-tools').innerHTML = tools.map(([id, l, t]) => `<button class="btn${this.tool === id ? ' on' : ''}" data-tool="${id}" title="${t}">${l}</button>`).join('');
  }

  /** Vorschau: Gelände, Bäume, Häuser, Werke, Gleise, Straßen, Startgelände, bearbeitbare Punkte */
  private draw() {
    const cv = $('me-canvas') as HTMLCanvasElement;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const c = this.shown();
    const g = this.gridOf(c);
    const def = toMapDef(c);
    const ground = def.ground === 'sand' ? [216, 184, 120] : def.ground === 'snow' ? [228, 235, 244] : [108, 154, 60];
    const img = ctx.createImageData(MAP_W, MAP_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const k = g.key(x, y), cell = g.cells[k], t = g.terrain[k];
      let col = t === WATER ? [74, 127, 196] : t === ROCK ? [143, 136, 124] : ground;
      if (cell.building !== null) {
        const b = g.buildings.get(cell.building)!, d = BUILDINGS[b.key];
        col = b.key.startsWith('bld_mtn') || b.key.startsWith('bld_rock') ? [112, 104, 96] : d?.group === 'nature' ? [52, 96, 44] : d?.group === 'industry' ? [192, 57, 43] : [168, 122, 84];
      }
      if (cell.road) col = [150, 136, 112];
      if (cell.track || cell.piece !== null) {
        const op = g.foreignCells.get(k) as OperatorId | undefined;
        col = op ? hex(OPERATORS[op].color) : [40, 36, 32];
      }
      if (t === GRASS && (y === MAIN_ROW || y === SECOND_ROW) && !cell.track) col = col.map((v) => v * 0.9);
      const i = (y * MAP_W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    const off = document.createElement('canvas');
    off.width = MAP_W; off.height = MAP_H;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off, 0, 0, MAP_W * S, MAP_H * S);
    // Startgelände
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.strokeRect(START_AREA.x0 * S, START_AREA.y0 * S, (START_AREA.x1 - START_AREA.x0 + 1) * S, (START_AREA.y1 - START_AREA.y0 + 1) * S);
    ctx.setLineDash([]);
    if (!this.cur() || (this.tab !== 'land' && this.tab !== 'strecke')) return;
    // bearbeitbare Punkte
    const dot = (x: number, y: number, color: string, on: boolean) => {
      ctx.fillStyle = color; ctx.strokeStyle = on ? '#ffd23f' : '#1b1d2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x * S + 1, y * S + 1, on ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };
    const isSel = (kind: Hit['kind'], i: number) => this.selHit?.kind === kind && this.selHit.i === i;
    if (this.tab === 'land') {
      c.villages.forEach((v, i) => dot(v.x, v.y, '#d08a4a', isSel('village', i)));
      c.lakes.forEach((l, i) => dot(l.x, l.y, '#8fc3ff', isSel('lake', i)));
      c.rivers.forEach((r, i) => dot(r.x, 3, '#3c6fd0', isSel('river', i)));
    } else {
      c.roads.forEach((x, i) => dot(x, 3, '#e0c080', isSel('road', i)));
      if (c.sawmill !== null) dot(c.sawmill, SAW_Y, '#c0392b', false);
      if (c.mine !== null) dot(c.mine, MINE_Y, '#c0392b', false);
    }
  }

  // ------------------------------------------------------------ Vorschau bedienen
  private cellOf(e: MouseEvent) {
    const r = ($('me-canvas') as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(MAP_W - 1, Math.floor(((e.clientX - r.left) / r.width) * MAP_W))),
      y: Math.max(0, Math.min(MAP_H - 1, Math.floor(((e.clientY - r.top) / r.height) * MAP_H))),
    };
  }

  private hitAt(c: CustomMap, x: number, y: number): Hit | undefined {
    const near = (px: number, py: number, r = 3) => Math.abs(px - x) <= r && Math.abs(py - y) <= r;
    if (this.tab === 'land') {
      let i = c.villages.findIndex((v) => near(v.x, v.y)); if (i >= 0) return { kind: 'village', i };
      i = c.lakes.findIndex((l) => near(l.x, l.y, Math.max(3, Math.min(l.rx, l.ry)))); if (i >= 0) return { kind: 'lake', i };
      i = c.rivers.findIndex((r) => Math.abs(r.x - x) <= 3); if (i >= 0) return { kind: 'river', i };
    } else if (this.tab === 'strecke') {
      if (c.sawmill !== null && near(c.sawmill, SAW_Y, 4)) return { kind: 'sawmill', i: 0 };
      if (c.mine !== null && near(c.mine, MINE_Y, 4)) return { kind: 'mine', i: 0 };
      const i = c.roads.findIndex((r) => Math.abs(r - x) <= 1); if (i >= 0) return { kind: 'road', i };
    }
    return undefined;
  }

  private down(e: MouseEvent) {
    const c = this.cur();
    if (!c || (this.tab !== 'land' && this.tab !== 'strecke')) return;
    e.preventDefault();
    const { x, y } = this.cellOf(e);
    const hit = this.hitAt(c, x, y);
    if (this.tool === 'move') {
      this.drag = hit;
      this.selHit = hit && (hit.kind === 'lake' || hit.kind === 'river') ? hit : undefined;
      this.renderBody();
      this.draw();
      return;
    }
    if (this.tool === 'del') {
      if (!hit) return;
      if (hit.kind === 'village') c.villages.splice(hit.i, 1);
      if (hit.kind === 'lake') c.lakes.splice(hit.i, 1);
      if (hit.kind === 'river') c.rivers.splice(hit.i, 1);
      if (hit.kind === 'road') c.roads.splice(hit.i, 1);
      this.selHit = undefined;
      this.changed(true);
      return;
    }
    if (this.tool === 'village' && c.villages.length < LIMITS.villages) c.villages.push({ x, y });
    if (this.tool === 'lake' && c.lakes.length < LIMITS.lakes) { c.lakes.push({ x, y, rx: 6, ry: 3 }); this.selHit = { kind: 'lake', i: c.lakes.length - 1 }; }
    if (this.tool === 'river' && c.rivers.length < LIMITS.rivers) { c.rivers.push({ x, a: 4, b: 3, w: 1.2 }); this.selHit = { kind: 'river', i: c.rivers.length - 1 }; }
    if (this.tool === 'road' && c.roads.length < LIMITS.roads && x >= 2 && x <= MAP_W - 3 && !c.roads.includes(x)) c.roads.push(x);
    this.changed(true);
  }

  private move(e: MouseEvent) {
    const c = this.cur(), h = this.drag;
    if (!c || !h) return;
    const { x, y } = this.cellOf(e);
    if (h.kind === 'village') Object.assign(c.villages[h.i], { x, y });
    if (h.kind === 'lake') Object.assign(c.lakes[h.i], { x, y });
    if (h.kind === 'river') c.rivers[h.i].x = x;
    if (h.kind === 'road') c.roads[h.i] = Math.max(2, Math.min(MAP_W - 3, x));
    if (h.kind === 'sawmill') c.sawmill = Math.max(8, Math.min(MAP_W - 10, x));
    if (h.kind === 'mine') c.mine = Math.max(8, Math.min(MAP_W - 10, x));
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.draw(), 40);
  }

  // ------------------------------------------------------------ Formulare
  private input(e: Event) {
    const t = e.target as HTMLInputElement;
    const c = this.cur();
    if (!c) return;
    const f = t.dataset.f, v = t.value, n = Number(v);
    if (t.dataset.name) {
      const op = t.dataset.name as OperatorId;
      if (v.trim()) c.names[op] = plain(v, 32); else delete c.names[op];
      this.save();
      return;
    }
    if (t.dataset.cof) { this.companyInput(c, t, e.type); return; }
    if (!f) return;
    const label = (txt: string) => { const b = t.closest('.fs-row')?.querySelector('b'); if (b) b.textContent = txt; };
    const base = MAPS.find((m) => m.id === c.base);
    switch (f) {
      case 'name': c.name = plain(v, 32); this.save(); this.renderList(); return;
      case 'paper': c.paper = plain(v, 32); this.save(); return;
      case 'end0': c.ends[0] = plain(v, 20); this.save(); return;
      case 'end1': c.ends[1] = plain(v, 20); this.save(); return;
      case 'difficulty': c.difficulty = v as CustomMap['difficulty']; this.save(); return;
      case 'startMoney': c.startMoney = n; label(`${n.toLocaleString('de-AT')} €`); this.save(); return;
      case 'rain': c.weather.rain = n; label(`${Math.round(n * 100)} %`); this.save(); return;
      case 'snow': c.weather.snow = n; label(`${Math.round(n * 100)} %`); this.save(); return;
      case 'forests': c.forests = n; label(String(n)); break;
      case 'rocks': c.rocks = t.checked; break;
      case 'lakeRx': if (this.selHit?.kind === 'lake') { c.lakes[this.selHit.i].rx = n; label(String(n)); } break;
      case 'lakeRy': if (this.selHit?.kind === 'lake') { c.lakes[this.selHit.i].ry = n; label(String(n)); } break;
      case 'rivA': if (this.selHit?.kind === 'river') { c.rivers[this.selHit.i].a = n; c.rivers[this.selHit.i].b = Math.round(n * 0.6); label(String(n)); } break;
      case 'rivW': if (this.selHit?.kind === 'river') { c.rivers[this.selHit.i].w = n; label(n.toFixed(1)); } break;
      case 'sawmillOn': c.sawmill = t.checked ? base?.industries.find((i) => i.id === 'sawmill')?.x ?? 150 : null; this.changed(true); return;
      case 'mineOn': c.mine = t.checked ? base?.industries.find((i) => i.id === 'mine')?.x ?? 196 : null; this.changed(true); return;
      case 'sawmillX': c.sawmill = n; label(`Spalte ${n}`); break;
      case 'mineX': c.mine = n; label(`Spalte ${n}`); break;
      case 'ln': c.ln = t.checked; this.changed(true); return;
      case 'ls': c.ls = t.checked; this.changed(true); return;
    }
    this.changed();
  }

  private click(e: Event) {
    const b = (e.target as HTMLElement).closest('[data-act],[data-op],[data-coact],[data-co]') as HTMLElement | null;
    if (!b) return;
    const c = this.cur();
    const act = b.dataset.act;
    if (act === 'new') {
      const m = newMap(this.sel.slice(4));
      this.list.push(m); this.sel = m.id; this.tab = 'allg';
      this.save(); this.render(); return;
    }
    if (!c) return;
    if (act === 'copy') {
      const m: CustomMap = { ...structuredClone(c), id: newMap(c.base).id, name: `${c.name} (Kopie)`.slice(0, 32) };
      this.list.push(m); this.sel = m.id; this.save(); this.render(); return;
    }
    if (act === 'del') {
      if (!confirm(`Karte „${c.name}“ samt ihren Unternehmen wirklich löschen?`)) return;
      this.list = this.list.filter((m) => m !== c);
      this.sel = this.list[0]?.id ?? `tpl:${c.base}`;
      this.save(); this.render(); return;
    }
    if (act === 'seedT') { c.terrainSeed = 1 + Math.floor(Math.random() * 999_999); this.changed(); return; }
    if (act === 'seedL') { c.landscapeSeed = 1 + Math.floor(Math.random() * 999_999); this.changed(); return; }
    if (b.dataset.op) {
      // Unternehmen an/aus – fehlt eine Ausschreibung, meldet es „Prüfen“
      const id = b.dataset.op as OperatorId, off = new Set(c.off);
      if (off.has(id)) off.delete(id); else off.add(id);
      c.off = [...off];
      this.save(); this.renderBody(); return;
    }
    if (b.dataset.co) { this.coSel = b.dataset.co; this.renderBody(); return; }
    if (b.dataset.coact) this.companyAct(c, b.dataset.coact);
  }

  // ------------------------------------------------------------ Unternehmen der Karte
  private companiesHtml(c: CustomMap) {
    const def = toMapDef(c);
    const ids = [...new Set([...def.tenderRegio, ...def.tenderFreight, ...def.inquiries])].filter((id) => TEMPLATES.includes(id));
    const off = new Set(c.off);
    const rows = ids.map((id) => {
      const on = !off.has(id), mine = c.companies.filter((x) => x.base === id);
      const sel = mine.length ? `<select data-use="${id}" title="Eigenes Unternehmen auf diesem Platz"><option value="">Original</option>${mine.map((x) => `<option value="${x.id}"${c.use[id] === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : '';
      return `<div class="fs-op${on ? ' on' : ''}"><button class="btn" data-op="${id}" title="${on ? 'Spielt mit – anklicken zum Abwählen' : 'Spielt nicht mit'}">${on ? '✓' : '–'}</button>
        <span class="fs-op-dot" style="background:${OP_DEFAULTS[id].color}"></span><input class="me-opname" data-name="${id}" maxlength="32" value="${esc(c.names[id] ?? OP_DEFAULTS[id].name)}" title="${esc(OPERATORS[id].category)} – Name auf dieser Karte" />${sel}</div>`;
    }).join('');
    const cur = c.companies.find((x) => x.id === this.coSel);
    const item = (x: CustomCompany) => `<button class="co-item${x.id === this.coSel ? ' on' : ''}" data-co="${x.id}">${crest(x, 22)}<span><b>${esc(x.name)}</b><small>wie ${esc(OPERATORS[x.base].category)}</small></span></button>`;
    const opt = (sel: OperatorId) => TEMPLATES.map((id) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(OPERATORS[id].category)} (${esc(OP_DEFAULTS[id].name)})</option>`).join('');
    const form = cur ? `<div class="co-preview">${crest(cur, 44)}<div><b>${esc(cur.name)}</b><small>${esc(OPERATORS[cur.base].category)}</small>${cur.motto ? `<small><i>„${esc(cur.motto)}“</i></small>` : ''}</div></div>
        <label>Name<input data-cof="name" maxlength="32" value="${esc(cur.name)}" /></label>
        <div class="co-row"><label>Kürzel<input data-cof="short" maxlength="4" value="${esc(cur.short)}" /></label><label title="Lackierung der Züge und Farbe des Wappens">Farbe<input type="color" data-cof="color" value="${cur.color}" /></label></div>
        <label title="Züge, Antrieb und Zuggattung kommen von der Vorlage">Züge wie<select data-cof="base">${opt(cur.base)}</select></label>
        <label>Motto<input data-cof="motto" maxlength="60" value="${esc(cur.motto ?? '')}" /></label>
        <div class="co-rep"><div class="co-face">${portrait(cur.seed, 48)}<button class="btn" data-coact="dice" title="Anderes Gesicht">🎲</button></div>
          <div><label>Ansprechperson<input data-cof="rep" maxlength="40" value="${esc(cur.rep)}" /></label><label>Funktion<input data-cof="role" maxlength="30" value="${esc(cur.role)}" /></label></div></div>
        <div class="dc-btns"><button class="btn" data-coact="copy">Kopieren</button><button class="btn" data-coact="del">Löschen</button></div>` : '<p class="co-hint">Links ein Unternehmen wählen oder ein neues anlegen.</p>';
    return `<div class="co-sec">Wer auf dieser Karte fährt</div><div class="fs-ops me-ops">${rows}</div>
      <div class="co-sec">Eigene Unternehmen der Karte (${c.companies.length})</div>
      <div class="me-co"><div class="co-list">${c.companies.map(item).join('')}
        <div class="me-newco"><select id="me-newbase">${opt(TEMPLATES[0])}</select><button class="btn" data-coact="new">+ Neu</button></div></div>
        <div class="co-form">${form}</div></div>
      <p class="co-hint">Ein eigenes Unternehmen übernimmt Züge und Antrieb seiner Vorlage. Oben „Original“ durch ein eigenes ersetzen. Alte Unternehmens-Dateien: „Importieren“.</p>`;
  }

  private companyAct(c: CustomMap, act: string) {
    const cur = c.companies.find((x) => x.id === this.coSel);
    if (act === 'new') {
      const base = ((document.getElementById('me-newbase') as HTMLSelectElement | null)?.value || TEMPLATES[0]) as OperatorId;
      const n = newCompany(base);
      c.companies.push(n); this.coSel = n.id;
      if (!c.use[base]) c.use[base] = n.id;
    } else if (act === 'dice' && cur) cur.seed = Math.floor(Math.random() * 1e6);
    else if (act === 'copy' && cur) {
      const n = { ...cur, id: newCompany(cur.base).id, name: `${cur.name} (Kopie)`.slice(0, 32) };
      c.companies.push(n); this.coSel = n.id;
    } else if (act === 'del' && cur) {
      if (!confirm(`„${cur.name}“ wirklich löschen?`)) return;
      c.companies = c.companies.filter((x) => x !== cur);
      for (const [k, v] of Object.entries(c.use)) if (v === cur.id) delete c.use[k as OperatorId];
      this.coSel = c.companies[0]?.id ?? '';
    }
    this.save();
    this.renderBody();
    this.renderList();
  }

  private companyInput(c: CustomMap, t: HTMLInputElement, type: string) {
    const cur = c.companies.find((x) => x.id === this.coSel);
    const f = t.dataset.cof as keyof CustomCompany;
    if (!cur || !f) return;
    const v = plain(t.value, 60);
    if (f === 'base') {
      if (type !== 'change') return;
      for (const [k, id] of Object.entries(c.use)) if (id === cur.id) delete c.use[k as OperatorId];
      cur.base = v as OperatorId;
      this.save(); this.renderBody(); return;
    }
    (cur as unknown as Record<string, string>)[f] = f === 'short' ? v.slice(0, 4) : f === 'name' ? v.slice(0, 32) : v;
    this.save();
    if (f === 'color' && type === 'change') this.renderBody();
  }

  /** Auswahl „eigenes Unternehmen auf diesem Platz“ */
  private pickUse(t: HTMLSelectElement) {
    const c = this.cur();
    if (!c) return;
    const id = t.dataset.use as OperatorId;
    if (t.value) c.use[id] = t.value; else delete c.use[id];
    this.save();
  }
}
