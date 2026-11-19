import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { applySetup } from '../src/game/FreePlay';
import { CHAPTER2_MISSIONS } from '../src/game/Chapter2';
import { CHAPTER_MISSIONS } from '../src/game/Chapters';
import { MISSIONS } from '../src/game/Missions';
import { chapterRating } from '../src/game/ChapterRating';
import { CHAPTERS } from '../src/game/Profiles';
import { setMap } from '../src/world/maps';
import { seedRandom } from './helpers';

describe('Kapitel 2 und Kapitel-Bewertung (RM-FR-MODE-02/04)', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedRandom(4); });
  afterEach(() => { restore(); setMap(undefined); });

  it('Kapitel 2 ist spielbar, startet mit eigenen Aufträgen und allen Donautal-Werkzeugen', () => {
    expect(CHAPTERS[1].ready).toBe(true);
    setMap('ebene');
    const g = new Game();
    applySetup(g, { mode: 'campaign', map: 'ebene', profileId: '', company: 'Test', player: { name: 'B', title: '', avatar: 1 }, tutorial: false });
    expect(g.missions).toBe(CHAPTER2_MISSIONS);
    expect(g.mission?.title).toBe(CHAPTER2_MISSIONS[0].title);
    for (const m of MISSIONS) for (const u of m.unlock) expect(g.unlocked.has(u)).toBe(true);
    expect(g.missionInfo().total).toBe(CHAPTER2_MISSIONS.length);
    expect(g.uiEvents.some((e) => e.type === 'letter' && /Kapitel 2/.test(e.title))).toBe(true);
    // Fortschritt startet bei 0
    expect(g.missionInfo().value).toBe(0);
  });

  it('Bewertung: 1 Stern fürs Schaffen, je einer für Pünktlichkeit und Tempo', () => {
    const g = new Game();
    g.startMission();
    g.stats.handled = 100; g.stats.punctual = 95;
    expect(chapterRating(g, 'donau').stars).toBe(3);
    g.stats.punctual = 50;
    expect(chapterRating(g, 'donau').stars).toBe(2);
    g.sim.time = 20 * 86400;
    expect(chapterRating(g, 'donau').stars).toBe(1);
  });
});

describe('Kapitel 3–7 (RM-FR-MODE-02)', () => {
  afterEach(() => setMap(undefined));
  for (const map of ['revier', 'schnee', 'alpen', 'wueste', 'stadt']) {
    it(`${map}: spielbar mit eigenen Aufträgen`, () => {
      const i = CHAPTERS.findIndex((c) => c.map === map);
      expect(CHAPTERS[i].ready).toBe(true);
      setMap(map);
      const g = new Game();
      applySetup(g, { mode: 'campaign', map, profileId: '', company: 'Test', player: { name: 'B', title: '', avatar: 1 }, tutorial: false });
      expect(g.missions).toBe(CHAPTER_MISSIONS[map]);
      expect(g.missions.length).toBe(5);
      expect(g.mission?.title).toBe('Ankommen');
      expect(g.uiEvents.some((e) => e.type === 'letter' && e.title.startsWith(`Kapitel ${i + 1}`))).toBe(true);
      // jeder Auftrag liefert Fortschritt und Checkliste ohne Fehler
      for (const m of g.missions) {
        const p = m.progress(g.stats, g.stats, g);
        expect(p.value).toBeLessThan(1);
        m.checks?.(g, g.stats, g.stats);
      }
    });
  }
});
