import * as PIXI from 'pixi.js';

const MAX_POOL_SIZE = 256;

export class SpritePool {
  constructor(layer, createFn, initialSize = 32) {
    this.layer = layer;
    this.createFn = createFn;
    this.pool = [];
    this.active = [];

    for (let i = 0; i < initialSize; i++) {
      const sprite = this.createFn();
      sprite.visible = false;
      this.pool.push(sprite);
    }
  }

  acquire() {
    const sprite = this.pool.pop() ?? this.createFn();
    sprite.visible = true;
    this.active.push(sprite);
    if (!sprite.parent) this.layer.addChild(sprite);
    return sprite;
  }

  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const sprite = this.active[i];
      sprite.visible = false;
      if (this.pool.length < MAX_POOL_SIZE) {
        this.pool.push(sprite);
      } else {
        sprite.destroy({ children: true });
      }
    }
    this.active.length = 0;
  }

  destroy() {
    this.releaseAll();
    const all = [...this.pool];
    this.pool.length = 0;
    for (const sprite of all) {
      sprite.destroy({ children: true });
    }
  }
}

export class GraphicsPool {
  constructor(layer, initialSize = 16) {
    this.layer = layer;
    this.pool = [];
    this.active = [];

    for (let i = 0; i < initialSize; i++) {
      const g = new PIXI.Graphics();
      g.visible = false;
      this.pool.push(g);
    }
  }

  acquire() {
    const g = this.pool.pop() ?? new PIXI.Graphics();
    g.clear();
    g.visible = true;
    this.active.push(g);
    if (!g.parent) this.layer.addChild(g);
    return g;
  }

  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const g = this.active[i];
      g.clear();
      g.visible = false;
      if (this.pool.length < MAX_POOL_SIZE) {
        this.pool.push(g);
      } else {
        g.destroy();
      }
    }
    this.active.length = 0;
  }

  destroy() {
    this.releaseAll();
    for (const g of this.pool) {
      g.destroy();
    }
    this.pool.length = 0;
  }
}
