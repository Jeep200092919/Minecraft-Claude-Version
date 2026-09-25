// Inventory icons rendered at runtime from the procedural textures:
// isometric cubes for blocks, flat sprites for plants/items, plus HUD hearts.
import { BLOCKS, ITEMS, isBlockItem, FACE_PX, FACE_PY, FACE_PZ } from './blocks.js';
import { generateTextures, tilePixels, TILE, TINT_GRASS, TINT_FOLIAGE } from './textures.js';
import { GLYPHS } from './font.js';

const GRASS_TINT = [0.56, 0.74, 0.35];
const FOLIAGE_TINT = [0.45, 0.66, 0.19];

const cache = new Map();

function tileCanvas(name, shade = 1) {
  const tex = generateTextures();
  const px = tilePixels(tex, name);
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    // Grass/foliage pixels are grayscale; tint them like a plains biome.
    const tint = a === TINT_GRASS ? GRASS_TINT : a === TINT_FOLIAGE ? FOLIAGE_TINT : null;
    img.data[i] = px[i] * shade * (tint ? tint[0] : 1);
    img.data[i + 1] = px[i + 1] * shade * (tint ? tint[1] : 1);
    img.data[i + 2] = px[i + 2] * shade * (tint ? tint[2] : 1);
    img.data[i + 3] = tint ? 255 : a;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawFlat(ctx, name, size) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas(name), 0, 0, size, size);
}

