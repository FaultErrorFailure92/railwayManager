import type { GameSave } from './Game';
import { versionOf, versionProblem } from './saveFile';
import { decodeSave, encodeSave } from './saveCodec';

const KEY = 'railway_manager_save_v4';
const BROKEN = 'railway_manager_broken_last';

/** wird bei „Neues Spiel“ gesetzt, damit beim Neuladen nicht wieder gespeichert wird */
export const saveState = { disabled: false };

export function loadSave(): GameSave | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const s = decodeSave(JSON.parse(raw)) as GameSave;
    const problem = versionProblem(versionOf(s));
    if (!problem) return s;
    // nicht wegwerfen: sonst überschreibt das nächste Autosave den Stand (RM-FR-SAVE-02)
    backupBroken(raw, problem);
    return undefined;
  } catch {
    return undefined;
  }
}

/** kleine Prüfsumme, damit derselbe defekte Stand nur einmal gesichert wird */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Spielstand, der nicht geladen werden kann, als eigenen Slot aufheben (zum Exportieren / für Fehlerberichte) */
export function backupBroken(raw: string, reason: string) {
  try {
    const h = hash(raw);
    if (localStorage.getItem(BROKEN) === h) return;
    let s: GameSave;
    try { s = decodeSave(JSON.parse(raw)) as GameSave; } catch { return; }
    if (writeSlot(`⚠ Nicht geladen: ${reason}`.slice(0, 80), false, s)) localStorage.setItem(BROKEN, h);
  } catch { /* egal */ }
}

/** aktueller Spielstand als Text (für Notfälle) */
export function rawSave(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function writeSave(s: GameSave): boolean {
  if (saveState.disabled) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(encodeSave(s)));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

// ------------------------------------------------------------ Spielstände (mehrere Slots)
const SLOTS = 'railway_manager_slots';
const SLOT = (id: string) => `railway_manager_slot_${id}`;
const MAX_MANUAL = 10, MAX_AUTO = 6;

export interface SlotInfo {
  id: string;
  label: string;
  auto: boolean;
  /** echte Uhrzeit des Speicherns */
  saved: number;
  gameTime: number;
  company: string;
  money: number;
  /** Spielerprofil (RM-FR-PROF-01) */
  profile?: string;
}

/** Spielstände – mit Profil: nur die dieses Profils */
export function listSlots(profile?: string): SlotInfo[] {
  try {
    const all = (JSON.parse(localStorage.getItem(SLOTS) ?? '[]') as SlotInfo[]).sort((a, b) => b.saved - a.saved);
    return profile === undefined ? all : all.filter((x) => x.profile === profile);
  } catch {
    return [];
  }
}

function writeIndex(list: SlotInfo[]) {
  localStorage.setItem(SLOTS, JSON.stringify(list));
}

/** neuen Spielstand anlegen; alte Autosaves/Stände fallen raus, wenn es zu viele sind */
export function writeSlot(label: string, auto: boolean, s: GameSave): boolean {
  try {
    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    let list = listSlots();
    const same = list.filter((x) => x.auto === auto && x.profile === s.profileId);
    for (const old of same.slice(auto ? MAX_AUTO - 1 : MAX_MANUAL - 1)) {
      localStorage.removeItem(SLOT(old.id));
      list = list.filter((x) => x.id !== old.id);
    }
    localStorage.setItem(SLOT(id), JSON.stringify(encodeSave(s)));
    list.push({ id, label, auto, saved: Date.now(), gameTime: Number(s.sim?.time) || 0, company: String(s.company ?? ''), money: Number(s.money) || 0, profile: s.profileId });
    writeIndex(list);
    return true;
  } catch {
    return false;
  }
}

/** alte Spielstände ohne Profil einem Profil zuordnen (Update auf Profile) */
export function adoptSlots(profile: string) {
  try { writeIndex(listSlots().map((x) => (x.profile ? x : { ...x, profile }))); } catch { /* egal */ }
}

/** alle Spielstände eines Profils löschen */
export function deleteProfileSlots(profile: string) {
  for (const x of listSlots(profile)) deleteSlot(x.id);
}

export function deleteSlot(id: string) {
  try {
    localStorage.removeItem(SLOT(id));
    writeIndex(listSlots().filter((x) => x.id !== id));
  } catch { /* egal */ }
}

/** Spielstand zum aktuellen machen (danach Seite neu laden) */
export function activateSlot(id: string): boolean {
  try {
    const raw = localStorage.getItem(SLOT(id));
    if (!raw) return false;
    localStorage.setItem(KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** Spielstand eines Slots lesen (z. B. zum Exportieren) */
export function readSlot(id: string): GameSave | undefined {
  try {
    const raw = localStorage.getItem(SLOT(id));
    return raw ? (decodeSave(JSON.parse(raw)) as GameSave) : undefined;
  } catch {
    return undefined;
  }
}

/** geprüften, importierten Spielstand als Slot ablegen und zum aktuellen machen (danach Seite neu laden) */
export function importSave(s: GameSave, label: string): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(encodeSave(s)));
  } catch {
    return false;
  }
  writeSlot(label, false, s);
  return true;
}
