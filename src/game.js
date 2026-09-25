// Game controller: owns the world, player, renderer and UI, runs the main
// loop and implements the gameplay rules.
import { CHUNK_SIZE, CHUNK_HEIGHT, DAY_LENGTH_TICKS, TICKS_PER_SECOND, GAME_NAME } from './constants.js';
import { B, I, BLOCKS, ITEMS, IS_SOLID, isBlockItem, breakTime, blockDrops, orientedBlock } from './blocks.js';
import { World } from './world.js';
import { buildChunkMesh } from './mesher.js';
import { Renderer } from './renderer.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { raycast, selectionBox } from './raycast.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Storage } from './storage.js';
import { UI } from './ui.js';
import { Particles } from './particles.js';
import { hashString } from './noise.js';
import { BIOME_NAMES } from './worldgen.js';
import { EntityManager } from './entities.js';
import { mobSkins } from './mobs.js';
import { tickFurnaces, tickCrops, explode, newFurnace, newChest } from './gameplay.js';
import { skyState } from './sky.js';
import { villageLoot } from './villages.js';

export const DEFAULT_SETTINGS = {
  renderDistance: 8,
  fov: 70,
  sensitivity: 100,
  volume: 60,
  viewBobbing: true,
  invertMouse: false,
  shaders: true,
  shadows: true,
  music: 50,
};

const CREATIVE_HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.COBBLESTONE, B.PLANKS, B.LOG, B.GLASS, B.TORCH, B.LANTERN];
const WALL_TORCH_BY_FACE = [B.WALL_TORCH_PX, B.WALL_TORCH_NX, B.TORCH, null, B.WALL_TORCH_PZ, B.WALL_TORCH_NZ];
const NEIGHBOURS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const PLANT_SOIL = new Set([B.GRASS, B.DIRT, B.SNOWY_GRASS]);
const DESERT_SOIL = new Set([B.SAND, B.GRASS, B.DIRT]);
const now = () => performance.now() / 1000;

