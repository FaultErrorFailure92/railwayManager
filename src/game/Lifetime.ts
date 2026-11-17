/**
 * Profil-Statistik (RM-FR-PROF-03): Lebenszeit-Werte über alle Spiele eines Profils – mit Augenzwinkern.
 */
import type { Game } from './Game';
import { addStats, type Profile } from './Profiles';

/** Zähler des laufenden Spiels ins Profil schreiben (regelmäßig und beim Verlassen) */
export function flushLife(g: Game) {
  if (!g.profileId || !g.company) return;
  addStats(g.profileId, g.life, g.lifeMax, g.lifeMin);
  g.life = {};
  g.lifeMax = -Infinity;
  g.lifeMin = Infinity;
}

const n = (v: number) => Math.round(v).toLocaleString('de-AT');
const eur = (v: number) => `${n(v)} €`;

export interface LifeLine { icon: string; label: string; value: string; quip?: string }

/** Anzeige: Wert und ein kleiner Kommentar */
export function lifeLines(p: Profile): LifeLine[] {
  const s = p.stats ?? {};
  const v = (k: string) => s[k] ?? 0;
  const trains = v('trains'), punct = v('punctual');
  const pct = trains ? Math.round((punct / trains) * 100) : 0;
  const lines: LifeLine[] = [
    { icon: 'bld_bench', label: 'Beförderte Fahrgäste', value: n(v('pax')),
      quip: v('pax') >= 50000 ? `${(v('pax') / 50000).toFixed(1).replace('.', ',')} volle Fußballstadien` : v('pax') >= 1000 ? `${n(v('pax') / 800)} volle Fernzüge` : 'jeder einzelne zählt' },
    { icon: 'track', label: 'Abgefertigte Züge', value: n(trains), quip: trains ? `davon ${pct} % pünktlich${pct >= 95 ? ' – Schweizer Verhältnisse' : pct < 70 ? ' – „Verzögerungen im Betriebsablauf“' : ''}` : 'noch keiner' },
    { icon: 'bld_clock', label: 'Verspätung gesamt', value: `${n(v('lateMin'))} min`, quip: `≈ ${n(v('lateMin') / 15)} Kaffeepausen der Fahrgäste` },
    { icon: 'bld_lockers', label: 'Geld verdient', value: eur(v('earned')) },
    { icon: 'tool_shovel', label: 'Geld insgesamt verschleudert', value: eur(v('spent')), quip: v('spent') > v('earned') ? 'mehr raus als rein – mutig' : 'alles Investitionen, versprochen' },
    { icon: 'platform', label: 'Bauaufträge', value: n(v('built')), quip: v('demolished') ? `dazu ${n(v('demolished'))}× wieder abgerissen („war nur ein Test“)` : 'kein einziges Mal bereut' },
    { icon: 'tool_flag', label: 'Land gekauft', value: `${n(v('land'))} Parzellen` },
    { icon: 'bld_cafe', label: 'Umsatz der Läden', value: eur(v('shop')), quip: `≈ ${n(v('shop') / 4.2)} Wiener Melange` },
    { icon: 'signal_E', label: 'Störungen erlebt', value: n(v('faults')), quip: `${n(v('repairs'))} davon selbst repariert` },
    { icon: 'bld_remise', label: 'Züge gewaschen und gepflegt', value: n(v('services')) },
    { icon: 'bld_station', label: 'Anschlüsse erreicht', value: n(v('connOk')), quip: v('connMissed') ? `${n(v('connMissed'))} Umsteiger haben nur noch die Rücklichter gesehen` : 'niemand musste rennen' },
    { icon: 'bld_statue', label: 'Tage im Dienst', value: n(v('days')), quip: `${n(v('games'))} ${v('games') === 1 ? 'Spiel' : 'Spiele'} begonnen` },
  ];
  if (s.maxMoney !== undefined) lines.push({ icon: 'bld_lockers', label: 'Rekord-Kontostand', value: eur(s.maxMoney), quip: s.minMoney !== undefined && s.minMoney < 0 ? `Tiefpunkt: ${eur(s.minMoney)} – die Bank erinnert sich` : 'nie im Minus gewesen' });
  return lines;
}
