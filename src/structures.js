// Generated structures besides villages: desert pyramids, desert wells,
// igloos, ruined portals, shipwrecks, ocean monuments, mineshafts and
// dungeons. As with villages, a structure's layout depends only on the seed
// and on column data (height/biome), so every chunk places its own slice of a
// structure without its neighbours existing.
import { SEA_LEVEL, CHUNK_HEIGHT, CHUNK_SIZE } from './constants.js';
import { B, I, BLOCKS, orientedBlock } from './blocks.js';
import { hashCoords, mulberry32 } from './noise.js';

// Mirrors BIOME in worldgen.js (which imports this module).
const OCEAN = 0, BEACH = 1, DESERT = 4, SNOWY = 5;

// One attempt per region; `reach` is how far a structure can extend from
// its centre (used to find the structures touching a chunk).
const TYPES = {
  desert_pyramid: { region: 320, chance: 0.75, salt: 11, reach: 12 },
  desert_well: { region: 160, chance: 0.35, salt: 13, reach: 3 },
  igloo: { region: 240, chance: 0.6, salt: 12, reach: 6 },
  ruined_portal: { region: 272, chance: 0.6, salt: 14, reach: 7 },
  shipwreck: { region: 208, chance: 0.65, salt: 15, reach: 9 },
  ocean_monument: { region: 448, chance: 0.7, salt: 16, reach: 15 },
  mineshaft: { region: 224, chance: 0.6, salt: 17, reach: 76 },
};
export const STRUCTURE_TYPES = Object.keys(TYPES);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // facing index: +X, -X, +Z, -Z
const facingOf = (dx, dz) => (dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 2 : 3);
const WALL_TORCH = [B.WALL_TORCH_PX, B.WALL_TORCH_NX, B.WALL_TORCH_PZ, B.WALL_TORCH_NZ];
const LADDER = [B.LADDER_PX, B.LADDER_NX, B.LADDER_PZ, B.LADDER_NZ];

const ORIENTED = new Map();
function oriented(baseId, f) {
  const key = baseId * 4 + f;
  if (!ORIENTED.has(key)) ORIENTED.set(key, orientedBlock(baseId, f));
  return ORIENTED.get(key);
}
const chest = (f) => oriented(B.CHEST, f);

// Blocks a structure's foundation may fill down through.
const LOOSE = new Set([B.AIR, B.WATER, B.LAVA, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.SNOW_LAYER, B.SUGAR_CANE, B.LILY_PAD]);
for (let id = 0; id < 256; id++) if (BLOCKS[id].shape === 'cross') LOOSE.add(id);

const overlaps = (a, b) => a[0] <= b[3] && a[3] >= b[0] && a[1] <= b[4] && a[4] >= b[1] && a[2] <= b[5] && a[5] >= b[2];
const inside = (b, x, y, z) => x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5];

export class Structures {
  constructor(gen) {
    this.gen = gen;
    this.cache = new Map();
    this.dungeons = new Map();
  }

  // --- Planning -------------------------------------------------------------------

  region(type, rx, rz) {
    const key = `${type}:${rx},${rz}`;
    if (!this.cache.has(key)) this.cache.set(key, this.plan(type, rx, rz));
    return this.cache.get(key);
  }

