import type { GameEvent, SoldierKind } from './game/types';

const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0]; // C D E G A（宫商角徵羽）
const NOTE_NAMES: Record<SoldierKind, '刀' | '枪' | '弓' | '骑' | '忠'> = {
  刀: '刀',
  枪: '枪',
  弓: '弓',
  骑: '骑',
  忠: '忠',
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private bgmStep = 0;
  private bgmOn = false;
  muted = false;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      // 预生成白噪声 buffer
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.value = m ? 0 : 0.7;
    }
    if (m) this.stopBgm();
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** 单音包络：attack 5ms，指数衰减 */
  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    peak = 0.3,
    decayMul = 3,
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decayMul);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur * decayMul + 0.02);
  }

  /** 频率扫描 */
  private sweep(f0: number, f1: number, dur: number, type: OscillatorType, peak = 0.3): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, peak = 0.2, filterFreq = 2000, type: BiquadFilterType = 'highpass'): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private arp(dir: 1 | -1, peak = 0.25): void {
    if (!this.ctx || this.muted) return;
    const notes = dir === 1 ? SCALE : [...SCALE].reverse();
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.3, 'triangle', peak, 2), i * 120);
    });
  }

  play(e: GameEvent): void {
    if (!this.ctx || this.muted) return;
    switch (e.t) {
      case 'recruit':
        this.tone(2200, 0.05, 'square', 0.12, 4);
        setTimeout(() => this.tone(2600, 0.05, 'square', 0.1, 4), 40);
        break;
      case 'deploy':
        this.tone(160, 0.08, 'sine', 0.25, 2);
        this.noise(0.04, 0.06, 800, 'lowpass');
        break;
      case 'merge':
        this.tone(660, 0.12, 'triangle', 0.22, 2);
        setTimeout(() => this.tone(990, 0.18, 'triangle', 0.22, 2), 80);
        this.noise(0.15, 0.1, 3000, 'bandpass');
        break;
      case 'sell':
        this.tone(440, 0.06, 'triangle', 0.15, 3);
        break;
      case 'shoot': {
        const k = NOTE_NAMES[e.kind];
        switch (k) {
          case '刀':
            this.noise(0.06, 0.14, 2500);
            break;
          case '枪':
            this.sweep(900, 200, 0.1, 'sawtooth', 0.15);
            break;
          case '弓':
            this.sweep(1800, 900, 0.12, 'triangle', 0.18);
            break;
          case '骑':
            this.tone(90, 0.25, 'square', 0.25, 2);
            this.noise(0.1, 0.1, 400, 'lowpass');
            break;
          case '忠':
            break;
        }
        break;
      }
      case 'hit':
        this.tone(220 + Math.random() * 60, 0.05, 'square', 0.08, 4);
        break;
      case 'kill':
        this.tone(440, 0.06, 'triangle', 0.18, 3);
        this.noise(0.05, 0.06, 1500);
        break;
      case 'leak':
        this.tone(60, 0.3, 'sine', 0.35, 1.5);
        break;
      case 'waveStart':
        this.sweep(220, 330, 0.4, 'sawtooth', 0.2);
        break;
      case 'boss':
        [0, 180, 360].forEach((ms) => setTimeout(() => this.tone(80, 0.2, 'square', 0.3, 2), ms));
        break;
      case 'won':
        this.arp(1, 0.22);
        break;
      case 'lost':
        this.arp(-1, 0.22);
        break;
    }
  }

  ui(name: 'click' | 'error'): void {
    if (!this.ctx || this.muted) return;
    if (name === 'click') this.tone(880, 0.04, 'square', 0.08, 3);
    else this.sweep(300, 120, 0.15, 'sawtooth', 0.15);
  }

  startBgm(): void {
    if (!this.ctx || this.muted || this.bgmOn) return;
    this.bgmOn = true;
    this.bgmStep = 0;
    this.bgmTick();
  }

  private bgmTick = (): void => {
    if (!this.ctx || !this.bgmOn || this.muted) return;
    const t = this.ctx.currentTime;
    const f = SCALE[Math.floor(this.bgmStep) % SCALE.length];
    const octave = Math.random() < 0.3 ? 0.5 : 1;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f * octave;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g);
    if (this.master) g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.8);

    const dur = 700 + Math.random() * 500;
    this.bgmStep += Math.random() < 0.5 ? 1 : 2;
    setTimeout(this.bgmTick, dur);
  };

  stopBgm(): void {
    this.bgmOn = false;
  }
}