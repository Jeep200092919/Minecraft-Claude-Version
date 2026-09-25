// Procedural 16x16 pixel-art textures. Everything is generated from seeded
// noise so the game ships with zero image assets. Pure JS (no DOM), so the
// output can also be inspected in tests.
import { mulberry32, hashString } from './noise.js';
import { toolArt, stickArt, armorArt, ITEM_ART } from './itemart.js';

export const TILE = 16;
const N = TILE * TILE * 4;

class Tile {
  constructor() {
    this.data = new Uint8ClampedArray(N);
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }
  get(x, y) {
    const i = (y * TILE + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alpha(x, y) {
    return this.data[(y * TILE + x) * 4 + 3];
  }
  fill(fn) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) fn(x, y);
  }
  copy(other) {
    this.data.set(other.data);
    return this;
  }
}

const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const add = (c, d) => [c[0] + d, c[1] + d, c[2] + d];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Tileable value noise (period 16px) for blotchy, natural looking patterns.
function valueNoise(rng, cell) {
  const g = TILE / cell;
  const vals = Array.from({ length: g * g }, () => rng());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const v = (i, j) => vals[((j % g + g) % g) * g + ((i % g + g) % g)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function noisy(t, rng, base, amount, blotch = 0, cell = 4) {
  const vn = blotch ? valueNoise(rng, cell) : null;
  t.fill((x, y) => {
    let d = (rng() - 0.5) * 2 * amount;
    if (vn) d += (vn(x, y) - 0.5) * 2 * blotch;
    t.set(x, y, add(base, d));
  });
}

// --- Block textures -------------------------------------------------------

function stone(t, rng) {
  noisy(t, rng, [122, 122, 122], 10, 10);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    const len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) t.set((x + k) % 16, y, [100, 100, 100]);
  }
}

function dirt(t, rng) {
  noisy(t, rng, [122, 86, 58], 10, 12);
  t.fill((x, y) => {
    const r = rng();
    if (r < 0.1) t.set(x, y, [92, 64, 42]);
    else if (r < 0.15) t.set(x, y, [150, 110, 78]);
  });
}

// Grass and foliage are stored in grayscale and coloured per biome by the
// shader (like Minecraft's colormaps). The alpha channel marks which pixels
// get tinted: TINT_GRASS or TINT_FOLIAGE; 255 = no tint, 0 = transparent.
export const TINT_GRASS = 250;
export const TINT_FOLIAGE = 245;
const GRASS_GRAYS = [[176, 176, 176], [192, 192, 192], [158, 158, 158], [206, 206, 206]];

function grassTop(t, rng) {
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const c = GRASS_GRAYS[Math.floor(rng() * GRASS_GRAYS.length)];
    t.set(x, y, add(c, (vn(x, y) - 0.5) * 22), TINT_GRASS);
  });
}

function grassSide(t, rng, overlay = 'grass') {
  dirt(t, rng);
  for (let x = 0; x < 16; x++) {
    const depth = 3 + Math.floor(rng() * 2) + (rng() < 0.3 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      if (overlay === 'grass') {
        t.set(x, y, GRASS_GRAYS[Math.floor(rng() * GRASS_GRAYS.length)], TINT_GRASS);
      } else {
        t.set(x, y, add([240, 246, 250], (rng() - 0.5) * 10));
      }
    }
    if (overlay === 'grass' && rng() < 0.4) t.set(x, depth, [120, 120, 120], TINT_GRASS);
  }
}

function snow(t, rng) {
  noisy(t, rng, [240, 246, 250], 5, 6);
}

function cobblestone(t, rng) {
  // Rounded stones on a jittered 3x3 grid, lit from the top left, set in
  // dark mortar.
  const wrap = (d) => (d > 8 ? d - 16 : d < -8 ? d + 16 : d);
  // Irregular stones: random centres kept a few pixels apart (tileable).
  const pts = [];
  for (let tries = 0; pts.length < 12 && tries < 400; tries++) {
    const p = [rng() * 16, rng() * 16, 100 + rng() * 50];
    if (pts.every((q) => Math.hypot(wrap(p[0] - q[0]), wrap(p[1] - q[1])) > 3.6)) pts.push(p);
  }
  t.fill((x, y) => {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const p of pts) {
      const dx = wrap(x + 0.5 - p[0]), dy = wrap(y + 0.5 - p[1]);
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; best = [p, dx, dy]; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    if (edge < 0.75) { t.set(x, y, add([62, 62, 62], (rng() - 0.5) * 10)); return; }
    const [p, dx, dy] = best;
    let v = p[2] - (dx + dy) * 4.5 + (rng() - 0.5) * 12;
    if (edge < 1.8) v -= 16;
    t.set(x, y, [v, v, v]);
  });
}

function planks(t, rng, base = [160, 128, 76]) {
  const vn = valueNoise(rng, 8);
  for (let board = 0; board < 4; board++) {
    const tone = (rng() - 0.5) * 18;
    const seam = Math.floor(rng() * 16);
    for (let row = 0; row < 4; row++) {
      const y = board * 4 + row;
      for (let x = 0; x < 16; x++) {
        let c = add(base, tone + (vn(x, y * 3) - 0.5) * 16 + (rng() - 0.5) * 6);
        if (row === 3) c = scale(c, 0.72);
        if (x === seam && row !== 3) c = scale(c, 0.7);
        t.set(x, y, c);
      }
    }
  }
}

function bark(t, rng, base, stripe) {
  const cols = Array.from({ length: 16 }, () => (rng() - 0.5) * stripe);
  t.fill((x, y) => t.set(x, y, add(base, cols[x] + (rng() - 0.5) * 10)));
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    const len = 2 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) t.set(x, (y + k) % 16, scale(base, 0.7));
  }
}

function logTop(t, rng, ringA, ringB, barkColor) {
  t.fill((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c;
    if (d >= 7) c = add(barkColor, (rng() - 0.5) * 12);
    else c = add(Math.floor(d) % 2 ? ringA : ringB, (rng() - 0.5) * 8);
    t.set(x, y, c);
  });
}

function birchBark(t, rng) {
  noisy(t, rng, [214, 212, 204], 6, 6);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    const len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) t.set((x + k) % 16, y, [48, 46, 42]);
  }
  for (let i = 0; i < 5; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), [140, 138, 130]);
}

function leaves(t, rng, base, holes = 0.2, alpha = 255) {
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const f = 0.72 + vn(x, y) * 0.4 + (rng() - 0.5) * 0.18;
    if (rng() < holes) t.set(x, y, base, 0);
    else t.set(x, y, scale(base, f), alpha);
  });
}

function sand(t, rng) {
  noisy(t, rng, [219, 207, 160], 7, 5);
  t.fill((x, y) => { if (rng() < 0.08) t.set(x, y, [200, 186, 138]); });
}

function sandstoneSide(t, rng) {
  noisy(t, rng, [216, 203, 152], 5, 4);
  for (let x = 0; x < 16; x++) {
    t.set(x, 3, [190, 176, 128]);
    t.set(x, 12, [190, 176, 128]);
    for (let y = 0; y < 3; y++) t.set(x, y, add([226, 214, 164], (rng() - 0.5) * 8));
  }
}

function gravel(t, rng) {
  const pal = [[134, 126, 122], [110, 103, 100], [158, 150, 146], [95, 90, 88], [125, 117, 108]];
  t.fill((x, y) => t.set(x, y, pal[Math.floor(rng() * pal.length)]));
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * 15), y = Math.floor(rng() * 15);
    const c = pal[Math.floor(rng() * pal.length)];
    t.set(x, y, c); t.set(x + 1, y, c); t.set(x, y + 1, c); t.set(x + 1, y + 1, scale(c, 0.85));
  }
}

function bedrock(t, rng) {
  const pal = [[28, 28, 28], [58, 58, 58], [92, 92, 92], [132, 132, 132]];
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const v = Math.min(3, Math.floor((vn(x, y) * 0.7 + rng() * 0.5) * 4));
    t.set(x, y, pal[v]);
  });
}

function glass(t, rng, tint = [210, 232, 240]) {
  t.fill((x, y) => t.set(x, y, tint, 0));
  for (let i = 0; i < 16; i++) {
    t.set(i, 0, tint); t.set(i, 15, tint); t.set(0, i, tint); t.set(15, i, tint);
  }
  for (let i = 0; i < 4; i++) { t.set(3 + i, 7 - i, [245, 250, 255]); t.set(9 + i, 12 - i, [245, 250, 255]); }
  t.set(12, 3, [245, 250, 255]); t.set(11, 4, [245, 250, 255]);
}

function water(t, rng) {
  const vn = valueNoise(rng, 8);
  t.fill((x, y) => {
    const wave = Math.sin((x + y * 0.5) * 0.8 + vn(x, y) * 4) * 0.5 + 0.5;
    t.set(x, y, add([46, 98, 208], wave * 22 + (rng() - 0.5) * 8), 190);
  });
}

function lava(t, rng) {
  const vn = valueNoise(rng, 4);
  const vn2 = valueNoise(rng, 8);
  t.fill((x, y) => {
    const v = vn(x, y) * 0.6 + vn2(x, y) * 0.4;
    t.set(x, y, mix([196, 60, 8], [255, 176, 44], Math.min(1, v * v * 1.6 + rng() * 0.1)));
  });
}

function ore(t, rng, color, dark, base = stone) {
  base(t, rng);
  // Mineral nuggets: small blobs shaded light at the top left and dark at the
  // bottom right, each casting a little shadow on the stone.
  const shapes = [['.#', '##'], ['##', '##'], ['.##', '###', '.#.'], ['##.', '.##'], ['#.', '##', '.#'], ['###', '##.']];
  const light = add(color, 40);
  const centres = [[2, 2], [9, 1], [5, 6], [12, 6], [1, 10], [8, 10], [12, 13], [4, 13]];
  const start = Math.floor(rng() * centres.length);
  const n = 6 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const shape = shapes[Math.floor(rng() * shapes.length)];
    const [cx, cy] = centres[(start + i) % centres.length];
    const ox = cx + Math.floor(rng() * 2), oy = cy + Math.floor(rng() * 2);
    const on = (x, y) => shape[y]?.[x] === '#';
    shape.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!on(x, y)) continue;
        const topLeft = !on(x - 1, y) && !on(x, y - 1);
        const bottomRight = !on(x + 1, y) && !on(x, y + 1);
        t.set(ox + x, oy + y, topLeft ? light : bottomRight ? dark : add(color, (rng() - 0.5) * 12));
        if (!on(x + 1, y + 1) && !on(x, y + 1)) {
          const px = ox + x + 1, py = oy + y + 1;
          if (px < 16 && py < 16) t.set(px, py, scale(t.get(px, py), 0.75));
        }
      }
    });
  }
}

