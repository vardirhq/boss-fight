/** Tiny WebAudio synth for battle SFX, ported from the original prototype. */

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to: number;
  dur: number;
  gain?: number;
  sweep?: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Lazily create/resume the AudioContext (must follow a user gesture). */
  private ac(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Wake the audio context on the first interaction. */
  prime(): void {
    this.ac();
  }

  private tone(ac: AudioContext, t0: number, o: ToneOpts): void {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.sweep) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const g = o.gain ?? 0.3;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(g, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(ac: AudioContext, t0: number, dur: number, gain: number): void {
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t0);
  }

  hit(crit: boolean): void {
    const ac = this.ac();
    if (!ac) return;
    const t = ac.currentTime;
    this.noise(ac, t, crit ? 0.12 : 0.07, crit ? 0.32 : 0.22);
    this.tone(ac, t, { type: 'square', from: crit ? 180 : 150, to: crit ? 60 : 55, dur: crit ? 0.16 : 0.11, gain: crit ? 0.28 : 0.2, sweep: true });
    if (crit) this.tone(ac, t + 0.02, { type: 'sawtooth', from: 420, to: 880, dur: 0.14, gain: 0.14, sweep: true });
  }

  explode(): void {
    const ac = this.ac();
    if (!ac) return;
    const t = ac.currentTime;
    this.noise(ac, t, 0.5, 0.5);
    this.tone(ac, t, { type: 'sine', from: 220, to: 40, dur: 0.5, gain: 0.42, sweep: true });
    this.tone(ac, t + 0.02, { type: 'triangle', from: 90, to: 30, dur: 0.4, gain: 0.3, sweep: true });
  }

  victory(): void {
    const ac = this.ac();
    if (!ac) return;
    const t = ac.currentTime + 0.12;
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(ac, t + i * 0.11, { type: 'square', from: f, to: f, dur: 0.16, gain: 0.22 });
    });
  }
}

export function buzz(kind: 'hit' | 'crit' | 'win', haptics: boolean): void {
  if (!haptics || !navigator.vibrate) return;
  const p = kind === 'win' ? [40, 40, 40, 40, 120] : kind === 'crit' ? [45] : [18];
  navigator.vibrate(p);
}
