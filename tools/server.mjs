#!/usr/bin/env node
// ClaudeCraft multiplayer server. Zero dependencies: plain Node.js.
//
// It serves the game to browsers and relays what players do over a
// WebSocket at /ws. The server keeps the shared world state (seed, block
// edits, chest and furnace contents, time, weather and each player's saved
// inventory); the first player in the world also runs the mobs and other
// simulation for everybody (the "authority") and hands that job to the next
// player when leaving.
//
//   node tools/server.mjs                       dedicated server, world in worlds/server.json
//   node tools/server.mjs --seed hello --mode creative --port 25565 --world worlds/mine.json
//   node tools/server.mjs --lan                 relay for a world hosted from a player's game
//                                               ("Open to LAN" in the pause menu)
//
// Everyone joins at http://<this computer's address>:<port>/ and spawns at
// the same world spawn point.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { createSocket } from 'node:dgram';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashString } from '../src/noise.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PROTOCOL = 1;

function parseArgs(argv) {
  const opts = { port: 25565, world: 'worlds/server.json', seed: '', mode: 'survival', name: 'ClaudeCraft Server', lan: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') opts.port = Number(next());
    else if (a === '--world') opts.world = next();
    else if (a === '--seed') opts.seed = next();
    else if (a === '--mode') opts.mode = next() === 'creative' ? 'creative' : 'survival';
    else if (a === '--name') opts.name = next();
    else if (a === '--lan') opts.lan = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function parseSeed(text) {
  const t = String(text ?? '').trim();
  if (!t) return (Math.random() * 4294967296) >>> 0;
  if (/^-?\d+$/.test(t)) return Number(BigInt.asUintN(32, BigInt(t)));
  return hashString(t);
}

export const DISCOVERY_PORT = 25566;

// Broadcast addresses of this computer's networks (for server discovery).
function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      out.add(ip.map((v, i) => (v & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...out];
}

// LAN server discovery: every server with a world announces itself every two
// seconds over UDP broadcast, and remembers the announcements it hears, so
// the Multiplayer screen can list every server on the network.
export class Discovery {
  constructor(info, port = DISCOVERY_PORT) {
    this.info = info; // () => { name, port, players } or null when not hosting
    this.port = port;
    this.heard = new Map(); // "ip:port" -> { name, address, players, seen }
  }

  start() {
    const sock = createSocket({ type: 'udp4', reuseAddr: true });
    this.sock = sock;
    sock.on('error', () => {});
    sock.on('message', (buf, rinfo) => {
      let m;
      try { m = JSON.parse(buf.toString('utf8')); } catch { return; }
      if (m?.game !== 'claudecraft' || !Number.isInteger(m.port) || typeof m.name !== 'string') return;
      const address = `${rinfo.address}:${m.port}`;
      this.heard.set(address, { name: m.name.slice(0, 40), address, players: m.players | 0, mode: m.mode, seen: Date.now() });
    });
    sock.bind(this.port, () => {
      try { sock.setBroadcast(true); } catch { /* ignore */ }
    });
    this.timer = setInterval(() => this.announce(), 2000);
    this.announce();
  }

  announce() {
    const info = this.info();
    if (!info || !this.sock) return;
    const msg = Buffer.from(JSON.stringify({ game: 'claudecraft', protocol: PROTOCOL, ...info }));
    for (const addr of broadcastAddresses()) this.sock.send(msg, this.port, addr, () => {});
  }

  // Servers heard in the last few seconds.
  servers() {
    const now = Date.now();
    const out = [];
    for (const [k, v] of this.heard) {
      if (now - v.seen > 7000) this.heard.delete(k);
      else out.push({ name: v.name, address: v.address, players: v.players, mode: v.mode });
    }
    return out;
  }

  stop() {
    clearInterval(this.timer);
    try { this.sock?.close(); } catch { /* ignore */ }
  }
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// --- WebSocket (RFC 6455) --------------------------------------------------------------

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 32 * 1024 * 1024;

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class WSConnection {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.open = true;
    this.lastSeen = Date.now();
    socket.setNoDelay(true);
    socket.on('data', (d) => this.receive(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }

  receive(data) {
    this.lastSeen = Date.now();
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, data]) : data;
    while (this.open) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        off = 10;
      }
      if (len > MAX_MESSAGE) return this.close(1009);
      const maskOff = off;
      if (masked) off += 4;
      if (b.length < off + len) return;
      const payload = Buffer.from(b.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= b[maskOff + (i & 3)];
      this.buffer = b.subarray(off + len);
      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) { this.write(0xa, payload); continue; }
      if (opcode === 0xa) continue;
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.onMessage(msg);
        }
      }
    }
  }

  write(opcode, payload) {
    if (!this.open) return;
    try { this.socket.write(encodeFrame(opcode, payload)); } catch { this.closed(); }
  }

  send(text) {
    this.write(0x1, Buffer.from(text, 'utf8'));
  }

  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code, 0);
    this.write(0x8, p);
    this.socket.end();
    this.closed();
  }

  closed() {
    if (!this.open) return;
    this.open = false;
    this.socket.destroy();
    this.onClose();
  }
}

