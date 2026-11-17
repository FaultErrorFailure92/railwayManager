import { describe, expect, it } from 'vitest';
import { findTerm, LEXICON } from '../src/game/Lexicon';

describe('Bahn-ABC (RM-FR-CPX-06)', () => {
  it('jeder Begriff hat genau einen Satz', () => {
    for (const e of LEXICON) {
      expect(e.text.length).toBeGreaterThan(20);
      expect(e.text.replace(/[.!?]\s*$/, '').match(/[.!?]\s+[A-ZÄÖÜ]/g)?.length ?? 0, e.term).toBe(0);
    }
    expect(new Set(LEXICON.map((e) => e.term)).size).toBe(LEXICON.length);
  });
  it('findet Begriffe in Tooltip-Texten', () => {
    expect(findTerm('Signale, Oberleitung, Rangierbereiche und Gleismarkierungen')?.term).toBe('Signal');
    expect(findTerm('Remise, Werkstatt, Waschanlage und Abrollberg auf Gleise setzen')?.term).toBe('Remise');
    expect(findTerm('Speichern (F5 / Strg+S)')).toBeUndefined();
  });
});
