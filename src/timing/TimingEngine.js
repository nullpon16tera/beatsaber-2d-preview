/**
 * Beat Saber 準拠のタイミング変換（BPMInfo / songTimeOffset 対応）
 */
export class TimingEngine {
  constructor(defaultBpm, songTimeOffset = 0) {
    this.songTimeOffset = Number(songTimeOffset) || 0;
    this.segments = [{ beat: 0, bpm: Math.max(1, Number(defaultBpm) || 120), time: 0 }];
  }

  setBpmEvents(events) {
    if (!events?.length) return;

    const sorted = [...events]
      .map((e) => ({ beat: Number(e.beat), bpm: Math.max(1, Number(e.bpm)) }))
      .filter((e) => Number.isFinite(e.beat) && Number.isFinite(e.bpm))
      .sort((a, b) => a.beat - b.beat);

    if (!sorted.length) return;

    const segments = [];
    let time = 0;
    for (let i = 0; i < sorted.length; i++) {
      const { beat, bpm } = sorted[i];
      if (i > 0) {
        const prev = sorted[i - 1];
        time += (beat - prev.beat) * (60 / prev.bpm);
      }
      segments.push({ beat, bpm, time });
    }
    this.segments = segments;
  }

  getBaseBpm() {
    return this.segments[0]?.bpm ?? 120;
  }

  timeToBeat(seconds) {
    const t = seconds - this.songTimeOffset;
    if (t <= 0) return 0;

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      if (t >= seg.time) {
        return seg.beat + (t - seg.time) * (seg.bpm / 60);
      }
    }
    return 0;
  }

  beatToTime(beat) {
    if (beat <= this.segments[0].beat) {
      return this.segments[0].time + this.songTimeOffset;
    }

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const nextBeat = this.segments[i + 1]?.beat ?? Infinity;
      if (beat < nextBeat) {
        return seg.time + (beat - seg.beat) * (60 / seg.bpm) + this.songTimeOffset;
      }
    }

    const last = this.segments[this.segments.length - 1];
    return last.time + (beat - last.beat) * (60 / last.bpm) + this.songTimeOffset;
  }
}

export function parseBpmInfoJson(json) {
  const raw = json._BPMEvents || json._events || [];
  return raw.map((e) => ({
    beat: e._time ?? e.b ?? 0,
    bpm: e._BPM ?? e._bpm ?? 0,
  }));
}

export function computeChartEndBeat(notes, obstacles) {
  let end = 0;
  for (const n of notes) {
    if (n._time > end) end = n._time;
  }
  for (const o of obstacles) {
    const oEnd = o._time + (o._duration || 0);
    if (oEnd > end) end = oEnd;
  }
  return end;
}
