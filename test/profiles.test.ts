import { beforeEach, describe, expect, it } from 'vitest';
import { activeProfile, chapterOpen, CHAPTERS, completeChapter, createProfile, deleteProfile, listProfiles, mapOpen, setActive, updateProfile } from '../src/game/Profiles';
import { adoptSlots, deleteProfileSlots, listSlots, writeSlot } from '../src/game/storage';
import { applySetup, freeDefaults } from '../src/game/FreePlay';
import { Game } from '../src/game/Game';
import { flushLife, lifeLines } from '../src/game/Lifetime';

// kleiner Ersatz für den Browser-Speicher
class Mem { private m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
(globalThis as unknown as { localStorage: Mem }).localStorage = new Mem();
const pl = { name: 'Benni', title: 'Herr' as const, avatar: 2 };

describe('Profile (RM-FR-PROF-01/02)', () => {
  beforeEach(() => (globalThis as unknown as { localStorage: Mem }).localStorage.clear());

  it('anlegen, wechseln, bearbeiten, löschen', () => {
    const a = createProfile('Donaubahn AG', pl);
    const b = createProfile('Westbahn', { ...pl, name: 'Anna' });
    expect(listProfiles()).toHaveLength(2);
    expect(activeProfile()?.id).toBe(b.id);
    setActive(a.id);
    expect(activeProfile()?.company).toBe('Donaubahn AG');
    updateProfile(a.id, { company: 'Donau-Express' });
    expect(activeProfile()?.company).toBe('Donau-Express');
    deleteProfile(a.id);
    expect(listProfiles().map((p) => p.id)).toEqual([b.id]);
  });

  it('Kampagne: nur freigeschaltete Kapitel, Fortschritt im Profil, Karten fürs freie Spiel', () => {
    const p = createProfile('Test', pl);
    expect(chapterOpen(p, 0)).toBe(true);
    expect(chapterOpen(p, 1)).toBe(false);
    expect(mapOpen(p, 'donau')).toBe(true);
    expect(mapOpen(p, CHAPTERS[1].map)).toBe(false);
    expect(completeChapter(p.id, 'donau')).toBe(true);
    const q = activeProfile()!;
    expect(chapterOpen(q, 1)).toBe(true);
    expect(chapterOpen(q, 2)).toBe(false);
    expect(mapOpen(q, CHAPTERS[1].map)).toBe(true);
    expect(completeChapter(p.id, 'donau')).toBe(false);
  });

  it('Spielstände gehören zum Profil; alte Stände werden übernommen', () => {
    const g = new Game();
    g.company = 'Alt';
    writeSlot('alter Stand', false, g.save());
    const p = createProfile('Alt', pl);
    expect(listSlots(p.id)).toHaveLength(0);
    adoptSlots(p.id);
    expect(listSlots(p.id)).toHaveLength(1);
    g.profileId = p.id;
    writeSlot('neu', false, g.save());
    const other = createProfile('Andere', pl);
    expect(listSlots(other.id)).toHaveLength(0);
    deleteProfileSlots(p.id);
    expect(listSlots(p.id)).toHaveLength(0);
  });

  it('neues Spiel übernimmt Firma und Spieler aus dem Profil, freies Spiel die Regler', () => {
    const p = createProfile('Profilbahn', pl);
    const g = new Game();
    const cfg = { ...freeDefaults('donau', 4000), money: 20000, debt: 100000, ext: 0, growth: 'instant' as const };
    applySetup(g, { mode: 'free', map: 'donau', profileId: p.id, company: p.company, player: p.player, cfg });
    expect(g.company).toBe('Profilbahn');
    expect(g.player.name).toBe('Benni');
    expect(g.money).toBe(20000);
    expect(g.debtLimit).toBe(-100000);
    expect(g.sim.extDelayChance).toBe(0);
    expect(g.mode).toBe('free');
    const loaded = new Game(JSON.parse(JSON.stringify(g.save())));
    expect(loaded.freeCfg?.money).toBe(20000);
    expect(loaded.profileId).toBe(p.id);
  });

  it('Dienstakte: Werte aus allen Spielen landen im Profil, Startgeld zählt nicht', () => {
    const p = createProfile('Statistikbahn', pl);
    const g = new Game();
    applySetup(g, { mode: 'campaign', map: 'donau', profileId: p.id, company: p.company, player: p.player, tutorial: true });
    g.money -= 1500;
    g.money += 400;
    g.bump('pax', 1234);
    flushLife(g);
    flushLife(g); // doppelt übertragen darf nichts doppelt zählen
    const st = activeProfile()!.stats!;
    expect(st.games).toBe(1);
    expect(st.spent).toBe(1500);
    expect(st.earned).toBe(400);
    expect(st.pax).toBe(1234);
    expect(lifeLines(activeProfile()!).find((l) => l.label.includes('verschleudert'))?.value).toContain('1');
  });
});
