import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimplexNoise, hashString, mulberry32 } from '../src/noise.js';
import { B, BLOCKS, I, breakTime, blockDrop, IS_OPAQUE } from '../src/blocks.js';
import { Chunk } from '../src/chunk.js';
import { WorldGenerator } from '../src/worldgen.js';
import { World } from '../src/world.js';
import { buildChunkMesh, VERTEX_BYTES } from '../src/mesher.js';
import { raycast } from '../src/raycast.js';
import { Player } from '../src/player.js';
import { generateTextures } from '../src/textures.js';
import { CHUNK_HEIGHT } from '../src/constants.js';

test('noise is deterministic and bounded', () => {
  const a = new SimplexNoise(42), b = new SimplexNoise(42), c = new SimplexNoise(43);
  let differs = false;
  for (let i = 0; i < 2000; i++) {
    const x = i * 0.137, y = i * 0.071, z = i * 0.019;
    const v2 = a.noise2D(x, y), v3 = a.noise3D(x, y, z);
    assert.equal(v2, b.noise2D(x, y));
    assert.equal(v3, b.noise3D(x, y, z));
    assert.ok(v2 >= -1.01 && v2 <= 1.01, `noise2D out of range: ${v2}`);
    assert.ok(v3 >= -1.01 && v3 <= 1.01, `noise3D out of range: ${v3}`);
    if (c.noise2D(x, y) !== v2) differs = true;
  }
  assert.ok(differs, 'different seeds should give different noise');
  assert.equal(hashString('abc'), hashString('abc'));
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('textures are generated for every block face and item', () => {
  const tex = generateTextures();
  for (const b of BLOCKS) {
    if (!b.faces) continue;
    for (const f of b.faces) assert.ok(tex.index.has(f), `missing texture ${f} for ${b.name}`);
  }
  assert.ok(tex.index.has('item_diamond_pickaxe'));
  assert.ok(tex.index.has('destroy_9'));
  assert.equal(tex.pixels.length, tex.count * 16 * 16 * 4);
});

test('world generation is deterministic and independent of generation order', () => {
  const gen1 = new WorldGenerator(1234);
  const gen2 = new WorldGenerator(1234);
  // Generate in different orders; trees crossing chunk borders must agree.
  const order1 = [[0, 0], [1, 0], [0, 1]];
  const order2 = [[0, 1], [1, 0], [0, 0]];
  const out1 = new Map(), out2 = new Map();
  for (const [cx, cz] of order1) { const c = new Chunk(cx, cz); gen1.generate(c); out1.set(`${cx},${cz}`, c.blocks); }
  for (const [cx, cz] of order2) { const c = new Chunk(cx, cz); gen2.generate(c); out2.set(`${cx},${cz}`, c.blocks); }
  for (const k of out1.keys()) assert.deepEqual(out1.get(k), out2.get(k), `chunk ${k} differs`);
  const c = new Chunk(0, 0);
  new WorldGenerator(999).generate(c);
  assert.notDeepEqual(c.blocks, out1.get('0,0'), 'different seed, different terrain');
});

test('generated terrain has bedrock floor, stone, and sensible surface', () => {
  const gen = new WorldGenerator(77);
  const c = new Chunk(3, -2);
  gen.generate(c);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      assert.equal(c.get(x, 0, z), B.BEDROCK, 'y=0 is always bedrock');
      const h = c.heightmap[z * 16 + x];
      assert.ok(h > 0 && h < CHUNK_HEIGHT, 'column has a surface');
    }
  }
  const counts = new Map();
  for (const id of c.blocks) counts.set(id, (counts.get(id) || 0) + 1);
  assert.ok((counts.get(B.STONE) || 0) > 10000, 'mostly stone underground');
});

