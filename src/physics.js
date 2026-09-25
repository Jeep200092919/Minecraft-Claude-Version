// Shared AABB-vs-voxel collision for the player and mobs.
// A body is { pos: [x, y, z] (feet centre), vel: [x, y, z], hw (half width), h (height) }.
import { BLOCKS, IS_SOLID } from './blocks.js';
import { CHUNK_HEIGHT } from './constants.js';

const EPS = 1e-4;
const FULL = [[0, 0, 0, 1, 1, 1]];

// Collision boxes (block-local, in blocks) of the cell, or null if passable.
export function cellBoxes(world, x, y, z) {
  if (y < 0) return FULL;
  if (y >= CHUNK_HEIGHT) return null;
  if (!world.isReady(x, z)) return FULL; // never fall into unloaded terrain
  const id = world.getBlock(x, y, z);
  if (!IS_SOLID[id]) return null;
  return BLOCKS[id].collision;
}

export function bodyBox(body, pos = body.pos) {
  return [pos[0] - body.hw, pos[1], pos[2] - body.hw, pos[0] + body.hw, pos[1] + body.h, pos[2] + body.hw];
}

// Moves along one axis, stopping at collision boxes. Returns true on collision.
export function moveAxis(world, body, axis, d) {
  if (d === 0) return false;
  body.pos[axis] += d;
  const b = bodyBox(body);
  const x0 = Math.floor(b[0]), x1 = Math.floor(b[3] - 1e-7);
  const y0 = Math.floor(b[1]) - 1, y1 = Math.floor(b[4] - 1e-7);
  const z0 = Math.floor(b[2]), z1 = Math.floor(b[5] - 1e-7);
  let limit = d > 0 ? Infinity : -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const boxes = cellBoxes(world, x, y, z);
        if (!boxes) continue;
        for (const c of boxes) {
          const bx0 = x + c[0], by0 = y + c[1], bz0 = z + c[2];
          const bx1 = x + c[3], by1 = y + c[4], bz1 = z + c[5];
          if (b[0] >= bx1 || b[3] <= bx0 || b[1] >= by1 || b[4] <= by0 || b[2] >= bz1 || b[5] <= bz0) continue;
          const lo = axis === 0 ? bx0 : axis === 1 ? by0 : bz0;
          const hi = axis === 0 ? bx1 : axis === 1 ? by1 : bz1;
          limit = d > 0 ? Math.min(limit, lo) : Math.max(limit, hi);
        }
      }
    }
  }
  if (limit === Infinity || limit === -Infinity) return false;
  if (axis === 1) body.pos[1] = d > 0 ? limit - body.h - EPS : limit + EPS;
  else body.pos[axis] = d > 0 ? limit - body.hw - EPS : limit + body.hw + EPS;
  body.vel[axis] = 0;
  return true;
}

// True if the body standing at (x, z) would have ground under its feet.
export function hasSupport(world, body, x, z) {
  const b = bodyBox(body, [x, body.pos[1], z]);
  const y = Math.floor(body.pos[1] - 0.05);
  const probe = body.pos[1] - 0.05;
  for (let bz = Math.floor(b[2]); bz <= Math.floor(b[5] - 1e-7); bz++) {
    for (let bx = Math.floor(b[0]); bx <= Math.floor(b[3] - 1e-7); bx++) {
      const boxes = cellBoxes(world, bx, y, bz);
      if (!boxes) continue;
      for (const c of boxes) {
        if (probe >= y + c[1] && probe <= y + c[4] &&
            b[0] < bx + c[3] && b[3] > bx + c[0] && b[2] < bz + c[5] && b[5] > bz + c[2]) return true;
      }
    }
  }
  return false;
}

// Integrates a displacement with collision in small sub-steps. Returns
// { onGround, collidedH }. `opts.stepHeight` lets the body walk up slabs,
// `opts.sneak` keeps it from walking off edges.
export function moveBody(world, body, dx, dy, dz, opts = {}) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
  dx /= steps; dy /= steps; dz /= steps;
  let onGround = false, collidedH = false;
  const step = opts.stepHeight || 0;
  for (let s = 0; s < steps; s++) {
    if (moveAxis(world, body, 1, dy)) {
      if (dy < 0) onGround = true;
      dy = 0;
    }
    if (opts.sneak && (onGround || opts.wasOnGround)) {
      if (dx && !hasSupport(world, body, body.pos[0] + dx, body.pos[2])) { dx = 0; body.vel[0] = 0; }
      if (dz && !hasSupport(world, body, body.pos[0], body.pos[2] + dz)) { dz = 0; body.vel[2] = 0; }
    }
    const before = [body.pos[0], body.pos[1], body.pos[2]];
    const vel = [body.vel[0], body.vel[2]];
    const hx = moveAxis(world, body, 0, dx);
    const hz = moveAxis(world, body, 2, dz);
    if ((hx || hz) && step > 0 && (onGround || opts.wasOnGround)) {
      // Try stepping up onto a low obstacle (slab, stair).
      const blocked = [body.pos[0], body.pos[1], body.pos[2]];
      body.pos = [...before];
      body.vel[0] = vel[0];
      body.vel[2] = vel[1];
      if (!moveAxis(world, body, 1, step)) {
        const sx = moveAxis(world, body, 0, dx);
        const sz = moveAxis(world, body, 2, dz);
        moveAxis(world, body, 1, -step - 0.01);
        const gained = Math.hypot(body.pos[0] - before[0], body.pos[2] - before[2]);
        const plain = Math.hypot(blocked[0] - before[0], blocked[2] - before[2]);
        if (gained > plain + 1e-3) {
          onGround = true;
          if (sx || sz) collidedH = true;
          continue;
        }
      }
      body.pos = blocked;
      if (hx) body.vel[0] = 0;
      if (hz) body.vel[2] = 0;
    }
    if (hx) { collidedH = true; dx = 0; }
    if (hz) { collidedH = true; dz = 0; }
  }
  return { onGround, collidedH };
}
