/**
 * Einstellungen des Spielers (RM-FR-UI-09, RM-FR-UI-14). Liegen im Browser, nicht im Spielstand.
 */
export interface Settings {
  /** Größe der Oberfläche in Prozent (Spielfeld bleibt gleich) */
  uiScale: number;
  /** Lautstärke der Geräusche 0..100 */
  sfx: number;
  /** Lautstärke der Musik 0..100 (RM-FR-UI-10) */
  music: number;
  /** Bildlauf-Tempo mit Tastatur in Prozent */
  scroll: number;
  /** hoher Kontrast: hellere Nebentexte, kräftigere Ränder */
  contrast: boolean;
  /** kurze Bauanimationen (RM-FR-FEEL-02) */
  anim: boolean;
}

const KEY = 'rm_settings';
export const UI_SCALES = [75, 90, 100, 110, 125, 150, 175, 200];
/** Die Oberfläche soll mindestens so breit sein (in CSS-Pixeln), sonst passt die Titelleiste nicht mehr */
export const MIN_UI_WIDTH = 960;

const DEFAULTS: Settings = { uiScale: 100, sfx: 80, music: 40, scroll: 100, contrast: false, anim: true };

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      uiScale: clamp(s.uiScale, 50, 300, DEFAULTS.uiScale),
      sfx: clamp(s.sfx, 0, 100, DEFAULTS.sfx),
      music: clamp(s.music, 0, 100, DEFAULTS.music),
      scroll: clamp(s.scroll, 25, 300, DEFAULTS.scroll),
      contrast: typeof s.contrast === 'boolean' ? s.contrast : DEFAULTS.contrast,
      anim: typeof s.anim === 'boolean' ? s.anim : DEFAULTS.anim,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();
const listeners: (() => void)[] = [];

export function onSettings(f: () => void) { listeners.push(f); }

export function setSettings(p: Partial<Settings>) {
  Object.assign(settings, p);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* egal */ }
  applySettings();
  listeners.forEach((f) => f());
}

/** größte Oberflächengröße, die auf diesen Bildschirm passt */
export function maxUiScale() {
  return Math.max(75, Math.floor((window.innerWidth / MIN_UI_WIDTH) * 100));
}

/** tatsächlich verwendete Oberflächengröße (als Faktor) */
export function uiScale() {
  return Math.min(settings.uiScale, maxUiScale()) / 100;
}

/** Oberfläche skalieren und Kontrast setzen */
export function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--ui', String(uiScale()));
  root.classList.toggle('hi-contrast', settings.contrast);
}

/** Bildschirm-Koordinaten (z. B. Mausposition) in CSS-Pixel der skalierten Oberfläche */
export const toUi = (px: number) => px / uiScale();
/** Layout-Größe eines Oberflächen-Elements (offsetWidth) in Bildschirm-Pixel */
export const fromUi = (px: number) => px * uiScale();

if (typeof window !== 'undefined') window.addEventListener('resize', () => applySettings());
