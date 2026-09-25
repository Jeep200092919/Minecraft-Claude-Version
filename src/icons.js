// Inventory icons rendered at runtime from the procedural textures:
// isometric cubes for blocks, flat sprites for plants/items, plus HUD hearts.
import { BLOCKS, ITEMS, isBlockItem, FACE_PX, FACE_PY, FACE_PZ } from './blocks.js';
import { generateTextures, tilePixels, TILE, TINT_GRASS, TINT_FOLIAGE } from './textures.js';

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
