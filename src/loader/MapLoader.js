import JSZip from 'jszip';
import { BeatmapParser } from '../parser/BeatmapParser.js';
import { parseBpmInfoJson } from '../timing/TimingEngine.js';

export class MapLoader {
  constructor(audioPlayer, previewEngine) {
    this.audioPlayer = audioPlayer;
    this.previewEngine = previewEngine;
    this.zip = null;
    this.infoData = null;
    this.currentDifficultyFile = '';
    this.coverObjectUrl = null;
  }

  resetLoaderState() {
    this.audioPlayer.disposeAudioBuffer();
    this.audioPlayer.useSynthFallback = false;
    this.audioPlayer.pauseOffset = 0;

    this.previewEngine.clearActiveElements();
    this.previewEngine.isReady = false;

    if (this.coverObjectUrl) {
      URL.revokeObjectURL(this.coverObjectUrl);
      this.coverObjectUrl = null;
    }

    const seekBar = document.getElementById('seekBar');
    seekBar.value = 0;
    seekBar.max = 100;
    document.getElementById('timeCurrent').innerText = '0:00';
    document.getElementById('timeDuration').innerText = '0:00';
    const chartHint = document.getElementById('chartEndHint');
    if (chartHint) chartHint.innerText = '';

    const playBtn = document.getElementById('playBtn');
    playBtn.disabled = true;
    playBtn.innerHTML = 'PLAY PREVIEW ▶️';
    playBtn.className =
      'flex-1 py-1.5 bg-gradient-to-r from-red-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-black text-[11px] rounded-lg tracking-widest transition active:scale-95 disabled:opacity-50';

    document.getElementById('audioModeTag').classList.add('hidden');
  }

  async fetchMapInfo(id) {
    this.resetLoaderState();
    showStatus('Fetching map info...', 10);
    try {
      const response = await fetch(`https://api.beatsaver.com/maps/id/${id}`);
      if (!response.ok) throw new Error('BeatSaver IDが見つかりません。');
      const mapData = await response.json();

      const latestVersion = mapData.versions[0];
      await this.downloadZip(latestVersion.downloadURL);
    } catch (error) {
      showToast(`❌ エラー: ${error.message}`);
      hideStatus();
    }
  }

