import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B, I, BLOCKS, ITEMS, SMELTING, fuelTime, blockDrops, orientedBlock } from '../src/blocks.js';
import { Chunk } from '../src/chunk.js';
import { WorldGenerator } from '../src/worldgen.js';
import { World } from '../src/world.js';
import { Player } from '../src/player.js';
import { moveBody } from '../src/physics.js';
import { newFurnace, tickFurnace } from '../src/gameplay.js';
import { encodeBlockEntities, decodeBlockEntities } from '../src/storage.js';
import { MOBS, mobSkins } from '../src/mobs.js';
import { villageLoot } from '../src/villages.js';
import { hashString } from '../src/noise.js';

function flatWorld() {
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

test('villages are generated identically whatever the chunk order', () => {
  const seed = hashString('test'); // has a village ~100 blocks from spawn
  const gen = new WorldGenerator(seed);
  const v = gen.nearestVillage(0, 0);
  assert.ok(v, 'a village exists near spawn');
  const cx = Math.floor(v.x / 16), cz = Math.floor(v.z / 16);
  const chunks = [[cx, cz], [cx + 1, cz], [cx, cz + 1], [cx - 1, cz - 1]];
  const a = new Map(), b = new Map();
  const g1 = new WorldGenerator(seed), g2 = new WorldGenerator(seed);
  for (const [x, z] of chunks) { const c = new Chunk(x, z); g1.generate(c); a.set(`${x},${z}`, c.blocks); }
  for (const [x, z] of [...chunks].reverse()) { const c = new Chunk(x, z); g2.generate(c); b.set(`${x},${z}`, c.blocks); }
  for (const k of a.keys()) assert.deepEqual(a.get(k), b.get(k), `chunk ${k} differs`);
  // The centre chunk holds the well and paths.
  const blocks = a.get(`${cx},${cz}`);
  const count = (id) => blocks.reduce((n, x) => n + (x === id), 0);
  assert.ok(count(B.DIRT_PATH) > 10, 'roads');
  assert.ok(count(B.COBBLESTONE) > 10, 'well');
  assert.ok(count(B.OAK_FENCE) >= 4, 'well posts');
});

test('furnaces smelt one item per 10 seconds using fuel', () => {
  const f = newFurnace();
  f.slots[0] = { id: B.IRON_ORE, count: 2 };
  f.slots[1] = { id: I.COAL, count: 1 };
  assert.equal(SMELTING.get(B.IRON_ORE), I.IRON_INGOT);
  assert.equal(fuelTime(I.COAL), 80);
  for (let t = 0; t < 10.05; t += 0.05) tickFurnace(f, 0.05);
  assert.deepEqual(f.slots[2], { id: I.IRON_INGOT, count: 1 });
  assert.equal(f.slots[1], null, 'coal was consumed');
  assert.ok(f.burn > 60);
  for (let t = 0; t < 10.05; t += 0.05) tickFurnace(f, 0.05);
  assert.equal(f.slots[2].count, 2);
  assert.equal(f.slots[0], null);
  const empty = newFurnace();
  empty.slots[0] = { id: B.SAND, count: 1 };
  for (let t = 0; t < 12; t += 0.1) tickFurnace(empty, 0.1);
  assert.equal(empty.slots[2], null, 'no fuel, no smelting');
});

test('crops, containers and orientable blocks', () => {
  assert.equal(BLOCKS[B.WHEAT_3].crop, 3);
  const drops = blockDrops(B.WHEAT_3, 0, () => 0.99);
  assert.ok(drops.some(([id]) => id === I.WHEAT), 'ripe wheat drops wheat');
  assert.ok(drops.some(([id]) => id === I.WHEAT_SEEDS), 'and seeds');
  assert.deepEqual(blockDrops(B.WHEAT_0, 0, () => 0.99).map(([id]) => id), [I.WHEAT_SEEDS]);
  for (let f = 0; f < 4; f++) {
    const id = orientedBlock(B.FURNACE, f);
    assert.equal(BLOCKS[id].facing, f);
    assert.equal(BLOCKS[id].container, 'furnace');
    assert.equal(BLOCKS[orientedBlock(B.OAK_STAIRS, f)].shape, 'stairs');
  }
  assert.equal(BLOCKS[B.CHEST].container, 'chest');
  const loot = villageLoot(10, 70, -4);
  assert.equal(loot.length, 27);
  assert.ok(loot.some(Boolean));
  assert.deepEqual(loot, villageLoot(10, 70, -4), 'loot is deterministic');
});

test('block entities survive a save round-trip', () => {
  const m = new Map([['1,64,2', { type: 'chest', slots: [{ id: B.DIRT, count: 5 }, null, { id: I.BREAD, count: 2 }] }],
    ['-3,70,9', { type: 'furnace', slots: [null, { id: I.COAL, count: 3 }, null], burn: 12.5, burnMax: 80, cook: 4 }]]);
  const back = decodeBlockEntities(JSON.parse(JSON.stringify(encodeBlockEntities(m))));
  assert.deepEqual(back, m);
});

test('food restores hunger and sprinting drains it', () => {
  const p = new Player();
  p.hunger = 8;
  p.saturation = 0;
  p.eat(ITEMS.get(I.BREAD).food);
  assert.equal(p.hunger, 13);
  assert.equal(p.saturation, 6);
  for (let i = 0; i < 40; i++) p.addExhaustion(1, false);
  assert.equal(p.saturation, 0);
  assert.equal(p.hunger, 9, '40 exhaustion = 6 saturation + 4 hunger');
  const c = new Player();
  c.addExhaustion(100, true);
  assert.equal(c.hunger, 20, 'no hunger in creative');
});

test('bodies step up slabs but not full blocks', () => {
  const w = flatWorld();
  w.setBlock(6, 61, 5, B.OAK_SLAB);
  w.setBlock(6, 61, 8, B.STONE);
  const walk = (z) => {
    const body = { pos: [4.5, 61, z + 0.5], vel: [0, 0, 0], hw: 0.3, h: 1.8 };
    let onGround = true;
    for (let i = 0; i < 60; i++) {
      body.vel[1] -= 32 / 60;
      const r = moveBody(w, body, 4 / 60, body.vel[1] / 60, 0, { stepHeight: 0.6, wasOnGround: onGround });
      onGround = r.onGround;
    }
    return body.pos;
  };
  const slab = walk(5);
  assert.ok(slab[0] > 7, `walked over the slab, x=${slab[0]}`);
  const wall = walk(8);
  assert.ok(wall[0] < 6, `blocked by the full block, x=${wall[0]}`);
});

test('every mob has a skin and sane stats', () => {
  const skins = mobSkins();
  assert.equal(skins.count, Object.keys(MOBS).length);
  assert.equal(skins.pixels.length, skins.count * 64 * 64 * 4);
  for (const [name, m] of Object.entries(MOBS)) {
    assert.ok(m.health > 0 && m.width > 0 && m.height > 0, name);
    assert.ok(m.parts.length >= 2, name);
    assert.ok(m.passive !== !!m.hostile, `${name} is either passive or hostile`);
  }
});
