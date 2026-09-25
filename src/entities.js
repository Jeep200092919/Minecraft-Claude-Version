// Entities: mobs (animals, monsters, villagers) and primed TNT.
// Handles AI, physics, spawning/despawning, combat and render data.
import { B, I, BLOCKS, ITEMS, IS_SOLID, IS_OPAQUE, IS_FULL_CUBE, isBlockItem } from './blocks.js';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './constants.js';
import { MOBS, buildPartMesh } from './mobs.js';
import { moveBody, bodyBox } from './physics.js';
import { buildBlockMesh, buildExtrudedSprite, itemSpriteName } from './mesher.js';
import { compose, translation, rotationX, rotationY, rotationZ, scaling } from './math.js';
import { BIOME } from './worldgen.js';

const GRAVITY = 32;
// Mob caps per category around each player, like the original's spawn categories.
const CAPS = { creature: 14, monster: 12, water: 5, ambient: 4 };
// The night-time monster mix, weighted roughly like the original.
const MONSTERS = [['zombie', 30], ['skeleton', 25], ['creeper', 20], ['spider', 20], ['enderman', 4]];
const WOLF_FOOD = new Set([I.RAW_BEEF, I.STEAK, I.RAW_PORKCHOP, I.COOKED_PORKCHOP, I.RAW_CHICKEN, I.COOKED_CHICKEN,
  I.RAW_MUTTON, I.COOKED_MUTTON, I.RAW_RABBIT, I.COOKED_RABBIT, I.ROTTEN_FLESH]);
// Natural blocks an enderman may pick up and carry around.
const CARRIABLE = new Set([B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.CLAY, B.PUMPKIN, B.MELON, B.DANDELION, B.POPPY,
  B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.TNT]);

export function mobCategory(def) {
  if (def.swims) return 'water';
  if (def.flies) return 'ambient';
  if (def.hostile || def.teleports) return 'monster';
  if (def.villager || def.defender) return 'misc';
  return 'creature';
}

