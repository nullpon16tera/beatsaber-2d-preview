import * as PIXI from 'pixi.js';
import { NoteTextureCache, findVisibleRange, computeNjsApproachSec, formatSpawnLeadLabel, NOTE_SIZE, getCutSlashAngle } from './NoteTextures.js';
import { SpritePool, GraphicsPool } from './SpritePool.js';
import { TimingEngine, computeChartEndBeat } from '../timing/TimingEngine.js';

const MAX_EFFECTS = 48;
const MAX_RENDERED_NOTES = 180;
const JUDGE_HALF = NOTE_SIZE / 2;

export class PreviewEngine {
  constructor(audioPlayer) {
    this.audioPlayer = audioPlayer;
    this.app = null;
    this.width = 800;
    this.height = 500;

    this.bgLayer = null;
    this.gridLayer = null;
    this.obstacleLayer = null;
    this.noteLayer = null;
    this.effectLayer = null;

    this.bgGraphics = null;
    this.gridGraphics = null;

    this.centerX = 400;
    this.centerY = 150;
    this.targetY = 400;
    this.spacingX = 92;
    this.spacingY = 104;
    this.layerYFactor = 0.88;

    this.bpm = 120;
    this.njs = 12;
    /** NJS基準からのスポーン時間オフセット（秒）。0 = 純NJS */
    this.spawnOffsetSec = 0;
    this.timing = new TimingEngine(120, 0);
    this.chartEndBeat = 0;
    this.chartEndTimeSec = 0;

    this.notes = [];
    this.obstacles = [];
    this.effects = [];
    this.isReady = false;

    this.textureCache = null;
    this.notePool = null;
    this.obstaclePool = null;

    this._resizeHandler = () => this.resize();
    this._tickerFn = (delta) => this.update(delta);
  }

  init() {
    const container = document.getElementById('previewContainer');
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.centerX = this.width / 2;
    this.centerY = this.height * 0.35;
    this.targetY = this.height * 0.72;

    this.app = new PIXI.Application({
      width: this.width,
      height: this.height,
      backgroundColor: 0x03030b,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      powerPreference: 'high-performance',
    });

    container.appendChild(this.app.view);

    this.bgLayer = new PIXI.Container();
    this.gridLayer = new PIXI.Container();
    this.obstacleLayer = new PIXI.Container();
    this.noteLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();

    this.app.stage.addChild(this.bgLayer);
    this.app.stage.addChild(this.gridLayer);
    this.app.stage.addChild(this.obstacleLayer);
    this.app.stage.addChild(this.noteLayer);
    this.app.stage.addChild(this.effectLayer);

    this.textureCache = new NoteTextureCache(this.app.renderer);
    this.notePool = new SpritePool(this.noteLayer, () => new PIXI.Sprite());
    this.obstaclePool = new GraphicsPool(this.obstacleLayer, 24);

    this.drawBackground();
    this.app.ticker.add(this._tickerFn);
    window.addEventListener('resize', this._resizeHandler);
  }

  destroy() {
    if (!this.app) return;
    window.removeEventListener('resize', this._resizeHandler);
    this.app.ticker.remove(this._tickerFn);
    this.clearActiveElements();
    this.textureCache?.destroy();
    this.notePool?.destroy();
    this.obstaclePool?.destroy();
    this.bgGraphics?.destroy();
    this.gridGraphics?.destroy();
    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = null;
  }

  resize() {
    const container = document.getElementById('previewContainer');
    if (!container || !this.app) return;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.app.renderer.resize(this.width, this.height);
    this.centerX = this.width / 2;
    this.centerY = this.height * 0.35;
    this.targetY = this.height * 0.72;
    this.drawBackground();
  }