function cactusSide(t, rng) {
  noisy(t, rng, [86, 138, 46], 8, 6);
  for (let y = 0; y < 16; y++) {
    t.set(0, y, [50, 92, 30]); t.set(15, y, [50, 92, 30]);
    for (const x of [4, 8, 12]) t.set(x, y, add([110, 164, 62], (rng() - 0.5) * 8));
  }
  for (let i = 0; i < 9; i++) {
    const x = [4, 8, 12][Math.floor(rng() * 3)] + (rng() < 0.5 ? -1 : 1);
    t.set(x, Math.floor(rng() * 16), [228, 226, 190]);
  }
}

function cactusTop(t, rng) {
  t.fill((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c = d >= 7 ? [50, 92, 30] : d >= 5 ? [92, 146, 50] : [112, 168, 64];
    t.set(x, y, add(c, (rng() - 0.5) * 10));
  });
}

function tallGrass(t, rng) {
  t.fill((x, y) => t.set(x, y, [90, 150, 55], 0));
  for (let b = 0; b < 10; b++) {
    const x0 = 1 + Math.floor(rng() * 14);
    const h = 5 + Math.floor(rng() * 10);
    const lean = (rng() - 0.5) * 3;
    const c = GRASS_GRAYS[Math.floor(rng() * GRASS_GRAYS.length)];
    for (let k = 0; k < h; k++) {
      const x = Math.round(x0 + (lean * k) / h);
      t.set(x, 15 - k, scale(c, 0.8 + (k / h) * 0.3), TINT_GRASS);
    }
  }
}

function stem(t, top, color = [62, 122, 40]) {
  for (let y = 15; y >= top; y--) t.set(7, y, color);
}

function dandelion(t, rng) {
  t.fill((x, y) => t.set(x, y, [60, 120, 40], 0));
  stem(t, 9);
  t.set(6, 13, [70, 135, 45]); t.set(5, 12, [70, 135, 45]); t.set(8, 12, [70, 135, 45]); t.set(9, 11, [70, 135, 45]);
  for (let y = 6; y <= 8; y++) for (let x = 6; x <= 8; x++) t.set(x, y, [246, 222, 48]);
  t.set(7, 5, [240, 200, 40]); t.set(5, 7, [240, 200, 40]); t.set(9, 7, [240, 200, 40]);
  t.set(7, 7, [255, 245, 140]);
}

function poppy(t, rng) {
  t.fill((x, y) => t.set(x, y, [60, 120, 40], 0));
  stem(t, 9);
  t.set(6, 12, [70, 135, 45]); t.set(8, 13, [70, 135, 45]); t.set(9, 12, [70, 135, 45]);
  for (let y = 5; y <= 8; y++) for (let x = 6; x <= 9; x++) t.set(x, y, add([200, 32, 30], (rng() - 0.5) * 30));
  t.set(5, 6, [180, 25, 25]); t.set(10, 7, [180, 25, 25]); t.set(7, 4, [210, 40, 35]);
  t.set(7, 6, [40, 26, 18]); t.set(8, 7, [40, 26, 18]);
}

function deadBush(t, rng) {
  t.fill((x, y) => t.set(x, y, [120, 84, 44], 0));
  const c = [122, 86, 46];
  stem(t, 10, c);
  const branch = (x, y, dx, len) => {
    for (let k = 0; k < len; k++) { x += dx; y -= 1; t.set(x, y, k % 2 ? scale(c, 0.85) : c); }
  };
  branch(7, 13, -1, 5); branch(7, 12, 1, 5); branch(7, 10, -1, 3); branch(7, 10, 1, 4);
  branch(4, 9, 1, 2); branch(11, 8, -1, 2);
}

function torchTex(t) {
  t.fill((x, y) => t.set(x, y, [120, 86, 44], 0));
  for (let y = 8; y < 16; y++) {
    t.set(7, y, y % 2 ? [128, 92, 46] : [112, 80, 40]);
    t.set(8, y, y % 2 ? [102, 72, 36] : [118, 84, 42]);
  }
  t.set(7, 6, [255, 250, 190]); t.set(8, 6, [255, 214, 90]);
  t.set(7, 7, [255, 190, 60]); t.set(8, 7, [240, 150, 40]);
}

function craftingTop(t, rng) {
  planks(t, rng, [150, 116, 66]);
  t.fill((x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) t.set(x, y, [92, 64, 34]);
    else if (x === 5 || x === 10 || y === 5 || y === 10) t.set(x, y, [120, 88, 48]);
  });
}

function craftingSide(t, rng, front) {
  planks(t, rng, [150, 116, 66]);
  for (let x = 0; x < 16; x++) { t.set(x, 0, [92, 64, 34]); t.set(x, 1, [110, 80, 44]); }
  if (front) {
    // saw
    for (let y = 4; y < 11; y++) for (let x = 2; x < 6; x++) t.set(x, y, [168, 168, 170]);
    for (let y = 4; y < 11; y += 2) t.set(1, y, [120, 120, 124]);
    for (let y = 11; y < 14; y++) t.set(4, y, [110, 76, 40]);
    // hammer
    for (let y = 5; y < 14; y++) t.set(11, y, [110, 76, 40]);
    for (let x = 9; x < 14; x++) { t.set(x, 4, [150, 150, 154]); t.set(x, 5, [120, 120, 124]); }
  } else {
    // hanging shears and pliers
    for (let y = 4; y < 12; y++) { t.set(4, y, [150, 150, 154]); t.set(6, y, [150, 150, 154]); }
    t.set(5, 11, [120, 120, 124]);
    for (let y = 4; y < 13; y++) t.set(11, y, [110, 76, 40]);
    for (let x = 9; x < 14; x++) t.set(x, 12, [150, 150, 154]);
  }
}

function bricks(t, rng) {
  const tones = Array.from({ length: 16 }, () => (rng() - 0.5) * 30);
  t.fill((x, y) => {
    const row = Math.floor(y / 4);
    const xo = (x + (row % 2) * 4) % 16;
    if (y % 4 === 3 || xo % 8 === 7) t.set(x, y, add([176, 166, 156], (rng() - 0.5) * 10));
    else t.set(x, y, add([150, 68, 52], tones[row * 2 + Math.floor(xo / 8)] + (rng() - 0.5) * 14));
  });
}

function bookshelf(t, rng) {
  planks(t, rng);
  const colors = [[140, 40, 40], [40, 70, 140], [50, 110, 50], [150, 120, 50], [100, 50, 110], [160, 158, 150], [120, 60, 30]];
  for (const [y0, y1] of [[2, 6], [9, 13]]) {
    let x = 1;
    while (x < 15) {
      const w = rng() < 0.7 ? 1 : 2;
      const c = colors[Math.floor(rng() * colors.length)];
      const top = y0 + (rng() < 0.3 ? 1 : 0);
      for (let k = 0; k < w && x < 15; k++, x++) {
        for (let y = y0; y <= y1; y++) t.set(x, y, y < top ? [40, 28, 16] : add(c, (rng() - 0.5) * 12));
      }
    }
  }
  for (let x = 0; x < 16; x++) for (const y of [0, 1, 7, 8, 14, 15]) t.set(x, y, add([110, 84, 48], (rng() - 0.5) * 10));
}

function glowstone(t, rng) {
  // Glowing crystal chunks separated by darker amber cracks.
  const pts = Array.from({ length: 14 }, () => [rng() * 16, rng() * 16, rng()]);
  const wrap = (d) => Math.min(Math.abs(d), 16 - Math.abs(d));
  const tones = [[255, 244, 190], [252, 222, 130], [240, 188, 96], [218, 156, 70]];
  t.fill((x, y) => {
    let d1 = 1e9, d2 = 1e9, cell = 0;
    for (const p of pts) {
      const d = Math.hypot(wrap(x + 0.5 - p[0]), wrap(y + 0.5 - p[1]));
      if (d < d1) { d2 = d1; d1 = d; cell = p[2]; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 0.8) t.set(x, y, add([150, 100, 44], (rng() - 0.5) * 20));
    else {
      const c = tones[Math.min(3, Math.floor(cell * 3 + d1 * 0.35))];
      t.set(x, y, add(c, (rng() - 0.5) * 14));
    }
  });
}

function stoneBricks(t, rng) {
  noisy(t, rng, [122, 122, 122], 7, 6);
  t.fill((x, y) => {
    const row = y < 8 ? 0 : 1;
    const ly = y % 8;
    const lx = row === 0 ? x : (x + 8) % 16;
    if (ly === 7 || lx === 15) t.set(x, y, [74, 74, 74]);
    else if (ly === 0 || lx === 0) t.set(x, y, add(t.get(x, y), 16));
    else if (ly === 6 || lx === 14) t.set(x, y, add(t.get(x, y), -14));
  });
}

function wool(t, rng, base) {
  t.fill((x, y) => {
    let c = add(base, (rng() - 0.5) * 12);
    if ((x + y) % 4 === 0 || (x - y + 16) % 4 === 0) c = scale(c, 0.93);
    t.set(x, y, c);
  });
}

function metalBlock(t, rng, base) {
  noisy(t, rng, base, 5, 4);
  t.fill((x, y) => {
    if (x === 0 || y === 0) t.set(x, y, scale(base, 1.18));
    else if (x === 15 || y === 15) t.set(x, y, scale(base, 0.66));
    else if (x === 1 || y === 1) t.set(x, y, scale(base, 1.08));
    else if ((y === 5 || y === 10) && x > 1 && x < 14) t.set(x, y, scale(base, 0.86));
  });
}

function obsidian(t, rng) {
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const v = vn(x, y) + (rng() - 0.5) * 0.25;
    t.set(x, y, v > 0.72 ? [70, 46, 102] : v > 0.5 ? [38, 24, 58] : [18, 12, 28]);
  });
}

