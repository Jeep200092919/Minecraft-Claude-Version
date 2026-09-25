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

// Recolours a template: o/d/m/l/h come from the material palette, other
// characters from `extra`.
function templateArt(rows, M, extra = {}) {
  return pixelArt(rows, { ...M, ...extra });
}

// --- Armour ------------------------------------------------------------------------

const ARMOR_ART = {
  helmet: [
    '................',
    '................',
    '................',
    '................',
    '....oooooooo....',
    '...ohhllllllo...',
    '..ohllllllmmdo..',
    '..olmmmmmmmmdo..',
    '..olmoooooomdo..',
    '..olmo....omdo..',
    '..odo......odo..',
    '..oo........oo..',
    '................',
    '................',
    '................',
    '................',
  ],
  chestplate: [
    '................',
    '..ooo......ooo..',
    '.ohlmoooooomldo.',
    '.ollmmmmmmmmldo.',
    '.odlmmmmmmmmddo.',
    '..oolmmmmmmdoo..',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...odmmmmmmdo...',
    '...oddddddddo...',
    '....oooooooo....',
    '................',
    '................',
    '................',
  ],
  leggings: [
    '................',
    '...oooooooooo...',
    '...ohllllllmo...',
    '...olmmmmmmdo...',
    '...olmmoommdo...',
    '...olmo..omdo...',
    '...olmo..omdo...',
    '...olmo..omdo...',
    '...olmo..omdo...',
    '...olmo..omdo...',
    '...odmo..omdo...',
    '...oddo..oddo...',
    '...oooo..oooo...',
    '................',
    '................',
    '................',
  ],
  boots: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...ooo....ooo...',
    '...olo....olo...',
    '...olo....olo...',
    '...olo....olo...',
    '..oolo...oolo...',
    '.ohllmo.ohllmo..',
    '.odddmo.odddmo..',
    '.oooooo.oooooo..',
    '................',
    '................',
  ],
};

export function armorArt(piece, material) {
  return templateArt(ARMOR_ART[piece], MATERIALS[material]);
}

// --- Materials -----------------------------------------------------------------------

const INGOT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......oooooooo..',
  '.....ohhhhhhhlo.',
  '....ohllllllldo.',
  '...ohllllllldmo.',
  '..ommmmmmmmmdmo.',
  '..omlmmmmmmmddo.',
  '..oddddddddddo..',
  '...ooooooooooo..',
  '................',
  '................',
  '................',
];
const NUGGET = [
  '................', '................', '................', '................',
  '................', '......ooo.......', '.....ohlmo......', '....ohlmmdo.....',
  '....olmmddo.oo..', '.....odddooh o..', '......oooolmdo..', '.........oddo...',
  '..........oo....', '................', '................', '................',
];
const GEM = [
  '................', '................', '................', '.....oooooo.....',
  '....ohhlllmo....', '...ohllllmmdo...', '..ohlllllmmmdo..', '..olmmmmmmmmdo..',
  '...olmmmmmmdo...', '....olmmmmdo....', '.....olmmdo.....', '......oddo......',
  '.......oo.......', '................', '................', '................',
];
const DUST = [
  '................', '................', '................', '................',
  '................', '................', '.......o........', '......olo..o....',
  '....o.olmooho...', '...ohomlmdolmo..', '..ohlmdmmdmmddo.', '.olmmmmdmmmmdddo',
  '.oddddddddddddo.', '..oooooooooooo..', '................', '................',
];
const LUMP = [
  '................', '................', '................', '................',
  '.....oooooo.....', '....ohhllmmo....', '...ohllmmmmdo...', '..ohlmmmmmmmdo..',
  '..olmmmmmmmmdo..', '..olmmmmmmmddo..', '..odmmmmmmdddo..', '...oddddddddo...',
  '....oooooooo....', '................', '................', '................',
];
const ORB = [
  '................', '................', '................', '.....oooooo.....',
  '....ohhllmmo....', '...ohhllmmmdo...', '..ohllmmmmmmdo..', '..olllmmmmmmdo..',
  '..olmmmmmmmddo..', '..olmmmmmmdddo..', '..odmmmmmddddo..', '...oddddddddo...',
  '....oddddddo....', '.....oooooo.....', '................', '................',
];
const pal = (o, d, m, l, h) => ({ o, d, m, l, h });
const P = {
  iron: MATERIALS.iron,
  gold: MATERIALS.golden,
  copper: pal([80, 36, 18], [156, 76, 40], [202, 112, 70], [230, 150, 106], [252, 196, 160]),
  emerald: pal([8, 70, 30], [18, 140, 60], [40, 196, 96], [110, 236, 150], [214, 255, 226]),
  lapis: pal([12, 22, 76], [26, 50, 140], [44, 80, 190], [90, 130, 230], [170, 200, 255]),
  quartz: pal([120, 110, 100], [200, 190, 180], [226, 220, 212], [242, 238, 232], [255, 255, 255]),
  redstone: pal([70, 0, 0], [136, 0, 0], [196, 10, 10], [236, 50, 40], [255, 130, 110]),
  sugar: pal([150, 150, 150], [210, 210, 210], [232, 232, 232], [246, 246, 246], [255, 255, 255]),
  bonemeal: pal([120, 120, 110], [200, 200, 190], [226, 226, 218], [240, 240, 234], [255, 255, 255]),
  charcoal: pal([16, 12, 10], [40, 32, 26], [58, 48, 40], [80, 68, 58], [104, 92, 80]),
  clay: pal([70, 74, 86], [128, 134, 148], [160, 166, 178], [184, 190, 200], [210, 214, 222]),
  slime: pal([28, 80, 20], [70, 150, 50], [110, 200, 80], [150, 230, 120], [210, 255, 190]),
  pearl: pal([6, 30, 30], [14, 70, 70], [24, 110, 100], [50, 160, 140], [150, 230, 210]),
  snow: pal([140, 150, 160], [214, 222, 232], [236, 242, 248], [248, 250, 252], [255, 255, 255]),
};

