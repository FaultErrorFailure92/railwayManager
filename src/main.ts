import '@fontsource/vt323/400.css';
import './style.css';
import Phaser from 'phaser';
import { Game } from './game/Game';
import { loadSave, writeSave } from './game/storage';
import { GameScene, UiState } from './render/GameScene';
import { Hud } from './ui/Hud';

let game: Game;
let freshStart = false;
try { freshStart = sessionStorage.getItem('rm_new') === '1'; sessionStorage.removeItem('rm_new'); } catch { /* egal */ }
const saved = freshStart ? undefined : loadSave();
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
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1b2130',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene,
  });
  new Hud(game, ui, () => (scene.sys?.isActive() ? scene : undefined), !!saved, freshStart);

  // automatisch speichern
  setInterval(() => { if (game.company) writeSave(game.save()); }, 30_000);
  window.addEventListener('beforeunload', () => { if (game.company) writeSave(game.save()); });

  // Für Tests/Debugging in der Konsole
  (window as unknown as { rm: unknown }).rm = { game, ui, phaser, scene };
}
start();
