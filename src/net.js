// Multiplayer client. Connects to a ClaudeCraft server (tools/server.mjs, or
// the one built into the Windows launcher) over a WebSocket and keeps this
// game in step with everyone else's.
//
// The server stores the shared world (block edits, chests, time, weather).
// One player, the "authority", simulates mobs, items, TNT, crops and
// furnaces for everybody and sends entity snapshots ten times a second; the
// others draw interpolated copies and send their actions to the authority.
import { B } from './blocks.js';
import { encodeBlockEntities, decodeBlockEntities } from './storage.js';
import { rayBox } from './entities.js';

export const PROTOCOL = 1;
export const DEFAULT_PORT = 25565;

const r2 = (v) => Math.round(v * 100) / 100;
const wrapAngle = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

// "host", "host:port", "http://host:port/" or "ws://host:port/ws" -> WebSocket URL.
export function serverUrl(address, page = globalThis.location) {
  let a = String(address ?? '').trim();
  let secure = false;
  const m = a.match(/^(wss?|https?):\/\/(.*)$/i);
  if (m) {
    secure = /^(wss|https)$/i.test(m[1]);
    a = m[2];
  }
  a = a.replace(/\/.*$/, '');
  if (!a) {
    const served = page && /^https?:$/.test(page.protocol) && page.host;
    a = served ? page.host : `localhost:${DEFAULT_PORT}`;
    secure = served ? page.protocol === 'https:' : false;
  }
  if (!/:\d+$/.test(a)) a += `:${DEFAULT_PORT}`;
  return `${secure ? 'wss' : 'ws'}://${a}/ws`;
}

