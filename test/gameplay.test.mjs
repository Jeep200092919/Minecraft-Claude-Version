import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B, I } from '../src/blocks.js';
import { Inventory, clickSlot, matchRecipe, consumeCraftingGrid, stack } from '../src/inventory.js';
import { Storage, encodeEdits, decodeEdits, toBase64, fromBase64 } from '../src/storage.js';
import { chunkKey } from '../src/chunk.js';
import { bundle } from '../tools/build.mjs';

test('inventory merges stacks and respects stack limits', () => {
  const inv = new Inventory();
  assert.equal(inv.add(B.DIRT, 100), 0);
  assert.deepEqual(inv.slots[0], { id: B.DIRT, count: 64 });
  assert.deepEqual(inv.slots[1], { id: B.DIRT, count: 36 });
  inv.add(I.WOODEN_PICKAXE, 2);
  assert.equal(inv.slots[2].count, 1, 'tools do not stack');
  assert.equal(inv.slots[3].count, 1);
  assert.equal(inv.count(B.DIRT), 100);
  assert.equal(inv.take(1, 40), 36);
  assert.equal(inv.slots[1], null);
  const full = new Inventory();
  assert.equal(full.add(B.STONE, 64 * 36 + 5), 5, 'overflow is returned');
});

test('slot clicks pick up, place, split and swap like Minecraft', () => {
  const slots = [stack(B.DIRT, 10), null, stack(B.STONE, 5)];
  let cursor = clickSlot(slots, 0, null, 2); // right click: take half
  assert.deepEqual(cursor, { id: B.DIRT, count: 5 });
  assert.equal(slots[0].count, 5);
  cursor = clickSlot(slots, 1, cursor, 2); // right click: place one
  assert.equal(slots[1].count, 1);
  assert.equal(cursor.count, 4);
  cursor = clickSlot(slots, 0, cursor, 0); // left click: merge
  assert.equal(cursor, null);
  assert.equal(slots[0].count, 9);
  cursor = clickSlot(slots, 2, null, 0); // pick up stone
  cursor = clickSlot(slots, 0, cursor, 0); // swap with dirt
  assert.equal(slots[0].id, B.STONE);
  assert.equal(cursor.id, B.DIRT);
});

