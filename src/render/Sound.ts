/** Kleine Geräuschkulisse per WebAudio (keine Dateien): Bahnhofsgong und Abfahrtspfiff */
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('rm_mute') === '1'; } catch { /* egal */ }

const last: Record<string, number> = {};

function ac() {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** höchstens alle `gap` ms je Geräusch */
function allowed(key: string, gap: number) {
  if (muted) return false;
  const now = performance.now();
  if (now - (last[key] ?? -1e9) < gap) return false;
  last[key] = now;
  return true;
}

export const Sound = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('rm_mute', muted ? '1' : '0'); } catch { /* egal */ }
    if (!muted) this.gong();
    return muted;
  },
  /** Ding-Dong vor der Durchsage */
  gong() {
    if (!allowed('gong', 4000)) return;
    tone(784, 0, 0.9, 'sine', 0.08);
    tone(523, 0.45, 1.1, 'sine', 0.08);
  },
  /** kurzer Abfahrtspfiff */
  whistle() {
    if (!allowed('whistle', 3000)) return;
    tone(1850, 0, 0.35, 'square', 0.025, 40);
    tone(1850, 0.45, 0.25, 'square', 0.02, 40);
  },
  /** Klick bei Erfolg/Kasse */
  coin() {
    if (!allowed('coin', 250)) return;
    tone(988, 0, 0.12, 'triangle', 0.05);
    tone(1319, 0.08, 0.2, 'triangle', 0.05);
  },
};
