const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

const DEFAULTS = {
  volume: 0.2,
  reverbWet: 0.18,
  reverbDry: 0.82,
  compressor: {
    threshold: -14,
    ratio: 10,
    attack: 0.003,
    release: 0.25,
  },
  rampSec: 0.28,
};

class SfxEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.convolver = null;
    this.initialized = false;
    this.priming = null;

    this.bus = null;
    this.filter = null;
    this.voiceGain = null;
    this.subGain = null;
    this.motionGain = null;
    this.voiceOscillators = [];
    this.subOscillator = null;
    this.motionOscillator = null;
    this.started = false;
  }

  async prime() {
    if (!AudioContextCtor) return false;
    if (!this.priming) {
      this.priming = this.#ensureReady().finally(() => {
        this.priming = null;
      });
    }
    return this.priming;
  }

  setMorphProfile(options = {}) {
    if (!this.#canPlay()) return false;

    const intensity = this.#clamp(options.intensity ?? 1, 0.65, 1.9);
    const now = this.ctx.currentTime;
    const rampSec = options.rampSec ?? DEFAULTS.rampSec;
    const sustainSec = Math.max((options.durationMs ?? 2000) / 1000, 0.24);
    const releaseTime = now + rampSec + sustainSec;

    this.#ramp(this.bus.gain, 0.5 + intensity * 0.1, now, rampSec);
    this.#ramp(this.filter.frequency, 170, now, 0.08, true);
    this.#ramp(this.filter.frequency, 540 * intensity, now + 0.34, sustainSec * 0.72, true);
    this.#ramp(this.filter.frequency, 150, releaseTime, Math.max(sustainSec * 0.55, 0.18), true);
    this.#ramp(this.filter.Q, 1.6 + intensity * 0.15, now, rampSec);

    this.#ramp(this.voiceGain.gain, 0.09 * intensity, now, rampSec);
    this.#ramp(this.subGain.gain, 0.2 * intensity, now, rampSec);
    this.#ramp(this.motionGain.gain, 0.03 * intensity, now, 0.14);

    this.#ramp(this.motionOscillator.frequency, 0.32, now, 0.12);
    this.#ramp(this.motionOscillator.frequency, 1.55, now + 0.42, sustainSec * 0.95);

    this.#applyDetuneSpread(now, rampSec, sustainSec, [-12, 15, -6]);
    return true;
  }

  setRevealProfile(options = {}) {
    if (!this.#canPlay()) return false;

    const intensity = this.#clamp(options.intensity ?? 1, 0.65, 2.2);
    const now = this.ctx.currentTime;
    const surgeSec = Math.max((options.durationMs ?? 1300) / 1000, 0.4);
    const attackSec = Math.min(0.22, Math.max(surgeSec * 0.22, 0.12));
    const bloomSec = Math.min(0.54, Math.max(surgeSec * 0.42, 0.26));
    const releaseTime = now + surgeSec;
    const bridgeGain = 0.56 + intensity * 0.05;
    const bridgeFilter = 250 + intensity * 55;

    this.#ramp(this.bus.gain, 0.68 + intensity * 0.03, now, attackSec);
    this.#ramp(this.bus.gain, bridgeGain, now + attackSec, bloomSec);

    this.#ramp(this.filter.frequency, 180, now, 0.1, true);
    this.#ramp(this.filter.frequency, 520 + intensity * 85, now + attackSec * 0.55, bloomSec, true);
    this.#ramp(this.filter.frequency, bridgeFilter, releaseTime, Math.max(surgeSec * 0.5, 0.28), true);
    this.#ramp(this.filter.Q, 1.95 + intensity * 0.12, now, attackSec);
    this.#ramp(this.filter.Q, 1.72, releaseTime, Math.max(surgeSec * 0.4, 0.22));

    this.#ramp(this.voiceGain.gain, 0.11 * intensity, now, attackSec);
    this.#ramp(this.voiceGain.gain, 0.095 * intensity, now + attackSec, bloomSec);
    this.#ramp(this.subGain.gain, 0.23 * intensity, now, attackSec);
    this.#ramp(this.subGain.gain, 0.2 * intensity, now + attackSec, bloomSec);
    this.#ramp(this.motionGain.gain, 0.042 * intensity, now, attackSec);
    this.#ramp(this.motionGain.gain, 0.03 * intensity, now + attackSec, bloomSec);

    this.#ramp(this.motionOscillator.frequency, 1.2, now, attackSec);
    this.#ramp(this.motionOscillator.frequency, 0.72, now + attackSec, bloomSec);

    this.#applyDetuneSpread(now, attackSec, surgeSec, [-18, 21, -10], [-10, 12, -5]);
    return true;
  }

  idle() {
    if (!this.#canPlay()) return false;
    const now = this.ctx.currentTime;
    this.#ramp(this.bus.gain, 0.0001, now, 0.22);
    this.#ramp(this.voiceGain.gain, 0.0001, now, 0.24);
    this.#ramp(this.subGain.gain, 0.0001, now, 0.24);
    this.#ramp(this.motionGain.gain, 0.0001, now, 0.16);
    this.#ramp(this.filter.frequency, 120, now, 0.18, true);
    return true;
  }

  stopAll() {
    if (!this.#canPlay()) return;
    this.idle();
  }

  async #ensureReady() {
    if (!AudioContextCtor) return false;
    if (!this.initialized) this.#initGraph();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) this.#startContinuousVoice();
    return this.ctx.state === "running";
  }

  #initGraph() {
    this.ctx = new AudioContextCtor();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = DEFAULTS.volume;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = DEFAULTS.compressor.threshold;
    this.compressor.ratio.value = DEFAULTS.compressor.ratio;
    this.compressor.attack.value = DEFAULTS.compressor.attack;
    this.compressor.release.value = DEFAULTS.compressor.release;

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.#makeImpulseResponse(3.6, 1.7);

    const wet = this.ctx.createGain();
    wet.gain.value = DEFAULTS.reverbWet;

    const dry = this.ctx.createGain();
    dry.gain.value = DEFAULTS.reverbDry;

    this.masterGain.connect(dry).connect(this.compressor);
    this.masterGain.connect(this.convolver).connect(wet).connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.bus.connect(this.masterGain);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 120;
    this.filter.Q.value = 1.5;
    this.filter.connect(this.bus);

    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = 0.0001;
    this.voiceGain.connect(this.filter);

    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.0001;
    this.subGain.connect(this.filter);

    this.motionGain = this.ctx.createGain();
    this.motionGain.gain.value = 0.0001;
    this.motionGain.connect(this.bus.gain);

    this.initialized = true;
  }

  #startContinuousVoice() {
    const at = this.ctx.currentTime + 0.02;
    const baseFrequency = 58.27;

    [-12, 15, -6].forEach((detune, index) => {
      const oscillator = this.ctx.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = index === 2 ? baseFrequency / 2 : baseFrequency;
      oscillator.detune.value = detune;
      oscillator.connect(this.voiceGain);
      oscillator.start(at);
      this.voiceOscillators.push(oscillator);
    });

    this.subOscillator = this.ctx.createOscillator();
    this.subOscillator.type = "sine";
    this.subOscillator.frequency.value = baseFrequency / 2;
    this.subOscillator.connect(this.subGain);
    this.subOscillator.start(at);

    this.motionOscillator = this.ctx.createOscillator();
    this.motionOscillator.type = "sine";
    this.motionOscillator.frequency.value = 0.32;
    this.motionOscillator.connect(this.motionGain);
    this.motionOscillator.start(at);

    this.started = true;
  }

  #applyDetuneSpread(now, attackSec, sustainSec, peakDetunes, settleDetunes = [-12, 15, -6]) {
    this.voiceOscillators.forEach((oscillator, index) => {
      const startValue = oscillator.detune.value;
      oscillator.detune.cancelScheduledValues(now);
      oscillator.detune.setValueAtTime(startValue, now);
      oscillator.detune.linearRampToValueAtTime(peakDetunes[index], now + attackSec);
      oscillator.detune.linearRampToValueAtTime(settleDetunes[index], now + attackSec + sustainSec * 0.6);
    });
  }

  #ramp(audioParam, value, at, durationSec, exponential = false) {
    const startTime = Math.max(at, this.ctx.currentTime);
    const safeValue = exponential ? Math.max(value, 0.0001) : value;
    const currentValue = exponential ? Math.max(audioParam.value, 0.0001) : audioParam.value;

    audioParam.cancelScheduledValues(startTime);
    audioParam.setValueAtTime(currentValue, startTime);

    if (durationSec <= 0) {
      audioParam.setValueAtTime(safeValue, startTime);
      return;
    }

    if (exponential) audioParam.exponentialRampToValueAtTime(safeValue, startTime + durationSec);
    else audioParam.linearRampToValueAtTime(safeValue, startTime + durationSec);
  }

  #makeImpulseResponse(durationSec, decay) {
    const sampleCount = Math.floor(this.ctx.sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(2, sampleCount, this.ctx.sampleRate);

    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < sampleCount; index += 1) {
        data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / sampleCount, decay);
      }
    }

    return buffer;
  }

  #canPlay() {
    return Boolean(this.ctx && this.ctx.state === "running" && this.masterGain && this.started);
  }

  #clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
}

const engine = new SfxEngine();

export function primeSfx() {
  return engine.prime();
}

export function playMorphSfx(options) {
  return engine.setMorphProfile(options);
}

export function playRevealSfx(options) {
  return engine.setRevealProfile(options);
}

export function stopAllSfx() {
  engine.stopAll();
}
