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
```

Für die Entwicklung gibt es im Hauptmenü den Knopf **„Demobahnhof (Dev)“** (nur bei `npm run dev`):
er startet sofort mit einem fertigen Bahnhof, Signalen, Verträgen und viel Geld.

Sprites neu erzeugen (Python 3 mit Pillow und NumPy):

```bash
npm run sprites
```

## Spielinhalt

- **Karten:** Donautal, Alpenbahn, Pannonische Ebene, Industrierevier, Wüstenbahn und Schneeland –
  jede mit eigenem Gelände, Wetter, Startkapital, Ortsnamen, Bahnunternehmen und Lokalzeitung.
- **Bauen:** Land kaufen, Bahnsteige, Gleise, Weichen (auch Schnellfahrweichen), Kurven, Diagonalen, Kreuzungen,
  Signale und Rangiersignale, Oberleitung, Unterführungen und Brücken, Empfangsgebäude mit eigenem Namen, Läden, Deko.
- **Zugverkehr:** viele Unternehmen mit Regional-, Fern-, S-Bahn-, Nacht-, Museums-, Hochgeschwindigkeits- und Güterzügen,
  Triebzüge mit zwei Führerständen, Wendezüge, Linksverkehr auf zweigleisiger Strecke, Sonderzüge.
- **Betrieb:** Blocksignale mit Fahrstraßenreservierung und vorausschauendem Fahrdienstleiter (keine Deadlocks),
  Abstellgleise, Verschubbereiche, Remise, Werkstatt, Waschanlage, Abrollberg mit Richtungsgleisen,
  Privatbahnen (Sägewerk, Bergwerk) mit eigenen Ladegleisen.
- **Ereignisse:** Tag und Nacht, Regen und Schnee, Störungen an Weichen und Signalen (Störtrupp oder eigene Instandhalter),
  Zeitungsmeldungen mit Fotos, Anfragen mit Entscheidungen, Briefe vom Bahnvorstand und von der Bank.
- **Wirtschaft:** Ausschreibungen und Anfragen (als Brief oder Anruf), Verträge mit Preisen und Takt, Kündigungen,
  Läden mit eigenen Preisen, tägliche Instandhaltung, Personal, automatischer Kredit mit Zinsen, Pleite bei −50 000 €.
- **Fortschritt:** Tutorial (abwählbar), Aufträge, Forschungsbaum, Tagesziele, Bahnhofs-Bewertung mit Sternen,
  Erfolge, Statistik, mehrere Spielstände mit Autosave und Schnellspeichern.
- **Fahrgäste:** kleine Pixelmenschen mit Stimmung; sie nutzen nur Bahnsteige mit Zugang zum Empfangsgebäude.

## Steuerung

| Taste | Funktion |
| --- | --- |
| Maus ziehen / WASD | Karte verschieben |
| Mausrad | Zoom |
| 1–0, B, N, X | Werkzeuge |
| R | Variante bzw. Fahrtrichtung wechseln |
| Rechtsklick | Abbrechen |
| Leertaste | Pause |
| + / − | Spieltempo |
| F | Forschung |
| V | Verträge |
| T | Fahrplan (Weg-Zeit-Diagramm) |
| F5 / Strg+S | Schnellspeichern |
| ↑ / ↓, Enter | Karte wählen (beim neuen Spiel) |
| Esc | Werkzeug weglegen, sonst Hauptmenü |

Über einen Zug fahren zeigt seine Daten; ein Klick auf ein Empfangsgebäude benennt den Bahnhof um.

## Technik

- TypeScript, [Phaser 3](https://phaser.io/), Vite
- Schrift: VT323 (über `@fontsource/vt323`)
- Sprites werden mit `tools/gen_sprites.py` erzeugt und liegen in `public/assets/gen/`

## Projektstruktur

```
src/
  config.ts          Konstanten (Kartengröße, Preise, Zeit)
  main.ts            Einstieg
  game/              Spielstand, Aufträge, Forschung, Verträge, Ziele, Erfolge, Briefe, Speichern
  dev/               Demobahnhof (nur Entwicklung)
  sim/               Zugsimulation und Bahnunternehmen
  world/             Karten, Raster, Gleisteile, Gebäude, Betriebe, Gleisnetz (Blöcke, Wege)
  render/            Phaser-Szene, Fahrgäste, Tiere, Licht, Wetter, Geräusche
  ui/                Oberfläche (HUD, Forschung, Verträge, Fahrplan, Zeitung, Porträts)
tools/               Python-Sprite-Generator
public/assets/gen/   erzeugte Sprites und Icons
```
