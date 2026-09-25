import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B, I } from '../src/blocks.js';
import { World } from '../src/world.js';
import { Player } from '../src/player.js';
import { EntityManager, mobCategory } from '../src/entities.js';
import { MOBS } from '../src/mobs.js';

// A small flat grass world with a stub game around the entity manager.
function fakeGame() {
  const world = new World({ seed: 1 });
  world.generator.generate = (chunk) => {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        chunk.set(x, 0, z, B.BEDROCK);
        for (let y = 1; y < 60; y++) chunk.set(x, y, z, B.STONE);
        chunk.set(x, 60, z, B.GRASS);
      }
    }
    chunk.computeHeightmap();
  };
  world.ensureArea(0.5, 0.5, 1, () => {});
  const player = new Player();
  player.pos = [0.5, 61, 0.5];
  const noop = () => {};
  const stub = new Proxy({}, { get: () => noop });
  const game = {
    world, player, sound: stub, particles: stub, creative: false, state: 'playing', pendingEvents: [], seconds: 0,
    chat: { add: noop },
    setBlockSynced(x, y, z, id) { world.setBlock(x, y, z, id); },
    explode: noop, pickupItem: () => false, gainXP: noop,
    projectileHitPlayer(pr) { player.damage(pr.damage, this.pendingEvents, false); },
  };
  game.entities = new EntityManager(game);
  return game;
}

// Runs the simulation (without natural spawning) for `seconds`.
function run(game, seconds, sky = { day: 0, rain: 0 }) {
  const E = game.entities;
  for (let t = 0; t < seconds; t += 0.05) {
    E.frameP = null;
    for (const e of [...E.list]) {
      if (e.removed) continue;
      if (e.kind === 'mob') E.updateMob(e, 0.05, sky);
      else if (e.kind === 'projectile') E.updateProjectile(e, 0.05);
    }
    E.list = E.list.filter((e) => !e.removed);
  }
}

test('every mob has a spawn category and a sane model', () => {
  const cats = Object.values(MOBS).map(mobCategory);
  for (const c of ['creature', 'monster', 'water', 'ambient', 'misc']) assert.ok(cats.includes(c), c);
  for (const [name, def] of Object.entries(MOBS)) {
    assert.ok(def.parts.length > 0, name);
    for (const p of def.parts) assert.ok(p.box.every(Number.isInteger), `${name} ${p.kind} box is in whole pixels`);
  }
});

test('big slimes split into smaller slimes; small ones drop slimeballs', () => {
  const g = fakeGame();
  const E = g.entities;
  const big = E.spawn('slime', 4.5, 61, 4.5, { size: 4 });
  assert.equal(big.health, 16);
  assert.ok(Math.abs(big.hw * 2 - 2.08) < 1e-9, 'size 4 slime is 2.08 wide');
  big.hurt(100, null, E, 'player');
  const kids = E.list.filter((e) => e.kind === 'mob' && e.type === 'slime' && !e.dead);
  assert.ok(kids.length >= 2 && kids.length <= 4, `${kids.length} slimes`);
  assert.ok(kids.every((k) => k.size === 2));
  const small = E.spawn('slime', 2.5, 61, 2.5, { size: 1 });
  let balls = 0;
  for (let i = 0; i < 20; i++) {
    const s = E.spawn('slime', 2.5, 61, 2.5, { size: 1 });
    s.hurt(100, null, E, 'player');
  }
  balls = E.list.filter((e) => e.kind === 'item' && e.stack.id === I.SLIMEBALL).length;
  assert.ok(balls > 0, 'small slimes drop slimeballs');
  assert.equal(small.size, 1);
});

test('wolves are tamed with bones, sit on command and follow their owner', () => {
  const g = fakeGame();
  const E = g.entities;
  const w = E.spawn('wolf', 3.5, 61, 0.5);
  let bones = 0;
  while (!w.tamed && bones < 100) {
    assert.equal(E.interactMob(w, I.BONE, 'player'), 'consume');
    bones++;
  }
  assert.ok(w.tamed, 'tamed');
  assert.equal(w.owner, 'player');
  assert.ok(w.sitting && w.persistent);
  assert.equal(w.maxHealth, 20);
  // Stand up and follow: the owner walks away and the wolf catches up.
  assert.equal(E.interactMob(w, null, 'player'), 'use');
  assert.equal(w.sitting, false);
  g.player.pos = [20.5, 61, 0.5];
  run(g, 3);
  assert.ok(Math.hypot(w.pos[0] - 20.5, w.pos[2] - 0.5) < 6, `wolf near owner (${w.pos.map((v) => v.toFixed(1))})`);
});

test('iron golems fight zombies', () => {
  const g = fakeGame();
  const E = g.entities;
  g.creative = true; // keep the zombie from chasing the player
  const golem = E.spawn('iron_golem', 0.5, 61, 6.5);
  const zombie = E.spawn('zombie', 4.5, 61, 6.5);
  run(g, 20);
  assert.ok(zombie.dead || zombie.removed, 'zombie killed');
  assert.ok(!golem.dead);
});

test('skeletons shoot arrows at survival players', () => {
  const g = fakeGame();
  const E = g.entities;
  const s = E.spawn('skeleton', 10.5, 61, 0.5);
  let arrows = 0;
  const shoot = E.shoot.bind(E);
  E.shoot = (type, ...rest) => { if (type === 'arrow' && rest[2] === s) arrows++; return shoot(type, ...rest); };
  for (let i = 0; i < 8 && g.player.health === 20; i++) run(g, 1);
  assert.ok(arrows > 0, 'fired');
  assert.ok(g.player.health < 20, `player hit (health ${g.player.health})`);
});

test('endermen get angry when stared at and teleport when hurt', () => {
  const g = fakeGame();
  const E = g.entities;
  const m = E.spawn('enderman', 0.5, 61, -6.5);
  const p = g.player;
  // Look straight at its head.
  const eye = [p.pos[0], p.pos[1] + 1.62, p.pos[2]];
  const head = [m.pos[0], m.pos[1] + m.h - 0.25, m.pos[2]];
  p.yaw = 0;
  p.pitch = Math.atan2(head[1] - eye[1], eye[2] - head[2]);
  E.checkStares();
  assert.deepEqual(m.target, { ref: 'player' });
  const before = [...m.pos];
  let moved = false;
  for (let i = 0; i < 10 && !moved; i++) {
    m.hurtTime = 0;
    m.hurt(1, null, E, 'player');
    moved = m.pos[0] !== before[0] || m.pos[2] !== before[2];
  }
  assert.ok(moved, 'teleported');
});

test('tamed wolves defend their owner', () => {
  const g = fakeGame();
  const E = g.entities;
  const w = E.spawn('wolf', 1.5, 61, 1.5);
  w.tamed = true;
  w.owner = 'player';
  const z = E.spawn('zombie', 3.5, 61, 0.5);
  E.damagePlayer('player', 2, z.pos, z);
  assert.equal(w.target, z);
});
