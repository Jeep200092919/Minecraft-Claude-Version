// Mob definitions: box models (Minecraft-style box UV layout) and
// procedurally painted 64x64 skins.
import { MeshBuilder } from './mesher.js';
import { mulberry32, hashString } from './noise.js';
import { I } from './blocks.js';

export const SKIN = 64;

// Model boxes are in pixels (1/16 block) with the origin at the feet centre;
// the model faces +Z. `uv` is the top-left of the box's texture layout.
// Part kinds drive animation: head, body, legFL/legFR/legBL/legBR (quadrupeds),
// legL/legR/armL/armR (humanoids), wingL/wingR, static.
export const MOBS = {
  pig: {
    health: 10, width: 0.9, height: 0.9, speed: 1.5, passive: true, skin: 0,
    drops: [[I.RAW_PORKCHOP, 1, 3]], sound: 'pig',
    parts: [
      { kind: 'body', box: [-5, 6, -8, 5, 14, 8], uv: [0, 32] },
      { kind: 'head', box: [-4, 8, 6, 4, 16, 14], uv: [0, 0], pivot: [0, 12, 7] },
      { kind: 'head', box: [-2, 9, 14, 2, 12, 15], uv: [32, 0], pivot: [0, 12, 7] },
      { kind: 'legFL', box: [-5, 0, 3, -1, 6, 7], uv: [0, 16], pivot: [-3, 6, 5] },
      { kind: 'legFR', box: [1, 0, 3, 5, 6, 7], uv: [0, 16], pivot: [3, 6, 5] },
      { kind: 'legBL', box: [-5, 0, -7, -1, 6, -3], uv: [0, 16], pivot: [-3, 6, -5] },
      { kind: 'legBR', box: [1, 0, -7, 5, 6, -3], uv: [0, 16], pivot: [3, 6, -5] },
    ],
  },
  cow: {
    health: 10, width: 0.9, height: 1.4, speed: 1.4, passive: true, skin: 1,
    drops: [[I.RAW_BEEF, 1, 3], [I.LEATHER, 0, 2]], sound: 'cow',
    parts: [
      { kind: 'body', box: [-6, 12, -9, 6, 22, 9], uv: [0, 32] },
      { kind: 'head', box: [-4, 16, 8, 4, 24, 14], uv: [0, 0], pivot: [0, 20, 9] },
      { kind: 'head', box: [-5, 22, 10, -4, 25, 11], uv: [30, 0], pivot: [0, 20, 9] },
      { kind: 'head', box: [4, 22, 10, 5, 25, 11], uv: [30, 0], pivot: [0, 20, 9] },
      { kind: 'legFL', box: [-6, 0, 4, -2, 12, 8], uv: [0, 16], pivot: [-4, 12, 6] },
      { kind: 'legFR', box: [2, 0, 4, 6, 12, 8], uv: [0, 16], pivot: [4, 12, 6] },
      { kind: 'legBL', box: [-6, 0, -8, -2, 12, -4], uv: [0, 16], pivot: [-4, 12, -6] },
      { kind: 'legBR', box: [2, 0, -8, 6, 12, -4], uv: [0, 16], pivot: [4, 12, -6] },
    ],
  },
  sheep: {
    health: 8, width: 0.9, height: 1.3, speed: 1.4, passive: true, skin: 2,
    drops: [[40, 1, 1], [I.RAW_MUTTON, 1, 2]], sound: 'sheep',
    parts: [
      { kind: 'body', box: [-5, 10, -8, 5, 20, 8], uv: [0, 32] },
      { kind: 'head', box: [-3, 15, 7, 3, 21, 14], uv: [0, 0], pivot: [0, 18, 8] },
      { kind: 'legFL', box: [-5, 0, 3, -1, 10, 7], uv: [0, 16], pivot: [-3, 10, 5] },
      { kind: 'legFR', box: [1, 0, 3, 5, 10, 7], uv: [0, 16], pivot: [3, 10, 5] },
      { kind: 'legBL', box: [-5, 0, -7, -1, 10, -3], uv: [0, 16], pivot: [-3, 10, -5] },
      { kind: 'legBR', box: [1, 0, -7, 5, 10, -3], uv: [0, 16], pivot: [3, 10, -5] },
    ],
  },
  chicken: {
    health: 4, width: 0.4, height: 0.7, speed: 1.2, passive: true, skin: 3, slowFall: true,
    drops: [[I.RAW_CHICKEN, 1, 1], [I.FEATHER, 0, 2]], sound: 'chicken',
    parts: [
      { kind: 'body', box: [-3, 4, -4, 3, 10, 4], uv: [0, 32] },
      { kind: 'head', box: [-2, 9, 3, 2, 15, 6], uv: [0, 0], pivot: [0, 10, 4] },
      { kind: 'head', box: [-2, 11, 6, 2, 13, 8], uv: [16, 0], pivot: [0, 10, 4] },
      { kind: 'head', box: [-1, 9, 6, 1, 11, 7], uv: [30, 0], pivot: [0, 10, 4] },
      { kind: 'wingL', box: [-4, 5, -3, -3, 9, 3], uv: [0, 16], pivot: [-3, 9, 0] },
      { kind: 'wingR', box: [3, 5, -3, 4, 9, 3], uv: [0, 16], pivot: [3, 9, 0] },
      { kind: 'legL', box: [-2, 0, 0, -1, 4, 1], uv: [20, 16], pivot: [-2, 4, 0] },
      { kind: 'legR', box: [1, 0, 0, 2, 4, 1], uv: [20, 16], pivot: [1, 4, 0] },
    ],
  },
  zombie: {
    health: 20, width: 0.6, height: 1.95, speed: 2.3, hostile: true, skin: 4, burnsInDay: true, attack: 3,
    drops: [[I.ROTTEN_FLESH, 0, 2]], sound: 'zombie',
    parts: humanoid(),
  },
  creeper: {
    health: 20, width: 0.6, height: 1.7, speed: 2.4, hostile: true, skin: 5, explodes: true,
    drops: [[I.GUNPOWDER, 0, 2]], sound: 'creeper',
    parts: [
      { kind: 'body', box: [-4, 6, -2, 4, 18, 2], uv: [16, 16] },
      { kind: 'head', box: [-4, 18, -4, 4, 26, 4], uv: [0, 0], pivot: [0, 18, 0] },
      { kind: 'legFL', box: [-4, 0, 2, 0, 6, 6], uv: [0, 16], pivot: [-2, 6, 4] },
      { kind: 'legFR', box: [0, 0, 2, 4, 6, 6], uv: [0, 16], pivot: [2, 6, 4] },
      { kind: 'legBL', box: [-4, 0, -6, 0, 6, -2], uv: [0, 16], pivot: [-2, 6, -4] },
      { kind: 'legBR', box: [0, 0, -6, 4, 6, -2], uv: [0, 16], pivot: [2, 6, -4] },
    ],
  },
  villager: {
    health: 20, width: 0.6, height: 1.95, speed: 1.0, passive: true, skin: 6, villager: true,
    drops: [], sound: 'villager',
    parts: [
      { kind: 'legL', box: [-4, 0, -2, 0, 12, 2], uv: [0, 20], pivot: [-2, 12, 0] },
      { kind: 'legR', box: [0, 0, -2, 4, 12, 2], uv: [0, 20], pivot: [2, 12, 0] },
      { kind: 'body', box: [-4, 12, -3, 4, 24, 3], uv: [16, 20] },
      { kind: 'head', box: [-4, 24, -4, 4, 34, 4], uv: [0, 0], pivot: [0, 24, 0] },
      { kind: 'head', box: [-1, 25, 4, 1, 29, 6], uv: [32, 0], pivot: [0, 24, 0] },
      { kind: 'static', box: [-6, 17, 3, 6, 21, 7], uv: [0, 40] },
    ],
  },
};