  plan(type, rx, rz) {
    const t = TYPES[type];
    const rng = mulberry32(hashCoords(this.gen.seed ^ Math.imul(t.salt, 0x9e3779b1), rx, t.salt, rz));
    if (rng() > t.chance) return null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const x = rx * t.region + 32 + Math.floor(rng() * (t.region - 64));
      const z = rz * t.region + 32 + Math.floor(rng() * (t.region - 64));
      const s = PLANNERS[type].call(this, x, z, rng);
      if (!s) continue;
      if (type !== 'mineshaft' && type !== 'shipwreck' && type !== 'ocean_monument' && this.gen.villages.near(s.bbox[0], s.bbox[2], s.bbox[3], s.bbox[5], 6).length) continue;
      s.type = type;
      s.x = x;
      s.z = z;
      s.seed = hashCoords(this.gen.seed, x, t.salt, z);
      return s;
    }
    return null;
  }

  // Structures of `type` whose bounding box touches the rectangle.
  near(type, x0, z0, x1, z1, pad = 0) {
    const t = TYPES[type];
    const out = [];
    const r = t.reach + pad + 32;
    for (let rz = Math.floor((z0 - r) / t.region); rz <= Math.floor((z1 + r) / t.region); rz++) {
      for (let rx = Math.floor((x0 - r) / t.region); rx <= Math.floor((x1 + r) / t.region); rx++) {
        const s = this.region(type, rx, rz);
        if (s && s.bbox[0] - pad <= x1 && s.bbox[3] + pad >= x0 && s.bbox[2] - pad <= z1 && s.bbox[5] + pad >= z0) out.push(s);
      }
    }
    return out;
  }

  // Closest structure of a type (for /locate), searching a few regions out.
  nearest(type, x, z) {
    const t = TYPES[type];
    if (!t) return null;
    let best = null, bd = Infinity;
    const R = 4;
    const rx0 = Math.floor(x / t.region), rz0 = Math.floor(z / t.region);
    for (let rz = rz0 - R; rz <= rz0 + R; rz++) {
      for (let rx = rx0 - R; rx <= rx0 + R; rx++) {
        const s = this.region(type, rx, rz);
        if (!s) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }

  // A dungeon lies entirely inside its chunk, so it is planned per chunk.
  dungeon(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.dungeons.has(key)) return this.dungeons.get(key);
    let d = null;
    const rng = mulberry32(hashCoords(this.gen.seed ^ 0xd06e0, cx, 5, cz));
    if (rng() < 0.16) {
      const w = rng() < 0.5 ? 7 : 9, dd = rng() < 0.5 ? 7 : 9;
      const ox = cx * CHUNK_SIZE + Math.floor(rng() * (CHUNK_SIZE - w)), oz = cz * CHUNK_SIZE + Math.floor(rng() * (CHUNK_SIZE - dd));
      let minH = Infinity;
      for (const [a, b] of [[0, 0], [w - 1, 0], [0, dd - 1], [w - 1, dd - 1]]) minH = Math.min(minH, this.gen.column(ox + a, oz + b).height);
      const y = 10 + Math.floor(rng() * 36);
      if (y + 12 < minH) {
        d = { type: 'dungeon', ox, oz, y, w, d: dd, bbox: [ox, y, oz, ox + w - 1, y + 4, oz + dd - 1], seed: hashCoords(this.gen.seed, ox, y, oz) };
      }
    }
    this.dungeons.set(key, d);
    return d;
  }

  // What a generated chest at (x, y, z) holds, by the structure it is in.
  lootAt(x, y, z) {
    const d = this.dungeon(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    if (d && inside(d.bbox, x, y, z)) return 'dungeon';
    for (const type of STRUCTURE_TYPES) {
      for (const s of this.near(type, x, z, x, z)) if (inside(s.bbox, x, y, z)) return type;
    }
    return null;
  }

  // The mob a generated spawner produces.
  spawnerAt(x, y, z) {
    for (const s of this.near('mineshaft', x, z, x, z)) if (inside(s.bbox, x, y, z)) return 'spider';
    const r = hashCoords(this.gen.seed ^ 0x5ba, x, y, z) % 4;
    return r < 2 ? 'zombie' : r === 2 ? 'skeleton' : 'spider';
  }

  // --- Placement -----------------------------------------------------------------

  place(chunk) {
    const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
    const blocks = chunk.blocks;
    const inChunk = (x, y, z) => x >= ox && x < ox + CHUNK_SIZE && z >= oz && z < oz + CHUNK_SIZE && y >= 1 && y < CHUNK_HEIGHT;
    const ctx = {
      ox, oz,
      set: (x, y, z, id) => {
        if (inChunk(x, y, z)) blocks[(y << 8) | ((z - oz) << 4) | (x - ox)] = id;
      },
      get: (x, y, z) => (inChunk(x, y, z) ? blocks[(y << 8) | ((z - oz) << 4) | (x - ox)] : B.AIR),
      // Fills `id` below a floor block down to solid ground.
      foundation: (x, y, z, id, max = 12) => {
        for (let k = y; k > Math.max(1, y - max); k--) {
          if (!LOOSE.has(ctx.get(x, k, z))) break;
          ctx.set(x, k, z, id);
        }
      },
      // Empty space: water below sea level for sunken structures.
      empty: (y, wet) => (wet && y <= SEA_LEVEL ? B.WATER : B.AIR),
      height: (x, z) => this.gen.column(x, z).height,
    };
    const box = [ox, 0, oz, ox + CHUNK_SIZE - 1, CHUNK_HEIGHT, oz + CHUNK_SIZE - 1];
    const d = this.dungeon(chunk.cx, chunk.cz);
    if (d) buildDungeon(ctx, d);
    for (const type of STRUCTURE_TYPES) {
      for (const s of this.near(type, box[0], box[2], box[3], box[5])) {
        if (overlaps(s.bbox, box)) BUILDERS[type](ctx, s, box);
      }
    }
  }
}

// A deterministic random number in [0, 1) for a position in a structure.
const rand = (seed, a, b, c) => hashCoords(seed, a, b, c) / 4294967296;

// --- Planners (x, z, rng) -> structure or null --------------------------------------

const PLANNERS = {
  desert_pyramid(x, z) {
    const g = this.gen;
    let min = Infinity, max = -Infinity;
    for (const [dx, dz] of [[0, 0], [-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      const c = g.column(x + dx, z + dz);
      if (c.biome !== DESERT) return null;
      min = Math.min(min, c.height);
      max = Math.max(max, c.height);
    }
    if (max - min > 5) return null;
    const y = g.column(x, z).height;
    const ox = x - 10, oz = z - 10;
    return { ox, oz, y, bbox: [ox, y - 16, oz, ox + 20, y + 15, oz + 20] };
  },

  desert_well(x, z) {
    const c = this.gen.column(x, z);
    if (c.biome !== DESERT) return null;
    for (const [dx, dz] of [[-2, -2], [2, 2], [-2, 2], [2, -2]]) if (Math.abs(this.gen.column(x + dx, z + dz).height - c.height) > 1) return null;
    return { y: c.height, bbox: [x - 2, c.height - 4, z - 2, x + 2, c.height + 4, z + 2] };
  },

  igloo(x, z, rng) {
    const g = this.gen;
    const c = g.column(x, z);
    if (c.biome !== SNOWY) return null;
    for (const [dx, dz] of [[-4, -4], [4, 4], [-4, 4], [4, -4], [0, -6]]) {
      const o = g.column(x + dx, z + dz);
      if (o.biome !== SNOWY || Math.abs(o.height - c.height) > 2) return null;
    }
    const basement = rng() < 0.5;
    return { y: c.height, basement, bbox: [x - 4, c.height - (basement ? 12 : 1), z - 6, x + 4, c.height + 6, z + 4] };
  },

  ruined_portal(x, z, rng) {
    const c = this.gen.column(x, z);
    if (c.biome === OCEAN || c.height <= SEA_LEVEL || c.height > 110) return null;
    const axis = rng() < 0.5 ? 0 : 1;
    const fallen = rng() < 0.3;
    return { y: c.height, axis, fallen, bbox: [x - 6, c.height - 2, z - 6, x + 6, c.height + 7, z + 6] };
  },

  shipwreck(x, z, rng) {
    const g = this.gen;
    const axis = rng() < 0.5 ? 0 : 1; // 0: along X, 1: along Z
    const c = g.column(x, z);
    const beached = c.biome === BEACH;
    if (!beached && (c.biome !== OCEAN || c.height > SEA_LEVEL - 4 || c.height < SEA_LEVEL - 24)) return null;
    const ends = axis === 0 ? [[-7, 0], [7, 0]] : [[0, -7], [0, 7]];
    for (const [dx, dz] of ends) if (Math.abs(g.column(x + dx, z + dz).height - c.height) > 3) return null;
    const y = c.height; // the keel sits in the sea floor
    const bbox = axis === 0 ? [x - 7, y - 1, z - 3, x + 7, y + 11, z + 3] : [x - 3, y - 1, z - 7, x + 3, y + 11, z + 7];
    return { y, axis, flip: rng() < 0.5, bbox };
  },

  ocean_monument(x, z) {
    const g = this.gen;
    let min = Infinity;
    for (const [dx, dz] of [[0, 0], [-14, -14], [14, -14], [-14, 14], [14, 14], [0, 14], [14, 0], [-14, 0], [0, -14]]) {
      const c = g.column(x + dx, z + dz);
      if (c.biome !== OCEAN || c.height > SEA_LEVEL - 12) return null;
      min = Math.min(min, c.height);
    }
    const y = Math.max(min, SEA_LEVEL - 20);
    return { y, ox: x - 14, oz: z - 14, bbox: [x - 14, min - 10, z - 14, x + 14, y + 15, z + 14] };
  },

  mineshaft(x, z, rng) {
    const g = this.gen;
    const c = g.column(x, z);
    if (c.biome === OCEAN) return null;
    const y = 16 + Math.floor(rng() * 22);
    if (y + 16 > c.height) return null;
    const pieces = [];
    const hit = (b) => pieces.some((p) => overlaps(p.bbox, b));
    const room = { kind: 'room', x, z, y, bbox: [x - 4, y, z - 4, x + 4, y + 5, z + 4] };
    pieces.push(room);
    const corridor = (sx, sy, sz, dir, depth) => {
      if (depth > 6 || pieces.length > 60) return;
      const [dx, dz] = DIRS[dir];
      const len = 8 + Math.floor(rng() * 5) * 4;
      const ex = sx + dx * (len - 1), ez = sz + dz * (len - 1);
      const bbox = [Math.min(sx, ex) - Math.abs(dz), sy, Math.min(sz, ez) - Math.abs(dx), Math.max(sx, ex) + Math.abs(dz), sy + 3, Math.max(sz, ez) + Math.abs(dx)];
      if (hit(bbox) || Math.hypot(ex - x, ez - z) > 70) return;
      // Each corridor must stay underground.
      if (g.column(ex, ez).height < sy + 10) return;
      const seed = Math.floor(rng() * 4294967296);
      pieces.push({ kind: 'corridor', sx, sy, sz, dir, len, bbox, seed, rails: rng() < 0.6, webs: rng() < 0.2, spawner: rng() < 0.08, chest: rng() < 0.3 ? 1 + Math.floor(rng() * (len - 2)) : -1 });
      const nx = ex + dx, nz = ez + dz;
      const r = rng();
      if (r < 0.55) {
        // A crossing with branches, centred one block past the corridor end.
        const qx = nx + dx, qz = nz + dz;
        const cb = [qx - 1, sy, qz - 1, qx + 1, sy + 3, qz + 1];
        if (hit(cb)) return;
        pieces.push({ kind: 'crossing', x: qx, y: sy, z: qz, bbox: cb });
        for (let d2 = 0; d2 < 4; d2++) {
          const [bx, bz] = DIRS[d2];
          if (bx === -dx && bz === -dz) continue;
          if (rng() < 0.65) corridor(qx + bx * 2, sy, qz + bz * 2, d2, depth + 1);
        }
      } else if (r < 0.8) {
        // Stairs down (or up) four blocks, then a corridor.
        const down = sy > 12 && rng() < 0.7;
        const ny = down ? sy - 4 : sy + 4;
        const fx = nx + dx * 5, fz = nz + dz * 5;
        const sb = [Math.min(nx, fx) - Math.abs(dz), Math.min(sy, ny), Math.min(nz, fz) - Math.abs(dx), Math.max(nx, fx) + Math.abs(dz), Math.max(sy, ny) + 3, Math.max(nz, fz) + Math.abs(dx)];
        if (hit(sb) || g.column(fx, fz).height < ny + 10) return;
        pieces.push({ kind: 'stairs', sx: nx, sy, sz: nz, dir, down, bbox: sb });
        corridor(nx + dx * 5, ny, nz + dz * 5, dir, depth + 1);
      }
    };
    for (let dir = 0; dir < 4; dir++) {
      const [dx, dz] = DIRS[dir];
      if (rng() < 0.85) corridor(x + dx * 5, y, z + dz * 5, dir, 0);
    }
    const bbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of pieces) {
      for (let i = 0; i < 3; i++) {
        bbox[i] = Math.min(bbox[i], p.bbox[i]);
        bbox[i + 3] = Math.max(bbox[i + 3], p.bbox[i + 3]);
      }
    }
    return { y, pieces, bbox };
  },
};

// --- Builders (ctx, structure, chunkBox) --------------------------------------------

const BUILDERS = {
  desert_pyramid: buildPyramid,
  desert_well: buildWell,
  igloo: buildIgloo,
  ruined_portal: buildRuinedPortal,
  shipwreck: buildShipwreck,
  ocean_monument: buildMonument,
  mineshaft: buildMineshaft,
};

function buildPyramid(ctx, s) {
  const { ox, oz, y } = s;
  const S = 21, C = 10;
  const set = (dx, k, dz, id) => ctx.set(ox + dx, y + k, oz + dz, id);
  for (let dz = 0; dz < S; dz++) {
    for (let dx = 0; dx < S; dx++) {
      ctx.foundation(ox + dx, y - 1, oz + dz, B.SANDSTONE);
      // Clear the sand the pyramid is half buried in.
      for (let k = 1; k <= 15; k++) set(dx, k, dz, B.AIR);
      // Floor with a terracotta pattern around a blue centre.
      const m = Math.abs(dx - C) + Math.abs(dz - C);
      set(dx, 0, dz, m === 0 ? B.BLUE_TERRACOTTA : m === 2 || m === 4 ? B.ORANGE_TERRACOTTA : B.SANDSTONE);
    }
  }
  // Walls with cut sandstone bands, then a stepped roof over a tall atrium.
  for (let k = 1; k <= 14; k++) {
    const step = Math.max(0, k - 5);
    for (let dz = step; dz < S - step; dz++) {
      for (let dx = step; dx < S - step; dx++) {
        const edge = dx === step || dz === step || dx === S - 1 - step || dz === S - 1 - step;
        if (k <= 4) {
          if (edge) set(dx, k, dz, k === 1 || k === 4 ? B.CUT_SANDSTONE : B.SANDSTONE);
        } else {
          const atrium = k <= 8 && Math.abs(dx - C) <= 4 && Math.abs(dz - C) <= 4;
          set(dx, k, dz, atrium ? B.AIR : k === 14 ? B.CHISELED_SANDSTONE : B.SANDSTONE);
        }
      }
    }
  }
  // Pillars around the atrium.
  for (const [px, pz] of [[5, 5], [15, 5], [5, 15], [15, 15]]) {
    for (let k = 1; k <= 4; k++) set(px, k, pz, k === 2 ? B.CHISELED_SANDSTONE : B.CUT_SANDSTONE);
  }
  // Two towers flanking the entrance, with the orange-and-blue faces.
  for (const tx of [0, 16]) {
    for (let k = 1; k <= 12; k++) {
      for (let dz = 0; dz < 5; dz++) {
        for (let dx = 0; dx < 5; dx++) {
          const edge = dx === 0 || dz === 0 || dx === 4 || dz === 4;
          let id = edge || k === 12 ? B.SANDSTONE : B.AIR;
          if (edge && (k === 8 || k === 11)) id = B.ORANGE_TERRACOTTA;
          if (edge && k >= 9 && k <= 10 && (dx === 2 || dz === 2)) id = B.BLUE_TERRACOTTA;
          if (k === 12 && edge) id = B.CUT_SANDSTONE;
          set(tx + dx, k, dz, id);
        }
      }
    }
    // Doorway from the tower into the hall.
    set(tx + 2, 1, 4, B.AIR);
    set(tx + 2, 2, 4, B.AIR);
  }
  // Entrance in the middle of the front wall.
  for (let k = 1; k <= 3; k++) {
    for (let dx = C - 1; dx <= C + 1; dx++) set(dx, k, 0, B.AIR);
    set(C - 2, k, 0, B.CHISELED_SANDSTONE);
    set(C + 2, k, 0, B.CHISELED_SANDSTONE);
  }
  for (let dx = C - 2; dx <= C + 2; dx++) set(dx, 4, 0, B.ORANGE_TERRACOTTA);
  set(C, 5, 0, B.BLUE_TERRACOTTA);

  // The hidden treasure room: a shaft under the blue block drops onto a
  // pressure plate above TNT, with a chest in each of four alcoves.
  const fy = -13; // chamber floor, relative to y
  for (let dz = C - 3; dz <= C + 3; dz++) {
    for (let dx = C - 3; dx <= C + 3; dx++) {
      for (let k = fy - 2; k <= fy + 4; k++) set(dx, k, dz, B.SANDSTONE);
    }
  }
  for (let dz = C - 1; dz <= C + 1; dz++) {
    for (let dx = C - 1; dx <= C + 1; dx++) {
      for (let k = fy + 1; k <= fy + 3; k++) set(dx, k, dz, B.AIR);
      set(dx, fy - 1, dz, B.TNT);
    }
  }
  for (let k = fy + 1; k <= -1; k++) set(C, k, C, B.AIR);
  set(C, fy + 1, C, B.STONE_PRESSURE_PLATE);
  DIRS.forEach(([ax, az]) => {
    const cx = C + ax * 2, cz = C + az * 2;
    for (let k = fy + 1; k <= fy + 2; k++) set(cx, k, cz, B.AIR);
    set(cx, fy + 1, cz, chest(facingOf(-ax, -az)));
    set(C + ax * 2 + az, fy + 2, C + az * 2 + ax, B.CHISELED_SANDSTONE);
    set(C + ax * 2 - az, fy + 2, C + az * 2 - ax, B.CHISELED_SANDSTONE);
    set(C + ax, fy + 3, C + az, B.ORANGE_TERRACOTTA);
  });
}

function buildWell(ctx, s) {
  const { x, z, y } = s;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      ctx.foundation(x + dx, y - 1, z + dz, B.SANDSTONE);
      const center = dx === 0 && dz === 0;
      ctx.set(x + dx, y, z + dz, center ? B.WATER : B.SANDSTONE);
      for (let k = 1; k <= 4; k++) ctx.set(x + dx, y + k, z + dz, B.AIR);
      const rim = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (rim && !(dx === 0 || dz === 0)) ctx.set(x + dx, y + 1, z + dz, B.SMOOTH_SANDSTONE);
    }
  }
  for (let k = 1; k <= 3; k++) ctx.set(x, y - k, z, B.WATER);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.set(x + dx, y + 1, z + dz, B.SANDSTONE);
    ctx.set(x + dx, y + 2, z + dz, B.SANDSTONE);
  }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ctx.set(x + dx, y + 3, z + dz, dx || dz ? B.CUT_SANDSTONE : B.CHISELED_SANDSTONE);
}

