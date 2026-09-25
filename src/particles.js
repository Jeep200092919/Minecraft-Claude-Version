// Block-breaking debris: little textured squares that bounce on the ground.
import { IS_SOLID, BLOCKS } from './blocks.js';
import { blockFaceLayer } from './mesher.js';

const MAX_PARTICLES = 600;

export class Particles {
  constructor() {
    this.list = [];
  }

  _spawn(x, y, z, vx, vy, vz, layer) {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push({
      x, y, z, vx, vy, vz, layer,
      u: Math.floor(Math.random() * 12),
      v: Math.floor(Math.random() * 12),
      size: 0.07 + Math.random() * 0.06,
      life: 0.45 + Math.random() * 0.6,
      age: 0,
    });
  }

  // A burst when a block breaks.
  burst(x, y, z, id) {
    if (!BLOCKS[id].faces) return;
    const layer = blockFaceLayer(id, 0);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          const px = x + (i + 0.5) / 4, py = y + (j + 0.5) / 4, pz = z + (k + 0.5) / 4;
          if (Math.random() < 0.55) continue;
          this._spawn(px, py, pz, (px - x - 0.5) * 4 + (Math.random() - 0.5), (py - y - 0.5) * 4 + 1.5 + Math.random() * 1.5, (pz - z - 0.5) * 4 + (Math.random() - 0.5), layer);
        }
      }
    }
  }

  // A few chips flying off the face being mined.
  chip(x, y, z, id, normal) {
    if (!BLOCKS[id].faces) return;
    const layer = blockFaceLayer(id, 0);
    for (let i = 0; i < 2; i++) {
      const px = x + 0.5 + normal[0] * 0.55 + (normal[0] ? 0 : Math.random() - 0.5);
      const py = y + 0.5 + normal[1] * 0.55 + (normal[1] ? 0 : Math.random() - 0.5);
      const pz = z + 0.5 + normal[2] * 0.55 + (normal[2] ? 0 : Math.random() - 0.5);
      this._spawn(px, py, pz, normal[0] * 1.5 + (Math.random() - 0.5), 1 + Math.random(), normal[2] * 1.5 + (Math.random() - 0.5), layer);
    }
  }

  update(dt, world) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        list.splice(i, 1);
        continue;
      }
      p.vy -= 16 * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (IS_SOLID[world.getBlock(Math.floor(p.x), Math.floor(ny - p.size / 2), Math.floor(p.z))]) {
        p.vy = 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
      } else p.y = ny;
      if (!IS_SOLID[world.getBlock(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))]) p.x = nx;
      if (!IS_SOLID[world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))]) p.z = nz;
    }
  }

  clear() {
    this.list.length = 0;
  }
}
