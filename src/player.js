// First-person player: movement, AABB collision, swimming, flying, health.
import { B, BLOCKS, IS_SOLID } from './blocks.js';
import { CHUNK_HEIGHT } from './constants.js';
import { moveBody } from './physics.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
const HALF_W = PLAYER_WIDTH / 2;
const EYE = 1.62;
const SNEAK_EYE = 1.32;

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
export const MAX_HUNGER = 20;

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
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.exhaustion = 0;
    this.starveTimer = 0;
    // Collision body used by physics.js.
    this.hw = HALF_W;
    this.h = PLAYER_HEIGHT;
  }

  addExhaustion(amount, creative) {
    if (creative) return;
    this.exhaustion += amount;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  eat(food) {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + food.saturation);
  }

  knockback(dx, dz, strength) {
    const l = Math.hypot(dx, dz) || 1;
    this.vel[0] += (dx / l) * strength;
    this.vel[2] += (dz / l) * strength;
    this.vel[1] = Math.max(this.vel[1], 5);
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
    this.addExhaustion(0.1, creative);
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
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = MAX_AIR;
    this.fallDistance = 0;
    this.dead = false;
    this.flying = false;
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
    const canSprint = creative || this.hunger > 6;
    if (input.sprint && fwd > 0 && !this.sneaking && canSprint) this.sprinting = true;
    if (fwd <= 0 || this.sneaking || !canSprint || (this.collidedH && !this.flying)) this.sprinting = false;

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
        this.addExhaustion(this.sprinting ? 0.2 : 0.05, creative);
        if (this.sprinting) {
          this.vel[0] += -sinY * 1.6;
          this.vel[2] += -cosY * 1.6;
        }
      }
    }

    // Integrate with collision (sub-stepped; steps up slabs and stairs).
    const wasOnGround = this.onGround;
    const startY = this.pos[1];
    const startX = this.pos[0], startZ = this.pos[2];
    const res = moveBody(world, this, this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, {
      stepHeight: this.flying ? 0 : 0.6,
      sneak: this.sneaking && !this.flying,
      wasOnGround,
    });
    this.onGround = res.onGround;
    this.collidedH = res.collidedH;
    if (this.sprinting && this.onGround) this.addExhaustion(Math.hypot(this.pos[0] - startX, this.pos[2] - startZ) * 0.1, creative);
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

    // Hunger: a full belly heals, an empty one hurts.
    if (!creative) {
      if (this.health < MAX_HEALTH && this.hunger >= 18) {
        this.regenTimer += dt;
        const period = this.hunger >= MAX_HUNGER && this.saturation > 0 ? 1 : 4;
        if (this.regenTimer >= period) {
          this.regenTimer = 0;
          this.health++;
          this.addExhaustion(6, creative);
        }
      } else this.regenTimer = 0;
      if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4) {
          this.starveTimer = 0;
          if (this.health > 1) this.damage(1, events, creative);
        }
      } else this.starveTimer = 0;
    }
  }

  toJSON() {
    // Quitting from the death screen saves the respawned state.
    return {
      pos: this.dead ? this.spawn : this.pos,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.dead ? MAX_HEALTH : this.health,
      hunger: this.dead ? MAX_HUNGER : this.hunger,
      saturation: this.saturation,
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
    this.hunger = Math.max(0, Math.min(MAX_HUNGER, Number.isFinite(data.hunger) ? data.hunger : MAX_HUNGER));
    this.saturation = Math.max(0, Math.min(this.hunger, Number(data.saturation) || 0));
    this.flying = !!data.flying;
  }
}

export function blockIsReplaceable(id) {
  return BLOCKS[id].replaceable;
}
