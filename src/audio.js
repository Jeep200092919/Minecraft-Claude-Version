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

  bow(power = 1) {
    if (!this._ready()) return;
    this._burst('wool', 0.18, 0.35, 1.6);
    this._tone(300 + power * 200, 0.12, 0.12, 0, 900, 'triangle');
  }

  arrowHit() {
    if (this._ready()) this._burst('wood', 0.12, 0.4, 1.4);
  }

  hit() {
    if (this._ready()) this._tone(220, 0.08, 0.2, 0, 140, 'square');
  }

  throw() {
    if (this._ready()) this._burst('wool', 0.14, 0.3, 2);
  }

  door(open) {
    if (!this._ready()) return;
    this._burst('wood', 0.25, 0.45, open ? 0.8 : 0.6);
    this._tone(open ? 180 : 140, 0.18, 0.12, 0, open ? 240 : 100, 'sawtooth');
  }

  equip() {
    if (this._ready()) { this._burst('stone', 0.12, 0.3, 2.2); this._tone(520, 0.08, 0.1, 0.05, 780, 'triangle'); }
  }

  toolBreak() {
    if (!this._ready()) return;
    this._burst('glass', 0.3, 0.5, 1.2);
    this._tone(800, 0.2, 0.2, 0, 300, 'square');
  }

  shear() {
    if (this._ready()) { this._burst('wool', 0.1, 0.4, 2.5); this._burst('wool', 0.1, 0.35, 2.8); }
  }

  orb() {
    if (this._ready()) this._tone(1200 + Math.random() * 600, 0.08, 0.1, 0, 1800, 'sine');
  }

  levelUp() {
    if (!this._ready()) return;
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.18, 0.14, i * 0.07, f * 1.01, 'triangle'));
  }

  // Continuous rain: looping filtered noise whose volume follows intensity.
  setRain(v) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.rainGain) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.value = 1800;
      lp.Q.value = 0.5;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(lp).connect(this.rainGain).connect(this.master);
      src.start();
    }
    this.rainGain.gain.value = v * 0.16;
  }

  thunder(dist = 20) {
    if (!this._ready()) return;
    const delay = Math.min(3, dist / 80);
    const g = Math.max(0.2, 1 - dist / 120);
    this._tone(55, 2.2, 0.5 * g, delay, 30, 'sawtooth');
    this._burst('gravel', 1.8, 0.8 * g, 0.25);
  }

  teleport() {
    if (this._ready()) this._tone(300, 0.4, 0.3, 0, 1400, 'sawtooth');
  }

  // The eerie scream of an enderman that has been looked at.
  stare() {
    if (!this._ready()) return;
    this._voice('sawtooth', 120, 60, 1.6, 0.25, { filter: 700, trem: 11 });
    this._tone(1500, 1.2, 0.05, 0, 700, 'sine');
  }

  // Heavy iron golem swing.
  slam() {
    if (!this._ready()) return;
    this._burst('stone', 0.3, 0.6, 0.5);
    this._tone(70, 0.3, 0.3, 0, 40, 'triangle');
  }

  // A filtered oscillator voice with an optional pitch glide and tremolo.
  _voice(type, f0, f1, dur, gain, { filter = 900, trem = 0, delay = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    env.gain.setValueAtTime(gain, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc.connect(lp).connect(env);
    if (trem) {
      const am = ctx.createGain();
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = trem;
      depth.gain.value = 0.5;
      am.gain.value = 0.5;
      lfo.connect(depth).connect(am.gain);
      node = node.connect(am);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    node.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Mob vocalizations: kind is 'idle', 'hurt' or 'death'.
  mob(sound, kind = 'idle') {
    if (!this._ready()) return;
    const hurt = kind !== 'idle';
    const p = (kind === 'hurt' ? 1.25 : kind === 'death' ? 0.8 : 1) * (0.9 + Math.random() * 0.2);
    const g = 0.22;
    switch (sound) {
      case 'pig':
        this._voice('square', 190 * p, 150 * p, 0.14, g, { filter: 700 });
        if (!hurt) this._voice('square', 170 * p, 130 * p, 0.12, g * 0.8, { filter: 700, delay: 0.18 });
        break;
      case 'cow':
        this._voice('sawtooth', 115 * p, 92 * p, hurt ? 0.35 : 0.9, g, { filter: 520, trem: 6 });
        break;
      case 'sheep':
        this._voice('sawtooth', 280 * p, 250 * p, hurt ? 0.3 : 0.6, g * 0.8, { filter: 1100, trem: 28 });
        break;
      case 'chicken':
        for (let i = 0; i < (hurt ? 2 : 3); i++) this._voice('triangle', (1100 + Math.random() * 300) * p, 800 * p, 0.07, g * 0.7, { filter: 3000, delay: i * 0.11 });
        break;
      case 'zombie':
        this._voice('sawtooth', 95 * p, 70 * p, hurt ? 0.4 : 1.1, g * 1.1, { filter: 380, trem: 9 });
        this._burst('gravel', 0.5, 0.15, 0.5);
        break;
      case 'villager':
        this._voice('sine', 230 * p, 180 * p, 0.4, g, { filter: 900 });
        break;
      case 'creeper':
        if (hurt) this._burst('sand', 0.25, 0.3, 0.8);
        break;
      case 'skeleton':
        // Rattling bones.
        for (let i = 0; i < (hurt ? 3 : 4); i++) this._tone((700 + Math.random() * 500) * p, 0.05, g * 0.5, i * 0.07, 300 * p, 'square');
        break;
      case 'spider':
        this._burst('sand', hurt ? 0.25 : 0.5, 0.35, 1.8 * p);
        if (!hurt) this._voice('sawtooth', 120 * p, 90 * p, 0.3, g * 0.5, { filter: 400, trem: 18 });
        break;
      case 'enderman':
        this._voice('sawtooth', 160 * p, hurt ? 90 : 220 * p, hurt ? 0.5 : 0.8, g * 0.7, { filter: 600, trem: 5 });
        this._tone(900 * p, 0.5, 0.05, 0.1, 600 * p, 'sine');
        break;
      case 'slime':
        this._voice('sine', 150 * p, 90 * p, 0.18, g * 0.9, { filter: 500 });
        this._burst('grass', 0.12, 0.3, 0.6);
        break;
      case 'wolf':
        if (hurt) this._voice('triangle', 700 * p, 500 * p, 0.2, g, { filter: 1600 });
        else for (let i = 0; i < 2; i++) this._voice('sawtooth', 340 * p, 220 * p, 0.1, g, { filter: 1200, delay: i * 0.22 });
        break;
      case 'golem':
        this._burst('stone', hurt ? 0.3 : 0.2, 0.45, 0.6);
        this._tone(90 * p, 0.3, 0.12, 0, 70 * p, 'triangle');
        break;
      case 'squid':
        this._burst('wool', 0.3, 0.25, 0.8);
        break;
      case 'bat':
        for (let i = 0; i < 2; i++) this._tone((3200 + Math.random() * 800) * p, 0.05, g * 0.35, i * 0.09, 2400 * p, 'triangle');
        break;
      case 'rabbit':
        if (hurt) this._tone(1300 * p, 0.12, g * 0.5, 0, 900 * p, 'triangle');
        break;
    }
  }

  hiss() {
    if (!this._ready()) return;
    this._burst('sand', 1.5, 0.45, 1.4);
  }

  explosion() {
    if (!this._ready()) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(1.2, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    src.connect(lp).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 1.9);
    this._tone(60, 0.8, 0.9, 0, 30);
  }

  eat() {
    if (this._ready()) this._burst('gravel', 0.12, 0.35, 1.3);
  }

  burp() {
    if (this._ready()) this._voice('sawtooth', 160, 95, 0.35, 0.25, { filter: 500 });
  }

  // --- Ambient music: soft generative piano phrases -------------------------------

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v * 0.8;
  }

  _musicBus() {
    if (this.musicGain) return this.musicGain;
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = (this.musicVolume ?? 0.5) * 0.8;
    // A generated impulse response gives the notes a roomy reverb.
    const len = ctx.sampleRate * 3;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.musicDry = ctx.createGain();
    this.musicDry.connect(this.musicGain);
    this.musicDry.connect(verb).connect(wet).connect(this.musicGain);
    this.musicGain.connect(this.ctx.destination);
    return this.musicGain;
  }

  _note(freq, t, dur, gain) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    for (const [mult, g, type] of [[1, 1, 'triangle'], [2, 0.25, 'sine'], [3, 0.08, 'sine']]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og).connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    lp.connect(env).connect(this.musicDry);
  }

  // Called every frame; occasionally plays a calm phrase.
  updateMusic(dt) {
    if (!this.ctx || this.ctx.state !== 'running' || !(this.musicVolume > 0)) return;
    this._musicBus();
    this.musicTimer = (this.musicTimer ?? 8) - dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 50 + Math.random() * 70;
    const roots = [261.63, 220.0, 196.0, 174.61];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const hz = (semi) => root * Math.pow(2, semi / 12);
    let t = this.ctx.currentTime + 0.2;
    const notes = 8 + Math.floor(Math.random() * 10);
    let idx = Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2));
      this._note(hz(scale[idx]), t, 2.8, 0.14);
      if (Math.random() < 0.3) this._note(hz(scale[idx] - 12), t, 3.5, 0.09);
      t += [0.45, 0.6, 0.9, 1.2][Math.floor(Math.random() * 4)];
    }
  }
}