export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = null;
    this.name = '';
    this.authorityId = null;
    this.players = new Map(); // id -> remote player
    this.queue = []; // block changes waiting to be sent
    this.timers = { pos: 0, ents: 0, time: 2, weather: 5, save: 30 };
    this.tags = new Map(); // id -> name tag element
    this.onClose = null;
    this.closing = false;
    this.lastError = null;
    this.host = false; // this game owns the world (Open to LAN)
    this.addresses = [];
    this.port = DEFAULT_PORT;
  }

  get isAuthority() {
    return this.id !== null && this.id === this.authorityId;
  }

  get open() {
    return this.ws && this.ws.readyState === 1;
  }

  // Resolves with the server's welcome message.
  connect(url, hello) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      };
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        reject(new Error('That is not a valid server address.'));
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        finish(new Error('The server did not answer.'));
        ws.close();
      }, 10000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL, ...hello }));
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (!settled) {
          if (m.t === 'welcome') {
            this.welcome(m);
            finish(null, m);
          } else if (m.t === 'error') finish(new Error(m.text));
          return;
        }
        this.handle(m);
      };
      ws.onclose = () => {
        finish(new Error(`Could not connect to ${url.replace(/^wss?:\/\/|\/ws$/g, '')}.`));
        this.clearTags();
        if (!this.closing) this.onClose?.(this.lastError || 'Connection lost');
      };
    });
  }

  disconnect() {
    if (this.open) this.savePlayer();
    this.closing = true;
    this.ws?.close();
    this.clearTags();
  }

  send(msg) {
    if (this.open) this.ws.send(JSON.stringify(msg));
  }

  toAuthority(m) {
    this.send({ t: 'to', to: 'auth', m });
  }

  to(id, m) {
    this.send({ t: 'to', to: id, m });
  }

  broadcast(m) {
    this.send({ t: 'bc', m });
  }

  welcome(m) {
    this.id = m.id;
    this.name = m.name;
    this.authorityId = m.authority;
    this.addresses = m.addresses || [];
    this.port = m.port || DEFAULT_PORT;
    for (const p of m.players || []) this.addPlayer(p.id, p.name, p.state);
  }

  addPlayer(id, name, state) {
    const rp = {
      id, name, pos: [0, -100, 0], target: null, yaw: 0, targetYaw: 0, pitch: 0, walkPhase: 0, walkAmount: 0, swing: 0,
      sneaking: false, variant: 0, armor: [], held: 0, hurt: false, dead: false, creative: false, sleeping: false, seen: false,
    };
    this.players.set(id, rp);
    if (state) this.applyPos(rp, state);
    return rp;
  }

  applyPos(rp, m) {
    if (!Array.isArray(m.p)) return;
    rp.target = m.p;
    rp.targetYaw = m.yaw || 0;
    if (!rp.seen) {
      rp.pos = [...m.p];
      rp.yaw = rp.targetYaw;
      rp.seen = true;
    }
    rp.pitch = m.pitch || 0;
    rp.swing = m.sw || 0;
    rp.sneaking = !!m.sn;
    rp.variant = m.v | 0;
    rp.armor = Array.isArray(m.a) ? m.a : [];
    rp.held = m.h || 0;
    rp.dead = !!m.d;
    rp.creative = !!m.c;
    rp.sleeping = !!m.s;
    rp.hurt = !!m.hu;
  }

  // --- Messages from the server -------------------------------------------------------------

  handle(m) {
    const g = this.game;
    switch (m.t) {
      case 'pos':
        this.applyPos(this.players.get(m.id) || this.addPlayer(m.id, '?'), m);
        break;
      case 'join':
        this.addPlayer(m.id, m.name);
        g.chat.add(`${m.name} joined the game`, '#ffff55');
        break;
      case 'leave':
        this.players.delete(m.id);
        this.tags.get(m.id)?.remove();
        this.tags.delete(m.id);
        g.chat.add(`${m.name} left the game`, '#ffff55');
        break;
      case 'blocks':
        for (const b of m.list) this.applyBlock(b[0], b[1], b[2], b[3]);
        break;
      case 'be':
        this.applyBlockEntity(m.k, m.d);
        break;
      case 'chat':
        g.chat.add(`<${m.name}> ${m.text}`);
        break;
      case 'time':
        if (Number.isFinite(m.ticks)) g.ticks = m.ticks;
        break;
      case 'weather':
        g.weather.fromJSON(m.w);
        break;
      case 'ents':
        if (!this.isAuthority) g.entities.applySnapshot(m.list);
        break;
      case 'authority':
        this.authorityId = m.id;
        if (this.isAuthority) g.entities.becomeAuthority();
        break;
      case 'msg':
        this.handleMessage(m.from, m.m || {});
        break;
      case 'error':
        this.lastError = m.text;
        break;
    }
  }

  // A block another player changed.
  applyBlock(x, y, z, id) {
    const g = this.game;
    const w = g.world;
    const before = w.getBlock(x, y, z);
    w.setBlockRemote(x, y, z, id);
    const p = g.player;
    if (id === B.AIR && before !== B.AIR && p && Math.hypot(x - p.pos[0], y - p.pos[1], z - p.pos[2]) < 24) {
      g.particles.burst(x, y, z, before);
      g.sound.dig?.(before);
    }
  }

  applyBlockEntity(key, data) {
    const w = this.game.world;
    const [x, y, z] = key.split(',').map(Number);
    if (!data) {
      w.removeBlockEntity(x, y, z);
      return;
    }
    const be = decodeBlockEntities([[key, data]]).get(key);
    if (!be) return;
    const cur = w.getBlockEntity(x, y, z);
    // Update in place so an open chest or furnace screen shows the change.
    if (cur) Object.assign(cur, be);
    else w.setBlockEntity(x, y, z, be);
  }

  // Requests sent to the authority, and effects sent to one or all players.
  handleMessage(from, m) {
    const g = this.game;
    const E = g.entities;
    const mob = (id) => E.list.find((e) => e.kind === 'mob' && e.id === id && !e.dead);
    const p = g.player;
    switch (m.t) {
      case 'mobHit': {
        const e = mob(m.id);
        if (e) e.hurt(Number(m.dmg) || 1, m.from, E, from);
        break;
      }
      case 'mobUse': {
        const e = mob(m.id);
        if (e) E.interactMob(e, m.item, from);
        break;
      }
      case 'ignite':
        g.igniteTNT(m.x, m.y, m.z, m.fuse);
        break;
      case 'drop':
        E.dropItem(m.stack, m.pos[0], m.pos[1], m.pos[2], m.vel, m.delay);
        break;
      case 'dropxp':
        E.dropXP(m.v, m.pos[0], m.pos[1], m.pos[2]);
        break;
      case 'shoot':
        E.shoot(m.type, m.pos, m.vel, from, m.damage, m.pickup);
        break;
      case 'spawn':
        E.spawn(m.type, m.pos[0], m.pos[1], m.pos[2], m.opts || {});
        break;
      case 'damage':
        if (!p || p.dead) break;
        p.damage(Number(m.amount) || 0, g.pendingEvents, g.creative);
        if (m.from) p.knockback(p.pos[0] - m.from[0], p.pos[2] - m.from[2], m.knock ?? 6);
        if (m.lift) p.vel[1] = Math.max(p.vel[1], m.lift);
        break;
      case 'give': {
        const item = { stack: { ...m.stack }, removed: false };
        if (!g.pickupItem(item)) E.dropItem(item.stack, ...p.eye());
        break;
      }
      case 'givexp':
        g.gainXP(m.v);
        break;
      case 'tp':
        g.teleportPlayer(m.pos[0], m.pos[1], m.pos[2]);
        break;
      case 'explosion':
        g.sound.explosion();
        g.particles.explosion(m.x, m.y, m.z, m.r);
        break;
      case 'lightning':
        g.weather.strike(g, m.x, m.z, m.seed, true);
        break;
      case 'died':
        g.chat.add(`${m.name} died`, '#ffffff');
        break;
    }
  }

  // --- Hooks used by the game ------------------------------------------------------------------

  sendBlock(x, y, z, id) {
    this.queue.push([x, y, z, id]);
  }

  sendBlockEntity(x, y, z, be) {
    const k = `${x},${y},${z}`;
    this.send({ t: 'be', k, d: be ? encodeBlockEntities(new Map([[k, be]]))[0][1] : null });
  }

  sendChat(text) {
    this.send({ t: 'chat', text });
  }

  sendTime(ticks) {
    this.send({ t: 'time', ticks });
  }

  sendWeather() {
    this.send({ t: 'weather', w: this.game.weather.toJSON() });
  }

  sendLightning(bolt) {
    if (bolt) this.broadcast({ t: 'lightning', x: bolt.x, z: bolt.z, seed: bolt.seed });
  }

  sendExplosion(x, y, z, r) {
    this.broadcast({ t: 'explosion', x, y, z, r });
  }

  sendMobHit(id, dmg, from) {
    this.toAuthority({ t: 'mobHit', id, dmg, from });
  }

  sendMobUse(id, item) {
    this.toAuthority({ t: 'mobUse', id, item });
  }

  sendIgnite(x, y, z, fuse) {
    this.toAuthority({ t: 'ignite', x, y, z, fuse });
  }

  sendDrop(stack, pos, vel, delay) {
    this.toAuthority({ t: 'drop', stack, pos, vel, delay });
  }

  sendDropXP(v, pos) {
    this.toAuthority({ t: 'dropxp', v, pos });
  }

  sendShoot(type, pos, vel, damage, pickup) {
    this.toAuthority({ t: 'shoot', type, pos, vel, damage, pickup });
  }

  sendSpawn(type, pos, opts) {
    this.toAuthority({ t: 'spawn', type, pos, opts });
  }

  sendDamage(id, amount, from, knock = 6, lift = 0) {
    this.to(id, { t: 'damage', amount, from, knock, lift });
  }

  sendGive(id, stack) {
    this.to(id, { t: 'give', stack });
  }

  sendGiveXP(id, v) {
    this.to(id, { t: 'givexp', v });
  }

  sendTeleport(id, pos) {
    this.to(id, { t: 'tp', pos });
  }

  sendDeath() {
    this.broadcast({ t: 'died', name: this.name });
  }

  savePlayer() {
    const g = this.game;
    if (!g.player || this.host) return;
    this.send({ t: 'save', data: { player: g.player.toJSON(), inventory: g.inventory.toJSON(), creative: g.creative } });
  }

  // The remote player hit by a ray, if any.
  raycastPlayers(origin, dir, maxDist) {
    let best = null;
    for (const rp of this.players.values()) {
      if (rp.dead || !rp.seen) continue;
      const b = [rp.pos[0] - 0.3, rp.pos[1], rp.pos[2] - 0.3, rp.pos[0] + 0.3, rp.pos[1] + 1.8, rp.pos[2] + 0.3];
      const t = rayBox(origin, dir, b);
      if (t !== null && t <= maxDist && (!best || t < best.t)) best = { player: rp, t };
    }
    return best;
  }

  // --- Per frame -----------------------------------------------------------------------------------

  update(dt) {
    const g = this.game;
    if (!this.open || !g.player) return;
    if (this.queue.length) {
      this.send({ t: 'blocks', list: this.queue });
      this.queue = [];
    }
    const T = this.timers;
    if ((T.pos -= dt) <= 0) {
      T.pos = 0.1;
      const p = g.player, inv = g.inventory;
      this.send({
        t: 'pos', p: p.pos.map(r2), yaw: r2(p.yaw), pitch: r2(p.pitch), sw: r2(g.swing > 0 ? 1 - g.swing : 0),
        sn: p.sneaking ? 1 : 0, v: g.skinIndex || 0, a: inv.armor.map((s) => s?.id || 0), h: inv.selectedId || 0,
        d: p.dead || g.state === 'dead' ? 1 : 0, c: g.creative ? 1 : 0, s: g.sleeping ? 1 : 0, hu: p.hurtTime > 0 ? 1 : 0,
      });
    }
    if (this.isAuthority) {
      if ((T.ents -= dt) <= 0) {
        T.ents = 0.1;
        if (this.players.size) this.send({ t: 'ents', list: g.entities.snapshot() });
      }
      if ((T.time -= dt) <= 0) {
        T.time = 2;
        this.sendTime(g.ticks);
      }
      if ((T.weather -= dt) <= 0) {
        T.weather = 5;
        this.sendWeather();
      }
    }
    if ((T.save -= dt) <= 0) {
      T.save = 30;
      this.savePlayer();
    }
    // Other players glide smoothly between position updates.
    const k = 1 - Math.exp(-dt * 12);
    for (const rp of this.players.values()) {
      if (!rp.target) continue;
      const ox = rp.pos[0], oz = rp.pos[2];
      for (let i = 0; i < 3; i++) rp.pos[i] += (rp.target[i] - rp.pos[i]) * k;
      rp.yaw += wrapAngle(rp.targetYaw - rp.yaw) * k;
      const moved = Math.hypot(rp.pos[0] - ox, rp.pos[2] - oz);
      rp.walkAmount += (Math.min(1, moved / Math.max(dt, 1e-3) / 4.3) - rp.walkAmount) * Math.min(1, dt * 10);
      rp.walkPhase += moved * 3.2;
    }
  }

  // Player models for everyone else.
  renderEntries(time) {
    const g = this.game;
    const out = [];
    for (const rp of this.players.values()) {
      if (!rp.seen || rp.dead) continue;
      const x = Math.floor(rp.pos[0]), y = Math.floor(rp.pos[1] + 1), z = Math.floor(rp.pos[2]);
      out.push(...g.playerRenderer.renderEntries({
        pos: rp.pos, yaw: rp.yaw, headYaw: 0, pitch: rp.pitch, walkPhase: rp.walkPhase, walkAmount: rp.walkAmount,
        swing: rp.swing, sneaking: rp.sneaking, variant: rp.variant, armor: rp.armor, held: rp.held,
        light: [g.world.getSkyLight(x, y, z), g.world.getBlockLight(x, y, z)], hurt: rp.hurt,
      }, time));
    }
    return out;
  }

  // Name tags above other players' heads, positioned over the canvas.
  // viewProj maps camera-relative positions to clip space.
  updateNameTags(viewProj, cam, width, height) {
    const box = document.getElementById('nametags');
    if (!box) return;
    for (const rp of this.players.values()) {
      let el = this.tags.get(rp.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'nametag';
        box.appendChild(el);
        this.tags.set(rp.id, el);
      }
      el.textContent = rp.name;
      const x = rp.pos[0] - cam[0], y = rp.pos[1] + (rp.sneaking ? 1.95 : 2.15) - cam[1], z = rp.pos[2] - cam[2];
      const m = viewProj;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      const far = Math.hypot(x, y, z) > 64;
      if (cw <= 0.1 || !rp.seen || rp.dead || far) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      el.style.opacity = rp.sneaking ? '0.5' : '1';
      el.style.transform = `translate(${((cx / cw) * 0.5 + 0.5) * width}px, ${(0.5 - (cy / cw) * 0.5) * height}px) translate(-50%, -100%)`;
    }
  }

  clearTags() {
    for (const el of this.tags.values()) el.remove();
    this.tags.clear();
  }
}
