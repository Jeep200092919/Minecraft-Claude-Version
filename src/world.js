// The world: chunk storage, block access, light propagation and the chunk
// streaming pipeline (generate -> light -> mesh).
import { CHUNK_SIZE, CHUNK_HEIGHT, MAX_LIGHT } from './constants.js';
import { B, BLOCKS, LIGHT_ATTEN, LIGHT_EMIT } from './blocks.js';
import { Chunk, CHUNK_STATE, chunkKey } from './chunk.js';
import { WorldGenerator } from './worldgen.js';
import { NetherGenerator } from './nether.js';

export const SKY = 0;
export const BLOCKLIGHT = 1;

const DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class World {
  constructor({ seed, edits, blockEntities, dimension = 'overworld' } = {}) {
    this.seed = seed >>> 0;
    this.dimension = dimension;
    this.generator = dimension === 'nether' ? new NetherGenerator(this.seed) : new WorldGenerator(this.seed);
    this.chunks = new Map();
    // Player modifications: chunkKey -> Map(blockIndex -> blockId).
    this.edits = edits || new Map();
    // Block entities (chest / furnace contents): "x,y,z" -> data.
    this.blockEntities = blockEntities || new Map();
    // Growing crops: "x,y,z" -> [x, y, z].
    this.crops = new Map();
    // Monster spawners and nether portal blocks: "x,y,z" -> [x, y, z].
    this.spawners = new Map();
    this.portals = new Map();
    this.onChunkUnload = null;
    this._lastKey = -1;
    this._lastChunk = null;
    this._offsetsRadius = -1;
    this._offsets = [];
  }

  // --- Chunk access -----------------------------------------------------------

  getChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (key === this._lastKey) return this._lastChunk;
    const c = this.chunks.get(key) || null;
    if (c) {
      this._lastKey = key;
      this._lastChunk = c;
    }
    return c;
  }

  chunkAt(x, z) {
    return this.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  }

  // True when the block data around (x, z) exists (safe for physics).
  isReady(x, z) {
    const c = this.chunkAt(x, z);
    return !!c && c.state >= CHUNK_STATE.LIT;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CHUNK_HEIGHT) return B.AIR;
    const c = this.chunkAt(x, z);
    if (!c || c.state === CHUNK_STATE.EMPTY) return B.AIR;
    return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  getLight(x, y, z) {
    if (y >= CHUNK_HEIGHT) return MAX_LIGHT << 4;
    if (y < 0) return 0;
    const c = this.chunkAt(x, z);
    if (!c) return MAX_LIGHT << 4;
    return c.light[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  getSkyLight(x, y, z) {
    return this.getLight(x, y, z) >> 4;
  }

  getBlockLight(x, y, z) {
    return this.getLight(x, y, z) & 15;
  }

  heightAt(x, z) {
    const c = this.chunkAt(x, z);
    return c ? c.heightmap[((z & 15) << 4) | (x & 15)] : 0;
  }

  // Highest y whose block is solid for standing on, or -1.
  surfaceY(x, z, isSolid) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) if (isSolid(this.getBlock(x, y, z))) return y;
    return -1;
  }

  // Marks the chunk containing (x, z) dirty, plus the neighbours whose meshes
  // sample this cell (for face culling, AO and smooth lighting).
  markDirty(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const lx = x & 15, lz = z & 15;
    const dxs = lx === 0 ? [0, -1] : lx === 15 ? [0, 1] : [0];
    const dzs = lz === 0 ? [0, -1] : lz === 15 ? [0, 1] : [0];
    for (const dx of dxs) {
      for (const dz of dzs) {
        const c = this.getChunk(cx + dx, cz + dz);
        if (c) c.dirty = true;
      }
    }
  }

  // --- Block modification --------------------------------------------------------

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const c = this.chunkAt(x, z);
    if (!c || c.state < CHUNK_STATE.LIT) return false;
    const lx = x & 15, lz = z & 15;
    const idx = (y << 8) | (lz << 4) | lx;
    if (c.blocks[idx] === id) return false;
    c.blocks[idx] = id;
    c.updateHeight(lx, lz);

    let edits = this.edits.get(c.key);
    if (!edits) this.edits.set(c.key, (edits = new Map()));
    edits.set(idx, id);
    const key = `${x},${y},${z}`;
    if (BLOCKS[id].crop !== undefined || BLOCKS[id].sapling) this.crops.set(key, [x, y, z]);
    else this.crops.delete(key);
    if (id === B.SPAWNER) this.spawners.set(key, [x, y, z]);
    else this.spawners.delete(key);
    if (BLOCKS[id].portal) this.portals.set(key, [x, y, z]);
    else this.portals.delete(key);

    this.relight(x, y, z);
    this.markDirty(x, z);
    return true;
  }

  // A block changed by another player: applied now if its chunk is loaded,
  // otherwise when the chunk is generated.
  setBlockRemote(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    if (this.setBlock(x, y, z, id)) return;
    const lx = x & 15, lz = z & 15;
    const idx = (y << 8) | (lz << 4) | lx;
    const c = this.chunkAt(x, z);
    if (c && c.state < CHUNK_STATE.LIT) {
      c.blocks[idx] = id;
      c.updateHeight(lx, lz);
    }
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    let edits = this.edits.get(key);
    if (!edits) this.edits.set(key, (edits = new Map()));
    edits.set(idx, id);
  }

  getBlockEntity(x, y, z) {
    return this.blockEntities.get(`${x},${y},${z}`) || null;
  }

  setBlockEntity(x, y, z, data) {
    this.blockEntities.set(`${x},${y},${z}`, data);
  }

  removeBlockEntity(x, y, z) {
    const key = `${x},${y},${z}`;
    const data = this.blockEntities.get(key) || null;
    this.blockEntities.delete(key);
    return data;
  }

  // --- Lighting ----------------------------------------------------------------------

  _rawLight(x, y, z, ch) {
    const c = this.chunkAt(x, z);
    if (!c) return 0;
    const v = c.light[(y << 8) | ((z & 15) << 4) | (x & 15)];
    return ch === SKY ? v >> 4 : v & 15;
  }

  // Flags meshes affected by a light change at world column (x, z).
  _touch(c, x, z) {
    c.dirty = true;
    const lx = x & 15, lz = z & 15;
    if (lx === 0 || lx === 15 || lz === 0 || lz === 15) this.markDirty(x, z);
  }

  _setRawLight(c, idx, ch, level) {
    const v = c.light[idx];
    c.light[idx] = ch === SKY ? (v & 0x0f) | (level << 4) : (v & 0xf0) | level;
  }

  // Breadth-first light spreading from every position in `queue` (flat x,y,z).
  propagate(queue, ch) {
    for (let head = 0; head < queue.length; head += 3) {
      const x = queue[head], y = queue[head + 1], z = queue[head + 2];
      const level = this._rawLight(x, y, z, ch);
      if (level <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const ny = y + dir[1];
        if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
        const nx = x + dir[0], nz = z + dir[2];
        const c = this.chunkAt(nx, nz);
        if (!c || c.state === CHUNK_STATE.EMPTY) continue;
        const lx = nx & 15, lz = nz & 15;
        const idx = (ny << 8) | (lz << 4) | lx;
        const att = LIGHT_ATTEN[c.blocks[idx]];
        if (att >= MAX_LIGHT) continue;
        // Full sunlight travels straight down without dimming.
        const nl = ch === SKY && d === 3 && level === MAX_LIGHT && att === 1 ? MAX_LIGHT : level - att;
        if (nl <= 0) continue;
        const v = c.light[idx];
        const cur = ch === SKY ? v >> 4 : v & 15;
        if (cur < nl) {
          c.light[idx] = ch === SKY ? (v & 0x0f) | (nl << 4) : (v & 0xf0) | nl;
          this._touch(c, nx, nz);
          queue.push(nx, ny, nz);
        }
      }
    }
  }

  // Removes light that came from the positions in `queue` (flat x,y,z,level),
  // collecting still-valid neighbouring light into `refill`.
  unpropagate(queue, ch, refill) {
    for (let head = 0; head < queue.length; head += 4) {
      const x = queue[head], y = queue[head + 1], z = queue[head + 2], level = queue[head + 3];
      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const ny = y + dir[1];
        if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
        const nx = x + dir[0], nz = z + dir[2];
        const c = this.chunkAt(nx, nz);
        if (!c || c.state === CHUNK_STATE.EMPTY) continue;
        const idx = (ny << 8) | ((nz & 15) << 4) | (nx & 15);
        const v = c.light[idx];
        const nl = ch === SKY ? v >> 4 : v & 15;
        if (nl === 0) continue;
        if (nl < level || (ch === SKY && d === 3 && level === MAX_LIGHT && nl === MAX_LIGHT)) {
          this._setRawLight(c, idx, ch, 0);
          this._touch(c, nx, nz);
          queue.push(nx, ny, nz, nl);
          const emit = ch === BLOCKLIGHT ? LIGHT_EMIT[c.blocks[idx]] : 0;
          if (emit) {
            this._setRawLight(c, idx, ch, emit);
            refill.push(nx, ny, nz);
          }
        } else {
          refill.push(nx, ny, nz);
        }
      }
    }
  }

  // Recomputes light around a block that just changed.
  relight(x, y, z) {
    const c = this.chunkAt(x, z);
    const idx = (y << 8) | ((z & 15) << 4) | (x & 15);
    const id = c.blocks[idx];
    for (const ch of [SKY, BLOCKLIGHT]) {
      const refill = [];
      const old = this._rawLight(x, y, z, ch);
      if (old > 0) {
        this._setRawLight(c, idx, ch, 0);
        this.unpropagate([x, y, z, old], ch, refill);
      }
      if (ch === BLOCKLIGHT && LIGHT_EMIT[id]) {
        this._setRawLight(c, idx, ch, LIGHT_EMIT[id]);
        refill.push(x, y, z);
      }
      if (LIGHT_ATTEN[id] < MAX_LIGHT) {
        if (ch === SKY && y === CHUNK_HEIGHT - 1) {
          this._setRawLight(c, idx, ch, MAX_LIGHT);
          refill.push(x, y, z);
        }
        for (const [dx, dy, dz] of DIRS) {
          const ny = y + dy;
          if (ny >= 0 && ny < CHUNK_HEIGHT && this._rawLight(x + dx, ny, z + dz, ch) > 0) refill.push(x + dx, ny, z + dz);
        }
      }
      this.propagate(refill, ch);
    }
  }

  // Direct sunlight columns and light emitters, computed right after a chunk
  // is generated. Needs no neighbours.
  initChunkLight(c) {
    const { blocks, light } = c;
    light.fill(0);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let level = MAX_LIGHT;
        for (let y = CHUNK_HEIGHT - 1; y >= 0 && level > 0; y--) {
          const idx = (y << 8) | (z << 4) | x;
          const att = LIGHT_ATTEN[blocks[idx]];
          if (att >= MAX_LIGHT) break;
          if (!(level === MAX_LIGHT && att === 1)) level = Math.max(0, level - att);
          light[idx] = level << 4;
        }
      }
    }
    for (let i = 0; i < blocks.length; i++) {
      const e = LIGHT_EMIT[blocks[i]];
      if (e) light[i] = (light[i] & 0xf0) | e;
    }
  }

  // Flood-fills sky and block light for a chunk. All 8 neighbours must be
  // generated so light can flow across chunk borders.
  lightChunk(c) {
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    const skyQ = [], blkQ = [];
    const { blocks, light, heightmap } = c;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = ox + x, wz = oz + z;
        let top = heightmap[(z << 4) | x];
        top = Math.max(top, this.heightAt(wx + 1, wz), this.heightAt(wx - 1, wz), this.heightAt(wx, wz + 1), this.heightAt(wx, wz - 1));
        top = Math.min(top + 1, CHUNK_HEIGHT - 1);
        for (let y = 0; y <= top; y++) {
          const s = light[(y << 8) | (z << 4) | x] >> 4;
          if (s <= 1) continue;
          for (let d = 0; d < 6; d++) {
            if (d === 2 || d === 3) continue;
            const nx = wx + DIRS[d][0], nz = wz + DIRS[d][2];
            let nid, nsky;
            const lx = x + DIRS[d][0], lz = z + DIRS[d][2];
            if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
              const ni = (y << 8) | (lz << 4) | lx;
              nid = blocks[ni];
              nsky = light[ni] >> 4;
            } else {
              nid = this.getBlock(nx, y, nz);
              nsky = this._rawLight(nx, y, nz, SKY);
            }
            const att = LIGHT_ATTEN[nid];
            if (att < MAX_LIGHT && nsky < s - att) {
              skyQ.push(wx, y, wz);
              break;
            }
          }
        }
      }
    }
    for (let i = 0; i < blocks.length; i++) {
      if (LIGHT_EMIT[blocks[i]]) blkQ.push(ox + (i & 15), i >> 8, oz + ((i >> 4) & 15));
    }
    // Light that neighbouring chunks already spread towards this one (matters
    // when a chunk is re-generated next to chunks that were lit earlier).
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n || n.state < CHUNK_STATE.LIT) continue;
      for (let k = 0; k < CHUNK_SIZE; k++) {
        const lx = dx === 1 ? 0 : dx === -1 ? 15 : k;
        const lz = dz === 1 ? 0 : dz === -1 ? 15 : k;
        const wx = n.cx * CHUNK_SIZE + lx, wz = n.cz * CHUNK_SIZE + lz;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const v = n.light[(y << 8) | (lz << 4) | lx];
          if (v >> 4 > 1) skyQ.push(wx, y, wz);
          if ((v & 15) > 1) blkQ.push(wx, y, wz);
        }
      }
    }
    this.propagate(skyQ, SKY);
    this.propagate(blkQ, BLOCKLIGHT);
    c.state = CHUNK_STATE.LIT;
  }

  // --- Streaming ------------------------------------------------------------------------

  generateChunk(cx, cz) {
    const c = new Chunk(cx, cz);
    this.generator.generate(c, this.edits.get(c.key));
    for (let i = 0; i < c.blocks.length; i++) {
      const id = c.blocks[i];
      if (id && (BLOCKS[id].crop !== undefined || BLOCKS[id].sapling || id === B.SPAWNER || BLOCKS[id].portal)) {
        const x = cx * CHUNK_SIZE + (i & 15), y = i >> 8, z = cz * CHUNK_SIZE + ((i >> 4) & 15);
        (id === B.SPAWNER ? this.spawners : BLOCKS[id].portal ? this.portals : this.crops).set(`${x},${y},${z}`, [x, y, z]);
      }
    }
    this.initChunkLight(c);
    c.state = CHUNK_STATE.GENERATED;
    this.chunks.set(c.key, c);
    this._lastKey = -1;
    return c;
  }

  neighboursAtLeast(cx, cz, state) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const n = this.getChunk(cx + dx, cz + dz);
        if (!n || n.state < state) return false;
      }
    }
    return true;
  }

  canMesh(c) {
    return c.state >= CHUNK_STATE.LIT && this.neighboursAtLeast(c.cx, c.cz, CHUNK_STATE.LIT);
  }

  offsets(radius) {
    if (this._offsetsRadius !== radius) {
      const list = [];
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) list.push([dx, dz, dx * dx + dz * dz]);
      }
      list.sort((a, b) => a[2] - b[2]);
      this._offsets = list;
      this._offsetsRadius = radius;
    }
    return this._offsets;
  }

  // Does up to `budgetMs` of chunk work around chunk (pcx, pcz). Meshing is
  // delegated to `buildMesh(chunk)`. Returns the number of operations done.
  update(pcx, pcz, radius, budgetMs, buildMesh) {
    const start = now();
    const genR = radius + 2;
    const offsets = this.offsets(genR);
    let ops = 0;
    const out = () => now() - start > budgetMs;

    // 1) Mesh: nearest first; rebuilds dirty chunks after edits too.
    for (const [dx, dz, d2] of offsets) {
      if (d2 > radius * radius + 1) break;
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c || !(c.dirty || !c.mesh) || !this.canMesh(c)) continue;
      buildMesh(c);
      c.dirty = false;
      ops++;
      if (out()) return ops;
    }
    // 2) Light
    for (const [dx, dz] of offsets) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) > radius + 1) continue;
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c || c.state !== CHUNK_STATE.GENERATED) continue;
      if (!this.neighboursAtLeast(c.cx, c.cz, CHUNK_STATE.GENERATED)) continue;
      this.lightChunk(c);
      ops++;
      if (out()) return ops;
    }
    // 3) Generate
    for (const [dx, dz] of offsets) {
      if (this.getChunk(pcx + dx, pcz + dz)) continue;
      this.generateChunk(pcx + dx, pcz + dz);
      ops++;
      if (out()) return ops;
    }
    // 4) Unload far chunks
    const maxD = genR + 2;
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) > maxD || Math.abs(c.cz - pcz) > maxD) this.unloadChunk(c);
    }
    return ops;
  }

  unloadChunk(c) {
    if (this.onChunkUnload) this.onChunkUnload(c);
    this.chunks.delete(c.key);
    this._lastKey = -1;
  }

  // Synchronously loads everything needed to stand at (x, z).
  ensureArea(x, z, radius, buildMesh) {
    const pcx = Math.floor(x / CHUNK_SIZE), pcz = Math.floor(z / CHUNK_SIZE);
    for (let guard = 0; guard < 10000; guard++) {
      if (this.update(pcx, pcz, radius, Infinity, buildMesh) === 0) break;
    }
  }

  dispose() {
    for (const c of [...this.chunks.values()]) this.unloadChunk(c);
  }
}
