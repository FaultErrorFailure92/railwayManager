import { currentMap } from '../world/maps';

/** Zeitung: Redakteure mit lustigen Namen und kleine Pixel-Fotos */
const AUTHORS = [
  'Rudi Radsatz', 'Gerti Gleisbett', 'Sepp Schwelle', 'Herta Hemmschuh', 'Franz Fahrdraht', 'Kurt Kupplung',
  'Wilma Weichenzunge', 'Bertl Bremsklotz', 'Lotte Laufachse', 'Hansi Haltepunkt', 'Mitzi Murmeltier', 'Poldi Puffer',
  'Resi Rangierlok', 'Toni Tender', 'Fritzi Fahrkarte', 'Ferdl Funkenflug',
];
export const author = () => AUTHORS[Math.floor(Math.random() * AUTHORS.length)];
export const paperName = () => currentMap().paper.toUpperCase();

const G = (k: string) => `assets/gen/${k}.png`;
type Part = [key: string, x: number, y: number];

/** Zug als Kette aus Wagen (Blickrichtung 0 = schräg nach rechts unten) */
const train = (op: string, x: number, y: number, n: number, wagon = 'coach'): Part[] =>
  Array.from({ length: n }, (_, i): Part => [`car_${op}_${i === 0 ? 'loco' : wagon}_0`, x - i * 16, y - i * 8]).reverse();

const PHOTOS: Record<string, Part[]> = {
  fest: [['bld_houseA', 0, 6], ['bld_tree0', 74, 30], ['bld_fountain', 94, 42], ['bld_lamp', 132, 30], ['bld_houseB', 156, 4], ['bld_flowers', 66, 58]],
  sponsor: [['bld_station3', 50, -6], ['bld_fountain', 4, 52], ['bld_statue', 150, 40], ['bld_flowers', 136, 64], ['bld_tree1', 18, 24]],
  fans: [['bld_station', 2, 16], ...train('fx', 176, 60, 5)],
  'vandal-trains': [['bld_wash', 100, 18], ...train('ro', 96, 60, 4)],
  'vandal-station': [['bld_station', 50, 10], ['bld_bench', 18, 60], ['bld_lamp', 140, 38], ['bld_bench', 150, 66]],
  sawmill: [['bld_sawmill', 30, 4], ['bld_pine0', 140, 20], ['bld_pine1', 160, 36], ...train('sw', 150, 74, 3, 'wagon0')],
  mine: [['bld_mine', 24, -12], ['bld_rock0', 140, 40], ...train('mn', 160, 74, 3, 'wagon0')],
};

/** Foto für eine Meldung (Schlagwort aus dem Ereignis) */
export function newsPhoto(tag: string, caption: string) {
  const key = tag === 'industry' ? (caption.includes('Säge') ? 'sawmill' : 'mine') : tag;
  const parts = PHOTOS[key];
  if (!parts) return '';
  return `<figure class="nw-photo"><div class="nw-pic">${parts.map(([k, x, y]) => `<img src="${G(k)}" style="left:${x}px;top:${y}px" alt="" />`).join('')}</div>
    <figcaption>${caption}</figcaption></figure>`;
}
