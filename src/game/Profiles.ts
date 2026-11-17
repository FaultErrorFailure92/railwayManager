/**
 * Spielerprofile (RM-FR-PROF-01/02): Firma + Spieler, Kampagnen-Fortschritt, freigespielte Karten.
 * Liegen im Browser (localStorage). Spielstände tragen die Profil-Id (storage.ts).
 */
export interface Player { name: string; title: '' | 'Frau' | 'Herr'; avatar: number }

export interface Profile {
  id: string;
  company: string;
  player: Player;
  /** abgeschlossene Kampagnen-Kapitel (Karten-Ids) */
  chapters: string[];
  created: number;
  /** Lebenszeit-Statistik über alle Spiele (RM-FR-PROF-03) */
  stats?: Record<string, number>;
  /** beste Bewertung je Kapitel, 1–3 Sterne (RM-FR-MODE-04) */
  stars?: Record<string, number>;
  /** Herausforderungen: Bestzeit in Minuten (RM-FR-MODE-08) */
  challenges?: Record<string, number>;
}

const KEY = 'rm_profiles';
const ACTIVE = 'rm_profile';

/** Kampagnen-Kapitel in fester Reihenfolge (RM-FR-MODE-02); ready = spielbare Inhalte vorhanden */
export const CHAPTERS: { map: string; title: string; topic: string; ready: boolean }[] = [
  { map: 'donau', title: 'Donautal', topic: 'Einstieg: der erste Bahnhof', ready: true },
  { map: 'ebene', title: 'Pannonische Ebene', topic: 'Güter und Takt', ready: true },
  { map: 'revier', title: 'Industrierevier', topic: 'Betriebe und Rangieren', ready: false },
  { map: 'schnee', title: 'Schneeland', topic: 'Wetter und Störungen', ready: false },
  { map: 'alpen', title: 'Alpenbahn', topic: 'Berge und Tunnel', ready: false },
  { map: 'wueste', title: 'Wüstenbahn', topic: 'Schnellverkehr, lange Strecken', ready: false },
  { map: 'stadt', title: 'Großstadt', topic: 'Finale', ready: false },
];

function read(): Profile[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Profile[]; } catch { return []; }
}
function write(list: Profile[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* voll */ }
}

export function listProfiles() { return read().sort((a, b) => a.created - b.created); }

export function activeProfile(): Profile | undefined {
  const list = read();
  let id: string | null = null;
  try { id = localStorage.getItem(ACTIVE); } catch { /* egal */ }
  return list.find((p) => p.id === id) ?? list[0];
}

export function setActive(id: string) {
  try { localStorage.setItem(ACTIVE, id); } catch { /* egal */ }
}

export function createProfile(company: string, player: Player): Profile {
  const p: Profile = { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, company: company.trim() || 'Meine Bahn AG', player, chapters: [], created: Date.now() };
  write([...read(), p]);
  setActive(p.id);
  return p;
}

export function updateProfile(id: string, patch: Partial<Pick<Profile, 'company' | 'player' | 'chapters' | 'stars' | 'challenges'>>) {
  const list = read();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  if (patch.company !== undefined) p.company = patch.company.trim() || p.company;
  write(list);
}

export function deleteProfile(id: string) {
  write(read().filter((p) => p.id !== id));
  try { if (localStorage.getItem(ACTIVE) === id) localStorage.removeItem(ACTIVE); } catch { /* egal */ }
}

/** Kapitel i spielbar? Erstes immer, sonst wenn das vorige geschafft ist */
export function chapterOpen(p: Profile | undefined, i: number) {
  if (i === 0) return true;
  return !!p && p.chapters.includes(CHAPTERS[i - 1].map);
}

/** Karte im freien Spiel wählbar (RM-FR-MODE-09): erste immer, sonst wenn das Kapitel davor geschafft ist */
export function mapOpen(p: Profile | undefined, mapId: string) {
  const i = CHAPTERS.findIndex((c) => c.map === mapId);
  if (i <= 0) return true;
  return chapterOpen(p, i);
}

/** Kapitel abgeschlossen: im Profil merken (schaltet das nächste Kapitel und dessen Karte frei) */
export function completeChapter(profileId: string | undefined, mapId: string, stars = 1) {
  if (!profileId) return false;
  const p = read().find((x) => x.id === profileId);
  if (!p) return false;
  const best = Math.max(stars, p.stars?.[mapId] ?? 0);
  const fresh = !p.chapters.includes(mapId);
  updateProfile(profileId, { chapters: fresh ? [...p.chapters, mapId] : p.chapters, stars: { ...(p.stars ?? {}), [mapId]: best } });
  return fresh;
}

/** Sterne eines Kapitels als HTML (leer, wenn noch nicht geschafft) */
export function chapterStars(p: Profile | undefined, mapId: string) {
  const n = p?.stars?.[mapId] ?? (p?.chapters.includes(mapId) ? 1 : 0);
  if (!n) return '';
  return `<span class="cp-stars" title="${n}/3 Sterne – mehr Sterne: pünktlicher und schneller">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;
}

/** Zähler eines Spiels ins Profil übernehmen (Summen; maxMoney/minMoney als Rekorde) */
export function addStats(profileId: string | undefined, delta: Record<string, number>, max?: number, min?: number) {
  if (!profileId) return;
  const list = read();
  const p = list.find((x) => x.id === profileId);
  if (!p) return;
  const st = (p.stats ??= {});
  for (const [k, v] of Object.entries(delta)) if (v) st[k] = (st[k] ?? 0) + v;
  if (max !== undefined && Number.isFinite(max)) st.maxMoney = Math.max(st.maxMoney ?? -Infinity, max);
  if (min !== undefined && Number.isFinite(min)) st.minMoney = Math.min(st.minMoney ?? Infinity, min);
  write(list);
}
