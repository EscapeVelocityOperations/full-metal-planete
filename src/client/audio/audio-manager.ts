/**
 * Audio Manager for Full Metal Planète
 *
 * Provides synthesized sound effects using Web Audio API.
 * All sounds are procedurally generated - no external audio files needed.
 */

export type SoundEffect =
  | 'turnStart'
  | 'turnEnd'
  | 'unitSelect'
  | 'unitDeselect'
  | 'move'
  | 'moveComplete'
  | 'load'
  | 'unload'
  | 'fire'
  | 'explosion'
  | 'capture'
  | 'build'
  | 'tideChange'
  | 'timerWarning'
  | 'timerCritical'
  | 'liftOff'
  | 'landing'
  | 'error'
  | 'success'
  | 'click';

interface AudioSettings {
  masterVolume: number;
  muted: boolean;
  sfxVolume: number;
}

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 0.5,
  muted: false,
  sfxVolume: 0.7,
};

const STORAGE_KEY = 'fmp-audio-settings';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private settings: AudioSettings;
  private masterGain: GainNode | null = null;
  private initialized: boolean = false;

  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * Initialize the audio context.
   * Must be called from a user gesture (click/keypress) due to browser autoplay policies.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.updateVolume();
      this.initialized = true;
      console.log('AudioManager initialized');
    } catch (error) {
      console.warn('Failed to initialize audio:', error);
    }
  }

  /**
   * Resume audio context if suspended (browser autoplay policy)
   */
  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Play a sound effect
   */
  play(effect: SoundEffect): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.settings.muted) {
      return;
    }

    // Resume if needed (for first interaction)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    switch (effect) {
      case 'turnStart':
        this.playTurnStart(now);
        break;
      case 'turnEnd':
        this.playTurnEnd(now);
        break;
      case 'unitSelect':
        this.playUnitSelect(now);
        break;
      case 'unitDeselect':
        this.playUnitDeselect(now);
        break;
      case 'move':
        this.playMove(now);
        break;
      case 'moveComplete':
        this.playMoveComplete(now);
        break;
      case 'load':
        this.playLoad(now);
        break;
      case 'unload':
        this.playUnload(now);
        break;
      case 'fire':
        this.playFire(now);
        break;
      case 'explosion':
        this.playExplosion(now);
        break;
      case 'capture':
        this.playCapture(now);
        break;
      case 'build':
        this.playBuild(now);
        break;
      case 'tideChange':
        this.playTideChange(now);
        break;
      case 'timerWarning':
        this.playTimerWarning(now);
        break;
      case 'timerCritical':
        this.playTimerCritical(now);
        break;
      case 'liftOff':
        this.playLiftOff(now);
        break;
      case 'landing':
        this.playLanding(now);
        break;
      case 'error':
        this.playError(now);
        break;
      case 'success':
        this.playSuccess(now);
        break;
      case 'click':
        this.playClick(now);
        break;
    }
  }

  // ============================================================================
  // Sound Synthesis
  // ============================================================================

  /**
   * Create an oscillator with envelope
   */
  private createOscillator(
    type: OscillatorType,
    frequency: number,
    startTime: number,
    duration: number,
    volume: number = 0.3
  ): { osc: OscillatorNode; gain: GainNode } {
    if (!this.ctx || !this.masterGain) {
      throw new Error('Audio not initialized');
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume * this.settings.sfxVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);

    return { osc, gain };
  }

  /**
   * Create noise for percussive sounds
   */
  private createNoise(
    startTime: number,
    duration: number,
    volume: number = 0.2
  ): { source: AudioBufferSourceNode; gain: GainNode } {
    if (!this.ctx || !this.masterGain) {
      throw new Error('Audio not initialized');
    }

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    gain.gain.setValueAtTime(volume * this.settings.sfxVolume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start(startTime);
    source.stop(startTime + duration + 0.1);

    return { source, gain };
  }

  // ============================================================================
  // Individual Sound Effects
  // ============================================================================

  /** Rising arpeggio - your turn begins */
  private playTurnStart(time: number): void {
    const notes = [440, 554, 659, 880]; // A4 -> C#5 -> E5 -> A5 (A major)
    notes.forEach((freq, i) => {
      this.createOscillator('sine', freq, time + i * 0.08, 0.2, 0.25);
    });
  }

  /** Descending tone - turn over */
  private playTurnEnd(time: number): void {
    const notes = [659, 554, 440]; // E5 -> C#5 -> A4
    notes.forEach((freq, i) => {
      this.createOscillator('sine', freq, time + i * 0.1, 0.15, 0.2);
    });
  }

  /** Quick blip - unit selected */
  private playUnitSelect(time: number): void {
    this.createOscillator('sine', 880, time, 0.08, 0.2);
    this.createOscillator('sine', 1100, time + 0.03, 0.06, 0.15);
  }

  /** Lower blip - unit deselected */
  private playUnitDeselect(time: number): void {
    this.createOscillator('sine', 660, time, 0.06, 0.15);
    this.createOscillator('sine', 440, time + 0.03, 0.08, 0.1);
  }

  /** Mechanical whoosh - movement per hex */
  private playMove(time: number): void {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(400, time + 0.1);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.1 * this.settings.sfxVolume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  /** Satisfying thunk - movement finished */
  private playMoveComplete(time: number): void {
    this.createOscillator('sine', 330, time, 0.1, 0.25);
    this.createNoise(time, 0.05, 0.1);
  }

  /** Mechanical clunk - picking up cargo */
  private playLoad(time: number): void {
    this.createOscillator('square', 220, time, 0.08, 0.15);
    this.createOscillator('sine', 440, time + 0.05, 0.1, 0.2);
    this.createNoise(time, 0.06, 0.1);
  }

  /** Reverse clunk - dropping cargo */
  private playUnload(time: number): void {
    this.createOscillator('sine', 440, time, 0.08, 0.2);
    this.createOscillator('square', 220, time + 0.05, 0.1, 0.15);
    this.createNoise(time + 0.08, 0.08, 0.12);
  }

  /** Laser zap - weapon fired */
  private playFire(time: number): void {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, time);
    osc.frequency.exponentialRampToValueAtTime(200, time + 0.2);

    gain.gain.setValueAtTime(0.3 * this.settings.sfxVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.3);

    // Add noise burst
    this.createNoise(time, 0.15, 0.2);
  }

  /** Boom - destruction */
  private playExplosion(time: number): void {
    if (!this.ctx) return;

    // Low frequency rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.4);

    gain.gain.setValueAtTime(0.4 * this.settings.sfxVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.6);

    // Noise burst
    this.createNoise(time, 0.3, 0.35);
  }

  /** Victory jingle - unit captured */
  private playCapture(time: number): void {
    const notes = [523, 659, 784, 1047]; // C5 -> E5 -> G5 -> C6 (C major)
    notes.forEach((freq, i) => {
      this.createOscillator('sine', freq, time + i * 0.06, 0.15, 0.2);
    });
  }

  /** Construction sound - unit built */
  private playBuild(time: number): void {
    // Ratchet-like building sound
    for (let i = 0; i < 4; i++) {
      this.createOscillator('square', 300 + i * 50, time + i * 0.08, 0.05, 0.15);
      this.createNoise(time + i * 0.08, 0.03, 0.08);
    }
    // Completion ding
    this.createOscillator('sine', 880, time + 0.35, 0.2, 0.25);
  }

  /** Watery swoosh - tide level changed */
  private playTideChange(time: number): void {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.linearRampToValueAtTime(400, time + 0.3);
    osc.frequency.linearRampToValueAtTime(200, time + 0.6);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.linearRampToValueAtTime(2000, time + 0.3);
    filter.frequency.linearRampToValueAtTime(600, time + 0.6);

    gain.gain.setValueAtTime(0.25 * this.settings.sfxVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.8);
  }

  /** Gentle warning beep - time running low */
  private playTimerWarning(time: number): void {
    this.createOscillator('sine', 600, time, 0.1, 0.15);
  }

  /** Urgent beep - time critical */
  private playTimerCritical(time: number): void {
    this.createOscillator('sine', 800, time, 0.08, 0.25);
    this.createOscillator('sine', 800, time + 0.15, 0.08, 0.25);
  }

  /** Rocket launch - astronef liftoff */
  private playLiftOff(time: number): void {
    if (!this.ctx) return;

    // Rising frequency with noise
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(800, time + 1.0);

    gain.gain.setValueAtTime(0.2 * this.settings.sfxVolume, time);
    gain.gain.linearRampToValueAtTime(0.35 * this.settings.sfxVolume, time + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.2);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 1.3);

    // Rumble noise
    this.createNoise(time, 1.0, 0.3);
  }

  /** Thud with settling - astronef landing */
  private playLanding(time: number): void {
    // Impact
    this.createOscillator('sine', 80, time, 0.3, 0.35);
    this.createNoise(time, 0.2, 0.25);

    // Settling
    this.createOscillator('sine', 100, time + 0.25, 0.2, 0.15);
    this.createNoise(time + 0.3, 0.15, 0.1);
  }

  /** Error buzz */
  private playError(time: number): void {
    this.createOscillator('sawtooth', 200, time, 0.15, 0.2);
    this.createOscillator('sawtooth', 150, time + 0.08, 0.15, 0.15);
  }

  /** Success chime */
  private playSuccess(time: number): void {
    this.createOscillator('sine', 523, time, 0.12, 0.2);
    this.createOscillator('sine', 659, time + 0.08, 0.15, 0.25);
  }

  /** UI click */
  private playClick(time: number): void {
    this.createOscillator('sine', 1000, time, 0.03, 0.1);
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  /**
   * Get current settings
   */
  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateVolume();
    this.saveSettings();
  }

  /**
   * Set SFX volume (0-1)
   */
  setSfxVolume(volume: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  /**
   * Toggle mute
   */
  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.updateVolume();
    this.saveSettings();
    return this.settings.muted;
  }

  /**
   * Set mute state
   */
  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.updateVolume();
    this.saveSettings();
  }

  /**
   * Check if muted
   */
  isMuted(): boolean {
    return this.settings.muted;
  }

  /**
   * Update master gain node volume
   */
  private updateVolume(): void {
    if (this.masterGain && this.ctx) {
      const effectiveVolume = this.settings.muted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setValueAtTime(effectiveVolume, this.ctx.currentTime);
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): AudioSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load audio settings:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to save audio settings:', error);
    }
  }

  /**
   * Destroy audio context
   */
  destroy(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.initialized = false;
    }
  }
}

// Singleton instance
let audioManagerInstance: AudioManager | null = null;

/**
 * Get the global AudioManager instance
 */
export function getAudioManager(): AudioManager {
  if (!audioManagerInstance) {
    audioManagerInstance = new AudioManager();
  }
  return audioManagerInstance;
}