  drawBackground() {
    if (this.bgGraphics) {
      this.bgGraphics.destroy();
      this.bgGraphics = null;
    }
    if (this.gridGraphics) {
      this.gridGraphics.destroy();
      this.gridGraphics = null;
    }

    const grid = new PIXI.Graphics();
    grid.lineStyle(1.5, 0x1c1c38, 0.4);

    const lanes = 4;
    const layers = 3;

    for (let ly = 0; ly < layers; ly++) {
      const localY = -(ly - 1.0) * this.spacingY * this.layerYFactor;
      const targetLayerY = this.targetY + localY;

      for (let lx = 0; lx < lanes; lx++) {
        const localX = (lx - 1.5) * this.spacingX;
        const targetLaneX = this.centerX + localX;
        grid.moveTo(this.centerX, this.centerY);
        grid.lineTo(targetLaneX, targetLayerY);
      }
    }

    for (let i = 0; i <= 10; i++) {
      const progress = i / 10;
      const scale = 0.05 + 0.95 * progress;

      grid.lineStyle(i === 10 ? 2 : 1, i === 10 ? 0x00d2ff : 0x1c1c38, i === 10 ? 0.6 : 0.25);

      const leftX = this.centerX + -1.5 * this.spacingX * scale;
      const rightX = this.centerX + 1.5 * this.spacingX * scale;
      const bottomY = this.centerY + (this.targetY - this.centerY) * progress + this.spacingY * scale * this.layerYFactor;
      const topY = this.centerY + (this.targetY - this.centerY) * progress + -this.spacingY * scale * this.layerYFactor;

      grid.drawRect(leftX, topY, rightX - leftX, bottomY - topY);

      grid.lineStyle(1, 0x1c1c38, 0.1);
      for (let lx = -1; lx <= 1; lx++) {
        const x = this.centerX + lx * this.spacingX * scale;
        grid.moveTo(x, topY);
        grid.lineTo(x, bottomY);
      }
      for (let ly = -0.5; ly <= 0.5; ly += 1.0) {
        const y = this.centerY + (this.targetY - this.centerY) * progress + ly * this.spacingY * scale * this.layerYFactor * 2;
        grid.moveTo(leftX, y);
        grid.lineTo(rightX, y);
      }
    }
    this.bgGraphics = grid;
    this.bgLayer.addChild(grid);

    const judgeSquares = new PIXI.Graphics();
    for (let layer = 0; layer < 3; layer++) {
      for (let lane = 0; lane < 4; lane++) {
        const localX = (lane - 1.5) * this.spacingX;
        const localY = -(layer - 1.0) * this.spacingY * this.layerYFactor;
        const screenX = this.centerX + localX;
        const screenY = this.targetY + localY;
        judgeSquares.lineStyle(1.5, 0xffffff, 0.15);
        judgeSquares.drawRoundedRect(screenX - JUDGE_HALF, screenY - JUDGE_HALF, NOTE_SIZE, NOTE_SIZE, 6);
      }
    }
    this.gridGraphics = judgeSquares;
    this.gridLayer.addChild(judgeSquares);
  }

  getLaneOffsetX(lineIndex) {
    return (lineIndex - 1.5) * this.spacingX;
  }

  getLaneOffsetY(lineLayer) {
    return -(lineLayer - 1.0) * this.spacingY * this.layerYFactor;
  }

  getJudgePos(lineIndex, lineLayer) {
    return {
      x: this.centerX + this.getLaneOffsetX(lineIndex),
      y: this.targetY + this.getLaneOffsetY(lineLayer),
    };
  }

  /** NJS から算出する基準アプローチ時間（秒）— jumpDistance = 18/NJS beats */
  getNjsApproachSec() {
    const bpm = this.getBpmAtBeat(this.getCurrentBeat());
    return computeNjsApproachSec(this.njs, bpm);
  }

