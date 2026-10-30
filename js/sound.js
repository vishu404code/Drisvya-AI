/**
 * DRISVYA - Auditory Feedback Engine (Earcons & Sound Cues)
 * Uses native Web Audio API for zero-latency, offline synthesized audio.
 */

class SoundEngine {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  playTone(frequency, type = 'sine', duration = 0.12, volume = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  // Chime for starting assistance (ascending harmonic)
  playStart() {
    if (!this.enabled) return;
    this.playTone(440, 'triangle', 0.1, 0.15);
    setTimeout(() => this.playTone(660, 'triangle', 0.1, 0.15), 100);
    setTimeout(() => this.playTone(880, 'sine', 0.2, 0.18), 200);
  }

  // Chime for stopping assistance (descending harmonic)
  playStop() {
    if (!this.enabled) return;
    this.playTone(660, 'sine', 0.1, 0.15);
    setTimeout(() => this.playTone(440, 'triangle', 0.18, 0.15), 100);
  }

  // Toggle click sound
  playToggle(on = true) {
    if (!this.enabled) return;
    if (on) {
      this.playTone(520, 'sine', 0.08, 0.12);
      setTimeout(() => this.playTone(780, 'sine', 0.08, 0.12), 70);
    } else {
      this.playTone(780, 'sine', 0.08, 0.12);
      setTimeout(() => this.playTone(520, 'sine', 0.08, 0.12), 70);
    }
  }

  // Warning / Alert Earcon
  playAlert() {
    if (!this.enabled) return;
    this.playTone(880, 'sawtooth', 0.12, 0.12);
    setTimeout(() => this.playTone(880, 'sawtooth', 0.18, 0.15), 140);
  }
}

window.soundEngine = new SoundEngine();
