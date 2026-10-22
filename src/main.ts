import '@fontsource/vt323/400.css';
import './style.css';
import Phaser from 'phaser';
import { Game } from './game/Game';
import { loadSave, writeSave } from './game/storage';
import { GameScene, UiState } from './render/GameScene';
import { Hud } from './ui/Hud';
import { setMap } from './world/maps';

let game: Game;
let freshStart = false;
try { freshStart = sessionStorage.getItem('rm_new') === '1'; sessionStorage.removeItem('rm_new'); } catch { /* egal */ }
const saved = freshStart ? undefined : loadSave();
// Karte: beim neuen Spiel die gewählte, sonst die des Spielstands
let mapId: string | undefined;
let demo = false;
try {
  mapId = freshStart ? sessionStorage.getItem('rm_map') ?? undefined : saved?.mapId;
  demo = freshStart && import.meta.env.DEV && sessionStorage.getItem('rm_demo') === '1';
  sessionStorage.removeItem('rm_demo');
} catch { /* egal */ }
setMap(mapId);
try {
  game = new Game(saved);
} catch (e) {
  console.warn('Spielstand konnte nicht geladen werden', e);
  game = new Game();
}
game.startMission();
const ui: UiState = { tool: 'select', variant: {}, message: '', hoverTrain: null, mouse: { x: 0, y: 0 }, menu: true, stationClick: null };
const scene = new GameScene(game, ui);

async function start() {
  // Pixelschrift laden, bevor Phaser Texte rendert
  try { await document.fonts.load('16px "VT323"'); } catch { /* egal */ }
  // Demobahnhof nur in der lokalen Entwicklung (npm run dev)
  if (demo && import.meta.env.DEV) {
    const { buildDemo } = await import('./dev/demo');
    buildDemo(game);
  }
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1b2130',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene,
  });
  new Hud(game, ui, () => (scene.sys?.isActive() ? scene : undefined), !!saved || demo, freshStart && !demo);

  // automatisch speichern
  setInterval(() => { if (game.company) writeSave(game.save()); }, 30_000);
  window.addEventListener('beforeunload', () => { if (game.company) writeSave(game.save()); });

  // Für Tests/Debugging in der Konsole
  (window as unknown as { rm: unknown }).rm = { game, ui, phaser, scene };
}
start();
