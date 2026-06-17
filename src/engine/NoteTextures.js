import * as PIXI from 'pixi.js';

const NOTE_SIZE = 56;
const HALF = NOTE_SIZE / 2;
const RADIUS = 12;

export { NOTE_SIZE };

const NOTE_COLORS = {
  red: { body: 0xde3d4e, rim: 0xff6b7a },
  blue: { body: 0x2b94e3, rim: 0x5eb0f0 },
};

/**
 * ベース形＝下カット（上辺マーカー・Vが内側）。
 * 0=Up→180°, 1=Down→0°, 2=Left→-90°, 3=Right→90°,
 * 4=UpLeft→135°, 5=UpRight→-135°, 6=DownLeft→45°, 7=DownRight→-45°
 */
export const NOTE_ROTATION = [180, 0, -90, 90, 135, -135, 45, -45];

/** カットエフェクト — マーカー方向（＝切る方向）に斬撃ラインを合わせる */
export function getCutSlashAngle(cutDirection) {
  if (cutDirection >= 8) return 0;
  return (NOTE_ROTATION[cutDirection] * Math.PI) / 180 + Math.PI / 2;
}

function textureKey(type, cutDirection) {
  return `${type}_${cutDirection}`;
}

function drawBomb(g) {
  const size = NOTE_SIZE;

  g.beginFill(0x000000, 0.35);
  g.drawCircle(2, 3, size * 0.38);
  g.endFill();

  g.beginFill(0x1a1a22);
  g.lineStyle(2, 0x3a3a48, 1);
  g.drawCircle(0, 0, size * 0.38);
  g.endFill();

  g.beginFill(0xff9500, 0.9);
  g.drawCircle(0, 0, size * 0.14);
  g.endFill();

  g.lineStyle(2.5, 0xffbb00, 0.95);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    g.moveTo(Math.cos(a) * (size * 0.18), Math.sin(a) * (size * 0.18));
    g.lineTo(Math.cos(a) * (size * 0.5), Math.sin(a) * (size * 0.5));
  }
}

/** ノーツ本体＋マーカーを1つの Graphics に描く（個別操作なし） */
function createNoteGraphics(type, cutDirection) {
  const note = new PIXI.Graphics();

  if (type === 3) {
    drawBomb(note);
    return note;
  }

  const palette = type === 0 ? NOTE_COLORS.red : NOTE_COLORS.blue;
  const edgeInset = NOTE_SIZE * 0.06;
  const halfSpan = HALF - edgeInset;
  const biteDepth = NOTE_SIZE * 0.23;

  note.beginFill(palette.body);
  note.lineStyle(1.5, palette.rim, 0.55);
  note.drawRoundedRect(-HALF, -HALF, NOTE_SIZE, NOTE_SIZE, RADIUS);
  note.endFill();

  if (cutDirection === 8) {
    note.beginFill(0xffffff, 1);
    note.drawCircle(0, 0, NOTE_SIZE * 0.14);
    note.endFill();
    return note;
  }

  note.beginFill(0xffffff, 1);
  note.moveTo(-halfSpan, -HALF + edgeInset);
  note.lineTo(halfSpan, -HALF + edgeInset);
  note.lineTo(0, -HALF + edgeInset + biteDepth);
  note.closePath();
  note.endFill();

  note.rotation = (NOTE_ROTATION[cutDirection] * Math.PI) / 180;
  return note;
}

export class NoteTextureCache {
  constructor(renderer) {
    this.renderer = renderer;
    this.textures = new Map();
    this._buildAll();
  }

  _buildAll() {
    for (const type of [0, 1]) {
      for (let dir = 0; dir <= 8; dir++) {
        this._create(type, dir);
      }
    }
    this._create(3, 8);
  }

  _create(type, cutDirection) {
    const container = new PIXI.Container();
    container.addChild(createNoteGraphics(type, cutDirection));

    const isDiagonal = cutDirection >= 4 && cutDirection <= 7;
    const pad = isDiagonal ? 12 : 4;
    const texture = this.renderer.generateTexture(container, {
      resolution: 3,
      region: new PIXI.Rectangle(-HALF - pad, -HALF - pad, NOTE_SIZE + pad * 2, NOTE_SIZE + pad * 2),
    });
    container.destroy({ children: true });
    this.textures.set(textureKey(type, cutDirection), texture);
  }

  get(type, cutDirection) {
    const key = textureKey(type, cutDirection);
    return this.textures.get(key) ?? this.textures.get(textureKey(type, 8));
  }

  destroy() {
    for (const tex of this.textures.values()) {
      tex.destroy(true);
    }
    this.textures.clear();
  }
}

export function computeNjsApproachSec(njs, bpm) {
  const speed = Math.max(1, Number(njs) || 12);
  const rate = Math.max(1, Number(bpm) || 120);
  const jumpBeats = Math.max(1.5, Math.min(4.0, 18 / speed));
  return jumpBeats * (60 / rate);
}

export function formatSpawnLeadLabel(offsetSec, effectiveSec) {
  if (Math.abs(offsetSec) < 0.05) {
    return `${effectiveSec.toFixed(1)}s (NJS)`;
  }
  const sign = offsetSec > 0 ? '+' : '';
  return `${effectiveSec.toFixed(1)}s (NJS${sign}${offsetSec.toFixed(1)}s)`;
}

export function findVisibleRange(sortedItems, currentBeat, spawnLeadBeats, tailPadding = 0.2) {
  const minTime = currentBeat - tailPadding;
  const maxTime = currentBeat + spawnLeadBeats;

  let lo = 0;
  let hi = sortedItems.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedItems[mid]._time < minTime) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;

  lo = start;
  hi = sortedItems.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedItems[mid]._time <= maxTime) lo = mid + 1;
    else hi = mid;
  }

  return { start, end: lo };
}
