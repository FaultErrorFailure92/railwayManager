/** Personal mit Namen (RM-FR-ECO-12): jede Stelle hat eine feste Person mit kleiner Eigenschaft */

export interface StaffMember { name: string; trait: string; info: string; speed: number; catchBonus: number }

/** Instandhalter in Einstellungsreihenfolge */
export const CREW: StaffMember[] = [
  { name: 'Ferdl Schraubinger', trait: 'schnell', info: 'repariert 25 % schneller', speed: 0.75, catchBonus: 0 },
  { name: 'Gerti Hammerl', trait: 'gründlich', info: 'langsamer, aber hält länger – 10 % weniger Ausfälle', speed: 1.1, catchBonus: 0 },
  { name: 'Mehmet Kabelbaum', trait: 'Tüftler', info: 'repariert 15 % schneller', speed: 0.85, catchBonus: 0 },
  { name: 'Rudi Gemütlich', trait: 'gesprächig', info: 'tratscht gern mit Fahrgästen – repariert 10 % langsamer', speed: 1.1, catchBonus: 0 },
];

/** Kontrolleure in Einstellungsreihenfolge */
export const INSPECTORS: StaffMember[] = [
  { name: 'Frau Streng', trait: 'scharfsinnig', info: 'erwischt 10 % mehr', speed: 1, catchBonus: 0.1 },
  { name: 'Herr Pfiffig', trait: 'flink', info: 'erwischt 5 % mehr', speed: 1, catchBonus: 0.05 },
  { name: 'Karl Gutmütig', trait: 'nachsichtig', info: 'drückt ein Auge zu – erwischt 5 % weniger', speed: 1, catchBonus: -0.05 },
  { name: 'Resi Adlerauge', trait: 'gründlich', info: 'erwischt 10 % mehr', speed: 1, catchBonus: 0.1 },
];

/** Reparaturtempo des Teams (1 = normal) */
export function crewSpeed(n: number) {
  if (!n) return 1;
  const s = CREW.slice(0, n);
  return s.reduce((a, m) => a + m.speed, 0) / s.length;
}

/** Ausfall-Faktor durch gründliche Instandhalter */
export function crewCare(n: number) { return CREW.slice(0, n).some((m) => m.trait === 'gründlich') ? 0.9 : 1; }

/** Zusatz-Fangquote der Kontrolleure */
export function inspectorBonus(n: number) { return INSPECTORS.slice(0, n).reduce((a, m) => a + m.catchBonus, 0); }

export const staffTip = (m: StaffMember) => `${m.name} – ${m.trait}: ${m.info}`;
