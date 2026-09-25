// World simulation rules: furnaces, crop growth and explosions.
import { B, BLOCKS, SMELTING, SMELT_TIME, fuelTime } from './blocks.js';
import { maxStack, stack } from './inventory.js';

export function newFurnace() {
  return { type: 'furnace', slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 };
}

export function newChest() {
  return { type: 'chest', slots: new Array(27).fill(null) };
}

function furnaceVariant(facing, lit) {
  return (lit ? B.FURNACE_LIT_PX : B.FURNACE_PX) + facing;
}

export function tickFurnace(be, dt) {
  const [input, fuel, out] = be.slots;
  const result = input ? SMELTING.get(input.id) : undefined;
  const canSmelt = result !== undefined && (!out || (out.id === result && out.count < maxStack(result)));
  if (be.burn > 0) be.burn = Math.max(0, be.burn - dt);
  if (be.burn <= 0 && canSmelt && fuel && fuelTime(fuel.id) > 0) {
    be.burn = be.burnMax = fuelTime(fuel.id);
    fuel.count--;
    if (fuel.count <= 0) be.slots[1] = null;
  }
  if (be.burn > 0 && canSmelt) {
    be.cook += dt;
    if (be.cook >= SMELT_TIME) {
      be.cook = 0;
      input.count--;
      if (input.count <= 0) be.slots[0] = null;
      if (out) out.count++;
      else be.slots[2] = stack(result, 1);
    }
  } else {
    be.cook = Math.max(0, be.cook - dt * 2);
  }
}

export function tickFurnaces(game, dt) {
  const world = game.world;
  for (const [key, be] of world.blockEntities) {
    if (be.type !== 'furnace') continue;
    const [x, y, z] = key.split(',').map(Number);
    if (!world.isReady(x, z)) continue;
    tickFurnace(be, dt);
    const id = world.getBlock(x, y, z);
    const b = BLOCKS[id];
    if (b.container !== 'furnace') {
      world.removeBlockEntity(x, y, z);
      continue;
    }
    const lit = be.burn > 0;
    const want = furnaceVariant(b.facing, lit);
    if (want !== id) world.setBlock(x, y, z, want);
  }
}

// Crops grow a stage now and then when they have enough light.
export function tickCrops(game, dt) {
  const world = game.world;
  game.cropTimer = (game.cropTimer || 0) + dt;
  if (game.cropTimer < 1) return;
  game.cropTimer = 0;
  for (const [key, [x, y, z]] of world.crops) {
    if (!world.isReady(x, z)) continue;
    const id = world.getBlock(x, y, z);
    if (id < B.WHEAT_0 || id > B.WHEAT_3) {
      world.crops.delete(key);
      continue;
    }
    if (id === B.WHEAT_3 || Math.random() > 1 / 30) continue;
    if (Math.max(world.getSkyLight(x, y, z), world.getBlockLight(x, y, z)) < 9) continue;
    world.setBlock(x, y, z, id + 1);
  }
}

// Destroys blocks in a sphere and hurts everything nearby.
export function explode(game, x, y, z, power) {
  const world = game.world;
  const r = power;
  game.sound.explosion();
  game.particles.explosion(x, y, z, r);
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy, dz);
        if (d > r * (0.7 + Math.random() * 0.35)) continue;
        const bx = cx + dx, by = cy + dy, bz = cz + dz;
        const id = world.getBlock(bx, by, bz);
        if (id === B.AIR) continue;
        const b = BLOCKS[id];
        if (b.hardness < 0 || b.hardness >= 50 || b.liquid) continue;
        world.setBlock(bx, by, bz, B.AIR);
        if (id === B.TNT) game.entities.primeTNT(bx, by, bz, 0.4 + Math.random());
        if (b.container) world.removeBlockEntity(bx, by, bz);
      }
    }
  }
  const hurt = (pos, h) => {
    const d = Math.hypot(pos[0] - x, pos[1] + h / 2 - y, pos[2] - z);
    return d < r * 2 ? Math.ceil((1 - d / (r * 2)) * (power * 4 + 1)) : 0;
  };
  const p = game.player;
  const pd = hurt(p.pos, 1.8);
  if (pd > 0) {
    p.damage(pd, game.pendingEvents, game.creative);
    p.knockback(p.pos[0] - x, p.pos[2] - z, 8);
  }
  for (const e of game.entities.list) {
    if (e.kind !== 'mob' || e.dead) continue;
    const md = hurt(e.pos, e.h);
    if (md > 0) e.hurt(md, [x, y, z], game.entities);
  }
}
