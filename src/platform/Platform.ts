/**
 * Plattform (RM-FR-PLAT-02, RM-FR-STEAM-03/04): Browser oder Desktop-App (Tauri).
 * Im Browser tut hier nichts etwas. In der Desktop-App:
 * - Spielstände, Profile und Einstellungen liegen zusätzlich als Datei im App-Ordner – Steam Auto-Cloud gleicht sie ab (kein eigenes Konto nötig)
 * - Erfolge gehen zusätzlich an Steam (nur im Build mit Steam-Anbindung)
 */
type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Tauri stellt `invoke` global bereit (withGlobalTauri) – kein npm-Paket nötig */
function tauri(): Invoke | undefined {
  return (globalThis as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke;
}

export const isDesktop = () => !!tauri();

/** diese Schlüssel im Browser-Speicher gehören zum Spielstand */
const PREFIXES = ['railway_manager', 'rm_'];
const SYNC_AT = 'rm_sync_at';

export interface StoreFile { v: 1; at: number; keys: Record<string, string> }

function ours(k: string) { return k !== SYNC_AT && PREFIXES.some((p) => k.startsWith(p)); }

/** alle Spielstand-Schlüssel aus dem Browser-Speicher */
export function snapshot(ls: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i)!;
    if (ours(k)) out[k] = ls.getItem(k)!;
  }
  return out;
}

/** Datei übernehmen, wenn sie neuer ist als der Browser-Speicher (z. B. von Steam Cloud auf einen anderen Rechner gebracht) */
export function applyStore(f: StoreFile, ls: Storage = localStorage): boolean {
  if (f?.v !== 1 || !f.keys || !(f.at > Number(ls.getItem(SYNC_AT) ?? 0))) return false;
  const old: string[] = [];
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i)!; if (ours(k)) old.push(k); }
  old.forEach((k) => ls.removeItem(k));
  for (const [k, v] of Object.entries(f.keys)) if (ours(k) && typeof v === 'string') ls.setItem(k, v);
  ls.setItem(SYNC_AT, String(f.at));
  return true;
}

let lastPushed = '';

/** Browser-Speicher in die Datei schreiben (nur bei Änderungen) */
export async function pushStore(): Promise<void> {
  const inv = tauri();
  if (!inv) return;
  try {
    const keys = snapshot();
    const sig = JSON.stringify(keys);
    if (sig === lastPushed) return;
    const at = Date.now();
    await inv('store_write', { data: JSON.stringify({ v: 1, at, keys } satisfies StoreFile) });
    localStorage.setItem(SYNC_AT, String(at));
    lastPushed = sig;
  } catch (e) {
    console.warn('Spielstand-Datei nicht geschrieben', e);
  }
}

/** beim Start: neuere Datei übernehmen */
export async function pullStore(): Promise<boolean> {
  const inv = tauri();
  if (!inv) return false;
  try {
    const raw = await inv('store_read') as string | null;
    return !!raw && applyStore(JSON.parse(raw) as StoreFile);
  } catch (e) {
    console.warn('Spielstand-Datei nicht gelesen', e);
    return false;
  }
}

/** Erfolg auch an Steam melden (doppelt melden schadet nicht) */
export function unlockAchievement(id: string) {
  tauri()?.('steam_unlock', { id }).catch(() => { /* ohne Steam egal */ });
}

/** Rich Presence (RM-FR-STEAM-05): was gerade gespielt wird */
export function setPresence(text: string) {
  tauri()?.('steam_presence', { text }).catch(() => { /* ohne Steam egal */ });
}
