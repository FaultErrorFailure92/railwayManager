/**
 * Bahn-ABC (RM-FR-CPX-06): jeder Begriff in einem augenzwinkernden Satz.
 * Aus jedem Tooltip mit „?“ erreichbar (der erste passende Begriff im Tooltip-Text wird angesprungen).
 */
export interface Entry { term: string; also?: string[]; text: string }

export const LEXICON: Entry[] = [
  { term: 'Abrollberg', also: ['Abrollen', 'Zerlegezug'], text: 'Ein Hügel, über den Güterwagen ganz ohne Lok hinunterrollen und sich dabei selbst sortieren – Schwerkraft ist die billigste Rangierlok.' },
  { term: 'Abstellgleis', also: ['Abstellen'], text: 'Der Parkplatz für Züge, die gerade nichts zu tun haben – ohne Parkuhr, aber mit Abstellgebühr.' },
  { term: 'Anschluss', also: ['Umsteigen'], text: 'Wenn der eine Zug auf den anderen wartet und alle pünktlich umsteigen – das Glück des Fahrdienstleiters.' },
  { term: 'Bahnhofsstufe', also: ['Haltepunkt', 'Knotenbahnhof', 'Hauptbahnhof', 'Hbf'], text: 'Vom Haltepunkt mit Wartehäuschen bis zum Hauptbahnhof mit Uhr, Kiosk und Taubenschwarm – je größer, desto mehr Fahrgäste.' },
  { term: 'Bahnsteig', also: ['Bahnsteigkante', 'Kante'], text: 'Die Bühne der Bahn, auf der Fahrgäste warten, drängeln und winken – jede Seite zum Gleis zählt als eigene Kante.' },
  { term: 'Blockabstand', also: ['Block'], text: 'Zwischen zwei Signalen darf nur ein Zug sein – mehr Signale, mehr Züge, weniger Gedränge.' },
  { term: 'Durchfahrt', also: ['Trassenentgelt', 'durchfahren'], text: 'Züge ohne Halt zahlen nur fürs Durchfahren – kleines Geld, aber Kleinvieh macht auch Mist.' },
  { term: 'Empfangsgebäude', also: ['Bahnhofsgebäude'], text: 'Das Wohnzimmer des Bahnhofs, ohne das ein Bahnsteig nur eine sehr lange Bank wäre.' },
  { term: 'Fahrdienstleiter', also: ['Fahrdienst'], text: 'Stellt Weichen und Signale, behält die Nerven und erledigt das in diesem Spiel automatisch – meistens.' },
  { term: 'Fahrplan', also: ['Abfahrt'], text: 'Das Versprechen, wann ein Zug kommt, das die Wirklichkeit gelegentlich nicht gelesen hat.' },
  { term: 'Forschung', also: ['Forschungspunkte', 'FP'], text: 'Neue Technik kostet Geld, Zeit und Forschungspunkte – die bekommt nur, wer gut spielt.' },
  { term: 'Großstörung', also: ['Baum auf der Strecke', 'Oberleitungsschaden', 'gesperrt'], text: 'Wenn ein Baum meint, er müsse sich aufs Gleis legen, helfen nur Umleiten, Warten oder ein Großeinsatz.' },
  { term: 'Instandhaltung', also: ['Instandhalter', 'Störtrupp', 'Störung'], text: 'Schmieren, schrauben, schimpfen: Damit Weichen und Signale nicht im ungünstigsten Moment streiken.' },
  { term: 'Kreuzungsgleis', also: ['Kreuzungsstelle', 'Ausweiche'], text: 'Auf eingleisigen Strecken der Ort, an dem zwei Züge höflich aneinander vorbeikommen.' },
  { term: 'Kredit', also: ['Bank', 'Zinsen'], text: 'Geld von morgen für Gleise von heute, worauf sich vor allem die Bank freut.' },
  { term: 'Oberleitung', also: ['Fahrdraht', 'elektrisch'], text: 'Der Draht über dem Gleis, aus dem E-Loks ihren Strom naschen, während Dieselloks nur müde lächeln.' },
  { term: 'Pünktlichkeit', also: ['pünktlich', 'Verspätung'], text: 'Unter 3 Minuten Verspätung gilt ein Zug als pünktlich – ab 3 Minuten zählen die Fahrgäste mit, und zwar laut.' },
  { term: 'Rangieren', also: ['Rangierbereich', 'Rangiersignal', 'Verschub'], text: 'Züge im Schritttempo hin und her schieben, bis alles passt – Geduld ist hier ein Fahrzeug.' },
  { term: 'Remise', also: ['Werkstatt', 'Lokschuppen'], text: 'Die Garage für Züge: Hier werden sie gepflegt, repariert und dürfen über Nacht schlafen.' },
  { term: 'Richtungsgleis', also: ['Rangierziel'], text: 'Am Abrollberg sammelt jedes Richtungsgleis die Wagen für ein Ziel – Ordnung durch Gefälle.' },
  { term: 'Schnellfahrweiche', also: ['Schnellfahrweichen'], text: 'Eine Weiche, durch die man ohne Bremsen und ohne verschütteten Kaffee fahren kann.' },
  { term: 'Signal', also: ['Signale', 'Hauptsignal'], text: 'Rot heißt halt, Grün heißt fahr, und Gelb heißt, der Fahrdienstleiter denkt noch nach.' },
  { term: 'Stumpfgleis', also: ['Prellbock'], text: 'Ein Gleis mit Ende, das durchfahrende Züge aus gutem Grund meiden.' },
  { term: 'Takt', also: ['Taktfahrplan'], text: 'Alle 60, 30 oder 15 Minuten ein Zug – so regelmäßig, dass man die Uhr danach stellen könnte.' },
  { term: 'Unterführung', also: ['Fußgängerbrücke', 'Zugang', 'Brücke'], text: 'Damit Fahrgäste zum anderen Bahnsteig kommen, ohne über die Gleise zu hüpfen.' },
  { term: 'Vertrag', also: ['Verträge', 'Bahnunternehmen', 'Unternehmen'], text: 'Die Bahnunternehmen zahlen für jeden Halt – wird es zu teuer, suchen sie sich einen anderen Bahnhof.' },
  { term: 'Weiche', also: ['Weichen', 'Gleiswechsel', 'Abzweig'], text: 'Das bewegliche Stück Gleis, das entscheidet, wohin die Reise geht, und das Schnee gar nicht mag.' },
  { term: 'Wendezug', also: ['Wendezüge', 'Wendezeit'], text: 'Fährt hin, macht kehrt, fährt zurück – mit Führerstand an beiden Enden, ganz ohne Drehscheibe.' },
];

const norm = (s: string) => s.toLowerCase();

/** ersten Begriff finden, der im Text vorkommt (Haupt- und Nebenbegriffe) */
export function findTerm(text: string): Entry | undefined {
  const t = norm(text);
  let best: { e: Entry; i: number } | undefined;
  for (const e of LEXICON) {
    for (const w of [e.term, ...(e.also ?? [])]) {
      const i = t.indexOf(norm(w));
      if (i >= 0 && (!best || i < best.i)) best = { e, i };
    }
  }
  return best?.e;
}