  getBpmAtBeat(beat) {
    const segments = this.timing.segments;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (beat >= segments[i].beat) return segments[i].bpm;
    }
    return this.bpm;
  }

  getNjsApproachBeats() {
    const bpm = this.getBpmAtBeat(this.getCurrentBeat());
    return this.getNjsApproachSec() * (bpm / 60);
  }

  /** 実際の表示アプローチ = NJS基準 + スライダーオフセット */
  getVisualApproachSec() {
    const adjusted = this.getNjsApproachSec() + this.spawnOffsetSec;
    return Math.max(0.1, adjusted);
  }

  getVisualApproachBeats() {
    const sec = this.getVisualApproachSec();
    const midBeat = this.timing.timeToBeat(this.audioPlayer.getCurrentTime() + sec * 0.5);
    const bpmAtMid = this.getBpmAtBeat(midBeat);
    return sec * (bpmAtMid / 60);
  }

  refreshApproachUI() {
    const bar = document.getElementById('approachBar');
    const label = document.getElementById('approachValue');
    if (!bar || !label) return;
    const offset = parseFloat(bar.value);
    label.innerText = formatSpawnLeadLabel(offset, this.getVisualApproachSec());
  }

  getSpawnBeat(noteTime) {
    return noteTime - this.getVisualApproachBeats();
  }

  getApproachProgress(currentBeat, noteTime) {
    const lead = this.getVisualApproachBeats();
    const spawnBeat = noteTime - lead;
    return Math.min(1, Math.max(0, (currentBeat - spawnBeat) / lead));
  }

  isNoteVisible(currentBeat, noteTime, tailBeats = 0.2) {
    const lead = this.getVisualApproachBeats();
    const spawnBeat = noteTime - lead;
    return currentBeat >= spawnBeat && currentBeat <= noteTime + tailBeats;
  }

  isObstacleVisible(currentBeat, obstacle) {
    const lead = this.getVisualApproachBeats();
    const spawnBeat = obstacle._time - lead;
    return currentBeat >= spawnBeat && currentBeat <= obstacle._time + obstacle._duration;
  }

  setMapData(notes, obstacles, bpm, njs, timingOptions = {}) {
    this.notes = notes;
    this.obstacles = obstacles;
    this.bpm = parseFloat(bpm) || 120;
    this.njs = parseFloat(njs) || 12;

    const songTimeOffset = timingOptions.songTimeOffset ?? 0;
    this.timing = new TimingEngine(this.bpm, songTimeOffset);
    if (timingOptions.bpmEvents?.length) {
      this.timing.setBpmEvents(timingOptions.bpmEvents);
    }

    this.chartEndBeat = computeChartEndBeat(notes, obstacles);
    this.chartEndTimeSec = this.timing.beatToTime(this.chartEndBeat + 0.5);

    const approachBar = document.getElementById('approachBar');
    this.spawnOffsetSec = approachBar ? parseFloat(approachBar.value) : 0;

    this.clearActiveElements();
    for (const n of this.notes) n.processed = false;
    this.isReady = true;
    this.refreshApproachUI();
    this.refreshChartDurationUI();
  }

  refreshChartDurationUI() {
    const hint = document.getElementById('chartEndHint');
    if (!hint) return;
    const audioDur = this.audioPlayer.getDuration();
    if (this.chartEndTimeSec > 0 && audioDur > 0 && this.chartEndTimeSec < audioDur - 1) {
      const mins = Math.floor(this.chartEndTimeSec / 60);
      const secs = Math.floor(this.chartEndTimeSec % 60);
      hint.innerText = `(譜面 ${mins}:${secs < 10 ? '0' : ''}${secs})`;
    } else {
      hint.innerText = '';
    }
  }

  isPastChartEnd() {
    return this.audioPlayer.getCurrentTime() > this.chartEndTimeSec + 0.3;
  }

  clearActiveElements() {
    this.notePool?.releaseAll();
    this.obstaclePool?.releaseAll();
    this.clearEffects();
  }

  clearEffects() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].obj.destroy();
    }
    this.effects.length = 0;
    this.effectLayer.removeChildren();
  }

  update(delta) {
    if (!this.isReady) return;

    const currentBeat = this.getCurrentBeat();
    this.drawNotesAtBeat(currentBeat);
    this.updateEffects(delta);
  }

  getCurrentBeat() {
    const timeSec = this.audioPlayer.getCurrentTime();
    return this.timing.timeToBeat(timeSec);
  }

  drawNotesAtBeat(currentBeat) {
    this.notePool.releaseAll();
    this.obstaclePool.releaseAll();

    const visualLeadBeats = Math.max(this.getVisualApproachBeats(), 0.05);
    const noteRange = findVisibleRange(this.notes, currentBeat, visualLeadBeats, 0.5);
    let renderedNotes = 0;

    for (let i = noteRange.end - 1; i >= noteRange.start; i--) {
      if (renderedNotes >= MAX_RENDERED_NOTES) break;

      const note = this.notes[i];

      if (!this.isNoteVisible(currentBeat, note._time)) continue;

      if (!note.processed && currentBeat >= note._time) {
        note.processed = true;
        if (this.audioPlayer.isPlaying) {
          if (note._type !== 3) {
            this.audioPlayer.playHitSound(note._type);
            const sliceAngle = this.getCutDirectionAngle(note._cutDirection);
            this.createCutEffect(note, sliceAngle);
          } else {
            this.createExplosion(note);
          }
        }
      }

      if (currentBeat < note._time) {
        note.processed = false;
      }

      const progress = this.getApproachProgress(currentBeat, note._time);
      if (progress <= 0) continue;

      this.renderNoteSprite(note, progress);
      renderedNotes++;
    }

    const obsRange = findVisibleRange(this.obstacles, currentBeat, visualLeadBeats, 5);
    for (let i = obsRange.end - 1; i >= obsRange.start; i--) {
      const o = this.obstacles[i];

      if (!this.isObstacleVisible(currentBeat, o)) continue;

      const spawnBeat = this.getSpawnBeat(o._time);
      const lead = visualLeadBeats;
      const startProgress = (currentBeat - spawnBeat) / lead;
      const endProgress = (currentBeat - (spawnBeat + o._duration)) / lead;
      this.renderObstacle(o, startProgress, endProgress);
    }
  }

  renderNoteSprite(note, progress) {
    const sprite = this.notePool.acquire();
    sprite.texture = this.textureCache.get(note._type, note._cutDirection);
    sprite.anchor.set(0.5);

    // 真正面2D: レーン位置は固定、奥行きはスケールと透明度のみ
    const { x, y } = this.getJudgePos(note._lineIndex, note._lineLayer);
    const scale = 0.2 + 0.8 * progress;

    sprite.x = x;
    sprite.y = y;
    sprite.scale.set(scale);
    sprite.alpha = Math.min(1.0, progress * 4);
  }

  renderObstacle(wall, startProgress, endProgress) {
    const g = this.obstaclePool.acquire();

    const width = wall._width * this.spacingX;
    const layer = wall._lineLayer || 0;
    const localYBottom = this.getLaneOffsetY(layer);
    const localYTop = localYBottom - (wall._height || 1) * this.spacingY * this.layerYFactor;

    const screenX = this.centerX + this.getLaneOffsetX(wall._lineIndex);
    const yBottom = this.targetY + localYBottom;
    const yTop = this.targetY + localYTop;

    const clipStart = Math.max(0, Math.min(1.0, startProgress));
    const scaleFront = 0.2 + 0.8 * clipStart;

    g.beginFill(0xff0055, 0.15);
    g.lineStyle(1.5, 0xff0055, 0.6);

    const wFront = width * scaleFront;
    const hFront = (yBottom - yTop) * scaleFront;
    const xFront = screenX - wFront / 2;
    const yFront = yBottom - hFront;

    g.drawRect(xFront, yFront, wFront, hFront);
    g.endFill();

    void endProgress;
  }

  getCutDirectionAngle(dir) {
    return getCutSlashAngle(dir);
  }

  createCutEffect(note, sliceAngle) {
    if (this.effects.length >= MAX_EFFECTS) return;

    const { x: screenX, y: screenY } = this.getJudgePos(note._lineIndex, note._lineLayer);
    const color = note._type === 0 ? 0xff0055 : 0x00d2ff;

    for (let i = 0; i < 5; i++) {
      if (this.effects.length >= MAX_EFFECTS) break;
      const spark = new PIXI.Graphics();
      spark.beginFill(0xffffff);
      spark.lineStyle(1.5, color, 1.0);
      spark.drawCircle(0, 0, 2 + Math.random() * 2);
      spark.endFill();
      spark.x = screenX;
      spark.y = screenY;

      const spread = 0.2;
      const angle = sliceAngle + (Math.random() * spread - spread / 2);
      const speed = 2 + Math.random() * 3;

      this.effectLayer.addChild(spark);
      this.effects.push({
        obj: spark,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.06,
      });
    }

    if (this.effects.length >= MAX_EFFECTS) return;

    const line = new PIXI.Graphics();
    line.lineStyle(2.5, 0xffffff, 0.9);
    line.moveTo(-40, 0);
    line.lineTo(40, 0);
    line.x = screenX;
    line.y = screenY;
    line.rotation = sliceAngle;

    this.effectLayer.addChild(line);
    this.effects.push({
      obj: line,
      vx: 0,
      vy: 0,
      life: 1.0,
      decay: 0.12,
      onUpdate: (e) => {
        e.obj.alpha = e.life;
      },
    });
  }

  createExplosion(note) {
    if (this.effects.length >= MAX_EFFECTS) return;

    const { x: screenX, y: screenY } = this.getJudgePos(note._lineIndex, note._lineLayer);

    const ring = new PIXI.Graphics();
    ring.lineStyle(3, 0xffaa00, 1.0);
    ring.drawCircle(0, 0, 15);
    ring.x = screenX;
    ring.y = screenY;

    this.effectLayer.addChild(ring);
    this.effects.push({
      obj: ring,
      vx: 0,
      vy: 0,
      life: 1.0,
      decay: 0.08,
      onUpdate: (e) => {
        const scale = 1 + (1 - e.life) * 4;
        e.obj.scale.set(scale);
      },
    });
  }

  updateEffects(delta) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= e.decay * delta;

      if (e.life <= 0) {
        e.obj.destroy();
        this.effects.splice(i, 1);
        continue;
      }

      e.obj.alpha = e.life;
      e.obj.x += e.vx * delta;
      e.obj.y += e.vy * delta;

      if (e.onUpdate) e.onUpdate(e);
    }
  }
}