function flatWorld() {
  // A world whose generator is replaced with flat terrain for precise tests.
  const w = new World({ seed: 1 });
  w.generator.generate = (chunk) => {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        chunk.set(x, 0, z, B.BEDROCK);
        for (let y = 1; y < 60; y++) chunk.set(x, y, z, B.STONE);
        chunk.set(x, 60, z, B.GRASS);
      }
    }
    chunk.computeHeightmap();
  };
  w.ensureArea(0.5, 0.5, 1, () => {});
  return w;
}

test('sky light fills open air and stops at the ground', () => {
  const w = flatWorld();
  assert.equal(w.getSkyLight(5, 61, 5), 15);
  assert.equal(w.getSkyLight(5, 100, 5), 15);
  assert.equal(w.getSkyLight(5, 59, 5), 0);
});

test('torch light spreads, falls off by one per block, and is removed', () => {
  const w = flatWorld();
  // Dig a sealed tunnel underground.
  for (let x = 0; x < 12; x++) w.setBlock(x, 40, 3, B.AIR);
  assert.equal(w.getBlockLight(0, 40, 3), 0);
  assert.ok(w.setBlock(0, 40, 3, B.TORCH));
  for (let x = 0; x < 12; x++) assert.equal(w.getBlockLight(x, 40, 3), Math.max(0, 14 - x));
  assert.equal(w.getSkyLight(5, 40, 3), 0, 'no sky light in a sealed tunnel');
  w.setBlock(0, 40, 3, B.AIR);
  for (let x = 0; x < 12; x++) assert.equal(w.getBlockLight(x, 40, 3), 0);
});

test('placing a roof shades the ground and removing it restores sunlight', () => {
  const w = flatWorld();
  assert.equal(w.getSkyLight(4, 61, 4), 15);
  w.setBlock(4, 70, 4, B.STONE);
  assert.equal(w.getSkyLight(4, 69, 4), 14, 'shadow gets light from the side');
  assert.equal(w.getSkyLight(4, 61, 4), 14);
  w.setBlock(4, 70, 4, B.AIR);
  assert.equal(w.getSkyLight(4, 61, 4), 15);
  // Opening a shaft lets sunlight straight down.
  for (let y = 60; y >= 50; y--) w.setBlock(8, y, 8, B.AIR);
  assert.equal(w.getSkyLight(8, 50, 8), 15);
});

test('mesher culls hidden faces', () => {
  const w = flatWorld();
  const c = w.getChunk(0, 0);
  const base = buildChunkMesh(w, c);
  // Flat ground: only the top face of every column is visible.
  assert.equal(base.solidQuads, 256);
  assert.equal(base.solid.length, 256 * 4 * VERTEX_BYTES);
  // One floating block adds 6 faces; a second touching block adds only 4 more.
  w.setBlock(5, 70, 5, B.STONE);
  assert.equal(buildChunkMesh(w, c).solidQuads, 256 + 6);
  w.setBlock(6, 70, 5, B.STONE);
  assert.equal(buildChunkMesh(w, c).solidQuads, 256 + 10);
  // Water goes to the translucent mesh.
  w.setBlock(2, 61, 2, B.WATER);
  assert.ok(buildChunkMesh(w, c).waterQuads >= 5);
});

test('raycast hits the first targetable block and reports the face', () => {
  const w = flatWorld();
  const get = (x, y, z) => w.getBlock(x, y, z);
  const down = raycast(get, [5.5, 63, 5.5], [0, -1, 0], 5);
  assert.deepEqual([down.x, down.y, down.z, down.face], [5, 60, 5, 2]);
  assert.deepEqual(down.normal, [0, 1, 0]);
  w.setBlock(8, 61, 5, B.STONE);
  const side = raycast(get, [5.5, 61.5, 5.5], [1, 0, 0], 5);
  assert.deepEqual([side.x, side.y, side.z, side.face], [8, 61, 5, 1]);
  assert.equal(raycast(get, [5.5, 61.5, 5.5], [0, 1, 0], 5), null);
  // Small hit boxes: a ray passing beside a torch misses it.
  w.setBlock(5, 61, 8, B.TORCH);
  assert.equal(raycast(get, [5.05, 61.9, 5.5], [0, 0, 1], 5), null);
  assert.equal(raycast(get, [5.5, 61.3, 5.5], [0, 0, 1], 5).id, B.TORCH);
});

