/**
 * Musik (RM-FR-UI-10): ruhiger Chiptune-Soundtrack, live per WebAudio erzeugt (keine Dateien).
 * Jede Karte hat ihr eigenes Thema: Tonart, Tempo, Takt, Klangfarbe und eine fest ausgewürfelte Melodie.
 * Abschaltbar über die Einstellungen (Lautstärke 0) und den Ton-Knopf in der Titelleiste.
 */
import { onSettings, settings } from '../game/settings';
import { audioCtx, onMute, Sound } from './Sound';

export interface Theme {
  name: string;
  /** Grundton (MIDI) */
  root: number;
  /** Tonleiter in Halbtönen */
  scale: number[];
  bpm: number;
  /** Schläge pro Takt (3 = Walzer) */
  meter: 3 | 4;
  /** Akkordfolge als Stufen der Tonleiter (0 = Grundton) */
  prog: number[];
  lead: OscillatorType;
  bass: OscillatorType;
  /** leises Rauschen auf den Nachschlägen */
  hat: boolean;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];

export const THEMES: Record<string, Theme> = {
  donau: { name: 'Donauwalzer-Takt', root: 62, scale: MAJOR, bpm: 132, meter: 3, prog: [0, 4, 4, 0, 3, 0, 4, 0], lead: 'square', bass: 'triangle', hat: false },
  alpen: { name: 'Almrausch', root: 55, scale: MIXO, bpm: 96, meter: 4, prog: [0, 3, 6, 0], lead: 'triangle', bass: 'triangle', hat: false },
  ebene: { name: 'Weites Land', root: 57, scale: DORIAN, bpm: 100, meter: 4, prog: [0, 3, 0, 4], lead: 'square', bass: 'triangle', hat: true },
  revier: { name: 'Schicht im Schacht', root: 52, scale: MINOR, bpm: 96, meter: 4, prog: [0, 5, 2, 6], lead: 'sawtooth', bass: 'square', hat: true },
  wueste: { name: 'Oasenexpress', root: 52, scale: PHRYG_DOM, bpm: 88, meter: 4, prog: [0, 1, 0, 6], lead: 'square', bass: 'triangle', hat: true },
  stadt: { name: 'Großstadtlichter', root: 57, scale: MINOR, bpm: 118, meter: 4, prog: [0, 5, 3, 4], lead: 'square', bass: 'sawtooth', hat: true },
  schnee: { name: 'Nordlicht', root: 53, scale: LYDIAN, bpm: 76, meter: 4, prog: [0, 1, 4, 0], lead: 'sine', bass: 'triangle', hat: false },
};

/** eine Note: Startschritt (Achtel), Länge in Achteln, MIDI-Ton */
export interface Note { at: number; len: number; midi: number }
export interface Song { steps: number; bpm: number; lead: Note[]; bass: Note[]; arp: Note[]; hat: number[]; theme: Theme }

/** reproduzierbarer Zufall aus dem Kartennamen */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rhythmen je Takt in Achteln */
const RHYTHMS: Record<3 | 4, number[][]> = {
  3: [[2, 2, 2], [3, 1, 2], [4, 2], [2, 1, 1, 2], [6]],
  4: [[2, 2, 2, 2], [3, 1, 2, 2], [2, 2, 4], [4, 2, 2], [1, 1, 2, 2, 2], [3, 3, 2], [8]],
};

/** Stück für eine Karte komponieren: Teil A und B über die Akkordfolge, dann von vorn */
export function compose(mapId: string): Song {
  const th = THEMES[mapId] ?? THEMES.donau;
  const r = rng(mapId);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const bar = th.meter * 2;
  const tone = (deg: number, oct = 0) => {
    const o = Math.floor(deg / 7);
    return th.root + th.scale[((deg % 7) + 7) % 7] + 12 * (o + oct);
  };
  const lead: Note[] = [], bass: Note[] = [], arp: Note[] = [], hat: number[] = [];
  // Teil A, Teil A' (Variation), Teil B, Teil A
  const prog = th.prog.length >= 8 ? th.prog : [...th.prog, ...th.prog];
  const motif: { rh: number[]; moves: number[] }[] = prog.map(() => {
    const rh = pick(RHYTHMS[th.meter]);
    return { rh, moves: rh.map(() => pick([-2, -1, -1, 0, 1, 1, 2])) };
  });
  const sections = ['A', 'A2', 'B', 'A'] as const;
  let step = 0;
  for (const sec of sections) {
    let deg = 7 + (sec === 'B' ? 2 : 0);
    prog.forEach((ch, i) => {
      const m = sec === 'B' ? { rh: pick(RHYTHMS[th.meter]), moves: [] as number[] } : motif[i];
      const last = i === prog.length - 1;
      let at = step;
      m.rh.forEach((len, j) => {
        // betonte Zählzeit: auf einen Akkordton ziehen, sonst schrittweise
        const mv = m.moves[j] ?? pick([-1, 1, 2, -2]);
        deg += sec === 'A2' && j === m.rh.length - 1 ? -mv : mv;
        if (j === 0) { const tones = [ch, ch + 2, ch + 4, ch + 7]; deg = tones.reduce((a, b) => (Math.abs(b + 7 - deg) < Math.abs(a + 7 - deg) ? b : a)) + 7; }
        deg = Math.max(4, Math.min(13, deg));
        if (last && j === m.rh.length - 1) deg = 7; // Schluss auf dem Grundton
        // ab und zu Pause statt Ton (ruhiger)
        const end = last && j === m.rh.length - 1;
        if (end || !(j > 0 && r() < 0.12)) lead.push({ at, len, midi: tone(deg) });
        at += len;
      });
      // Bass: Walzer „um-pa-pa“, sonst Grundton + Quinte
      if (th.meter === 3) {
        bass.push({ at: step, len: 2, midi: tone(ch, -1) });
        arp.push({ at: step + 2, len: 2, midi: tone(ch + 2) }, { at: step + 4, len: 2, midi: tone(ch + 4) });
      } else {
        bass.push({ at: step, len: 3, midi: tone(ch, -1) }, { at: step + 4, len: 3, midi: tone(ch + 4, -1) });
        for (let k = 0; k < bar; k += 2) arp.push({ at: step + k, len: 1, midi: tone(ch + [0, 2, 4, 2][(k / 2) % 4]) });
      }
      if (th.hat) for (let k = 1; k < bar; k += 2) hat.push(step + k);
      step += bar;
    });
  }
  return { steps: step, bpm: th.bpm, lead, bass, arp, hat, theme: th };
}