// Crack overlay stages shown while mining.
function destroyStages(rng) {
  const pixels = [];
  const seen = new Set();
  const walk = (x, y, dx, dy, len) => {
    for (let k = 0; k < len; k++) {
      x += dx + (rng() < 0.35 ? (rng() < 0.5 ? -1 : 1) : 0);
      y += dy + (rng() < 0.35 ? (rng() < 0.5 ? -1 : 1) : 0);
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      const key = y * 16 + x;
      if (!seen.has(key)) { seen.add(key); pixels.push([x, y]); }
    }
  };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (let round = 0; round < 3; round++) {
    for (const [dx, dy] of dirs) walk(7 + Math.floor(rng() * 3) - 1, 7 + Math.floor(rng() * 3) - 1, dx, dy, 3 + round * 3);
  }
  const stages = [];
  for (let s = 0; s < 10; s++) {
    const t = new Tile();
    t.fill((x, y) => t.set(x, y, [0, 0, 0], 0));
    const n = Math.ceil(((s + 1) / 10) * pixels.length);
    for (let i = 0; i < n; i++) t.set(pixels[i][0], pixels[i][1], [20, 20, 20], 200);
    stages.push(t);
  }
  return stages;
}

// --- Item sprites ------------------------------------------------------------

function outline(t, color) {
  const src = new Tile().copy(t);
  t.fill((x, y) => {
    if (src.alpha(x, y)) return;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && src.alpha(nx, ny) > 0;
    });
    if (n) t.set(x, y, color);
  });
}

function clearTile(t) {
  t.fill((x, y) => t.set(x, y, [128, 128, 128], 0));
}

// Handle runs diagonally from the bottom-left towards the top-right.
const HANDLE_ORIGIN = [2.5, 13.5];
const DIR = [Math.SQRT1_2, -Math.SQRT1_2];
const PERP = [Math.SQRT1_2, Math.SQRT1_2];
function toolCoords(x, y) {
  const px = x + 0.5 - HANDLE_ORIGIN[0], py = y + 0.5 - HANDLE_ORIGIN[1];
  return [px * DIR[0] + py * DIR[1], px * PERP[0] + py * PERP[1]];
}

const STICK_COLOR = [128, 92, 48];
const TIER_COLORS = {
  wooden: [150, 116, 66],
  stone: [130, 130, 130],
  iron: [222, 222, 222],
  diamond: [80, 225, 215],
};

function drawStick(t, length) {
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    if (u >= -0.2 && u <= length && Math.abs(v) <= 0.75) t.set(x, y, u > length * 0.5 ? STICK_COLOR : scale(STICK_COLOR, 0.82));
  });
}

function toolSprite(t, type, tierKey) {
  clearTile(t);
  const head = TIER_COLORS[tierKey];
  const L = 10.5;
  drawStick(t, type === 'pickaxe' ? L : L - 1);
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    let inHead = false;
    if (type === 'pickaxe') {
      const center = L + 0.6 - 0.09 * v * v;
      inHead = Math.abs(v) <= 6 && Math.abs(u - center) <= 0.95;
    } else if (type === 'axe') {
      inHead = v <= 0.9 && v >= -4.6 && Math.abs(u - (L - 1.5)) <= 1.3 + (-v) * 0.28;
    } else if (type === 'shovel') {
      const tip = L + 3.2;
      inHead = u >= L - 1.8 && u <= tip && Math.abs(v) <= 2.0 - Math.max(0, u - (tip - 1.6)) * 0.9;
    }
    if (inHead) t.set(x, y, scale(head, v < 0 ? 1.08 : 0.9));
  });
  outline(t, [36, 28, 20]);
}

function stickSprite(t) {
  clearTile(t);
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    if (u >= 0.5 && u <= 12.5 && Math.abs(v) <= 0.75) t.set(x, y, u > 6 ? STICK_COLOR : scale(STICK_COLOR, 0.82));
  });
  outline(t, [40, 28, 16]);
}

function lumpSprite(t, rng, color, highlight) {
  clearTile(t);
  t.fill((x, y) => {
    const d = Math.hypot((x - 7.5) / 5.2, (y - 8) / 4.6) + (rng() - 0.5) * 0.25;
    if (d < 1) t.set(x, y, rng() < 0.2 ? highlight : add(color, (rng() - 0.5) * 16));
  });
  outline(t, scale(color, 0.4));
}

function ingotSprite(t, color) {
  clearTile(t);
  t.fill((x, y) => {
    // an isometric bar: a parallelogram
    const top = y >= 5 && y <= 7 && x >= 5 - (y - 5) + 2 && x <= 13 - (y - 5);
    const body = y >= 7 && y <= 11 && x >= 2 + (11 - y) - 2 && x <= 12 - (y - 7) + 1;
    if (top) t.set(x, y, scale(color, 1.15));
    else if (body) t.set(x, y, y === 11 ? scale(color, 0.75) : color);
  });
  outline(t, scale(color, 0.45));
}

function diamondSprite(t) {
  clearTile(t);
  t.fill((x, y) => {
    const dx = Math.abs(x - 7.5);
    if (y >= 3 && y <= 6 && dx <= 5.5 - (6 - y) * 0.6) t.set(x, y, y === 3 ? [200, 255, 250] : [120, 240, 230]);
    else if (y > 6 && y <= 13 && dx <= 5.5 - (y - 6) * 0.8) t.set(x, y, dx < 1.5 ? [90, 225, 215] : [50, 185, 180]);
  });
  outline(t, [18, 80, 78]);
}

// --- Registry ------------------------------------------------------------------

const GENERATORS = {
  stone, dirt, snow, cobblestone, sand, gravel, bedrock, glass, water, lava, glowstone, bricks, bookshelf, obsidian,
  grass_top: grassTop,
  grass_side: (t, r) => grassSide(t, r, 'grass'),
  snowy_grass_side: (t, r) => grassSide(t, r, 'snow'),
  planks: (t, r) => planks(t, r),
  log_side: (t, r) => bark(t, r, [104, 82, 50], 22),
  log_top: (t, r) => logTop(t, r, [170, 137, 84], [148, 116, 68], [96, 76, 46]),
  birch_log_side: birchBark,
  birch_log_top: (t, r) => logTop(t, r, [200, 182, 128], [182, 162, 110], [214, 212, 204]),
  spruce_log_side: (t, r) => bark(t, r, [62, 44, 26], 16),
  spruce_log_top: (t, r) => logTop(t, r, [118, 88, 52], [100, 74, 42], [62, 44, 26]),
  leaves: (t, r) => leaves(t, r, [168, 168, 168], 0.2, TINT_FOLIAGE),
  birch_leaves: (t, r) => leaves(t, r, [100, 146, 58]),
  spruce_leaves: (t, r) => leaves(t, r, [46, 90, 54], 0.14),
  sandstone_side: sandstoneSide,
  sandstone_top: (t, r) => noisy(t, r, [222, 210, 160], 5, 4),
  sandstone_bottom: (t, r) => { noisy(t, r, [210, 196, 146], 6, 5); },
  coal_ore: (t, r) => ore(t, r, [44, 44, 44], [24, 24, 24]),
  iron_ore: (t, r) => ore(t, r, [216, 174, 142], [170, 128, 98]),
  gold_ore: (t, r) => ore(t, r, [250, 226, 76], [206, 156, 32]),
  diamond_ore: (t, r) => ore(t, r, [104, 232, 226], [34, 164, 160]),
  cactus_side: cactusSide,
  cactus_top: cactusTop,
  cactus_bottom: cactusTop,
  tall_grass: tallGrass,
  dandelion, poppy,
  dead_bush: deadBush,
  torch: torchTex,
  crafting_table_top: craftingTop,
  crafting_table_side: (t, r) => craftingSide(t, r, false),
  crafting_table_front: (t, r) => craftingSide(t, r, true),
  stone_bricks: stoneBricks,
  white_wool: (t, r) => wool(t, r, [232, 234, 234]),
  red_wool: (t, r) => wool(t, r, [162, 40, 36]),
  yellow_wool: (t, r) => wool(t, r, [246, 196, 40]),
  green_wool: (t, r) => wool(t, r, [86, 112, 30]),
  blue_wool: (t, r) => wool(t, r, [54, 60, 160]),
  black_wool: (t, r) => wool(t, r, [28, 24, 26]),
  coal_block: (t, r) => metalBlock(t, r, [34, 34, 36]),
  iron_block: (t, r) => metalBlock(t, r, [220, 220, 222]),
  gold_block: (t, r) => metalBlock(t, r, [250, 212, 62]),
  diamond_block: (t, r) => metalBlock(t, r, [98, 222, 214]),
  // first-person arm
  skin: (t, r) => noisy(t, r, [206, 150, 116], 5, 5),
  // item sprites
  item_stick: stickSprite,
  item_coal: (t, r) => lumpSprite(t, r, [42, 42, 44], [80, 80, 84]),
  item_iron_ingot: (t) => ingotSprite(t, [214, 214, 214]),
  item_gold_ingot: (t) => ingotSprite(t, [250, 212, 60]),
  item_diamond: diamondSprite,
};
for (const tier of Object.keys(TIER_COLORS)) {
  for (const type of ['pickaxe', 'axe', 'shovel']) {
    GENERATORS[`item_${tier}_${type}`] = (t) => toolSprite(t, type, tier);
  }
}

// --- Additional blocks ------------------------------------------------------

const IRON_DARK = [52, 54, 62];
const IRON = [84, 86, 96];

function transparent(t) {
  t.fill((x, y) => t.set(x, y, [0, 0, 0], 0));
}

function lanternSide(t, rng) {
  transparent(t);
  // chain links (hanging lantern), rows 0-5
  for (let y = 0; y < 6; y++) {
    t.set(7, y, y % 3 === 1 ? [40, 40, 46] : IRON);
    t.set(8, y, y % 3 === 1 ? IRON : [40, 40, 46]);
  }
  // cap rows 7-8
  for (let x = 6; x <= 9; x++) { t.set(x, 7, IRON); t.set(x, 8, IRON_DARK); }
  // glowing body rows 9-15
  for (let y = 9; y <= 15; y++) {
    for (let x = 5; x <= 10; x++) {
      const edge = x === 5 || x === 10 || y === 9 || y === 15;
      if (edge) t.set(x, y, (x + y) % 2 ? IRON_DARK : IRON);
      else {
        const d = Math.hypot(x - 7.5, y - 12);
        t.set(x, y, mix([255, 236, 150], [236, 140, 50], Math.min(1, d / 3.2 + rng() * 0.1)));
      }
    }
  }
}