// Trees near a structure are removed so they don't grow through it.
const TREE = new Set([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
function clearTrees(ctx, x, z, r, y0, y1) {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let k = y0; k <= y1; k++) if (TREE.has(ctx.get(x + dx, k, z + dz))) ctx.set(x + dx, k, z + dz, B.AIR);
    }
  }
}

function buildIgloo(ctx, s) {
  const { x, z, y } = s;
  clearTrees(ctx, x, z - 1, 7, y + 1, y + 16);
  const R = [3.6, 3.5, 3.1, 2.2];
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      const r = Math.hypot(dx, dz);
      if (r <= 3.6) {
        ctx.foundation(x + dx, y - 1, z + dz, B.SNOW);
        ctx.set(x + dx, y, z + dz, B.SNOW);
      }
      for (let k = 1; k <= 5; k++) {
        const outer = k <= 4 ? R[k - 1] : 1.2;
        if (r > outer) {
          if (r <= 3.7) ctx.set(x + dx, y + k, z + dz, B.AIR);
          continue;
        }
        const shell = k === 5 || r > outer - 1.15;
        ctx.set(x + dx, y + k, z + dz, shell ? B.SNOW : B.AIR);
      }
    }
  }
  // Entrance tunnel facing -Z and ice windows.
  for (let dz = -5; dz <= -3; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      ctx.set(x + dx, y, z + dz, B.SNOW);
      for (let k = 1; k <= 3; k++) ctx.set(x + dx, y + k, z + dz, dx === 0 && k <= 2 ? B.AIR : B.SNOW);
    }
  }
  ctx.set(x - 3, y + 2, z, B.ICE);
  ctx.set(x + 3, y + 2, z, B.ICE);
  // Furniture.
  ctx.set(x + 1, y + 1, z + 1, B.BED + 2);
  ctx.set(x + 1, y + 1, z + 2, B.BED + 4 + 2);
  ctx.set(x - 2, y + 1, z, oriented(B.FURNACE, 0));
  ctx.set(x - 2, y + 1, z + 1, B.CRAFTING_TABLE);
  ctx.set(x - 1, y + 1, z + 2, B.TORCH);
  if (!s.basement) return;
  // A shaft hidden under the floor leads to a small stone brick lab.
  const by = y - 9;
  for (let k = by + 4; k < y; k++) {
    ctx.set(x, k, z, B.STONE_BRICKS);
    ctx.set(x, k, z - 1, LADDER[3]);
  }
  for (let dz = -4; dz <= 2; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let k = by - 1; k <= by + 4; k++) {
        const wall = Math.abs(dx) === 3 || dz === -4 || dz === 2 || k === by - 1 || k === by + 4;
        if (wall && dx === 0 && dz === -1 && k === by + 4) continue;
        const r = rand(s.seed, dx, k, dz);
        ctx.set(x + dx, k, z + dz, wall ? (r < 0.2 ? B.MOSSY_STONE_BRICKS : r < 0.35 ? B.CRACKED_STONE_BRICKS : B.STONE_BRICKS) : B.AIR);
      }
    }
  }
  for (let k = by; k <= by + 3; k++) {
    ctx.set(x, k, z, B.STONE_BRICKS);
    ctx.set(x, k, z - 1, LADDER[3]);
  }
  ctx.set(x + 2, by, z + 1, chest(3));
  ctx.set(x - 2, by, z + 1, B.CRAFTING_TABLE);
  ctx.set(x - 2, by, z - 3, B.COBWEB);
  ctx.set(x + 2, by + 2, z - 3, B.LANTERN);
  ctx.set(x - 2, by + 1, z + 1, B.TORCH);
}

