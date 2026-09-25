// Right-click behaviour: using items on blocks, mobs and the air, and
// placing blocks (including two-block doors and beds and oriented blocks).
import { CHUNK_HEIGHT } from './constants.js';
import { B, I, BLOCKS, ITEMS, IS_SOLID, isBlockItem, orientedBlock } from './blocks.js';
import { newFurnace, newChest, growSapling } from './gameplay.js';

const WALL_TORCH_BY_FACE = [B.WALL_TORCH_PX, B.WALL_TORCH_NX, B.TORCH, null, B.WALL_TORCH_PZ, B.WALL_TORCH_NZ];
const LADDER_BY_FACE = [B.LADDER_PX, B.LADDER_NX, null, null, B.LADDER_PZ, B.LADDER_NZ];
const FACE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // facing index -> (dx, dz)

// The horizontal direction the player looks in: 0 +X, 1 -X, 2 +Z, 3 -Z.
export function lookFacing(p) {
  const d = p.lookDir();
  return Math.abs(d[0]) > Math.abs(d[2]) ? (d[0] > 0 ? 0 : 1) : (d[2] > 0 ? 2 : 3);
}

export function doorId(upper, open, facing) {
  return B.OAK_DOOR + upper * 8 + open * 4 + facing;
}

export function bedId(head, facing) {
  return B.BED + head * 4 + facing;
}

// The other half of a door or bed at (x, y, z), or null.
export function partnerOf(id, x, y, z) {
  const b = BLOCKS[id];
  if (b.door) return [x, y + (b.door.upper ? -1 : 1), z];
  if (b.bed) {
    const [dx, dz] = FACE_DIRS[b.bed.facing];
    const s = b.bed.head ? -1 : 1;
    return [x + dx * s, y, z + dz * s];
  }
  return null;
}

// Blocks that react to right-click even with an item in hand.
export function isInteractive(game, t, heldItem) {
  const b = BLOCKS[t.id];
  if (t.id === B.CRAFTING_TABLE || b.container || b.door || b.bed) return true;
  return t.id === B.TNT && heldItem?.id === I.FLINT_AND_STEEL;
}

// Using the held item without a block target (or when the block ignores it).
// Returns true if something happened.
export function useInAir(game) {
  const inv = game.inventory;
  const s = inv.selectedStack;
  const it = s ? ITEMS.get(s.id) : null;
  if (!it) return false;
  if (it.throwable) {
    throwItem(game, it.throwable);
    if (!game.creative) inv.take(inv.selected, 1);
    return true;
  }
  if (it.armor) {
    const slot = it.armor.slot;
    const worn = inv.armor[slot];
    inv.armor[slot] = { ...s, count: 1 };
    inv.slots[inv.selected] = worn;
    game.sound.equip?.();
    return true;
  }
  return false;
}

function throwItem(game, type) {
  const p = game.player;
  const eye = p.eye(), d = p.lookDir();
  const speed = type === 'ender_pearl' ? 22 : 24;
  game.entities.shoot(type, [eye[0] + d[0] * 0.4, eye[1] - 0.1 + d[1] * 0.4, eye[2] + d[2] * 0.4],
    [d[0] * speed + p.vel[0], d[1] * speed + 2 + p.vel[1] * 0.3, d[2] * speed + p.vel[2]], game.entities.localRef);
  game.sound.throw?.();
  game.swing = 1;
}

// Right-click on a block. Returns true if the click was used.
export function useOnBlock(game, t) {
  const w = game.world;
  const p = game.player;
  const inv = game.inventory;
  const s = inv.selectedStack;
  const it = s ? ITEMS.get(s.id) : null;
  const tb = BLOCKS[t.id];

  if (!p.sneaking || !it) {
    if (t.id === B.CRAFTING_TABLE) { game.openInventory('table'); return true; }
    if (tb.container) { game.openContainer(t.x, t.y, t.z); return true; }
    if (tb.door) { toggleDoor(game, t.x, t.y, t.z); return true; }
    if (tb.bed) { game.trySleep(t.x, t.y, t.z); return true; }
  }
  if (t.id === B.TNT && it?.id === I.FLINT_AND_STEEL) {
    game.igniteTNT(t.x, t.y, t.z, 4);
    game.damageHeld(1);
    game.swing = 1;
    return true;
  }
  if (!it) return false;
  const above = w.getBlock(t.x, t.y + 1, t.z);
  const nx = t.x + t.normal[0], ny = t.y + t.normal[1], nz = t.z + t.normal[2];

  if (it.id === I.FLINT_AND_STEEL && t.id === B.OBSIDIAN && game.lightPortal?.(nx, ny, nz)) {
    game.damageHeld(1);
    game.swing = 1;
    return true;
  }
  if (it.spawns) {
    game.entities.spawn(it.spawns, nx + 0.5, ny, nz + 0.5);
    if (!game.creative) inv.take(inv.selected, 1);
    game.swing = 1;
    return true;
  }
  if (it.tool?.type === 'hoe' && t.face === 2 && above === B.AIR && [B.GRASS, B.DIRT, B.DIRT_PATH].includes(t.id)) {
    w.setBlock(t.x, t.y, t.z, B.FARMLAND);
    game.sound.place(B.DIRT);
    game.damageHeld(1);
    game.swing = 1;
    return true;
  }
  if (it.tool?.type === 'shovel' && t.face !== 3 && above === B.AIR && t.id === B.GRASS) {
    w.setBlock(t.x, t.y, t.z, B.DIRT_PATH);
    game.sound.place(B.GRAVEL);
    game.damageHeld(1);
    game.swing = 1;
    return true;
  }
  if (it.plants && t.id === B.FARMLAND && t.face === 2 && above === B.AIR) {
    w.setBlock(t.x, t.y + 1, t.z, it.plants);
    if (!game.creative) inv.take(inv.selected, 1);
    game.sound.place(B.TALL_GRASS);
    game.swing = 1;
    return true;
  }
  if (it.fertilizer && fertilize(game, t.x, t.y, t.z)) {
    if (!game.creative) inv.take(inv.selected, 1);
    game.swing = 1;
    return true;
  }
  if (it.bucket !== undefined) return useBucket(game, it);
  if (it.places === 'door') return placeDoor(game, t);
  if (it.places === 'bed') return placeBed(game, t);
  if (isBlockItem(s.id)) return placeBlock(game, t, s.id);
  return useInAir(game);
}