function lanternTop(t, rng) {
  t.fill((x, y) => t.set(x, y, add(IRON_DARK, (rng() - 0.5) * 10)));
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) t.set(x, y, IRON);
  t.set(7, 7, [30, 30, 34]); t.set(8, 8, [30, 30, 34]);
}

function lanternItem(t, rng) {
  transparent(t);
  for (let x = 6; x <= 9; x++) t.set(x, 1, IRON);
  t.set(5, 2, IRON); t.set(10, 2, IRON); t.set(5, 3, IRON_DARK); t.set(10, 3, IRON_DARK);
  for (let x = 5; x <= 10; x++) { t.set(x, 4, IRON); t.set(x, 5, IRON_DARK); }
  for (let y = 6; y <= 13; y++) {
    for (let x = 4; x <= 11; x++) {
      const edge = x === 4 || x === 11 || y === 6 || y === 13;
      if (edge) t.set(x, y, (x + y) % 2 ? IRON_DARK : IRON);
      else t.set(x, y, mix([255, 240, 160], [236, 140, 50], Math.min(1, Math.hypot(x - 7.5, y - 9.5) / 3.5 + rng() * 0.1)));
    }
  }
  for (let x = 5; x <= 10; x++) t.set(x, 14, IRON_DARK);
}

function fenceItem(t, rng) {
  transparent(t);
  const wood = [160, 128, 76];
  for (let y = 1; y < 16; y++) {
    for (const x of [2, 3, 12, 13]) t.set(x, y, add(wood, (rng() - 0.5) * 16 - (x % 2 ? 12 : 0)));
  }
  for (let x = 4; x < 12; x++) {
    for (const y of [4, 5, 10, 11]) t.set(x, y, add(wood, (rng() - 0.5) * 14 - (y % 2 ? 14 : 0)));
  }
}

function mossyCobblestone(t, rng) {
  cobblestone(t, rng);
  const vn = valueNoise(rng, 8);
  t.fill((x, y) => {
    const c = t.get(x, y);
    if (c[0] > 70 && vn(x, y) + rng() * 0.3 > 0.78) t.set(x, y, add([86, 118, 52], (rng() - 0.5) * 24));
  });
}

function flower(t, rng, petal, center) {
  t.fill((x, y) => t.set(x, y, [60, 120, 40], 0));
  stem(t, 8);
  t.set(6, 12, [70, 135, 45]); t.set(8, 13, [70, 135, 45]); t.set(9, 11, [70, 135, 45]);
  const pts = [[7, 4], [6, 5], [8, 5], [5, 6], [9, 6], [6, 7], [8, 7], [7, 8], [7, 5], [7, 7], [6, 6], [8, 6]];
  for (const [x, y] of pts) t.set(x, y, add(petal, (rng() - 0.5) * 24));
  t.set(7, 6, center);
}

function smoothStone(t, rng, base = [150, 150, 150]) {
  noisy(t, rng, base, 5, 5);
  t.fill((x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) t.set(x, y, scale(base, 0.72));
  });
}

function furnaceFront(t, rng, lit) {
  smoothStone(t, rng, [128, 128, 128]);
  for (let x = 1; x < 15; x++) t.set(x, 4, [96, 96, 96]);
  for (let y = 8; y <= 13; y++) {
    for (let x = 4; x <= 11; x++) {
      const edge = y === 8 || x === 4 || x === 11;
      if (edge) t.set(x, y, [70, 70, 70]);
      else if (lit) {
        const f = (13 - y) / 5 + rng() * 0.35;
        t.set(x, y, f > 0.9 ? [255, 236, 120] : f > 0.5 ? [255, 160, 40] : [210, 70, 16]);
      } else t.set(x, y, (x + y) % 2 ? [24, 24, 24] : [34, 34, 34]);
    }
  }
  for (let x = 5; x <= 10; x++) t.set(x, 13, lit ? [120, 60, 20] : [46, 46, 46]);
}

const CHEST_WOOD = [150, 104, 50];
function chestTex(t, rng, face) {
  const vn = valueNoise(rng, 8);
  t.fill((x, y) => t.set(x, y, add(CHEST_WOOD, (vn(x, y * 3) - 0.5) * 22 + (rng() - 0.5) * 8)));
  const dark = [70, 46, 20];
  t.fill((x, y) => {
    if (x <= 1 || x >= 14 || y <= 2 || y >= 15) t.set(x, y, dark);
  });
  if (face !== 'top') {
    for (let x = 1; x < 15; x++) t.set(x, 7, dark);
    if (face === 'front') {
      for (let y = 6; y <= 9; y++) for (let x = 7; x <= 8; x++) t.set(x, y, y === 9 ? [120, 120, 130] : [190, 190, 200]);
    }
  }
}

function farmland(t, rng) {
  noisy(t, rng, [96, 64, 40], 8, 8);
  t.fill((x, y) => {
    if (y % 4 === 0) t.set(x, y, [64, 42, 26]);
    else if (y % 4 === 1) t.set(x, y, add(t.get(x, y), 10));
  });
}

function dirtPathTop(t, rng) {
  noisy(t, rng, [150, 122, 68], 8, 10);
  t.fill((x, y) => { if (rng() < 0.08) t.set(x, y, [120, 96, 54]); });
}

function dirtPathSide(t, rng) {
  dirt(t, rng);
  for (let x = 0; x < 16; x++) {
    t.set(x, 1, add([150, 122, 68], (rng() - 0.5) * 12));
    if (rng() < 0.6) t.set(x, 2, add([140, 112, 62], (rng() - 0.5) * 12));
  }
}

function wheat(t, rng, stage) {
  transparent(t);
  const heights = [4, 8, 12, 14];
  const h = heights[stage];
  const green = [[82, 150, 40], [100, 168, 52], [132, 160, 46], [196, 170, 70]][stage];
  for (let s = 0; s < 6; s++) {
    const x0 = 1 + Math.floor(rng() * 14);
    const hh = h - Math.floor(rng() * 3);
    for (let k = 0; k < hh; k++) {
      const x = Math.max(0, Math.min(15, x0 + Math.round(Math.sin(k * 0.6 + s) * 0.6)));
      const y = 15 - k;
      if (stage === 3 && k > hh - 5) t.set(x, y, add([214, 176, 76], (rng() - 0.5) * 30));
      else t.set(x, y, add(green, (rng() - 0.5) * 20));
    }
  }
}

function tntSide(t, rng) {
  t.fill((x, y) => {
    let c = add([196, 44, 32], (rng() - 0.5) * 16);
    if (x % 4 === 0) c = scale(c, 0.8);
    t.set(x, y, c);
  });
  for (let y = 6; y <= 10; y++) for (let x = 0; x < 16; x++) t.set(x, y, add([232, 232, 228], (rng() - 0.5) * 8));
  const T = [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]];
  const N = [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0], [2, 1], [2, 2]];
  const put = (glyph, ox) => glyph.forEach(([gx, gy]) => t.set(ox + gx, 7 + gy, [30, 30, 30]));
  put(T, 2); put(N, 6); put(T, 11);
}

function tntTop(t, rng, bottom) {
  noisy(t, rng, [196, 44, 32], 8, 4);
  if (!bottom) {
    for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) t.set(x, y, [90, 80, 70]);
    t.set(7, 7, [40, 36, 30]); t.set(8, 8, [40, 36, 30]);
  }
}

function stoneSlabSide(t, rng) {
  smoothStone(t, rng, [150, 150, 150]);
  for (let x = 0; x < 16; x++) { t.set(x, 7, [104, 104, 104]); t.set(x, 8, [168, 168, 168]); }
}

// --- More item sprites ------------------------------------------------------

function blob(t, rng, cx, cy, rx, ry, color, rough = 0.15, jitter = 14) {
  t.fill((x, y) => {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) + (rng() - 0.5) * rough;
    if (d < 1) t.set(x, y, add(color, (rng() - 0.5) * jitter));
  });
}

function swordSprite(t, tierKey) {
  clearTile(t);
  const blade = TIER_COLORS[tierKey];
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    if (u >= -0.2 && u <= 3.2 && Math.abs(v) <= 0.75) t.set(x, y, scale(STICK_COLOR, 0.85));
    else if (u > 3.2 && u <= 4.4 && Math.abs(v) <= 2.4) t.set(x, y, [60, 50, 40]);
    else if (u > 4.4 && u <= 13 && Math.abs(v) <= 1.1 - Math.max(0, u - 11.6) * 0.75) t.set(x, y, scale(blade, v < 0 ? 1.12 : 0.88));
  });
  outline(t, [36, 28, 20]);
}

function hoeSprite(t, tierKey) {
  clearTile(t);
  const head = TIER_COLORS[tierKey];
  const L = 10.5;
  drawStick(t, L);
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    if (v <= 0.9 && v >= -3.8 && Math.abs(u - L) <= 0.9) t.set(x, y, scale(head, v < -1 ? 1.08 : 0.92));
  });
  outline(t, [36, 28, 20]);
}

function appleSprite(t, rng) {
  clearTile(t);
  blob(t, rng, 8, 9.5, 5, 4.8, [200, 30, 34], 0.05, 14);
  t.set(5, 7, [255, 140, 140]); t.set(6, 7, [255, 110, 110]); t.set(5, 8, [240, 90, 90]);
  t.set(8, 3, [100, 70, 30]); t.set(8, 4, [100, 70, 30]); t.set(9, 3, [70, 150, 40]); t.set(10, 2, [70, 150, 40]);
  outline(t, [60, 10, 10]);
}

function breadSprite(t, rng) {
  clearTile(t);
  blob(t, rng, 8, 9, 6.8, 3.8, [196, 136, 62], 0.08, 12);
  for (const [x, y] of [[5, 8], [6, 7], [8, 8], [9, 7], [11, 8], [12, 7]]) t.set(x, y, [150, 96, 40]);
  outline(t, [80, 50, 20]);
}

function meatSprite(t, rng, base, fat, cooked) {
  clearTile(t);
  blob(t, rng, 8, 8.5, 6, 4.6, base, 0.2, 16);
  t.fill((x, y) => {
    if (t.alpha(x, y) && rng() < (cooked ? 0.08 : 0.12)) t.set(x, y, fat);
  });
  for (let k = 0; k < 4; k++) t.set(12 + (k % 2), 11 + (k >> 1), [236, 228, 210]);
  outline(t, scale(base, 0.45));
}