function buildRuinedPortal(ctx, s) {
  const { x, z, y, axis, fallen, seed } = s;
  clearTrees(ctx, x, z, 4, y + 1, y + 14);
  // Netherrack and magma spread around the ruin.
  for (let dz = -6; dz <= 6; dz++) {
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dz);
      const r = rand(seed, dx, 1, dz);
      if (d > 6 || r > 1.1 - d / 6) continue;
      const h = ctx.height(x + dx, z + dz);
      ctx.set(x + dx, h, z + dz, r < 0.08 ? B.MAGMA_BLOCK : B.NETHERRACK);
      for (let k = 1; k <= 2; k++) {
        const above = ctx.get(x + dx, h + k, z + dz);
        if (LOOSE.has(above) && above !== B.WATER) ctx.set(x + dx, h + k, z + dz, B.AIR);
      }
      if (rand(seed, dx, 2, dz) < 0.06) ctx.set(x + dx, h + 1, z + dz, rand(seed, dx, 3, dz) < 0.5 ? B.NETHERRACK : B.OBSIDIAN);
    }
  }
  // The frame: 4 wide, 5 tall, some blocks crying or missing.
  const cell = (u, v) => {
    const r = rand(seed, u, 7, v);
    if (r < 0.22) return null;
    return r < 0.36 ? B.CRYING_OBSIDIAN : B.OBSIDIAN;
  };
  for (let u = 0; u < 4; u++) {
    for (let v = 0; v < 5; v++) {
      const frame = u === 0 || u === 3 || v === 0 || v === 4;
      let bx, by, bz;
      if (fallen) {
        bx = x + (axis === 0 ? u - 1 : v - 2);
        bz = z + (axis === 0 ? v - 2 : u - 1);
        by = ctx.height(bx, bz) + 1;
      } else {
        bx = x + (axis === 0 ? u - 1 : 0);
        bz = z + (axis === 0 ? 0 : u - 1);
        by = y + 1 + v;
      }
      if (frame) {
        const id = cell(u, v);
        if (id) ctx.set(bx, by, bz, id);
      } else if (!fallen) ctx.set(bx, by, bz, B.AIR);
    }
  }
  // The loot chest beside the portal, and sometimes a gold block.
  const cx = x + (axis === 0 ? 0 : 3), cz = z + (axis === 0 ? 3 : 0);
  const ch = ctx.height(cx, cz);
  ctx.set(cx, ch + 1, cz, chest(axis === 0 ? 3 : 1));
  if (rand(seed, 0, 9, 0) < 0.25) ctx.set(x - 3, ctx.height(x - 3, z - 2) + 1, z - 2, B.GOLD_BLOCK);
}

