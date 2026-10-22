/** kleines Pixel-Porträt (12x14) aus einer Zahl: Haut, Haare, Brille, Bart */
export function portrait(seed: number, size = 48) {
  const r = (n: number) => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) % n; };
  const skin = ['#f2c9a0', '#e0ac7e', '#c68a5a', '#8d5a3a', '#f6d8bc'][r(5)];
  const hair = ['#2a1d14', '#6b4226', '#b5763a', '#d8c070', '#9a9a9a', '#e8e8e8', '#7a2a1a'][r(7)];
  const shirt = ['#2c5f8a', '#7a2a2a', '#3f6a3a', '#5a4a7a', '#444', '#8a6a2a'][r(6)];
  const glasses = r(3) === 0, beard = r(4) === 0, long = r(3) === 0, bald = !long && r(5) === 0;
  const px: string[] = [];
  const p = (x: number, y: number, w: number, h: number, c: string) => px.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  p(0, 0, 12, 14, '#5a6a7a');
  p(1, 11, 10, 3, shirt); p(5, 11, 2, 1, '#eee');
  p(3, 3, 6, 7, skin); p(5, 10, 2, 1, skin);
  if (!bald) { p(3, 2, 6, 2, hair); p(2, 3, 1, long ? 7 : 3, hair); p(9, 3, 1, long ? 7 : 3, hair); }
  else p(2, 4, 1, 2, hair), p(9, 4, 1, 2, hair);
  p(4, 5, 1, 1, '#222'); p(7, 5, 1, 1, '#222');
  if (glasses) { p(3, 5, 3, 1, '#333'); p(6, 5, 3, 1, '#333'); p(4, 5, 1, 1, '#9cf'); p(7, 5, 1, 1, '#9cf'); }
  if (beard) p(4, 8, 4, 2, hair); else p(5, 8, 2, 1, '#a0524a');
  return `<svg class="portrait" viewBox="0 0 12 14" width="${size}" height="${Math.round(size * 14 / 12)}" shape-rendering="crispEdges">${px.join('')}</svg>`;
}
