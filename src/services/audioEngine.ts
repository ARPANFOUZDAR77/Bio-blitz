import { AbilityId } from '../types';

/**
 * 100% Procedural Web Audio API Synthesizer for BIOBLITZ: Micro Survival.
 * Generates organic bloodstream hydro-drones, flagella movement pulses,
 * nutrient chimes, cellular damage impacts, and biological ability cues
 * with zero external audio file dependencies.
 */
export class BioAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private ambientOsc1: OscillatorNode | null = null;
  private ambientOsc2: OscillatorNode | null = null;
  private ambientLfo: OscillatorNode | null = null;
  private isAmbientPlaying = false;

  private musicVolume = 0.55;
  private sfxVolume = 0.75;
  private muted = false;
  private lastMoveSoundTime = 0;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();

    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.applyVolumes();
  }

  public setVolumes(musicVolume: number, sfxVolume: number, muted: boolean): void {
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.28, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.65, now, 0.03);
  }

  public startAmbientBloodstream(): void {
    this.init();
    if (!this.ctx || !this.musicGain || this.isAmbientPlaying) return;

    try {
      const now = this.ctx.currentTime;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, now);

      this.ambientOsc1 = this.ctx.createOscillator();
      this.ambientOsc1.type = 'sine';
      this.ambientOsc1.frequency.setValueAtTime(55, now); // Deep sub-bass pulse

      this.ambientOsc2 = this.ctx.createOscillator();
      this.ambientOsc2.type = 'triangle';
      this.ambientOsc2.frequency.setValueAtTime(82.41, now); // Harmonic fifth

      // Arterial pulse LFO (simulates rhythmic bloodstream flow ~60 BPM)
      this.ambientLfo = this.ctx.createOscillator();
      this.ambientLfo.type = 'sine';
      this.ambientLfo.frequency.setValueAtTime(1.05, now);

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(65, now);

      this.ambientLfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      this.ambientOsc1.connect(filter);
      this.ambientOsc2.connect(filter);
      filter.connect(this.musicGain);

      this.ambientOsc1.start(now);
      this.ambientOsc2.start(now);
      this.ambientLfo.start(now);
      this.isAmbientPlaying = true;
    } catch {
      // Ignore autoplay restriction until user gesture
    }
  }

  public stopAmbientBloodstream(): void {
    if (!this.isAmbientPlaying) return;
    try {
      this.ambientOsc1?.stop();
      this.ambientOsc2?.stop();
      this.ambientLfo?.stop();
      this.ambientOsc1?.disconnect();
      this.ambientOsc2?.disconnect();
      this.ambientLfo?.disconnect();
    } catch {
      // Ignore
    }
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
    this.ambientLfo = null;
    this.isAmbientPlaying = false;
  }

  public playNutrientCollect(comboPitch = 1.0): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const baseFreq = 520 * Math.min(1.6, Math.max(0.85, comboPitch));
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.48, now + 0.13);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playFlagellaSwim(isSprinting: boolean): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const nowMs = performance.now();
    const interval = isSprinting ? 140 : 260;
    if (nowMs - this.lastMoveSoundTime < interval) return;
    this.lastMoveSoundTime = nowMs;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isSprinting ? 175 : 120, now);
    osc.frequency.exponentialRampToValueAtTime(isSprinting ? 95 : 75, now + 0.08);

    gain.gain.setValueAtTime(isSprinting ? 0.09 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playDash(): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playDamage(): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.28);

    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playGrowth(): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const notes = [330, 440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public playAbilityActivate(abilityId: AbilityId): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    switch (abilityId) {
      case AbilityId.FLAGELLA_BOOST:
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.28);
        break;
      case AbilityId.MEMBRANE_SHIELD:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(293.66, now);
        osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.35);
        break;
      case AbilityId.CHEMOTAXIS:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, now);
        osc.frequency.exponentialRampToValueAtTime(392, now + 0.32);
        break;
      case AbilityId.BINARY_FISSION:
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(329.63, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.4);
        break;
    }

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.44);
  }

  public playGameOver(): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const start = now + idx * 0.14;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.24, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }
}

export const bioAudio = new BioAudioEngine();
