// Procedurally synthesized sound effects (WebAudio). No audio files needed.
import { BLOCKS } from './blocks.js';

// Filter settings per block material: [filter type, frequency, Q, gain].
const MATERIALS = {
  stone: ['bandpass', 1500, 0.9, 0.9],
  wood: ['bandpass', 520, 1.4, 1.1],
  grass: ['lowpass', 900, 0.7, 0.8],
  gravel: ['bandpass', 1100, 0.6, 0.9],
  sand: ['highpass', 2600, 0.5, 0.55],
  snow: ['highpass', 1800, 0.4, 0.5],
  wool: ['lowpass', 500, 0.5, 0.6],
  glass: ['bandpass', 3200, 2.0, 0.8],
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.noise = null;
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _ready() {
    return this.ctx && this.ctx.state === 'running' && this.volume > 0;
  }

  _burst(material, duration, gain, pitch = 1) {
    const ctx = this.ctx;
    const [type, freq, q, g] = MATERIALS[material] || MATERIALS.stone;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq * pitch * (0.85 + Math.random() * 0.3);
    filter.Q.value = q;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain * g, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
    if (material === 'wood' || material === 'stone') this._tone(material === 'wood' ? 180 : 320, duration * 0.6, gain * 0.25);
    if (material === 'glass') for (let i = 0; i < 3; i++) this._tone(2200 + Math.random() * 1800, 0.12 + i * 0.05, gain * 0.12, i * 0.03);
  }

  _tone(freq, duration, gain, delay = 0, endFreq = null, type = 'sine') {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  material(blockId) {
    return BLOCKS[blockId]?.sound || 'stone';
  }

  dig(blockId) {
    if (this._ready()) this._burst(this.material(blockId), 0.16, 0.35, 0.9);
  }

  breakBlock(blockId) {
    if (this._ready()) this._burst(this.material(blockId), 0.28, 0.6, 0.8);
  }

  place(blockId) {
    if (this._ready()) this._burst(this.material(blockId), 0.14, 0.5, 1.1);
  }

  step(blockId) {
    if (this._ready()) this._burst(this.material(blockId), 0.12, 0.18, 1);
  }

  hurt() {
    if (!this._ready()) return;
    this._tone(420, 0.25, 0.35, 0, 160, 'square');
    this._burst('grass', 0.15, 0.3);
  }

  splash() {
    if (!this._ready()) return;
    this._burst('sand', 0.5, 0.5, 0.6);
  }

  pop() {
    if (this._ready()) this._tone(700 + Math.random() * 300, 0.09, 0.18, 0, 1400);
  }

  click() {
    if (this._ready()) this._tone(900, 0.05, 0.15, 0, 600, 'triangle');
  }
}
