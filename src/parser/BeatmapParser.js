export class BeatmapParser {
  static parse(json) {
    let notes = [];
    let obstacles = [];

    if (json.version && json.version.startsWith('3')) {
      if (json.colorNotes) {
        notes = json.colorNotes.map((n) => ({
          _time: n.b,
          _lineIndex: n.x,
          _lineLayer: n.y,
          _type: n.c,
          _cutDirection: n.d,
          processed: false,
        }));
      }
      if (json.bombNotes) {
        const bombs = json.bombNotes.map((b) => ({
          _time: b.b,
          _lineIndex: b.x,
          _lineLayer: b.y,
          _type: 3,
          _cutDirection: 8,
          processed: false,
        }));
        notes = notes.concat(bombs);
      }
      if (json.obstacles) {
        obstacles = json.obstacles.map((o) => ({
          _time: o.b,
          _lineIndex: o.x,
          _lineLayer: o.y,
          _duration: o.d,
          _width: o.w,
          _height: o.h,
        }));
      }
    } else {
      if (json._notes) {
        notes = json._notes.map((n) => ({
          _time: n._time,
          _lineIndex: n._lineIndex,
          _lineLayer: n._lineLayer,
          _type: n._type,
          _cutDirection: n._cutDirection,
          processed: false,
        }));
      }
      if (json._obstacles) {
        obstacles = json._obstacles.map((o) => ({
          _time: o._time,
          _lineIndex: o._lineIndex,
          _lineLayer: o._type === 1 ? 2 : 0,
          _duration: o._duration,
          _width: o._width,
          _height: o._type === 1 ? 1 : 3,
        }));
      }
    }

    notes.sort((a, b) => a._time - b._time);
    obstacles.sort((a, b) => a._time - b._time);

    return { notes, obstacles };
  }
}
