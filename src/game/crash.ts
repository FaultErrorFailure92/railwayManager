/**
 * Absturzsicherung (RM-FR-CRASH-01): Bei einem Fehler wird der Spielstand automatisch gesichert
 * und der Spieler kann einen Fehlerbericht mit Spielstand als Datei speichern.
 */
import type { GameSave } from './Game';
import { VERSION } from './changelog';
import { download } from './saveFile';
import { rawSave, writeSlot } from './storage';
import { decodeSave } from './saveCodec';

export interface ErrorInfo { time: string; message: string; stack?: string; source?: string }

const MAX_ERRORS = 20;
/** höchstens eine Notsicherung pro Minute */
const SAVE_GAP = 60_000;

const errors: ErrorInfo[] = [];
let lastSave = 0;
let getSave: () => GameSave | undefined = () => undefined;
let onCrash: (saved: boolean) => void = () => {};

/** Fehler von außen melden (z. B. Spielstand ließ sich nicht laden) */
export function reportError(e: unknown, source?: string) {
  const err = e instanceof Error ? e : new Error(String(e));
  errors.push({ time: new Date().toISOString(), message: err.message || String(e), stack: err.stack, source });
  if (errors.length > MAX_ERRORS) errors.shift();
}

export const hasErrors = () => errors.length > 0;

/** Spielstand sichern, ohne dass ein weiterer Fehler alles kaputt macht */
function emergencySave(): boolean {
  const now = Date.now();
  if (now - lastSave < SAVE_GAP) return true;
  let s: GameSave | undefined;
  try {
    s = getSave();
  } catch (e) {
    reportError(e, 'Notsicherung');
  }
  if (!s) return false;
  const ok = writeSlot(`Notsicherung · ${new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`, true, s);
  if (ok) lastSave = now;
  return ok;
}

function handle(e: unknown, source: string) {
  reportError(e, source);
  const saved = emergencySave();
  try { onCrash(saved); } catch { /* Anzeige darf nicht selbst abstürzen */ }
}

/** Fehlerbericht als Datei: Fehler, Umgebung und Spielstand */
export function downloadReport() {
  let save: unknown;
  try { save = getSave(); } catch { /* unten Ersatz */ }
  if (!save) {
    const raw = rawSave();
    try { save = raw ? decodeSave(JSON.parse(raw)) : undefined; } catch { save = raw; }
  }
  const report = {
    kind: 'railway-manager-report',
    app: VERSION,
    created: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    errors,
    save,
  };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  download(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }), `Fehlerbericht_${stamp}.json`);
}

/** Fehler im ganzen Spiel abfangen */
export function installCrashGuard(save: () => GameSave | undefined, show: (saved: boolean) => void) {
  getSave = save;
  onCrash = show;
  window.addEventListener('error', (ev) => {
    // Ladefehler von Bildern und fremde Skripte („Script error.“) haben kein error-Objekt und sind kein Absturz
    if (!ev.error) return;
    handle(ev.error, 'error');
  });
  window.addEventListener('unhandledrejection', (ev) => handle(ev.reason, 'promise'));
}
