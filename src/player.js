// First-person player: movement, AABB collision, swimming, flying, health.
import { B, BLOCKS, IS_SOLID } from './blocks.js';
import { CHUNK_HEIGHT } from './constants.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
const HALF_W = PLAYER_WIDTH / 2;
const EYE = 1.62;
const SNEAK_EYE = 1.32;
const EPS = 1e-4;

const GRAVITY = 32;
const JUMP_VELOCITY = 9;
const TERMINAL_VELOCITY = 78;
const WALK_SPEED = 4.317;
const SPRINT_SPEED = 5.612;
const SNEAK_SPEED = 1.31;
const FLY_SPEED = 10.9;
const FLY_SPRINT_SPEED = 21.6;
const SWIM_SPEED = 2.2;
export const MAX_HEALTH = 20;
export const MAX_AIR = 15; // seconds of breath

export class Player {
  constructor() {
    this.pos = [0.5, 80, 0.5];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.inLava = false;
    this.headInWater = false;
    this.headInLava = false;
    this.sneaking = false;
    this.sprinting = false;
    this.collidedH = false;
    this.health = MAX_HEALTH;
    this.air = MAX_AIR;
    this.fallDistance = 0;
    this.walkDist = 0;
    this.nextStep = 1;
    this.hurtTime = 0;
    this.sinceDamage = 100;
    this.regenTimer = 0;
    this.hazardTimer = 0;
    this.drownTimer = 0;
    this.dead = false;
    this.eyeHeight = EYE;
    this.spawn = [0.5, 80, 0.5];
  }

  eye() {
    return [this.pos[0], this.pos[1] + this.eyeHeight, this.pos[2]];
  }

  aabb(pos = this.pos) {
    return [pos[0] - HALF_W, pos[1], pos[2] - HALF_W, pos[0] + HALF_W, pos[1] + PLAYER_HEIGHT, pos[2] + HALF_W];
  }

