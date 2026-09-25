// Entities: mobs (animals, monsters, villagers) and primed TNT.
// Handles AI, physics, spawning/despawning, combat and render data.
import { B, I, BLOCKS, ITEMS, IS_SOLID, isBlockItem } from './blocks.js';
import { CHUNK_HEIGHT } from './constants.js';
import { MOBS, buildPartMesh } from './mobs.js';
import { moveBody, bodyBox } from './physics.js';
import { buildBlockMesh, buildExtrudedSprite, itemSpriteName } from './mesher.js';
import { compose, translation, rotationX, rotationY, rotationZ, scaling } from './math.js';
import { BIOME } from './worldgen.js';

const GRAVITY = 32;
const PASSIVE_TYPES = ['pig', 'cow', 'sheep', 'chicken'];
const PASSIVE_CAP = 14;
const HOSTILE_CAP = 10;

let nextId = 1;

class Mob {
  constructor(type, x, y, z) {
    this.id = nextId++;
    this.kind = 'mob';
    this.type = type;
    this.def = MOBS[type];
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.hw = this.def.width / 2;
    this.h = this.def.height;
    this.yaw = Math.random() * Math.PI * 2;
    this.headYaw = 0;
    this.headPitch = 0;
    this.health = this.def.health;
    this.hurtTime = 0;
    this.deathTime = -1;
    this.walkPhase = 0;
    this.walkAmount = 0;
    this.onGround = false;
    this.collidedH = false;
    this.inWater = false;
    this.wanderTimer = Math.random() * 3;
    this.wanderYaw = this.yaw;
    this.moving = false;
    this.panic = 0;
    this.attackCooldown = 0;
    this.fuse = 0;
    this.burn = 0;
    this.burnTick = 0;
    this.soundTimer = 4 + Math.random() * 10;
    this.home = null; // villagers stay near their village
  }

  get dead() {
    return this.deathTime >= 0;
  }

  hurt(amount, from, mgr, attacker = null) {
    if (this.dead || this.hurtTime > 0.35) return false;
    this.health -= amount;
    if (attacker) this.lastAttacker = attacker;
    this.hurtTime = 0.5;
    if (from) {
      const dx = this.pos[0] - from[0], dz = this.pos[2] - from[2];
      const l = Math.hypot(dx, dz) || 1;
      this.vel[0] += (dx / l) * 7;
      this.vel[2] += (dz / l) * 7;
      this.vel[1] = 6;
    }
    if (this.def.passive) this.panic = 4;
    mgr.game.sound.mob(this.def.sound, this.health <= 0 ? 'death' : 'hurt');
    if (this.health <= 0) {
      this.deathTime = 0;
      mgr.onMobDeath(this);
    }
    return true;
  }
}

class PrimedTNT {
  constructor(x, y, z, fuse = 4) {
    this.id = nextId++;
    this.kind = 'tnt';
    this.pos = [x + 0.5, y, z + 0.5];
    this.vel = [(Math.random() - 0.5) * 1.5, 3.5, (Math.random() - 0.5) * 1.5];
    this.hw = 0.49;
    this.h = 0.98;
    this.fuse = fuse;
    this.onGround = false;
  }
}