function buildShipwreck(ctx, s) {
  const { x, z, y, axis, flip, seed } = s;
  const wet = y < SEA_LEVEL;
  // Local frame: u along the hull (bow at u = 0), v across.
  const at = (u, v) => {
    const uu = flip ? 7 - u : u - 7;
    return axis === 0 ? [x + uu, z + v] : [x + v, z + uu];
  };
  const set = (u, h, v, id) => {
    const [wx, wz] = at(u, v);
    ctx.set(wx, y + h, wz, id);
  };
  const half = (u) => (u === 0 ? 0 : u === 1 ? 1 : u >= 13 ? 1 : 2);
  for (let u = 0; u <= 14; u++) {
    const hw = half(u);
    const cabin = u >= 10;
    for (let v = -3; v <= 3; v++) {
      for (let h = 0; h <= 9; h++) {
        let id = null;
        if (Math.abs(v) <= hw) {
          const side = Math.abs(v) === hw || u === 0 || u === 14;
          if (h === 0) id = B.SPRUCE_PLANKS; // keel and hold floor
          else if (h < 4) id = side ? (h === 2 ? B.SPRUCE_PLANKS : B.SPRUCE_LOG) : null;
          else if (h === 4) id = u === 7 && v === 0 ? null : B.PLANKS; // deck with a hatch
          else if (cabin && h < 7) id = side || (u === 10 && v !== 0) ? B.SPRUCE_PLANKS : null;
          else if (cabin && h === 7) id = B.PLANKS;
          else if (!cabin && h === 5 && side) id = B.OAK_FENCE; // deck railing
        }
        if (id !== null && h > 0 && rand(seed, u, h, v) < 0.12) id = null; // holes
        set(u, h, v, id ?? ctx.empty(y + h, wet));
      }
    }
  }
  // The mast, snapped off.
  for (let h = 1; h <= 8; h++) set(6, h, 0, h === 4 ? B.PLANKS : B.SPRUCE_LOG);
  // Supply chest in the cabin, treasure in the bow hold.
  set(13, 5, 0, chest(flip ? (axis === 0 ? 0 : 2) : (axis === 0 ? 1 : 3)));
  set(3, 1, 0, chest(flip ? (axis === 0 ? 1 : 3) : (axis === 0 ? 0 : 2)));
}

