// Deterministic procedural terrain: continents, mountains, biomes, caves,
// ore veins, lava lakes, trees and plants. The same seed always produces the
// same world, chunk by chunk, in any order.
import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import { SimplexNoise, hashCoords, rngFor, mulberry32 } from './noise.js';
import { smoothstep } from './math.js';
import { Villages } from './villages.js';

export const BIOME = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  DESERT: 4,
  SNOWY: 5,
  MOUNTAINS: 6,
};
export const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Tundra', 'Mountains'];

const MAX_TERRAIN = CHUNK_HEIGHT - 14;
const LAVA_LEVEL = 10;

const ORES = [
  { id: B.GRANITE, veins: 7, minY: 5, maxY: 100, size: 34 },
  { id: B.DIORITE, veins: 7, minY: 5, maxY: 100, size: 34 },
  { id: B.ANDESITE, veins: 7, minY: 5, maxY: 100, size: 34 },
  { id: B.DIRT, veins: 5, minY: 20, maxY: 100, size: 24 },
  { id: B.GRAVEL, veins: 4, minY: 5, maxY: 100, size: 20 },
  { id: B.COAL_ORE, veins: 18, minY: 5, maxY: 110, size: 10 },
  { id: B.COPPER_ORE, veins: 8, minY: 20, maxY: 90, size: 8 },
  { id: B.IRON_ORE, veins: 11, minY: 3, maxY: 64, size: 7, deep: B.DEEPSLATE_IRON_ORE },
  { id: B.GOLD_ORE, veins: 3, minY: 3, maxY: 32, size: 6, deep: B.DEEPSLATE_GOLD_ORE },
  { id: B.LAPIS_ORE, veins: 2, minY: 5, maxY: 32, size: 6 },
  { id: B.REDSTONE_ORE, veins: 6, minY: 3, maxY: 16, size: 7, deep: B.DEEPSLATE_REDSTONE_ORE },
  { id: B.DIAMOND_ORE, veins: 2, minY: 3, maxY: 16, size: 5, deep: B.DEEPSLATE_DIAMOND_ORE },
];
const FLOWERS = {
  plains: [B.DANDELION, B.POPPY, B.AZURE_BLUET, B.OXEYE_DAISY, B.CORNFLOWER, B.RED_TULIP, B.ORANGE_TULIP],
  forest: [B.DANDELION, B.POPPY, B.LILY_OF_THE_VALLEY, B.ALLIUM, B.CORNFLOWER],
};

export class WorldGenerator {
  constructor(seed) {
    this.seed = seed >>> 0;
    const n = (salt) => new SimplexNoise(hashCoords(this.seed, salt, 911, salt * 7));
    this.continentNoise = n(1);
    this.mountainNoise = n(2);
    this.ridgeNoise = n(3);
    this.detailNoise = n(4);
    this.tempNoise = n(5);
    this.humidNoise = n(6);
    this.caveA = n(7);
    this.caveB = n(8);
    this.cheeseNoise = n(9);
    this.surfaceNoise = n(10);
    this.villages = new Villages(this);
  }

  // Centre of the closest village within ~200 blocks, or null.
  nearestVillage(x, z) {
    const v = this.villages.nearest(x, z);
    return v ? { x: v.x, z: v.z, y: v.y } : null;
  }

  // Terrain height (y of the top solid block) and biome of a world column.
  column(wx, wz) {
    const cont = this.continentNoise.fbm2(wx / 720, wz / 720, 5);
    let h = SEA_LEVEL + 5 + cont * 50;
    if (h > SEA_LEVEL) h = SEA_LEVEL + (h - SEA_LEVEL) * 0.55;
    const land = smoothstep(SEA_LEVEL - 2, SEA_LEVEL + 6, h);
    const m = this.mountainNoise.fbm2(wx / 320, wz / 320, 4);
    const mountain = smoothstep(0.08, 0.42, m) * land;
    const ridge = 1 - Math.abs(this.ridgeNoise.noise2D(wx / 90, wz / 90));
    h += mountain * 50 * (0.55 + 0.45 * ridge);
    h += this.detailNoise.fbm2(wx / 42, wz / 42, 3) * (2.5 + mountain * 7);
    const height = Math.max(4, Math.min(MAX_TERRAIN, Math.round(h)));

    const temp = this.tempNoise.fbm2(wx / 900 + 1000, wz / 900, 3) - Math.max(0, height - 80) * 0.01;
    const humid = this.humidNoise.fbm2(wx / 800, wz / 800 - 1000, 3);
    let biome;
    if (height < SEA_LEVEL - 1) biome = BIOME.OCEAN;
    else if (height <= SEA_LEVEL + 1 && temp > -0.25) biome = BIOME.BEACH;
    else if (mountain > 0.45 && height > 86) biome = BIOME.MOUNTAINS;
    else if (temp < -0.25) biome = BIOME.SNOWY;
    else if (temp > 0.18 && humid < 0.05) biome = BIOME.DESERT;
    else if (humid > 0.08) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;
    return { height, biome, temp, humid };
  }

