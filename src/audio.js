// ============================================================
// 合成音效（不需要任何音频文件）：
// 夜的氛围垫音 → 黎明转为大调；风声随速度变化；被追时的心跳和低沉嗡鸣；
// 入水的水花、划水的呼啸、完成目标的风铃
// ============================================================

export class DreamAudio {
  constructor() { this.ctx = null; this.muted = false; this.nextBeat = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    // 简单混响：噪声脉冲响应
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // 氛围垫音：夜（小调）与黎明（大调）两组和弦交叉淡化
    const mkPad = (freqs, gain) => {
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
      g.connect(lp); lp.connect(master); lp.connect(this.reverb);
      for (const f of freqs) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
          const og = ctx.createGain(); og.gain.value = gain;
          const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.1;
          const lg = ctx.createGain(); lg.gain.value = gain * 0.6;
          lfo.connect(lg).connect(og.gain);
          o.connect(og).connect(g); o.start(); lfo.start();
        }
      }
      return g;
    };
    this.padNight = mkPad([110, 164.8, 220, 261.6, 329.6], 0.018);   // A 小调
    this.padDawn = mkPad([130.8, 196, 261.6, 329.6, 392, 493.9], 0.016); // C 大七

    // 风
    const wind = ctx.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 400; this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(master); wind.start();

    // 追逐时的低沉嗡鸣
    const drone = ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 43.65;
    const drone2 = ctx.createOscillator(); drone2.type = 'sawtooth'; drone2.frequency.value = 46.2;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 180;
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    drone.connect(dlp); drone2.connect(dlp); dlp.connect(this.droneGain).connect(master);
    drone.start(); drone2.start();

    // 湖水声
    const water = ctx.createBufferSource(); water.buffer = this.noiseBuf; water.loop = true; water.playbackRate.value = 0.5;
    const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 500;
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    water.connect(wlp).connect(this.waterGain).connect(master); water.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  // 每帧调用：chase 0..1（被追的紧张度），speed 米/秒，dawn 0..1，nearWater 0..1
  update({ chase = 0, speed = 0, dawn = 0, nearWater = 0, dreaming = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pad = dreaming ? 1 : 0.3;
    this.padNight.gain.setTargetAtTime((1 - dawn) * pad * (1 - chase * 0.6), t, 1.5);
    this.padDawn.gain.setTargetAtTime(dawn * pad, t, 2.5);
    this.windGain.gain.setTargetAtTime(Math.min(0.35, speed * 0.012) + 0.02, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 40, t, 0.3);
    this.droneGain.gain.setTargetAtTime(chase * 0.12, t, 0.4);
    this.waterGain.gain.setTargetAtTime(nearWater * 0.08, t, 0.5);
    if (chase > 0.05 && t > this.nextBeat) {
      this.heartbeat(chase);
      this.nextBeat = t + 1.0 - chase * 0.55;
    }
  }

  heartbeat(k) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, amp] of [[0, 1], [0.16, 0.7]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.5 * amp * (0.4 + k * 0.6), t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
      o.connect(g).connect(this.master); o.start(t + dt); o.stop(t + dt + 0.3);
    }
  }

  noiseBurst({ dur = 0.5, freq = 1200, q = 1, gain = 0.4, sweepTo = null, type = 'bandpass', reverb = 0.3 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g); g.connect(this.master);
    if (reverb) { const rg = ctx.createGain(); rg.gain.value = reverb; g.connect(rg).connect(this.reverb); }
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
  }

  splash() {
    this.noiseBurst({ dur: 0.9, freq: 1800, q: 0.6, gain: 0.55, sweepTo: 300, type: 'lowpass' });
    this.noiseBurst({ dur: 0.4, freq: 3500, q: 1.5, gain: 0.2 });
  }
  stroke(inWater) {
    if (inWater) this.noiseBurst({ dur: 0.35, freq: 900, q: 1, gain: 0.12, sweepTo: 400, type: 'lowpass', reverb: 0.1 });
    else this.noiseBurst({ dur: 0.6, freq: 500, q: 1.2, gain: 0.22, sweepTo: 1800, reverb: 0.4 });
  }
  land() { this.noiseBurst({ dur: 0.25, freq: 400, q: 0.7, gain: 0.25, type: 'lowpass', reverb: 0.1 }); }

  chime(notes = [659.3, 784, 987.8, 1318.5]) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    notes.forEach((f, i) => {
      const t = t0 + i * 0.12;
      for (const [mult, amp] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * amp, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 2.5);
        o.connect(g); g.connect(this.master); g.connect(this.reverb);
        o.start(t); o.stop(t + 2.6);
      }
    });
  }

  groan() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = 70 + Math.random() * 40;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 1.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    o.connect(bp).connect(g); g.connect(this.master); g.connect(this.reverb);
    o.start(t); o.stop(t + 1.4);
  }
}