// Buckets pick up and pour liquid sources (the target includes liquids).
function useBucket(game, it) {
  const w = game.world;
  const inv = game.inventory;
  const hit = game.liquidTarget();
  if (!hit) return false;
  if (it.bucket === 'empty') {
    if (hit.id !== B.WATER && hit.id !== B.LAVA) return false;
    w.setBlock(hit.x, hit.y, hit.z, B.AIR);
    const filled = hit.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET;
    if (!game.creative) {
      inv.take(inv.selected, 1);
      if (!inv.slots[inv.selected]) inv.slots[inv.selected] = { id: filled, count: 1 };
      else if (inv.add(filled, 1)) game.entities.dropItem({ id: filled, count: 1 }, ...game.player.eye());
    }
    game.sound.splash();
    return true;
  }
  // Pour into the cell in front of the hit face (or into a replaceable block).
  const liquid = BLOCKS[hit.id].liquid;
  let [x, y, z] = [hit.x, hit.y, hit.z];
  if (!liquid && !BLOCKS[hit.id].replaceable) { x += hit.normal[0]; y += hit.normal[1]; z += hit.normal[2]; }
  if (y < 1 || y >= CHUNK_HEIGHT) return false;
  const cur = w.getBlock(x, y, z);
  if (!BLOCKS[cur].replaceable) return false;
  w.setBlock(x, y, z, it.bucket);
  if (it.bucket === B.WATER) game.flowWater(x, y - 1, z);
  if (!game.creative) inv.slots[inv.selected] = { id: I.BUCKET, count: 1 };
  game.sound.splash();
  return true;
}

// Bone meal: grows crops and saplings, sprouts grass and flowers.
export function fertilize(game, x, y, z) {
  const w = game.world;
  const id = w.getBlock(x, y, z);
  const b = BLOCKS[id];
  if (b.crop !== undefined && b.crop < 3) {
    w.setBlock(x, y, z, Math.min(id + 2 + Math.floor(Math.random() * 2), id + (3 - b.crop)));
    game.particles.smoke(x + 0.5, y + 0.4, z + 0.5, 8, 0.4, 0.08, 0.05);
    return true;
  }
  if (b.sapling) {
    if (Math.random() < 0.5) growSapling(game, x, y, z);
    game.particles.smoke(x + 0.5, y + 0.4, z + 0.5, 8, 0.4, 0.08, 0.05);
    return true;
  }
  if (id === B.GRASS) {
    const flowers = [B.TALL_GRASS, B.TALL_GRASS, B.TALL_GRASS, B.DANDELION, B.POPPY, B.AZURE_BLUET, B.OXEYE_DAISY];
    for (let k = 0; k < 20; k++) {
      const gx = x + Math.round((Math.random() - 0.5) * 6), gz = z + Math.round((Math.random() - 0.5) * 6);
      if (w.getBlock(gx, y, gz) === B.GRASS && w.getBlock(gx, y + 1, gz) === B.AIR) {
        w.setBlock(gx, y + 1, gz, flowers[Math.floor(Math.random() * flowers.length)]);
      }
    }
    game.particles.smoke(x + 0.5, y + 1.2, z + 0.5, 10, 1.5, 0.08, 0.05);
    return true;
  }
  return false;
}

export function toggleDoor(game, x, y, z) {
  const w = game.world;
  const b = BLOCKS[w.getBlock(x, y, z)];
  if (!b.door) return;
  const { upper, open, facing } = b.door;
  const lowerY = upper ? y - 1 : y;
  w.setBlock(x, lowerY, z, doorId(0, open ? 0 : 1, facing));
  if (BLOCKS[w.getBlock(x, lowerY + 1, z)].door) w.setBlock(x, lowerY + 1, z, doorId(1, open ? 0 : 1, facing));
  game.sound.door?.(!open);
  game.swing = 1;
}

