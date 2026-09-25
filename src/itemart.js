// Hand-tuned 16x16 item sprites in the classic style: dark outlines, three or
// four shades per material, light coming from the top left, and tools drawn
// on a 45-degree grid with the handle running from the bottom-left corner.
//
// Each generator receives a tile with set/get/alpha/fill (see textures.js).

// Material palettes: o outline, d dark, m mid, l light, h highlight.
export const MATERIALS = {
  wooden: { o: [58, 41, 16], d: [104, 78, 40], m: [138, 104, 57], l: [168, 135, 80], h: [196, 162, 102] },
  stone: { o: [36, 36, 36], d: [84, 84, 84], m: [114, 114, 114], l: [142, 142, 142], h: [168, 168, 168] },
  iron: { o: [44, 44, 44], d: [140, 140, 140], m: [190, 190, 190], l: [222, 222, 222], h: [255, 255, 255] },
  golden: { o: [82, 52, 6], d: [196, 142, 22], m: [234, 192, 44], l: [252, 230, 94], h: [255, 253, 196] },
  diamond: { o: [12, 58, 50], d: [26, 142, 130], m: [48, 204, 186], l: [118, 240, 222], h: [214, 255, 248] },
  chainmail: { o: [30, 30, 34], d: [90, 90, 98], m: [130, 130, 140], l: [170, 170, 180], h: [210, 210, 220] },
  leather: { o: [52, 26, 10], d: [110, 58, 26], m: [148, 82, 40], l: [178, 108, 58], h: [204, 136, 80] },
};
const WOOD = { o: [40, 27, 10], d: [84, 60, 26], m: [118, 86, 42], l: [150, 114, 62], h: [172, 134, 76] };

function clear(t) {
  t.fill((x, y) => t.set(x, y, [0, 0, 0], 0));
}

// Paints a grid of [palette, shade] cells, then outlines the silhouette with
// each neighbouring cell's outline colour.
function paintGrid(t, grid, outline = true) {
  clear(t);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = grid[y][x];
      if (c) t.set(x, y, c[0][c[1]]);
    }
  }
  if (!outline) return;
  const edge = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (grid[y][x]) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const n = grid[y + dy]?.[x + dx];
        if (n) { edge.push([x, y, n[0].o]); break; }
      }
    }
  }
  for (const [x, y, c] of edge) t.set(x, y, c);
}

function emptyGrid() {
  return Array.from({ length: 16 }, () => new Array(16).fill(null));
}

// --- Tools and weapons -------------------------------------------------------------

// u runs along the handle line (x + y = 15) towards the top right, v across it.
function handleShade(v) {
  return v < 0 ? 'l' : 'd';
}

// The axe blade sits on the upper-left side of the handle's top end.
const AXE_HEAD = [
  '................',
  '.......lll......',
  '......lmmmmd....',
  '.....lmmmmd.....',
  '.....lmmmd......',
  '......lmd.......',
  '.......d........',
];

const TOOL_SHAPES = {
  pickaxe(u, v, M) {
    const c = 8.4 - 0.08 * v * v;
    const d = u - c;
    if (Math.abs(v) <= 9 && d >= -2.2 && d <= 1.6 && !(Math.abs(v) >= 8 && d > 0)) {
      return [M, d > 0.5 ? 'l' : d < -1.2 ? 'd' : 'm'];
    }
    if (u >= -13 && u <= 7 && v >= -1 && v <= 0) return [WOOD, handleShade(v)];
    return null;
  },
  axe(u, v, M, x, y) {
    const shade = AXE_HEAD[y]?.[x];
    if (shade && shade !== '.') return [M, shade];
    if (u >= -13 && u <= 10 && v >= -1 && v <= 0) return [WOOD, handleShade(v)];
    return null;
  },
  shovel(u, v, M) {
    const w = u >= 12 ? 0.5 : u >= 11 ? 1.5 : 2.5;
    if (u >= 5 && u <= 13 && Math.abs(v + 0.5) <= w) return [M, v < -1 ? 'l' : v > 0 ? 'd' : 'm'];
    if (u >= -13 && u <= 5 && v >= -1 && v <= 0) return [WOOD, handleShade(v)];
    return null;
  },
  hoe(u, v, M) {
    if (v <= 0 && v >= -5 && u >= 8 && u <= 10) return [M, v <= -3 ? 'l' : 'm'];
    if (v <= -4 && v >= -6 && u >= 5 && u <= 8) return [M, 'd'];
    if (u >= -13 && u <= 9 && v >= -1 && v <= 0) return [WOOD, handleShade(v)];
    return null;
  },
  sword(u, v, M) {
    if (u >= -2 && u <= 12 && v >= -1 && v <= 0) {
      if (u >= 11 && v === -1) return null;
      return [M, v === -1 ? (u > 3 ? 'h' : 'l') : 'm'];
    }
    if (u >= -5 && u <= -3 && v >= -3 && v <= 2) return [M, v < -1 ? 'm' : 'd'];
    if (u >= -11 && u <= -6 && v >= -1 && v <= 0) return [WOOD, handleShade(v)];
    if (u >= -14 && u <= -12 && v >= -1 && v <= 0) return [M, 'd'];
    return null;
  },
};

export function toolArt(kind, material) {
  return (t) => {
    const M = MATERIALS[material];
    const grid = emptyGrid();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) grid[y][x] = TOOL_SHAPES[kind](x - y, x + y - 15, M, x, y);
    }
    paintGrid(t, grid);
  };
}

export function stickArt(t) {
  const grid = emptyGrid();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const u = x - y, v = x + y - 15;
      if (u >= -11 && u <= 11 && v >= -1 && v <= 0) grid[y][x] = [WOOD, handleShade(v)];
    }
  }
  paintGrid(t, grid);
}

// --- Palette sprites -----------------------------------------------------------------

// rows: 16 strings; pal maps characters to colours ('.' = transparent).
export function pixelArt(rows, pal) {
  return (t) => {
    clear(t);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (c) t.set(x, y, c);
      }
    });
  };
}
