import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../src/blocks.js';
import { Chunk } from '../src/chunk.js';
import { NetherGenerator, LAVA_SEA } from '../src/nether.js';
import { World } from '../src/world.js';
import { Storage } from '../src/storage.js';

test('the Nether has a bedrock floor and roof, open caverns and a lava sea', () => {
  const gen = new NetherGenerator(99);
  let air = 0, lava = 0, rack = 0, glow = 0, quartz = 0;
  for (let cz = -2; cz < 2; cz++) {
    for (let cx = -2; cx < 2; cx++) {
      const c = new Chunk(cx, cz);
      gen.generate(c);
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          assert.equal(c.blocks[(0 << 8) | (z << 4) | x], B.BEDROCK);
          assert.equal(c.blocks[(127 << 8) | (z << 4) | x], B.BEDROCK);
        }
      }
      c.blocks.forEach((id, i) => {
        const y = i >> 8;
        if (id === B.AIR) { air++; assert.ok(y > LAVA_SEA, 'no air below the lava sea'); }
        if (id === B.LAVA) { lava++; assert.ok(y <= LAVA_SEA); }
        if (id === B.NETHERRACK) rack++;
        if (id === B.GLOWSTONE) glow++;
        if (id === B.NETHER_QUARTZ_ORE) quartz++;
        assert.notEqual(id, B.WATER, 'no water in the Nether');
      });
    }
  }
  const total = 16 * 16 * 16 * 128;
  assert.ok(air / total > 0.25, `caverns (${(air / total * 100).toFixed(1)}% air)`);
  assert.ok(rack / total > 0.3, 'netherrack');
  assert.ok(lava > 0 && glow > 0 && quartz > 0, `lava ${lava}, glowstone ${glow}, quartz ${quartz}`);
  // Same seed, same Nether.
  const a = new Chunk(3, 4), b = new Chunk(3, 4);
  new NetherGenerator(99).generate(a);
  gen.generate(b);
  assert.deepEqual(a.blocks, b.blocks);
});

test('worlds keep separate Overworld and Nether edits in saves', () => {
  const mem = new Map();
  const storage = new Storage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
  const meta = storage.createWorld({ name: 'Dims', seed: 5, mode: 'survival' });
  const over = new World({ seed: 5 });
  const nether = new World({ seed: 5, dimension: 'nether' });
  assert.equal(nether.dimension, 'nether');
  over.edits.set(1, new Map([[10, B.STONE]]));
  nether.edits.set(2, new Map([[20, B.GLOWSTONE]]));
  storage.saveWorld(meta, { player: {}, inventory: {}, ticks: 0, edits: over.edits, blockEntities: new Map(), netherEdits: nether.edits, netherBlockEntities: new Map(), dimension: 'nether' });
  const loaded = storage.loadWorld(meta.id);
  assert.equal(loaded.dimension, 'nether');
  assert.equal(loaded.edits.get(1)?.get(10), B.STONE);
  assert.equal(loaded.netherEdits.get(2)?.get(20), B.GLOWSTONE);
});
