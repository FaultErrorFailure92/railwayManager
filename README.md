# Bahnhofsmanager

Ein Bahnhofs-Aufbauspiel in isometrischer Pixel-Optik, spielbar im Browser.
Du baust einen kleinen Bahnhof an einer eingleisigen Strecke Schritt für Schritt aus,
fertigst die Züge mehrerer Bahnunternehmen pünktlich ab und erledigst Aufträge.

## Starten

Voraussetzung: Node.js 18 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver, danach http://localhost:5173 öffnen
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run preview    # gebauten Stand ansehen
npm test           # automatische Tests (Vitest)
npm run balance -- --days 2 --strategy demo   # Balance-Lauf ohne Browser
```

Beim ersten Start legst du ein **Profil** an (Firma, Spieler, Bild). Für die Entwicklung gibt es im Hauptmenü
das Symbol **„DEV“** (nur bei `npm run dev`): Demobahnhof mit Signalen, Verträgen und viel Geld.

Sprites neu erzeugen (Python 3 mit Pillow und NumPy):

```bash
npm run sprites
```

Anforderungen stehen in `docs/requirements/railway-manager.sdoc` (StrictDoc).

## Spielinhalt

- **Profile:** Firma und Spieler werden einmal angelegt (Onboarding mit Dienstausweis). Spielstände, Kampagnen-Fortschritt,
  freigespielte Karten und die **Dienstakte** (Statistik über alle Spiele) gehören zum Profil. Verwaltung rechts oben im Hauptmenü.
- **Kampagne:** 7 Kapitel, eines je Karte, nur freigeschaltete sind spielbar. Alle 7 Kapitel sind spielbar (Donautal mit
  Einschulung, Pannonische Ebene, Industrierevier, Schneeland, Alpenbahn, Wüstenbahn und als Finale die Großstadt). Jedes Kapitel bekommt 1–3 Sterne.
- **Herausforderungen:** Morgenspitze, Sturmtief, Sparkurs und eine tägliche Herausforderung – fertiger Bahnhof, Ziel, Zeitlimit, Bestzeit im Profil.
- **Sandkasten:** freies Spiel ohne Geld, Pleite und Forschungsgrenzen. **Zufallskarten** aus einem Startwert.
- **Kartenwerkstatt:** eigene Karten aus Vorlagen (Landschaft, Straßen, Werke, Fremdbahnen) mit eigenen Bahnunternehmen; als Datei teilbar.
- **Dienstakte:** Statistik über alle Spiele und Auszeichnungen als Stempel (Erfolge und Laufbahn).
- **Freies Spiel:** Einstellseite mit Karte (nur freigespielte), Startkapital, Fahrgastaufkommen, Störungen, Verspätungen von außen,
  Pleite-Grenze und Verkehrswachstum; sieben Langzeitziele mit Prämie.
- **Karten:** Donautal, Alpenbahn, Pannonische Ebene, Industrierevier, Wüstenbahn und Schneeland –
  jede mit eigenem Gelände, Wetter, Startkapital, Ortsnamen, Bahnunternehmen, Lokalzeitung und eigenem Musikthema.
- **Bauen:** Land kaufen, Bahnsteige, Gleise, Weichen, Kurven, Diagonalen, Kreuzungen, Signale und Rangiersignale,
  Oberleitung, Unterführungen und Brücken, Empfangsgebäude, Läden, Deko; Rückgängig/Wiederholen.
- **Zugverkehr:** Regional-, Fern-, S-Bahn-, Nacht-, Museums-, Hochgeschwindigkeits- und Güterzüge, Wendezüge,
  Linksverkehr auf zweigleisiger Strecke, Sonderzüge, Stoßzeiten mit Verstärkerzügen, Verspätungen von außen.
- **Betrieb:** Blocksignale mit Fahrstraßenreservierung, Abstellgleise, Remise, Werkstatt, Waschanlage, Abrollberg,
  Privatbahnen, **Fremdbahnen** zum Anschließen (Halten oder Durchfahren per Vertrag), **Anschlüsse** zwischen Zügen (auch abwarten lassen), Weg-Zeit-Diagramm mit **Disposition** (Bahnsteig und Abfahrt je Zug per Ziehen, Konflikte rot). Bahnhöfe mit Kürzel, Zugstatus mit Ort („fährt in Dmh ein“).
- **Ereignisse:** Tag und Nacht, Wetter, Störungen und Großstörungen, Abnutzung von Weichen und Signalen,
  besondere Tage (Feiertag, Heimspiel, Streik …), Zeitung, Briefe vom Vorstand und von der Bank.
- **Wirtschaft:** Ausschreibungen, Verträge mit Preis und Takt, Läden, Personal, Bank mit Kredit, Pleite-Grenze.
- **Fortschritt:** Aufträge, vier Forschungsbäume, Tagesziele, Bahnhofsstufen (Haltepunkt bis Hauptbahnhof), Bewertung, Erfolge.
- **Oberfläche:** untere Leiste mit Übersichtskarte (Zoom, Ebenen: Belegung, Fahrgäste, Stimmung, Instandhaltung), Baumenü
  (Gruppe → Typ → Variante, drehen mit R) und Infos (Zugverkehr, Meldungen, Partner – Details per Klick); „Was ist los?“ mit Lösungen per Klick,
  Bahn-ABC, Musik und Geräusche.

## Steuerung

| Taste | Funktion |
| --- | --- |
| Maus ziehen / WASD | Karte verschieben |
| Mausrad | Zoom |
| 1–9, B, X | Baumenü-Gruppen, danach Ziffer = Typ |
| R | drehen |
| T | nächste Variante des Typs |
| Leertaste | Pause |
| + / − | Spieltempo |
| Strg+Z / Strg+Y | Rückgängig / Wiederholen |
| L | Was ist los? |
| Ü | Ebenen weiterschalten |
| F / E / V / P | Fahrplan / Entwickeln (Forschung) / Verträge / Postfach |
| N | Vorspulen bis zum nächsten Halt |
| | Alle Buchstaben-Tasten sind in den Einstellungen umbelegbar |
| Controller | Stick = Karte, LB/RB = Zoom, A = Pause, X = schneller, Y = Fahrplan, B/Start = zurück/Menü |
| Tablet | zwei Finger = verschieben und zoomen, lange drücken = Fahrgast |
| H / F1 | Hilfe |
| F5 / Strg+S | Schnellspeichern |
| Esc | Werkzeug weglegen, sonst Pause/Hauptmenü |

## Technik

- TypeScript, [Phaser 3](https://phaser.io/), Vite, Vitest
- Schrift: VT323 (über `@fontsource/vt323`)
- Sprites werden mit `tools/gen_sprites.py` erzeugt und liegen in `public/assets/gen/`
- Musik und Geräusche entstehen live per WebAudio (keine Audiodateien)
- Spielstände und Profile liegen im Browser (localStorage), Export/Import als `.rmsave`
- CI-Vorlage: `tools/github-ci.yml` (nach `.github/workflows/` verschieben)

## Projektstruktur

```
src/
  config.ts          Konstanten (Kartengröße, Preise, Zeit)
  main.ts            Einstieg (Profil-Übernahme, neues Spiel einrichten)
  game/              Spielstand, Aufträge, Forschung, Verträge, Ziele, Profile, freies Spiel,
                     Anschlüsse, Disposition, Abnutzung, Statistik, Speichern
  dev/               Demobahnhof und Balance-Werkzeug (nur Entwicklung)
  sim/               Zugsimulation, Bahnunternehmen, Nachfrage nach Tageszeit
  world/             Karten, Raster, Gleisteile, Gebäude, Betriebe, Gleisnetz
  render/            Phaser-Szene, Fahrgäste, Tiere, Licht, Wetter, Geräusche, Musik
  ui/                Oberfläche (HUD, Hauptmenü, Profile, Fahrplan, Übersichtskarte, Zeitung, Porträts)
test/                automatische Tests (Vitest)
docs/requirements/   Anforderungen (StrictDoc)
tools/               Sprite-Generator, Balance-Skript, CI-Vorlage
public/assets/gen/   erzeugte Sprites und Icons
```
