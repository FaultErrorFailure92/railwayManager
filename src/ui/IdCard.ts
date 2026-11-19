import type { Player } from '../game/Profiles';
import { avatar, AVATARS } from './portrait';

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Ausweisnummer aus der Profil-ID (immer gleich für dasselbe Profil) */
export function idNumber(id: string) {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `BM-${String(h % 100000).padStart(5, '0')}-${'ABCDEFGHJKLMNPRSTUVWXYZ'[h % 23]}`;
}

export interface IdCardData { company: string; player: Player; id?: string; created?: number }

/**
 * Dienstausweis als Plastikkarte. Mit edit = true sind Firma, Anrede, Name und Lichtbild direkt auf der Karte änderbar
 * (Felder ob-company, ob-title, ob-name; Lichtbild über data-av und data-ob="av-prev/av-next").
 */
export function idCard(d: IdCardData, edit = false) {
  const who = [d.player.title, d.player.name].filter(Boolean).join(' ') || 'Betriebsleitung';
  const date = new Date(d.created ?? Date.now()).toLocaleDateString('de-AT');
  const no = d.id ? idNumber(d.id) : 'wird vergeben';
  const n = AVATARS.length, av = d.player.avatar;
  const photo = edit
    ? `<div class="idc-photo edit">${avatar(av, 84)}<span class="idc-flip"><button type="button" data-ob="av-prev" title="anderes Lichtbild">◀</button><button type="button" data-ob="av-next" title="anderes Lichtbild">▶</button></span></div>`
    : `<div class="idc-photo">${avatar(av, 84)}</div>`;
  const company = edit
    ? `<span class="idc-in"><input id="ob-company" maxlength="28" value="${esc(d.company)}" placeholder="Firma" /><button type="button" data-ob="dice" title="Namen würfeln">🎲</button></span>`
    : `<b>${esc(d.company)}</b>`;
  const name = edit
    ? `<span class="idc-in"><select id="ob-title"><option value="">–</option><option value="Frau"${d.player.title === 'Frau' ? ' selected' : ''}>Frau</option><option value="Herr"${d.player.title === 'Herr' ? ' selected' : ''}>Herr</option></select><input id="ob-name" maxlength="24" placeholder="Dein Name" value="${esc(d.player.name)}" /></span>`
    : `<b class="idc-name">${esc(who)}</b>`;
  const card = `<div class="idcard${edit ? ' edit' : ''}">
    <div class="idc-band"><span class="idc-logo"><i></i></span><span>DIENSTAUSWEIS</span><small>Bahnhofsmanager · Betriebsleitung</small></div>
    <div class="idc-body">${photo}
      <div class="idc-fields">
        <label><small>Name</small>${name}</label>
        <label><small>Dienststelle</small>${company}</label>
        <div class="idc-row"><label><small>Ausweis-Nr.</small><b class="idc-mono">${no}</b></label><label><small>Gültig ab</small><b class="idc-mono">${date}</b></label></div>
      </div>
      <span class="idc-chip"></span><span class="idc-holo"></span>
    </div>
    <div class="idc-foot"><span class="idc-sign">${esc(d.player.name)}</span><small>Unterschrift</small><small class="idc-valid">gültig bis: Pension</small></div>
  </div>`;
  if (!edit) return card;
  const thumbs = AVATARS.map((_, i) => `<button type="button" class="pl-av${i === av ? ' on' : ''}" data-av="${i}" title="Lichtbild ${i + 1} von ${n}">${avatar(i, 28)}</button>`).join('');
  return `${card}<div class="idc-pick">${thumbs}</div>`;
}
