import { CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_VOLUME, CHUNK_AREA } from './constants.js';

export const CHUNK_STATE = {
  EMPTY: 0,
  GENERATED: 1, // blocks + direct sunlight columns are filled in
  LIT: 2, // light has been flood-filled (needs all 8 neighbours generated)
};

export function chunkKey(cx, cz) {
  return (cx + 32768) * 65536 + (cz + 32768);
}

// A 16 x 128 x 16 column of blocks. Index layout: y-major, then z, then x.
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    // Light: high nibble = sky light, low nibble = block (torch) light.
    this.light = new Uint8Array(CHUNK_VOLUME);
    // Height of the highest non-air block + 1, per column (0 = empty column).
    this.heightmap = new Uint8Array(CHUNK_AREA);
    // Biome climate per column (temperature, humidity as 0..255), used to
    // tint grass and leaves.
    this.climate = new Uint8Array(CHUNK_AREA * 2).fill(128);
    this.state = CHUNK_STATE.EMPTY;
    this.dirty = true; // mesh needs rebuilding
    this.mesh = null; // GPU buffers, owned by the renderer
  }

  static index(x, y, z) {
    return (y << 8) | (z << 4) | x;
  }

  get(x, y, z) {
    return this.blocks[(y << 8) | (z << 4) | x];
  }

  set(x, y, z, id) {
    this.blocks[(y << 8) | (z << 4) | x] = id;
  }

  updateHeight(x, z) {
    let y = CHUNK_HEIGHT - 1;
    while (y >= 0 && this.blocks[(y << 8) | (z << 4) | x] === 0) y--;
    this.heightmap[(z << 4) | x] = y + 1;
  }

  computeHeightmap() {
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) this.updateHeight(x, z);
  }
}