// --- Misc items ------------------------------------------------------------------------

const BUCKET = [
  '................',
  '................',
  '................',
  '....oooooooo....',
  '...occcccccco...',
  '...ohcccccclo...',
  '...olmmmmmmdo...',
  '....olmmmmdo....',
  '....olmmmmdo....',
  '....olmmmmdo....',
  '.....olmmdo.....',
  '.....oooooo.....',
  '................',
  '................',
  '................',
  '................',
];
export function bucketArt(content) {
  return templateArt(BUCKET, MATERIALS.iron, { c: content });
}

const WOODP = pal([40, 27, 10], [84, 60, 26], [118, 86, 42], [150, 114, 62], [172, 134, 76]);

export const ITEM_ART = {
  bow: pixelArt([
    '................', '.........wwoo...', '.......ww..sdo..', '......w...s.do..',
    '.....w...s..do..', '....w...s...do..', '...w...s....do..', '...w..s....do...',
    '..w..s....do....', '..w.s....do.....', '..ws...ddo......', '..sdddddo.......',
    '..so............', '................', '................', '................',
  ], { w: [230, 230, 230], s: [150, 114, 62], d: [104, 78, 40], o: [58, 41, 16] }),
  arrow: pixelArt([
    '................', '...........ooo..', '..........ohhdo.', '..........ohdo..',
    '.........ss.oo..', '........ss......', '.......ss.......', '......ss........',
    '.....ss.........', '....ss..........', '.ff.s...........', '.ffs............',
    '.fff............', '..ff............', '................', '................',
  ], { o: [40, 40, 40], h: [200, 200, 200], d: [120, 120, 120], s: [120, 90, 50], f: [236, 236, 236] }),
  bone: pixelArt([
    '................', '...........ww...', '..........wwww..', '...........wwwo.',
    '..........wwoo..', '.........ww.....', '........ww......', '.......ww.......',
    '......ww........', '.....ww.........', '..owww..........', '.wwww...........',
    '..wwo...........', '...o............', '................', '................',
  ], { w: [236, 232, 214], o: [170, 164, 146] }),
  string: pixelArt([
    '................', '................', '..........ww....', '.........w..w...',
    '........w....w..', '.......w.....w..', '......w.....w...', '.....w....ww....',
    '....w...ww......', '...w..ww........', '..w.ww..........', '..ww............',
    '................', '................', '................', '................',
  ], { w: [236, 236, 236] }),
  spider_eye: templateArt(ORB, pal([50, 10, 20], [120, 20, 40], [170, 40, 60], [206, 80, 90], [240, 170, 170]), {}),
  ender_pearl: templateArt(ORB, P.pearl),
  slimeball: templateArt(ORB, P.slime),
  snowball: templateArt(ORB, P.snow),
  egg: pixelArt([
    '................', '................', '.......oo.......', '......ohho......',
    '.....ohllmo.....', '.....ollmmo.....', '....ohllmmdo....', '....ollmmmdo....',
    '....olmmmmdo....', '....olmmmmdo....', '.....odmmddo....', '......oddo......',
    '.......oo.......', '................', '................', '................',
  ], pal([120, 96, 70], [200, 170, 126], [224, 200, 156], [240, 222, 186], [252, 244, 224])),
  carrot: pixelArt([
    '................', '..........g.g...', '.........ggg....', '..........ggg...',
    '.........oggg...', '........ohlo....', '.......ohlmo....', '......ohlmo.....',
    '.....ohlmdo.....', '....ohlmdo......', '...olmmdo.......', '..olmddo........',
    '..oddo..........', '...oo...........', '................', '................',
  ], { ...pal([110, 50, 10], [200, 90, 20], [236, 130, 30], [250, 170, 70], [255, 210, 140]), g: [70, 150, 40] }),
  potato: templateArt(LUMP, pal([90, 66, 30], [176, 140, 76], [206, 172, 104], [224, 196, 130], [240, 220, 170])),
  baked_potato: templateArt(LUMP, pal([80, 44, 16], [170, 110, 44], [206, 150, 70], [228, 184, 100], [246, 214, 150])),
  golden_apple: pixelArt([
    '................', '.......b........', '........bgg.....', '.....oooboooo...',
    '....ohhllmmmdo..', '...ohhlllmmmmdo.', '...ohllmmmmmmdo.', '...olllmmmmmmdo.',
    '...olmmmmmmmddo.', '...olmmmmmmdddo.', '....ommmmmmddo..', '.....odddddoo...',
    '......ooooo.....', '................', '................', '................',
  ], { ...MATERIALS.golden, b: [100, 70, 30], g: [70, 150, 40] }),
  cookie: pixelArt([
    '................', '................', '................', '.....oooooo.....',
    '....ommcmmmo....', '...omlmmmcmmo...', '..omlmcmmmmmdo..', '..ommmmmmcmmdo..',
    '..omcmmmmmmmdo..', '..ommmmcmmmcdo..', '...ommmmmmmdo...', '....oddcdddo....',
    '.....oooooo.....', '................', '................', '................',
  ], { ...pal([80, 44, 16], [150, 90, 36], [198, 128, 56], [222, 160, 84], [240, 200, 130]), c: [60, 30, 12] }),
  sugar: templateArt(DUST, P.sugar),
  bone_meal: templateArt(DUST, P.bonemeal),
  redstone: templateArt(DUST, P.redstone),
  paper: pixelArt([
    '................', '................', '...oooooooooo...', '...ohwwwwwwwo...',
    '...owwwwwwwwo...', '...owggggggwo...', '...owwwwwwwwo...', '...owggggggwo...',
    '...owwwwwwwwo...', '...owggggggwo...', '...owwwwwwwwo...', '...owwwwwwwdo...',
    '...oooooooooo...', '................', '................', '................',
  ], { o: [150, 150, 140], w: [244, 244, 236], h: [255, 255, 255], g: [210, 210, 200], d: [210, 210, 200] }),
  book: pixelArt([
    '................', '................', '...ooooooooooo..', '..orrrrrrrrrrpo.',
    '..orRRRRRRRRrpo.', '..orRyyyyyyRrpo.', '..orRRRRRRRRrpo.', '..orrrrrrrrrrpo.',
    '..orrrrrrrrrrpo.', '..orrrrrrrrrrpo.', '..orrrrrrrrrrpo.', '..oddddddddddpo.',
    '...ooooooooooo..', '................', '................', '................',
  ], { o: [40, 20, 10], r: [120, 60, 30], R: [150, 80, 40], y: [230, 190, 60], d: [90, 44, 20], p: [236, 230, 210] }),
  compass: pixelArt([
    '................', '................', '.....oooooo.....', '....ogggggdo....',
    '...ogllllllgdo..', '..ogllllrllldo..', '..ogllllrrlldo..', '..oglllrrrlldo..',
    '..ogllkkkllldo..', '..ogllkkllllgo..', '...ogllkllldo...', '....ogllllgo....',
    '.....oooooo.....', '................', '................', '................',
  ], { o: [40, 40, 44], g: [150, 150, 156], d: [100, 100, 106], l: [220, 220, 210], r: [220, 30, 30], k: [60, 60, 66] }),
  clock: pixelArt([
    '................', '................', '.....oooooo.....', '....ogggggdo....',
    '...ogbbbbbbgdo..', '..ogbbbybbbbdo..', '..ogbbbybbbbdo..', '..ogbbbyyybbdo..',
    '..ogbwwwwwwbdo..', '..ogwwwwwwwwgo..', '...ogwwwwwwdo...', '....ogggggdo....',
    '.....oooooo.....', '................', '................', '................',
  ], { o: [80, 50, 6], g: [240, 200, 50], d: [196, 142, 22], b: [40, 50, 110], y: [255, 240, 120], w: [120, 170, 230] }),
  emerald: templateArt(GEM, P.emerald),
  lapis_lazuli: templateArt(LUMP, P.lapis),
  quartz: templateArt(GEM, P.quartz),
  iron_nugget: templateArt(NUGGET, P.iron),
  gold_nugget: templateArt(NUGGET, P.gold),
  iron_ingot: templateArt(INGOT, P.iron),
  gold_ingot: templateArt(INGOT, P.gold),
  copper_ingot: templateArt(INGOT, P.copper),
  brick: templateArt(INGOT, pal([70, 26, 16], [130, 52, 34], [170, 76, 52], [196, 104, 76], [220, 140, 110])),
  charcoal: templateArt(LUMP, P.charcoal),
  clay_ball: templateArt(ORB, P.clay),
  shears: pixelArt([
    '................', '................', '..........oo....', '.........ohlo...',
    '........ohlo....', '.......ohlo.oo..', '......ohlo.ohlo.', '.....oolo.ohlo..',
    '....orroohlo....', '...orrrorlo.....', '...orr.orro.....', '...orrrrro......',
    '....ooooo.......', '................', '................', '................',
  ], { o: [40, 40, 44], h: [240, 240, 240], l: [190, 190, 196], r: [120, 60, 40] }),
  bowl: pixelArt([
    '................', '................', '................', '................',
    '................', '................', '..oooooooooooo..', '..ohddddddddlo..',
    '..olmmmmmmmmdo..', '...olmmmmmmdo...', '....olmmmmdo....', '.....oooooo.....',
    '................', '................', '................', '................',
  ], WOODP),
  mushroom_stew: pixelArt([
    '................', '................', '................', '................',
    '................', '................', '..oooooooooooo..', '..osSsssSsssSo..',
    '..olmmmmmmmmdo..', '...olmmmmmmdo...', '....olmmmmdo....', '.....oooooo.....',
    '................', '................', '................', '................',
  ], { ...WOODP, s: [170, 120, 80], S: [206, 160, 110] }),
  pumpkin_pie: pixelArt([
    '................', '................', '................', '................',
    '........oo......', '......ooppoo....', '....oopppppppo..', '..oopppPppppppo.',
    '.oppppppppPpppo.', '.occcccccccccco.', '.oCCCCCCCCCCCCo.', '..oooooooooooo..',
    '................', '................', '................', '................',
  ], { o: [80, 40, 10], p: [226, 130, 40], P: [246, 170, 80], c: [214, 170, 100], C: [180, 130, 70] }),
  melon_slice: pixelArt([
    '................', '................', '................', '................',
    '..............o.', '............oro.', '..........orrrgo', '........orrkrrgo',
    '......orrrrrrrgo', '....orrkrrrkrgo.', '..orrrrrrrrrrgo.', '.oggggggggggggo.',
    '..oooooooooooo..', '................', '................', '................',
  ], { o: [30, 60, 20], r: [230, 60, 60], k: [30, 20, 20], g: [110, 170, 50] }),
  blaze_rod: pixelArt([
    '................', '............oo..', '...........oyyo.', '..........oyyo..',
    '.........oyyo...', '........oyyo....', '.......oyyo.....', '......oyyo......',
    '.....oyyo.......', '....oyyo........', '...oyyo.........', '..oyyo..........',
    '..oo............', '................', '................', '................',
  ], { o: [120, 60, 0], y: [252, 206, 60] }),
  oak_door: pixelArt([
    '................', '.....oooooo.....', '.....ommmmo.....', '.....owmwmo.....',
    '.....owmwmo.....', '.....ommmmo.....', '.....ommmmo.....', '.....olmlmo.....',
    '.....olmlmk.....', '.....olmlmo.....', '.....ommmmo.....', '.....olmlmo.....',
    '.....olmlmo.....', '.....ommmmo.....', '.....oooooo.....', '................',
  ], { o: [72, 52, 26], m: [158, 124, 72], l: [186, 150, 94], w: [210, 230, 236], k: [60, 60, 64] }),
  red_bed: pixelArt([
    '................', '................', '................', '................',
    '................', '................', '..wwwrrrrrrrrr..', '.owwwrrrrrrrrro.',
    '.orrrrrrrrrrrro.', '.oRRRRRRRRRRRRo.', '.opppppppppppo..', '.op..........po.',
    '................', '................', '................', '................',
  ], { w: [236, 236, 230], r: [180, 36, 34], R: [140, 26, 26], o: [60, 20, 20], p: [140, 104, 60] }),
  ink_sac: templateArt(ORB, pal([8, 8, 12], [20, 20, 30], [36, 36, 48], [60, 60, 80], [110, 110, 140])),
  water_bucket: bucketArt([60, 100, 230]),
  lava_bucket: bucketArt([240, 120, 20]),
  milk_bucket: bucketArt([246, 246, 246]),
  bucket: bucketArt([60, 60, 64]),
};