function drumstickSprite(t, rng, base) {
  clearTile(t);
  blob(t, rng, 6.5, 7, 4.2, 4.6, base, 0.15, 14);
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    void u;
    if (x > 8 && y > 9 && Math.abs(v) < 0.8) t.set(x, y, [236, 228, 210]);
  });
  t.set(12, 13, [236, 228, 210]); t.set(13, 12, [236, 228, 210]); t.set(13, 13, [236, 228, 210]);
  outline(t, scale(base, 0.45));
}

function leatherSprite(t, rng) {
  clearTile(t);
  blob(t, rng, 8, 8, 6, 6, [140, 82, 40], 0.45, 18);
  outline(t, [60, 34, 16]);
}

function featherSprite(t) {
  clearTile(t);
  t.fill((x, y) => {
    const [u, v] = toolCoords(x, y);
    if (u >= 0 && u <= 12.5) {
      if (Math.abs(v) <= 0.6) t.set(x, y, [150, 150, 150]);
      else if (u > 3 && Math.abs(v) <= 2.2 - Math.abs(u - 8.5) * 0.25) t.set(x, y, v < 0 ? [250, 250, 250] : [222, 222, 226]);
    }
  });
  outline(t, [90, 90, 96]);
}

function gunpowderSprite(t, rng) {
  clearTile(t);
  t.fill((x, y) => {
    const h = 5 - Math.abs(x - 7.5) * 0.7;
    if (y >= 14 - h && y <= 13 && x >= 2 && x <= 13) t.set(x, y, rng() < 0.3 ? [40, 40, 40] : add([110, 110, 110], (rng() - 0.5) * 40));
  });
  outline(t, [30, 30, 30]);
}

function flintSprite(t, rng) {
  clearTile(t);
  t.fill((x, y) => {
    const a = (x - 3) + (y - 13) * -0.4, b = Math.abs(x - 8) + Math.abs(y - 8) * 0.8;
    if (b < 5.5 && a > -2 && y > 3) t.set(x, y, rng() < 0.2 ? [90, 90, 96] : [48, 48, 52]);
  });
  outline(t, [16, 16, 18]);
}

function flintAndSteelSprite(t, rng) {
  clearTile(t);
  t.fill((x, y) => {
    const d = Math.hypot(x - 6, y - 6);
    if (d > 2.5 && d < 4.4 && !(x > 6 && y > 6)) t.set(x, y, [180, 180, 188]);
  });
  blob(t, rng, 11, 11, 2.8, 2.6, [52, 52, 58], 0.3, 10);
  outline(t, [30, 30, 34]);
}

function wheatItem(t, rng) {
  clearTile(t);
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < 12; k++) {
      const x = 4 + s * 2 + Math.round(k * (1.5 - s) * 0.12);
      const y = 14 - k;
      t.set(x, y, k > 6 ? add([214, 176, 76], (rng() - 0.5) * 30) : [150, 130, 60]);
    }
  }
  outline(t, [96, 72, 24]);
}

function seedsSprite(t, rng) {
  clearTile(t);
  for (let i = 0; i < 9; i++) {
    const x = 3 + Math.floor(rng() * 10), y = 4 + Math.floor(rng() * 9);
    t.set(x, y, [90, 150, 50]); t.set(x + 1, y, [70, 120, 40]);
  }
}

function eggSprite(t, rng, base, spots) {
  clearTile(t);
  t.fill((x, y) => {
    const dy = y + 0.5 - 8.5;
    const rx = dy < 0 ? 4.2 - (-dy) * 0.12 : 4.6;
    if (Math.hypot((x + 0.5 - 8) / rx, dy / 6.2) < 1) t.set(x, y, add(base, (rng() - 0.5) * 10));
  });
  for (let i = 0; i < 7; i++) {
    const x = 5 + Math.floor(rng() * 7), y = 4 + Math.floor(rng() * 9);
    if (t.alpha(x, y)) { t.set(x, y, spots); if (t.alpha(x + 1, y)) t.set(x + 1, y, spots); }
  }
  outline(t, scale(base, 0.4));
}

// 16 round 4x4 puffs from light (top-left) to dark (bottom-right); particles
// sample one cell each.
function smokeTex(t, rng) {
  t.fill((x, y) => {
    const cx = x & 3, cy = y & 3;
    const corner = (cx === 0 || cx === 3) && (cy === 0 || cy === 3);
    const cell = (y >> 2) * 4 + (x >> 2);
    const inner = cx > 0 && cx < 3 && cy > 0 && cy < 3;
    const v = 238 - cell * 9 + (inner ? 10 : 0) + (rng() - 0.5) * 12;
    t.set(x, y, [v, v, v], corner ? 0 : 255);
  });
}

// Effect particles, one 4x4 cell each: heart, two portal sparks, green
// sparkle, angry cloud, crit star, slime and ink blobs.
const FX_CELLS = [
  [['X..X', 'XXXX', 'XXXX', '.XX.'], [220, 30, 40], [255, 120, 130]],
  [['.X..', 'XXX.', '.XXX', '..X.'], [200, 90, 255], [240, 190, 255]],
  [['....', '.XX.', '.XX.', '....'], [120, 40, 180], [170, 80, 230]],
  [['.X..', 'XXX.', '.X.X', '...X'], [80, 220, 80], [200, 255, 170]],
  [['.XX.', 'XXXX', 'XXXX', '.XX.'], [60, 60, 64], [110, 110, 116]],
  [['X..X', '.XX.', '.XX.', 'X..X'], [255, 255, 220], [255, 230, 120]],
  [['.XX.', 'XXXX', 'XXXX', '.XX.'], [100, 190, 80], [150, 230, 120]],
  [['.XX.', 'XXXX', 'XXXX', '.XX.'], [20, 20, 30], [60, 60, 80]],
];
function fxTex(t, rng) {
  t.fill((x, y) => {
    const cell = FX_CELLS[(y >> 2) * 4 + (x >> 2)];
    if (!cell || cell[0][y & 3][x & 3] !== 'X') { t.set(x, y, [0, 0, 0], 0); return; }
    const hi = (x & 3) + (y & 3) < 3;
    t.set(x, y, add(hi ? cell[2] : cell[1], (rng() - 0.5) * 12));
  });
}

Object.assign(GENERATORS, {
  smoke: smokeTex,
  fx: fxTex,
  lantern: lanternSide,
  lantern_top: lanternTop,
  lantern_item: lanternItem,
  fence_item: fenceItem,
  mossy_cobblestone: mossyCobblestone,
  cornflower: (t, r) => flower(t, r, [70, 100, 220], [40, 50, 120]),
  oxeye_daisy: (t, r) => flower(t, r, [240, 240, 236], [236, 196, 40]),
  furnace_front: (t, r) => furnaceFront(t, r, false),
  furnace_front_on: (t, r) => furnaceFront(t, r, true),
  furnace_side: (t, r) => smoothStone(t, r, [128, 128, 128]),
  furnace_top: (t, r) => smoothStone(t, r, [138, 138, 138]),
  chest_front: (t, r) => chestTex(t, r, 'front'),
  chest_side: (t, r) => chestTex(t, r, 'side'),
  chest_top: (t, r) => chestTex(t, r, 'top'),
  farmland,
  dirt_path_top: dirtPathTop,
  dirt_path_side: dirtPathSide,
  wheat_0: (t, r) => wheat(t, r, 0),
  wheat_1: (t, r) => wheat(t, r, 1),
  wheat_2: (t, r) => wheat(t, r, 2),
  wheat_3: (t, r) => wheat(t, r, 3),
  tnt_side: tntSide,
  tnt_top: (t, r) => tntTop(t, r, false),
  tnt_bottom: (t, r) => tntTop(t, r, true),
  stone_slab_top: (t, r) => smoothStone(t, r),
  stone_slab_side: stoneSlabSide,
  item_wheat_seeds: seedsSprite,
  item_wheat: wheatItem,
  item_bread: breadSprite,
  item_apple: appleSprite,
  item_raw_porkchop: (t, r) => meatSprite(t, r, [236, 146, 146], [250, 222, 222], false),
  item_cooked_porkchop: (t, r) => meatSprite(t, r, [178, 110, 60], [220, 170, 110], true),
  item_raw_beef: (t, r) => meatSprite(t, r, [196, 52, 50], [240, 210, 210], false),
  item_steak: (t, r) => meatSprite(t, r, [120, 70, 40], [80, 44, 22], true),
  item_raw_chicken: (t, r) => drumstickSprite(t, r, [240, 200, 180]),
  item_cooked_chicken: (t, r) => drumstickSprite(t, r, [200, 130, 60]),
  item_raw_mutton: (t, r) => meatSprite(t, r, [206, 70, 70], [250, 230, 230], false),
  item_cooked_mutton: (t, r) => meatSprite(t, r, [150, 84, 50], [200, 150, 110], true),
  item_rotten_flesh: (t, r) => meatSprite(t, r, [120, 110, 60], [80, 120, 50], false),
  item_leather: leatherSprite,
  item_feather: featherSprite,
  item_gunpowder: gunpowderSprite,
  item_flint: flintSprite,
  item_flint_and_steel: flintAndSteelSprite,
  item_pig_spawn_egg: (t, r) => eggSprite(t, r, [236, 160, 160], [200, 100, 110]),
  item_cow_spawn_egg: (t, r) => eggSprite(t, r, [80, 60, 44], [160, 160, 160]),
  item_sheep_spawn_egg: (t, r) => eggSprite(t, r, [232, 232, 232], [236, 170, 170]),
  item_chicken_spawn_egg: (t, r) => eggSprite(t, r, [220, 220, 220], [200, 30, 30]),
  item_zombie_spawn_egg: (t, r) => eggSprite(t, r, [40, 140, 140], [80, 120, 60]),
  item_creeper_spawn_egg: (t, r) => eggSprite(t, r, [80, 176, 70], [20, 20, 20]),
  item_villager_spawn_egg: (t, r) => eggSprite(t, r, [100, 70, 50], [190, 150, 110]),
  item_skeleton_spawn_egg: (t, r) => eggSprite(t, r, [196, 196, 196], [80, 80, 80]),
  item_spider_spawn_egg: (t, r) => eggSprite(t, r, [54, 46, 40], [170, 20, 20]),
  item_enderman_spawn_egg: (t, r) => eggSprite(t, r, [22, 22, 22], [10, 10, 10]),
  item_slime_spawn_egg: (t, r) => eggSprite(t, r, [100, 190, 80], [60, 130, 50]),
  item_wolf_spawn_egg: (t, r) => eggSprite(t, r, [214, 210, 206], [190, 160, 140]),
  item_iron_golem_spawn_egg: (t, r) => eggSprite(t, r, [206, 200, 190], [110, 140, 90]),
  item_squid_spawn_egg: (t, r) => eggSprite(t, r, [34, 60, 90], [100, 120, 150]),
  item_bat_spawn_egg: (t, r) => eggSprite(t, r, [70, 56, 40], [20, 20, 20]),
  item_rabbit_spawn_egg: (t, r) => eggSprite(t, r, [160, 120, 90], [100, 70, 50]),
  item_guardian_spawn_egg: (t, r) => eggSprite(t, r, [90, 150, 136], [236, 124, 50]),
  item_cod_spawn_egg: (t, r) => eggSprite(t, r, [190, 160, 110], [150, 120, 80]),
  item_raw_rabbit: (t, r) => meatSprite(t, r, [230, 170, 160], [250, 220, 214], false),
  item_cooked_rabbit: (t, r) => meatSprite(t, r, [190, 120, 70], [220, 170, 110], true),
});
for (const tier of Object.keys(TIER_COLORS)) {
  GENERATORS[`item_${tier}_sword`] = (t) => swordSprite(t, tier);
  GENERATORS[`item_${tier}_hoe`] = (t) => hoeSprite(t, tier);
}

