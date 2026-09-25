// Plains villages: a well on a plaza, dirt-path roads, houses with stair
// roofs, wheat farms and lamp posts. A village's layout depends only on the
// seed and on column data (height/biome), never on generated blocks, so every
// chunk places its own part of a village without its neighbours existing.
import { SEA_LEVEL, CHUNK_HEIGHT } from './constants.js';
import { B, I, orientedBlock } from './blocks.js';
import { hashCoords, mulberry32 } from './noise.js';

const REGION = 224; // one village attempt per REGION x REGION blocks
const MARGIN = 56; // keeps villages inside their region
const CHANCE = 0.8;
// BIOME.PLAINS, FOREST and SNOWY (worldgen.js imports this module).
const VILLAGE_BIOMES = new Set([2, 3, 5]);

// Facing index (+X, -X, +Z, -Z) of a direction vector.
function facingOf(dx, dz) {
  if (dx > 0) return 0;
  if (dx < 0) return 1;
  return dz > 0 ? 2 : 3;
}

const ORIENTED = new Map();
function oriented(baseId, f) {
  const key = baseId * 4 + f;
  if (!ORIENTED.has(key)) ORIENTED.set(key, orientedBlock(baseId, f));
  return ORIENTED.get(key);
}

const WALL_TORCH = [B.WALL_TORCH_PX, B.WALL_TORCH_NX, B.WALL_TORCH_PZ, B.WALL_TORCH_NZ];
const REPLACEABLE = new Set([B.AIR, B.WATER, B.TALL_GRASS, B.DANDELION, B.POPPY, B.CORNFLOWER, B.OXEYE_DAISY,
  B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.SNOW]);

export class Villages {
  constructor(gen) {
    this.gen = gen;
    this.cache = new Map();
  }