// --- Shared world state ------------------------------------------------------------------

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

export class ServerWorld {
  constructor() {
    this.meta = null; // { seed, name, mode }
    this.edits = new Map(); // "cx,cz" -> Map(idx -> id)
    this.blockEntities = new Map(); // "x,y,z" -> encoded data
    this.ticks = 1000;
    this.weather = null;
    this.playerData = {}; // name -> saved player
    this.dirty = false;
  }

  create(seed, name, mode) {
    this.meta = { seed, name, mode };
    this.dirty = true;
  }

  setBlock(x, y, z, id) {
    if (![x, y, z, id].every(Number.isInteger) || y < 0 || y > 255 || id < 0 || id > 255) return false;
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    let map = this.edits.get(key);
    if (!map) this.edits.set(key, (map = new Map()));
    map.set((y << 8) | ((z & 15) << 4) | (x & 15), id);
    this.dirty = true;
    return true;
  }

  // Same format as the game's saves: { "cx,cz": base64(idx16 id8 ...) }.
  encodeEdits() {
    const out = {};
    for (const [key, map] of this.edits) {
      const bytes = new Uint8Array(map.size * 3);
      let i = 0;
      for (const [idx, id] of map) {
        bytes[i++] = idx >> 8;
        bytes[i++] = idx & 255;
        bytes[i++] = id;
      }
      out[key] = b64(bytes);
    }
    return out;
  }

  loadEdits(obj) {
    this.edits = new Map();
    for (const [key, v] of Object.entries(obj || {})) {
      if (!/^-?\d+,-?\d+$/.test(key) || typeof v !== 'string') continue;
      const bytes = Buffer.from(v, 'base64');
      const map = new Map();
      for (let i = 0; i + 2 < bytes.length; i += 3) map.set((bytes[i] << 8) | bytes[i + 1], bytes[i + 2]);
      this.edits.set(key, map);
    }
  }

  toJSON() {
    return {
      version: PROTOCOL, meta: this.meta, edits: this.encodeEdits(), blockEntities: [...this.blockEntities],
      ticks: this.ticks, weather: this.weather, playerData: this.playerData,
    };
  }

  fromJSON(data) {
    this.meta = data.meta || null;
    this.loadEdits(data.edits);
    this.blockEntities = new Map(Array.isArray(data.blockEntities) ? data.blockEntities : []);
    this.ticks = Number.isFinite(data.ticks) ? data.ticks : 1000;
    this.weather = data.weather || null;
    this.playerData = data.playerData || {};
  }
}

// --- The game server -------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