// --- Blocks added with the big content update ------------------------------------

function speckled(t, rng, base, spots, amount = 0.3) {
  noisy(t, rng, base, 6, 6);
  t.fill((x, y) => {
    const r = rng();
    if (r < amount / 2) t.set(x, y, add(spots[0], (rng() - 0.5) * 14));
    else if (r < amount) t.set(x, y, add(spots[1], (rng() - 0.5) * 14));
  });
}

function polished(t, rng, base, gen) {
  gen(t, rng);
  const src = new Tile().copy(t);
  t.fill((x, y) => {
    const c = src.get(x, y);
    // Smoothed surface with a bevelled border.
    let v = mix(c, base, 0.55);
    if (x === 0 || y === 0) v = add(v, 22);
    else if (x === 15 || y === 15) v = add(v, -26);
    t.set(x, y, v);
  });
}

function deepslate(t, rng) {
  noisy(t, rng, [78, 78, 84], 6, 8);
  for (let y = 0; y < 16; y++) {
    if (rng() < 0.45) {
      const x0 = Math.floor(rng() * 16), len = 3 + Math.floor(rng() * 8);
      for (let k = 0; k < len; k++) t.set((x0 + k) % 16, y, add([60, 60, 66], (rng() - 0.5) * 8));
    }
  }
}

function deepslateTop(t, rng) {
  noisy(t, rng, [86, 86, 92], 7, 10);
}

function cobbledDeepslate(t, rng) {
  cobblestone(t, rng);
  t.fill((x, y) => t.set(x, y, scale(t.get(x, y), 0.62)));
}

function clay(t, rng) {
  noisy(t, rng, [160, 166, 178], 5, 8, 8);
}

function ice(t, rng, base = [146, 186, 248], streaks = 5) {
  noisy(t, rng, base, 4, 6);
  for (let i = 0; i < streaks; i++) {
    let x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    for (let k = 0; k < 4 + Math.floor(rng() * 5); k++) {
      t.set((x + 16) % 16, (y + 16) % 16, [226, 240, 255]);
      x += 1; y -= rng() < 0.5 ? 1 : 0;
    }
  }
}

function terracotta(t, rng, base) {
  noisy(t, rng, base, 4, 7, 8);
}

function chiseledSandstone(t, rng) {
  noisy(t, rng, [220, 206, 156], 4, 4);
  for (let x = 0; x < 16; x++) { t.set(x, 0, [236, 226, 180]); t.set(x, 1, [196, 180, 128]); t.set(x, 14, [236, 226, 180]); t.set(x, 15, [196, 180, 128]); }
  // A carved sun-and-arrow glyph in the middle band.
  const glyph = ['...##...', '..#..#..', '.#.##.#.', '#.#..#.#', '.#.##.#.', '..#..#..', '...##...', '...##...', '..####..', '.#.##.#.'];
  glyph.forEach((row, y) => {
    for (let x = 0; x < 8; x++) if (row[x] === '#') t.set(4 + x, 3 + y, [170, 150, 100]);
  });
}

function cutSandstone(t, rng) {
  noisy(t, rng, [220, 206, 156], 4, 4);
  t.fill((x, y) => {
    if (y === 0 || y === 8) t.set(x, y, [236, 226, 180]);
    if (y === 7 || y === 15) t.set(x, y, [194, 178, 126]);
  });
}

function sugarCane(t, rng) {
  transparent(t);
  for (const x0 of [3, 8, 12]) {
    for (let y = 0; y < 16; y++) {
      const joint = (y + x0) % 5 === 0;
      t.set(x0, y, joint ? [150, 196, 110] : [112, 170, 72]);
      t.set(x0 + 1, y, joint ? [120, 170, 84] : [86, 140, 54]);
    }
    t.set(x0 - 1, (x0 * 3) % 16, [104, 160, 64]);
  }
}

function sugarCaneItem(t, rng) {
  transparent(t);
  for (const [x0, top] of [[4, 2], [8, 1], [11, 4]]) {
    for (let y = top; y < 15; y++) {
      const joint = (y - top) % 4 === 3;
      t.set(x0, y, joint ? [166, 210, 122] : [112, 170, 72]);
      t.set(x0 + 1, y, joint ? [128, 180, 90] : [80, 132, 50]);
    }
  }
}

function pumpkinSide(t, rng) {
  t.fill((x, y) => {
    const rib = x % 4 === 0 ? -34 : x % 4 === 1 ? 10 : 0;
    t.set(x, y, add([222, 136, 22], rib + (rng() - 0.5) * 12));
  });
  for (let x = 0; x < 16; x++) { t.set(x, 0, add(t.get(x, 0), -20)); t.set(x, 15, add(t.get(x, 15), -30)); }
}

function pumpkinTop(t, rng) {
  t.fill((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    t.set(x, y, add([214, 128, 20], (Math.floor(d) % 3 === 0 ? -26 : 0) + (rng() - 0.5) * 12));
  });
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) t.set(x, y, [96, 74, 30]);
}

function jackOLantern(t, rng) {
  pumpkinSide(t, rng);
  const face = [
    '................', '................', '................', '................',
    '...##......##...', '...###....###...', '....##....##....', '................',
    '................', '..############..', '..#.##.##.##.#..', '...##########...',
    '....########....', '................', '................', '................',
  ];
  face.forEach((row, y) => { for (let x = 0; x < 16; x++) if (row[x] === '#') t.set(x, y, y > 8 && (x + y) % 3 === 0 ? [255, 236, 120] : [255, 214, 60]); });
}

function melonSide(t, rng) {
  t.fill((x, y) => {
    const stripe = Math.floor((x + Math.round(Math.sin(y * 0.8) * 0.8)) / 2) % 2 === 0;
    t.set(x, y, add(stripe ? [118, 168, 38] : [86, 128, 28], (rng() - 0.5) * 12));
  });
}

function melonTop(t, rng) {
  noisy(t, rng, [110, 158, 36], 8, 6);
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) t.set(x, y, [86, 110, 40]);
}

function cropPlant(t, rng, stage, fruit) {
  transparent(t);
  const h = 4 + stage * 3;
  for (const x0 of [2, 6, 10, 13]) {
    for (let k = 0; k < h; k++) {
      const x = x0 + (k > h / 2 ? ((x0 & 1) ? 1 : -1) : 0);
      t.set(x, 15 - k, add([74, 150, 48], k * 3 + (rng() - 0.5) * 16));
      if (k > 1 && k % 2 === 0) t.set(x + 1, 15 - k, [96, 172, 60]);
    }
    if (stage === 3) { t.set(x0, 15, fruit); t.set(x0 + 1, 15, fruit); t.set(x0, 14, scale(fruit, 0.8)); }
  }
}

function mushroom(t, rng, cap, spots) {
  transparent(t);
  for (let y = 10; y <= 15; y++) { t.set(7, y, [220, 214, 196]); t.set(8, y, [200, 192, 176]); }
  const rows = ['..######..', '.########.', '##########', '##########'];
  rows.forEach((row, y) => { for (let x = 0; x < 10; x++) if (row[x] === '#') t.set(3 + x, 6 + y, y === 3 ? scale(cap, 0.75) : cap); });
  if (spots) for (const [x, y] of [[5, 7], [9, 6], [11, 8], [7, 8]]) t.set(x, y, spots);
}

function flowerShape(t, rng, rows, pal) {
  transparent(t);
  stem(t, 8);
  t.set(6, 12, [70, 135, 45]); t.set(8, 13, [70, 135, 45]); t.set(9, 11, [70, 135, 45]); t.set(5, 13, [60, 120, 40]);
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) t.set(3 + x, 2 + y, pal[row[x]]); });
}

function fern(t, rng) {
  transparent(t);
  for (const [x0, lean] of [[4, -1], [8, 0], [11, 1]]) {
    for (let k = 0; k < 13; k++) {
      const x = x0 + Math.round((lean * k) / 6), y = 15 - k;
      const c = GRASS_GRAYS[k % GRASS_GRAYS.length];
      t.set(x, y, scale(c, 0.8), TINT_GRASS);
      if (k > 2 && k % 2 === 0) { t.set(x - 1, y, scale(c, 0.9), TINT_GRASS); t.set(x + 1, y, scale(c, 0.9), TINT_GRASS); }
    }
  }
}

function lilyPad(t, rng) {
  transparent(t);
  t.fill((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const notch = x >= 7 && x <= 8 && y > 7;
    if (d < 7.2 && !notch) t.set(x, y, add([150, 150, 150], (rng() - 0.5) * 26 + (d > 6 ? -20 : 0)), TINT_FOLIAGE);
  });
}