  // The village of region (rx, rz), or null.
  region(rx, rz) {
    const key = `${rx},${rz}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const v = this.plan(rx, rz);
    this.cache.set(key, v);
    return v;
  }

  plan(rx, rz) {
    const gen = this.gen;
    const rng = mulberry32(hashCoords(gen.seed ^ 0x51a6e, rx, 7, rz));
    if (rng() > CHANCE) return null;
    // Try a few spots in the region; a village needs fairly flat, dry ground.
    let x, z, center = null;
    for (let attempt = 0; attempt < 6 && !center; attempt++) {
      x = rx * REGION + MARGIN + Math.floor(rng() * (REGION - 2 * MARGIN));
      z = rz * REGION + MARGIN + Math.floor(rng() * (REGION - 2 * MARGIN));
      const c = gen.column(x, z);
      if (VILLAGE_BIOMES.has(c.biome) && this.flat(x, z)) center = c;
    }
    if (!center) return null;

    const pieces = [];
    const taken = [];
    // Buildings keep a one-block gap from each other; they may touch roads.
    const free = (r) => taken.every(({ rect: t, road }) => {
      const g = road ? 0 : 1;
      return r[0] > t[2] + g || r[2] < t[0] - g || r[1] > t[3] + g || r[3] < t[1] - g;
    });
    const add = (p) => {
      pieces.push(p);
      taken.push({ rect: p.rect, road: p.type === 'road' || p.type === 'plaza' });
    };
    add({ type: 'plaza', rect: [x - 3, z - 3, x + 4, z + 4] });
    const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const roads = [];
    for (const [dx, dz] of arms) {
      const len = 14 + Math.floor(rng() * 16);
      const start = dx > 0 || dz > 0 ? 5 : 4;
      const a = [x + dx * start - Math.abs(dz), z + dz * start - Math.abs(dx)];
      const b = [x + dx * len + Math.abs(dz), z + dz * len + Math.abs(dx)];
      const rect = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      roads.push({ type: 'road', rect, dx, dz, len });
    }
    roads.forEach(add);
    for (const road of roads) {
      const { dx, dz, len } = road;
      for (let s = 9; s + 3 <= len; s += 9) {
        for (const side of [-1, 1]) {
          const roll = rng();
          const kind = roll < 0.42 ? 'house' : roll < 0.62 ? 'bighouse' : roll < 0.82 ? 'farm' : roll < 0.92 ? 'lamp' : null;
          if (!kind) continue;
          // q points away from the road; the building's front faces -q.
          const qx = -dz * side, qz = dx * side;
          const px = x + dx * s, pz = z + dz * s;
          const p = this.building(kind, px, pz, qx, qz, rng);
          if (p && free(p.rect)) add(p);
        }
      }
      // A lamp at the end of every road.
      const lx = x + dx * (len + 1), lz = z + dz * (len + 1);
      const lamp = { type: 'lamp', x: lx, z: lz, rect: [lx, lz, lx, lz] };
      if (free(lamp.rect)) add(lamp);
    }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pieces) {
      x0 = Math.min(x0, p.rect[0]); z0 = Math.min(z0, p.rect[1]);
      x1 = Math.max(x1, p.rect[2]); z1 = Math.max(z1, p.rect[3]);
    }
    return { x, z, y: center.height, pieces, rect: [x0, z0, x1, z1], seed: hashCoords(gen.seed, rx, 99, rz) };
  }

  flat(x, z) {
    let min = Infinity, max = -Infinity;
    for (let a = 0; a < 12; a++) {
      for (const r of [8, 18]) {
        const c = this.gen.column(Math.round(x + Math.cos(a * Math.PI / 6) * r), Math.round(z + Math.sin(a * Math.PI / 6) * r));
        if (c.biome === 6) return false; // mountains
        min = Math.min(min, c.height);
        max = Math.max(max, c.height);
      }
    }
    return min > SEA_LEVEL + 1 && max - min <= 9;
  }

  // A building whose front wall's middle sits 3 blocks from the road centre
  // line at (px, pz), on the side given by q.
  building(kind, px, pz, qx, qz, rng) {
    if (kind === 'lamp') {
      const x = px + qx * 2, z = pz + qz * 2;
      return { type: 'lamp', x, z, rect: [x, z, x, z] };
    }
    const [w, d] = kind === 'house' ? [5, 5] : kind === 'bighouse' ? [7, 6] : [7, 9];
    const ex = [qz, -qx], ez = [qx, qz];
    const half = Math.floor(w / 2);
    const ox = px + qx * 3 - ex[0] * half, oz = pz + qz * 3 - ex[1] * half;
    const toWorld = (lx, lz) => [ox + lx * ex[0] + lz * ez[0], oz + lx * ex[1] + lz * ez[1]];
    // Roofs overhang by one block on every side.
    const pad = kind === 'farm' ? 0 : 1;
    const c0 = toWorld(-pad, -pad), c1 = toWorld(w - 1 + pad, d - 1 + pad);
    const rect = [Math.min(c0[0], c1[0]), Math.min(c0[1], c1[1]), Math.max(c0[0], c1[0]), Math.max(c0[1], c1[1])];
    const mid = toWorld(half, Math.floor(d / 2));
    const y = this.gen.column(mid[0], mid[1]).height;
    if (y <= SEA_LEVEL || y + 12 >= CHUNK_HEIGHT) return null;
    return { type: kind, w, d, ox, oz, ex, ez, y, rect, variant: Math.floor(rng() * 4), road: [px, pz] };
  }

  // Villages whose area comes within `pad` blocks of the rectangle.
  near(x0, z0, x1, z1, pad = 0) {
    const out = [];
    const rx0 = Math.floor((x0 - pad) / REGION), rx1 = Math.floor((x1 + pad) / REGION);
    const rz0 = Math.floor((z0 - pad) / REGION), rz1 = Math.floor((z1 + pad) / REGION);
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const v = this.region(rx, rz);
        if (v && v.rect[0] - pad <= x1 && v.rect[2] + pad >= x0 && v.rect[1] - pad <= z1 && v.rect[3] + pad >= z0) out.push(v);
      }
    }
    return out;
  }

  // Trees are kept out of villages.
  blocksTree(x, z) {
    for (const v of this.near(x, z, x, z, 3)) {
      for (const p of v.pieces) {
        const r = p.rect;
        if (x >= r[0] - 3 && x <= r[2] + 3 && z >= r[1] - 3 && z <= r[3] + 3) return true;
      }
    }
    return false;
  }

  nearest(x, z, radius = 200) {
    let best = null, bd = Infinity;
    for (const v of this.near(x, z, x, z, radius)) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // Places every village piece that overlaps the chunk.
  place(chunk) {
    const ox = chunk.cx * 16, oz = chunk.cz * 16;
    const blocks = chunk.blocks;
    const inside = (x, y, z) => x >= ox && x < ox + 16 && z >= oz && z < oz + 16 && y >= 0 && y < CHUNK_HEIGHT;
    const ctx = {
      set: (x, y, z, id) => {
        if (inside(x, y, z)) blocks[(y << 8) | ((z - oz) << 4) | (x - ox)] = id;
      },
      get: (x, y, z) => (inside(x, y, z) ? blocks[(y << 8) | ((z - oz) << 4) | (x - ox)] : B.AIR),
      // Cobblestone (or `id`) under a floor block until solid ground.
      foundation: (x, y, z, id = B.COBBLESTONE) => {
        for (let k = y; k > Math.max(1, y - 10); k--) {
          if (!REPLACEABLE.has(ctx.get(x, k, z))) break;
          ctx.set(x, k, z, id);
        }
      },
      height: (x, z) => this.gen.column(x, z).height,
    };
    for (const v of this.near(ox, oz, ox + 15, oz + 15)) {
      for (const p of v.pieces) {
        const r = p.rect;
        if (r[0] > ox + 15 || r[2] < ox || r[1] > oz + 15 || r[3] < oz) continue;
        this.placePiece(ctx, v, p);
      }
    }
  }

  placePiece(ctx, v, p) {
    switch (p.type) {
      case 'plaza': return this.placePlaza(ctx, v, p);
      case 'road': return this.placeRoad(ctx, p);
      case 'lamp': return this.placeLamp(ctx, p.x, p.z);
      case 'farm': return this.placeFarm(ctx, v, p);
      default: return this.placeHouse(ctx, v, p);
    }
  }

  pathAt(ctx, x, z) {
    const h = ctx.height(x, z);
    if (h <= SEA_LEVEL) {
      ctx.set(x, SEA_LEVEL, z, B.PLANKS); // a little bridge
      for (let k = 1; k <= 3; k++) ctx.set(x, SEA_LEVEL + k, z, B.AIR);
      return;
    }
    const top = ctx.get(x, h, z);
    if (top === B.GRASS || top === B.DIRT || top === B.SAND || top === B.SNOWY_GRASS || top === B.GRAVEL) ctx.set(x, h, z, B.DIRT_PATH);
    for (let k = 1; k <= 4; k++) {
      const id = ctx.get(x, h + k, z);
      if (REPLACEABLE.has(id) || id === B.LOG || id === B.BIRCH_LOG) ctx.set(x, h + k, z, B.AIR);
    }
  }

  placePlaza(ctx, v, p) {
    const [x0, z0, x1, z1] = p.rect;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.pathAt(ctx, x, z);
    // The well: a 4x4 cobblestone ring around 2x2 water, four posts and a roof.
    const y = v.y;
    for (let dz = -1; dz <= 2; dz++) {
      for (let dx = -1; dx <= 2; dx++) {
        const x = v.x + dx, z = v.z + dz;
        const edge = dx === -1 || dx === 2 || dz === -1 || dz === 2;
        const corner = (dx === -1 || dx === 2) && (dz === -1 || dz === 2);
        for (let k = y - 5; k <= y; k++) ctx.set(x, k, z, edge || k === y - 5 ? B.COBBLESTONE : B.WATER);
        ctx.foundation(x, y - 6, z);
        ctx.set(x, y + 1, z, edge ? B.COBBLESTONE : B.AIR);
        for (let k = 2; k <= 3; k++) ctx.set(x, y + k, z, corner ? B.OAK_FENCE : B.AIR);
        ctx.set(x, y + 4, z, edge ? B.COBBLE_SLAB : B.COBBLESTONE);
      }
    }
  }

  placeRoad(ctx, p) {
    const [x0, z0, x1, z1] = p.rect;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.pathAt(ctx, x, z);
  }

  placeLamp(ctx, x, z) {
    const h = ctx.height(x, z);
    if (h <= SEA_LEVEL) return;
    for (let k = 1; k <= 4; k++) ctx.set(x, h + k, z, B.AIR);
    ctx.set(x, h, z, B.COBBLESTONE);
    ctx.set(x, h + 1, z, B.OAK_FENCE);
    ctx.set(x, h + 2, z, B.OAK_FENCE);
    ctx.set(x, h + 3, z, B.LANTERN);
  }

  // Helpers for pieces in their own frame: local x across the front, local
  // z away from the road, front wall at z = 0.
  frame(ctx, p) {
    const { ox, oz, ex, ez } = p;
    const at = (lx, lz) => [ox + lx * ex[0] + lz * ez[0], oz + lx * ex[1] + lz * ez[1]];
    const set = (lx, y, lz, id) => {
      const [x, z] = at(lx, lz);
      ctx.set(x, y, z, id);
    };
    // Local facing (0 +X, 1 -X, 2 +Z, 3 -Z) to world facing.
    const face = (f) => {
      const [lx, lz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][f];
      return facingOf(lx * ex[0] + lz * ez[0], lx * ex[1] + lz * ez[1]);
    };
    return { at, set, face };
  }

  placeFarm(ctx, v, p) {
    const { set, at } = this.frame(ctx, p);
    const { w, d, y } = p;
    const rng = mulberry32(hashCoords(v.seed, p.ox, 3, p.oz));
    for (let lz = 0; lz < d; lz++) {
      for (let lx = 0; lx < w; lx++) {
        const [x, z] = at(lx, lz);
        ctx.foundation(x, y - 1, z, B.DIRT);
        for (let k = 1; k <= 4; k++) ctx.set(x, y + k, z, B.AIR);
        const border = lx === 0 || lx === w - 1 || lz === 0 || lz === d - 1;
        if (border) {
          set(lx, y, lz, B.LOG);
        } else if (lx === 3) {
          set(lx, y, lz, B.WATER);
        } else {
          set(lx, y, lz, B.FARMLAND);
          const r = rng();
          set(lx, y + 1, lz, r < 0.15 ? B.AIR : B.WHEAT_0 + Math.min(3, Math.floor(r * 4.4)));
        }
      }
    }
    // A lantern post on the front corner lights the farm at night.
    set(0, y + 1, 0, B.OAK_FENCE);
    set(0, y + 2, 0, B.LANTERN);
  }

  placeHouse(ctx, v, p) {
    const { set, at, face } = this.frame(ctx, p);
    const { w, d, y, variant } = p;
    const big = p.type === 'bighouse';
    const rng = mulberry32(hashCoords(v.seed, p.ox, 5, p.oz));
    const door = Math.floor(w / 2);
    const roofTop = Math.ceil(w / 2) + 5;
    // Clear the volume (including the roof overhang) and lay the foundation.
    for (let lz = -1; lz <= d; lz++) {
      for (let lx = -1; lx <= w; lx++) {
        const [x, z] = at(lx, lz);
        for (let k = 1; k <= roofTop; k++) ctx.set(x, y + k, z, B.AIR);
        if (lx >= 0 && lx < w && lz >= 0 && lz < d) ctx.foundation(x, y - 1, z);
      }
    }
    const wallLow = big || variant === 0 ? B.COBBLESTONE : B.PLANKS;
    for (let lz = 0; lz < d; lz++) {
      for (let lx = 0; lx < w; lx++) {
        const edge = lx === 0 || lx === w - 1 || lz === 0 || lz === d - 1;
        const corner = (lx === 0 || lx === w - 1) && (lz === 0 || lz === d - 1);
        set(lx, y, lz, edge ? B.COBBLESTONE : B.PLANKS);
        if (!edge) continue;
        for (let k = 1; k <= 3; k++) set(lx, y + k, lz, corner ? B.LOG : k === 1 ? wallLow : B.PLANKS);
        set(lx, y + 4, lz, lz === 0 || lz === d - 1 || lx === 0 || lx === w - 1 ? B.PLANKS : B.AIR);
      }
    }
    // Windows.
    const sideWin = big ? [1, d - 2] : [Math.floor(d / 2)];
    for (const lz of sideWin) {
      set(0, y + 2, lz, B.GLASS);
      set(w - 1, y + 2, lz, B.GLASS);
    }
    const backWin = big ? [2, w - 3] : [door];
    for (const lx of backWin) set(lx, y + 2, d - 1, B.GLASS);
    if (big) { set(1, y + 2, 0, B.GLASS); set(w - 2, y + 2, 0, B.GLASS); }
    // Doorway, a step of path in front of it and a torch beside it.
    set(door, y + 1, 0, B.AIR);
    set(door, y + 2, 0, B.AIR);
    const [fx, fz] = at(door, -1);
    ctx.set(fx, y, fz, B.DIRT_PATH);
    ctx.foundation(fx, y - 1, fz, B.DIRT);
    const [sx, sz] = at(door, -2);
    this.pathAt(ctx, sx, sz);
    set(door + 1, y + 2, -1, WALL_TORCH[face(3)]);
    // Gable roof of stairs with a slab ridge; the gables are planks.
    const stairs = variant === 3 ? B.COBBLE_STAIRS : B.OAK_STAIRS;
    const ridge = variant === 3 ? B.COBBLE_SLAB : B.OAK_SLAB;
    for (let k = 0; ; k++) {
      const left = -1 + k, right = w - k;
      const ry = y + 4 + k;
      if (left > right) break;
      for (let lz = -1; lz <= d; lz++) {
        if (left === right) {
          set(left, ry, lz, ridge);
        } else {
          set(left, ry, lz, oriented(stairs, face(0)));
          set(right, ry, lz, oriented(stairs, face(1)));
        }
      }
      if (left === right) break;
      for (let lx = left + 1; lx < right; lx++) {
        set(lx, ry, 0, B.PLANKS);
        set(lx, ry, d - 1, B.PLANKS);
      }
    }
    // Furniture.
    set(1, y + 1, d - 2, B.CRAFTING_TABLE);
    set(w - 2, y + 1, d - 2, B.LANTERN);
    if (big) {
      set(w - 2, y + 1, 1, oriented(B.FURNACE, face(1)));
      set(1, y + 1, 1, oriented(B.CHEST, face(0)));
      set(2, y + 1, d - 2, B.BOOKSHELF);
      if (rng() < 0.5) set(w - 3, y + 1, d - 2, B.BOOKSHELF);
    }
  }
}

// Loot for chests generated in villages (filled the first time one is opened).
export function villageLoot(x, y, z) {
  const rng = mulberry32(hashCoords(0x100d, x, y, z));
  const table = [
    [I.BREAD, 1, 4],
    [I.APPLE, 1, 5],
    [I.WHEAT_SEEDS, 2, 8],
    [I.WHEAT, 2, 7],
    [I.IRON_INGOT, 1, 4],
    [I.COAL, 2, 8],
    [B.TORCH, 2, 8],
    [I.DIAMOND, 1, 1], // rare: only rolled 10% of the time
  ];
  const slots = new Array(27).fill(null);
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const [id, min, max] = table[Math.floor(rng() * (rng() < 0.9 ? table.length - 1 : table.length))];
    slots[Math.floor(rng() * 27)] = { id, count: min + Math.floor(rng() * (max - min + 1)) };
  }
  return slots;
}
