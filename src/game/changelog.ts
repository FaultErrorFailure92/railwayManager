/** „Was ist neu?“ – wird beim Start einmal je Version gezeigt */
export const VERSION = '0.11';

export const CHANGELOG: { title: string; items: string[] }[] = [
  {
    title: 'Version 0.11',
    items: [
      'Zeitung mit Anfragen: Fan-Sonderzüge (Prämie oder Strafe) und Bahnhofsfest',
      'Störungen an Weichen und Signalen – anklicken, Störtrupp schicken',
      'Wetter: Regen und Schnee (bei Schnee fahren Züge langsamer)',
      'Rote Uhr über verspäteten Zügen, Zugkarte zeigt, worauf ein Zug wartet',
      'Erfolge mit Sammlung in der neuen Statistik',
      'Statistik: Tagesbilanz der letzten 7 Tage, Pünktlichkeit je Unternehmen',
      'Schnellspeichern mit F5 oder Strg+S, Autosave alle 3 Spielstunden',
      'Geräusche: Bahnhofsgong und Abfahrtspfiff (abschaltbar)',
    ],
  },
  {
    title: 'Version 0.10',
    items: [
      'Laufende Kosten pro Tag oben in der Leiste',
      'Kredit: unter 0 € leiht die Bank automatisch – 3 % Zinsen pro Tag',
      'Bei −50 000 € ist das Spiel vorbei (Pleite)',
    ],
  },
  {
    title: 'Version 0.9',
    items: [
      'Tutorial beim neuen Spiel an- oder abwählbar',
      'Gleiswechsel-Weichen erst mit dem zweigleisigen Ausbau',
      'Privatbahnen: Sägewerk und Bergwerk anschließen – Pendelzüge zahlen pro Fahrt',
      'Verschubbereiche mit Rangiersignalen',
      'Tag und Nacht: Laternen, beleuchtete Bahnhöfe und Züge',
      'Zeitung: Vandalismus, Volksfeste und mehr',
      'Tägliche Instandhaltung und Tagesbilanz',
      'Schnellfahrweichen für den Donau-Sprinter',
      'WC-Anlage und Gasthaus am Bahnhof',
      'Forschungsbaum kompakt mit Tooltips',
    ],
  },
];
