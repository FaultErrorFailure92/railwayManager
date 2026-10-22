import type { GameSave } from './Game';

const KEY = 'railway_manager_save_v4';

/** wird bei „Neues Spiel“ gesetzt, damit beim Neuladen nicht wieder gespeichert wird */
export const saveState = { disabled: false };

export function loadSave(): GameSave | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as GameSave;
    return s.v === 4 || s.v === 5 ? s : undefined;
  } catch {
    return undefined;
  }
}

export function writeSave(s: GameSave): boolean {
  if (saveState.disabled) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
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
}

export function listSlots(): SlotInfo[] {
  try {
    return (JSON.parse(localStorage.getItem(SLOTS) ?? '[]') as SlotInfo[]).sort((a, b) => b.saved - a.saved);
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
    const same = list.filter((x) => x.auto === auto);
    for (const old of same.slice(auto ? MAX_AUTO - 1 : MAX_MANUAL - 1)) {
      localStorage.removeItem(SLOT(old.id));
      list = list.filter((x) => x.id !== old.id);
    }
    localStorage.setItem(SLOT(id), JSON.stringify(s));
    list.push({ id, label, auto, saved: Date.now(), gameTime: s.sim.time, company: s.company, money: s.money });
    writeIndex(list);
    return true;
  } catch {
    return false;
  }
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