function buildMonument(ctx, s) {
  const { ox, oz, y } = s;
  const S = 29, C = 14;
  const set = (dx, k, dz, id) => ctx.set(ox + dx, y + k, oz + dz, id);
  const W = B.WATER;
  for (let dz = 0; dz < S; dz++) {
    for (let dx = 0; dx < S; dx++) {
      ctx.foundation(ox + dx, y - 1, oz + dz, B.PRISMARINE, 20);
      set(dx, 0, dz, B.PRISMARINE_BRICKS);
      for (let k = 1; k <= 15; k++) set(dx, k, dz, W);
    }
  }
  const main = (dx, dz) => dx >= 2 && dx <= S - 3 && dz >= 4 && dz <= S - 3;
  for (let dz = 0; dz < S; dz++) {
    for (let dx = 0; dx < S; dx++) {
      const wing = (dx <= 6 || dx >= S - 7) && dz <= 8;
      if (main(dx, dz)) {
        const edge = dx === 2 || dx === S - 3 || dz === 4 || dz === S - 3;
        for (let k = 1; k <= 8; k++) {
          if (!edge) continue;
          const window = k >= 4 && k <= 5 && (dx + dz) % 4 === 0;
          const lamp = k === 3 && (dx + dz) % 6 === 1;
          set(dx, k, dz, window ? W : lamp ? B.SEA_LANTERN : k === 8 ? B.DARK_PRISMARINE : B.PRISMARINE);
        }
        set(dx, 9, dz, B.PRISMARINE_BRICKS);
      }
      // The two front wings with arches.
      if (wing) {
        const wx = dx <= 6 ? dx : S - 1 - dx;
        const edge = wx === 0 || wx === 6 || dz === 0 || dz === 8;
        for (let k = 1; k <= 11; k++) {
          const arch = (dz === 0 || dz === 8) && wx >= 2 && wx <= 4 && k <= 4;
          if (edge && !arch) set(dx, k, dz, k === 11 || k === 6 ? B.DARK_PRISMARINE : B.PRISMARINE);
        }
        set(dx, 12, dz, wx === 3 && dz === 4 ? B.SEA_LANTERN : B.PRISMARINE_BRICKS);
      }
    }
  }
  // Stepped roof.
  const steps = [[10, 5, B.PRISMARINE_BRICKS], [11, 8, B.PRISMARINE], [12, 10, B.DARK_PRISMARINE], [13, 12, B.PRISMARINE_BRICKS]];
  for (const [k, inset, id] of steps) {
    for (let dz = 4 + inset - 2; dz <= S - 3 - inset + 2; dz++) {
      for (let dx = 2 + inset - 2; dx <= S - 3 - inset + 2; dx++) {
        const ring = k === 13 && (dx === C - 2 || dx === C + 2 || dz === C - 2 || dz === C + 2);
        set(dx, k, dz, ring ? B.SEA_LANTERN : id);
      }
    }
  }
  // Entrance between the wings.
  for (let k = 1; k <= 4; k++) for (let dx = C - 2; dx <= C + 2; dx++) set(dx, k, 4, W);
  for (let k = 1; k <= 5; k++) { set(C - 3, k, 4, B.DARK_PRISMARINE); set(C + 3, k, 4, B.DARK_PRISMARINE); }
  for (let dx = C - 3; dx <= C + 3; dx++) set(dx, 5, 4, B.DARK_PRISMARINE);
  // Inner walls with doorways, and an upper floor.
  for (let k = 1; k <= 8; k++) {
    for (let d = 5; d <= S - 4; d++) {
      const door = k <= 3 && (Math.abs(d - C) <= 1 || Math.abs(d - 8) <= 1 || Math.abs(d - 21) <= 1);
      if (!door && k !== 5) {
        if (d >= 5 && d <= S - 4) set(C - 6, k, d, B.PRISMARINE);
        set(C + 6, k, d, B.PRISMARINE);
      }
    }
  }
  for (let dz = 5; dz <= S - 4; dz++) {
    for (let dx = 3; dx <= S - 4; dx++) if (Math.abs(dx - C) > 6 || dz > C + 4) set(dx, 5, dz, B.PRISMARINE_BRICKS);
  }
  // The core chamber: dark prismarine around eight gold blocks.
  for (let dz = C - 3; dz <= C + 3; dz++) {
    for (let dx = C - 3; dx <= C + 3; dx++) {
      const edge = Math.abs(dx - C) === 3 || Math.abs(dz - C) === 3;
      for (let k = 1; k <= 6; k++) {
        let id = edge ? B.DARK_PRISMARINE : W;
        if (edge && k <= 3 && dz === C - 3 && Math.abs(dx - C) <= 1) id = W;
        if (edge && Math.abs(dx - C) === 3 && Math.abs(dz - C) === 3) id = k % 2 ? B.SEA_LANTERN : B.DARK_PRISMARINE;
        set(dx, k, dz, id);
      }
    }
  }
  for (let k = 2; k <= 3; k++) for (let dz = C; dz <= C + 1; dz++) for (let dx = C; dx <= C + 1; dx++) set(dx, k, dz, B.GOLD_BLOCK);
}

