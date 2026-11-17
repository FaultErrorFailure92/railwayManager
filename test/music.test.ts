import { describe, expect, it } from 'vitest';
import { compose, THEMES } from '../src/render/Music';
import { MAPS } from '../src/world/maps';

describe('Musik (RM-FR-UI-10)', () => {
  it('jede Karte hat ein eigenes Thema', () => {
    for (const m of MAPS) expect(THEMES[m.id]).toBeDefined();
    const sigs = MAPS.map((m) => compose(m.id).lead.slice(0, 12).map((n) => n.midi).join(','));
    expect(new Set(sigs).size).toBe(MAPS.length);
  });

  it('gleiche Karte = gleiche Melodie (fest ausgewürfelt)', () => {
    expect(compose('alpen')).toEqual(compose('alpen'));
  });

  it('ruhig und sangbar: mäßiges Tempo, kleine Sprünge, Schluss auf dem Grundton', () => {
    for (const m of MAPS) {
      const s = compose(m.id);
      expect(s.bpm).toBeLessThanOrEqual(140);
      const notes = s.lead;
      let big = 0;
      for (let i = 1; i < notes.length; i++) if (Math.abs(notes[i].midi - notes[i - 1].midi) > 7) big++;
      expect(big / notes.length).toBeLessThan(0.15);
      expect(notes.every((n) => n.at >= 0 && n.at + n.len <= s.steps)).toBe(true);
      expect((notes[notes.length - 1].midi - s.theme.root) % 12).toBe(0);
    }
  });
});