export class GameServer {
  constructor(opts) {
    this.opts = opts;
    this.world = new ServerWorld();
    this.clients = new Map(); // id -> client
    this.nextId = 1;
    this.authority = null;
    this.hostId = null; // LAN mode: the player whose game owns the world
    this.log = opts.quiet ? () => {} : (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  }

  async start() {
    const o = this.opts;
    if (!o.lan) {
      const file = resolve(ROOT, o.world);
      this.file = file;
      const data = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
      if (data?.meta) {
        this.world.fromJSON(data);
        this.log(`Loaded world "${this.world.meta.name}" (seed ${this.world.meta.seed}) from ${o.world}`);
      } else {
        this.world.create(parseSeed(o.seed), o.name, o.mode);
        this.log(`Created world "${o.name}" (seed ${this.world.meta.seed}, ${o.mode})`);
        await this.save();
      }
      this.saveTimer = setInterval(() => this.save(), 30000);
    }
    this.http = createServer((req, res) => this.serveHttp(req, res));
    this.http.on('upgrade', (req, socket) => this.upgrade(req, socket));
    await new Promise((ok, fail) => {
      this.http.once('error', fail);
      this.http.listen(o.port, o.host || '0.0.0.0', ok);
    });
    this.port = this.http.address().port;
    this.pingTimer = setInterval(() => this.heartbeat(), 15000);
    if (o.discovery !== false) {
      this.discovery = new Discovery(() => (this.world.meta ? {
        name: this.world.meta.name, port: this.port, mode: this.world.meta.mode,
        players: [...this.clients.values()].filter((c) => c.name).length,
      } : null), o.discoveryPort);
      this.discovery.start();
    }
    this.log(`ClaudeCraft server on port ${this.port}. Join at: ${['localhost', ...lanAddresses()].map((a) => `http://${a}:${this.port}/`).join('  ')}`);
    return this;
  }

  async stop() {
    clearInterval(this.saveTimer);
    clearInterval(this.pingTimer);
    this.discovery?.stop();
    for (const c of this.clients.values()) c.ws.close(1001);
    await this.save();
    await new Promise((ok) => this.http.close(ok));
  }

  async save() {
    if (!this.file || !this.world.meta || !this.world.dirty) return;
    this.world.dirty = false;
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.world.toJSON()));
    await rename(tmp, this.file);
  }