function buildMineshaft(ctx, s, box) {
  for (const p of s.pieces) {
    if (!overlaps(p.bbox, box)) continue;
    if (p.kind === 'room') buildShaftRoom(ctx, p);
    else if (p.kind === 'corridor') buildCorridor(ctx, p);
    else if (p.kind === 'crossing') buildCrossing(ctx, p);
    else buildShaftStairs(ctx, p);
  }
}

// Mineshaft floors bridge over caves with planks.
function shaftFloor(ctx, x, y, z) {
  const id = ctx.get(x, y, z);
  if (id === B.AIR || id === B.WATER || id === B.LAVA || BLOCKS[id].replaceable) ctx.set(x, y, z, B.PLANKS);
}

function buildShaftRoom(ctx, p) {
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      ctx.set(p.x + dx, p.y, p.z + dz, B.DIRT);
      for (let k = 1; k <= 5; k++) ctx.set(p.x + dx, p.y + k, p.z + dz, B.AIR);
    }
  }
}

function buildCorridor(ctx, p) {
  const [dx, dz] = DIRS[p.dir];
  const px = -dz, pz = dx; // across
  const rail = dx !== 0 ? B.RAIL_EW : B.RAIL_NS;
  for (let i = 0; i < p.len; i++) {
    const cx = p.sx + dx * i, cz = p.sz + dz * i;
    const support = i % 4 === 2;
    for (let a = -1; a <= 1; a++) {
      const x = cx + px * a, z = cz + pz * a;
      shaftFloor(ctx, x, p.sy, z);
      for (let k = 1; k <= 3; k++) {
        let id = B.AIR;
        if (support && k === 3) id = B.PLANKS;
        else if (support && a !== 0) id = B.OAK_FENCE;
        else if (p.webs && rand(p.seed, i, k, a) < (k === 3 ? 0.35 : 0.12)) id = B.COBWEB;
        ctx.set(x, p.sy + k, z, id);
      }
    }
    if (p.rails && rand(p.seed, i, 9, 0) > 0.12) ctx.set(cx, p.sy + 1, cz, rail);
    if (support && rand(p.seed, i, 11, 0) < 0.25) {
      // A torch on the beam, facing along the corridor.
      ctx.set(cx - dx, p.sy + 3, cz - dz, WALL_TORCH[facingOf(-dx, -dz)]);
    }
    if (i === p.chest) ctx.set(cx + px, p.sy + 1, cz + pz, chest(facingOf(-px, -pz)));
  }
  if (p.spawner) {
    const mid = Math.floor(p.len / 2) + 1;
    const cx = p.sx + dx * mid, cz = p.sz + dz * mid;
    ctx.set(cx, p.sy + 1, cz, B.SPAWNER);
    for (let a = -1; a <= 1; a++) for (let j = -2; j <= 2; j++) {
      const x = cx + px * a + dx * j, z = cz + pz * a + dz * j;
      for (let k = 1; k <= 3; k++) if (ctx.get(x, p.sy + k, z) === B.AIR && rand(p.seed, j, k, a + 5) < 0.6) ctx.set(x, p.sy + k, z, B.COBWEB);
    }
  }
}

function buildCrossing(ctx, p) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      shaftFloor(ctx, p.x + dx, p.y, p.z + dz);
      const corner = dx !== 0 && dz !== 0;
      for (let k = 1; k <= 3; k++) ctx.set(p.x + dx, p.y + k, p.z + dz, corner ? B.PLANKS : B.AIR);
    }
  }
}

function buildShaftStairs(ctx, p) {
  const [dx, dz] = DIRS[p.dir];
  const px = -dz, pz = dx;
  for (let i = 0; i < 5; i++) {
    const fy = p.down ? p.sy - Math.min(4, i) : p.sy + Math.min(4, i);
    for (let a = -1; a <= 1; a++) {
      const x = p.sx + dx * i + px * a, z = p.sz + dz * i + pz * a;
      shaftFloor(ctx, x, fy, z);
      for (let k = 1; k <= 4; k++) ctx.set(x, fy + k, z, B.AIR);
    }
  }
}

function buildDungeon(ctx, d) {
  const { ox, oz, y, w, seed } = d;
  const dd = d.d;
  for (let dz = 0; dz < dd; dz++) {
    for (let dx = 0; dx < w; dx++) {
      for (let k = 0; k <= 4; k++) {
        const wall = dx === 0 || dz === 0 || dx === w - 1 || dz === dd - 1 || k === 0 || k === 4;
        const mossy = rand(seed, dx, k, dz) < (k === 0 ? 0.6 : 0.25);
        ctx.set(ox + dx, y + k, oz + dz, wall ? (mossy ? B.MOSSY_COBBLESTONE : B.COBBLESTONE) : B.AIR);
      }
    }
  }
  const cx = ox + (w >> 1), cz = oz + (dd >> 1);
  ctx.set(cx, y + 1, cz, B.SPAWNER);
  // One or two chests against the walls.
  const n = 1 + (seed & 1);
  const spots = [[ox + 1, cz, 0], [ox + w - 2, cz, 1], [cx, oz + 1, 2], [cx, oz + dd - 2, 3]];
  for (let i = 0; i < n; i++) {
    const [x, z, f] = spots[(seed >>> (4 + i * 2)) & 3];
    ctx.set(x, y + 1, z, chest(f));
  }
}