// ------------------------------------------------------------ Abspielen
const freq = (m: number) => 440 * 2 ** ((m - 69) / 12);
const LOOKAHEAD = 0.3;

let song: Song | null = null;
let gain: GainNode | null = null;
let pos = 0;
let nextTime = 0;
let timer: number | null = null;
let noiseBuf: AudioBuffer | null = null;

function level() { return Sound.muted ? 0 : (settings.music / 100) * 0.22; }

function applyLevel() {
  const a = audioCtx();
  if (!a || !gain) return;
  gain.gain.cancelScheduledValues(a.currentTime);
  gain.gain.setTargetAtTime(level(), a.currentTime, 0.4);
}

function note(a: AudioContext, n: Note, t: number, step: number, type: OscillatorType, vol: number) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.value = freq(n.midi);
  const dur = n.len * step;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.setTargetAtTime(vol * 0.55, t + 0.05, 0.1);
  g.gain.setTargetAtTime(0, t + dur * 0.85, 0.05);
  o.connect(g).connect(gain!);
  o.start(t);
  o.stop(t + dur + 0.3);
}

function tick() {
  // vor dem ersten Klick nichts anfassen (sonst warnt der Browser bei jedem Takt)
  if (!song || !gain) return;
  const a = audioCtx();
  if (!a) return;
  if (a.state !== 'running' || level() <= 0) { nextTime = a.currentTime + 0.05; return; }
  const step = 60 / song.bpm / 2;
  if (nextTime < a.currentTime) nextTime = a.currentTime + 0.05;
  while (nextTime < a.currentTime + LOOKAHEAD) {
    const th = song.theme;
    for (const n of song.lead) if (n.at === pos) note(a, n, nextTime, step, th.lead, th.lead === 'sawtooth' ? 0.05 : th.lead === 'square' ? 0.07 : 0.14);
    for (const n of song.bass) if (n.at === pos) note(a, n, nextTime, step, th.bass, th.bass === 'square' ? 0.06 : 0.16);
    for (const n of song.arp) if (n.at === pos) note(a, n, nextTime, step, th.meter === 3 ? 'triangle' : 'square', th.meter === 3 ? 0.07 : 0.025);
    if (song.hat.includes(pos)) hatAt(a, nextTime);
    nextTime += step;
    pos = (pos + 1) % song.steps;
  }
}

function hatAt(a: AudioContext, t: number) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate / 10, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf;
  f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(0.025, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f).connect(g).connect(gain!);
  s.start(t); s.stop(t + 0.06);
}

export const Music = {
  /** Thema einer Karte spielen (startet erst nach dem ersten Klick – Vorgabe der Browser) */
  play(mapId: string) {
    song = compose(mapId);
    pos = 0;
    if (timer === null && typeof window !== 'undefined') {
      timer = window.setInterval(tick, 100);
      const wake = () => {
        const a = audioCtx();
        if (!a) return;
        if (!gain) { gain = a.createGain(); gain.gain.value = 0; gain.connect(a.destination); }
        applyLevel();
        window.removeEventListener('pointerdown', wake);
        window.removeEventListener('keydown', wake);
      };
      window.addEventListener('pointerdown', wake);
      window.addEventListener('keydown', wake);
      onSettings(applyLevel);
      onMute(applyLevel);
      // Tab im Hintergrund: leise
      document.addEventListener('visibilitychange', () => {
        const a = audioCtx();
        if (a && gain) gain.gain.setTargetAtTime(document.hidden ? 0 : level(), a.currentTime, 0.2);
      });
    }
  },
  get title() { return song?.theme.name ?? ''; },
};
