/**
 * Ausgabe des Spiels (RM-FR-STEAM-07): Vollversion oder kostenlose Web-Demo.
 * Demo bauen: `npm run build:demo` (setzt VITE_DEMO=1). Spielstände sind dieselben – Export in der Demo, Import in der Vollversion.
 */
export const DEMO = import.meta.env.VITE_DEMO === '1';
/** Steam-Seite (Platzhalter, bis die Seite online ist) */
export const STEAM_URL = 'https://store.steampowered.com/';
/** In der Demo spielbare Kapitel (Index in CHAPTERS) */
export const DEMO_CHAPTERS = 1;
/** Kapitel nur in der Vollversion? */
export const fullOnly = (chapterIdx: number) => DEMO && chapterIdx >= DEMO_CHAPTERS;
