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

Sprites neu erzeugen (Python 3 mit Pillow und NumPy):

```bash
npm run sprites
```

## Spielinhalt

- **Bauen:** Land kaufen, Bahnsteige, Gleise, Weichen, Kurven, Diagonalen, Signale, Oberleitung,
  Unterführungen und Brücken, Empfangsgebäude mit eigenem Bahnhofsnamen, Deko.
- **Zugverkehr:** mehrere Unternehmen mit Regional-, Fern-, S-Bahn-, Nacht-, Museums- und Güterzügen,
  kurze und lange Züge, Diesel- und Elektrozüge, Wendezüge mit Stumpfgleisen,
  Linksverkehr auf zweigleisiger Strecke.
- **Betrieb:** Blocksignale mit Fahrstraßenreservierung, Abstellgleise, Remise, Werkstatt,
  Waschanlage (Schmutz und Verschleiß), Abrollberg mit Richtungsgleisen.
- **Wirtschaft:** Verträge mit den Unternehmen (Preise für kurze und lange Züge, Kündigung bei zu hohen Preisen),
  Verspätungen kosten Geld, Kiosk-Einnahmen.
- **Fortschritt:** Aufträge, Forschungsbaum (Forschungspunkte + Zeit), Hauptmenü, Spielstand im Browser.
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
  game/              Spielstand, Aufträge, Forschung, Verträge, Speichern
  sim/               Zugsimulation und Bahnunternehmen
  world/             Raster, Gleisteile, Gebäude, Gleisnetz (Blöcke, Wege)
  render/            Phaser-Szene und Fahrgäste
  ui/                Oberfläche (HUD, Forschung, Verträge)
tools/               Python-Sprite-Generator
public/assets/gen/   erzeugte Sprites und Icons
```