  // Surface block, filler block and filler depth for a column.
  surface(col, wx, wz) {
    const { height, biome } = col;
    const s = this.surfaceNoise.noise2D(wx / 24, wz / 24);
    let top = B.GRASS, filler = B.DIRT, depth = 3 + (s > 0.3 ? 1 : 0), deep = B.STONE;
    switch (biome) {
      case BIOME.OCEAN:
        top = filler = height >= SEA_LEVEL - 5 || s > 0.1 ? B.SAND : B.GRAVEL;
        if (s < -0.45) top = filler = B.DIRT;
        break;
      case BIOME.BEACH:
        top = filler = B.SAND;
        deep = B.SANDSTONE;
        break;
      case BIOME.DESERT:
        top = filler = B.SAND;
        deep = B.SANDSTONE;
        depth = 4;
        break;
      case BIOME.SNOWY:
        top = B.SNOWY_GRASS;
        break;
      case BIOME.MOUNTAINS:
        if (height > 100 + s * 4) { top = B.SNOW; filler = B.STONE; }
        else if (height > 84 + s * 5) { top = filler = B.STONE; }
        break;
    }
    if (height < SEA_LEVEL && (top === B.GRASS || top === B.SNOWY_GRASS)) top = B.DIRT;
    return { top, filler, depth, deep };
  }

