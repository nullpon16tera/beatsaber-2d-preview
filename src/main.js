import './styles.css';
import { AudioPlayer } from './audio/AudioPlayer.js';
import { PreviewEngine } from './engine/PreviewEngine.js';
import { MapLoader, formatTime, showStatus, showToast } from './loader/MapLoader.js';
import { loadSavedVolume, saveVolume } from './settings/volume.js';

const audioPlayer = new AudioPlayer();
const previewEngine = new PreviewEngine(audioPlayer);
const mapLoader = new MapLoader(audioPlayer, previewEngine);

function initVolumeFromStorage() {
  const vol = loadSavedVolume();
  const bar = document.getElementById('volumeBar');
  if (bar) bar.value = String(vol);
  changeVolume();
}

window.addEventListener('load', () => {
  initVolumeFromStorage();
  previewEngine.init();
  audioPlayer.onEnded = () => mapLoader.updatePlayButtonUI();
  setupDragAndDrop();
  setupSeeker();
  setupLocalFileLoader();
  startTimelineLoop();
});

function startTimelineLoop() {
  let rafId = 0;
  const tick = () => {
    if (audioPlayer.isPlaying) {
      const cur = audioPlayer.getCurrentTime();
      document.getElementById('timeCurrent').innerText = formatTime(cur);
      document.getElementById('seekBar').value = cur;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(rafId);
    previewEngine.destroy();
  });
}

function setupSeeker() {
  const bar = document.getElementById('seekBar');
  let wasPlaying = false;

  bar.addEventListener('input', () => {
    if (audioPlayer.isPlaying) {
      wasPlaying = true;
      audioPlayer.pause();
    }
    const val = parseFloat(bar.value);
    document.getElementById('timeCurrent').innerText = formatTime(val);
    audioPlayer.seek(val);
  });

  bar.addEventListener('change', () => {
    const val = parseFloat(bar.value);
    audioPlayer.seek(val);
    if (wasPlaying) wasPlaying = false;
  });
}

window.togglePlay = function togglePlay() {
  if (audioPlayer.isPlaying) audioPlayer.pause();
  else audioPlayer.play();
  mapLoader.updatePlayButtonUI();
};

window.resetPlayback = function resetPlayback() {
  audioPlayer.seek(0);
  document.getElementById('seekBar').value = 0;
  document.getElementById('timeCurrent').innerText = '0:00';
  mapLoader.updatePlayButtonUI();
};

window.changeSpeed = function changeSpeed() {
  const select = document.getElementById('speedSelect');
  audioPlayer.setPlaybackRate(parseFloat(select.value));
};

window.changeVolume = function changeVolume() {
  const val = parseInt(document.getElementById('volumeBar').value, 10);
  document.getElementById('volumePercent').innerText = `${val}%`;
  saveVolume(val);
  const normalizedVal = val / 100;

  if (audioPlayer.masterVolume) {
    audioPlayer.masterVolume.gain.setValueAtTime(
      normalizedVal * 0.8,
      audioPlayer.ctx ? audioPlayer.ctx.currentTime : 0,
    );
  }
  if (audioPlayer.synth.sfxGain) {
    audioPlayer.synth.setSfxVolume(normalizedVal);
  }
  if (audioPlayer.synth.bgmGain) {
    audioPlayer.synth.setBgmVolume(normalizedVal);
  }
};

window.changeApproach = function changeApproach() {
  const offset = parseFloat(document.getElementById('approachBar').value);
  previewEngine.spawnOffsetSec = offset;
  previewEngine.refreshApproachUI();
  const currentBeat = previewEngine.getCurrentBeat();
  for (const n of previewEngine.notes) {
    if (n._time > currentBeat) n.processed = false;
  }
};

function setupLocalFileLoader() {
  const input = document.getElementById('localFile');
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      mapLoader.resetLoaderState();
      loadZipFile(file);
    }
    input.value = '';
  });
}

function loadZipFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    showStatus('Parsing local zip file...', 20);
    await mapLoader.loadZipData(e.target.result);
  };
  reader.readAsArrayBuffer(file);
}

window.loadFromInput = function loadFromInput() {
  let input = document.getElementById('mapInput').value.trim();
  if (!input) {
    showToast('⚠️ マップのURLかIDを入力してください！');
    return;
  }

  if (input.toLowerCase().startsWith('!bsr')) {
    input = input.substring(4).trim();
  }

  let id = input;
  if (input.includes('/')) {
    const parts = input.split('/');
    id = parts[parts.length - 1] || parts[parts.length - 2];
  }

  id = id.split('?')[0].split('#')[0];
  mapLoader.fetchMapInfo(id);
};

window.quickLoad = function quickLoad(id) {
  document.getElementById('mapInput').value = id;
  loadFromInput();
};

function setupDragAndDrop() {
  const zone = document.getElementById('dropZone');
  const target = document.body;

  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.remove('opacity-0', 'pointer-events-none');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.add('opacity-0', 'pointer-events-none');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.add('opacity-0', 'pointer-events-none');

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
      loadZipFile(file);
    } else {
      showToast('❌ ZIPファイルのみドロップ可能です！');
    }
  });
}