// --- Loot -------------------------------------------------------------------------------

// [id, min, max, weight]
const LOOT = {
  village: [[I.BREAD, 1, 4, 15], [I.APPLE, 1, 5, 15], [I.WHEAT_SEEDS, 2, 8, 10], [I.WHEAT, 2, 7, 10], [I.CARROT, 1, 4, 8], [I.POTATO, 1, 5, 8],
    [I.IRON_INGOT, 1, 4, 10], [I.COAL, 2, 8, 10], [B.TORCH, 2, 8, 8], [I.EMERALD, 1, 3, 8], [I.BOOK, 1, 2, 5], [B.OAK_SAPLING, 1, 3, 5], [I.DIAMOND, 1, 1, 1]],
  dungeon: [[I.BREAD, 1, 1, 15], [I.WHEAT, 1, 4, 20], [I.IRON_INGOT, 1, 4, 10], [I.GOLD_INGOT, 1, 4, 5], [I.REDSTONE, 1, 4, 15], [I.COAL, 1, 4, 15],
    [I.STRING, 1, 8, 10], [I.GUNPOWDER, 1, 8, 10], [I.BUCKET, 1, 1, 10], [I.GOLDEN_APPLE, 1, 1, 15], [I.BONE, 1, 8, 10], [I.ROTTEN_FLESH, 1, 8, 10]],
  mineshaft: [[B.RAIL_NS, 4, 8, 20], [B.TORCH, 1, 16, 15], [I.BREAD, 1, 3, 15], [I.IRON_INGOT, 1, 5, 10], [I.GOLD_INGOT, 1, 3, 5],
    [I.REDSTONE, 4, 9, 5], [I.LAPIS_LAZULI, 4, 9, 5], [I.DIAMOND, 1, 2, 3], [I.COAL, 3, 8, 10], [I.MELON_SLICE, 2, 4, 10], [I.GOLDEN_APPLE, 1, 1, 1], [I.IRON_PICKAXE, 1, 1, 1]],
  desert_pyramid: [[I.BONE, 4, 6, 25], [I.ROTTEN_FLESH, 3, 7, 16], [I.GOLD_INGOT, 2, 7, 15], [I.IRON_INGOT, 1, 5, 15], [I.EMERALD, 1, 3, 15],
    [I.DIAMOND, 1, 3, 5], [I.GOLDEN_APPLE, 1, 1, 20], [I.GUNPOWDER, 1, 8, 10], [B.SAND, 1, 8, 10], [I.STRING, 1, 8, 10], [I.SPIDER_EYE, 1, 3, 10]],
  igloo: [[I.APPLE, 1, 3, 15], [I.COAL, 1, 4, 15], [I.GOLD_NUGGET, 1, 3, 10], [I.STONE_AXE, 1, 1, 2], [I.ROTTEN_FLESH, 1, 1, 10], [I.EMERALD, 1, 1, 1], [I.WHEAT, 2, 3, 10]],
  shipwreck: [[I.PAPER, 1, 12, 8], [I.POTATO, 2, 6, 7], [I.CARROT, 4, 8, 7], [I.WHEAT, 8, 21, 7], [I.COAL, 2, 8, 6], [I.ROTTEN_FLESH, 5, 24, 5], [I.GUNPOWDER, 1, 5, 3],
    [I.LEATHER_HELMET, 1, 1, 3], [I.LEATHER_CHESTPLATE, 1, 1, 3], [I.IRON_INGOT, 1, 5, 20], [I.GOLD_INGOT, 1, 5, 6], [I.EMERALD, 1, 5, 10], [I.DIAMOND, 1, 1, 2],
    [I.LAPIS_LAZULI, 1, 10, 6], [I.IRON_NUGGET, 1, 10, 10], [I.GOLD_NUGGET, 1, 10, 6], [I.COMPASS, 1, 1, 2]],
  ruined_portal: [[B.OBSIDIAN, 1, 2, 40], [I.FLINT, 1, 4, 40], [I.IRON_NUGGET, 9, 18, 40], [I.FLINT_AND_STEEL, 1, 1, 40], [I.GOLDEN_APPLE, 1, 1, 15],
    [I.GOLD_NUGGET, 4, 24, 15], [I.GOLDEN_SWORD, 1, 1, 15], [I.GOLDEN_AXE, 1, 1, 15], [I.GOLDEN_PICKAXE, 1, 1, 15], [I.GOLDEN_SHOVEL, 1, 1, 15],
    [I.GOLDEN_HELMET, 1, 1, 15], [I.GOLDEN_CHESTPLATE, 1, 1, 15], [I.GOLDEN_BOOTS, 1, 1, 15], [I.CLOCK, 1, 1, 5], [I.GOLD_INGOT, 2, 8, 5], [B.GOLD_BLOCK, 1, 2, 1]],
};
const ROLLS = { village: [3, 6], dungeon: [4, 8], mineshaft: [4, 8], desert_pyramid: [3, 7], igloo: [2, 5], shipwreck: [4, 9], ruined_portal: [4, 8] };
export const LOOT_TABLES = Object.keys(LOOT);

// Fills a 27-slot chest from a loot table, deterministically by position.
export function rollLoot(table, x, y, z) {
  const entries = LOOT[table] || LOOT.village;
  const [lo, hi] = ROLLS[table] || ROLLS.village;
  const rng = mulberry32(hashCoords(0x100d ^ table.length * 977, x, y, z));
  const total = entries.reduce((n, e) => n + e[3], 0);
  const slots = new Array(27).fill(null);
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  for (let i = 0; i < n; i++) {
    let r = rng() * total;
    let e = entries[0];
    for (const cand of entries) if ((r -= cand[3]) < 0) { e = cand; break; }
    const [id, min, max] = e;
    const slot = Math.floor(rng() * 27);
    slots[slot] = { id, count: min + Math.floor(rng() * (max - min + 1)) };
  }
  if (table === 'igloo') slots[13] = { id: I.GOLDEN_APPLE, count: 1 };
  return slots;
}