function humanoid() {
  return [
    { kind: 'legL', box: [-4, 0, -2, 0, 12, 2], uv: [0, 16], pivot: [-2, 12, 0] },
    { kind: 'legR', box: [0, 0, -2, 4, 12, 2], uv: [0, 16], pivot: [2, 12, 0] },
    { kind: 'body', box: [-4, 12, -2, 4, 24, 2], uv: [16, 16] },
    { kind: 'head', box: [-4, 24, -4, 4, 32, 4], uv: [0, 0], pivot: [0, 24, 0] },
    { kind: 'armL', box: [-8, 12, -2, -4, 24, 2], uv: [40, 16], pivot: [-6, 22, 0] },
    { kind: 'armR', box: [4, 12, -2, 8, 24, 2], uv: [40, 16], pivot: [6, 22, 0] },
  ];
}

export const SPAWN_EGGS = {
  [I.PIG_SPAWN_EGG]: 'pig',
  [I.COW_SPAWN_EGG]: 'cow',
  [I.SHEEP_SPAWN_EGG]: 'sheep',
  [I.CHICKEN_SPAWN_EGG]: 'chicken',
  [I.ZOMBIE_SPAWN_EGG]: 'zombie',
  [I.CREEPER_SPAWN_EGG]: 'creeper',
  [I.VILLAGER_SPAWN_EGG]: 'villager',
};

