// Game controller: owns the world, player, renderer and UI, runs the main
// loop and implements the gameplay rules.
import { CHUNK_SIZE, CHUNK_HEIGHT, DAY_LENGTH_TICKS, TICKS_PER_SECOND, GAME_NAME } from './constants.js';
import { B, I, BLOCKS, ITEMS, IS_SOLID, breakTime, blockDrops } from './blocks.js';
import { World } from './world.js';
import { buildChunkMesh } from './mesher.js';
import { Renderer } from './renderer.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { raycast, selectionBox } from './raycast.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Storage, encodeEdits, decodeEdits, encodeBlockEntities, decodeBlockEntities } from './storage.js';
import { UI } from './ui.js';
import { Particles } from './particles.js';
import { hashString } from './noise.js';
import { BIOME_NAMES } from './worldgen.js';
import { EntityManager } from './entities.js';
import { mobSkins } from './mobs.js';
import { tickFurnaces, tickCrops, explode, newFurnace, newChest } from './gameplay.js';
import { useOnBlock, useInAir, isInteractive, partnerOf } from './interact.js';
import { PlayerRenderer } from './playermodel.js';
import { Weather } from './weather.js';
import { Chat } from './chat.js';
import { skyState } from './sky.js';
import { rollLoot } from './structures.js';
import { Net, serverUrl, DEFAULT_PORT } from './net.js';

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
const NEIGHBOURS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const PLANT_SOIL = new Set([B.GRASS, B.DIRT, B.SNOWY_GRASS]);
const DESERT_SOIL = new Set([B.SAND, B.GRASS, B.DIRT]);
const CANE_SOIL = new Set([B.SAND, B.GRASS, B.DIRT]);
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
    this.playerRenderer = new PlayerRenderer(this.renderer, this.entities);
    this.thirdPerson = 0;
    this.skinIndex = 0;
    this.weather = new Weather();
    this.chat = new Chat(this);
    this.playerName = this.settings.playerName || 'Player';
    this.pendingEvents = [];
    this.eating = null;
    this.attackCooldown = 0;
    this.targetMob = null;
    this.bowCharge = -1; // seconds the bow has been drawn, -1 when not drawing
    this.sleeping = null;
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
    this.leaveServer();
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
    if (this.net && !this.net.host) {
      // On someone else's server the server keeps our inventory.
      if (this.state !== 'loading') this.net.savePlayer();
      return true;
    }
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
    this.leaveServer();
    this.input.unlock();
    this.ui.setHudVisible(false);
    this.startPanorama();
    this.ui.show('title');
  }

  // --- Multiplayer ---------------------------------------------------------------------

  // Joins a server: its world, time and weather replace the local game's.
  async joinServer(address, name) {
    const net = new Net(this);
    this.ui.setMultiplayerStatus('Connecting…');
    let welcome;
    try {
      welcome = await net.connect(serverUrl(address), { name });
    } catch (err) {
      this.ui.setMultiplayerStatus(err.message, true);
      return false;
    }
    this.leaveServer();
    this.net = net;
    net.onClose = (reason) => this.disconnected(reason);
    const wm = welcome.world;
    this.meta = null;
    this.creative = welcome.you?.creative ?? wm.mode === 'creative';
    this.setWorld(new World({ seed: wm.seed, edits: decodeEdits(welcome.edits), blockEntities: decodeBlockEntities(welcome.blockEntities) }));
    this.player = new Player();
    // Everybody starts at the same world spawn; returning players continue
    // where they left off.
    if (welcome.you?.player) {
      this.player.load(welcome.you.player);
      this.needsSpawnFix = false;
    } else {
      const s = this.world.generator.findSpawn();
      this.player.pos = [s.x, s.y + 1, s.z];
      this.player.spawn = [...this.player.pos];
      this.needsSpawnFix = true;
    }
    this.inventory = welcome.you?.inventory ? Inventory.fromJSON(welcome.you.inventory) : new Inventory();
    if (!welcome.you && this.creative) CREATIVE_HOTBAR.forEach((id, i) => (this.inventory.slots[i] = { id, count: 64 }));
    this.ticks = Number.isFinite(welcome.ticks) ? welcome.ticks : 1000;
    this.weather = new Weather();
    this.weather.fromJSON(welcome.weather);
    this.mining = null;
    this.target = null;
    this.chat.lines = [];
    this.beginLoading(`Joining ${wm.name}`);
    this.chat.add(`Joined ${wm.name} as ${net.name}. ${net.players.size ? `${net.players.size + 1} players online.` : 'You are the only one here.'}`, '#ffff55');
    return true;
  }

  // Shares this single-player world with other players on the network
  // through the server started by the launcher or tools/server.mjs --lan.
  async openToLan() {
    if (this.net || !this.meta) return;
    this.ui.setLanStatus('Opening…');
    // The launcher passes its server's port in the URL (#lan=25565).
    const page = globalThis.location;
    const lanPort = Number(new URLSearchParams((page?.hash || '').slice(1)).get('lan')) || DEFAULT_PORT;
    const address = page && /^https?:$/.test(page.protocol) ? page.host : `localhost:${lanPort}`;
    const net = new Net(this);
    net.host = true;
    const w = this.world;
    try {
      await net.connect(serverUrl(address), {
        name: this.settings.playerName || 'Player',
        host: {
          seed: w.seed, name: this.meta.name, mode: this.creative ? 'creative' : 'survival', edits: encodeEdits(w.edits),
          blockEntities: encodeBlockEntities(w.blockEntities), ticks: this.ticks, weather: this.weather.toJSON(),
        },
      });
    } catch (err) {
      this.ui.setLanStatus(`${err.message} To host, start ClaudeCraft.exe or run "node tools/server.mjs --lan" first.`, true);
      return;
    }
    this.net = net;
    net.onClose = (reason) => {
      this.net = null;
      this.chat.add(`LAN game closed: ${reason}`, '#ff5555');
    };
    const where = (net.addresses.length ? net.addresses : ['<this computer>']).map((a) => `http://${a}:${net.port}/`).join(' or ');
    this.chat.add(`Local game hosted on port ${net.port}. Friends on your network can join at ${where}`, '#ffff55');
    this.ui.setLanStatus('');
    this.resume();
  }

  leaveServer() {
    if (!this.net) return;
    const net = this.net;
    this.net = null;
    net.disconnect();
  }

  disconnected(reason) {
    this.net = null;
    if (this.ui.screen === 'inventory') this.ui.closeInventory();
    this.input.unlock();
    this.ui.setHudVisible(false);
    this.startPanorama();
    this.ui.showDisconnected(reason);
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
      // missing one means a generated chest: fill it with the loot of the
      // structure it is in.
      if (type === 'chest') be.slots = rollLoot(this.world.generator.structures.lootAt(x, y, z) || 'village', x, y, z);
      this.setBlockEntitySynced(x, y, z, be);
    }
    this.containerPos = [x, y, z];
    this.openInventory({ type, entity: be });
  }

  setGameMode(mode) {
    this.creative = mode === 'creative';
    if (this.meta) this.meta.mode = mode;
    if (!this.creative) this.player.flying = false;
    this.ui.statusSig = '';
    this.ui.xpSig = '';
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
    else if (code === 'KeyQ') this.dropSelected(this.input.isDown('ControlLeft') || this.input.isDown('ControlRight'));
    else if (code === 'KeyT' || code === 'Enter') this.chat.show('');
    else if (code === 'Slash') this.chat.show('/');
    else if (code === 'F5') this.thirdPerson = ((this.thirdPerson || 0) + 1) % 3;
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
      player.armor = this.inventory.armorPoints();
      const ready = this.world.isReady(player.pos[0], player.pos[2]) && !this.sleeping;
      const events = [];
      if (ready) {
        const input = this.movementInput();
        player.update(dt, input, this.world, this.creative, events);
        this.checkPressurePlate();
      }
      this.handleEvents(events);
      if (this.sleeping) this.updateSleep(dt);
      else this.updateInteraction(dt);
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
    this.net?.update(dt);
    if (this.state !== 'paused' && this.state !== 'inventory') this.particles.update(dt, this.world);
    // Online the world keeps going while you are in a menu or dead.
    const simulate = this.state === 'playing' || this.state === 'inventory' || this.state === 'chat' || (!!this.net && (this.state === 'paused' || this.state === 'dead'));
    if (simulate) this.weather.update(dt, this, !this.net || this.net.isAuthority);
    if (simulate && this.world.isReady(player.pos[0], player.pos[2])) {
      this.entities.update(dt, skyState(this.ticks, this.weather.rain));
      if (!this.net || this.net.isAuthority) tickFurnaces(this, dt);
      tickCrops(this, dt);
    }
    if (this.pendingEvents.length) {
      const ev = this.pendingEvents;
      this.pendingEvents = [];
      this.handleEvents(ev);
    }
    if (this.state === 'inventory') this.ui.refreshContainer();
    this.chat.tick();
    this.sound.updateMusic(dt);

    // Animations
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt / 0.3);
    this.placeAnim = Math.max(0, this.placeAnim - dt * 5);
    const speed = Math.hypot(player.vel[0], player.vel[2]);
    const bobTarget = this.settings.viewBobbing && player.onGround && !player.flying ? Math.min(1, speed / 4.3) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, dt * 8);
    const fovTarget = (player.sprinting ? 1.12 : 1) * (this.bowCharge > 0 ? 1 - 0.15 * Math.min(1, this.bowCharge) : 1);
    this.fovBoost += (fovTarget - this.fovBoost) * Math.min(1, dt * 8);

    const eye = player.eye();
    const bob = player.walkDist * Math.PI * 0.62;
    let camPos = [...eye];
    let camYaw = player.yaw, camPitch = player.pitch;
    if (this.thirdPerson) {
      const d = player.lookDir();
      const sign = this.thirdPerson === 1 ? -1 : 1;
      // Pull the camera in if a block is in the way.
      let dist = 4;
      for (let k = 0.2; k <= 4; k += 0.1) {
        const x = eye[0] + d[0] * k * sign, y = eye[1] + d[1] * k * sign, z = eye[2] + d[2] * k * sign;
        if (IS_SOLID[this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))]) { dist = Math.max(0.3, k - 0.3); break; }
      }
      camPos = [eye[0] + d[0] * dist * sign, eye[1] + d[1] * dist * sign, eye[2] + d[2] * dist * sign];
      if (this.thirdPerson === 2) { camYaw = player.yaw + Math.PI; camPitch = -player.pitch; }
    } else if (this.bobAmount > 0.01) {
      const b = this.bobAmount;
      camPos[1] += -Math.abs(Math.cos(bob)) * 0.07 * b + 0.035 * b;
      camPos[0] += Math.cos(player.yaw) * Math.sin(bob) * 0.035 * b;
      camPos[2] += -Math.sin(player.yaw) * Math.sin(bob) * 0.035 * b;
    }
    const ex = Math.floor(eye[0]), ey = Math.floor(eye[1]), ez = Math.floor(eye[2]);
    const t = this.target;
    this.renderer.render({
      world: this.world,
      camera: { pos: camPos, yaw: camYaw, pitch: camPitch, fov: this.settings.fov * this.fovBoost },
      ticks: this.ticks,
      seconds: this.seconds,
      renderDistance: rd,
      selection: t && !this.hideHud ? { x: t.x, y: t.y, z: t.z, box: selectionBox(t.id) } : null,
      crack: this.mining && this.mining.progress > 0 ? { x: this.mining.x, y: this.mining.y, z: this.mining.z, stage: Math.min(9, Math.floor(this.mining.progress * 10)) } : null,
      held: this.inventory.selectedId,
      bowPull: this.bowCharge > 0 ? Math.min(1, this.bowCharge) : 0,
      showHand: !this.hideHud && this.state !== 'dead' && !this.thirdPerson,
      underwater: player.headInWater,
      inLava: player.headInLava,
      handSwing: this.swing > 0 ? 1 - this.swing : 0,
      bob,
      bobAmount: this.bobAmount,
      placeAnim: this.placeAnim,
      light: [this.world.getSkyLight(ex, ey, ez), this.world.getBlockLight(ex, ey, ez)],
      particles: this.particles.list,
      entities: this.renderEntities(),
      rain: this.weather.rain,
      flash: this.weather.flash,
      weatherMesh: this.weather.buildMesh(this.world, camPos, this.seconds, this.world.generator),
      boltMesh: this.weather.buildBoltMesh(camPos),
      eating: this.eating ? 1 : 0,
    });
    if (this.net) this.net.updateNameTags(this.renderer.viewProj, camPos, this.canvas.clientWidth, this.canvas.clientHeight);

    // HUD
    this.ui.showPlayerList(this.net && this.state === 'playing' && this.input.isDown('Tab')
      ? [this.net.name, ...[...this.net.players.values()].map((rp) => rp.name)] : null);
    this.ui.updateHotbar(this.inventory);
    this.ui.updateStatus(player, this.creative);
    this.ui.setTint(player.headInLava ? 'lava' : player.headInWater ? 'water' : '');
    this.ui.setDebug(this.showDebug, this.showDebug ? this.debugText() : '');
  }

  // Mobs, items and projectiles plus player models (yourself in third person
  // and other players in multiplayer).
  renderEntities() {
    const list = this.entities.renderList(this.seconds);
    const p = this.player;
    if (this.thirdPerson && !p.dead) {
      const light = [this.world.getSkyLight(Math.floor(p.pos[0]), Math.floor(p.pos[1] + 1), Math.floor(p.pos[2])),
        this.world.getBlockLight(Math.floor(p.pos[0]), Math.floor(p.pos[1] + 1), Math.floor(p.pos[2]))];
      list.push(...this.playerRenderer.renderEntries({
        pos: p.pos, yaw: p.yaw, headYaw: 0, pitch: p.pitch,
        walkPhase: p.walkDist * 3.2, walkAmount: Math.min(1, Math.hypot(p.vel[0], p.vel[2]) / 4.3),
        swing: this.swing > 0 ? 1 - this.swing : 0, sneaking: p.sneaking, variant: this.skinIndex,
        armor: this.inventory.armor.map((a) => a?.id || 0), held: this.inventory.selectedId, light, hurt: p.hurtTime > 0,
      }, this.seconds));
    }
    if (this.net) list.push(...this.net.renderEntries(this.seconds));
    return list;
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
      else if (e.type === 'armorHit') this.damageArmor(e.amount);
      else if (e.type === 'death') {
        if (this.state === 'inventory') this.ui.closeInventory();
        this.state = 'dead';
        this.mining = null;
        this.eating = null;
        this.bowCharge = -1;
        this.sleeping = null;
        this.net?.sendDeath();
        this.dropEverything();
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
    // Other players can be hit too.
    const pvp = this.net?.raycastPlayers(eye, dir, this.creative ? 5 : 3.5);
    this.targetPlayer = pvp && (!t || pvp.t < t.distance) && (!mobHit || pvp.t < mobHit.t) ? pvp.player : null;
    if (this.targetPlayer) this.targetMob = null;
    this.useCooldown -= dt;
    this.breakDelay -= dt;
    this.attackCooldown -= dt;

    // Left button: attack a mob, or break blocks.
    if (pressed.includes(0)) this.swing = 1;
    if (this.targetMob) {
      this.mining = null;
      if (pressed.includes(0) && this.attackCooldown <= 0) this.attack(this.targetMob);
    } else if (this.targetPlayer) {
      this.mining = null;
      if (pressed.includes(0) && this.attackCooldown <= 0) this.attackPlayer(this.targetPlayer);
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

    // Right button: draw a bow, eat (hold), use or place.
    const held = inv.selectedStack;
    const heldItem = held ? ITEMS.get(held.id) : null;
    const interactive = t && !p.sneaking && isInteractive(this, t, heldItem);
    if (heldItem?.bow && !interactive) {
      if (input.buttons.has(2)) {
        if (this.bowCharge < 0 && (this.creative || inv.count(I.ARROW) > 0)) this.bowCharge = 0;
        if (this.bowCharge >= 0) this.bowCharge += dt;
      } else if (this.bowCharge >= 0) {
        this.shootArrow(this.bowCharge);
        this.bowCharge = -1;
      }
      this.eating = null;
    } else if (input.buttons.has(2) && heldItem?.food && !interactive && !this.targetMob && (p.hunger < 20 || heldItem.food.always || this.creative)) {
      this.bowCharge = -1;
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
        if (!this.creative) {
          inv.take(inv.selected, 1);
          if (heldItem.leaves) {
            if (!inv.slots[inv.selected]) inv.slots[inv.selected] = { id: heldItem.leaves, count: 1 };
            else if (inv.add(heldItem.leaves, 1)) this.entities.dropItem({ id: heldItem.leaves, count: 1 }, ...p.eye());
          }
        }
        this.sound.burp();
        this.eating = null;
        this.useCooldown = 0.3;
      }
    } else {
      this.eating = null;
      this.bowCharge = -1;
      if (pressed.includes(2) || (input.buttons.has(2) && this.useCooldown <= 0)) {
        let used = false;
        if (this.targetMob) used = this.useOnMob(this.targetMob);
        else if (t) used = useOnBlock(this, t);
        if (!used && !this.targetMob) {
          if (heldItem?.bucket !== undefined || held?.id === B.LILY_PAD) used = this.useOnLiquid(heldItem);
          if (!used) useInAir(this);
        }
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

  attack(mob) {
    const p = this.player;
    const item = ITEMS.get(this.inventory.selectedId);
    let dmg = item ? item.damage : 1;
    if (!p.onGround && p.vel[1] < -1 && !p.flying) {
      dmg *= 1.5; // critical hit while falling
      this.particles.smoke(mob.pos[0], mob.pos[1] + mob.h, mob.pos[2], 4, 0.3, 0.06, 0.1);
    }
    if (this.net && !this.net.isAuthority) this.net.sendMobHit(mob.id, dmg, p.pos);
    else mob.hurt(dmg, p.pos, this.entities, this.entities.localRef);
    if (item?.tool) this.damageHeld(item.tool.type === 'sword' ? 1 : 2);
    p.addExhaustion(0.1, this.creative);
    this.attackCooldown = 0.25;
    this.swing = 1;
  }

  // Right-click on a mob: shear sheep, milk cows.
  // Stepping on a pressure plate sets off TNT underneath (the desert pyramid
  // trap).
  checkPressurePlate() {
    const p = this.player;
    const x = Math.floor(p.pos[0]), y = Math.floor(p.pos[1] + 0.05), z = Math.floor(p.pos[2]);
    const key = BLOCKS[this.world.getBlock(x, y, z)].plate ? `${x},${y},${z}` : null;
    if (key && key !== this.lastPlate) {
      this.sound.door?.(false);
      for (let dy = -3; dy <= -1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (this.world.getBlock(x + dx, y + dy, z + dz) === B.TNT) this.igniteTNT(x + dx, y + dy, z + dz, 1 + Math.random() * 0.5);
          }
        }
      }
    }
    this.lastPlate = key;
  }

  // Turns a TNT block into primed TNT (the world owner does it online).
  igniteTNT(x, y, z, fuse = 4) {
    if (this.net && !this.net.isAuthority) {
      this.net.sendIgnite(x, y, z, fuse);
      return;
    }
    this.setBlockSynced(x, y, z, B.AIR);
    this.entities.primeTNT(x, y, z, fuse);
  }

  attackPlayer(rp) {
    const p = this.player;
    const item = ITEMS.get(this.inventory.selectedId);
    let dmg = item ? item.damage : 1;
    if (!p.onGround && p.vel[1] < -1 && !p.flying) dmg *= 1.5;
    if (!rp.creative) this.net.sendDamage(rp.id, dmg, p.pos, 6);
    this.sound.hit?.();
    if (item?.tool) this.damageHeld(item.tool.type === 'sword' ? 1 : 2);
    p.addExhaustion(0.1, this.creative);
    this.attackCooldown = 0.25;
    this.swing = 1;
  }

  useOnMob(mob) {
    const inv = this.inventory;
    const id = inv.selectedStack?.id ?? null;
    // Shearing, milking, taming, feeding and telling a tamed wolf to sit. In
    // multiplayer the player running the simulation applies the effect on
    // the mob and this client predicts what happens to the held item.
    const remote = this.net && !this.net.isAuthority;
    const r = this.entities.interactMob(mob, id, this.entities.localRef, !remote);
    if (!r) return false;
    if (remote) this.net.sendMobUse(mob.id, id);
    if (r === 'consume' && !this.creative) inv.take(inv.selected, 1);
    else if (r === 'tool') {
      this.sound.shear?.();
      this.damageHeld(1);
    } else if (r === 'milk') {
      if (!this.creative) {
        inv.take(inv.selected, 1);
        if (!inv.slots[inv.selected]) inv.slots[inv.selected] = { id: I.MILK_BUCKET, count: 1 };
        else if (inv.add(I.MILK_BUCKET, 1)) this.entities.dropItem({ id: I.MILK_BUCKET, count: 1 }, ...this.player.eye());
      }
      this.sound.splash();
    }
    this.swing = 1;
    return true;
  }


  // Buckets and lily pads target the first liquid block in reach.
  liquidTarget() {
    const p = this.player;
    return raycast((x, y, z) => this.world.getBlock(x, y, z), p.eye(), p.lookDir(), 5, true);
  }

  useOnLiquid(heldItem) {
    const hit = this.liquidTarget();
    if (!hit) return false;
    if (this.inventory.selectedId === B.LILY_PAD) {
      if (hit.id !== B.WATER || this.world.getBlock(hit.x, hit.y + 1, hit.z) !== B.AIR) return false;
      this.setBlockSynced(hit.x, hit.y + 1, hit.z, B.LILY_PAD);
      if (!this.creative) this.inventory.take(this.inventory.selected, 1);
      this.sound.place(B.TALL_GRASS);
      return true;
    }
    return heldItem?.bucket !== undefined && useOnBlock(this, { ...hit, normal: hit.normal });
  }

  shootArrow(charge) {
    const p = this.player;
    const power = Math.min(1, (charge * charge + charge * 2) / 3);
    if (power < 0.1) return;
    const inv = this.inventory;
    if (!this.creative) {
      const slot = inv.slots.findIndex((s) => s?.id === I.ARROW);
      if (slot < 0) return;
      inv.take(slot, 1);
    }
    const eye = p.eye(), d = p.lookDir();
    const speed = 56 * power;
    const spread = 0.01;
    const v = [d[0] + (Math.random() - 0.5) * spread, d[1] + (Math.random() - 0.5) * spread, d[2] + (Math.random() - 0.5) * spread];
    const dmg = Math.ceil(power * 6) + (power >= 1 ? Math.floor(Math.random() * 3) : 0);
    this.entities.shoot('arrow', [eye[0] + d[0] * 0.5, eye[1] - 0.1, eye[2] + d[2] * 0.5], [v[0] * speed, v[1] * speed, v[2] * speed], this.entities.localRef, dmg, !this.creative);
    this.damageHeld(1);
    this.sound.bow?.(power);
  }

  // Wears down the held tool; it breaks when used up.
  damageHeld(n) {
    if (this.creative) return;
    const inv = this.inventory;
    const s = inv.selectedStack;
    const it = s && ITEMS.get(s.id);
    if (!it?.durability) return;
    s.dmg = (s.dmg || 0) + n;
    if (s.dmg >= it.durability) {
      inv.slots[inv.selected] = null;
      this.sound.toolBreak?.();
      this.particles.burstItem?.(this.player.eye(), s.id);
    }
    this.ui.hotbarSig = '';
  }

  damageArmor(amount) {
    const inv = this.inventory;
    const wear = Math.max(1, Math.floor(amount / 4));
    inv.armor.forEach((a, i) => {
      if (!a) return;
      const it = ITEMS.get(a.id);
      a.dmg = (a.dmg || 0) + wear;
      if (a.dmg >= it.durability) {
        inv.armor[i] = null;
        this.sound.toolBreak?.();
      }
    });
  }

  // Picks up a dropped item entity. Returns true if it was fully taken.
  pickupItem(e) {
    if (e.removed) return true;
    const before = e.stack.count;
    const left = this.inventory.addStack(e.stack);
    if (left < before) {
      this.sound.pop();
      this.ui.hotbarSig = '';
      if (this.state === 'inventory') this.ui.refreshInventory();
    }
    if (left <= 0) { e.removed = true; this.net?.sendPickup?.(e); return true; }
    e.stack.count = left;
    return false;
  }

  gainXP(n) {
    if (this.player.addXP(n)) this.sound.levelUp?.();
    else this.sound.orb?.();
  }

  teleportPlayer(x, y, z) {
    const p = this.player;
    p.pos = [x, y, z];
    p.vel = [0, 0, 0];
    p.fallDistance = 0;
    p.damage(5, this.pendingEvents, this.creative, { bypassArmor: true });
    this.sound.teleport?.();
  }

  projectileHitPlayer(pr) {
    const p = this.player;
    const dmg = pr.type === 'arrow' ? pr.damage : 0;
    if (dmg > 0) p.damage(dmg, this.pendingEvents, this.creative);
    p.knockback(pr.vel[0], pr.vel[2], 5);
  }

  // Throws the selected item (Q) or the whole stack (Ctrl+Q).
  dropSelected(all) {
    const inv = this.inventory;
    const s = inv.selectedStack;
    if (!s) return;
    const n = all ? s.count : 1;
    const out = { ...s, count: n };
    inv.take(inv.selected, n);
    const p = this.player, eye = p.eye(), d = p.lookDir();
    this.entities.dropItem(out, eye[0] + d[0] * 0.3, eye[1] - 0.3, eye[2] + d[2] * 0.3, [d[0] * 5, d[1] * 5 + 2, d[2] * 5], 2);
    this.ui.hotbarSig = '';
  }

  // Death: everything in the inventory scatters on the ground.
  dropEverything() {
    if (this.creative) return;
    const p = this.player;
    const inv = this.inventory;
    for (const list of [inv.slots, inv.armor]) {
      list.forEach((s, i) => {
        if (!s) return;
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
        this.entities.dropItem({ ...s }, p.pos[0], p.pos[1] + 1, p.pos[2], [Math.cos(a) * sp, 3 + Math.random() * 2, Math.sin(a) * sp]);
        list[i] = null;
      });
    }
    const xp = Math.min(100, p.xpLevel * 7);
    if (xp) this.entities.dropXP(xp, p.pos[0], p.pos[1] + 1, p.pos[2]);
  }

  // Beds: sleep through the night (and set the spawn point).
  trySleep(x, y, z) {
    const p = this.player;
    const day = this.ticks > 12500 && this.ticks < 23500 ? false : true;
    p.spawn = [x + 0.5, y + 1, z + 0.5];
    if (day) {
      this.ui.toast('You can only sleep at night (respawn point set)');
      return;
    }
    const near = this.entities.list.some((e) => e.kind === 'mob' && e.def.hostile && !e.dead && Math.hypot(e.pos[0] - x, e.pos[1] - y, e.pos[2] - z) < 8);
    if (near) {
      this.ui.toast('You may not rest now; there are monsters nearby');
      return;
    }
    this.sleeping = { time: 0, bed: [x, y, z], from: [...p.pos] };
    p.pos = [x + 0.5, y + 0.6, z + 0.5];
    p.vel = [0, 0, 0];
    this.ui.setSleepFade(0.01);
  }

  updateSleep(dt) {
    const s = this.sleeping;
    if (!s) return;
    s.time += dt;
    this.ui.setSleepFade(Math.min(1, s.time / 2.5));
    if (s.time >= 3) {
      const night = this.ticks > 12500 && this.ticks < 23500;
      if (night && this.net) {
        // Online the night is skipped once every player is asleep.
        const all = [...this.net.players.values()].every((rp) => rp.sleeping);
        if (!all || !this.net.isAuthority) {
          if (!s.waiting) this.ui.toast('Waiting for the other players to sleep…');
          s.waiting = true;
          return;
        }
      }
      if (night) {
        this.ticks = 0;
        this.net?.sendTime(this.ticks);
      }
      this.sleeping = null;
      this.player.pos = [s.bed[0] + 0.5, s.bed[1] + 0.6, s.bed[2] + 0.5];
      this.ui.setSleepFade(0);
      this.ui.toast('Good morning!');
    }
  }

  breakBlock(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR || (!this.creative && BLOCKS[id].hardness < 0)) return;
    if (!this.setBlockSynced(x, y, z, B.AIR)) return;
    this.sound.breakBlock(id);
    this.particles.burst(x, y, z, id);
    const be = BLOCKS[id].container ? this.removeBlockEntitySynced(x, y, z) : null;
    if (be) for (const st of be.slots) if (st) this.entities.dropItem(st, x + 0.5, y + 0.5, z + 0.5);
    // Doors and beds are two blocks: take the other half with this one.
    const partner = partnerOf(id, x, y, z);
    if (partner) {
      const pid = this.world.getBlock(...partner);
      if (BLOCKS[pid].door || BLOCKS[pid].bed) {
        this.setBlockSynced(...partner, B.AIR);
        if (!this.creative && BLOCKS[id].drop === null) this.dropBlockLoot(pid, ...partner, this.inventory.selectedId);
      }
    }
    if (!this.creative) {
      this.dropBlockLoot(id, x, y, z, this.inventory.selectedId);
      const tool = ITEMS.get(this.inventory.selectedId)?.tool;
      if (tool && BLOCKS[id].hardness > 0) this.damageHeld(tool.type === 'sword' ? 2 : 1);
    }
    this.blockUpdates(x, y, z);
    this.flowWater(x, y, z);
  }

  // Items (and experience) a broken block leaves behind.
  dropBlockLoot(id, x, y, z, heldId) {
    for (const [item, n] of blockDrops(id, heldId)) {
      this.entities.dropItem({ id: item, count: n }, x + 0.5, y + 0.3, z + 0.5, [(Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2]);
    }
    const xp = BLOCKS[id].xp;
    if (xp && blockDrops(id, heldId, () => 0.5).length) {
      this.entities.dropXP(xp[0] + Math.floor(Math.random() * (xp[1] - xp[0] + 1)), x + 0.5, y + 0.5, z + 0.5);
    }
  }

  // Every block change made by the player or game rules goes through here so
  // it can be shared with other players.
  setBlockSynced(x, y, z, id) {
    const ok = this.world.setBlock(x, y, z, id);
    if (ok) this.net?.sendBlock(x, y, z, id);
    return ok;
  }

  // Chest and furnace contents, shared the same way.
  setBlockEntitySynced(x, y, z, be) {
    this.world.setBlockEntity(x, y, z, be);
    this.net?.sendBlockEntity(x, y, z, be);
  }

  removeBlockEntitySynced(x, y, z) {
    const be = this.world.removeBlockEntity(x, y, z);
    if (be) this.net?.sendBlockEntity(x, y, z, null);
    return be;
  }

  // The open chest or furnace was changed through the inventory screen.
  containerChanged() {
    const pos = this.containerPos;
    if (!this.net || !pos) return;
    const be = this.world.getBlockEntity(pos[0], pos[1], pos[2]);
    if (be) this.net.sendBlockEntity(pos[0], pos[1], pos[2], be);
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
    if (b.support === 'mushroom') return IS_SOLID[w.getBlock(x, y - 1, z)] === 1;
    if (b.support === 'water') return w.getBlock(x, y - 1, z) === B.WATER;
    if (b.support === 'wall') {
      const [ax, ay, az] = b.attach;
      return IS_SOLID[w.getBlock(x + ax, y + ay, z + az)] === 1;
    }
    if (b.support === 'door_upper') return !!BLOCKS[w.getBlock(x, y - 1, z)].door;
    if (b.support === 'sugar_cane') {
      const below = w.getBlock(x, y - 1, z);
      if (below === B.SUGAR_CANE) return true;
      if (!CANE_SOIL.has(below)) return false;
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.getBlock(x + dx, y - 1, z + dz) === B.WATER);
    }
    return true;
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
        this.setBlockSynced(qx, qy, qz, B.AIR);
        if (!this.creative && !BLOCKS[id].door) this.dropBlockLoot(id, qx, qy, qz, 0);
        changed = true;
      } else if (BLOCKS[id].falls) {
        let ny = qy;
        while (ny > 0 && BLOCKS[w.getBlock(qx, ny - 1, qz)].replaceable) ny--;
        if (ny !== qy) {
          this.setBlockSynced(qx, qy, qz, B.AIR);
          this.setBlockSynced(qx, ny, qz, id);
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
      if (!this.setBlockSynced(qx, qy, qz, B.WATER)) continue;
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