function sapling(t, rng, leaf, trunk, conical) {
  transparent(t);
  for (let y = 9; y <= 15; y++) t.set(7, y, trunk);
  t.set(8, 12, trunk);
  for (let y = 1; y <= 10; y++) {
    const w = conical ? Math.floor((y + 1) / 2) : y < 4 ? y : y < 8 ? 4 : 10 - y;
    for (let x = 7 - w; x <= 7 + w; x++) if (rng() > 0.2) t.set(x, y, add(leaf, (rng() - 0.5) * 30));
  }
}

function ironBars(t, rng) {
  transparent(t);
  for (let y = 0; y < 16; y++) {
    for (const x of [1, 6, 11]) { t.set(x, y, [118, 120, 118]); t.set(x + 1, y, [70, 72, 70]); }
  }
  for (const y of [1, 14]) for (let x = 0; x < 16; x++) { t.set(x, y, [132, 134, 132]); }
}

function crackedStoneBricks(t, rng) {
  stoneBricks(t, rng);
  let x = 3, y = 0;
  while (y < 16) {
    t.set(x, y, [60, 60, 60]);
    y++; x += rng() < 0.4 ? 1 : rng() < 0.5 ? -1 : 0;
    x = Math.max(0, Math.min(15, x));
  }
  for (let k = 0; k < 5; k++) t.set(9 + k, 10 + (k % 2), [66, 66, 66]);
}

function mossyStoneBricks(t, rng) {
  stoneBricks(t, rng);
  const vn = valueNoise(rng, 8);
  t.fill((x, y) => {
    if (vn(x, y) + rng() * 0.3 > 0.8) t.set(x, y, add([86, 118, 52], (rng() - 0.5) * 24));
  });
}

function chiseledStoneBricks(t, rng) {
  noisy(t, rng, [122, 122, 122], 6, 4);
  t.fill((x, y) => {
    if (x === 0 || y === 0) t.set(x, y, [150, 150, 150]);
    if (x === 15 || y === 15) t.set(x, y, [80, 80, 80]);
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 3.5 && d < 4.6) t.set(x, y, [88, 88, 88]);
    if (d < 1.5) t.set(x, y, [96, 96, 96]);
  });
}

function hayTop(t, rng) {
  t.fill((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    t.set(x, y, add([204, 172, 44], Math.sin(d * 1.8) * 16 + (rng() - 0.5) * 20));
  });
}

function haySide(t, rng) {
  t.fill((x, y) => t.set(x, y, add([206, 170, 40], (x % 2 ? -12 : 8) + (rng() - 0.5) * 22)));
  for (const y of [3, 12]) for (let x = 0; x < 16; x++) { t.set(x, y, [120, 76, 28]); t.set(x, y + 1, [150, 96, 36]); }
}

function prismarine(t, rng) {
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const v = vn(x, y);
    t.set(x, y, add(v > 0.6 ? [110, 190, 170] : v > 0.35 ? [92, 160, 146] : [70, 130, 120], (rng() - 0.5) * 14));
  });
}

function prismarineBricks(t, rng) {
  noisy(t, rng, [100, 176, 158], 8, 6);
  t.fill((x, y) => {
    const ly = y % 8, lx = (y < 8 ? x : x + 4) % 8;
    if (ly === 7 || lx === 7) t.set(x, y, [60, 118, 104]);
    else if (ly === 0 || lx === 0) t.set(x, y, [130, 206, 188]);
  });
}

function darkPrismarine(t, rng) {
  noisy(t, rng, [52, 94, 78], 6, 5);
  t.fill((x, y) => {
    if (x % 8 === 0 || y % 8 === 0) t.set(x, y, [36, 66, 54]);
    else if (x % 8 === 1 || y % 8 === 1) t.set(x, y, [70, 122, 102]);
  });
}

function seaLantern(t, rng) {
  t.fill((x, y) => {
    const edge = Math.min(x, y, 15 - x, 15 - y);
    const v = edge === 0 ? [140, 180, 170] : (x + y) % 6 === 0 || (x - y + 16) % 6 === 0 ? [236, 250, 246] : [196, 230, 224];
    t.set(x, y, add(v, (rng() - 0.5) * 10));
  });
}

function netherrack(t, rng) {
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const v = vn(x, y) + (rng() - 0.5) * 0.35;
    t.set(x, y, v > 0.62 ? [150, 70, 70] : v > 0.4 ? [112, 48, 48] : v > 0.2 ? [90, 36, 38] : [66, 26, 28]);
  });
}

function soulSand(t, rng) {
  noisy(t, rng, [84, 64, 52], 10, 8);
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(rng() * 12), y = 1 + Math.floor(rng() * 11);
    t.set(x, y, [40, 30, 24]); t.set(x + 2, y, [40, 30, 24]);
    t.set(x, y + 2, [46, 34, 28]); t.set(x + 1, y + 3, [46, 34, 28]); t.set(x + 2, y + 2, [46, 34, 28]);
  }
}

function netherBricks(t, rng) {
  noisy(t, rng, [48, 24, 28], 6, 4);
  t.fill((x, y) => {
    const ly = y % 4, lx = (Math.floor(y / 4) % 2 ? x + 4 : x) % 8;
    if (ly === 3 || lx === 7) t.set(x, y, [24, 10, 14]);
    else if (ly === 0) t.set(x, y, [70, 36, 42]);
  });
}

function magma(t, rng) {
  const vn = valueNoise(rng, 4);
  t.fill((x, y) => {
    const v = vn(x, y) + (rng() - 0.5) * 0.2;
    t.set(x, y, v > 0.62 ? [255, 170, 40] : v > 0.52 ? [220, 90, 20] : add([74, 30, 24], (rng() - 0.5) * 16));
  });
}

function netherPortal(t, rng) {
  t.fill((x, y) => {
    const a = Math.sin(x * 0.9 + Math.cos(y * 0.7) * 2) + Math.cos(y * 0.8 - x * 0.3);
    const v = (a + 2) / 4;
    t.set(x, y, mix([80, 10, 170], [200, 120, 255], v + (rng() - 0.5) * 0.15));
  });
}

function cryingObsidian(t, rng) {
  obsidian(t, rng);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 14);
    t.set(x, y, [150, 60, 255]); t.set(x, y + 1, [120, 40, 220]);
  }
}

function cobweb(t, rng) {
  transparent(t);
  const c = [232, 232, 236];
  for (let k = 0; k < 16; k++) { t.set(k, k, c); t.set(15 - k, k, c); t.set(7, k, c); t.set(k, 8, c); }
  for (const r of [3, 6]) {
    for (let a = 0; a < 32; a++) {
      const x = Math.round(7.5 + Math.cos(a / 5) * r), y = Math.round(7.5 + Math.sin(a / 5) * r);
      t.set(x, y, [214, 214, 220]);
    }
  }
}

function spawnerTex(t, rng) {
  transparent(t);
  t.fill((x, y) => {
    if (x % 5 === 0 || y % 5 === 0 || x === 15 || y === 15) t.set(x, y, add(x % 5 === 0 && y % 5 === 0 ? [80, 88, 104] : [42, 48, 60], (rng() - 0.5) * 12));
  });
}

function railTex(t, rng) {
  transparent(t);
  for (let y = 0; y < 16; y++) {
    if (y % 4 === 1 || y % 4 === 2) for (let x = 2; x < 14; x++) t.set(x, y, add([112, 82, 50], (rng() - 0.5) * 16));
    for (const x of [3, 12]) { t.set(x, y, [150, 150, 150]); t.set(x + 1, y, [104, 104, 104]); }
  }
}

function ladder(t, rng) {
  transparent(t);
  for (let y = 0; y < 16; y++) {
    for (const x of [2, 12]) { t.set(x, y, [130, 98, 56]); t.set(x + 1, y, [100, 74, 40]); }
    if (y % 4 === 1) for (let x = 2; x < 14; x++) t.set(x, y, add([150, 114, 66], (rng() - 0.5) * 12));
    if (y % 4 === 2) for (let x = 2; x < 14; x++) t.set(x, y, add([106, 80, 44], (rng() - 0.5) * 10));
  }
}

function doorTex(t, rng, upper) {
  planks(t, rng, [160, 128, 76]);
  t.fill((x, y) => {
    const frame = x < 2 || x > 13 || (upper ? y < 2 : y > 13);
    if (frame) t.set(x, y, add([120, 92, 52], (rng() - 0.5) * 10));
    // Windows in the top half, raised panels in the bottom half.
    if (upper && y >= 3 && y <= 11 && ((x >= 3 && x <= 6) || (x >= 9 && x <= 12))) t.set(x, y, [0, 0, 0], 0);
    if (!upper && y >= 2 && y <= 12 && ((x >= 3 && x <= 6) || (x >= 9 && x <= 12)) && (x === 3 || x === 9 || y === 2)) t.set(x, y, [186, 150, 94]);
  });
  if (!upper) { t.set(12, 3, [80, 80, 84]); t.set(12, 4, [60, 60, 64]); }
}

function bedTop(t, rng, head) {
  t.fill((x, y) => {
    let c = add([176, 36, 34], (rng() - 0.5) * 12);
    if (x === 0 || x === 15) c = [128, 24, 24];
    if (head && y < 7 && x > 1 && x < 14) c = add([236, 236, 230], (rng() - 0.5) * 8);
    if (!head && y === 0) c = [150, 28, 28];
    t.set(x, y, c);
  });
}

function bedSide(t, rng) {
  planks(t, rng, [160, 128, 76]);
  t.fill((x, y) => {
    if (y >= 7 && y <= 9) t.set(x, y, add(y === 9 ? [140, 28, 28] : [176, 36, 34], (rng() - 0.5) * 10));
    if (y > 12 && x > 2 && x < 13) t.set(x, y, [0, 0, 0], 0); // gap between the legs
  });
}

function quartzTex(t, rng, side) {
  noisy(t, rng, [234, 228, 220], 3, 4);
  if (side) t.fill((x, y) => { if (y === 0) t.set(x, y, [246, 242, 236]); if (y === 15) t.set(x, y, [200, 194, 186]); });
}

