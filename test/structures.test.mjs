import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B, I, BLOCKS, IS_SOLID } from '../src/blocks.js';
import { Chunk } from '../src/chunk.js';
import { WorldGenerator } from '../src/worldgen.js';
import { World } from '../src/world.js';
import { STRUCTURE_TYPES, rollLoot, LOOT_TABLES } from '../src/structures.js';
import { hashString } from '../src/noise.js';

const SEED = hashString('claude');
const CHESTS = new Set([B.CHEST_PX, B.CHEST_NX, B.CHEST_PZ, B.CHEST_NZ]);

// Generates every chunk a structure touches and returns them by key.
function chunksOf(gen, s, reverse = false) {
  const keys = [];
  for (let cz = Math.floor(s.bbox[2] / 16); cz <= Math.floor(s.bbox[5] / 16); cz++) {
    for (let cx = Math.floor(s.bbox[0] / 16); cx <= Math.floor(s.bbox[3] / 16); cx++) keys.push([cx, cz]);
  }
  if (reverse) keys.reverse();
  const out = new Map();
  for (const [cx, cz] of keys.slice(0, 80)) {
    const c = new Chunk(cx, cz);
    gen.generate(c);
    out.set(`${cx},${cz}`, c);
  }
  return out;
}

test('every structure type is found near spawn and generates the same whatever the chunk order', () => {
  for (const type of STRUCTURE_TYPES) {
    const g1 = new WorldGenerator(SEED), g2 = new WorldGenerator(SEED);
    const s = g1.structures.nearest(type, 0, 0);
    assert.ok(s, `${type} exists`);
    const a = chunksOf(g1, s), b = chunksOf(g2, g2.structures.nearest(type, 0, 0), true);
    for (const [k, c] of a) assert.deepEqual(c.blocks, b.get(k).blocks, `${type} chunk ${k}`);
  }
});

test('structure chests get the loot of their structure', () => {
  const gen = new WorldGenerator(SEED);
  const s = gen.structures.nearest('desert_pyramid', 0, 0);
  const chunks = chunksOf(gen, s);
  const found = [];
  for (const c of chunks.values()) {
    c.blocks.forEach((id, i) => {
      if (CHESTS.has(id)) found.push([c.cx * 16 + (i & 15), i >> 8, c.cz * 16 + ((i >> 4) & 15)]);
    });
  }
  assert.equal(found.length, 4, 'four treasure chests');
  for (const [x, y, z] of found) {
    assert.equal(gen.structures.lootAt(x, y, z), 'desert_pyramid');
    const loot = rollLoot('desert_pyramid', x, y, z);
    assert.deepEqual(loot, rollLoot('desert_pyramid', x, y, z), 'deterministic');
    assert.ok(loot.some(Boolean), 'not empty');
  }
  // The trap: a pressure plate above TNT.
  let plate = 0, tnt = 0;
  for (const c of chunks.values()) for (const id of c.blocks) { if (id === B.STONE_PRESSURE_PLATE) plate++; if (id === B.TNT) tnt++; }
  assert.equal(plate, 1);
  assert.equal(tnt, 9);
  assert.equal(IS_SOLID[B.STONE_PRESSURE_PLATE], 0, 'plates can be walked onto');
  for (const t of LOOT_TABLES) assert.ok(rollLoot(t, 1, 2, 3).every((sl) => !sl || (sl.count > 0 && (BLOCKS[sl.id] || sl.id >= 256))), t);
  assert.equal(rollLoot('igloo', 5, 5, 5)[13].id, I.GOLDEN_APPLE, 'igloo chests always hold a golden apple');
});

test('dungeons hold a spawner that the world keeps track of', () => {
  const w = new World({ seed: SEED });
  const S = w.generator.structures;
  let d = null;
  for (let r = 0; r < 12 && !d; r++) for (let cz = -r; cz <= r && !d; cz++) for (let cx = -r; cx <= r && !d; cx++) d = S.dungeon(cx, cz);
  assert.ok(d, 'a dungeon near spawn');
  const c = w.generateChunk(Math.floor(d.ox / 16), Math.floor(d.oz / 16));
  const sx = d.ox + (d.w >> 1), sz = d.oz + (d.d >> 1);
  assert.equal(c.blocks[((d.y + 1) << 8) | ((sz & 15) << 4) | (sx & 15)], B.SPAWNER);
  assert.ok(w.spawners.has(`${sx},${d.y + 1},${sz}`));
  assert.ok(['zombie', 'skeleton', 'spider'].includes(S.spawnerAt(sx, d.y + 1, sz)));
  assert.equal(S.lootAt(d.ox + 1, d.y + 1, d.oz + 1), 'dungeon');
});

test('mineshafts branch into corridor networks underground', () => {
  const gen = new WorldGenerator(SEED);
  const sizes = [];
  for (let rz = -2; rz <= 2; rz++) for (let rx = -2; rx <= 2; rx++) {
    const s = gen.structures.region('mineshaft', rx, rz);
    if (!s) continue;
    sizes.push(s.pieces.length);
    for (const p of s.pieces) if (p.kind === 'corridor') assert.ok(p.sy + 3 < gen.column(p.sx, p.sz).height, 'below the surface');
  }
  assert.ok(sizes.length > 3);
  assert.ok(Math.max(...sizes) >= 20, `largest mineshaft has ${Math.max(...sizes)} pieces`);
});