export function parseSeed(text) {
  const t = String(text ?? '').trim();
  if (!t) return (Math.random() * 4294967296) >>> 0;
  if (/^-?\d+$/.test(t)) return Number(BigInt.asUintN(32, BigInt(t)));
  return hashString(t);
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.storage = new Storage();
    this.settings = this.storage.loadSettings(DEFAULT_SETTINGS);
    this.sound = new Sound();
    this.input = new Input(canvas);
    this.ui = new UI(this);
    this.particles = new Particles();
    this.entities = new EntityManager(this);
    this.pendingEvents = [];
    this.eating = null;
    this.attackCooldown = 0;
    this.targetMob = null;
    const skins = mobSkins();
    this.renderer.setEntitySkins(skins.pixels, skins.count);
    this.state = 'title';
    this.world = null;
    this.player = null;
    this.inventory = new Inventory();
    this.meta = null;
    this.creative = false;
    this.ticks = 1000;
    this.seconds = 0;
    this.target = null;
    this.mining = null;
    this.breakDelay = 0;
    this.useCooldown = 0;
    this.swing = 0;
    this.placeAnim = 0;
    this.fovBoost = 1;
    this.bobAmount = 0;
    this.showDebug = false;
    this.hideHud = false;
    this.autosave = 0;
    this.lastSpace = -1;
    this.lastW = -1;
    this.sprintLatch = false;
    this.lockFailures = 0;
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.lastTime = performance.now();

    this.input.onKey = (code, e) => this.onKey(code, e);
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.input.fallbackLook) this.pause();
    };
    window.addEventListener('beforeunload', () => this.saveWorld());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveWorld();
    });
    canvas.addEventListener('mousedown', () => {
      this.sound.unlock();
      if (this.state === 'playing' && !this.input.locked && !this.input.fallbackLook) this.resume();
    });

    this.applySettings();
    this.startPanorama();
    this.ui.show('title');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // --- Settings -------------------------------------------------------------------

  applySettings() {
    const s = this.settings;
    this.sound.setVolume(s.volume / 100);
    this.sound.setMusicVolume((s.music ?? 50) / 100);
    this.renderer.fancy = !!s.shaders;
    this.renderer.shadowsEnabled = !!s.shadows;
    this.renderer.shadowDistance = Math.min(96, Math.max(48, s.renderDistance * 16));
  }

  saveSettings() {
    this.storage.saveSettings(this.settings);
  }

  // --- World lifecycle -------------------------------------------------------------

  buildMesh = (chunk) => {
    this.renderer.uploadChunk(chunk, buildChunkMesh(this.world, chunk));
  };

  setWorld(world) {
    this.particles.clear();
    this.entities?.clear();
    if (this.world) {
      this.renderer.dispose(this.world);
      this.world.dispose();
    }
    this.world = world;
    if (world) world.onChunkUnload = (c) => this.renderer.deleteChunk(c);
  }

  startPanorama() {
    const world = new World({ seed: (Math.random() * 4294967296) >>> 0 });
    this.setWorld(world);
    const spawn = world.generator.findSpawn();
    this.panorama = { pos: [spawn.x, spawn.y + 16, spawn.z], yaw: Math.random() * Math.PI * 2 };
    this.meta = null;
    this.player = null;
    this.state = 'title';
    this.ticks = 2500;
  }

  createWorld({ name, seed, mode }) {
    const meta = this.storage.createWorld({ name, seed: parseSeed(seed), mode });
    this.startWorld(meta, null);
  }

  playWorld(id) {
    const meta = this.storage.listWorlds().find((w) => w.id === id);
    if (!meta) return;
    this.startWorld(meta, this.storage.loadWorld(id));
  }

  startWorld(meta, saved) {
    this.meta = meta;
    this.creative = meta.mode === 'creative';
    this.setWorld(new World({ seed: meta.seed, edits: saved?.edits, blockEntities: saved?.blockEntities }));
    this.player = new Player();
    if (saved?.player) {
      this.player.load(saved.player);
      this.needsSpawnFix = false;
    } else {
      const s = this.world.generator.findSpawn();
      this.player.pos = [s.x, s.y + 1, s.z];
      this.player.spawn = [...this.player.pos];
      this.needsSpawnFix = true;
    }
    this.inventory = saved?.inventory ? Inventory.fromJSON(saved.inventory) : new Inventory();
    if (!saved && this.creative) CREATIVE_HOTBAR.forEach((id, i) => (this.inventory.slots[i] = { id, count: 64 }));
    this.ticks = Number.isFinite(saved?.ticks) ? saved.ticks : 1000;
    this.mining = null;
    this.target = null;
    this.beginLoading('Generating world');
    this.saveWorld();
  }

  beginLoading(title) {
    this.state = 'loading';
    this.input.unlock();
    document.getElementById('loading-title').textContent = title;
    this.ui.setLoading(0, 'Building terrain…');
    this.ui.setHudVisible(false);
    this.ui.show('loading');
  }

  finishLoading() {
    const p = this.player;
    if (this.needsSpawnFix) {
      const x = Math.floor(p.pos[0]), z = Math.floor(p.pos[2]);
      const y = this.world.surfaceY(x, z, (id) => IS_SOLID[id] === 1);
      p.pos[1] = y + 1;
      p.spawn = [...p.pos];
      this.needsSpawnFix = false;
    }
    this.state = 'playing';
    this.ui.show(null);
    this.ui.setHudVisible(true);
    this.ui.hotbarSig = '';
    this.ui.statusSig = '';
    this.ui.toast(this.creative ? 'Creative mode — double-tap Space to fly' : 'Survival mode — punch a tree to get started!');
    this.lockPointer();
  }

  saveWorld() {
    if (!this.meta || !this.world || !this.player || this.state === 'loading') return false;
    return this.storage.saveWorld(this.meta, {
      player: this.player.toJSON(),
      inventory: this.inventory.toJSON(),
      ticks: this.ticks,
      edits: this.world.edits,
      blockEntities: this.world.blockEntities,
    });
  }

  saveAndQuit() {
    if (this.ui.screen === 'inventory') this.ui.closeInventory();
    this.saveWorld();
    this.input.unlock();
    this.ui.setHudVisible(false);
    this.startPanorama();
    this.ui.show('title');
  }

  // --- State transitions ------------------------------------------------------------

  lockPointer() {
    this.input.lock().then((ok) => {
      if (ok || this.state !== 'playing') return;
      this.lockFailures++;
      if (this.lockFailures >= 2) {
        // Pointer lock is not available (e.g. sandboxed frame): look around by
        // moving the mouse instead.
        this.input.fallbackLook = true;
        this.ui.show(null);
        this.ui.toast('Pointer lock unavailable — move the mouse to look, Esc to pause');
      } else {
        this.ui.show('resume');
      }
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.mining = null;
    this.input.unlock();
    this.input.reset();
    this.ui.show('pause');
    this.saveWorld();
  }

  resume() {
    if (this.state === 'paused' || this.state === 'playing') {
      this.state = 'playing';
      this.ui.show(null);
      this.input.reset();
      this.lockPointer();
    }
  }

  // mode: 'player', 'table' or { type: 'chest' | 'furnace', entity }.
  openInventory(mode = 'player') {
    if (this.state !== 'playing') return;
    this.state = 'inventory';
    this.mining = null;
    this.eating = null;
    this.input.unlock();
    this.input.reset();
    this.ui.openInventory(mode);
  }

  openContainer(x, y, z) {
    const type = BLOCKS[this.world.getBlock(x, y, z)].container;
    let be = this.world.getBlockEntity(x, y, z);
    if (!be || be.type !== type) {
      be = type === 'furnace' ? newFurnace() : newChest();
      // Player-placed containers get their block entity when placed, so a
      // missing one means a chest generated in a village: fill it with loot.
      if (type === 'chest') be.slots = villageLoot(x, y, z);
      this.world.setBlockEntity(x, y, z, be);
    }
    this.openInventory({ type, entity: be });
  }

  explode(x, y, z, power) {
    explode(this, x, y, z, power);
  }

  closeInventory() {
    if (this.state !== 'inventory') return;
    this.ui.closeInventory();
    this.state = 'playing';
    this.ui.show(null);
    this.input.reset();
    this.lockPointer();
  }

  respawn() {
    this.player.respawn();
    this.beginLoading('Respawning');
  }

  // --- Input -----------------------------------------------------------------------------

  onKey(code) {
    const t = now();
    if (this.state === 'inventory') {
      if (code === 'KeyE' || code === 'Escape') this.closeInventory();
      return;
    }
    if (this.state === 'paused' && code === 'Escape' && this.ui.screen === 'pause') {
      this.resume();
      return;
    }
    if (this.state !== 'playing') return;
    if (code === 'Escape') this.pause();
    else if (code === 'KeyE') this.openInventory('player');
    else if (code === 'F3') this.showDebug = !this.showDebug;
    else if (code === 'F1') {
      this.hideHud = !this.hideHud;
      this.ui.setHudVisible(!this.hideHud);
    } else if (code.startsWith('Digit') && code !== 'Digit0') this.selectSlot(Number(code.slice(5)) - 1);
    else if (code === 'Space') {
      if (this.creative && t - this.lastSpace < 0.3) {
        this.player.flying = !this.player.flying;
        this.player.vel[1] = 0;
        this.lastSpace = -1;
      } else this.lastSpace = t;
    } else if (code === 'KeyW') {
      if (t - this.lastW < 0.3) this.sprintLatch = true;
      this.lastW = t;
    }
  }

  selectSlot(i) {
    this.inventory.selected = ((i % 9) + 9) % 9;
    this.mining = null;
    const s = this.inventory.selectedStack;
    this.ui.showItemName(s ? ITEMS.get(s.id).displayName : '');
  }

  // --- Main loop ---------------------------------------------------------------------------

  loop(t) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (t - this.lastTime) / 1000));
    this.lastTime = t;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    try {
      this.frame(dt);
    } catch (err) {
      console.error(err);
      if (this.state !== 'error') {
        this.state = 'error';
        this.input.unlock();
        this.ui.showError(String(err && err.stack ? err.stack : err));
      }
    }
  }

  frame(dt) {
    this.seconds += dt;
    this.ui.tick(dt);
    const rd = this.settings.renderDistance;
    if (this.state === 'error') return;

    if (this.state === 'title') {
      const p = this.panorama;
      p.yaw += dt * 0.035;
      this.ticks = (this.ticks + dt * 4) % DAY_LENGTH_TICKS;
      this.world.update(Math.floor(p.pos[0] / CHUNK_SIZE), Math.floor(p.pos[2] / CHUNK_SIZE), Math.min(rd, 6), 10, this.buildMesh);
      this.renderer.render({
        world: this.world,
        camera: { pos: p.pos, yaw: p.yaw, pitch: -0.12, fov: 75 },
        ticks: this.ticks, seconds: this.seconds, renderDistance: Math.min(rd, 6),
      });
      return;
    }

    const player = this.player;
    const pcx = Math.floor(player.pos[0] / CHUNK_SIZE), pcz = Math.floor(player.pos[2] / CHUNK_SIZE);

    if (this.state === 'loading') {
      this.world.update(pcx, pcz, rd, 40, this.buildMesh);
      let total = 0, done = 0;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dz * dz > 5) continue;
          total++;
          const c = this.world.getChunk(pcx + dx, pcz + dz);
          if (c && c.mesh) done++;
        }
      }
      this.ui.setLoading(done / total, `Preparing spawn area… ${done}/${total} chunks`);
      if (done === total) this.finishLoading();
      else return;
    }

    const playing = this.state === 'playing';
    if (playing && !this.input.locked && !this.input.fallbackLook) {
      // Clicks that only re-capture the mouse must not break blocks.
      this.input.takePressedButtons();
      this.input.buttons.clear();
    }
    if (playing) {
      this.updateLook();
      const ready = this.world.isReady(player.pos[0], player.pos[2]);
      const events = [];
      if (ready) {
        const input = this.movementInput();
        player.update(dt, input, this.world, this.creative, events);
      }
      this.handleEvents(events);
      this.updateInteraction(dt);
      this.ticks = (this.ticks + dt * TICKS_PER_SECOND) % DAY_LENGTH_TICKS;
      this.autosave += dt;
      if (this.autosave > 30) {
        this.autosave = 0;
        this.saveWorld();
      }
    } else {
      this.input.takePressedButtons();
      this.input.takeMouse();
    }

    this.world.update(pcx, pcz, rd, playing ? 6 : 12, this.buildMesh);
    if (this.state !== 'paused' && this.state !== 'inventory') this.particles.update(dt, this.world);
    const simulate = this.state === 'playing' || this.state === 'inventory';
    if (simulate && this.world.isReady(player.pos[0], player.pos[2])) {
      this.entities.update(dt, skyState(this.ticks));
      tickFurnaces(this, dt);
      tickCrops(this, dt);
    }
    if (this.pendingEvents.length) {
      const ev = this.pendingEvents;
      this.pendingEvents = [];
      this.handleEvents(ev);
    }
    if (this.state === 'inventory') this.ui.refreshContainer();
    this.sound.updateMusic(dt);

    // Animations
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt / 0.3);
    this.placeAnim = Math.max(0, this.placeAnim - dt * 5);
    const speed = Math.hypot(player.vel[0], player.vel[2]);
    const bobTarget = this.settings.viewBobbing && player.onGround && !player.flying ? Math.min(1, speed / 4.3) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, dt * 8);
    const fovTarget = player.sprinting ? 1.12 : 1;
    this.fovBoost += (fovTarget - this.fovBoost) * Math.min(1, dt * 8);

    const eye = player.eye();
    const bob = player.walkDist * Math.PI * 0.62;
    const camPos = [...eye];
    if (this.bobAmount > 0.01) {
      const b = this.bobAmount;
      camPos[1] += -Math.abs(Math.cos(bob)) * 0.07 * b + 0.035 * b;
      camPos[0] += Math.cos(player.yaw) * Math.sin(bob) * 0.035 * b;
      camPos[2] += -Math.sin(player.yaw) * Math.sin(bob) * 0.035 * b;
    }
    const ex = Math.floor(eye[0]), ey = Math.floor(eye[1]), ez = Math.floor(eye[2]);
    const t = this.target;
    this.renderer.render({
      world: this.world,
      camera: { pos: camPos, yaw: player.yaw, pitch: player.pitch, fov: this.settings.fov * this.fovBoost },
      ticks: this.ticks,
      seconds: this.seconds,
      renderDistance: rd,
      selection: t && !this.hideHud ? { x: t.x, y: t.y, z: t.z, box: selectionBox(t.id) } : null,
      crack: this.mining && this.mining.progress > 0 ? { x: this.mining.x, y: this.mining.y, z: this.mining.z, stage: Math.min(9, Math.floor(this.mining.progress * 10)) } : null,
      held: this.inventory.selectedId,
      showHand: !this.hideHud && this.state !== 'dead',
      underwater: player.headInWater,
      inLava: player.headInLava,
      handSwing: this.swing > 0 ? 1 - this.swing : 0,
      bob,
      bobAmount: this.bobAmount,
      placeAnim: this.placeAnim,
      light: [this.world.getSkyLight(ex, ey, ez), this.world.getBlockLight(ex, ey, ez)],
      particles: this.particles.list,
      entities: this.entities.renderList(this.seconds),
      eating: this.eating ? 1 : 0,
    });

    // HUD
    this.ui.updateHotbar(this.inventory);
    this.ui.updateStatus(player, this.creative);
    this.ui.setTint(player.headInLava ? 'lava' : player.headInWater ? 'water' : '');
    this.ui.setDebug(this.showDebug, this.showDebug ? this.debugText() : '');
  }

  updateLook() {
    const [dx, dy] = this.input.takeMouse();
    const k = 0.0022 * (this.settings.sensitivity / 100);
    const p = this.player;
    p.yaw -= dx * k;
    p.pitch -= dy * k * (this.settings.invertMouse ? -1 : 1);
    const lim = Math.PI / 2 - 0.001;
    p.pitch = Math.max(-lim, Math.min(lim, p.pitch));
    p.yaw %= Math.PI * 2;
    const wheel = this.input.takeWheel();
    if (wheel) this.selectSlot(this.inventory.selected + wheel);
  }

  movementInput() {
    const k = (c) => this.input.isDown(c);
    const forward = k('KeyW') || k('ArrowUp');
    if (!forward) this.sprintLatch = false;
    return {
      forward,
      back: k('KeyS') || k('ArrowDown'),
      left: k('KeyA') || k('ArrowLeft'),
      right: k('KeyD') || k('ArrowRight'),
      jump: k('Space'),
      sneak: k('ShiftLeft') || k('ShiftRight'),
      sprint: k('ControlLeft') || k('ControlRight') || this.sprintLatch,
    };
  }

  handleEvents(events) {
    for (const e of events) {
      if (e.type === 'step') this.sound.step(e.block);
      else if (e.type === 'hurt') this.sound.hurt();
      else if (e.type === 'splash') this.sound.splash();
      else if (e.type === 'land') this.sound.step(B.STONE);
      else if (e.type === 'death') {
        if (this.state === 'inventory') this.ui.closeInventory();
        this.state = 'dead';
        this.mining = null;
        this.eating = null;
        this.input.unlock();
        this.ui.show('death');
      }
    }
  }

  // --- Block interaction ---------------------------------------------------------------------

  updateInteraction(dt) {
    const input = this.input;
    const pressed = input.takePressedButtons();
    const p = this.player;
    const inv = this.inventory;
    const reach = this.creative ? 5 : 4.5;
    const eye = p.eye(), dir = p.lookDir();
    this.target = raycast((x, y, z) => this.world.getBlock(x, y, z), eye, dir, reach);
    const t = this.target;
    const mobHit = this.entities.raycast(eye, dir, this.creative ? 5 : 3.5);
    this.targetMob = mobHit && (!t || mobHit.t < t.distance) ? mobHit.entity : null;
    this.useCooldown -= dt;
    this.breakDelay -= dt;
    this.attackCooldown -= dt;

    // Left button: attack a mob, or break blocks.
    if (pressed.includes(0)) this.swing = 1;
    if (this.targetMob) {
      this.mining = null;
      if (pressed.includes(0) && this.attackCooldown <= 0) this.attack(this.targetMob);
    } else if (input.buttons.has(0) && t) {
      if (this.creative) {
        if (pressed.includes(0) || this.breakDelay <= 0) {
          this.breakBlock(t.x, t.y, t.z);
          this.breakDelay = 0.25;
        }
      } else if (this.breakDelay <= 0) {
        const m = this.mining;
        if (!m || m.x !== t.x || m.y !== t.y || m.z !== t.z || m.id !== t.id) {
          this.mining = { x: t.x, y: t.y, z: t.z, id: t.id, progress: 0, soundTimer: 0 };
        }
        const bt = breakTime(t.id, inv.selectedId);
        const mm = this.mining;
        if (bt !== Infinity) mm.progress += bt === 0 ? 1 : dt / bt;
        mm.soundTimer -= dt;
        if (mm.soundTimer <= 0) {
          this.sound.dig(t.id);
          this.particles.chip(t.x, t.y, t.z, t.id, t.normal);
          mm.soundTimer = 0.23;
        }
        if (this.swing <= 0) this.swing = 1;
        if (mm.progress >= 1) {
          this.breakBlock(t.x, t.y, t.z);
          p.addExhaustion(0.005, this.creative);
          this.mining = null;
          this.breakDelay = 0.25;
        }
      }
    } else {
      this.mining = null;
    }

    // Right button: eat (hold), use or place.
    const held = inv.selectedStack;
    const heldItem = held ? ITEMS.get(held.id) : null;
    const interactive = t && !p.sneaking && this.isInteractive(t.id, heldItem);
    if (input.buttons.has(2) && heldItem?.food && !interactive && p.hunger < 20) {
      const e = this.eating;
      if (!e || e.slot !== inv.selected || e.id !== held.id) this.eating = { slot: inv.selected, id: held.id, time: 0, sound: 0 };
      const eat = this.eating;
      eat.time += dt;
      eat.sound -= dt;
      if (eat.sound <= 0) {
        this.sound.eat();
        eat.sound = 0.21;
      }
      if (eat.time >= 1.6) {
        p.eat(heldItem.food);
        if (!this.creative) inv.take(inv.selected, 1);
        this.sound.burp();
        this.eating = null;
        this.useCooldown = 0.3;
      }
    } else {
      this.eating = null;
      if (pressed.includes(2) || (input.buttons.has(2) && this.useCooldown <= 0)) {
        if (t && !this.targetMob) this.useBlock(t);
        this.useCooldown = pressed.includes(2) ? 0.3 : 0.22;
      }
    }

    // Middle button: pick block
    if (pressed.includes(1) && t) {
      const b = BLOCKS[t.id];
      const id = b.shape === 'torch' ? B.TORCH : t.id === B.HANGING_LANTERN ? B.LANTERN : (b.baseId ?? t.id);
      if (inv.pick(id, this.creative)) this.ui.showItemName(ITEMS.get(id)?.displayName);
    }
  }

  isInteractive(id, heldItem) {
    const b = BLOCKS[id];
    return id === B.CRAFTING_TABLE || !!b.container || (id === B.TNT && heldItem?.id === I.FLINT_AND_STEEL);
  }

  attack(mob) {
    const p = this.player;
    const item = ITEMS.get(this.inventory.selectedId);
    let dmg = item ? item.damage : 1;
    if (!p.onGround && p.vel[1] < -1 && !p.flying) {
      dmg *= 1.5; // critical hit while falling
      this.particles.smoke(mob.pos[0], mob.pos[1] + mob.h, mob.pos[2], 4, 0.3, 0.06, 0.1);
    }
    const wasAlive = !mob.dead;
    if (mob.hurt(dmg, p.pos, this.entities) && wasAlive && mob.dead && !this.creative) {
      for (const [id, min, max] of mob.def.drops) {
        const n = min + Math.floor(Math.random() * (max - min + 1));
        if (n > 0 && this.inventory.add(id, n) < n) this.sound.pop();
      }
    }
    p.addExhaustion(0.1, this.creative);
    this.attackCooldown = 0.25;
    this.swing = 1;
  }

  breakBlock(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR || (!this.creative && BLOCKS[id].hardness < 0)) return;
    if (!this.world.setBlock(x, y, z, B.AIR)) return;
    this.sound.breakBlock(id);
    this.particles.burst(x, y, z, id);
    const be = BLOCKS[id].container ? this.world.removeBlockEntity(x, y, z) : null;
    if (be) for (const s of be.slots) if (s) this.inventory.add(s.id, s.count);
    if (!this.creative) this.giveDrop(id);
    this.blockUpdates(x, y, z);
    this.flowWater(x, y, z);
  }

  giveDrop(id) {
    let got = false;
    for (const [item, n] of blockDrops(id, this.inventory.selectedId)) {
      if (this.inventory.add(item, n) < n) got = true;
    }
    if (got) this.sound.pop();
  }

  canStay(id, x, y, z) {
    const b = BLOCKS[id];
    if (!b.support) return true;
    const w = this.world;
    if (b.support === 'ground') {
      const below = w.getBlock(x, y - 1, z);
      return (id === B.DEAD_BUSH ? DESERT_SOIL : PLANT_SOIL).has(below);
    }
    if (b.support === 'cactus') {
      const below = w.getBlock(x, y - 1, z);
      return below === B.SAND || below === B.CACTUS;
    }
    if (b.support === 'torch') {
      const [ax, ay, az] = b.attach;
      return IS_SOLID[w.getBlock(x + ax, y + ay, z + az)] === 1;
    }
    if (b.support === 'lantern') return IS_SOLID[w.getBlock(x, y - 1, z)] === 1;
    if (b.support === 'hanging') return IS_SOLID[w.getBlock(x, y + 1, z)] === 1 || w.getBlock(x, y + 1, z) === B.OAK_FENCE;
    if (b.support === 'farmland') return w.getBlock(x, y - 1, z) === B.FARMLAND;
    return true;
  }

  useBlock(t) {
    const w = this.world;
    const p = this.player;
    const inv = this.inventory;
    const s = inv.selectedStack;
    const it = s ? ITEMS.get(s.id) : null;
    if (!p.sneaking) {
      if (t.id === B.CRAFTING_TABLE) {
        this.openInventory('table');
        return;
      }
      if (BLOCKS[t.id].container) {
        this.openContainer(t.x, t.y, t.z);
        return;
      }
    }
    if (t.id === B.TNT && it?.id === I.FLINT_AND_STEEL) {
      w.setBlock(t.x, t.y, t.z, B.AIR);
      this.entities.primeTNT(t.x, t.y, t.z, 4);
      this.swing = 1;
      return;
    }
    if (!it) return;
    const above = w.getBlock(t.x, t.y + 1, t.z);
    if (it.spawns) {
      const x = t.x + t.normal[0], y = t.y + t.normal[1], z = t.z + t.normal[2];
      this.entities.spawn(it.spawns, x + 0.5, y, z + 0.5);
      if (!this.creative) inv.take(inv.selected, 1);
      this.swing = 1;
      return;
    }
    if (it.tool?.type === 'hoe' && t.face === 2 && above === B.AIR && [B.GRASS, B.DIRT, B.DIRT_PATH].includes(t.id)) {
      w.setBlock(t.x, t.y, t.z, B.FARMLAND);
      this.sound.place(B.DIRT);
      this.swing = 1;
      return;
    }
    if (it.plants && t.id === B.FARMLAND && t.face === 2 && above === B.AIR) {
      w.setBlock(t.x, t.y + 1, t.z, it.plants);
      if (!this.creative) inv.take(inv.selected, 1);
      this.sound.place(B.TALL_GRASS);
      this.swing = 1;
      return;
    }
    if (!isBlockItem(s.id)) return;
    let id = s.id;
    let x, y, z, face = t.face;
    if (BLOCKS[t.id].replaceable) {
      x = t.x; y = t.y; z = t.z; face = 2;
    } else {
      x = t.x + t.normal[0]; y = t.y + t.normal[1]; z = t.z + t.normal[2];
    }
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    if (!BLOCKS[w.getBlock(x, y, z)].replaceable) return;
    if (BLOCKS[id].shape === 'torch') {
      id = WALL_TORCH_BY_FACE[face];
      if (!id) return;
    }
    if (id === B.LANTERN && face === 3) id = B.HANGING_LANTERN;
    const b = BLOCKS[id];
    if (b.facing >= 0 && b.baseId !== undefined) {
      const d = p.lookDir();
      const look = Math.abs(d[0]) > Math.abs(d[2]) ? (d[0] > 0 ? 0 : 1) : (d[2] > 0 ? 2 : 3);
      id = orientedBlock(b.baseId, b.shape === 'stairs' ? look : [1, 0, 3, 2][look]);
    }
    if (!this.canStay(id, x, y, z)) return;
    if (BLOCKS[id].solid && p.intersectsBlock(x, y, z)) return;
    for (const e of this.entities.list) {
      if (e.kind === 'mob' && BLOCKS[id].solid && Math.abs(e.pos[0] - x - 0.5) < e.hw + 0.5 && Math.abs(e.pos[2] - z - 0.5) < e.hw + 0.5 && e.pos[1] < y + 1 && e.pos[1] + e.h > y) return;
    }
    if (!w.setBlock(x, y, z, id)) return;
    if (BLOCKS[id].container === 'furnace') w.setBlockEntity(x, y, z, newFurnace());
    else if (BLOCKS[id].container === 'chest') w.setBlockEntity(x, y, z, newChest());
    if (!this.creative) inv.take(inv.selected, 1);
    this.sound.place(id);
    this.swing = 1;
    this.placeAnim = 1;
    this.blockUpdates(x, y, z);
  }

  // Block physics after a change at (x, y, z): unsupported plants/torches
  // pop off, sand and gravel fall.
  blockUpdates(x, y, z) {
    const w = this.world;
    const queue = [[x, y, z]];
    for (const [dx, dy, dz] of NEIGHBOURS) queue.push([x + dx, y + dy, z + dz]);
    for (let n = 0; n < queue.length && n < 512; n++) {
      const [qx, qy, qz] = queue[n];
      if (qy < 0 || qy >= CHUNK_HEIGHT) continue;
      const id = w.getBlock(qx, qy, qz);
      if (id === B.AIR) continue;
      let changed = false;
      if (!this.canStay(id, qx, qy, qz)) {
        w.setBlock(qx, qy, qz, B.AIR);
        if (!this.creative) this.giveDrop(id);
        changed = true;
      } else if (BLOCKS[id].falls) {
        let ny = qy;
        while (ny > 0 && BLOCKS[w.getBlock(qx, ny - 1, qz)].replaceable) ny--;
        if (ny !== qy) {
          w.setBlock(qx, qy, qz, B.AIR);
          w.setBlock(qx, ny, qz, id);
          for (const [dx, dy, dz] of NEIGHBOURS) queue.push([qx + dx, ny + dy, qz + dz]);
          changed = true;
        }
      }
      if (changed) for (const [dx, dy, dz] of NEIGHBOURS) queue.push([qx + dx, qy + dy, qz + dz]);
    }
  }

  // Simple water flow into a freshly opened cell: falls freely and spreads a
  // few blocks sideways across solid floors.
  flowWater(x, y, z) {
    const w = this.world;
    const isWater = (a, b, c) => w.getBlock(a, b, c) === B.WATER;
    let seedDist = -1;
    if (isWater(x, y + 1, z)) seedDist = 0;
    else if (isWater(x + 1, y, z) || isWater(x - 1, y, z) || isWater(x, y, z + 1) || isWater(x, y, z - 1)) seedDist = 1;
    if (seedDist < 0) return;
    const queue = [[x, y, z, seedDist]];
    const seen = new Set();
    let budget = 96;
    for (let n = 0; n < queue.length && budget > 0; n++) {
      const [qx, qy, qz, dist] = queue[n];
      const key = `${qx},${qy},${qz}`;
      if (seen.has(key) || qy < 1) continue;
      seen.add(key);
      const cur = w.getBlock(qx, qy, qz);
      if (cur !== B.AIR && !(BLOCKS[cur].replaceable && !BLOCKS[cur].liquid)) continue;
      if (!w.setBlock(qx, qy, qz, B.WATER)) continue;
      budget--;
      const below = w.getBlock(qx, qy - 1, qz);
      if (BLOCKS[below].replaceable && !BLOCKS[below].liquid) {
        queue.push([qx, qy - 1, qz, 0]);
      } else if (dist < 4) {
        for (const [dx, , dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) queue.push([qx + dx, qy, qz + dz, dist + 1]);
      }
    }
  }

  // --- Debug overlay -------------------------------------------------------------------------

  debugText() {
    const p = this.player;
    const [x, y, z] = p.pos;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const dirs = ['north (-Z)', 'west (-X)', 'south (+Z)', 'east (+X)'];
    const facing = dirs[((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4];
    const col = this.world.generator.column(bx, bz);
    const ey = Math.floor(p.eye()[1]);
    const day = Math.floor(this.ticks / 1000 + 6) % 24;
    const minutes = Math.floor(((this.ticks % 1000) / 1000) * 60);
    const s = this.renderer.stats;
    const t = this.target;
    return [
      `${GAME_NAME} — ${this.fps} fps`,
      `XYZ: ${x.toFixed(2)} / ${y.toFixed(2)} / ${z.toFixed(2)}`,
      `Block: ${bx} ${by} ${bz}  Chunk: ${Math.floor(bx / 16)} ${Math.floor(bz / 16)}`,
      `Facing: ${facing}`,
      `Biome: ${BIOME_NAMES[col.biome]}`,
      `Light: sky ${this.world.getSkyLight(bx, ey, bz)}, block ${this.world.getBlockLight(bx, ey, bz)}`,
      `Chunks: ${this.world.chunks.size} loaded, ${s.drawn}/${s.chunks} drawn, ${(s.quads / 1000).toFixed(0)}k quads`,
      `Seed: ${this.world.seed}  Time: ${String(day).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      `Mode: ${this.creative ? 'Creative' : 'Survival'}${p.flying ? ' (flying)' : ''}  Hunger: ${p.hunger}  Mobs: ${this.entities.list.length}`,
      t ? `Looking at: ${BLOCKS[t.id].displayName} (${t.x}, ${t.y}, ${t.z})` : 'Looking at: —',
    ].join('\n');
  }
}