// Target cell for placing: the clicked block if it can be replaced, else the
// neighbour in front of the clicked face.
function placeCell(game, t) {
  if (BLOCKS[t.id].replaceable) return { x: t.x, y: t.y, z: t.z, face: 2 };
  return { x: t.x + t.normal[0], y: t.y + t.normal[1], z: t.z + t.normal[2], face: t.face };
}

function blockedByEntity(game, x, y, z) {
  const p = game.player;
  if (p.intersectsBlock(x, y, z)) return true;
  for (const e of game.entities.list) {
    if (e.kind !== 'mob') continue;
    if (Math.abs(e.pos[0] - x - 0.5) < e.hw + 0.5 && Math.abs(e.pos[2] - z - 0.5) < e.hw + 0.5 && e.pos[1] < y + 1 && e.pos[1] + e.h > y) return true;
  }
  for (const rp of game.net?.players?.values?.() || []) {
    if (Math.abs(rp.pos[0] - x - 0.5) < 0.8 && Math.abs(rp.pos[2] - z - 0.5) < 0.8 && rp.pos[1] < y + 1 && rp.pos[1] + 1.8 > y) return true;
  }
  return false;
}

function placeDoor(game, t) {
  const w = game.world;
  const c = placeCell(game, t);
  if (c.y + 1 >= CHUNK_HEIGHT) return false;
  if (!BLOCKS[w.getBlock(c.x, c.y, c.z)].replaceable || !BLOCKS[w.getBlock(c.x, c.y + 1, c.z)].replaceable) return false;
  if (!IS_SOLID[w.getBlock(c.x, c.y - 1, c.z)]) return false;
  if (blockedByEntity(game, c.x, c.y, c.z) || blockedByEntity(game, c.x, c.y + 1, c.z)) return false;
  const f = lookFacing(game.player);
  w.setBlock(c.x, c.y, c.z, doorId(0, 0, f));
  w.setBlock(c.x, c.y + 1, c.z, doorId(1, 0, f));
  finishPlace(game, B.PLANKS);
  return true;
}

function placeBed(game, t) {
  const w = game.world;
  const c = placeCell(game, t);
  const f = lookFacing(game.player);
  const [dx, dz] = FACE_DIRS[f];
  const hx = c.x + dx, hz = c.z + dz;
  if (!BLOCKS[w.getBlock(c.x, c.y, c.z)].replaceable || !BLOCKS[w.getBlock(hx, c.y, hz)].replaceable) return false;
  if (!IS_SOLID[w.getBlock(c.x, c.y - 1, c.z)] || !IS_SOLID[w.getBlock(hx, c.y - 1, hz)]) return false;
  if (blockedByEntity(game, c.x, c.y, c.z) || blockedByEntity(game, hx, c.y, hz)) return false;
  w.setBlock(c.x, c.y, c.z, bedId(0, f));
  w.setBlock(hx, c.y, hz, bedId(1, f));
  finishPlace(game, B.WHITE_WOOL);
  return true;
}

function finishPlace(game, soundId) {
  if (!game.creative) game.inventory.take(game.inventory.selected, 1);
  game.sound.place(soundId);
  game.swing = 1;
  game.placeAnim = 1;
}

function placeBlock(game, t, itemId) {
  const w = game.world;
  const p = game.player;
  let id = itemId;
  const c = placeCell(game, t);
  const { x, y, z } = c;
  let face = c.face;
  if (y < 0 || y >= CHUNK_HEIGHT) return false;
  if (!BLOCKS[w.getBlock(x, y, z)].replaceable) return false;
  const base = BLOCKS[id];
  if (base.shape === 'torch') {
    id = WALL_TORCH_BY_FACE[face];
    if (!id) return false;
  } else if (base.ladder) {
    id = LADDER_BY_FACE[face];
    if (!id) return false;
  } else if (id === B.LANTERN && face === 3) {
    id = B.HANGING_LANTERN;
  } else if (id === B.RAIL_NS) {
    const f = lookFacing(p);
    id = f < 2 ? B.RAIL_EW : B.RAIL_NS;
  } else if (base.facing >= 0 && base.baseId !== undefined) {
    const look = lookFacing(p);
    id = orientedBlock(base.baseId, base.shape === 'stairs' ? look : [1, 0, 3, 2][look]);
  }
  if (base.support === 'water') {
    // Lily pads float on water: the target is the water surface.
    if (w.getBlock(x, y - 1, z) !== B.WATER) return false;
  }
  if (!game.canStay(id, x, y, z)) return false;
  if (BLOCKS[id].solid && blockedByEntity(game, x, y, z)) return false;
  if (!w.setBlock(x, y, z, id)) return false;
  if (BLOCKS[id].container === 'furnace') w.setBlockEntity(x, y, z, newFurnace());
  else if (BLOCKS[id].container === 'chest') w.setBlockEntity(x, y, z, newChest());
  game.net?.sendBlockEntity?.(x, y, z);
  finishPlace(game, id);
  game.blockUpdates(x, y, z);
  return true;
}
