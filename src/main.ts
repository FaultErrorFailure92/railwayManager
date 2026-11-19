import '@fontsource/vt323/400.css';
import './style.css';
import Phaser from 'phaser';
import { Game } from './game/Game';
import { adoptSlots, backupBroken, listSlots, loadSave, rawSave, writeSave } from './game/storage';
import { applySetup, type NewGameSetup } from './game/FreePlay';
import { flushLife } from './game/Lifetime';
import { activeProfile, createProfile, listProfiles, profilesInitialized } from './game/Profiles';
import { downloadReport, installCrashGuard, reportError } from './game/crash';
import { GameScene, UiState } from './render/GameScene';
import { Hud } from './ui/Hud';
import { currentMap, setMap } from './world/maps';
import { prepareMap } from './game/CustomMaps';
import { Music } from './render/Music';
import { applySettings } from './game/settings';
import { isDesktop, pushStore, setPresence, unlockAchievement } from './platform/Platform';

applySettings();

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
// neues Spiel aus Kampagne / freiem Spiel (Profil, Modus, Regeln)
let setup: NewGameSetup | undefined;
try {
  const raw = freshStart ? sessionStorage.getItem('rm_setup') : null;
  sessionStorage.removeItem('rm_setup');
  if (raw) setup = JSON.parse(raw) as NewGameSetup;
} catch { /* egal */ }
// eigene Karte (RM-FR-MOD-04): aus dem Spielstand oder aus der Bibliothek
prepareMap(mapId, freshStart ? undefined : saved?.customMap);
setMap(mapId);
// Musik: Thema der Karte (RM-FR-UI-10)
Music.play(currentMap().base ?? currentMap().id);
try {
  game = new Game(saved);
} catch (e) {
  console.warn('Spielstand konnte nicht geladen werden', e);
  reportError(e, 'Laden');
  // defekten Stand aufheben, bevor ihn das Autosave überschreibt
  const raw = rawSave();
  if (raw) backupBroken(raw, 'Fehler beim Laden');
  game = new Game();
}
if (setup) applySetup(game, setup);
adoptOldSaves(game);
installCrashGuard(() => (game.company ? game.save() : undefined), showCrash);

/** Update auf Profile (RM-FR-PROF-02): bisherige Firma wird zum ersten Profil, alte Spielstände gehören dazu */
function adoptOldSaves(g: Game) {
  // nur beim allerersten Umstieg auf Profile – nicht nachdem das letzte Profil gekündigt wurde
  if (!listProfiles().length && !profilesInitialized()) {
    const slot = listSlots()[0];
    const company = g.company || slot?.company;
    if (!company) return;
    const p = createProfile(company, g.company ? g.player : { name: '', title: '', avatar: 0 });
    adoptSlots(p.id);
  }
  if (g.company && !g.profileId) g.profileId = activeProfile()?.id;
}

/** Fenster nach einem Fehler (RM-FR-CRASH-01) */
function showCrash(saved: boolean) {
  const box = document.getElementById('crash');
  if (!box) return;
  document.getElementById('cr-saved')!.textContent = saved
    ? 'Dein Spielstand wurde als „Notsicherung“ gesichert.'
    : 'Der Spielstand konnte nicht gesichert werden – das letzte Autosave bleibt erhalten.';
  box.classList.remove('hidden');
}
document.getElementById('cr-go')!.onclick = () => document.getElementById('crash')!.classList.add('hidden');
document.getElementById('cr-report')!.onclick = () => downloadReport();
document.getElementById('cr-reload')!.onclick = () => location.reload();
game.startMission();
const ui: UiState = { tool: 'select', variant: {}, message: '', hoverTrain: null, hoverPerson: null, mouse: { x: 0, y: 0 }, menu: true, stationClick: null };
let scene = new GameScene(game, ui);

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
    fps: { limit: 1000 },
  });
  saveBattery(phaser, game, ui);
  const hud = new Hud(game, ui, () => (scene.sys?.isActive() ? scene : undefined), !!saved || demo, freshStart && !demo);

  // Spielstand laden ohne Neuladen (RM-FR-PERF-04)
  hud.onLoad = () => {
    const s = loadSave();
    if (!s) return false;
    const t0 = performance.now();
    try {
      prepareMap(s.mapId, s.customMap);
      setMap(s.mapId);
      game.adopt(new Game(s));
    } catch (e) {
      console.warn('Spielstand konnte nicht geladen werden', e);
      return false;
    }
    adoptOldSaves(game);
    game.startMission();
    if (isDesktop()) game.achievements.forEach(unlockAchievement);
    Music.play(currentMap().base ?? currentMap().id);
    Object.assign(ui, { tool: 'select', message: '', hoverTrain: null, hoverPerson: null, stationClick: null });
    phaser.scene.remove('game');
    scene = new GameScene(game, ui);
    phaser.scene.add('game', scene, true);
    (window as unknown as { rm: { scene: GameScene } }).rm.scene = scene;
    console.info(`Spielstand geladen in ${Math.round(performance.now() - t0)} ms`);
    return true;
  };

  // automatisch speichern
  setInterval(() => { if (game.company) writeSave(game.save()); flushLife(game); void pushStore(); }, 30_000);
  window.addEventListener('beforeunload', () => { if (game.company) writeSave(game.save()); flushLife(game); void pushStore(); });
  // Desktop-App (RM-FR-STEAM-04/05): bisherige Erfolge nachmelden, Rich Presence
  if (isDesktop()) {
    game.achievements.forEach(unlockAchievement);
    setInterval(() => setPresence(game.company ? `${currentMap().name} · Tag ${Math.floor(game.sim.time / 86400) + 1}` : 'im Menü'), 60_000);
  }

  // Für Tests/Debugging in der Konsole
  (window as unknown as { rm: unknown }).rm = { game, ui, phaser, scene, hud };
}
start();

/** Akku schonen (RM-FR-PERF-05): weniger Bilder bei Pause, im Menü oder ohne Eingabe */
function saveBattery(phaser: Phaser.Game, g: Game, u: { menu: boolean }) {
  let lastInput = performance.now();
  const touch = () => { lastInput = performance.now(); };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true });
  setInterval(() => {
    const quiet = performance.now() - lastInput;
    const fps = quiet < 3000 ? 0 : g.paused ? 15 : u.menu || quiet > 60_000 ? 30 : 0;
    (phaser.loop as unknown as { _limitRate: number })._limitRate = fps ? 1000 / fps : 0;
  }, 500);
}
