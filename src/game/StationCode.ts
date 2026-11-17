/** Bahnhofs-Kürzel: selbst vergeben oder 2–3 Buchstaben aus dem Namen (z.B. Demohausen → Dmh, Oase Nord → ON) */
const VOWEL = /[aeiouäöüy]/i;

export function autoCode(name: string, taken: string[] = []): string {
  const words = name.replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean);
  if (!words.length) return 'Bf';
  let base: string;
  if (words.length > 1) base = words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
  else {
    const w = words[0];
    const cons = [...w.slice(1).toLowerCase()].filter((c) => !VOWEL.test(c));
    base = w[0].toUpperCase() + (cons.length >= 2 ? cons[0] + cons[1] : w.slice(1, 3).toLowerCase());
  }
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 10; i++) if (!taken.includes(`${base.slice(0, 2)}${i}`)) return `${base.slice(0, 2)}${i}`;
  return base;
}

/** eingegebenes Kürzel säubern: höchstens 4 Zeichen, erster Buchstabe groß */
export function cleanCode(v: string): string {
  const s = v.replace(/[^\p{L}\d]/gu, '').slice(0, 4);
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