// An item lying in the world. It bobs and spins, merges with identical
// stacks nearby and is picked up when the player walks over it.
class ItemEntity {
  constructor(stack, x, y, z, vel) {
    this.id = nextId++;
    this.kind = 'item';
    this.stack = { ...stack };
    this.pos = [x, y, z];
    this.vel = vel || [(Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2];
    this.hw = 0.125;
    this.h = 0.25;
    this.age = 0;
    this.pickupDelay = 0.5;
    this.onGround = false;
    this.spin = Math.random() * Math.PI * 2;
  }
}

class XPOrb {
  constructor(value, x, y, z) {
    this.id = nextId++;
    this.kind = 'xp';
    this.value = value;
    this.pos = [x, y, z];
    this.vel = [(Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3];
    this.hw = 0.125;
    this.h = 0.25;
    this.age = 0;
    this.onGround = false;
  }
}

// Arrows and thrown items.
class Projectile {
  constructor(type, pos, vel, owner, damage) {
    this.id = nextId++;
    this.kind = 'projectile';
    this.type = type; // arrow | snowball | egg | ender_pearl
    this.pos = [...pos];
    this.vel = [...vel];
    this.owner = owner; // 'player', a player id, or a mob
    this.damage = damage;
    this.age = 0;
    this.stuck = false;
    this.hw = 0.1;
    this.h = 0.2;
  }
}

function rayBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b[a] || o[a] > b[a + 3]) return null;
      continue;
    }
    let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.meshes = new Map();
    this.passiveTimer = 1;
    this.hostileTimer = 2;
    this.villageTimer = 1;
  }

  clear() {
    this.list = [];
  }

  get world() {
    return this.game.world;
  }

  spawn(type, x, y, z) {
    if (!MOBS[type]) return null;
    const m = new Mob(type, x, y, z);
    this.list.push(m);
    return m;
  }

  // Drops an item stack into the world.
  dropItem(stack, x, y, z, vel) {
    if (!stack || stack.count <= 0) return null;
    const e = new ItemEntity(stack, x, y, z, vel);
    this.list.push(e);
    return e;
  }

  // Splits XP into orbs like the original (bigger values, fewer orbs).
  dropXP(amount, x, y, z) {
    while (amount > 0) {
      const v = amount >= 17 ? 17 : amount >= 7 ? 7 : amount >= 3 ? 3 : 1;
      amount -= v;
      this.list.push(new XPOrb(v, x, y, z));
    }
  }

  shoot(type, pos, vel, owner, damage = 0) {
    const p = new Projectile(type, pos, vel, owner, damage);
    this.list.push(p);
    return p;
  }

  primeTNT(x, y, z, fuse) {
    const t = new PrimedTNT(x, y, z, fuse);
    this.list.push(t);
    this.game.sound.hiss();
    return t;
  }

  // Nearest mob hit by a ray, or null.
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const e of this.list) {
      if (e.kind !== 'mob' || e.dead) continue;
      const t = rayBox(origin, dir, bodyBox(e));
      if (t !== null && t <= maxDist && (!best || t < best.t)) best = { entity: e, t };
    }
    return best;
  }

  // Loot and experience when a mob dies.
  onMobDeath(m) {
    const [x, y, z] = m.pos;
    for (const [id, min, max] of m.def.drops) {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (n > 0) this.dropItem({ id, count: n }, x, y + 0.5, z);
    }
    if (m.lastAttacker === 'player' || m.lastAttacker?.kind === 'player') {
      const xp = m.def.hostile ? 5 : m.def.villager ? 0 : 1 + Math.floor(Math.random() * 3);
      if (xp) this.dropXP(xp, x, y + 0.5, z);
    }
  }

  countNear(pred, pos, radius) {
    let n = 0;
    for (const e of this.list) {
      if (e.kind === 'mob' && pred(e) && Math.hypot(e.pos[0] - pos[0], e.pos[2] - pos[2]) < radius) n++;
    }
    return n;
  }

  // --- Spawning ---------------------------------------------------------------

  groundAt(x, z) {
    const w = this.world;
    if (!w.isReady(x, z)) return -1;
    for (let y = Math.min(CHUNK_HEIGHT - 2, w.heightAt(x, z)); y > 1; y--) {
      const id = w.getBlock(x, y, z);
      if (id === B.AIR || BLOCKS[id].replaceable && !BLOCKS[id].liquid) continue;
      return IS_SOLID[id] ? y : -1;
    }
    return -1;
  }

  canStandAt(x, y, z) {
    const w = this.world;
    const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z);
    return (a === B.AIR || BLOCKS[a].replaceable && !BLOCKS[a].liquid) && (b === B.AIR || BLOCKS[b].replaceable && !BLOCKS[b].liquid) && IS_SOLID[w.getBlock(x, y - 1, z)];
  }

  trySpawnPassive(p) {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 32;
    const x = Math.floor(p[0] + Math.cos(a) * d), z = Math.floor(p[2] + Math.sin(a) * d);
    const gy = this.groundAt(x, z);
    if (gy < 0 || w.getBlock(x, gy, z) !== B.GRASS && w.getBlock(x, gy, z) !== B.SNOWY_GRASS) return;
    if (w.getSkyLight(x, gy + 1, z) < 12) return;
    const col = w.generator.column(x, z);
    const pool = col.biome === BIOME.SNOWY ? ['sheep', 'cow'] : PASSIVE_TYPES;
    const type = pool[Math.floor(Math.random() * pool.length)];
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const sx = x + Math.floor(Math.random() * 5) - 2, sz = z + Math.floor(Math.random() * 5) - 2;
      const sy = this.groundAt(sx, sz);
      if (sy > 0 && this.canStandAt(sx, sy + 1, sz)) this.spawn(type, sx + 0.5, sy + 1, sz + 0.5);
    }
  }

  trySpawnHostile(p, day) {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
    const x = Math.floor(p[0] + Math.cos(a) * d), z = Math.floor(p[2] + Math.sin(a) * d);
    if (!w.isReady(x, z)) return;
    let y;
    if (Math.random() < 0.5 && day < 0.3) {
      y = this.groundAt(x, z) + 1; // surface at night
    } else {
      y = 6 + Math.floor(Math.random() * Math.max(1, w.heightAt(x, z) - 10)); // caves
    }
    if (y <= 1 || !this.canStandAt(x, y, z)) return;
    const sky = w.getSkyLight(x, y, z) * Math.max(0.1, day);
    if (Math.max(sky, w.getBlockLight(x, y, z)) > 6) return;
    if (Math.hypot(x - p[0], y - p[1], z - p[2]) < 20) return;
    this.spawn(Math.random() < 0.65 ? 'zombie' : 'creeper', x + 0.5, y, z + 0.5);
  }

  spawnVillagers(p) {
    const v = this.world.generator.nearestVillage?.(p[0], p[2]);
    if (!v || Math.hypot(v.x - p[0], v.z - p[2]) > 80) return;
    const have = this.list.filter((e) => e.kind === 'mob' && e.type === 'villager' && e.home && e.home[0] === v.x && e.home[1] === v.z).length;
    if (have >= 4) return;
    const x = v.x + Math.floor(Math.random() * 16) - 8, z = v.z + Math.floor(Math.random() * 16) - 8;
    const gy = this.groundAt(x, z);
    if (gy > 0 && this.canStandAt(x, gy + 1, z)) {
      const m = this.spawn('villager', x + 0.5, gy + 1, z + 0.5);
      m.home = [v.x, v.z];
    }
  }

  // --- Update -------------------------------------------------------------------

  update(dt, sky) {
    const game = this.game;
    const player = game.player;
    const p = player.pos;
    this.passiveTimer -= dt;
    if (this.passiveTimer <= 0) {
      this.passiveTimer = 2.5;
      if (this.countNear((e) => e.def.passive && !e.def.villager, p, 96) < PASSIVE_CAP) this.trySpawnPassive(p);
    }
    this.hostileTimer -= dt;
    if (this.hostileTimer <= 0) {
      this.hostileTimer = 1.2;
      if (this.countNear((e) => e.def.hostile, p, 96) < HOSTILE_CAP) this.trySpawnHostile(p, sky.day);
    }
    this.villageTimer -= dt;
    if (this.villageTimer <= 0) {
      this.villageTimer = 3;
      this.spawnVillagers(p);
    }

    for (const e of this.list) {
      if (e.kind === 'tnt') this.updateTNT(e, dt);
      else if (e.kind === 'item') this.updateItem(e, dt);
      else if (e.kind === 'xp') this.updateXP(e, dt);
      else if (e.kind === 'projectile') this.updateProjectile(e, dt);
      else this.updateMob(e, dt, sky);
    }
    // Remove finished / far away entities.
    this.list = this.list.filter((e) => {
      if (e.removed) return false;
      const dist = Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]);
      if (e.kind === 'mob' && dist > (e.def.hostile ? 100 : 140) && !e.persistent) return false;
      if (!this.world.isReady(e.pos[0], e.pos[2])) return false;
      return true;
    });
  }

  updateItem(e, dt) {
    const game = this.game;
    const player = game.player;
    e.age += dt;
    e.spin += dt * 1.6;
    if (e.age > 300) { e.removed = true; return; }
    const w = this.world;
    const feet = w.getBlock(Math.floor(e.pos[0]), Math.floor(e.pos[1] + 0.1), Math.floor(e.pos[2]));
    if (feet === B.WATER) e.vel[1] = Math.min(e.vel[1] + 20 * dt, 1.2);
    else e.vel[1] = Math.max(e.vel[1] - GRAVITY * 0.7 * dt, -30);
    const damp = Math.pow(e.onGround ? 0.02 : 0.6, dt);
    e.vel[0] *= damp; e.vel[2] *= damp;
    // Pulled towards a nearby player once it can be picked up.
    const dx = player.pos[0] - e.pos[0], dy = player.pos[1] + 0.6 - e.pos[1], dz = player.pos[2] - e.pos[2];
    const d = Math.hypot(dx, dy, dz);
    const alive = !player.dead && game.state !== 'dead';
    if (alive && e.age > e.pickupDelay && d < 1.8) {
      const pull = 10 * dt / Math.max(0.3, d);
      e.vel[0] += dx * pull; e.vel[1] += dy * pull; e.vel[2] += dz * pull;
      if (d < 0.8 && game.pickupItem(e)) return;
    }
    const res = moveBody(w, e, e.vel[0] * dt, e.vel[1] * dt, e.vel[2] * dt);
    e.onGround = res.onGround;
    // Merge with an identical stack nearby now and then.
    if (e.onGround && Math.floor(e.age * 4) !== Math.floor((e.age - dt) * 4)) {
      const max = ITEMS.get(e.stack.id)?.maxStack ?? 64;
      for (const o of this.list) {
        if (o === e || o.kind !== 'item' || o.removed || o.stack.id !== e.stack.id || o.stack.dmg || e.stack.dmg) continue;
        if (Math.hypot(o.pos[0] - e.pos[0], o.pos[1] - e.pos[1], o.pos[2] - e.pos[2]) > 1) continue;
        if (o.stack.count + e.stack.count > max) continue;
        e.stack.count += o.stack.count;
        e.age = Math.min(e.age, o.age);
        o.removed = true;
      }
    }
  }

  updateXP(e, dt) {
    const game = this.game;
    const player = game.player;
    e.age += dt;
    if (e.age > 300) { e.removed = true; return; }
    e.vel[1] = Math.max(e.vel[1] - GRAVITY * 0.5 * dt, -20);
    const dx = player.pos[0] - e.pos[0], dy = player.pos[1] + 0.8 - e.pos[1], dz = player.pos[2] - e.pos[2];
    const d = Math.hypot(dx, dy, dz);
    if (!player.dead && e.age > 0.4 && d < 7) {
      const pull = (1 - d / 7) * 40 * dt / Math.max(0.3, d);
      e.vel[0] += dx * pull; e.vel[1] += dy * pull; e.vel[2] += dz * pull;
      if (d < 0.9) { e.removed = true; game.gainXP(e.value); return; }
    }
    const damp = Math.pow(0.4, dt);
    e.vel[0] *= damp; e.vel[2] *= damp;
    moveBody(this.world, e, e.vel[0] * dt, e.vel[1] * dt, e.vel[2] * dt);
  }

  updateProjectile(p, dt) {
    const game = this.game;
    p.age += dt;
    if (p.stuck) {
      if (p.age > 60) p.removed = true;
      // Stuck arrows can be picked back up.
      const pl = game.player;
      if (p.type === 'arrow' && p.pickup && Math.hypot(pl.pos[0] - p.pos[0], pl.pos[1] + 0.6 - p.pos[1], pl.pos[2] - p.pos[2]) < 1.2) {
        if (game.pickupItem({ stack: { id: I.ARROW, count: 1 }, removed: false })) p.removed = true;
      }
      return;
    }
    if (p.age > 30) { p.removed = true; return; }
    const g = p.type === 'arrow' ? 20 : 12;
    p.vel[1] -= g * dt;
    const drag = Math.pow(0.99, dt * 20);
    p.vel[0] *= drag; p.vel[1] *= drag; p.vel[2] *= drag;
    const speed = Math.hypot(...p.vel);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
    const sdt = dt / steps;
    for (let i = 0; i < steps && !p.removed && !p.stuck; i++) {
      const next = [p.pos[0] + p.vel[0] * sdt, p.pos[1] + p.vel[1] * sdt, p.pos[2] + p.vel[2] * sdt];
      // Entities first: mobs, then the player (for mob-fired arrows).
      const dir = [p.vel[0] / speed, p.vel[1] / speed, p.vel[2] / speed];
      const hit = this.raycast(p.pos, dir, speed * sdt + 0.3);
      if (hit && hit.entity !== p.owner && p.age > 0.05) {
        this.projectileHitMob(p, hit.entity);
        return;
      }
      if (p.owner && p.owner.kind === 'mob') {
        const pl = game.player;
        const b = [pl.pos[0] - 0.3, pl.pos[1], pl.pos[2] - 0.3, pl.pos[0] + 0.3, pl.pos[1] + 1.8, pl.pos[2] + 0.3];
        const t = rayBox(p.pos, dir, b);
        if (t !== null && t <= speed * sdt + 0.2) {
          game.projectileHitPlayer(p);
          p.removed = true;
          return;
        }
      }
      const bx = Math.floor(next[0]), by = Math.floor(next[1]), bz = Math.floor(next[2]);
      const id = this.world.getBlock(bx, by, bz);
      if (IS_SOLID[id] || id === B.LAVA) {
        this.projectileHitBlock(p, next);
        return;
      }
      p.pos = next;
    }
  }

  projectileHitMob(p, mob) {
    const game = this.game;
    if (p.type === 'arrow') {
      mob.hurt(p.damage, [p.pos[0] - p.vel[0], p.pos[1], p.pos[2] - p.vel[2]], this, p.owner);
      p.removed = true;
    } else {
      if (p.type === 'snowball') mob.hurt(mob.type === 'blaze' ? 3 : 0.01, p.pos, this, p.owner);
      this.projectileBurst(p);
    }
    if (p.owner === 'player') game.sound.hit?.();
  }

  projectileHitBlock(p, next) {
    if (p.type === 'arrow') {
      p.stuck = true;
      p.age = 0;
      p.pos = [p.pos[0] + (next[0] - p.pos[0]) * 0.6, p.pos[1] + (next[1] - p.pos[1]) * 0.6, p.pos[2] + (next[2] - p.pos[2]) * 0.6];
      this.game.sound.arrowHit?.();
      return;
    }
    this.projectileBurst(p);
  }

  // Snowballs, eggs and pearls break on impact.
  projectileBurst(p) {
    const game = this.game;
    p.removed = true;
    game.particles.smoke(p.pos[0], p.pos[1], p.pos[2], 6, 0.15, 0.08, p.type === 'ender_pearl' ? 0.9 : 0.05);
    if (p.type === 'egg' && Math.random() < 0.125) {
      const m = this.spawn('chicken', p.pos[0], p.pos[1], p.pos[2]);
      if (m) m.baby = 60;
    } else if (p.type === 'ender_pearl' && p.owner === 'player') {
      game.teleportPlayer(p.pos[0], Math.floor(p.pos[1]) + 0.01, p.pos[2]);
    }
  }

  updateTNT(t, dt) {
    t.fuse -= dt;
    t.vel[1] = Math.max(t.vel[1] - GRAVITY * dt, -40);
    t.vel[0] *= Math.pow(0.1, dt);
    t.vel[2] *= Math.pow(0.1, dt);
    moveBody(this.world, t, t.vel[0] * dt, t.vel[1] * dt, t.vel[2] * dt);
    if (t.fuse <= 0) {
      t.removed = true;
      this.game.explode(t.pos[0], t.pos[1] + 0.5, t.pos[2], 4);
    }
  }

  updateMob(m, dt, sky) {
    const game = this.game;
    const world = this.world;
    const player = game.player;
    const def = m.def;
    if (m.dead) {
      m.deathTime += dt;
      if (m.deathTime > 0.9) {
        m.removed = true;
        game.particles.poof(m.pos[0], m.pos[1] + m.h / 2, m.pos[2]);
      }
      m.vel[1] = Math.max(m.vel[1] - GRAVITY * dt, -40);
      moveBody(world, m, 0, m.vel[1] * dt, 0);
      return;
    }
    m.hurtTime = Math.max(0, m.hurtTime - dt);
    m.attackCooldown -= dt;
    m.panic = Math.max(0, m.panic - dt);

    const dx = player.pos[0] - m.pos[0], dz = player.pos[2] - m.pos[2];
    const dy = player.pos[1] - m.pos[1];
    const dist = Math.hypot(dx, dz);
    const playerTarget = !player.dead && !game.creative && game.state !== 'dead';

    let targetYaw = m.yaw;
    let speed = 0;
    // --- AI
    if (def.hostile && playerTarget && dist < 24 && Math.abs(dy) < 12) {
      targetYaw = Math.atan2(-dx, -dz);
      speed = def.speed;
      if (def.explodes) {
        if (dist < 3) {
          if (m.fuse === 0) game.sound.hiss();
          m.fuse += dt;
          speed = 0;
          if (m.fuse >= 1.5) {
            m.removed = true;
            game.explode(m.pos[0], m.pos[1] + 1, m.pos[2], 3);
            return;
          }
        } else if (dist > 6) m.fuse = Math.max(0, m.fuse - dt);
      } else if (dist < 1.3 && Math.abs(dy) < 1.5 && m.attackCooldown <= 0) {
        m.attackCooldown = 1;
        player.damage(def.attack, game.pendingEvents, game.creative);
        player.knockback(dx, dz, 6);
      }
    } else if (m.panic > 0) {
      targetYaw = Math.atan2(dx, dz); // away from the player
      speed = def.speed * 1.8;
    } else {
      m.wanderTimer -= dt;
      if (m.wanderTimer <= 0) {
        m.moving = !m.moving && Math.random() < 0.7;
        m.wanderTimer = m.moving ? 2 + Math.random() * 3 : 2 + Math.random() * 5;
        m.wanderYaw = Math.random() * Math.PI * 2;
        if (m.home && Math.hypot(m.pos[0] - m.home[0], m.pos[2] - m.home[1]) > 14) {
          m.wanderYaw = Math.atan2(-(m.home[0] - m.pos[0]), -(m.home[1] - m.pos[2]));
          m.moving = true;
        }
      }
      if (m.moving) {
        targetYaw = m.wanderYaw;
        speed = def.speed * 0.6;
      }
    }
    if (def.explodes && m.fuse > 0 && dist >= 3) m.fuse = Math.max(0, m.fuse - dt * 0.5);

    // Don't walk off cliffs while wandering.
    if (speed > 0 && !def.hostile && m.panic <= 0) {
      const ax = m.pos[0] - Math.sin(targetYaw) * 1.2, az = m.pos[2] - Math.cos(targetYaw) * 1.2;
      let drop = 0;
      while (drop < 4 && !IS_SOLID[world.getBlock(Math.floor(ax), Math.floor(m.pos[1]) - 1 - drop, Math.floor(az))]) drop++;
      if (drop >= 3) { speed = 0; m.wanderTimer = 0; }
    }

    // Turn smoothly.
    let dyaw = ((targetYaw - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    m.yaw += dyaw * Math.min(1, dt * 6);
    // Look at the player when close.
    const lookYaw = dist < 8 ? Math.atan2(-dx, -dz) : m.yaw;
    let hy = ((lookYaw - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    hy = Math.max(-1, Math.min(1, hy));
    m.headYaw += (hy - m.headYaw) * Math.min(1, dt * 5);
    const eyeY = m.pos[1] + m.h * 0.85;
    const lookPitch = dist < 8 ? Math.atan2(player.pos[1] + 1.5 - eyeY, Math.max(dist, 0.5)) : 0;
    m.headPitch += (Math.max(-0.7, Math.min(0.7, lookPitch)) - m.headPitch) * Math.min(1, dt * 5);

    // Physics.
    const wx = -Math.sin(m.yaw) * speed, wz = -Math.cos(m.yaw) * speed;
    const k = Math.min(1, (m.onGround ? 10 : 2) * dt);
    m.vel[0] += (wx - m.vel[0]) * k;
    m.vel[2] += (wz - m.vel[2]) * k;
    const ix = Math.floor(m.pos[0]), iz = Math.floor(m.pos[2]);
    const feet = world.getBlock(ix, Math.floor(m.pos[1] + 0.2), iz);
    m.inWater = feet === B.WATER || feet === B.LAVA;
    if (m.inWater) {
      m.vel[1] = Math.min(m.vel[1] + 24 * dt, 2.2);
    } else {
      m.vel[1] = Math.max(m.vel[1] - GRAVITY * dt, def.slowFall ? -3 : -60);
    }
    if (m.collidedH && m.onGround && speed > 0) m.vel[1] = 8.4;
    const res = moveBody(world, m, m.vel[0] * dt, m.vel[1] * dt, m.vel[2] * dt, { stepHeight: 0.6, wasOnGround: m.onGround });
    m.onGround = res.onGround;
    m.collidedH = res.collidedH;
    const hs = Math.hypot(m.vel[0], m.vel[2]);
    m.walkAmount += (Math.min(1, hs / 2) - m.walkAmount) * Math.min(1, dt * 8);
    m.walkPhase += hs * dt * 4.2;

    // Hazards.
    if (feet === B.LAVA) this.burnMob(m, dt, 4);
    if (def.burnsInDay && sky.day > 0.6 && (sky.rain || 0) < 0.3 && !m.inWater && world.getSkyLight(ix, Math.floor(eyeY), iz) >= 14) {
      m.burn = 1;
    } else m.burn = Math.max(0, m.burn - dt);
    if (m.burn > 0) this.burnMob(m, dt, 1);

    // Keep mobs from overlapping the player.
    if (dist < m.hw + 0.3 && Math.abs(dy) < m.h) {
      const push = (m.hw + 0.3 - dist) * 4;
      m.vel[0] -= (dx / (dist || 1)) * push;
      m.vel[2] -= (dz / (dist || 1)) * push;
    }

    // Shorn sheep regrow their wool by eating grass.
    if (m.sheared && m.onGround && (m.woolTimer -= dt) <= 0) {
      const gx = Math.floor(m.pos[0]), gy = Math.floor(m.pos[1] - 0.5), gz = Math.floor(m.pos[2]);
      if (world.getBlock(gx, gy, gz) === B.GRASS) {
        game.setBlockSynced(gx, gy, gz, B.DIRT);
        m.sheared = false;
      } else m.woolTimer = 5;
    }
    m.soundTimer -= dt;
    if (m.soundTimer <= 0) {
      m.soundTimer = 6 + Math.random() * 12;
      if (dist < 16) game.sound.mob(def.sound, 'idle');
    }
  }

  burnMob(m, dt, dps) {
    m.burnTick -= dt;
    if (m.burnTick <= 0) {
      m.burnTick = 1;
      this.game.particles.smoke(m.pos[0], m.pos[1] + m.h, m.pos[2], 3, 0.4, 0.18, 0.85);
      m.hurt(dps, null, this);
    }
  }

  // --- Rendering -------------------------------------------------------------------

  meshesFor(type) {
    if (!this.meshes.has(type)) {
      const renderer = this.game.renderer;
      let parts;
      if (type === 'tnt') {
        const b = buildBlockMesh(B.TNT);
        parts = [{ kind: 'static', mesh: renderer.createMesh(b.data, b.quads), pivot: [0, 0, 0], block: true }];
      } else {
        const def = MOBS[type];
        parts = def.parts.map((p) => {
          const built = buildPartMesh(p, def.skin);
          return { kind: p.kind, mesh: renderer.createMesh(built.data, built.quads), pivot: p.pivot || [0, 0, 0], fleece: !!p.fleece };
        });
      }
      this.meshes.set(type, parts);
    }
    return this.meshes.get(type);
  }

  // Mesh for an item lying on the ground or flying: a small cube for blocks
  // that are held as blocks, an extruded sprite otherwise.
  itemMesh(id) {
    const key = `item:${id}`;
    if (!this.meshes.has(key)) {
      const renderer = this.game.renderer;
      let entry;
      if (isBlockItem(id) && BLOCKS[id].heldAsBlock) {
        const b = buildBlockMesh(id);
        entry = { mesh: renderer.createMesh(b.data, b.quads), texture: 'blocks', uvScale: 1 / 16, block: true };
      } else {
        const b = buildExtrudedSprite(itemSpriteName(id));
        entry = { mesh: renderer.createMesh(b.data, b.quads), texture: b.atlas, uvScale: b.uvScale, block: false };
      }
      this.meshes.set(key, entry);
    }
    return this.meshes.get(key);
  }

  renderList(time) {
    const out = [];
    const world = this.world;
    for (const e of this.list) {
      const light = [
        world.getSkyLight(Math.floor(e.pos[0]), Math.floor(e.pos[1] + 0.5), Math.floor(e.pos[2])),
        world.getBlockLight(Math.floor(e.pos[0]), Math.floor(e.pos[1] + 0.5), Math.floor(e.pos[2])),
      ];
      if (e.kind === 'item') {
        const m = this.itemMesh(e.stack.id);
        const bob = Math.sin(e.age * 2.6 + e.id) * 0.06 + 0.14;
        const copies = e.stack.count > 32 ? 3 : e.stack.count > 1 ? 2 : 1;
        const parts = [];
        for (let k = 0; k < copies; k++) {
          const off = k * 0.07;
          parts.push({
            mesh: m.mesh,
            matrix: m.block
              ? compose(translation(off, bob + off * 0.5, -off), rotationY(e.spin), scaling(0.25), translation(-0.5, 0, -0.5))
              : compose(translation(off, bob + off * 0.5, 0), rotationY(e.spin), scaling(0.45), translation(-0.5, 0, -0.5)),
          });
        }
        out.push({ parts, pos: e.pos, light, overlay: [0, 0, 0, 0], texture: m.texture, uvScale: m.uvScale });
        continue;
      }
      if (e.kind === 'xp') {
        const m = this.itemMesh(I.SLIMEBALL);
        const pulse = 0.18 + e.value * 0.006 + Math.sin(time * 8 + e.id) * 0.02;
        out.push({
          parts: [{ mesh: m.mesh, matrix: compose(translation(0, 0.1, 0), rotationY(time * 3 + e.id), scaling(pulse), translation(-0.5, 0, -0.5)) }],
          pos: e.pos, light: [15, 15], overlay: [0.7, 1, 0.2, 0.55], texture: m.texture, uvScale: m.uvScale,
        });
        continue;
      }
      if (e.kind === 'projectile') {
        const itemId = { arrow: I.ARROW, snowball: I.SNOWBALL, egg: I.EGG, ender_pearl: I.ENDER_PEARL }[e.type];
        const m = this.itemMesh(itemId);
        let matrix;
        if (e.type === 'arrow') {
          // Point the sprite's diagonal (bottom-left to top-right) along the flight direction.
          const v = e.stuck ? e.lastVel || [1, 0, 0] : e.vel;
          e.lastVel = e.stuck ? e.lastVel : [...v];
          const yaw = Math.atan2(v[0], v[2]);
          const pitch = Math.atan2(v[1], Math.hypot(v[0], v[2]));
          matrix = compose(rotationY(yaw - Math.PI / 2), rotationZ(pitch), rotationZ(-Math.PI / 4), scaling(0.7), translation(-0.85, -0.15, -0.5));
        } else {
          matrix = compose(rotationY(time * 6), scaling(0.35), translation(-0.5, -0.5, -0.5));
        }
        out.push({ parts: [{ mesh: m.mesh, matrix }], pos: e.pos, light, overlay: [0, 0, 0, 0], texture: m.texture, uvScale: m.uvScale });
        continue;
      }
      if (e.kind === 'tnt') {
        const flash = Math.floor(e.fuse * 5) % 2 === 0 ? 0.55 : 0;
        const sc = 1 + Math.max(0, 0.6 - e.fuse) * 0.3;
        const parts = this.meshesFor('tnt').map((p) => ({
          mesh: p.mesh,
          matrix: compose(scaling(sc), translation(-0.5, 0, -0.5)),
        }));
        out.push({ parts, pos: e.pos, light, overlay: [1, 1, 1, flash], texture: 'blocks' });
        continue;
      }
      const parts = this.meshesFor(e.type);
      const base = [rotationY(e.yaw + Math.PI)];
      if (e.dead) base.push(rotationZ(Math.min(1, e.deathTime / 0.5) * Math.PI / 2));
      if (e.def.explodes && e.fuse > 0) base.push(scaling(1 + e.fuse * 0.12));
      const swing = Math.sin(e.walkPhase) * 0.7 * e.walkAmount;
      const out2 = parts.filter((p) => !(p.fleece && e.sheared)).map((p) => {
        let rot = null;
        switch (p.kind) {
          case 'head': rot = compose(rotationY(e.headYaw), rotationX(-e.headPitch)); break;
          case 'legFL': case 'legBR': case 'legL': rot = rotationX(swing); break;
          case 'legFR': case 'legBL': case 'legR': rot = rotationX(-swing); break;
          case 'armL': rot = e.type === 'zombie' ? rotationX(-Math.PI / 2 + Math.sin(time * 2) * 0.05) : rotationX(-swing); break;
          case 'armR': rot = e.type === 'zombie' ? rotationX(-Math.PI / 2 - Math.sin(time * 2) * 0.05) : rotationX(swing); break;
          case 'wingL': rot = rotationZ(e.onGround ? 0 : Math.sin(time * 30) * 0.6); break;
          case 'wingR': rot = rotationZ(e.onGround ? 0 : -Math.sin(time * 30) * 0.6); break;
        }
        const pv = p.pivot.map((v) => v / 16);
        const local = rot ? compose(translation(pv[0], pv[1], pv[2]), rot) : translation(pv[0], pv[1], pv[2]);
        return { mesh: p.mesh, matrix: compose(...base, local) };
      });
      let overlay = [0, 0, 0, 0];
      if (e.hurtTime > 0 || e.dead) overlay = [1, 0.1, 0.1, 0.45];
      else if (e.burn > 0) overlay = [1, 0.5, 0.1, 0.35];
      else if (e.fuse > 0 && Math.floor(e.fuse * 6) % 2 === 0) overlay = [1, 1, 1, 0.6];
      out.push({ parts: out2, pos: e.pos, light, overlay, texture: 'entity' });
    }
    return out;
  }
}
