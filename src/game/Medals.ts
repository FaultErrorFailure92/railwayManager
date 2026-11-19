import { ACHIEVEMENTS } from './Achievements';
import { CHALLENGES } from './Challenges';
import { CHAPTERS, listProfiles, updateProfile, type Profile } from './Profiles';

/**
 * Auszeichnungen in der Dienstakte (Stempel): alle Erfolge aus irgendeinem Spiel des Profils
 * plus Laufbahn-Auszeichnungen über alle Spiele (Kampagne, Herausforderungen, Dienstjahre).
 */
export type MedalKind = 'spiel' | 'laufbahn';
export interface Medal { id: string; name: string; info: string; kind: MedalKind; check?: (p: Profile) => boolean }

const st = (p: Profile, k: string) => p.stats?.[k] ?? 0;
const ready = CHAPTERS.filter((c) => c.ready);

export const CAREER: Medal[] = [
  { id: 'c-ch1', name: 'Eingeschult', info: 'Kapitel 1 der Kampagne geschafft', kind: 'laufbahn', check: (p) => p.chapters.includes('donau') },
  { id: 'c-ch3', name: 'Halbzeit', info: '3 Kapitel der Kampagne geschafft', kind: 'laufbahn', check: (p) => p.chapters.length >= 3 },
  { id: 'c-chall', name: 'Kampagnen-Veteran', info: 'Alle spielbaren Kapitel geschafft', kind: 'laufbahn', check: (p) => ready.every((c) => p.chapters.includes(c.map)) },
  { id: 'c-final', name: 'Großstadtlegende', info: 'Das Finale (Kapitel 7: Großstadt) geschafft', kind: 'laufbahn', check: (p) => p.chapters.includes('stadt') },
  { id: 'c-stars', name: 'Sternenregen', info: 'Ein Kapitel mit 3 Sternen', kind: 'laufbahn', check: (p) => Object.values(p.stars ?? {}).some((s) => s >= 3) },
  { id: 'c-stars-all', name: 'Musterschüler', info: 'Alle spielbaren Kapitel mit 3 Sternen', kind: 'laufbahn', check: (p) => ready.every((c) => (p.stars?.[c.map] ?? 0) >= 3) },
  { id: 'c-chal1', name: 'Mutprobe', info: 'Eine Herausforderung geschafft', kind: 'laufbahn', check: (p) => Object.keys(p.challenges ?? {}).length >= 1 },
  { id: 'c-chal-all', name: 'Allen Stürmen getrotzt', info: 'Alle festen Herausforderungen geschafft', kind: 'laufbahn', check: (p) => CHALLENGES.every((c) => p.challenges?.[c.id] !== undefined) },
  { id: 'c-daily7', name: 'Stammkunde', info: '7 tägliche Herausforderungen geschafft', kind: 'laufbahn', check: (p) => Object.keys(p.challenges ?? {}).filter((k) => k.startsWith('daily-')).length >= 7 },
  { id: 'c-games10', name: 'Wiederholungstäter', info: '10 Spiele begonnen', kind: 'laufbahn', check: (p) => st(p, 'games') >= 10 },
  { id: 'c-days100', name: 'Dienstjubiläum', info: '100 Tage im Dienst (alle Spiele)', kind: 'laufbahn', check: (p) => st(p, 'days') >= 100 },
  { id: 'c-pax1m', name: 'Eine Million Fahrgäste', info: '1 000 000 Fahrgäste über alle Spiele', kind: 'laufbahn', check: (p) => st(p, 'pax') >= 1e6 },
  { id: 'c-trains10k', name: 'Zehntausend Züge', info: '10 000 Züge abgefertigt über alle Spiele', kind: 'laufbahn', check: (p) => st(p, 'trains') >= 10000 },
  { id: 'c-melange', name: 'Kaffeehauskultur', info: '100 000 € Ladenumsatz über alle Spiele', kind: 'laufbahn', check: (p) => st(p, 'shop') >= 100000 },
];

/** alle Stempel in Anzeige-Reihenfolge */
export const ALL_MEDALS: Medal[] = [...CAREER, ...ACHIEVEMENTS.map((a): Medal => ({ id: a.id, name: a.name, info: a.info, kind: 'spiel' }))];

/** Erfolge des laufenden Spiels und Laufbahn-Auszeichnungen ins Profil übernehmen; liefert die neuen */
export function syncMedals(profileId: string | undefined, gameAchievements: string[] = []) {
  if (!profileId) return [];
  const p = listProfiles().find((x) => x.id === profileId);
  if (!p) return [];
  const have = { ...(p.medals ?? {}) };
  const fresh: Medal[] = [];
  const now = Date.now();
  for (const id of gameAchievements) if (!have[id]) { have[id] = now; const m = ALL_MEDALS.find((x) => x.id === id); if (m) fresh.push(m); }
  for (const m of CAREER) if (!have[m.id] && m.check!(p)) { have[m.id] = now; fresh.push(m); }
  if (fresh.length) updateProfile(profileId, { medals: have });
  return fresh;
}
