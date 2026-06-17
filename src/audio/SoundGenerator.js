export class SoundGenerator {
  constructor() {
    this.ctx = null;
    this.sfxGain = null;
    this.swooshBuffer = null;
    this.shingBuffer = null;
    this.hatBuffer = null;
    this.bgmGain = null;
  }

  init(audioCtx) {
    this.ctx = audioCtx;
    this.sfxGain = this.ctx.createGain();
    this.bgmGain = this.ctx.createGain();

    const volBar = document.getElementById('volumeBar');
    const volVal = volBar ? parseInt(volBar.value, 10) : 40;
    const normalized = volVal / 100;
    this.sfxGain.gain.setValueAtTime(normalized * 1.15, this.ctx.currentTime);
    this.bgmGain.gain.setValueAtTime(normalized * 0.35, this.ctx.currentTime);

    this.sfxGain.connect(this.ctx.destination);
    this.bgmGain.connect(this.ctx.destination);

    this.swooshBuffer = this.createNoiseBuffer(0.14);
    this.shingBuffer = this.createNoiseBuffer(0.05);
    this.hatBuffer = this.createNoiseBuffer(0.03);
  }

  get masterVolume() {
    return this.sfxGain;
  }

  setSfxVolume(normalized) {
    if (!this.sfxGain || !this.ctx) return;
    this.sfxGain.gain.setValueAtTime(normalized * 1.15, this.ctx.currentTime);
  }

  setBgmVolume(normalized) {
    if (!this.bgmGain || !this.ctx) return;
    this.bgmGain.gain.setValueAtTime(normalized * 0.35, this.ctx.currentTime);
  }

  async ensureRunning() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  createNoiseBuffer(durationSec) {
    const bufferSize = Math.floor(this.ctx.sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12);
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);

    osc.start(time);
    osc.stop(time + 0.13);
  }

  playHat(time) {
    if (!this.hatBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.hatBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.03);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    source.start(time);
  }

  playBass(freq, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, time);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  /**
   * Beat Saber 風スライス音
   * 低域パンチ + スウォosh + 高域シャリン の3層
   * noteType: 0=red, 1=blue
   */
  playSlice(noteType = 0) {
    if (!this.ctx || !this.sfxGain || !this.swooshBuffer || !this.shingBuffer) return;
    this.ensureRunning();

    const now = this.ctx.currentTime;
    const isRed = noteType === 0;
    const out = this.sfxGain;

    // 1. 低域インパクト（カットの「芯」）
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(isRed ? 165 : 195, now);
    thump.frequency.exponentialRampToValueAtTime(55, now + 0.07);
    thumpGain.gain.setValueAtTime(1.0, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    thump.connect(thumpGain);
    thumpGain.connect(out);
    thump.start(now);
    thump.stop(now + 0.09);

    // 2. メインスウォosh（刃が空気を切る音）
    const swoosh = this.ctx.createBufferSource();
    swoosh.buffer = this.swooshBuffer;

    const swooshFilter = this.ctx.createBiquadFilter();
    swooshFilter.type = 'bandpass';
    swooshFilter.Q.value = 1.4;
    swooshFilter.frequency.setValueAtTime(isRed ? 900 : 1100, now);
    swooshFilter.frequency.exponentialRampToValueAtTime(isRed ? 7500 : 9500, now + 0.022);
    swooshFilter.frequency.exponentialRampToValueAtTime(600, now + 0.12);

    const swooshGain = this.ctx.createGain();
    swooshGain.gain.setValueAtTime(0.001, now);
    swooshGain.gain.linearRampToValueAtTime(1.25, now + 0.003);
    swooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    swoosh.connect(swooshFilter);
    swooshFilter.connect(swooshGain);
    swooshGain.connect(out);
    swoosh.start(now);

    // 3. 高域シャリン（鋭い切断感）
    const shing = this.ctx.createBufferSource();
    shing.buffer = this.shingBuffer;

    const shingFilter = this.ctx.createBiquadFilter();
    shingFilter.type = 'highpass';
    shingFilter.frequency.setValueAtTime(isRed ? 3500 : 4200, now);

    const shingGain = this.ctx.createGain();
    shingGain.gain.setValueAtTime(0.85, now);
    shingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    shing.connect(shingFilter);
    shingFilter.connect(shingGain);
    shingGain.connect(out);
    shing.start(now);

    // 4. 短いトーン（赤/青でピッチ差）
    const ping = this.ctx.createOscillator();
    const pingFilter = this.ctx.createBiquadFilter();
    const pingGain = this.ctx.createGain();
    ping.type = 'sawtooth';
    ping.frequency.setValueAtTime(isRed ? 380 : 520, now);
    ping.frequency.exponentialRampToValueAtTime(isRed ? 900 : 1100, now + 0.018);
    pingFilter.type = 'lowpass';
    pingFilter.frequency.setValueAtTime(2800, now);
    pingFilter.frequency.exponentialRampToValueAtTime(800, now + 0.05);
    pingGain.gain.setValueAtTime(0.22, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    ping.connect(pingFilter);
    pingFilter.connect(pingGain);
    pingGain.connect(out);
    ping.start(now);
    ping.stop(now + 0.06);
  }

  playMiss() {
    if (!this.ctx || !this.sfxGain) return;
    this.ensureRunning();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.15);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}
