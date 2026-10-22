/** „Was ist neu?“ – neueste Version oben; beim Start einmal je Version, im Menü jederzeit */
export type ChangeKind = 'neu' | 'besser' | 'fix';
export interface ChangeItem { kind: ChangeKind; text: string; icon?: string }
export interface Release { version: string; date: string; title: string; items: ChangeItem[] }

export const CHANGELOG: Release[] = [
  {
    version: '0.17', date: '22.10.2026', title: 'Drei Forschungsbäume',
    items: [
      { kind: 'neu', icon: 'signal_E', text: 'Forschung in drei Bäumen: Stellwerk, Verschönerungsverein, Kaufmännische Abteilung – je Baum eine Forschung gleichzeitig' },
      { kind: 'neu', icon: 'ri_whistle', text: 'Pfiff-Akademie (kürzere Haltezeiten) und Elektronisches Stellwerk (Störungen halb so lang)' },
      { kind: 'neu', icon: 'bld_cat', text: 'Bahnhofskatze, Wandbild (weniger Vandalismus) und Christbaum' },
      { kind: 'neu', icon: 'bld_billboard', text: 'Plakatwände, Schließfächer und Souvenirladen bringen zusätzlich Geld' },
      { kind: 'neu', icon: 'ri_haggle', text: 'Verhandlungsgeschick (+10 % Preise) und Sonderzug-Agentur (mehr und besser bezahlte Sonderzüge)' },
      { kind: 'besser', icon: 'bld_bench', text: 'Bänke, Kiosk & Co. jetzt über die Forschung – in alten Spielständen bleiben sie frei' },
      { kind: 'fix', icon: 'bld_station', text: 'Alte Spielstände verloren beim Laden manchmal erforschte Sachen' },
    ],
  },
  {
    version: '0.16', date: '22.10.2026', title: 'Klare Aufträge',
    items: [
      { kind: 'neu', icon: 'track', text: 'Aufträge als Checkliste: jeder Schritt wird abgehakt, sobald er erledigt ist' },
      { kind: 'besser', icon: 'signal_E', text: 'Beim Signal-Bauen zeigen gelbe Pfeile auf dem Gleis die Fahrtrichtung' },
      { kind: 'besser', icon: 'bld_wash', text: 'Waschanlagen werden im Verschubbereich gebaut (Forschung nach „Verschubbereiche“)' },
      { kind: 'neu', icon: 'bld_adobeA', text: 'Wüste mit Lehmhäusern, Ziehbrunnen und Zelten' },
      { kind: 'besser', icon: 'bld_pine0', text: 'Kartenauswahl mit echten Vorschaubildern' },
    ],
  },
  {
    version: '0.15', date: '22.10.2026', title: 'Wüste und Schnee',
    items: [
      { kind: 'neu', icon: 'bld_pine1', text: 'Zwei neue Karten: Wüstenbahn (Sand, Kakteen, Palmen) und Schneeland (verschneite Wälder, fast täglich Schnee)' },
      { kind: 'neu', icon: 'tool_shovel', text: 'Forschung „Instandhaltungsteam“: Instandhalter einstellen – sie rücken selbst aus und reparieren schneller' },
      { kind: 'neu', icon: 'bld_clock', text: 'Forschung „Vorbeugende Wartung“: halb so viele Störungen' },
      { kind: 'neu', icon: 'bld_station', text: 'Ausschreibungen kommen als Brief vom Verkehrsverbund, Anfragen als Anruf – mit Ansprechperson' },
      { kind: 'neu', icon: 'bld_statue', text: 'Die Bank meldet sich per Brief, wenn das Konto ins Minus rutscht' },
      { kind: 'besser', icon: 'rail_bridge_icon', text: 'Kartenauswahl als Liste, auch mit Pfeiltasten und Enter' },
      { kind: 'besser', icon: 'bld_lamp', text: 'Ladebildschirm, Lautsprecher-Symbol für den Ton, „Wählen“-Knöpfe auf gleicher Höhe' },
    ],
  },
  {
    version: '0.14', date: '22.10.2026', title: 'Post vom Vorstand',
    items: [
      { kind: 'neu', icon: 'bld_station3', text: 'Briefe vom Bahnvorstand: Begrüßung beim neuen Spiel, später Lob (manchmal mit Prämie) oder Tadel' },
      { kind: 'neu', icon: 'bld_houseA', text: 'Zeitung mit Fotos, Redakteuren und eigenem Blatt je Karte' },
      { kind: 'besser', icon: 'bld_clock', text: '„Neues Spiel“ fragt, ob der alte Spielstand gespeichert werden soll' },
    ],
  },
  {
    version: '0.13', date: '22.10.2026', title: 'Neue Karten',
    items: [
      { kind: 'neu', icon: 'rail_bridge_icon', text: 'Kartenauswahl beim neuen Spiel: Donautal, Alpenbahn, Pannonische Ebene, Industrierevier' },
      { kind: 'neu', icon: 'bld_pine0', text: 'Jede Karte mit eigenem Gelände, Wetter, Startkapital und Ortsnamen' },
      { kind: 'neu', icon: 'bld_station', text: 'Eigene Bahnunternehmen je Karte, z. B. Tauern Regional, Rübenbahn Marchfeld, Revier Cargo' },
    ],
  },
  {
    version: '0.12', date: '22.10.2026', title: 'Ziele und Sterne',
    items: [
      { kind: 'neu', icon: 'bld_clock', text: 'Tagesziele: jeden Tag drei kleine Aufgaben mit Geld und Forschungspunkten' },
      { kind: 'neu', icon: 'bld_station3', text: 'Bahnhofs-Bewertung 1–5 Sterne: Pünktlichkeit, Sauberkeit, Komfort, Service, Stimmung – mehr Sterne, mehr Fahrgäste' },
      { kind: 'neu', icon: 'piece_branch_divUp', text: 'Forschung „Weichenheizung“: bei Schnee kaum noch langsamer' },
      { kind: 'besser', icon: 'bld_station', text: '„Was ist neu?“ jetzt mit allen Versionen, im Menü jederzeit aufrufbar' },
    ],
  },
  {
    version: '0.11', date: '22.10.2026', title: 'Leben auf der Strecke',
    items: [
      { kind: 'neu', icon: 'bld_bus', text: 'Zeitungs-Anfragen: Fan-Sonderzug mit Prämie oder Strafe, Bahnhofsfest sponsern' },
      { kind: 'neu', icon: 'tool_shovel', text: 'Störungen an Weichen und Signalen – anklicken und Störtrupp schicken' },
      { kind: 'neu', icon: 'bld_fountain', text: 'Wetter: Regen und Schnee, bei Schnee fahren Züge langsamer' },
      { kind: 'neu', icon: 'bld_statue', text: '14 Erfolge zum Freispielen' },
      { kind: 'neu', icon: 'bld_clock', text: 'Statistik: Tagesbilanz, Pünktlichkeit je Unternehmen' },
      { kind: 'besser', icon: 'signal_E', text: 'Rote Uhr über verspäteten Zügen, Zugkarte zeigt, worauf ein Zug wartet' },
      { kind: 'besser', icon: 'bld_station', text: 'Schnellspeichern (F5 / Strg+S), Autosave alle 3 Spielstunden' },
      { kind: 'neu', icon: 'bld_lamp', text: 'Geräusche: Bahnhofsgong und Abfahrtspfiff (abschaltbar)' },
    ],
  },
  {
    version: '0.10', date: '22.10.2026', title: 'Kassensturz',
    items: [
      { kind: 'neu', icon: 'bld_statue', text: 'Laufende Kosten pro Tag oben in der Leiste' },
      { kind: 'neu', icon: 'bld_station', text: 'Kredit: unter 0 € leiht die Bank automatisch – 3 % Zinsen pro Tag' },
      { kind: 'neu', icon: 'bld_hump', text: 'Pleite bei −50 000 €: Game Over' },
    ],
  },
  {
    version: '0.9', date: '22.10.2026', title: 'Privatbahnen und Nachtbetrieb',
    items: [
      { kind: 'neu', icon: 'bld_sawmill', text: 'Privatbahnen: Sägewerk und Bergwerk anschließen – Pendelzüge zahlen pro Fahrt' },
      { kind: 'neu', icon: 'mark_shunt', text: 'Verschubbereiche mit Rangiersignalen' },
      { kind: 'neu', icon: 'bld_lamp', text: 'Tag und Nacht: Laternen, beleuchtete Bahnhöfe und Züge' },
      { kind: 'neu', icon: 'bld_wash', text: 'Zeitung: Vandalismus und Volksfeste' },
      { kind: 'neu', icon: 'bld_statue', text: 'Tägliche Instandhaltung und Tagesbilanz' },
      { kind: 'neu', icon: 'piece_xover_down_fast', text: 'Schnellfahrweichen für den Donau-Sprinter' },
      { kind: 'neu', icon: 'bld_inn', text: 'WC-Anlage und Gasthaus am Bahnhof' },
      { kind: 'besser', icon: 'bld_workshop', text: 'Forschungsbaum kompakt mit Tooltips' },
      { kind: 'besser', icon: 'track', text: 'Tutorial beim neuen Spiel an- oder abwählbar' },
      { kind: 'besser', icon: 'piece_xover_down', text: 'Gleiswechsel-Weichen erst mit dem zweigleisigen Ausbau' },
      { kind: 'fix', icon: 'signal_E', text: 'Deadlocks ohne eigene Weichen behoben – der Fahrdienstleiter plant voraus' },
      { kind: 'fix', icon: 'bld_shelter', text: 'Fahrgäste ärgern sich nur noch über echte Verspätungen' },
    ],
  },
  {
    version: '0.8', date: '21.10.2026', title: 'Verträge und Spielstände',
    items: [
      { kind: 'neu', icon: 'bld_station2', text: 'Verträge mit Ausschreibungen, Takt je Unternehmen' },
      { kind: 'neu', icon: 'bld_station', text: 'Mehrere Spielstände, Autosave' },
      { kind: 'neu', icon: 'signal_E', text: 'Stau-Warnung mit Countdown und „Zug aufgeben“' },
      { kind: 'neu', icon: 'tool_wire', text: 'Triebzüge mit zwei Führerständen' },
      { kind: 'besser', icon: 'bld_tree0', text: 'Retro-Landschaft und Nebel über fremdem Land' },
    ],
  },
  {
    version: '0.7', date: '20.10.2026', title: 'Größere Welt',
    items: [
      { kind: 'neu', icon: 'bld_houseA', text: 'Große Karte mit Bergen, Flüssen, Seen und Dörfern' },
      { kind: 'neu', icon: 'bld_tree1', text: 'Tiere auf den Weiden' },
      { kind: 'neu', icon: 'rail_bridge_icon', text: 'Eisenbahnbrücken über Wasser' },
    ],
  },
];

export const VERSION = CHANGELOG[0].version;