Object.assign(GENERATORS, {
  granite: (t, r) => speckled(t, r, [152, 104, 86], [[178, 128, 108], [116, 76, 62]], 0.45),
  diorite: (t, r) => speckled(t, r, [190, 190, 190], [[140, 140, 142], [226, 226, 226]], 0.35),
  andesite: (t, r) => speckled(t, r, [134, 134, 136], [[112, 112, 114], [158, 158, 160]], 0.4),
  polished_granite: (t, r) => polished(t, r, [158, 108, 90], GENERATORS.granite),
  polished_diorite: (t, r) => polished(t, r, [196, 196, 198], GENERATORS.diorite),
  polished_andesite: (t, r) => polished(t, r, [136, 138, 138], GENERATORS.andesite),
  deepslate, deepslate_top: deepslateTop,
  cobbled_deepslate: cobbledDeepslate,
  deepslate_iron_ore: (t, r) => ore(t, r, [216, 174, 142], [150, 110, 84], deepslate),
  deepslate_gold_ore: (t, r) => ore(t, r, [250, 226, 76], [196, 146, 28], deepslate),
  deepslate_diamond_ore: (t, r) => ore(t, r, [104, 232, 226], [30, 150, 146], deepslate),
  deepslate_redstone_ore: (t, r) => ore(t, r, [236, 32, 24], [140, 0, 0], deepslate),
  redstone_ore: (t, r) => ore(t, r, [236, 32, 24], [140, 0, 0]),
  lapis_ore: (t, r) => ore(t, r, [40, 80, 196], [20, 40, 120]),
  emerald_ore: (t, r) => ore(t, r, [70, 226, 120], [14, 130, 56]),
  copper_ore: (t, r) => ore(t, r, [226, 132, 96], [120, 150, 110]),
  clay,
  ice: (t, r) => ice(t, r),
  packed_ice: (t, r) => ice(t, r, [132, 170, 236], 2),
  terracotta: (t, r) => terracotta(t, r, [152, 94, 68]),
  orange_terracotta: (t, r) => terracotta(t, r, [162, 84, 38]),
  blue_terracotta: (t, r) => terracotta(t, r, [74, 60, 92]),
  chiseled_sandstone: chiseledSandstone,
  cut_sandstone: cutSandstone,
  sugar_cane: sugarCane,
  sugar_cane_item: sugarCaneItem,
  pumpkin_side: pumpkinSide,
  pumpkin_top: pumpkinTop,
  jack_o_lantern: jackOLantern,
  melon_side: melonSide,
  melon_top: melonTop,
  red_mushroom: (t, r) => mushroom(t, r, [206, 34, 30], [240, 236, 230]),
  brown_mushroom: (t, r) => mushroom(t, r, [150, 110, 80], null),
  allium: (t, r) => flowerShape(t, r, ['..pPp..', '.pPpPp.', 'pPpPpPp', '.pPpPp.', '..pPp..'], { p: [180, 110, 230], P: [210, 150, 250] }),
  azure_bluet: (t, r) => flowerShape(t, r, ['.w...w.', 'wyw.wyw', '.w.w.w.', '...wyw.', '....w..'], { w: [236, 240, 240], y: [240, 210, 60] }),
  red_tulip: (t, r) => flowerShape(t, r, ['..r.r..', '..rrr..', '..rRr..', '..rrr..', '...r...'], { r: [210, 40, 40], R: [250, 90, 80] }),
  orange_tulip: (t, r) => flowerShape(t, r, ['..o.o..', '..ooo..', '..oOo..', '..ooo..', '...o...'], { o: [240, 130, 30], O: [255, 190, 90] }),
  lily_of_the_valley: (t, r) => flowerShape(t, r, ['.w.....', 'www..w.', '.g..www', '.g...g.', '..ggg..'], { w: [244, 244, 240], g: [70, 135, 45] }),
  fern,
  lily_pad: lilyPad,
  oak_sapling: (t, r) => sapling(t, r, [72, 140, 40], [104, 82, 50], false),
  birch_sapling: (t, r) => sapling(t, r, [110, 160, 70], [214, 212, 204], false),
  spruce_sapling: (t, r) => sapling(t, r, [44, 90, 52], [62, 44, 26], true),
  iron_bars: ironBars,
  birch_planks: (t, r) => planks(t, r, [196, 178, 122]),
  spruce_planks: (t, r) => planks(t, r, [116, 86, 50]),
  mossy_stone_bricks: mossyStoneBricks,
  cracked_stone_bricks: crackedStoneBricks,
  chiseled_stone_bricks: chiseledStoneBricks,
  smooth_stone: (t, r) => { smoothStone(t, r, [158, 158, 158]); t.fill((x, y) => { if (y === 0 || y === 15 || x === 0 || x === 15) t.set(x, y, [118, 118, 118]); }); },
  hay_top: hayTop,
  hay_side: haySide,
  prismarine,
  prismarine_bricks: prismarineBricks,
  dark_prismarine: darkPrismarine,
  sea_lantern: seaLantern,
  netherrack,
  soul_sand: soulSand,
  nether_bricks: netherBricks,
  nether_quartz_ore: (t, r) => ore(t, r, [240, 236, 226], [190, 176, 160], netherrack),
  magma,
  nether_portal: netherPortal,
  crying_obsidian: cryingObsidian,
  cobweb,
  spawner: spawnerTex,
  rail: railTex,
  ladder,
  oak_door_top: (t, r) => doorTex(t, r, true),
  oak_door_bottom: (t, r) => doorTex(t, r, false),
  bed_head_top: (t, r) => bedTop(t, r, true),
  bed_foot_top: (t, r) => bedTop(t, r, false),
  bed_side: bedSide,
  emerald_block: (t, r) => metalBlock(t, r, [66, 214, 110]),
  lapis_block: (t, r) => metalBlock(t, r, [34, 70, 176]),
  redstone_block: (t, r) => metalBlock(t, r, [176, 24, 16]),
  quartz_top: (t, r) => quartzTex(t, r, false),
  quartz_side: (t, r) => quartzTex(t, r, true),
});
for (const [color, rgb] of Object.entries({
  orange: [240, 118, 20], magenta: [190, 68, 180], light_blue: [58, 176, 218], lime: [112, 186, 26], pink: [238, 142, 170],
  gray: [62, 68, 72], light_gray: [142, 142, 136], cyan: [22, 138, 146], purple: [122, 42, 172], brown: [114, 72, 40],
})) GENERATORS[`${color}_wool`] = (t, r) => wool(t, r, rgb);
for (const [name, fruit] of [['carrots', [240, 130, 30]], ['potatoes', [200, 170, 90]]]) {
  for (let stage = 0; stage < 4; stage++) GENERATORS[`${name}_${stage}`] = (t, r) => cropPlant(t, r, stage, fruit);
}

// Weather textures (tile vertically; scrolled in the shader).
function rainStreaks(t, rng) {
  transparent(t);
  for (let i = 0; i < 4; i++) {
    const x = 1 + i * 4 + Math.floor(rng() * 2), y0 = Math.floor(rng() * 16), len = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) t.set(x, (y0 + k) % 16, [176, 200, 240], 110 + k * 16);
  }
}

function snowfall(t, rng) {
  transparent(t);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * 15), y = Math.floor(rng() * 15);
    t.set(x, y, [250, 250, 255]);
    if (rng() < 0.5) t.set(x + 1, y, [230, 236, 248]);
  }
}

Object.assign(GENERATORS, {
  rain_streaks: rainStreaks,
  snowfall,
  lightning: (t) => t.fill((x, y) => t.set(x, y, [230, 236, 255])),
});

// Hand-tuned item art (itemart.js) replaces the older procedural sprites.
for (const tier of ['wooden', 'stone', 'iron', 'diamond']) {
  for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) GENERATORS[`item_${tier}_${kind}`] = toolArt(kind, tier);
}
GENERATORS.item_stick = stickArt;
for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) GENERATORS[`item_golden_${kind}`] = toolArt(kind, 'golden');
for (const material of ['leather', 'iron', 'golden', 'diamond']) {
  for (const piece of ['helmet', 'chestplate', 'leggings', 'boots']) GENERATORS[`item_${material}_${piece}`] = armorArt(piece, material);
}
for (const [name, gen] of Object.entries(ITEM_ART)) GENERATORS[`item_${name}`] = gen;

// For transparent pixels, copy the average opaque colour so mipmapping does
// not produce dark fringes around cut-out textures.
function fixTransparentColors(t) {
  let r = 0, g = 0, b = 0, n = 0;
  t.fill((x, y) => {
    const c = t.get(x, y);
    if (c[3] > 0) { r += c[0]; g += c[1]; b += c[2]; n++; }
  });
  if (!n) return;
  const avg = [r / n, g / n, b / n];
  t.fill((x, y) => { if (t.alpha(x, y) === 0) t.set(x, y, avg, 0); });
}

let cache = null;

// Builds every texture layer. Returns { names, index: Map(name->layer), pixels }.
// Block/world textures come first (layers 0..blockCount-1) and item sprites
// after them: the GPU keeps them in two texture arrays so each stays within
// the 256 layers a vertex can address.
export function generateTextures() {
  if (cache) return cache;
  const world = [], items = [];
  for (const [name, gen] of Object.entries(GENERATORS)) {
    const t = new Tile();
    gen(t, mulberry32(hashString(name)));
    fixTransparentColors(t);
    (name.startsWith('item_') ? items : world).push([name, t]);
  }
  destroyStages(mulberry32(hashString('destroy'))).forEach((t, i) => world.push([`destroy_${i}`, t]));
  const all = [...world, ...items];
  const names = all.map(([n]) => n);
  const pixels = new Uint8Array(all.length * N);
  all.forEach(([, t], i) => pixels.set(t.data, i * N));
  const index = new Map(names.map((n, i) => [n, i]));
  cache = { names, index, pixels, count: all.length, blockCount: world.length, itemBase: world.length, itemCount: items.length };
  if (world.length > 256 || items.length > 256) throw new Error('Too many texture layers');
  return cache;
}

// Which GPU texture array holds a texture, and its layer there.
export function atlasLayer(name) {
  const tex = generateTextures();
  const i = tex.index.get(name);
  if (i === undefined) throw new Error(`Unknown texture ${name}`);
  return i >= tex.itemBase ? { atlas: 'items', layer: i - tex.itemBase } : { atlas: 'blocks', layer: i };
}

export function tilePixels(textures, name) {
  const layer = textures.index.get(name);
  if (layer === undefined) throw new Error(`Unknown texture ${name}`);
  return textures.pixels.subarray(layer * N, (layer + 1) * N);
}
