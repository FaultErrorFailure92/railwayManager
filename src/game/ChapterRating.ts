import type { Game } from './Game';
import { currentMap } from '../world/maps';

/** Richtzeit je Kapitel in Spieltagen */
export const CHAPTER_PAR_DAYS: Record<string, number> = { donau: 8, ebene: 6, revier: 7, schnee: 7, alpen: 7, wueste: 7, stadt: 9 };

/** Kapitel bewerten (RM-FR-MODE-04): 1 Stern fürs Schaffen, je 1 für Pünktlichkeit und Tempo */
export const PUNCT_STAR = 0.85;

export function chapterRating(g: Game, mapId = '') {
  const par = CHAPTER_PAR_DAYS[mapId || currentMap().id] ?? 8;
  const day = Math.floor(g.sim.time / 86400) + 1;
  const checks = [
    { label: 'Kapitel geschafft', ok: true },
    { label: `Pünktlichkeit mindestens ${Math.round(PUNCT_STAR * 100)} % (${Math.round(g.punctuality * 100)} %)`, ok: g.punctuality >= PUNCT_STAR },
    { label: `in höchstens ${par} Tagen (Tag ${day})`, ok: day <= par },
  ];
  return { stars: checks.filter((c) => c.ok).length, checks };
}
