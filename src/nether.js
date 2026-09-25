// The Nether: netherrack caverns over a lava sea, under a bedrock roof, with
// soul sand valleys, gravel shores, glowstone hanging from the ceiling and
// quartz and magma in the walls. Reached through obsidian portals; one block
// here is eight in the Overworld.
import { CHUNK_SIZE, CHUNK_HEIGHT } from './constants.js';
import { B } from './blocks.js';
import { SimplexNoise, hashCoords, rngFor } from './noise.js';
import { WorldGenerator, BIOME } from './worldgen.js';

export const LAVA_SEA = 31;
const ROOF = CHUNK_HEIGHT - 1;

// The Nether has no villages or Overworld structures.
const NO_STRUCTURES = {
  place() {},
  lootAt: () => null,
  spawnerAt: () => 'zombified_piglin',
  near: () => [],
  nearest: () => null,
  dungeon: () => null,
};

export class NetherGenerator extends WorldGenerator {
  constructor(seed) {
    super(seed);
    const n = (salt) => new SimplexNoise(hashCoords(this.seed ^ 0x6e746872, salt, 666, salt * 13));
    this.caveNoise = n(1);
    this.detail = n(2);
    this.patchNoise = n(3);
    this.structures = NO_STRUCTURES;
    this.dimension = 'nether';
  }

  nearestVillage() {
    return null;
  }

  column() {
    return { height: 64, biome: BIOME.NETHER, temp: 1, humid: -1 };
  }

  findSpawn() {
    return { x: 0.5, y: 64, z: 0.5 };
  }

  // Positive where there is netherrack: open caverns in the middle, closing
  // up towards the floor and the roof.
  density(x, y, z) {
    let d = this.caveNoise.fbm3(x / 64, y / 38, z / 64, 3) + this.detail.noise3D(x / 20, y / 14, z / 20) * 0.22;
    if (y < 22) d += (22 - y) * 0.06;
    if (y > 100) d += (y - 100) * 0.045;
    return d - 0.12;
  }

