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

/** Rauschen (Dampf, Bremsen, Diesel-Brummen) */
let noiseBuf: AudioBuffer | null = null;
function noise(start: number, dur: number, vol: number, freq: number, q = 1, freqEnd?: number, attack = 0.05) {
  const a = ac();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
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
  /** Anfahren je nach Antrieb */
  depart(traction: string) {
    if (!allowed(`dep-${traction}`, 2500)) return;
    if (traction === 'electric') {
      // Umrichter: steigendes Singen in Stufen
      tone(220, 0, 1.6, 'sine', 0.02, 520);
      tone(440, 0.1, 1.5, 'triangle', 0.01, 900);
      tone(660, 0.6, 1.2, 'sine', 0.008, 600);
    } else if (traction === 'steam') {
      // Tschu – tschu – tschu, immer schneller
      let t = 0;
      for (let i = 0; i < 7; i++) { noise(t, 0.22, 0.05, 900, 0.8); t += 0.55 - i * 0.06; }
      noise(0, 1.2, 0.015, 3000, 0.5, 2500, 0.2);
    } else {
      // Diesel: Motor heult auf und brummt
      tone(45, 0, 2.2, 'sawtooth', 0.03, 35);
      tone(90, 0, 2.0, 'square', 0.008, 60);
      noise(0, 2.0, 0.025, 160, 2, 260, 0.4);
    }
  },
  /** Bremsen je nach Antrieb */
  brake(traction: string) {
    if (!allowed(`brk-${traction}`, 2500)) return;
    if (traction === 'electric') {
      tone(700, 0, 1.4, 'sine', 0.012, -520);
      noise(0.6, 0.8, 0.012, 4200, 6, 3800, 0.2);
    } else if (traction === 'steam') {
      noise(0, 1.6, 0.03, 2600, 0.6, 1800, 0.05);
      noise(1.2, 0.8, 0.02, 4500, 8, 4200, 0.1);
    } else {
      tone(70, 0, 1.4, 'sawtooth', 0.02, -30);
      noise(0.5, 1.0, 0.02, 3800, 8, 3400, 0.15);
    }
  },
  /** Klick bei Erfolg/Kasse */
  coin() {
    if (!allowed('coin', 250)) return;
    tone(988, 0, 0.12, 'triangle', 0.05);
    tone(1319, 0.08, 0.2, 'triangle', 0.05);
  },
};