// Texture rectangles of a box laid out Minecraft-style: [u, v, w, h] per face,
// indexed like mesher faces (+X, -X, +Y, -Y, +Z, -Z).
export function boxLayout(u, v, w, h, d) {
  return [
    [u + d + w, v + d, d, h], // +X
    [u, v + d, d, h], // -X
    [u + d, v, w, d], // +Y (top)
    [u + d + w, v, w, d], // -Y (bottom)
    [u + d, v + d, w, h], // +Z (front)
    [u + d + w + d, v + d, w, h], // -Z (back)
  ];
}

const FACE_DEFS = [
  { u: [0, 0, -1], v: [0, 1, 0], base: [1, 0, 1] },
  { u: [0, 0, 1], v: [0, 1, 0], base: [0, 0, 0] },
  { u: [1, 0, 0], v: [0, 0, -1], base: [0, 1, 1] },
  { u: [1, 0, 0], v: [0, 0, 1], base: [0, 0, 0] },
  { u: [1, 0, 0], v: [0, 1, 0], base: [0, 0, 1] },
  { u: [-1, 0, 0], v: [0, 1, 0], base: [1, 0, 0] },
];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Builds the vertex data for one model part, positioned relative to its pivot.
export function buildPartMesh(part, layer) {
  const [x0, y0, z0, x1, y1, z1] = part.box;
  const pv = part.pivot || [0, 0, 0];
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const rects = boxLayout(part.uv[0], part.uv[1], w, h, d);
  const mb = new MeshBuilder(32);
  for (let f = 0; f < 6; f++) {
    const fd = FACE_DEFS[f];
    const [ru, rv, rw, rh] = rects[f];
    for (const [cu, cv] of CORNERS) {
      const c = [
        fd.base[0] + fd.u[0] * cu + fd.v[0] * cv,
        fd.base[1] + fd.u[1] * cu + fd.v[1] * cv,
        fd.base[2] + fd.u[2] * cu + fd.v[2] * cv,
      ];
      const px = (c[0] ? x1 : x0) - pv[0];
      const py = (c[1] ? y1 : y0) - pv[1];
      const pz = (c[2] ? z1 : z0) - pv[2];
      mb.vertex(px, py, pz, ru + cu * rw, rv + (1 - cv) * rh, layer, 240, 0, 255, 0, f);
    }
  }
  return { data: mb.result(), quads: mb.quads };
}

// --- Skins ---------------------------------------------------------------------

