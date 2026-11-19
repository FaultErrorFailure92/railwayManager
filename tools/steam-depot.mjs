// Steam-Depot zusammenstellen (RM-FR-PLAT-02, RM-FR-STEAM-01): Programm + Steam-Bibliothek in einen Ordner.
// Vorher: npm run desktop:steam   Danach: Ordner steam-depot/<system> mit SteamPipe hochladen.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rel = 'src-tauri/target/release';
const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const out = join('steam-depot', os);
mkdirSync(out, { recursive: true });

if (os === 'macos') {
  // .app aus dem Bundle; die Bibliothek gehört nach Contents/MacOS neben das Programm
  const app = join(rel, 'bundle/macos/Bahnhofsmanager.app');
  if (!existsSync(app)) throw new Error(`${app} fehlt – erst npm run desktop:steam`);
  cpSync(app, join(out, 'Bahnhofsmanager.app'), { recursive: true });
} else {
  const exe = os === 'windows' ? 'bahnhofsmanager.exe' : 'bahnhofsmanager';
  if (!existsSync(join(rel, exe))) throw new Error(`${join(rel, exe)} fehlt – erst npm run desktop:steam`);
  cpSync(join(rel, exe), join(out, exe));
}

// Steam-Bibliothek liegt im Build-Ordner von steamworks-sys
const lib = { windows: 'steam_api64.dll', macos: 'libsteam_api.dylib', linux: 'libsteam_api.so' }[os];
const build = join(rel, 'build');
const dir = readdirSync(build).find((d) => d.startsWith('steamworks-sys-') && existsSync(join(build, d, 'out', lib)));
if (!dir) throw new Error(`${lib} nicht gefunden – mit --features steam gebaut?`);
cpSync(join(build, dir, 'out', lib), os === 'macos' ? join(out, 'Bahnhofsmanager.app/Contents/MacOS', lib) : join(out, lib));
console.log(`Steam-Depot: ${out}`);
