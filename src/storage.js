// World saves in localStorage. Only the seed and the player's block edits are
// stored; everything else is regenerated deterministically from the seed.
import { SAVE_VERSION } from './constants.js';
import { chunkKey } from './chunk.js';

const PREFIX = 'claudecraft:';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function fromBase64(str) {
  const clean = str.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// edits: Map(chunkKey -> Map(idx -> id)) <-> { "cx,cz": base64(idx16, id8)* }
export function encodeEdits(edits) {
  const out = {};
  for (const [key, map] of edits) {
    if (!map.size) continue;
    const cx = Math.floor(key / 65536) - 32768;
    const cz = (key % 65536) - 32768;
    const bytes = new Uint8Array(map.size * 3);
    let i = 0;
    for (const [idx, id] of map) {
      bytes[i++] = idx >> 8;
      bytes[i++] = idx & 255;
      bytes[i++] = id;
    }
    out[`${cx},${cz}`] = toBase64(bytes);
  }
  return out;
}

export function decodeEdits(obj) {
  const edits = new Map();
  if (!obj || typeof obj !== 'object') return edits;
  for (const [k, v] of Object.entries(obj)) {
    const [cx, cz] = k.split(',').map(Number);
    if (!Number.isInteger(cx) || !Number.isInteger(cz) || typeof v !== 'string') continue;
    const bytes = fromBase64(v);
    const map = new Map();
    for (let i = 0; i + 2 < bytes.length; i += 3) map.set((bytes[i] << 8) | bytes[i + 1], bytes[i + 2]);
    edits.set(chunkKey(cx, cz), map);
  }
  return edits;
}

export class Storage {
  constructor(backend) {
    this.backend = backend || Storage.defaultBackend();
  }

  static defaultBackend() {
    try {
      const ls = globalThis.localStorage;
      const probe = `${PREFIX}probe`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch {
      // Private mode / sandboxed frames: keep saves in memory for this session.
      const mem = new Map();
      return {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: (k) => mem.delete(k),
        persistent: false,
      };
    }
  }

  get persistent() {
    return this.backend.persistent !== false;
  }

  _get(key, fallback) {
    try {
      const raw = this.backend.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  _set(key, value) {
    try {
      this.backend.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Save failed', err);
      return false;
    }
  }

  listWorlds() {
    const list = this._get('worlds', []);
    return Array.isArray(list) ? list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)) : [];
  }

  createWorld({ name, seed, mode }) {
    const id = `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const meta = { id, name, seed, mode, created: Date.now(), lastPlayed: Date.now() };
    const worlds = this.listWorlds().filter((w) => w.id !== id);
    worlds.push(meta);
    this._set('worlds', worlds);
    return meta;
  }

  loadWorld(id) {
    const data = this._get(`world:${id}`, null);
    if (!data) return null;
    return { ...data, edits: decodeEdits(data.edits) };
  }

  saveWorld(meta, { player, inventory, ticks, edits }) {
    meta.lastPlayed = Date.now();
    const worlds = this.listWorlds().filter((w) => w.id !== meta.id);
    worlds.push(meta);
    this._set('worlds', worlds);
    return this._set(`world:${meta.id}`, {
      version: SAVE_VERSION,
      player,
      inventory,
      ticks,
      edits: encodeEdits(edits),
    });
  }

  deleteWorld(id) {
    this._set('worlds', this.listWorlds().filter((w) => w.id !== id));
    try {
      this.backend.removeItem(`${PREFIX}world:${id}`);
    } catch {
      /* ignore */
    }
  }

  loadSettings(defaults) {
    return { ...defaults, ...this._get('settings', {}) };
  }

  saveSettings(settings) {
    this._set('settings', settings);
  }
}
