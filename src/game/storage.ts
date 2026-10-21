import type { GameSave } from './Game';

const KEY = 'railway_manager_save_v4';

/** wird bei „Neues Spiel“ gesetzt, damit beim Neuladen nicht wieder gespeichert wird */
export const saveState = { disabled: false };

export function loadSave(): GameSave | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as GameSave;
    return s.v === 4 ? s : undefined;
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
