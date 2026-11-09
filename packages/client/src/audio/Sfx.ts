import type { SettingsStore } from '../settings/Settings';

/** Effets sonores du jeu (cahier des charges : pose de bombe, explosion, bonus, fin du temps). */
export type SfxName =
  | 'click'
  | 'bombPlace'
  | 'explosion'
  | 'pickup'
  | 'hurt'
  | 'suddenDeath'
  | 'roundEnd'
  | 'victory'
  | 'start';

interface Tone {
  /** Fréquence de départ puis d'arrivée, en Hz. */
  from: number;
  to: number;
  /** Début (s) et durée (s) de la note. */
  at: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const TONES: Partial<Record<SfxName, Tone[]>> = {
  click: [{ from: 660, to: 880, at: 0, duration: 0.06, type: 'square', gain: 0.18 }],
  bombPlace: [
    { from: 220, to: 110, at: 0, duration: 0.12, type: 'square', gain: 0.25 },
    { from: 330, to: 330, at: 0.1, duration: 0.05, type: 'square', gain: 0.15 },
  ],
  pickup: [
    { from: 523, to: 523, at: 0, duration: 0.07, type: 'square', gain: 0.2 },
    { from: 659, to: 659, at: 0.07, duration: 0.07, type: 'square', gain: 0.2 },
    { from: 784, to: 1047, at: 0.14, duration: 0.14, type: 'square', gain: 0.2 },
  ],
  hurt: [{ from: 400, to: 80, at: 0, duration: 0.35, type: 'sawtooth', gain: 0.25 }],
  suddenDeath: [
    { from: 880, to: 880, at: 0, duration: 0.15, type: 'square', gain: 0.25 },
    { from: 660, to: 660, at: 0.2, duration: 0.15, type: 'square', gain: 0.25 },
    { from: 880, to: 880, at: 0.4, duration: 0.15, type: 'square', gain: 0.25 },
    { from: 660, to: 660, at: 0.6, duration: 0.2, type: 'square', gain: 0.25 },
  ],
  roundEnd: [
    { from: 392, to: 392, at: 0, duration: 0.12, type: 'triangle', gain: 0.3 },
    { from: 330, to: 330, at: 0.14, duration: 0.12, type: 'triangle', gain: 0.3 },
    { from: 262, to: 262, at: 0.28, duration: 0.25, type: 'triangle', gain: 0.3 },
  ],
  victory: [
    { from: 523, to: 523, at: 0, duration: 0.12, type: 'square', gain: 0.22 },
    { from: 659, to: 659, at: 0.12, duration: 0.12, type: 'square', gain: 0.22 },
    { from: 784, to: 784, at: 0.24, duration: 0.12, type: 'square', gain: 0.22 },
    { from: 1047, to: 1047, at: 0.36, duration: 0.35, type: 'square', gain: 0.22 },
  ],
  start: [
    { from: 440, to: 440, at: 0, duration: 0.1, type: 'square', gain: 0.2 },
    { from: 880, to: 880, at: 0.14, duration: 0.2, type: 'square', gain: 0.2 },
  ],
};

/** Synthétise les effets avec WebAudio (aucun fichier audio) et applique les volumes choisis. */
export class Sfx {
  private context: AudioContext | null = null;

  constructor(private readonly settings: SettingsStore) {}

  /** Joue un effet. Le son démarre après le premier geste de l'utilisateur (règle des navigateurs). */
  play(name: SfxName): void {
    const volume = this.settings.data.masterVolume * this.settings.data.sfxVolume;
    if (volume <= 0) return;
    const ctx = this.audio();
    if (!ctx) return;
    if (name === 'explosion') {
      this.explosion(ctx, volume);
      return;
    }
    for (const tone of TONES[name] ?? []) this.tone(ctx, tone, volume);
  }

  private audio(): AudioContext | null {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }

  private tone(ctx: AudioContext, tone: Tone, volume: number): void {
    const start = ctx.currentTime + tone.at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), start + tone.duration);
    gain.gain.setValueAtTime(tone.gain * volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }

  private explosion(ctx: AudioContext, volume: number): void {
    const length = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7 * volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    this.tone(ctx, { from: 140, to: 40, at: 0, duration: 0.4, type: 'sine', gain: 0.5 }, volume);
  }
}