  async downloadZip(url) {
    showStatus('Downloading song zip...', 30);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Zipファイルのダウンロードに失敗しました。');
      showStatus('Extracting zip package...', 65);
      const arrayBuffer = await response.arrayBuffer();
      await this.loadZipData(arrayBuffer);
    } catch {
      showToast('❌ CORS制限または network 問題が発生しました。ファイルを直接アップロードしてください。');
      hideStatus();
    }
  }

  async loadZipData(arrayBuffer) {
    this.resetLoaderState();
    try {
      showStatus('Extracting map contents...', 75);
      this.zip = await JSZip.loadAsync(arrayBuffer);

      const infoKey = this.findFileKey('info.dat');
      if (!infoKey) throw new Error('info.dat が存在しません。');

      const infoText = await this.zip.files[infoKey].async('text');
      this.infoData = JSON.parse(infoText);

      this.updateUIWithSongInfo();
      await this.extractAudio();
    } catch (error) {
      showToast(`❌ エラー: ${error.message}`);
      hideStatus();
    }
  }

  findFileKey(filename) {
    const lowerName = filename.toLowerCase();
    return Object.keys(this.zip.files).find((key) => key.toLowerCase() === lowerName);
  }

  async loadBpmInfo() {
    const filename = this.infoData._BPMInfoFilename;
    if (!filename) return [];
    const key = this.findFileKey(filename);
    if (!key) return [];
    try {
      const text = await this.zip.files[key].async('text');
      return parseBpmInfoJson(JSON.parse(text));
    } catch {
      return [];
    }
  }

  async updateUIWithSongInfo() {
    const info = this.infoData;
    document.getElementById('songName').innerText = info._songName || 'Unknown Song';
    document.getElementById('songSubName').innerText = info._songSubName || '';
    document.getElementById('songAuthor').innerText = `Artist: ${info._songAuthorName || '-'}`;
    document.getElementById('mapperName').innerText = `Mapper: ${info._levelAuthorName || '-'}`;
    document.getElementById('bpmLabel').innerText = info._beatsPerMinute || '-';

    const coverKey = this.findFileKey(info._coverImageFilename);
    if (coverKey) {
      const blob = await this.zip.files[coverKey].async('blob');
      if (this.coverObjectUrl) URL.revokeObjectURL(this.coverObjectUrl);
      this.coverObjectUrl = URL.createObjectURL(blob);
      document.getElementById('coverImage').src = this.coverObjectUrl;
    }

    this.renderDifficultyList();
  }

  renderDifficultyList() {
    const container = document.getElementById('difficultyContainer');
    container.innerHTML = '';

    const set =
      this.infoData._difficultyBeatmapSets.find((s) => s._beatmapCharacteristicName === 'Standard') ||
      this.infoData._difficultyBeatmapSets[0];

    if (!set) {
      container.innerHTML = '<span class="text-xs text-red-400">難易度データがありません</span>';
      return;
    }

    document.getElementById('diffSetLabel').innerText = set._beatmapCharacteristicName;

    set._difficultyBeatmaps.forEach((diff) => {
      const btn = document.createElement('button');
      btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition tracking-wider active:scale-95 border ${this.getDiffStyle(diff._difficulty)}`;
      btn.innerText = diff._difficulty.toUpperCase();
      btn.onclick = () => this.selectDifficulty(diff, btn);
      container.appendChild(btn);
    });

    if (set._difficultyBeatmaps.length > 0) {
      const lastIdx = set._difficultyBeatmaps.length - 1;
      const autoSelectBtn = container.children[lastIdx] || container.children[0];
      autoSelectBtn.click();
    }
  }

  getDiffStyle(diffName) {
    const name = diffName.toLowerCase();
    if (name.includes('easy')) return 'border-green-500/30 text-green-400 bg-green-500/5 hover:bg-green-500/20';
    if (name.includes('normal')) return 'border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/20';
    if (name.includes('hard')) return 'border-yellow-500/30 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/20';
    if (name.includes('expertplus')) return 'border-purple-500/30 text-purple-400 bg-purple-500/5 hover:bg-purple-500/20';
    if (name.includes('expert')) return 'border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/20';
    return 'border-gray-500/30 text-gray-400 hover:bg-gray-500/20';
  }

  async extractAudio() {
    showStatus('Decoding music audio...', 90);
    const info = this.infoData;
    const audioKey = this.findFileKey(info._songFilename);

    if (!audioKey) {
      showToast('⚠️ 音声ファイルが見つかりません。シンセサイザーBGMを使用します。');
      this.audioPlayer.setFallbackMode(info._beatsPerMinute);
      hideStatus();
      this.onLoadComplete();
      return;
    }

    try {
      const audioBufferData = await this.zip.files[audioKey].async('arraybuffer');
      this.audioPlayer.init();
      const decodedBuffer = await this.audioPlayer.ctx.decodeAudioData(audioBufferData.slice(0));
      this.audioPlayer.setAudioBuffer(decodedBuffer);

      const dur = decodedBuffer.duration;
      document.getElementById('timeDuration').innerText = formatTime(dur);
      document.getElementById('seekBar').max = dur;

      this.previewEngine.refreshChartDurationUI();
      showToast('🎉 マップと音源の読み込みに成功しました！');
      hideStatus();
    } catch {
      showToast('⚠️ 音源のデコードに失敗しました。BPMシンセサイザーBGMに切り替えます。');
      this.audioPlayer.setFallbackMode(info._beatsPerMinute);
      document.getElementById('timeDuration').innerText = '2:30';
      document.getElementById('seekBar').max = 150;
      hideStatus();
    }

    this.onLoadComplete();
  }

  async selectDifficulty(diff, buttonElement) {
    const btns = document.querySelectorAll('#difficultyContainer button');
    btns.forEach((b) => b.classList.remove('ring-2', 'ring-cyan-400/50', 'bg-cyan-950/40'));
    buttonElement.classList.add('ring-2', 'ring-cyan-400/50', 'bg-cyan-950/40');

    this.currentDifficultyFile = diff._beatmapFilename;
    document.getElementById('njsLabel').innerText = diff._noteJumpMovementSpeed || '12';

    const diffKey = this.findFileKey(diff._beatmapFilename);
    if (!diffKey) {
      showToast('❌ 譜面データが見つかりません。');
      return;
    }

    const diffText = await this.zip.files[diffKey].async('text');
    const diffJson = JSON.parse(diffText);

    const { notes, obstacles } = BeatmapParser.parse(diffJson);
    const bpmEvents = await this.loadBpmInfo();
    const songTimeOffset = parseFloat(this.infoData._songTimeOffset) || 0;

    this.previewEngine.setMapData(
      notes,
      obstacles,
      this.infoData._beatsPerMinute,
      diff._noteJumpMovementSpeed,
      { bpmEvents, songTimeOffset },
    );

    document.getElementById('statNotes').innerText = notes.length;
    document.getElementById('statRed').innerText = notes.filter((n) => n._type === 0).length;
    document.getElementById('statBlue').innerText = notes.filter((n) => n._type === 1).length;
    document.getElementById('statBombs').innerText = notes.filter((n) => n._type === 3).length;
  }

  onLoadComplete() {
    document.getElementById('noMapScreen').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('playBtn').disabled = false;
    this.audioPlayer.seek(0);
    this.updatePlayButtonUI();
  }

  updatePlayButtonUI() {
    const btn = document.getElementById('playBtn');
    if (this.audioPlayer.isPlaying) {
      btn.innerHTML = 'PAUSE PREVIEW ⏸️';
      btn.className =
        'flex-1 py-2 bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 text-white font-black text-xs rounded-lg tracking-widest transition active:scale-95';
    } else {
      btn.innerHTML = 'PLAY PREVIEW ▶️';
      btn.className =
        'flex-1 py-2 bg-gradient-to-r from-red-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-black text-xs rounded-lg tracking-widest transition active:scale-95';
    }
  }
}

export function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function showStatus(text, percent) {
  const container = document.getElementById('statusContainer');
  container.classList.remove('hidden');
  document.getElementById('statusText').innerText = text;
  document.getElementById('statusPercent').innerText = `${percent}%`;
  document.getElementById('statusBar').style.width = `${percent}%`;
}

export function hideStatus() {
  document.getElementById('statusContainer').classList.add('hidden');
}

let toastTimer = null;
export function showToast(text) {
  const toast = document.getElementById('toast');
  toast.innerText = text;
  toast.classList.remove('translate-y-20', 'opacity-0');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
    toastTimer = null;
  }, 3500);
}
