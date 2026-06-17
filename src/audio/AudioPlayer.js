import { SoundGenerator } from './SoundGenerator.js';

export class AudioPlayer {
  constructor() {
    this.ctx = null;
    this.masterVolume = null;
    this.audioBuffer = null;
    this.sourceNode = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseOffset = 0;
    this.playbackRate = 1.0;
    this.fallbackInterval = null;
    this.fallbackStep = 0;
    this.bpm = 120;
    this.useSynthFallback = false;
    this.fallbackSynth = new SoundGenerator();
    this.onEnded = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterVolume = this.ctx.createGain();

    const volBar = document.getElementById('volumeBar');
    const volVal = volBar ? parseInt(volBar.value, 10) : 40;
    this.masterVolume.gain.setValueAtTime((volVal / 100) * 0.8, this.ctx.currentTime);
    this.masterVolume.connect(this.ctx.destination);
    this.fallbackSynth.init(this.ctx);
  }

  get synth() {
    return this.fallbackSynth;
  }

  setAudioBuffer(buffer) {
    this.audioBuffer = buffer;
    this.useSynthFallback = false;
    this.pauseOffset = 0;
    const tag = document.getElementById('audioModeTag');
    tag.innerText = '🎵 REAL AUDIO SYNCHRONIZED';
    tag.classList.remove('hidden', 'bg-red-500/10', 'text-red-400', 'border-red-500/20');
    tag.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
  }

  setFallbackMode(bpm) {
    this.audioBuffer = null;
    this.useSynthFallback = true;
    this.bpm = bpm;
    this.pauseOffset = 0;
    const tag = document.getElementById('audioModeTag');
    tag.innerText = '🎹 SYNTH NOTELINE TRACK';
    tag.classList.remove('hidden', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
    tag.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/20');
  }

  play() {
    this.init();
    if (this.isPlaying) return;

    const start = () => {
      if (this.useSynthFallback) {
        this.isPlaying = true;
        this.startTime = this.ctx.currentTime - this.pauseOffset / this.playbackRate;
        this.startSynthSequencer();
      } else if (this.audioBuffer) {
        this.isPlaying = true;
        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.playbackRate.value = this.playbackRate;
        this.sourceNode.connect(this.masterVolume);

        this.startTime = this.ctx.currentTime - this.pauseOffset / this.playbackRate;
        this.sourceNode.start(0, this.pauseOffset);

        this.sourceNode.onended = () => {
          if (!this.isPlaying) return;
          const cur = this.getCurrentTime();
          const dur = this.getDuration();
          if (cur >= dur - 1.0) {
            this.pause();
            this.seek(0);
            if (this.onEnded) this.onEnded();
          }
        };
      }
    };

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(start);
    } else {
      start();
    }
  }

  playHitSound(noteType) {
    this.init();
    this.fallbackSynth.playSlice(noteType);
  }

  playMissSound() {
    this.init();
    this.fallbackSynth.playMiss();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pauseOffset = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    this.startTime = 0;

    if (this.useSynthFallback) {
      this.stopSynthSequencer();
    } else if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        /* already stopped */
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }

  seek(seconds) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseOffset = Math.max(0, Math.min(seconds, this.getDuration()));
    if (wasPlaying) this.play();
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    if (this.isPlaying) {
      const curr = this.getCurrentTime();
      this.pause();
      this.pauseOffset = curr;
      this.play();
    }
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.pauseOffset;
    return (this.ctx.currentTime - this.startTime) * this.playbackRate;
  }

  getDuration() {
    if (this.useSynthFallback) return 150;
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  startSynthSequencer() {
    const stepTime = 60 / this.bpm / 2;
    let nextStepTime = this.ctx.currentTime;
    this.fallbackStep = Math.floor(this.pauseOffset / stepTime);

    const schedule = () => {
      while (nextStepTime < this.ctx.currentTime + 0.15) {
        const stepTimeAbsolute = nextStepTime;
        if (this.fallbackStep % 2 === 0) {
          this.fallbackSynth.playKick(stepTimeAbsolute);
        }
        if (this.fallbackStep % 2 === 1) {
          this.fallbackSynth.playHat(stepTimeAbsolute);
        }
        const bassPattern = [110, 110, 130, 146.8, 110, 110, 98, 82.4];
        const pitch = bassPattern[Math.floor(this.fallbackStep / 2) % bassPattern.length];
        this.fallbackSynth.playBass(pitch, stepTimeAbsolute, (stepTime * 0.8) / this.playbackRate);

        nextStepTime += stepTime / this.playbackRate;
        this.fallbackStep++;
      }
      this.fallbackInterval = setTimeout(schedule, 40);
    };
    schedule();
  }

  stopSynthSequencer() {
    if (this.fallbackInterval) {
      clearTimeout(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }

  disposeAudioBuffer() {
    this.pause();
    this.audioBuffer = null;
  }
}
