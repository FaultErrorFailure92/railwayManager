/** Pixel-Porträts (12x14): zufällig aus einer Zahl oder als feste Spieler-Avatare */
export interface Face {
  skin: string; hair: string; shirt: string;
  style: 'short' | 'long' | 'bald' | 'bun' | 'curly';
  glasses?: boolean; beard?: boolean; old?: boolean; earrings?: boolean;
}

const SKINS = ['#f6d8bc', '#f2c9a0', '#e0ac7e', '#c68a5a', '#8d5a3a', '#5e3a24'];

function draw(f: Face, size: number) {
  const px: string[] = [];
  const p = (x: number, y: number, w: number, h: number, c: string) => px.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  p(0, 0, 12, 14, '#5a6a7a');
  if (f.style === 'long') p(2, 3, 8, 9, f.hair);
  p(1, 11, 10, 3, f.shirt); p(5, 11, 2, 1, '#eee');
  p(3, 3, 6, 7, f.skin); p(5, 10, 2, 1, f.skin);
  if (f.style === 'bald') { p(2, 4, 1, 2, f.hair); p(9, 4, 1, 2, f.hair); }
  else if (f.style === 'curly') { p(2, 1, 8, 3, f.hair); p(2, 4, 1, 3, f.hair); p(9, 4, 1, 3, f.hair); p(3, 1, 1, 1, '#0000'); }
  else {
    p(3, 2, 6, 2, f.hair); p(2, 3, 1, f.style === 'long' ? 7 : 3, f.hair); p(9, 3, 1, f.style === 'long' ? 7 : 3, f.hair);
    if (f.style === 'bun') p(5, 0, 2, 2, f.hair);
  }
  p(4, 5, 1, 1, '#222'); p(7, 5, 1, 1, '#222');
  if (f.old) { p(3, 7, 1, 1, '#0002'); p(8, 7, 1, 1, '#0002'); }
  if (f.glasses) { p(3, 5, 3, 1, '#333'); p(6, 5, 3, 1, '#333'); p(4, 5, 1, 1, '#9cf'); p(7, 5, 1, 1, '#9cf'); }
  if (f.beard) p(4, 8, 4, 2, f.hair); else p(5, 8, 2, 1, '#a0524a');
  if (f.earrings) { p(2, 7, 1, 1, '#f2c94c'); p(9, 7, 1, 1, '#f2c94c'); }
  return `<svg class="portrait" viewBox="0 0 12 14" width="${size}" height="${Math.round(size * 14 / 12)}" shape-rendering="crispEdges">${px.join('')}</svg>`;
}

/** zufälliges Gesicht aus einer Zahl (Ansprechpersonen, Instandhalter) */
export function portrait(seed: number, size = 48) {
  const r = (n: number) => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) % n; };
  const skin = ['#f2c9a0', '#e0ac7e', '#c68a5a', '#8d5a3a', '#f6d8bc'][r(5)];
  const hair = ['#2a1d14', '#6b4226', '#b5763a', '#d8c070', '#9a9a9a', '#e8e8e8', '#7a2a1a'][r(7)];
  const shirt = ['#2c5f8a', '#7a2a2a', '#3f6a3a', '#5a4a7a', '#444', '#8a6a2a'][r(6)];
  const glasses = r(3) === 0, beard = r(4) === 0, long = r(3) === 0, bald = !long && r(5) === 0;
  return draw({ skin, hair, shirt, style: long ? 'long' : bald ? 'bald' : 'short', glasses, beard }, size);
}

/** Spieler-Avatare: alle Hautfarben, Frauen und Männer, jung und alt */
export const AVATARS: Face[] = [
  { skin: SKINS[0], hair: '#d8c070', shirt: '#2c5f8a', style: 'long', earrings: true },
  { skin: SKINS[1], hair: '#6b4226', shirt: '#7a2a2a', style: 'short' },
  { skin: SKINS[2], hair: '#2a1d14', shirt: '#3f6a3a', style: 'bun', glasses: true },
  { skin: SKINS[3], hair: '#2a1d14', shirt: '#8a6a2a', style: 'short', beard: true },
  { skin: SKINS[4], hair: '#1a1410', shirt: '#5a4a7a', style: 'curly', earrings: true },
  { skin: SKINS[5], hair: '#1a1410', shirt: '#2c5f8a', style: 'bald', beard: true },
  { skin: SKINS[0], hair: '#e8e8e8', shirt: '#444', style: 'bun', old: true, glasses: true },
  { skin: SKINS[1], hair: '#9a9a9a', shirt: '#2c5f8a', style: 'bald', old: true, glasses: true },
  { skin: SKINS[3], hair: '#9a9a9a', shirt: '#7a2a2a', style: 'curly', old: true },
  { skin: SKINS[5], hair: '#e8e8e8', shirt: '#3f6a3a', style: 'short', old: true, beard: true },
  { skin: SKINS[2], hair: '#7a2a1a', shirt: '#8a6a2a', style: 'long' },
  { skin: SKINS[4], hair: '#2a1d14', shirt: '#444', style: 'short', glasses: true },
];

export const avatar = (i: number, size = 48) => draw(AVATARS[((i % AVATARS.length) + AVATARS.length) % AVATARS.length], size);