test('crafting recipes match shaped, mirrored and shapeless patterns', () => {
  assert.deepEqual(matchRecipe([B.LOG, 0, 0, 0], 2), { id: B.PLANKS, count: 4 });
  assert.deepEqual(matchRecipe([0, 0, 0, B.BIRCH_LOG], 2), { id: B.BIRCH_PLANKS, count: 4 });
  // Any kind of planks works for plank recipes, even mixed.
  assert.deepEqual(matchRecipe([B.BIRCH_PLANKS, 0, B.SPRUCE_PLANKS, 0], 2), { id: I.STICK, count: 4 });
  assert.deepEqual(matchRecipe([B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.PLANKS], 2), { id: B.CRAFTING_TABLE, count: 1 });
  assert.deepEqual(matchRecipe([0, I.CHARCOAL, 0, I.STICK], 2), { id: B.TORCH, count: 4 });
  assert.deepEqual(matchRecipe([I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT, 0, I.IRON_INGOT, 0, 0, 0], 3), { id: I.IRON_HELMET, count: 1 });
  assert.deepEqual(matchRecipe([0, I.STICK, I.STRING, I.STICK, 0, I.STRING, 0, I.STICK, I.STRING], 3), { id: I.BOW, count: 1 });
  assert.deepEqual(matchRecipe([B.PLANKS, 0, B.PLANKS, 0], 2), { id: I.STICK, count: 4 });
  assert.deepEqual(matchRecipe([B.PLANKS, B.PLANKS, B.PLANKS, B.PLANKS], 2), { id: B.CRAFTING_TABLE, count: 1 });
  assert.deepEqual(matchRecipe([0, I.COAL, 0, I.STICK], 2), { id: B.TORCH, count: 4 });
  const P = B.PLANKS, S = I.STICK, C = B.COBBLESTONE;
  assert.deepEqual(matchRecipe([P, P, P, 0, S, 0, 0, S, 0], 3), { id: I.WOODEN_PICKAXE, count: 1 });
  assert.deepEqual(matchRecipe([C, C, 0, C, S, 0, 0, S, 0], 3), { id: I.STONE_AXE, count: 1 });
  assert.deepEqual(matchRecipe([0, C, C, 0, S, C, 0, S, 0], 3), { id: I.STONE_AXE, count: 1 }, 'mirrored axe');
  assert.deepEqual(matchRecipe([0, I.IRON_INGOT, 0, 0, S, 0, 0, S, 0], 3), { id: I.IRON_SHOVEL, count: 1 });
  assert.equal(matchRecipe([I.COAL, B.IRON_ORE, 0, 0], 2), null, 'ores are smelted in a furnace, not crafted');
  const Cb = B.COBBLESTONE;
  assert.deepEqual(matchRecipe([Cb, Cb, Cb, Cb, 0, Cb, Cb, Cb, Cb], 3), { id: B.FURNACE, count: 1 });
  assert.deepEqual(matchRecipe([P, P, P, P, 0, P, P, P, P], 3), { id: B.CHEST, count: 1 });
  assert.deepEqual(matchRecipe([0, I.DIAMOND, 0, 0, I.DIAMOND, 0, 0, S, 0], 3), { id: I.DIAMOND_SWORD, count: 1 });
  assert.deepEqual(matchRecipe([I.WHEAT, I.WHEAT, I.WHEAT, 0, 0, 0, 0, 0, 0], 3), { id: I.BREAD, count: 1 });
  assert.equal(matchRecipe([P, P, P, 0, S, 0, 0, S, 0].slice(0, 4), 2), null);
  assert.equal(matchRecipe([B.DIRT, 0, 0, 0], 2), null);
  assert.equal(matchRecipe([0, 0, 0, 0], 2), null);
  // A pickaxe does not fit in the 2x2 grid.
  const grid = [stack(B.LOG, 3), null, null, null];
  consumeCraftingGrid(grid);
  assert.equal(grid[0].count, 2);
});

test('base64 and edit encoding round-trip', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100]) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 255);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  }
  const edits = new Map([
    [chunkKey(0, 0), new Map([[0, B.STONE], [32767, B.TORCH]])],
    [chunkKey(-5, 1200), new Map([[1234, B.AIR]])],
  ]);
  const back = decodeEdits(JSON.parse(JSON.stringify(encodeEdits(edits))));
  assert.deepEqual([...back.entries()].map(([k, m]) => [k, [...m]]), [...edits.entries()].map(([k, m]) => [k, [...m]]));
});

test('storage saves, lists, loads and deletes worlds', () => {
  const mem = new Map();
  const backend = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const s = new Storage(backend);
  const meta = s.createWorld({ name: 'Test', seed: 42, mode: 'survival' });
  const inv = new Inventory();
  inv.add(B.TORCH, 12);
  const edits = new Map([[chunkKey(1, 2), new Map([[5, B.GLASS]])]]);
  assert.ok(s.saveWorld(meta, { player: { pos: [1, 2, 3] }, inventory: inv.toJSON(), ticks: 777, edits }));
  assert.equal(s.listWorlds().length, 1);
  const loaded = s.loadWorld(meta.id);
  assert.equal(loaded.ticks, 777);
  assert.deepEqual(loaded.player.pos, [1, 2, 3]);
  assert.equal(Inventory.fromJSON(loaded.inventory).count(B.TORCH), 12);
  assert.equal(loaded.edits.get(chunkKey(1, 2)).get(5), B.GLASS);
  s.deleteWorld(meta.id);
  assert.equal(s.listWorlds().length, 0);
  assert.equal(s.loadWorld(meta.id), null);
});

test('the bundler produces a single valid script', async () => {
  const js = await bundle(new URL('../src/main.js', import.meta.url).pathname);
  assert.ok(!/^\s*(import|export)\s/m.test(js), 'no module syntax left');
  // Must parse as a classic script.
  assert.doesNotThrow(() => new Function(js));
});