function drawCube(ctx, faces, size) {
  const k = size / 32;
  ctx.imageSmoothingEnabled = false;
  // Slightly oversized faces hide seams between them.
  const g = 16.35 / 16;
  const draw = (name, shade, a, b, c, d, e, f) => {
    ctx.setTransform(a * k * g, b * k * g, c * k * g, d * k * g, e * k, f * k);
    ctx.drawImage(tileCanvas(name, shade), 0, 0);
  };
  draw(faces[FACE_PZ], 0.78, 13 / 16, 7 / 16, 0, 15 / 16, 3, 9); // left / front
  draw(faces[FACE_PX], 0.6, 13 / 16, -7 / 16, 0, 15 / 16, 16, 16); // right
  draw(faces[FACE_PY], 1.0, 13 / 16, -7 / 16, 13 / 16, 7 / 16, 3, 9); // top
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Returns a data URL for an item's icon.
export function itemIcon(id, size = 64) {
  const key = `${id}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (isBlockItem(id)) {
    const b = BLOCKS[id];
    if (b.shape === 'cube' || b.shape === 'cactus' || b.shape === 'liquid') drawCube(ctx, b.faces, size);
    else drawFlat(ctx, b.faces[0], size);
  } else {
    const item = ITEMS.get(id);
    drawFlat(ctx, `item_${item.name}`, size);
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

// Pixel-art sprites for hearts and air bubbles.
const HEART = [
  '.oo...oo.',
  'ohfo.offo',
  'ohffffffo',
  'offfffffo',
  '.offfffo.',
  '..offfo..',
  '...ofo...',
  '....o....',
];
const BUBBLE = [
  '..ooooo..',
  '.offfffo.',
  'ofhhffffo',
  'ofhfffffo',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  '.offfffo.',
  '..ooooo..',
];

const DRUMSTICK = [
  '....oooo.',
  '...offffo',
  '..offhhfo',
  '..ofhhffo',
  '..offfffo',
  '.owoffoo.',
  'owwoooo..',
  'owo......',
  '.o.......',
];

// halfColors replaces the right half (or the left half when halfLeft is set).
function sprite(pattern, colors, halfColors = null, scale = 2, halfLeft = false) {
  const w = 9, h = pattern.length;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  pattern.forEach((row, y) => {
    for (let x = 0; x < Math.min(w, row.length); x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const pal = halfColors && (halfLeft ? x < 4 : x >= 5) ? halfColors : colors;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return c.toDataURL();
}

let hudSprites = null;
export function hudIcons() {
  if (hudSprites) return hudSprites;
  const full = { o: '#1c0404', f: '#d4161a', h: '#ff9a9a' };
  const empty = { o: '#1c0404', f: '#3a1414', h: '#4a1c1c' };
  const foodFull = { o: '#2b1206', f: '#b0572a', h: '#e3955b', w: '#ece4d4' };
  const foodEmpty = { o: '#2b1206', f: '#3b2012', h: '#4a2a18', w: '#4a4038' };
  hudSprites = {
    heartFull: sprite(HEART, full),
    heartHalf: sprite(HEART, full, empty),
    heartEmpty: sprite(HEART, empty),
    bubble: sprite(BUBBLE, { o: '#1f4a9a', f: '#7fb6ff', h: '#ffffff' }),
    foodFull: sprite(DRUMSTICK, foodFull),
    foodHalf: sprite(DRUMSTICK, foodFull, foodEmpty, 2, true),
    foodEmpty: sprite(DRUMSTICK, foodEmpty),
  };
  return hudSprites;
}

// A tiled, darkened dirt background like classic menu screens.
export function dirtBackground() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas('dirt', 0.32), 0, 0, 64, 64);
  return c.toDataURL();
}

export function textureDataURL(name, shade = 1) {
  return tileCanvas(name, shade).toDataURL();
}

// The title logo: pixel-font letters built from stone blocks with a 3D
// extrusion, like the classic block-letter logo.
export function logoDataURL(text, px = 7) {
  // Bold letters: every pixel also fills the one to its right.
  const rows = [...text].map((ch) => (GLYPHS[ch] || GLYPHS[' ']).map((r) => {
    let out = '';
    for (let x = 0; x <= r.length; x++) out += r[x] === '#' || r[x - 1] === '#' ? '#' : '.';
    return out;
  }));
  const widths = rows.map((g) => Math.max(...g.map((r) => r.length)));
  const cols = widths.reduce((a, w) => a + w + 1, -1);
  const depth = Math.round(px * 1.5);
  const W = cols * px + depth + 4, H = 7 * px + depth + 4;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // Font-pixel mask.
  const mask = [];
  let ox = 0;
  rows.forEach((g, i) => {
    g.forEach((row, y) => {
      if (y > 6) return;
      for (let x = 0; x < row.length; x++) if (row[x] === '#') mask.push([ox + x, y]);
    });
    ox += widths[i] + 1;
  });
  const on = new Set(mask.map(([x, y]) => `${x},${y}`));
  const has = (x, y) => on.has(`${x},${y}`);
  // Extrusion: darker copies shifted down and right.
  for (let d = depth; d >= 1; d--) {
    const shade = Math.round(40 + (depth - d) * 3);
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 4})`;
    for (const [x, y] of mask) ctx.fillRect(2 + x * px + Math.round(d * 0.35), 2 + y * px + d, px, px);
  }
  // Stone-textured faces with a light top edge and a dark bottom edge.
  const stone = tilePixels(generateTextures(), 'stone');
  const img = ctx.getImageData(0, 0, W, H);
  for (const [fx, fy] of mask) {
    for (let j = 0; j < px; j++) {
      for (let i = 0; i < px; i++) {
        const X = 2 + fx * px + i, Y = 2 + fy * px + j;
        const t = ((Y % 16) * 16 + (X % 16)) * 4;
        let s = 1.12;
        if (j < 2 && !has(fx, fy - 1)) s = 1.5;
        else if (i < 2 && !has(fx - 1, fy)) s = 1.3;
        else if (j >= px - 2 && !has(fx, fy + 1)) s = 0.75;
        else if (i >= px - 2 && !has(fx + 1, fy)) s = 0.85;
        const o = (Y * W + X) * 4;
        img.data[o] = Math.min(255, stone[t] * s);
        img.data[o + 1] = Math.min(255, stone[t + 1] * s);
        img.data[o + 2] = Math.min(255, stone[t + 2] * s);
        img.data[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: c.toDataURL(), width: W, height: H };
}

// Stone-grey noise for buttons, like the classic menu buttons.
export function buttonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(16, 16);
  const stone = tilePixels(generateTextures(), 'stone');
  for (let i = 0; i < 256; i++) {
    const v = 70 + (stone[i * 4] - 122) * 0.5;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