  generate(chunk, edits) {
    const { cx, cz, blocks } = chunk;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    // Density on a coarse lattice (every 4 blocks across, 8 up), interpolated.
    const SX = 5, SY = CHUNK_HEIGHT / 8 + 1;
    const field = new Float32Array(SX * SY * SX);
    for (let iz = 0; iz < SX; iz++) {
      for (let iy = 0; iy < SY; iy++) {
        for (let ix = 0; ix < SX; ix++) field[(iz * SY + iy) * SX + ix] = this.density(ox + ix * 4, iy * 8, oz + iz * 4);
      }
    }
    const at = (ix, iy, iz) => field[(iz * SY + iy) * SX + ix];
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      chunk.climate[i * 2] = 255;
      chunk.climate[i * 2 + 1] = 0;
    }
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const iz = z >> 2, tz = (z & 3) / 4;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const ix = x >> 2, tx = (x & 3) / 4;
        const wx = ox + x, wz = oz + z;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id;
          if (y === 0 || y === ROOF) id = B.BEDROCK;
          else if (y < 5 && (hashCoords(this.seed, wx, y, wz) & 7) < 5 - y) id = B.BEDROCK;
          else if (y > ROOF - 5 && (hashCoords(this.seed, wx, y, wz) & 7) < y - (ROOF - 5)) id = B.BEDROCK;
          else {
            const iy = y >> 3, ty = (y & 7) / 8;
            const c00 = at(ix, iy, iz) + (at(ix + 1, iy, iz) - at(ix, iy, iz)) * tx;
            const c10 = at(ix, iy + 1, iz) + (at(ix + 1, iy + 1, iz) - at(ix, iy + 1, iz)) * tx;
            const c01 = at(ix, iy, iz + 1) + (at(ix + 1, iy, iz + 1) - at(ix, iy, iz + 1)) * tx;
            const c11 = at(ix, iy + 1, iz + 1) + (at(ix + 1, iy + 1, iz + 1) - at(ix, iy + 1, iz + 1)) * tx;
            const d0 = c00 + (c10 - c00) * ty, d1 = c01 + (c11 - c01) * ty;
            const d = d0 + (d1 - d0) * tz;
            id = d > 0 ? B.NETHERRACK : y <= LAVA_SEA ? B.LAVA : B.AIR;
          }
          blocks[(y << 8) | (z << 4) | x] = id;
        }
      }
    }
    this.decorateNether(chunk);
    if (edits) for (const [idx, id] of edits) blocks[idx] = id;
    chunk.computeHeightmap();
  }

  decorateNether(chunk) {
    const { cx, cz, blocks } = chunk;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const idx = (x, y, z) => (y << 8) | (z << 4) | x;
    const rng = rngFor(this.seed ^ 0x9e7e, cx, 3, cz);
    // Floors: soul sand valleys, gravel shores and the odd mushroom.
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = ox + x, wz = oz + z;
        const soul = this.patchNoise.noise2D(wx / 34, wz / 34) > 0.38;
        const gravel = this.patchNoise.noise2D(wz / 18 + 50, wx / 18) > 0.3;
        for (let y = 6; y < ROOF - 6; y++) {
          if (blocks[idx(x, y, z)] !== B.NETHERRACK || blocks[idx(x, y + 1, z)] !== B.AIR) continue;
          if (soul) {
            for (let k = 0; k < 3 && blocks[idx(x, y - k, z)] === B.NETHERRACK; k++) blocks[idx(x, y - k, z)] = B.SOUL_SAND;
          } else if (gravel && y >= LAVA_SEA - 1 && y <= LAVA_SEA + 4) {
            for (let k = 0; k < 2 && blocks[idx(x, y - k, z)] === B.NETHERRACK; k++) blocks[idx(x, y - k, z)] = B.GRAVEL;
          } else if ((hashCoords(this.seed ^ 0x3a5, wx, y, wz) & 255) < 2) {
            blocks[idx(x, y + 1, z)] = (wx + wz) & 1 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
          }
        }
      }
    }
    // Ores: quartz in the netherrack, magma near the lava sea.
    const vein = (id, count, size, minY, maxY) => {
      for (let v = 0; v < count; v++) {
        let x = Math.floor(rng() * 16), y = minY + Math.floor(rng() * (maxY - minY)), z = Math.floor(rng() * 16);
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < ROOF && blocks[idx(x, y, z)] === B.NETHERRACK) blocks[idx(x, y, z)] = id;
          const r = rng();
          if (r < 0.34) x += rng() < 0.5 ? 1 : -1;
          else if (r < 0.67) z += rng() < 0.5 ? 1 : -1;
          else y += rng() < 0.5 ? 1 : -1;
        }
      }
    };
    vein(B.NETHER_QUARTZ_ORE, 14, 10, 10, 118);
    vein(B.MAGMA_BLOCK, 4, 12, LAVA_SEA - 4, LAVA_SEA + 6);
    // Glowstone clusters hanging from ceilings.
    for (let n = 0; n < 4; n++) {
      const sx = 2 + Math.floor(rng() * 12), sz = 2 + Math.floor(rng() * 12);
      let top = -1;
      for (let y = ROOF - 6; y > LAVA_SEA + 8; y--) {
        if (blocks[idx(sx, y, sz)] === B.AIR && blocks[idx(sx, y + 1, sz)] === B.NETHERRACK) { top = y; break; }
      }
      if (top < 0) continue;
      blocks[idx(sx, top, sz)] = B.GLOWSTONE;
      for (let k = 0; k < 90; k++) {
        const x = sx + Math.floor((rng() - rng()) * 4), y = top - Math.floor(rng() * 7), z = sz + Math.floor((rng() - rng()) * 4);
        if (x < 0 || x > 15 || z < 0 || z > 15 || blocks[idx(x, y, z)] !== B.AIR) continue;
        let touching = 0;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && blocks[idx(nx, y + dy, nz)] === B.GLOWSTONE) touching++;
        }
        if (touching === 1) blocks[idx(x, y, z)] = B.GLOWSTONE;
      }
    }
  }
}
