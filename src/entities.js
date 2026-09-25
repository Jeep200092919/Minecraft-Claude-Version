// Entities: mobs (animals, monsters, villagers) and primed TNT.
// Handles AI, physics, spawning/despawning, combat and render data.
import { B, BLOCKS, IS_SOLID } from './blocks.js';
import { CHUNK_HEIGHT } from './constants.js';
import { MOBS, buildPartMesh } from './mobs.js';
import { moveBody, bodyBox } from './physics.js';
import { buildBlockMesh } from './mesher.js';
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

  hurt(amount, from, mgr) {
    if (this.dead || this.hurtTime > 0.35) return false;
    this.health -= amount;
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
    if (this.health <= 0) this.deathTime = 0;
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
      else this.updateMob(e, dt, sky);
    }
    // Remove finished / far away entities.
    this.list = this.list.filter((e) => {
      if (e.removed) return false;
      const dist = Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]);
      if (e.kind === 'mob' && dist > (e.def.hostile ? 100 : 140)) return false;
      if (!this.world.isReady(e.pos[0], e.pos[2])) return false;
      return true;
    });
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
    if (def.burnsInDay && sky.day > 0.6 && !m.inWater && world.getSkyLight(ix, Math.floor(eyeY), iz) >= 14) {
      m.burn = 1;
    } else m.burn = Math.max(0, m.burn - dt);
    if (m.burn > 0) this.burnMob(m, dt, 1);

    // Keep mobs from overlapping the player.
    if (dist < m.hw + 0.3 && Math.abs(dy) < m.h) {
      const push = (m.hw + 0.3 - dist) * 4;
      m.vel[0] -= (dx / (dist || 1)) * push;
      m.vel[2] -= (dz / (dist || 1)) * push;
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
          return { kind: p.kind, mesh: renderer.createMesh(built.data, built.quads), pivot: p.pivot || [0, 0, 0] };
        });
      }
      this.meshes.set(type, parts);
    }
    return this.meshes.get(type);
  }

  renderList(time) {
    const out = [];
    const world = this.world;
    for (const e of this.list) {
      const light = [
        world.getSkyLight(Math.floor(e.pos[0]), Math.floor(e.pos[1] + 0.5), Math.floor(e.pos[2])),
        world.getBlockLight(Math.floor(e.pos[0]), Math.floor(e.pos[1] + 0.5), Math.floor(e.pos[2])),
      ];
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
      const out2 = parts.map((p) => {
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
