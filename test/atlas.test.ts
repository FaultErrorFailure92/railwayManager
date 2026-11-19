import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../src/gen/manifest.json';

// RM-FR-PERF-02: der Atlas muss zu den Sprites passen – sonst `npm run atlas`
describe('Textur-Atlas', () => {
  const atlas = JSON.parse(readFileSync('public/assets/atlas/gen.json', 'utf-8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>; meta: { size: { w: number; h: number } } };
  const sprites = manifest.sprites as Record<string, { w: number; h: number }>;

  it('enthält jedes Bild genau einmal, ohne Überlappung', () => {
    expect(Object.keys(atlas.frames).sort()).toEqual(Object.keys(sprites).sort());
    for (const [k, f] of Object.entries(atlas.frames)) expect([f.frame.w, f.frame.h], k).toEqual([sprites[k].w, sprites[k].h]);
    const fr = Object.values(atlas.frames).map((f) => f.frame);
    for (const f of fr) {
      expect(f.x + f.w).toBeLessThanOrEqual(atlas.meta.size.w);
      expect(f.y + f.h).toBeLessThanOrEqual(atlas.meta.size.h);
    }
    for (let i = 0; i < fr.length; i++) {
      for (let j = i + 1; j < fr.length; j++) {
        const a = fr[i], b = fr[j];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
  });

  it('passt in eine Textur, die jede Grafikkarte kann', () => {
    expect(atlas.meta.size.w).toBeLessThanOrEqual(2048);
    expect(atlas.meta.size.h).toBeLessThanOrEqual(2048);
  });
});