class Skin {
  constructor(seed) {
    this.data = new Uint8ClampedArray(SKIN * SKIN * 4);
    this.rng = mulberry32(hashString(seed));
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= SKIN || y >= SKIN) return;
    const i = (y * SKIN + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
  }
  rect(r, color, noise = 12) {
    const [u, v, w, h] = r;
    for (let y = v; y < v + h; y++) {
      for (let x = u; x < u + w; x++) {
        const n = (this.rng() - 0.5) * noise;
        const c = typeof color === 'function' ? color(x - u, y - v, w, h) : color;
        this.set(x, y, [c[0] + n, c[1] + n, c[2] + n]);
      }
    }
  }
  // Paints all faces of a box layout.
  box(u, v, w, h, d, color, noise) {
    for (const r of boxLayout(u, v, w, h, d)) this.rect(r, color, noise);
  }
  face(u, v, w, h, d, f) {
    return boxLayout(u, v, w, h, d)[f];
  }
}

const FRONT = 4;

function paintPig() {
  const s = new Skin('pig');
  const pink = [238, 158, 158];
  s.box(0, 32, 10, 8, 16, pink);
  s.box(0, 0, 8, 8, 8, pink);
  s.box(32, 0, 4, 3, 1, [244, 176, 176], 6);
  const snout = s.face(32, 0, 4, 3, 1, FRONT);
  s.set(snout[0] + 1, snout[1] + 1, [150, 80, 90]); s.set(snout[0] + 2, snout[1] + 1, [150, 80, 90]);
  const face = s.face(0, 0, 8, 8, 8, FRONT);
  s.set(face[0] + 1, face[1] + 3, [250, 250, 250]); s.set(face[0] + 2, face[1] + 3, [20, 20, 20]);
  s.set(face[0] + 6, face[1] + 3, [250, 250, 250]); s.set(face[0] + 5, face[1] + 3, [20, 20, 20]);
  s.box(0, 16, 4, 6, 4, (x, y, w, h) => (y >= h - 1 ? [110, 70, 60] : pink));
  return s;
}

function paintCow() {
  const s = new Skin('cow');
  const spots = mulberry32(7);
  const brown = [70, 50, 36], white = [236, 236, 230];
  s.box(0, 32, 12, 10, 18, () => (spots() < 0.28 ? white : brown), 10);
  s.box(0, 0, 8, 8, 6, brown);
  const face = s.face(0, 0, 8, 8, 6, FRONT);
  s.rect([face[0] + 2, face[1] + 2, 4, 6], white, 6);
  s.rect([face[0] + 2, face[1] + 5, 4, 3], [210, 160, 150], 6);
  s.set(face[0] + 1, face[1] + 2, [20, 20, 20]); s.set(face[0] + 6, face[1] + 2, [20, 20, 20]);
  s.box(30, 0, 1, 3, 1, [210, 210, 200], 4);
  s.box(0, 16, 4, 12, 4, (x, y, w, h) => (y >= h - 2 ? [40, 30, 24] : y < 4 ? brown : white));
  return s;
}

function paintSheep() {
  const s = new Skin('sheep');
  const wool = [234, 234, 228];
  s.box(0, 32, 10, 10, 16, wool, 18);
  s.box(0, 0, 6, 6, 7, wool, 14);
  const face = s.face(0, 0, 6, 6, 7, FRONT);
  s.rect([face[0] + 1, face[1] + 1, 4, 5], [200, 170, 150], 6);
  s.set(face[0] + 1, face[1] + 2, [30, 30, 30]); s.set(face[0] + 4, face[1] + 2, [30, 30, 30]);
  s.box(0, 16, 4, 10, 4, (x, y) => (y < 4 ? wool : [206, 176, 156]), 8);
  return s;
}