  // Fills a chunk's blocks. `edits` (optional Map idx->id) are player changes
  // that are re-applied on top of the generated terrain.
  generate(chunk, edits) {
    const { cx, cz, blocks } = chunk;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const cols = new Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) cols[z * CHUNK_SIZE + x] = this.column(ox + x, oz + z);
    }

    const cave = this.caveField(ox, oz);
    for (let i = 0; i < cols.length; i++) {
      chunk.climate[i * 2] = Math.max(0, Math.min(255, Math.round((cols[i].temp + 1) * 127.5)));
      chunk.climate[i * 2 + 1] = Math.max(0, Math.min(255, Math.round((cols[i].humid + 1) * 127.5)));
    }

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const col = cols[z * CHUNK_SIZE + x];
        const wx = ox + x, wz = oz + z;
        const { top, filler, depth, deep } = this.surface(col, wx, wz);
        const h = col.height;
        const safeSurface = h > SEA_LEVEL + 3;
        const deepLevel = 12 + ((hashCoords(this.seed ^ 0xdee9, wx, 0, wz) & 3) >> 1);
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id;
          if (y === 0) id = B.BEDROCK;
          else if (y < 4 && (hashCoords(this.seed, wx, y, wz) & 3) < 4 - y) id = B.BEDROCK;
          else if (y < h - depth - (deep === B.SANDSTONE ? 3 : 0)) id = B.STONE;
          else if (y < h - depth) id = deep;
          else if (y < h) id = filler;
          else if (y === h) id = top;
          else if (y <= SEA_LEVEL) id = B.WATER;
          else id = B.AIR;

          if (id === B.STONE && y < deepLevel) id = B.DEEPSLATE;
          if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK && y <= h && (safeSurface || y < h - 4)) {
            if (this.isCave(cave, x, y, z)) id = y <= LAVA_LEVEL ? B.LAVA : B.AIR;
          }
          blocks[(y << 8) | (z << 4) | x] = id;
        }
      }
    }

    this.placeOres(chunk);
    this.decorate(chunk, cols);
    this.placeTrees(chunk);
    this.villages.place(chunk);

    if (edits) for (const [idx, id] of edits) blocks[idx] = id;
    chunk.computeHeightmap();
  }

  // Cave noise is sampled on a coarse 4-block lattice and trilinearly
  // interpolated, which is much cheaper than sampling every block.
  caveField(ox, oz) {
    const SX = 5, SY = CHUNK_HEIGHT / 4 + 1, SZ = 5;
    const a = new Float32Array(SX * SY * SZ);
    const b = new Float32Array(SX * SY * SZ);
    const c = new Float32Array(SX * SY * SZ);
    for (let iz = 0; iz < SZ; iz++) {
      for (let iy = 0; iy < SY; iy++) {
        for (let ix = 0; ix < SX; ix++) {
          const wx = ox + ix * 4, wy = iy * 4, wz = oz + iz * 4;
          const i = (iz * SY + iy) * SX + ix;
          a[i] = this.caveA.noise3D(wx * 0.021, wy * 0.034, wz * 0.021);
          b[i] = this.caveB.noise3D(wx * 0.021, wy * 0.034, wz * 0.021);
          c[i] = this.cheeseNoise.noise3D(wx * 0.014, wy * 0.028, wz * 0.014);
        }
      }
    }
    return { a, b, c, SX, SY };
  }

  isCave(field, x, y, z) {
    const { SX, SY } = field;
    const fx = x / 4, fy = y / 4, fz = z / 4;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    const x1 = Math.min(x0 + 1, SX - 1), y1 = Math.min(y0 + 1, SY - 1), z1 = Math.min(z0 + 1, 4);
    const sample = (arr) => {
      const i000 = (z0 * SY + y0) * SX + x0, i100 = (z0 * SY + y0) * SX + x1;
      const i010 = (z0 * SY + y1) * SX + x0, i110 = (z0 * SY + y1) * SX + x1;
      const i001 = (z1 * SY + y0) * SX + x0, i101 = (z1 * SY + y0) * SX + x1;
      const i011 = (z1 * SY + y1) * SX + x0, i111 = (z1 * SY + y1) * SX + x1;
      const c00 = arr[i000] + (arr[i100] - arr[i000]) * tx;
      const c10 = arr[i010] + (arr[i110] - arr[i010]) * tx;
      const c01 = arr[i001] + (arr[i101] - arr[i001]) * tx;
      const c11 = arr[i011] + (arr[i111] - arr[i011]) * tx;
      const c0 = c00 + (c10 - c00) * ty;
      const c1 = c01 + (c11 - c01) * ty;
      return c0 + (c1 - c0) * tz;
    };
    const a = sample(field.a);
    const b = sample(field.b);
    // Spaghetti tunnels: where two noise fields are both near zero.
    const worm = a * a + b * b;
    if (worm < 0.011 + (y < 30 ? 0.004 : 0)) return true;
    // Large "cheese" caverns deep underground.
    if (y < 50 && sample(field.c) > 0.6 - (50 - y) * 0.002) return true;
    return false;
  }

  placeOres(chunk) {
    const rng = rngFor(this.seed ^ 0x0e5, chunk.cx, 1, chunk.cz);
    for (const ore of ORES) {
      for (let v = 0; v < ore.veins; v++) {
        let x = Math.floor(rng() * 16);
        let y = ore.minY + Math.floor(rng() * (ore.maxY - ore.minY));
        let z = Math.floor(rng() * 16);
        for (let k = 0; k < ore.size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CHUNK_HEIGHT) {
            const i = (y << 8) | (z << 4) | x;
            const cur = chunk.blocks[i];
            if (cur === B.STONE) chunk.blocks[i] = ore.id;
            else if (cur === B.DEEPSLATE && ore.deep) chunk.blocks[i] = ore.deep;
          }
          const r = rng();
          if (r < 0.34) x += rng() < 0.5 ? 1 : -1;
          else if (r < 0.67) z += rng() < 0.5 ? 1 : -1;
          else y += rng() < 0.5 ? 1 : -1;
        }
      }
    }
  }

  decorate(chunk, cols) {
    const { blocks } = chunk;
    const at = (x, y, z) => (y << 8) | (z << 4) | x;
    // Emeralds are found only in mountains, as single blocks.
    const erng = rngFor(this.seed ^ 0xe3e, chunk.cx, 5, chunk.cz);
    if (cols[136].biome === BIOME.MOUNTAINS) {
      for (let k = 0; k < 4; k++) {
        const x = Math.floor(erng() * 16), z = Math.floor(erng() * 16), y = 20 + Math.floor(erng() * 60);
        if (blocks[at(x, y, z)] === B.STONE) blocks[at(x, y, z)] = B.EMERALD_ORE;
      }
    }
    // Mushrooms on dark cave floors.
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(erng() * 16), z = Math.floor(erng() * 16);
      const top = cols[z * 16 + x].height - 6;
      for (let y = 8; y < top; y++) {
        if (blocks[at(x, y, z)] === B.AIR && (blocks[at(x, y - 1, z)] === B.STONE || blocks[at(x, y - 1, z)] === B.DEEPSLATE)) {
          if (erng() < 0.4) blocks[at(x, y, z)] = erng() < 0.5 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
          break;
        }
      }
    }
    const waterNear = (wx, wz) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.column(wx + dx, wz + dz).height < SEA_LEVEL) return true;
      return false;
    };
    // Patches: one value per 4x4 area, stable across chunks.
    const patch = (wx, wz, salt) => hashCoords(this.seed ^ salt, wx >> 2, 7, wz >> 2) / 4294967296;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const col = cols[z * CHUNK_SIZE + x];
        const y = col.height;
        if (y + 3 >= CHUNK_HEIGHT) continue;
        const wx = chunk.cx * 16 + x, wz = chunk.cz * 16 + z;
        const top = blocks[(y << 8) | (z << 4) | x];
        const above = (y + 1 << 8) | (z << 4) | x;
        const r = hashCoords(this.seed ^ 0xdec0, wx, 0, wz) / 4294967296;
        const r2 = hashCoords(this.seed ^ 0xf10, wx, 1, wz) / 4294967296;
        if (y < SEA_LEVEL && blocks[above] === B.WATER) {
          // Under water: clay patches; frozen or lily-padded surfaces.
          if ((top === B.SAND || top === B.GRAVEL || top === B.DIRT) && patch(wx, wz, 0xc1a) < 0.12) {
            blocks[at(x, y, z)] = B.CLAY;
            if (blocks[at(x, y - 1, z)] !== B.AIR) blocks[at(x, y - 1, z)] = B.CLAY;
          }
          if (col.biome === BIOME.SNOWY) blocks[at(x, SEA_LEVEL, z)] = B.ICE;
          else if (y >= SEA_LEVEL - 3 && r2 < 0.02 && col.biome !== BIOME.OCEAN) blocks[at(x, SEA_LEVEL + 1, z)] = B.LILY_PAD;
          continue;
        }
        if (blocks[above] !== B.AIR) continue;
        // Sugar cane beside water.
        if ((top === B.GRASS || top === B.SAND || top === B.DIRT) && y === SEA_LEVEL && r2 < 0.18 && waterNear(wx, wz)) {
          const hgt = 1 + Math.floor(r2 * 16) % 3;
          for (let k = 1; k <= hgt; k++) blocks[at(x, y + k, z)] = B.SUGAR_CANE;
          continue;
        }
        if (top === B.GRASS) {
          const grassChance = col.biome === BIOME.PLAINS ? 0.2 : col.biome === BIOME.FOREST ? 0.12 : 0.05;
          const flowerChance = col.biome === BIOME.PLAINS ? 0.022 : 0.012;
          const flowers = col.biome === BIOME.FOREST ? FLOWERS.forest : FLOWERS.plains;
          if (r < flowerChance) {
            // Flowers grow in patches of one kind.
            const kind = Math.floor(patch(wx, wz, 0xf1f) * 97) % flowers.length;
            blocks[above] = flowers[kind];
          } else if (r < flowerChance + grassChance) {
            blocks[above] = col.biome === BIOME.FOREST && r2 < 0.25 ? B.FERN : B.TALL_GRASS;
          } else if (r2 > 0.9993) blocks[above] = B.PUMPKIN;
          else if (r2 > 0.9988 && r2 <= 0.99885) blocks[above] = B.MELON;
          else if (col.biome === BIOME.FOREST && r2 < 0.004) blocks[above] = r2 < 0.002 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
        } else if (top === B.SNOWY_GRASS) {
          blocks[above] = r < 0.06 ? B.FERN : B.SNOW_LAYER;
        } else if (top === B.SAND && col.biome === BIOME.DESERT) {
          if (r < 0.005) {
            const hgt = 1 + Math.floor((r / 0.005) * 3);
            for (let k = 1; k <= hgt; k++) blocks[(y + k << 8) | (z << 4) | x] = B.CACTUS;
          } else if (r < 0.013) {
            blocks[above] = B.DEAD_BUSH;
          }
        }
      }
    }
  }

  // Trees whose trunk is inside chunk (cx, cz). Deterministic per chunk.
  treesFor(cx, cz) {
    const rng = rngFor(this.seed ^ 0x7ee5, cx, 2, cz);
    const center = this.column(cx * 16 + 8, cz * 16 + 8);
    let attempts;
    switch (center.biome) {
      case BIOME.FOREST: attempts = 9; break;
      case BIOME.SNOWY: attempts = 3; break;
      case BIOME.MOUNTAINS: attempts = 2; break;
      case BIOME.PLAINS: attempts = rng() < 0.3 ? 1 : 0; break;
      default: attempts = 0;
    }
    const trees = [];
    for (let i = 0; i < attempts; i++) {
      const lx = Math.floor(rng() * 16), lz = Math.floor(rng() * 16), roll = rng();
      const wx = cx * 16 + lx, wz = cz * 16 + lz;
      const col = this.column(wx, wz);
      if (col.height <= SEA_LEVEL || col.height > 104) continue;
      if (this.villages.blocksTree(wx, wz)) continue;
      let type = null;
      if (col.biome === BIOME.FOREST) type = roll < 0.3 ? 'birch' : 'oak';
      else if (col.biome === BIOME.PLAINS) type = 'oak';
      else if (col.biome === BIOME.SNOWY) type = 'spruce';
      else if (col.biome === BIOME.MOUNTAINS && col.height < 84) type = 'spruce';
      if (!type) continue;
      trees.push({ x: wx, y: col.height + 1, z: wz, type });
    }
    return trees;
  }

  placeTrees(chunk) {
    const ox = chunk.cx * 16, oz = chunk.cz * 16;
    const blocks = chunk.blocks;
    const setLeaf = (wx, y, wz, id) => {
      const x = wx - ox, z = wz - oz;
      if (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= CHUNK_HEIGHT) return;
      const i = (y << 8) | (z << 4) | x;
      const cur = blocks[i];
      if (cur === B.AIR || cur === B.TALL_GRASS || cur === B.DANDELION || cur === B.POPPY) blocks[i] = id;
    };
    const setLog = (wx, y, wz, id) => {
      const x = wx - ox, z = wz - oz;
      if (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= CHUNK_HEIGHT) return;
      const i = (y << 8) | (z << 4) | x;
      const cur = blocks[i];
      if (cur === B.AIR || cur === B.TALL_GRASS || cur === B.DANDELION || cur === B.POPPY ||
          cur === B.LEAVES || cur === B.BIRCH_LEAVES || cur === B.SPRUCE_LEAVES) blocks[i] = id;
    };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const tree of this.treesFor(chunk.cx + dx, chunk.cz + dz)) {
          // Tree placement only depends on column data, never on generated
          // blocks, so every chunk agrees on where trees are.
          if (dx === 0 && dz === 0) {
            const gi = (tree.y - 1 << 8) | (tree.z - oz << 4) | (tree.x - ox);
            if (blocks[gi] === B.GRASS) blocks[gi] = B.DIRT;
          }
          this.growTree(tree, setLog, setLeaf);
        }
      }
    }
  }

  growTree(tree, setLog, setLeaf) {
    const rng = mulberry32(hashCoords(this.seed ^ 0x7ee, tree.x, tree.y, tree.z));
    const { x, y, z, type } = tree;
    if (type === 'spruce') {
      const h = 6 + Math.floor(rng() * 4);
      for (let k = 0; k < h; k++) setLog(x, y + k, z, B.SPRUCE_LOG);
      setLeaf(x, y + h, z, B.SPRUCE_LEAVES);
      setLeaf(x, y + h + 1, z, B.SPRUCE_LEAVES);
      for (let k = h - 1; k >= 2; k--) {
        const i = h - 1 - k;
        // Conical profile from the top: 1, 1, 2, 1, 2, 1, 3, 1, 3...
        const r = i < 2 ? 1 : i % 2 === 1 ? 1 : i >= 6 ? 3 : 2;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if ((dx || dz) && dx * dx + dz * dz <= r * r + 0.5) setLeaf(x + dx, y + k, z + dz, B.SPRUCE_LEAVES);
          }
        }
      }
      return;
    }
    const log = type === 'birch' ? B.BIRCH_LOG : B.LOG;
    const leaf = type === 'birch' ? B.BIRCH_LEAVES : B.LEAVES;
    const h = (type === 'birch' ? 5 : 4) + Math.floor(rng() * 3);
    for (let k = 0; k < h; k++) setLog(x, y + k, z, log);
    for (let ly = y + h - 3; ly <= y + h; ly++) {
      const layer = ly - (y + h);
      const r = layer >= -1 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r;
          if (corner && (layer === 0 || rng() < 0.5)) continue;
          if (dx === 0 && dz === 0 && ly < y + h) continue; // trunk
          setLeaf(x + dx, ly, z + dz, leaf);
        }
      }
    }
  }

  // Finds a dry spawn column near the origin.
  findSpawn() {
    for (let r = 0; r < 2048; r += 8) {
      const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 8));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const col = this.column(x, z);
        if (col.height > SEA_LEVEL + 1 && col.biome !== BIOME.MOUNTAINS && col.biome !== BIOME.BEACH) {
          return { x: x + 0.5, y: col.height + 1, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: CHUNK_HEIGHT - 20, z: 0.5 };
  }
}