// Players are referred to by a string: 'player' offline, the network id online.
const isPlayerRef = (a) => typeof a === 'string';
const wrapAngle = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const yawTowards = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function weighted(list) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = Math.random() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
}

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
    this.panicFrom = null;
    this.attackCooldown = 0;
    this.fuse = 0;
    this.burn = 0;
    this.burnTick = 0;
    this.soundTimer = 4 + Math.random() * 10;
    this.home = null; // villagers and golems stay near their village
    this.target = null; // a mob, or { ref } for a player
    this.seesTarget = false;
    this.angerTime = 0;
    this.thinkTimer = Math.random() * 0.5;
    this.swing = 0; // attack animation, 1 -> 0
    this.aim = 0; // skeleton bow draw
    this.stare = 0; // enderman being looked at
    this.size = 1; // slimes
    this.squish = 0;
    this.hopTimer = Math.random();
    this.tamed = false;
    this.owner = null;
    this.sitting = false;
    this.carry = 0; // block an enderman carries
    this.roost = false; // bats hanging from a ceiling
    this.swimPhase = Math.random() * 6;
    this.swimTimer = 0;
    this.swimPulse = 0;
    this.swimDir = [0, 0, 0];
    this.air = 15;
    this.hazardTick = 0;
    if (this.def.sizes) this.setSize([1, 2, 4][Math.floor(Math.random() * 3)]);
  }

  setSize(n) {
    this.size = n;
    this.hw = (this.def.width * n) / 2;
    this.h = this.def.height * n;
    this.health = n * n;
  }

  get maxHealth() {
    return this.def.sizes ? this.size * this.size : this.tamed ? 20 : this.def.health;
  }

  get dead() {
    return this.deathTime >= 0;
  }

  hurt(amount, from, mgr, attacker = null) {
    if (this.dead || this.hurtTime > 0.35) return false;
    this.health -= amount;
    if (attacker) this.lastAttacker = attacker;
    this.hurtTime = 0.5;
    this.roost = false;
    if (from && !this.def.defender) {
      const dx = this.pos[0] - from[0], dz = this.pos[2] - from[2];
      const l = Math.hypot(dx, dz) || 1;
      const k = this.def.swims ? 3 : 7;
      this.vel[0] += (dx / l) * k;
      this.vel[2] += (dz / l) * k;
      this.vel[1] = this.def.swims || this.def.flies ? 2 : 6;
    }
    if (this.def.passive) {
      this.panic = 4;
      this.panicFrom = from ? [...from] : null;
    }
    mgr.game.sound.mob(this.def.sound, this.health <= 0 ? 'death' : 'hurt');
    if (this.health <= 0) {
      this.deathTime = 0;
      mgr.onMobDeath(this);
    } else mgr.onMobHurt(this, attacker);
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
    this.spawnTimer = 1;
    this.villageTimer = 1;
    this.stareTimer = 0;
    this.frameP = null;
  }

  clear() {
    this.list = [];
  }

  get world() {
    return this.game.world;
  }

  spawn(type, x, y, z, opts = {}) {
    if (!MOBS[type]) return null;
    const m = new Mob(type, x, y, z);
    if (opts.size && m.def.sizes) m.setSize(opts.size);
    this.list.push(m);
    return m;
  }

  // Spawns a mob only if its whole body fits at the spot, on solid ground.
  spawnIfFits(type, x, y, z, opts) {
    const m = new Mob(type, x, y, z);
    if (opts?.size && m.def.sizes) m.setSize(opts.size);
    if (!this.fits(m, x, y, z)) return null;
    if (!m.def.flies && !m.def.swims && !IS_SOLID[this.world.getBlock(Math.floor(x), Math.floor(y) - 1, Math.floor(z))]) return null;
    this.list.push(m);
    return m;
  }

  // True if a body of the mob's size is free of solid blocks and liquids
  // (squids need water instead).
  fits(m, x, y, z) {
    const w = this.world;
    if (!w.isReady(x, z)) return false;
    for (let bx = Math.floor(x - m.hw); bx <= Math.floor(x + m.hw - 1e-3); bx++) {
      for (let bz = Math.floor(z - m.hw); bz <= Math.floor(z + m.hw - 1e-3); bz++) {
        for (let by = Math.floor(y); by <= Math.floor(y + m.h - 1e-3); by++) {
          const id = w.getBlock(bx, by, bz);
          if (m.def.swims ? id !== B.WATER : IS_SOLID[id] || BLOCKS[id].liquid) return false;
        }
      }
    }
    return true;
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
    const def = m.def;
    for (const [id, min, max] of def.drops) {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (n > 0) this.dropItem({ id, count: n }, x, y + 0.5, z);
    }
    if (m.carry) this.dropItem({ id: m.carry, count: 1 }, x, y + 1, z);
    if (def.sizes) {
      if (m.size === 1) {
        const n = Math.floor(Math.random() * 3);
        if (n) this.dropItem({ id: I.SLIMEBALL, count: n }, x, y + 0.3, z);
      } else {
        // Big slimes split into two to four smaller ones.
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const c = this.spawn(m.type, x + (Math.random() - 0.5) * m.hw, y + 0.1, z + (Math.random() - 0.5) * m.hw, { size: m.size / 2 });
          c.vel = [(Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4];
          c.target = m.target;
        }
      }
    }
    if (isPlayerRef(m.lastAttacker)) {
      const xp = def.xp ?? (def.sizes ? m.size : def.hostile || def.teleports ? 5 : 1 + Math.floor(Math.random() * 3));
      if (xp) this.dropXP(xp, x, y + 0.5, z);
    }
    if (m.tamed && m.owner === this.localRef) this.game.chat?.add('Your wolf died', '#ff5555');
  }

  // Reactions to being hurt: neutral mobs get angry, wolf packs and village
  // golems join in, a player's tamed wolves attack whatever they hit.
  onMobHurt(m, attacker) {
    const def = m.def;
    if (def.swims && m.inWater) this.game.particles.fx('ink', m.pos[0], m.pos[1] + m.h / 2, m.pos[2], 14, 0.5, { up: 0, grav: 0, vel: 1.2 });
    if (def.teleports && Math.random() < 0.6) this.teleportMob(m);
    if (!attacker || attacker === m) return;
    if (isPlayerRef(attacker)) {
      if (def.hostile || (def.neutral && !(m.tamed && m.owner === attacker))) {
        m.target = { ref: attacker };
        m.angerTime = 25;
        m.sitting = false;
      }
      if (def.tameable && !m.tamed) {
        for (const o of this.mobsNear(m.pos, 16)) {
          if (o.type === m.type && !o.tamed) { o.target = { ref: attacker }; o.angerTime = 25; }
        }
      }
      if (def.villager) {
        for (const o of this.mobsNear(m.pos, 24)) if (o.def.defender) { o.target = { ref: attacker }; o.angerTime = 30; }
      }
      if (!(m.tamed && m.owner === attacker)) this.rallyWolves(attacker, m);
    } else if (attacker.kind === 'mob' && !attacker.dead && !def.passive) {
      const sameOwner = m.tamed && attacker.tamed && attacker.owner === m.owner;
      if (!sameOwner) { m.target = attacker; m.angerTime = 20; }
    }
  }

  // A player's tamed wolves attack the given mob.
  rallyWolves(ref, victim) {
    if (!victim || victim.kind !== 'mob' || victim.def.explodes) return;
    for (const o of this.list) {
      if (o.kind === 'mob' && o.tamed && o.owner === ref && !o.sitting && !o.dead && o !== victim && dist3(o.pos, victim.pos) < 24) {
        if (victim.tamed && victim.owner === ref) continue;
        o.target = victim;
        o.angerTime = 20;
      }
    }
  }

  // A player right-clicks a mob holding itemId (null for an empty hand).
  // Returns 'consume' when one item should be used up, 'use' when the click
  // did something, or null.
  interactMob(mob, itemId, ref) {
    if (!mob.def.tameable || mob.dead) return null;
    const fx = this.game.particles;
    if (!mob.tamed && itemId === I.BONE) {
      if (mob.target) return null; // angry wolves can't be tamed
      if (Math.random() < 1 / 3) {
        mob.tamed = true;
        mob.owner = ref;
        mob.persistent = true;
        mob.sitting = true;
        mob.health = 20;
        mob.target = null;
        fx.fx('heart', mob.pos[0], mob.pos[1] + mob.h, mob.pos[2], 7, 0.4);
      } else fx.smoke(mob.pos[0], mob.pos[1] + mob.h, mob.pos[2], 5, 0.3, 0.12, 0.3);
      return 'consume';
    }
    if (mob.tamed && mob.owner === ref) {
      if (WOLF_FOOD.has(itemId) && mob.health < mob.maxHealth) {
        mob.health = Math.min(mob.maxHealth, mob.health + 4);
        fx.fx('heart', mob.pos[0], mob.pos[1] + mob.h, mob.pos[2], 3, 0.3);
        return 'consume';
      }
      mob.sitting = !mob.sitting;
      mob.target = null;
      mob.vel[0] = mob.vel[2] = 0;
      return 'use';
    }
    return null;
  }

  // Endermen blink to a random spot nearby, or next to `near` when chasing.
  teleportMob(m, near = null) {
    const w = this.world;
    const c = near || m.pos;
    const r = near ? 4 : 16;
    for (let i = 0; i < 32; i++) {
      const x = Math.floor(c[0] + (Math.random() * 2 - 1) * r) + 0.5, z = Math.floor(c[2] + (Math.random() * 2 - 1) * r) + 0.5;
      let y = Math.floor(c[1] + (Math.random() * 2 - 1) * (near ? 2 : 8));
      for (let k = 0; k < 16 && y > 1 && !IS_SOLID[w.getBlock(Math.floor(x), y - 1, Math.floor(z))]; k++) y--;
      const floor = w.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (!IS_SOLID[floor] || !this.fits(m, x, y, z)) continue;
      this.game.particles.fx('portal', m.pos[0], m.pos[1] + m.h / 2, m.pos[2], 18, 0.4, { up: 0, grav: 0 });
      m.pos = [x, y, z];
      m.vel = [0, 0, 0];
      this.game.particles.fx('portal', x, y + m.h / 2, z, 18, 0.4, { up: 0, grav: 0 });
      if (dist3(m.pos, this.game.player.pos) < 24) this.game.sound.teleport?.();
      return true;
    }
    return false;
  }

  mobsNear(pos, r) {
    return this.list.filter((e) => e.kind === 'mob' && !e.dead && dist3(e.pos, pos) < r);
  }

  nearestMob(pos, r, pred) {
    let best = null, bd = r;
    for (const e of this.list) {
      if (e.kind !== 'mob' || e.dead || !pred(e)) continue;
      const d = dist3(e.pos, pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // --- Players as seen by mobs -----------------------------------------------------

  get localRef() {
    return this.game.net?.id ?? 'player';
  }

  // The players mobs react to: the local one and, when this client runs the
  // simulation, everyone connected. Creative players are ignored by monsters.
  players(includeCreative = false) {
    if (!this.frameP) {
      const g = this.game;
      const all = [];
      const p = g.player;
      if (!p.dead && g.state !== 'dead') {
        all.push({ kind: 'player', ref: this.localRef, pos: p.pos, hw: 0.3, h: 1.8, yaw: p.yaw, pitch: p.pitch, creative: g.creative });
      }
      if (g.net?.isAuthority) {
        for (const r of g.net.players.values()) {
          if (!r.dead && r.pos) all.push({ kind: 'player', ref: r.id, pos: r.pos, hw: 0.3, h: 1.8, yaw: r.yaw, pitch: r.pitch, creative: r.creative });
        }
      }
      this.frameP = { all, survival: all.filter((q) => !q.creative) };
    }
    return includeCreative ? this.frameP.all : this.frameP.survival;
  }

  nearestPlayer(pos, range, includeCreative = false) {
    let best = null, bd = range;
    for (const p of this.players(includeCreative)) {
      const d = dist3(p.pos, pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  resolveTarget(t, includeCreative = false) {
    if (!t) return null;
    if (t.kind === 'mob') return t.dead || t.removed ? null : t;
    return this.players(includeCreative).find((p) => p.ref === t.ref) || null;
  }

  // Line of sight between two points (only opaque blocks block it).
  canSee(a, b) {
    const w = this.world;
    const d = dist3(a, b);
    const n = Math.ceil(d / 0.3);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (IS_OPAQUE[w.getBlock(Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t), Math.floor(a[2] + (b[2] - a[2]) * t))]) return false;
    }
    return true;
  }

  // Melee hit on a mob or a player.
  hitTarget(m, t, amount) {
    m.swing = 1;
    if (t.kind === 'mob') {
      t.hurt(amount, m.pos, this, m);
      if (m.def.defender) t.vel[1] += 9;
    } else this.damagePlayer(t.ref, amount, m.pos, m);
  }

  damagePlayer(ref, amount, from, source = null, knock = 6) {
    const g = this.game;
    const lift = source?.def?.defender ? 10 : 0;
    if (source) this.rallyWolves(ref, source);
    if (ref === this.localRef) {
      const p = g.player;
      p.damage(amount, g.pendingEvents, g.creative);
      p.knockback(p.pos[0] - from[0], p.pos[2] - from[2], knock);
      if (lift) p.vel[1] = Math.max(p.vel[1], lift);
    } else g.net?.sendDamage?.(ref, amount, from, knock, lift);
  }

  // Skeleton arrow, aimed with a little lead for gravity and some spread.
  mobShoot(m, t) {
    const from = [m.pos[0], m.pos[1] + m.h * 0.78, m.pos[2]];
    const to = [t.pos[0], t.pos[1] + (t.h ?? 1.8) * 0.55, t.pos[2]];
    const dx = to[0] - from[0], dz = to[2] - from[2];
    const hd = Math.hypot(dx, dz) || 1;
    const v = 24;
    const time = hd / v;
    const spread = 0.9;
    const vel = [
      (dx / hd) * v + (Math.random() - 0.5) * spread,
      (to[1] - from[1]) / time + 10 * time + (Math.random() - 0.5) * spread,
      (dz / hd) * v + (Math.random() - 0.5) * spread,
    ];
    from[0] += (dx / hd) * 0.6;
    from[2] += (dz / hd) * 0.6;
    this.shoot('arrow', from, vel, m, 2 + Math.floor(Math.random() * 3));
    if (dist3(m.pos, this.game.player.pos) < 24) this.game.sound.bow?.(0.6);
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

  // Animals on grass (rabbits also on sand and snow), in biome-specific mixes.
  trySpawnCreature(p) {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 32;
    const x = Math.floor(p[0] + Math.cos(a) * d), z = Math.floor(p[2] + Math.sin(a) * d);
    const gy = this.groundAt(x, z);
    if (gy < 0 || w.getSkyLight(x, gy + 1, z) < 12) return;
    const ground = w.getBlock(x, gy, z);
    const biome = w.generator.column(x, z).biome;
    let pool;
    if (biome === BIOME.DESERT) pool = [['rabbit', 1]];
    else if (biome === BIOME.SNOWY) pool = [['sheep', 3], ['rabbit', 3], ['wolf', 2], ['cow', 1]];
    else if (biome === BIOME.FOREST) pool = [['pig', 3], ['cow', 3], ['sheep', 3], ['chicken', 3], ['wolf', 2], ['rabbit', 1]];
    else pool = [['pig', 3], ['cow', 3], ['sheep', 4], ['chicken', 3], ['rabbit', 1]];
    const type = weighted(pool);
    const okGround = ground === B.GRASS || ground === B.SNOWY_GRASS || (type === 'rabbit' && (ground === B.SAND || ground === B.SNOW));
    if (!okGround) return;
    const n = type === 'wolf' ? 2 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * (type === 'rabbit' ? 2 : 3));
    for (let i = 0; i < n; i++) {
      const sx = x + Math.floor(Math.random() * 5) - 2, sz = z + Math.floor(Math.random() * 5) - 2;
      const sy = this.groundAt(sx, sz);
      if (sy > 0) this.spawnIfFits(type, sx + 0.5, sy + 1, sz + 0.5);
    }
  }

  // Slime chunks: one chunk in ten lets slimes spawn deep underground.
  slimeChunk(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    let h = (Math.imul(cx, 0x1f1f1f1f) ^ Math.imul(cz, 0x5bd1e995) ^ (this.world.seed | 0)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return ((h ^ (h >>> 12)) >>> 0) % 10 === 0;
  }

  trySpawnHostile(p, day) {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
    const x = Math.floor(p[0] + Math.cos(a) * d), z = Math.floor(p[2] + Math.sin(a) * d);
    if (!w.isReady(x, z)) return;
    let y;
    const surface = Math.random() < 0.5 && day < 0.3;
    if (surface) {
      y = this.groundAt(x, z) + 1; // surface at night
    } else {
      y = 6 + Math.floor(Math.random() * Math.max(1, w.heightAt(x, z) - 10)); // caves
    }
    if (y <= 1 || !this.canStandAt(x, y, z)) return;
    const sky = w.getSkyLight(x, y, z) * Math.max(0.1, day);
    if (Math.max(sky, w.getBlockLight(x, y, z)) > 6) return;
    if (Math.hypot(x - p[0], y - p[1], z - p[2]) < 20) return;
    let type = weighted(MONSTERS);
    if (!surface && y < 40 && this.slimeChunk(x, z) && Math.random() < 0.5) type = 'slime';
    this.spawnIfFits(type, x + 0.5, y, z + 0.5);
  }

  // Squid in open water at least three blocks deep.
  trySpawnSquid(p) {
    const w = this.world;
    const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 32;
    const x = Math.floor(p[0] + Math.cos(a) * d), z = Math.floor(p[2] + Math.sin(a) * d);
    if (!w.isReady(x, z)) return;
    const y = SEA_LEVEL - 1 - Math.floor(Math.random() * 6);
    for (let k = 0; k < 3; k++) if (w.getBlock(x, y - k, z) !== B.WATER) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.spawnIfFits('squid', x + 0.5 + Math.random() - 0.5, y - 2, z + 0.5 + Math.random() - 0.5);
  }

  // Bats in dark caves.
  trySpawnBat(p) {
    const w = this.world;
    const x = Math.floor(p[0] + (Math.random() - 0.5) * 48), z = Math.floor(p[2] + (Math.random() - 0.5) * 48);
    if (!w.isReady(x, z)) return;
    const top = w.heightAt(x, z) - 6;
    if (top < 8) return;
    const y = 6 + Math.floor(Math.random() * (top - 6));
    if (w.getBlock(x, y, z) !== B.AIR || w.getSkyLight(x, y, z) > 3 || w.getBlockLight(x, y, z) > 3) return;
    this.spawnIfFits('bat', x + 0.5, y, z + 0.5);
  }

  spawnVillagers(p) {
    const v = this.world.generator.nearestVillage?.(p[0], p[2]);
    if (!v || Math.hypot(v.x - p[0], v.z - p[2]) > 80) return;
    const mine = (e) => e.kind === 'mob' && e.home && e.home[0] === v.x && e.home[1] === v.z;
    const have = this.list.filter((e) => mine(e) && e.type === 'villager').length;
    const golem = this.list.some((e) => mine(e) && e.def.defender);
    if (have >= 4 && golem) return;
    const type = have >= 2 && !golem ? 'iron_golem' : 'villager';
    const x = v.x + Math.floor(Math.random() * 16) - 8, z = v.z + Math.floor(Math.random() * 16) - 8;
    const gy = this.groundAt(x, z);
    if (gy > 0) {
      const m = this.spawnIfFits(type, x + 0.5, gy + 1, z + 0.5);
      if (m) m.home = [v.x, v.z];
    }
  }

  // --- Update -------------------------------------------------------------------

  update(dt, sky) {
    const game = this.game;
    this.frameP = null;
    const everyone = this.players(true);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      for (const pl of everyone) {
        const p = pl.pos;
        const near = (cat, r) => this.countNear((e) => mobCategory(e.def) === cat, p, r);
        if (Math.random() < 0.4 && near('creature', 96) < CAPS.creature) this.trySpawnCreature(p);
        if (near('monster', 96) < CAPS.monster) this.trySpawnHostile(p, sky.day);
        if (Math.random() < 0.3 && near('water', 64) < CAPS.water) this.trySpawnSquid(p);
        if (Math.random() < 0.3 && near('ambient', 64) < CAPS.ambient) this.trySpawnBat(p);
      }
    }
    this.villageTimer -= dt;
    if (this.villageTimer <= 0) {
      this.villageTimer = 3;
      for (const pl of everyone) this.spawnVillagers(pl.pos);
    }
    this.stareTimer -= dt;
    if (this.stareTimer <= 0) {
      this.stareTimer = 0.2;
      this.checkStares();
    }

    for (const e of this.list) {
      if (e.kind === 'tnt') this.updateTNT(e, dt);
      else if (e.kind === 'item') this.updateItem(e, dt);
      else if (e.kind === 'xp') this.updateXP(e, dt);
      else if (e.kind === 'projectile') this.updateProjectile(e, dt);
      else this.updateMob(e, dt, sky);
    }
    // Remove finished / far away entities.
    const anchors = everyone.length ? everyone.map((q) => q.pos) : [game.player.pos];
    this.list = this.list.filter((e) => {
      if (e.removed) return false;
      if (!this.world.isReady(e.pos[0], e.pos[2])) return false;
      if (e.kind === 'mob' && !e.persistent) {
        const dist = Math.min(...anchors.map((q) => Math.hypot(e.pos[0] - q[0], e.pos[2] - q[2])));
        if (dist > (e.def.hostile ? 100 : 140)) return false;
      }
      return true;
    });
  }

  // Endermen get angry when a player looks straight at their head.
  checkStares() {
    for (const p of this.players()) {
      const cp = Math.cos(p.pitch);
      const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
      const eye = [p.pos[0], p.pos[1] + 1.62, p.pos[2]];
      for (const m of this.list) {
        if (m.kind !== 'mob' || !m.def.teleports || m.dead || m.target) continue;
        const head = [m.pos[0], m.pos[1] + m.h - 0.25, m.pos[2]];
        const len = dist3(head, eye);
        if (len > 64 || len < 0.5) continue;
        const dot = ((head[0] - eye[0]) * d[0] + (head[1] - eye[1]) * d[1] + (head[2] - eye[2]) * d[2]) / len;
        if (dot > 1 - 0.025 / len && this.canSee(eye, head)) {
          m.target = { ref: p.ref };
          m.angerTime = 30;
          m.stare = 1;
          if (p.ref === this.localRef) this.game.sound.stare?.();
        }
      }
    }
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
      for (const pl of this.players()) {
        if (pl.ref === p.owner) continue; // no hitting yourself
        const b = [pl.pos[0] - 0.3, pl.pos[1], pl.pos[2] - 0.3, pl.pos[0] + 0.3, pl.pos[1] + 1.8, pl.pos[2] + 0.3];
        const t = rayBox(p.pos, dir, b);
        if (t === null || t > speed * sdt + 0.2) continue;
        if (pl.ref === this.localRef) game.projectileHitPlayer(p);
        else game.net?.sendDamage?.(pl.ref, p.type === 'arrow' ? p.damage : 0, p.pos, 5, 0);
        if (p.owner?.kind === 'mob') this.rallyWolves(pl.ref, p.owner);
        if (p.type === 'arrow') p.removed = true;
        else this.projectileBurst(p);
        return;
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
    if (mob.def.teleports) {
      // Endermen dodge projectiles.
      this.teleportMob(mob);
      p.removed = true;
      return;
    }
    if (p.type === 'arrow') {
      mob.hurt(p.damage, [p.pos[0] - p.vel[0], p.pos[1], p.pos[2] - p.vel[2]], this, p.owner);
      p.removed = true;
    } else {
      if (p.type === 'snowball') mob.hurt(mob.type === 'blaze' ? 3 : 0.01, p.pos, this, p.owner);
      this.projectileBurst(p);
    }
    if (p.owner === this.localRef) game.sound.hit?.();
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
    } else if (p.type === 'ender_pearl' && p.owner === this.localRef) {
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

  // Picks and drops targets a few times a second.
  think(m, sky) {
    const def = m.def;
    const w = this.world;
    const eye = [m.pos[0], m.pos[1] + m.h * 0.85, m.pos[2]];
    const bright = sky.day > 0.5 && w.getSkyLight(Math.floor(m.pos[0]), Math.floor(eye[1]), Math.floor(m.pos[2])) >= 12;
    let t = this.resolveTarget(m.target);
    if (t && dist3(t.pos, m.pos) > 32) t = null;
    // Neutral mobs calm down; spiders lose interest in daylight.
    if (t && t.kind === 'player' && !def.hostile && m.angerTime <= 0) t = null;
    if (t && t.kind === 'player' && def.neutralInDay && bright && m.angerTime <= 0 && Math.random() < 0.1) t = null;
    if (t && m.tamed && t.kind === 'player' && t.ref === m.owner) t = null;
    m.target = t ? (t.kind === 'mob' ? t : { ref: t.ref }) : null;
    if (!m.target && !m.sitting) {
      if (def.hostile && !(def.neutralInDay && bright)) {
        const p = this.nearestPlayer(m.pos, 16);
        if (p && this.canSee(eye, [p.pos[0], p.pos[1] + 1.6, p.pos[2]])) m.target = { ref: p.ref };
        else if (m.type === 'zombie') m.target = this.nearestMob(m.pos, 16, (o) => o.def.villager);
      } else if (def.defender) {
        m.target = this.nearestMob(m.pos, 12, (o) => o.def.hostile && !o.def.explodes);
      } else if (def.tameable && !m.tamed && Math.random() < 0.015) {
        m.target = this.nearestMob(m.pos, 12, (o) => o.type === 'sheep' || o.type === 'rabbit');
      }
    }
    const tt = this.resolveTarget(m.target);
    m.seesTarget = !!tt && this.canSee(eye, [tt.pos[0], tt.pos[1] + tt.h * 0.8, tt.pos[2]]);
    // Rabbits flee from players, villagers from zombies.
    if (def.passive && !m.panic) {
      const threat = m.type === 'rabbit' ? this.nearestPlayer(m.pos, 5)
        : def.villager ? this.nearestMob(m.pos, 8, (o) => o.type === 'zombie') : null;
      if (threat) { m.panic = 1.5; m.panicFrom = [...threat.pos]; }
    }
    if (def.teleports && !m.target) this.endermanBlocks(m);
  }

  // Endermen pick up natural blocks and put them down somewhere else.
  endermanBlocks(m) {
    const w = this.world;
    const game = this.game;
    const bx = Math.floor(m.pos[0] + (Math.random() - 0.5) * 4), bz = Math.floor(m.pos[2] + (Math.random() - 0.5) * 4);
    const by = Math.floor(m.pos[1] + Math.random() * 3 - 1);
    if (!m.carry && Math.random() < 0.02) {
      const id = w.getBlock(bx, by, bz);
      if (CARRIABLE.has(id) && w.getBlock(bx, by + 1, bz) === B.AIR) {
        m.carry = id;
        game.setBlockSynced(bx, by, bz, B.AIR);
      }
    } else if (m.carry && Math.random() < 0.01) {
      const here = w.getBlock(bx, by, bz);
      if ((here === B.AIR || BLOCKS[here].replaceable && !BLOCKS[here].liquid) && IS_FULL_CUBE[w.getBlock(bx, by - 1, bz)]) {
        const box = [bx, by, bz, bx + 1, by + 1, bz + 1];
        const b = bodyBox(m);
        const overlap = b[0] < box[3] && b[3] > box[0] && b[1] < box[4] && b[4] > box[1] && b[2] < box[5] && b[5] > box[2];
        if (!overlap) {
          game.setBlockSynced(bx, by, bz, m.carry);
          m.carry = 0;
        }
      }
    }
  }

  updateMob(m, dt, sky) {
    const game = this.game;
    const world = this.world;
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
    m.angerTime = Math.max(0, m.angerTime - dt);
    m.swing = Math.max(0, m.swing - dt * 2.5);
    m.stare = Math.max(0, m.stare - dt);
    m.squish *= Math.pow(0.02, dt);
    m.thinkTimer -= dt;
    if (m.thinkTimer <= 0) {
      m.thinkTimer = 0.35 + Math.random() * 0.3;
      this.think(m, sky);
    }
    const viewer = this.nearestPlayer(m.pos, 8, true);

    if (def.flies) this.flyBat(m, dt);
    else if (def.swims) this.swimSquid(m, dt);
    else if (this.walkAI(m, dt, viewer) === 'exploded') return;

    // Look at the nearest player when close.
    const lookYaw = viewer ? yawTowards(m.pos, viewer.pos) : m.yaw;
    const hy = Math.max(-1, Math.min(1, wrapAngle(lookYaw - m.yaw)));
    m.headYaw += (hy - m.headYaw) * Math.min(1, dt * 5);
    const eyeY = m.pos[1] + m.h * 0.85;
    const lookPitch = viewer ? Math.atan2(viewer.pos[1] + 1.5 - eyeY, Math.max(Math.hypot(viewer.pos[0] - m.pos[0], viewer.pos[2] - m.pos[2]), 0.5)) : 0;
    m.headPitch += (Math.max(-0.7, Math.min(0.7, lookPitch)) - m.headPitch) * Math.min(1, dt * 5);

    // Hazards.
    const ix = Math.floor(m.pos[0]), iz = Math.floor(m.pos[2]);
    const feet = world.getBlock(ix, Math.floor(m.pos[1] + 0.2), iz);
    if (feet === B.LAVA) this.burnMob(m, dt, 4);
    const exposed = world.getSkyLight(ix, Math.floor(eyeY), iz) >= 14;
    if (def.burnsInDay && sky.day > 0.6 && (sky.rain || 0) < 0.3 && !m.inWater && exposed) {
      m.burn = 1;
    } else m.burn = Math.max(0, m.burn - dt);
    if (m.burn > 0) this.burnMob(m, dt, 1);
    // Water and rain hurt endermen, who teleport away from it.
    if (def.teleports && (m.inWater || (sky.rain || 0) > 0.3 && exposed)) {
      m.hazardTick -= dt;
      if (m.hazardTick <= 0) {
        m.hazardTick = 1;
        m.hurt(1, null, this);
        this.teleportMob(m);
      }
    }

    // Keep mobs from overlapping players.
    for (const pl of this.players(true)) {
      const dx = pl.pos[0] - m.pos[0], dz = pl.pos[2] - m.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < m.hw + 0.3 && Math.abs(pl.pos[1] - m.pos[1]) < m.h) {
        const push = (m.hw + 0.3 - d) * 4;
        m.vel[0] -= (dx / (d || 1)) * push;
        m.vel[2] -= (dz / (d || 1)) * push;
      }
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
      if (dist3(m.pos, game.player.pos) < 16) game.sound.mob(def.sound, 'idle');
    }
  }

  // Ground mobs: chasing, fighting, following, fleeing and wandering, then
  // walking/hopping physics.
  walkAI(m, dt, viewer) {
    const game = this.game;
    const world = this.world;
    const def = m.def;
    const t = this.resolveTarget(m.target);
    let face = null; // yaw to turn towards
    let moveYaw = null; // walking direction when it differs from facing
    let speed = 0;

    if (m.sitting) {
      if (t) face = yawTowards(m.pos, t.pos);
    } else if (t) {
      const dx = t.pos[0] - m.pos[0], dz = t.pos[2] - m.pos[2], dy = t.pos[1] - m.pos[1];
      const dist = Math.hypot(dx, dz);
      face = Math.atan2(-dx, -dz);
      speed = def.speed * (def.neutral && !def.defender ? 1.3 : 1);
      if (def.explodes) {
        if (dist < 3 && (m.fuse > 0 || m.seesTarget)) {
          if (m.fuse === 0) game.sound.hiss();
          m.fuse += dt;
          speed = 0;
          if (m.fuse >= 1.5) {
            m.removed = true;
            game.explode(m.pos[0], m.pos[1] + 1, m.pos[2], 3);
            return 'exploded';
          }
        } else m.fuse = Math.max(0, m.fuse - dt * (dist > 6 ? 1 : 0.5));
      } else if (def.ranged) {
        // Skeletons keep their distance, strafe and shoot.
        m.strafeTimer = (m.strafeTimer ?? 0) - dt;
        if (m.strafeTimer <= 0) {
          m.strafeTimer = 1 + Math.random() * 2;
          m.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        if (dist < 5) {
          moveYaw = face + Math.PI;
          speed = def.speed * 0.8;
        } else if (dist < 14 && m.seesTarget) {
          moveYaw = face + (m.strafeDir * Math.PI) / 2;
          speed = def.speed * 0.4;
        }
        if (m.seesTarget && dist < 16) {
          m.aim += dt;
          if (m.aim >= 1 && m.attackCooldown <= 0) {
            this.mobShoot(m, t);
            m.aim = 0;
            m.attackCooldown = 1.2 + Math.random() * 1.2;
          }
        } else m.aim = Math.max(0, m.aim - dt);
      } else {
        const dmg = def.sizes ? (m.size > 1 ? m.size : 0) : def.defender ? def.attack * (0.6 + Math.random() * 0.8) : def.attack;
        const reach = m.hw + (t.hw ?? 0.3) + 0.6;
        if (dmg > 0 && dist < reach && Math.abs(dy) < Math.max(1.6, m.h) && m.attackCooldown <= 0) {
          m.attackCooldown = def.defender ? 1.25 : 1;
          this.hitTarget(m, t, dmg);
          if (def.defender) game.sound.slam?.();
        }
        // Spiders pounce.
        if (def.climbs && m.onGround && dist > 1.5 && dist < 4 && Math.random() < dt * 1.5) {
          m.vel[0] = (dx / dist) * 6;
          m.vel[2] = (dz / dist) * 6;
          m.vel[1] = 6;
        }
        // Endermen close in by teleporting.
        if (def.teleports && dist > 10 && Math.random() < dt * 0.4) this.teleportMob(m, t.pos);
      }
    } else if (m.panic > 0) {
      if (m.panicFrom) face = Math.atan2(m.pos[0] - m.panicFrom[0], m.pos[2] - m.panicFrom[2]);
      else {
        if (m.wanderTimer <= 0 || !m.moving) { m.wanderYaw = Math.random() * Math.PI * 2; m.wanderTimer = 1; m.moving = true; }
        m.wanderTimer -= dt;
        face = m.wanderYaw;
      }
      speed = def.speed * 1.8;
    } else if (m.tamed && !m.sitting && this.followOwner(m, dt)) {
      face = m.followYaw;
      speed = m.followSpeed;
    } else if (def.teleports && m.stare > 0 && viewer) {
      face = yawTowards(m.pos, viewer.pos);
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
        face = m.wanderYaw;
        speed = def.speed * 0.6;
      }
    }

    // Don't walk off cliffs unless chasing something.
    if (speed > 0 && !t && m.panic <= 0) {
      const yaw = moveYaw ?? face ?? m.yaw;
      const ax = m.pos[0] - Math.sin(yaw) * 1.2, az = m.pos[2] - Math.cos(yaw) * 1.2;
      let drop = 0;
      while (drop < 4 && !IS_SOLID[world.getBlock(Math.floor(ax), Math.floor(m.pos[1]) - 1 - drop, Math.floor(az))]) drop++;
      if (drop >= 3) { speed = 0; m.wanderTimer = 0; }
    }

    // Turn smoothly.
    if (face !== null) m.yaw += wrapAngle(face - m.yaw) * Math.min(1, dt * 6);

    // Physics.
    const my = moveYaw ?? m.yaw;
    let wx = -Math.sin(my) * speed, wz = -Math.cos(my) * speed;
    if (def.hops && m.onGround) {
      // Slimes and rabbits only move while in the air.
      wx = wz = 0;
      m.hopTimer -= dt;
      if (speed > 0 && m.hopTimer <= 0) {
        m.vel[1] = def.sizes ? 6.5 + m.size * 0.6 : 6.5;
        m.vel[0] = -Math.sin(my) * speed * 1.1;
        m.vel[2] = -Math.cos(my) * speed * 1.1;
        m.hopTimer = def.sizes ? (t ? 0.4 : 1.2) + Math.random() * 1.2 : 0.05 + Math.random() * 0.25;
        if (def.sizes && dist3(m.pos, game.player.pos) < 16) game.sound.mob(def.sound, 'idle');
      }
    }
    const k = Math.min(1, (m.onGround ? 10 : 2) * dt);
    if (!(def.hops && m.onGround && m.vel[1] > 0)) {
      m.vel[0] += (wx - m.vel[0]) * k;
      m.vel[2] += (wz - m.vel[2]) * k;
    }
    const ix = Math.floor(m.pos[0]), iz = Math.floor(m.pos[2]);
    const feet = world.getBlock(ix, Math.floor(m.pos[1] + 0.2), iz);
    m.inWater = feet === B.WATER || feet === B.LAVA;
    if (m.inWater) {
      m.vel[1] = Math.min(m.vel[1] + 24 * dt, 2.2);
    } else {
      m.vel[1] = Math.max(m.vel[1] - GRAVITY * dt, def.slowFall ? -3 : -60);
    }
    if (m.collidedH && speed > 0) {
      if (def.climbs) m.vel[1] = 3.5; // spiders climb walls
      else if (m.onGround && !def.hops) m.vel[1] = 8.4;
    }
    const wasOnGround = m.onGround;
    const res = moveBody(world, m, m.vel[0] * dt, m.vel[1] * dt, m.vel[2] * dt, { stepHeight: 0.6, wasOnGround });
    m.onGround = res.onGround;
    m.collidedH = res.collidedH;
    if (def.sizes && m.onGround && !wasOnGround) {
      m.squish = 1;
      game.particles.fx('slime', m.pos[0], m.pos[1] + 0.1, m.pos[2], 2 + m.size * 2, m.hw, { up: 2, grav: 16, vel: 1.5, size: 0.12 });
    }
    const hs = Math.hypot(m.vel[0], m.vel[2]);
    m.walkAmount += (Math.min(1, hs / 2) - m.walkAmount) * Math.min(1, dt * 8);
    m.walkPhase += hs * dt * 4.2;
    return null;
  }

  // Tamed wolves follow their owner and teleport to them when left behind.
  // Returns true while moving towards the owner.
  followOwner(m) {
    const o = this.resolveTarget({ ref: m.owner }, true);
    if (!o) return false;
    const d = dist3(o.pos, m.pos);
    if (d > 14) {
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(o.pos[0]) + Math.floor(Math.random() * 5) - 2 + 0.5, z = Math.floor(o.pos[2]) + Math.floor(Math.random() * 5) - 2 + 0.5;
        const y = Math.floor(o.pos[1]);
        if (Math.hypot(x - o.pos[0], z - o.pos[2]) < 1.5) continue;
        if (this.fits(m, x, y, z) && IS_SOLID[this.world.getBlock(Math.floor(x), y - 1, Math.floor(z))]) {
          m.pos = [x, y, z];
          m.vel = [0, 0, 0];
          break;
        }
      }
      return false;
    }
    if (d < 3) return false;
    m.followYaw = yawTowards(m.pos, o.pos);
    m.followSpeed = m.def.speed * (d > 6 ? 1.2 : 0.8);
    return true;
  }

  // Bats flutter around caves and hang from ceilings.
  flyBat(m, dt) {
    const w = this.world;
    const ix = Math.floor(m.pos[0]), iz = Math.floor(m.pos[2]);
    const ceiling = Math.floor(m.pos[1] + m.h + 0.15);
    if (m.roost) {
      m.vel = [0, 0, 0];
      if (!IS_SOLID[w.getBlock(ix, ceiling, iz)] || this.nearestPlayer(m.pos, 4, true) || Math.random() < dt * 0.02) m.roost = false;
      return;
    }
    m.flyTimer = (m.flyTimer ?? 0) - dt;
    if (!m.flyTarget || m.flyTimer <= 0 || dist3(m.pos, m.flyTarget) < 1) {
      m.flyTimer = 1 + Math.random() * 2;
      m.flyTarget = [m.pos[0] + (Math.random() - 0.5) * 14, m.pos[1] + (Math.random() - 0.5) * 6 + 0.4, m.pos[2] + (Math.random() - 0.5) * 14];
    }
    const d = [m.flyTarget[0] - m.pos[0], m.flyTarget[1] - m.pos[1], m.flyTarget[2] - m.pos[2]];
    const len = Math.hypot(...d) || 1;
    const k = Math.min(1, dt * 3);
    for (let i = 0; i < 3; i++) m.vel[i] += ((d[i] / len) * 4.5 - m.vel[i]) * k;
    m.yaw += wrapAngle(Math.atan2(-m.vel[0], -m.vel[2]) - m.yaw) * Math.min(1, dt * 8);
    const res = moveBody(w, m, m.vel[0] * dt, m.vel[1] * dt, m.vel[2] * dt);
    m.onGround = res.onGround;
    if (res.collidedH || res.onGround) m.flyTarget = null;
    m.inWater = w.getBlock(ix, Math.floor(m.pos[1] + 0.3), iz) === B.WATER;
    if (IS_SOLID[w.getBlock(ix, ceiling, iz)] && Math.random() < dt * 0.4) {
      m.roost = true;
      m.pos[1] = ceiling - m.h;
    }
    m.walkPhase += dt * 30;
  }

  // Squid drift and pulse through water; on land they flop and suffocate.
  swimSquid(m, dt) {
    const w = this.world;
    const ix = Math.floor(m.pos[0]), iz = Math.floor(m.pos[2]);
    m.inWater = w.getBlock(ix, Math.floor(m.pos[1] + m.h / 2), iz) === B.WATER;
    if (m.inWater) {
      m.air = 15;
      m.swimTimer -= dt;
      if (m.swimTimer <= 0) {
        m.swimTimer = 1.5 + Math.random() * 2;
        const a = m.panic > 0 && m.panicFrom ? Math.atan2(m.pos[0] - m.panicFrom[0], m.pos[2] - m.panicFrom[2]) : Math.random() * Math.PI * 2;
        m.swimDir = [-Math.sin(a), (Math.random() - 0.5) * 0.8, -Math.cos(a)];
        m.swimPulse = 1;
      }
      m.swimPulse = Math.max(0, m.swimPulse - dt * 0.8);
      const sp = (m.panic > 0 ? 5 : 2.2) * m.swimPulse;
      const k = Math.min(1, dt * 2);
      for (let i = 0; i < 3; i++) m.vel[i] += (m.swimDir[i] * sp - m.vel[i]) * k;
      if (w.getBlock(ix, Math.floor(m.pos[1] + m.h + 0.2), iz) !== B.WATER && m.vel[1] > 0) m.vel[1] = 0;
      m.swimPhase += dt * (1.5 + m.swimPulse * 5);
      if (Math.hypot(m.vel[0], m.vel[2]) > 0.3) m.yaw += wrapAngle(Math.atan2(-m.vel[0], -m.vel[2]) - m.yaw) * Math.min(1, dt * 3);
    } else {
      m.vel[1] = Math.max(m.vel[1] - GRAVITY * dt, -40);
      const damp = Math.pow(m.onGround ? 0.01 : 0.5, dt);
      m.vel[0] *= damp;
      m.vel[2] *= damp;
      m.swimPhase += dt * 10;
      m.air -= dt;
      if (m.air <= 0) {
        m.air = 1;
        m.hurt(1, null, this);
      }
    }
    const res = moveBody(w, m, m.vel[0] * dt, m.vel[1] * dt, m.vel[2] * dt);
    m.onGround = res.onGround;
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

  meshesFor(type, skin = MOBS[type]?.skin) {
    const key = `${type}:${skin}`;
    if (!this.meshes.has(key)) {
      const renderer = this.game.renderer;
      let parts;
      if (type === 'tnt') {
        const b = buildBlockMesh(B.TNT);
        parts = [{ kind: 'static', mesh: renderer.createMesh(b.data, b.quads), pivot: [0, 0, 0], block: true }];
      } else {
        parts = MOBS[type].parts.map((p, index) => {
          const built = buildPartMesh(p, skin);
          return {
            kind: p.kind, index, mesh: renderer.createMesh(built.data, built.quads), pivot: p.pivot || [0, 0, 0],
            fleece: !!p.fleece, translucent: !!p.translucent, angle: p.angle ?? 0,
          };
        });
      }
      this.meshes.set(key, parts);
    }
    return this.meshes.get(key);
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
      const def = e.def;
      const parts = this.meshesFor(e.type, e.tamed && def.tameSkin ? def.tameSkin : def.skin);
      const base = [];
      if (e.roost) base.push(translation(0, e.h, 0), rotationZ(Math.PI));
      base.push(rotationY(e.yaw + Math.PI));
      if (e.dead) base.push(rotationZ(Math.min(1, e.deathTime / 0.5) * Math.PI / 2));
      if (def.explodes && e.fuse > 0) base.push(scaling(1 + e.fuse * 0.12));
      if (def.sizes) {
        // Slimes squash when they land and stretch while airborne.
        const sq = e.onGround ? e.squish : -Math.min(0.6, Math.abs(e.vel[1]) * 0.06);
        base.push(scaling(e.size * (1 + sq * 0.25), e.size * (1 - sq * 0.4), e.size * (1 + sq * 0.25)));
      }
      if (def.flies && !e.roost) base.push(translation(0, Math.sin(time * 6 + e.id) * 0.05, 0));
      if (def.scale) base.push(scaling(def.scale));
      const swing = Math.sin(e.walkPhase) * 0.7 * e.walkAmount;
      const armsUp = e.type === 'zombie' || (def.ranged && (e.aim > 0 || e.target));
      const sit = e.sitting;
      const out2 = [];
      let rightArm = null;
      for (const p of parts) {
        if (p.fleece && e.sheared) continue;
        let rot = null;
        let off = null; // shifts the pivot
        let center = null; // rotation centre for parts without a pivot
        switch (p.kind) {
          case 'head':
            rot = compose(rotationY(e.headYaw), rotationX(-e.headPitch));
            if (def.teleports && e.target) off = [(Math.random() - 0.5) * 0.04, 0.03, (Math.random() - 0.5) * 0.04];
            break;
          case 'body':
            // A sitting wolf tilts its hindquarters to the ground.
            if (sit && p.index === 0) { rot = rotationX(-0.7); center = [0, 9 / 16, 2 / 16]; }
            break;
          case 'legFL': case 'legL': rot = rotationX(swing * (def.teleports ? 0.5 : 1)); break;
          case 'legFR': case 'legR': rot = rotationX(-swing * (def.teleports ? 0.5 : 1)); break;
          case 'legBR':
          case 'legBL': {
            const sgn = p.kind === 'legBR' ? 1 : -1;
            if (sit) { rot = rotationX(-Math.PI / 2); off = [0, -4.5 / 16, 1 / 16]; } else if (def.hops) rot = rotationX(e.onGround ? 0 : 1.0);
            else rot = rotationX(sgn * swing);
            break;
          }
          case 'armL':
          case 'armR': {
            const sgn = p.kind === 'armL' ? -1 : 1;
            if (armsUp) rot = rotationX(-Math.PI / 2 + sgn * Math.sin(time * 2) * 0.05 - (def.ranged ? 0.1 : 0));
            else if (def.defender && e.swing > 0) rot = rotationX(-1.9 * Math.sin(e.swing * Math.PI));
            else if (def.teleports && e.carry) rot = rotationX(-0.5);
            else rot = rotationX(sgn * swing * (def.defender || def.teleports ? 0.5 : 1));
            break;
          }
          case 'wingL': rot = rotationZ(e.onGround ? 0 : Math.sin(time * 30) * 0.6); break;
          case 'wingR': rot = rotationZ(e.onGround ? 0 : -Math.sin(time * 30) * 0.6); break;
          case 'batWingL':
          case 'batWingR': {
            const sgn = p.kind === 'batWingL' ? 1 : -1;
            rot = rotationY(sgn * (e.roost ? 1.35 : Math.sin(time * 40 + e.id) * 0.9));
            break;
          }
          case 'tail': {
            const wag = e.tamed && !sit ? Math.sin(time * 9) * 0.4 * (e.walkAmount < 0.3 ? 1 : 0.3) : 0;
            if (sit) off = [0, -5 / 16, 2 / 16];
            rot = compose(rotationY(wag), rotationX(sit ? 1.5 : e.tamed ? 1.1 : 0.6));
            break;
          }
          case 'tentacle':
            rot = compose(rotationY(-p.angle), rotationZ(0.25 + (0.5 + Math.sin(e.swimPhase * 2) * 0.5) * 0.6));
            break;
          default:
            if (p.kind.startsWith('spiderLeg')) {
              const i = Number(p.kind[9]), side = p.kind[10] === 'L' ? -1 : 1;
              const phase = e.walkPhase * 1.6 + ((i + (side > 0 ? 1 : 0)) % 2) * Math.PI;
              const sweep = Math.sin(phase) * 0.35 * e.walkAmount;
              const lift = Math.max(0, Math.cos(phase)) * 0.3 * e.walkAmount;
              const spread = [0.6, 0.2, -0.2, -0.6][i];
              const roll = (i === 0 || i === 3 ? 0.65 : 0.5) - lift;
              rot = compose(rotationY(-side * (spread + sweep)), rotationZ(-side * roll));
            }
        }
        const pv = p.pivot.map((v) => v / 16);
        if (off) { pv[0] += off[0]; pv[1] += off[1]; pv[2] += off[2]; }
        let local;
        if (rot && center) local = compose(translation(pv[0] + center[0], pv[1] + center[1], pv[2] + center[2]), rot, translation(-center[0], -center[1], -center[2]));
        else local = rot ? compose(translation(pv[0], pv[1], pv[2]), rot) : translation(pv[0], pv[1], pv[2]);
        if (p.kind === 'armR') rightArm = local;
        out2.push({ mesh: p.mesh, matrix: compose(...base, local), translucent: p.translucent });
      }
      // Held item (skeleton bow) and carried block (enderman).
      if (def.holds && rightArm) {
        const m = this.itemMesh(def.holds);
        const matrix = compose(...base, rightArm, translation(0, -10 / 16, 0), rotationY(Math.PI / 2), rotationZ(Math.PI / 4), scaling(0.7), translation(-0.5, -0.5, -0.5));
        out.push({ parts: [{ mesh: m.mesh, matrix }], pos: e.pos, light, overlay: [0, 0, 0, 0], texture: m.texture, uvScale: m.uvScale });
      }
      if (e.carry) {
        const m = this.itemMesh(e.carry);
        const matrix = compose(...base, translation(0, 1.1, 0.75), scaling(0.5), translation(-0.5, -0.5, -0.5));
        out.push({ parts: [{ mesh: m.mesh, matrix }], pos: e.pos, light, overlay: [0, 0, 0, 0], texture: m.texture, uvScale: m.uvScale });
      }
      let overlay = [0, 0, 0, 0];
      if (e.hurtTime > 0 || e.dead) overlay = [1, 0.1, 0.1, 0.45];
      else if (e.burn > 0) overlay = [1, 0.5, 0.1, 0.35];
      else if (e.fuse > 0 && Math.floor(e.fuse * 6) % 2 === 0) overlay = [1, 1, 1, 0.6];
      out.push({ parts: out2, pos: e.pos, light, overlay, texture: 'entity' });
    }
    return out;
  }
}