  async serveHttp(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/servers') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ servers: this.discovery ? this.discovery.servers() : [], lan: this.opts.lan, hosting: !!this.world.meta }));
        return;
      }
      if (url.pathname === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ game: 'claudecraft', protocol: PROTOCOL, name: this.world.meta?.name || null, lan: this.opts.lan, players: [...this.clients.values()].filter((c) => c.name).map((c) => c.name), addresses: lanAddresses(), port: this.port }));
        return;
      }
      const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (path.startsWith('worlds') || path.startsWith('.git') || path.startsWith('node_modules')) throw new Error('hidden');
      let file = join(ROOT, path);
      if (!file.startsWith(ROOT)) throw new Error('outside');
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  }

  upgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (new URL(req.url, 'http://localhost').pathname !== '/ws' || !key) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client = { id: `p${this.nextId++}`, name: null, state: null, ws: null };
    client.ws = new WSConnection(socket, (text) => this.receive(client, text), () => this.disconnect(client));
    this.clients.set(client.id, client);
  }

  heartbeat() {
    const now = Date.now();
    for (const c of this.clients.values()) {
      if (now - c.ws.lastSeen > 60000) c.ws.close(1001);
      else c.ws.write(0x9, Buffer.alloc(0));
    }
  }

  send(c, msg) {
    c?.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  // To every joined player except `except`.
  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const c of this.clients.values()) if (c !== except && c.name) c.ws.send(text);
  }

  receive(c, text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.name) {
      if (m.t === 'hello') this.hello(c, m);
      return;
    }
    const w = this.world;
    switch (m.t) {
      case 'pos':
        c.state = m;
        this.broadcast({ ...m, id: c.id }, c);
        break;
      case 'blocks':
        if (!Array.isArray(m.list)) return;
        m.list = m.list.filter((b) => Array.isArray(b) && w.setBlock(b[0], b[1], b[2], b[3]));
        this.broadcast({ t: 'blocks', list: m.list, from: c.id }, c);
        break;
      case 'be':
        if (typeof m.k !== 'string') return;
        if (m.d) w.blockEntities.set(m.k, m.d);
        else w.blockEntities.delete(m.k);
        w.dirty = true;
        this.broadcast({ t: 'be', k: m.k, d: m.d || null }, c);
        break;
      case 'chat': {
        const textMsg = String(m.text ?? '').slice(0, 256).trim();
        if (textMsg) this.broadcast({ t: 'chat', from: c.id, name: c.name, text: textMsg });
        this.log(`<${c.name}> ${textMsg}`);
        break;
      }
      case 'time':
        if (Number.isFinite(m.ticks)) {
          w.ticks = m.ticks;
          this.broadcast({ t: 'time', ticks: m.ticks }, c);
        }
        break;
      case 'weather':
        w.weather = m.w;
        this.broadcast({ t: 'weather', w: m.w }, c);
        break;
      case 'ents':
        if (c.id === this.authority) this.broadcast(m, c);
        break;
      case 'to': {
        const target = this.clients.get(m.to === 'auth' ? this.authority : m.to);
        if (target && target.name) this.send(target, { t: 'msg', from: c.id, m: m.m });
        break;
      }
      case 'bc':
        this.broadcast({ t: 'msg', from: c.id, m: m.m }, c);
        break;
      case 'save':
        if (m.data && typeof m.data === 'object') {
          w.playerData[c.name] = m.data;
          w.dirty = true;
        }
        break;
      case 'world':
        // The LAN host's game saves the world; keep ours in step with it.
        if (c.id === this.hostId && Number.isFinite(m.ticks)) w.ticks = m.ticks;
        break;
    }
  }

  hello(c, m) {
    const w = this.world;
    if (m.protocol !== PROTOCOL) {
      this.send(c, { t: 'error', text: `This server runs a different version of ClaudeCraft (protocol ${PROTOCOL}).` });
      return c.ws.close(1000);
    }
    if (m.host && this.opts.lan && !w.meta) {
      // A player opens their world to the LAN.
      const h = m.host;
      w.create(Number(h.seed) >>> 0, String(h.name || 'LAN World').slice(0, 40), h.mode === 'creative' ? 'creative' : 'survival');
      w.loadEdits(h.edits);
      w.blockEntities = new Map(Array.isArray(h.blockEntities) ? h.blockEntities : []);
      w.ticks = Number(h.ticks) || 1000;
      w.weather = h.weather || null;
      w.playerData = h.playerData || {};
      this.hostId = c.id;
      this.authority = c.id;
      this.log(`${m.name} opened "${w.meta.name}" to LAN`);
    } else if (!w.meta) {
      this.send(c, { t: 'error', text: 'Nobody is hosting a world on this server yet.' });
      return c.ws.close(1000);
    } else if (m.host) {
      this.send(c, { t: 'error', text: 'This server is already running a world.' });
      return c.ws.close(1000);
    }
    let name = String(m.name || 'Player').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16) || 'Player';
    const taken = new Set([...this.clients.values()].map((o) => o.name));
    for (let i = 2; taken.has(name); i++) name = `${name.slice(0, 13)}${i}`;
    c.name = name;
    if (!this.authority || !this.clients.get(this.authority)?.name) this.authority = c.id;
    this.send(c, {
      t: 'welcome', id: c.id, name, authority: this.authority, world: w.meta, edits: w.encodeEdits(), blockEntities: [...w.blockEntities],
      ticks: w.ticks, weather: w.weather, you: w.playerData[name] || null, lan: this.opts.lan, addresses: lanAddresses(), port: this.port,
      players: [...this.clients.values()].filter((o) => o !== c && o.name).map((o) => ({ id: o.id, name: o.name, state: o.state })),
    });
    this.broadcast({ t: 'join', id: c.id, name }, c);
    this.log(`${name} joined (${this.clients.size} online)`);
  }

  disconnect(c) {
    this.clients.delete(c.id);
    if (!c.name) return;
    this.log(`${c.name} left`);
    this.broadcast({ t: 'leave', id: c.id, name: c.name });
    if (c.id === this.hostId) {
      // The LAN host closed their game: the world goes with them.
      for (const o of this.clients.values()) {
        this.send(o, { t: 'error', text: 'The host closed the game.' });
        o.ws.close(1000);
      }
      this.world = new ServerWorld();
      this.hostId = null;
      this.authority = null;
      return;
    }
    if (c.id === this.authority) {
      const next = [...this.clients.values()].find((o) => o.name);
      this.authority = next ? next.id : null;
      if (next) this.broadcast({ t: 'authority', id: next.id });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('Usage: node tools/server.mjs [--port 25565] [--world worlds/server.json] [--seed text] [--mode survival|creative] [--name text] [--lan]');
    process.exit(0);
  }
  const server = await new GameServer(opts).start();
  const quit = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}
