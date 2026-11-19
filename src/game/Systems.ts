import type { Game } from './Game';
import { CHAPTERS } from './Profiles';
import { currentMap } from '../world/maps';

/** Ein Kapitel, ein neues System (RM-FR-CPX-01): in der Kampagne erst ab dem Kapitel sichtbar, das es einführt */
export type SystemId = 'connections' | 'faults' | 'staff' | 'dispo' | 'loan' | 'grants' | 'foreign';
export const SYSTEM_CHAPTER: Record<SystemId, string> = {
  connections: 'ebene', faults: 'schnee', staff: 'schnee', dispo: 'alpen', loan: 'wueste', grants: 'wueste', foreign: 'revier',
};

/** freies Spiel, Herausforderungen und der Demobahnhof zeigen immer alles */
export function systemOn(g: Pick<Game, 'mode'> & { demo?: boolean; freeCfg?: { noForeign?: boolean } }, s: SystemId, map = currentMap().id): boolean {
  // freies Spiel: Fremdbahnen lassen sich abschalten (RM-FR-CPX-07)
  if (s === 'foreign' && g.freeCfg?.noForeign) return false;
  if (g.mode !== 'campaign' || g.demo) return true;
  const cur = CHAPTERS.findIndex((c) => c.map === map);
  const at = CHAPTERS.findIndex((c) => c.map === SYSTEM_CHAPTER[s]);
  return cur < 0 || cur >= at;
}