function paintChicken() {
  const s = new Skin('chicken');
  const white = [240, 240, 236];
  s.box(0, 32, 6, 6, 8, white, 8);
  s.box(0, 0, 4, 6, 3, white, 6);
  const face = s.face(0, 0, 4, 6, 3, FRONT);
  s.set(face[0], face[1] + 1, [20, 20, 20]); s.set(face[0] + 3, face[1] + 1, [20, 20, 20]);
  s.box(16, 0, 4, 2, 2, [240, 170, 40], 6);
  s.box(30, 0, 2, 2, 1, [210, 30, 30], 6);
  s.box(0, 16, 1, 4, 6, [226, 226, 222], 8);
  s.box(20, 16, 1, 4, 1, [240, 170, 40], 4);
  return s;
}

function paintHumanoid(name, skinColor, shirt, pants, faceFn) {
  const s = new Skin(name);
  s.box(0, 0, 8, 8, 8, skinColor, 10);
  s.box(16, 16, 8, 12, 4, shirt, 10);
  s.box(40, 16, 4, 12, 4, (x, y) => (y < 8 ? shirt : skinColor), 10);
  s.box(0, 16, 4, 12, 4, pants, 10);
  faceFn(s, s.face(0, 0, 8, 8, 8, FRONT));
  return s;
}

function paintZombie() {
  return paintHumanoid('zombie', [96, 140, 80], [40, 150, 160], [60, 50, 150], (s, f) => {
    s.rect([f[0] + 1, f[1] + 3, 2, 1], [20, 30, 20], 0);
    s.rect([f[0] + 5, f[1] + 3, 2, 1], [20, 30, 20], 0);
    s.rect([f[0] + 2, f[1] + 5, 4, 1], [50, 80, 40], 0);
  });
}

function paintCreeper() {
  const s = new Skin('creeper');
  const green = (x, y) => (((x * 7 + y * 13) % 5) < 2 ? [90, 176, 80] : [70, 150, 62]);
  s.box(0, 0, 8, 8, 8, green, 26);
  s.box(16, 16, 8, 12, 4, green, 26);
  s.box(0, 16, 4, 6, 4, green, 26);
  const f = s.face(0, 0, 8, 8, 8, FRONT);
  const black = [18, 18, 18];
  s.rect([f[0] + 1, f[1] + 2, 2, 2], black, 0);
  s.rect([f[0] + 5, f[1] + 2, 2, 2], black, 0);
  s.rect([f[0] + 3, f[1] + 4, 2, 3], black, 0);
  s.set(f[0] + 2, f[1] + 5, black); s.set(f[0] + 5, f[1] + 5, black);
  s.set(f[0] + 2, f[1] + 6, black); s.set(f[0] + 5, f[1] + 6, black);
  return s;
}

function paintVillager() {
  const s = new Skin('villager');
  const skin = [196, 150, 110], robe = [110, 72, 44];
  s.box(0, 0, 8, 10, 8, skin, 8);
  const f = s.face(0, 0, 8, 10, 8, FRONT);
  s.rect([f[0], f[1], 8, 2], [60, 44, 30], 4);
  s.set(f[0] + 1, f[1] + 4, [250, 250, 250]); s.set(f[0] + 2, f[1] + 4, [40, 120, 40]);
  s.set(f[0] + 6, f[1] + 4, [250, 250, 250]); s.set(f[0] + 5, f[1] + 4, [40, 120, 40]);
  s.rect([f[0] + 2, f[1] + 3, 4, 1], [60, 44, 30], 0);
  s.box(32, 0, 2, 4, 2, [186, 140, 100], 6);
  s.box(16, 20, 8, 12, 6, robe, 12);
  s.box(0, 20, 4, 12, 4, [80, 52, 32], 10);
  s.box(0, 40, 12, 4, 4, robe, 12);
  return s;
}

let skinCache = null;
export function mobSkins() {
  if (skinCache) return skinCache;
  const skins = [paintPig(), paintCow(), paintSheep(), paintChicken(), paintZombie(), paintCreeper(), paintVillager()];
  const pixels = new Uint8Array(skins.length * SKIN * SKIN * 4);
  skins.forEach((s, i) => pixels.set(s.data, i * SKIN * SKIN * 4));
  skinCache = { pixels, count: skins.length };
  return skinCache;
}