  // True if a block at (x, y, z) would intersect the player.
  intersectsBlock(x, y, z) {
    const b = this.aabb();
    return b[0] < x + 1 && b[3] > x && b[1] < y + 1 && b[4] > y && b[2] < z + 1 && b[5] > z;
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  static solidAt(world, x, y, z) {
    if (y < 0) return true;
    if (y >= CHUNK_HEIGHT) return false;
    if (!world.isReady(x, z)) return true; // never fall into unloaded terrain
    return IS_SOLID[world.getBlock(x, y, z)] === 1;
  }

  damage(amount, events, creative) {
    if (creative || this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtTime = 0.4;
    this.sinceDamage = 0;
    events.push({ type: 'hurt' });
    if (this.health <= 0) {
      this.dead = true;
      events.push({ type: 'death' });
    }
  }

  respawn() {
    this.pos = [...this.spawn];
    this.vel = [0, 0, 0];
    this.health = MAX_HEALTH;
    this.air = MAX_AIR;
    this.fallDistance = 0;
    this.dead = false;
    this.flying = false;
  }

  // Moves along one axis, stopping at solid blocks. Returns true on collision.
  moveAxis(world, axis, d) {
    if (d === 0) return false;
    this.pos[axis] += d;
    const b = this.aabb();
    const x0 = Math.floor(b[0]), x1 = Math.floor(b[3] - 1e-7);
    const y0 = Math.floor(b[1]), y1 = Math.floor(b[4] - 1e-7);
    const z0 = Math.floor(b[2]), z1 = Math.floor(b[5] - 1e-7);
    let limit = d > 0 ? Infinity : -Infinity;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!Player.solidAt(world, x, y, z)) continue;
          const c = axis === 0 ? x : axis === 1 ? y : z;
          limit = d > 0 ? Math.min(limit, c) : Math.max(limit, c + 1);
        }
      }
    }
    if (limit === Infinity || limit === -Infinity) return false;
    if (axis === 1) this.pos[1] = d > 0 ? limit - PLAYER_HEIGHT - EPS : limit + EPS;
    else this.pos[axis] = d > 0 ? limit - HALF_W - EPS : limit + HALF_W + EPS;
    this.vel[axis] = 0;
    return true;
  }

  // Sneaking keeps you from walking off edges.
  hasSupport(world, x, z) {
    const b = this.aabb([x, this.pos[1], z]);
    const y = Math.floor(this.pos[1] - 0.1);
    for (let bz = Math.floor(b[2]); bz <= Math.floor(b[5] - 1e-7); bz++) {
      for (let bx = Math.floor(b[0]); bx <= Math.floor(b[3] - 1e-7); bx++) {
        if (Player.solidAt(world, bx, y, bz)) return true;
      }
    }
    return false;
  }

  // Blocks overlapping the player's box (optionally grown by `grow`).
  touching(world, grow = 0) {
    const b = this.aabb();
    const ids = new Set();
    for (let y = Math.floor(b[1] - grow); y <= Math.floor(b[4] + grow - 1e-7); y++) {
      for (let z = Math.floor(b[2] - grow); z <= Math.floor(b[5] + grow - 1e-7); z++) {
        for (let x = Math.floor(b[0] - grow); x <= Math.floor(b[3] + grow - 1e-7); x++) {
          ids.add(world.getBlock(x, y, z));
        }
      }
    }
    return ids;
  }

  update(dt, input, world, creative, events) {
    if (this.dead) return;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.sinceDamage += dt;

    this.sneaking = !!input.sneak && !this.flying;
    const targetEye = this.sneaking ? SNEAK_EYE : EYE;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    let fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    let str = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (input.sprint && fwd > 0 && !this.sneaking) this.sprinting = true;
    if (fwd <= 0 || this.sneaking || (this.collidedH && !this.flying)) this.sprinting = false;

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    let wx = -sinY * fwd + cosY * str;
    let wz = -cosY * fwd - sinY * str;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }

    let speed;
    if (this.flying) speed = this.sprinting ? FLY_SPRINT_SPEED : FLY_SPEED;
    else if (this.inLava) speed = SWIM_SPEED * 0.5;
    else if (this.inWater) speed = SWIM_SPEED * (this.sprinting ? 1.4 : 1);
    else if (this.sneaking) speed = SNEAK_SPEED;
    else speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    const accel = this.flying ? 10 : this.onGround ? 16 : this.inWater || this.inLava ? 8 : 2.5;
    const k = Math.min(1, accel * dt);
    this.vel[0] += (wx * speed - this.vel[0]) * k;
    this.vel[2] += (wz * speed - this.vel[2]) * k;

    if (this.flying) {
      const vy = ((input.jump ? 1 : 0) - (input.sneak ? 1 : 0)) * 8;
      this.vel[1] += (vy - this.vel[1]) * Math.min(1, dt * 10);
    } else if (this.inWater || this.inLava) {
      const drag = this.inLava ? 0.5 : 1;
      if (input.jump) {
        this.vel[1] = Math.min(this.vel[1] + 18 * dt, 2.8 * drag);
        if (this.collidedH) this.vel[1] = 5.5 * drag; // climb out onto the shore
      } else {
        this.vel[1] = Math.max(this.vel[1] - 9 * dt, -2.4 * drag);
      }
    } else {
      this.vel[1] = Math.max(this.vel[1] - GRAVITY * dt, -TERMINAL_VELOCITY);
      if (input.jump && this.onGround) {
        this.vel[1] = JUMP_VELOCITY;
        if (this.sprinting) {
          this.vel[0] += -sinY * 1.6;
          this.vel[2] += -cosY * 1.6;
        }
      }
    }

    // Integrate with collision, in small sub-steps so fast falls never tunnel.
    let dx = this.vel[0] * dt, dy = this.vel[1] * dt, dz = this.vel[2] * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
    dx /= steps; dy /= steps; dz /= steps;
    const wasOnGround = this.onGround;
    const startY = this.pos[1];
    this.onGround = false;
    this.collidedH = false;
    for (let s = 0; s < steps; s++) {
      if (this.moveAxis(world, 1, dy)) {
        if (dy < 0) this.onGround = true;
        dy = 0;
      }
      if (wasOnGround && this.sneaking && !this.flying) {
        if (dx && !this.hasSupport(world, this.pos[0] + dx, this.pos[2])) { dx = 0; this.vel[0] = 0; }
        if (dz && !this.hasSupport(world, this.pos[0], this.pos[2] + dz)) { dz = 0; this.vel[2] = 0; }
      }
      if (this.moveAxis(world, 0, dx)) { this.collidedH = true; dx = 0; }
      if (this.moveAxis(world, 2, dz)) { this.collidedH = true; dz = 0; }
    }
    if (this.onGround && this.flying) this.flying = false;

    // Liquids.
    const touching = this.touching(world);
    const wasInWater = this.inWater;
    this.inWater = touching.has(B.WATER);
    this.inLava = touching.has(B.LAVA);
    const eye = this.eye();
    const eyeBlock = world.getBlock(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
    const eyeFrac = eye[1] - Math.floor(eye[1]);
    this.headInWater = eyeBlock === B.WATER && eyeFrac < 0.9;
    this.headInLava = eyeBlock === B.LAVA;
    if (this.inWater && !wasInWater && this.vel[1] < -4) events.push({ type: 'splash' });

    // Fall damage.
    const fell = startY - this.pos[1];
    if (this.flying || this.inWater || this.inLava || this.vel[1] > 0) this.fallDistance = 0;
    else if (fell > 0) this.fallDistance += fell;
    if (this.onGround && !wasOnGround) {
      if (this.fallDistance > 3) {
        this.damage(Math.ceil(this.fallDistance - 3), events, creative);
        events.push({ type: 'land', heavy: true });
      }
      this.fallDistance = 0;
    }

    // Footsteps.
    if (this.onGround && !this.flying) {
      this.walkDist += Math.hypot(this.vel[0], this.vel[2]) * dt;
      if (this.walkDist > this.nextStep) {
        this.nextStep = this.walkDist + (this.sprinting ? 2.1 : 1.7);
        const below = world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.2), Math.floor(this.pos[2]));
        if (below) events.push({ type: 'step', block: below });
      }
    }

    // Hazards: lava, cactus, drowning.
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      if (this.inLava) { this.damage(4, events, creative); this.hazardTimer = 0.5; }
      else if (this.touching(world, 0.05).has(B.CACTUS)) { this.damage(1, events, creative); this.hazardTimer = 0.5; }
    }
    if (this.headInWater && !creative) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownTimer -= dt;
        if (this.drownTimer <= 0) { this.damage(2, events, creative); this.drownTimer = 1; }
      }
    } else {
      this.air = Math.min(MAX_AIR, this.air + dt * 5);
      this.drownTimer = 0;
    }

    // Natural regeneration after a while without damage.
    if (this.health < MAX_HEALTH && this.sinceDamage > 5) {
      this.regenTimer += dt;
      if (this.regenTimer > 2.5) { this.health++; this.regenTimer = 0; }
    }
  }

  toJSON() {
    // Quitting from the death screen saves the respawned state.
    return {
      pos: this.dead ? this.spawn : this.pos,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.dead ? MAX_HEALTH : this.health,
      flying: this.flying,
      spawn: this.spawn,
    };
  }

  load(data) {
    if (!data) return;
    if (Array.isArray(data.pos) && data.pos.every(Number.isFinite)) this.pos = [...data.pos];
    if (Array.isArray(data.spawn) && data.spawn.every(Number.isFinite)) this.spawn = [...data.spawn];
    this.yaw = Number(data.yaw) || 0;
    this.pitch = Number(data.pitch) || 0;
    this.health = Math.max(1, Math.min(MAX_HEALTH, Number(data.health) || MAX_HEALTH));
    this.flying = !!data.flying;
  }
}

export function blockIsReplaceable(id) {
  return BLOCKS[id].replaceable;
}