test('player falls onto the ground and cannot walk through walls', () => {
  const w = flatWorld();
  const p = new Player();
  p.pos = [5.5, 65, 5.5];
  const events = [];
  for (let i = 0; i < 120; i++) p.update(1 / 60, {}, w, false, events);
  assert.ok(p.onGround);
  assert.ok(Math.abs(p.pos[1] - 61) < 0.01, `standing on y=61, got ${p.pos[1]}`);
  for (let y = 61; y < 64; y++) w.setBlock(7, y, 5, B.STONE);
  p.yaw = -Math.PI / 2; // face +X
  for (let i = 0; i < 120; i++) p.update(1 / 60, { forward: true }, w, false, events);
  assert.ok(p.pos[0] <= 7 - 0.3 + 1e-3, `stopped by the wall, x=${p.pos[0]}`);
  assert.ok(p.pos[0] > 6.5);
});

test('falling more than 3 blocks hurts in survival but not creative', () => {
  const w = flatWorld();
  for (const creative of [false, true]) {
    const p = new Player();
    p.pos = [3.5, 71, 3.5];
    const events = [];
    for (let i = 0; i < 180; i++) p.update(1 / 60, {}, w, creative, events);
    if (creative) assert.equal(p.health, 20);
    else {
      assert.ok(p.health < 20 && p.health >= 12, `took fall damage, health=${p.health}`);
      assert.ok(events.some((e) => e.type === 'hurt'));
    }
  }
});

test('jumping clears one block', () => {
  const w = flatWorld();
  const p = new Player();
  p.pos = [3.5, 61, 3.5];
  const events = [];
  let maxY = 0;
  p.update(1 / 60, {}, w, false, events);
  p.update(1 / 60, { jump: true }, w, false, events);
  for (let i = 0; i < 60; i++) {
    p.update(1 / 60, {}, w, false, events);
    maxY = Math.max(maxY, p.pos[1]);
  }
  assert.ok(maxY - 61 > 1.05 && maxY - 61 < 1.5, `jump height ${maxY - 61}`);
});

test('break times and drops follow tool rules', () => {
  assert.equal(breakTime(B.TALL_GRASS, 0), 0);
  assert.equal(breakTime(B.BEDROCK, I.DIAMOND_PICKAXE), Infinity);
  assert.ok(Math.abs(breakTime(B.DIRT, 0) - 0.75) < 1e-9);
  assert.ok(Math.abs(breakTime(B.STONE, 0) - 7.5) < 1e-9, 'stone by hand is slow');
  assert.ok(breakTime(B.STONE, I.WOODEN_PICKAXE) < breakTime(B.STONE, 0));
  assert.ok(breakTime(B.STONE, I.DIAMOND_PICKAXE) < breakTime(B.STONE, I.STONE_PICKAXE));
  assert.equal(blockDrop(B.STONE, 0), null, 'stone needs a pickaxe');
  assert.equal(blockDrop(B.STONE, I.WOODEN_PICKAXE), B.COBBLESTONE);
  assert.equal(blockDrop(B.IRON_ORE, I.WOODEN_PICKAXE), null, 'iron needs stone tier');
  assert.equal(blockDrop(B.IRON_ORE, I.STONE_PICKAXE), B.IRON_ORE);
  assert.equal(blockDrop(B.DIAMOND_ORE, I.IRON_PICKAXE), I.DIAMOND);
  assert.equal(blockDrop(B.GRASS, 0), B.DIRT);
  assert.equal(blockDrop(B.GLASS, 0), null);
  assert.equal(blockDrop(B.WALL_TORCH_NZ, 0), B.TORCH);
  assert.equal(IS_OPAQUE[B.GLASS], 0);
  assert.equal(IS_OPAQUE[B.STONE], 1);
});
