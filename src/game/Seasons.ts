import type { Operator } from '../sim/Operators';

/** Jahreszeiten (RM-FR-EVT-10): je 7 Spieltage, mit eigenem Farbton, Wetter und Verkehr */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_DAYS = 7;
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAME: Record<Season, string> = { spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
export const SEASON_ICON: Record<Season, string> = { spring: '❀', summer: '☀', autumn: '❦', winter: '❄' };

/** Jahreszeit an einem Spieltag (0-basiert); das Spiel beginnt im Frühling */
export function seasonOf(day: number): Season { return SEASONS[Math.floor(Math.max(0, day) / SEASON_DAYS) % 4]; }

/** Farbton über dem Spielfeld (CSS-Filter) */
export const SEASON_FILTER: Record<Season, string> = {
  spring: 'saturate(1.12)',
  summer: 'saturate(1.06) brightness(1.03)',
  autumn: 'sepia(0.28) hue-rotate(-12deg) saturate(1.1)',
  winter: 'saturate(0.6) brightness(1.07) contrast(0.96)',
};

/** Wetter: Regen- und Schneewahrscheinlichkeit der Karte je Jahreszeit anpassen */
export function seasonWeather(s: Season, base: { rain: number; snow: number }) {
  switch (s) {
    case 'summer': return { rain: base.rain * 0.6, snow: 0 };
    case 'autumn': return { rain: Math.min(0.6, base.rain * 1.5), snow: base.snow * 0.3 };
    case 'winter': return { rain: base.rain * 0.5, snow: Math.min(0.6, base.snow * 3 + 0.08) };
    default: return { rain: base.rain, snow: base.snow * 0.3 };
  }
}

/** Fahrgäste: Ausflugsverkehr im Sommer, Museumsbahn vor allem dann, weniger im Winter */
export function seasonPax(s: Season, op: Operator) {
  if (s === 'summer') return op.id === 'dm' ? 1.4 : op.kind === 'regio' || op.kind === 'sbahn' || op.kind === 'ic' ? 1.15 : 1;
  if (s === 'winter') return op.id === 'dm' ? 0.6 : 0.95;
  if (s === 'autumn') return 1;
  return 1.05;
}

export const SEASON_NEWS: Record<Season, string> = {
  spring: 'Der Frühling ist da: Die Bäume blühen, die Pendler lächeln wieder.',
  summer: 'Sommer! Ausflügler stürmen die Züge – Regionalbahnen und Fernzüge sind voller, die Museumsbahn sowieso.',
  autumn: 'Herbst: Laub auf den Gleisen, Regen und Nebel. Pünktlichkeit wird zur Kunst.',
  winter: 'Winter: Schnee und Eis. Wer keine Weichenheizung hat, fährt langsamer.',
};
