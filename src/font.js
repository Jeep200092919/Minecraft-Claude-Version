// A blocky pixel font, drawn glyph by glyph below and turned into a real
// TrueType font at startup, so every menu, tooltip and number in the game
// uses crisp pixel text without shipping a font file.
//
// Glyphs are up to 8 rows: rows 0-6 sit on the baseline, row 7 is the
// descender. '#' is a filled pixel. Each glyph advances by its width + 1.

const G = {
  ' ': ['...'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '###..', '#....', '#....', '#....', '#####'],
  F: ['#####', '#....', '###..', '#....', '#....', '#....', '#....'],
  G: ['.####', '#....', '#..##', '#...#', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '####.', '#....', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#...#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#', '#...#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#...#', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####'],
  f: ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '####.'],
  h: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  i: ['#', '.', '#', '#', '#', '#', '#'],
  j: ['...#', '....', '...#', '...#', '...#', '...#', '#..#', '.##.'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '#.##.', '##..#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.##.#', '#..##', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.####'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '.####', '....#', '####.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#...#', '#####'],
  3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  4: ['...##', '..#.#', '.#..#', '#...#', '#####', '....#', '....#'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '#...#', '....#', '...#.', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '"': ['#.#', '#.#'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  $: ['..#..', '.####', '#....', '.###.', '....#', '####.', '..#..'],
  '%': ['#...#', '#..#.', '...#.', '..#..', '.#...', '.#..#', '#...#'],
  '&': ['..#..', '.#.#.', '..#..', '.##.#', '#..#.', '#..#.', '.##.#'],
  "'": ['#', '#'],
  '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
  ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
  '*': ['....', '....', '#..#', '.##.', '#..#'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..'],
  ',': ['.', '.', '.', '.', '.', '#', '#', '#'],
  '-': ['.....', '.....', '.....', '#####'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ':': ['.', '#', '.', '.', '.', '#'],
  ';': ['.', '#', '.', '.', '.', '#', '#'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '=': ['.....', '.....', '#####', '.....', '.....', '#####'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '@': ['.####.', '#....#', '#.##.#', '#.##.#', '#.####', '#.....', '.####.'],
  '[': ['###', '#..', '#..', '#..', '#..', '#..', '###'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
  ']': ['###', '..#', '..#', '..#', '..#', '..#', '###'],
  '^': ['..#..', '.#.#.', '#...#'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '`': ['#.', '.#'],
  '{': ['..##', '.#..', '.#..', '#...', '.#..', '.#..', '..##'],
  '|': ['#', '#', '#', '#', '#', '#', '#', '#'],
  '}': ['##..', '..#.', '..#.', '...#', '..#.', '..#.', '##..'],
  '~': ['.....', '.....', '.##.#', '#.##.'],
  '–': ['....', '....', '....', '####'], // en dash
  '—': ['......', '......', '......', '######'], // em dash
  '…': ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'], // ellipsis
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'], // multiplication sign
  '•': ['..', '..', '..', '##', '##'], // bullet
  '→': ['......', '...#..', '....#.', '######', '....#.', '...#..'], // right arrow
  '➜': ['......', '...#..', '....#.', '######', '....#.', '...#..'], // heavy arrow
  '·': ['.', '.', '.', '#'], // middle dot
};

export const FONT_FAMILY = 'ClaudeCraft Pixel';
export const GLYPHS = G;

const PX = 128; // font units per pixel
const EM = 8 * PX;

// Outline of a glyph's pixels as closed contours (clockwise in y-up font
// space, holes counter-clockwise), merging runs of pixels into long edges.
export function glyphContours(rows) {
  const h = rows.length;
  const filled = (x, r) => r >= 0 && r < h && rows[r][x] === '#';
  const edges = new Map(); // "x,y" -> list of end points
  const addEdge = (x0, y0, x1, y1) => {
    const k = `${x0},${y0}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push([x1, y1]);
  };
  for (let r = 0; r < h; r++) {
    for (let x = 0; x < rows[r].length; x++) {
      if (!filled(x, r)) continue;
      const y = 6 - r; // pixel spans y..y+1, baseline at 0
      if (!filled(x - 1, r)) addEdge(x, y, x, y + 1);
      if (!filled(x, r - 1)) addEdge(x, y + 1, x + 1, y + 1);
      if (!filled(x + 1, r)) addEdge(x + 1, y + 1, x + 1, y);
      if (!filled(x, r + 1)) addEdge(x + 1, y, x, y);
    }
  }
  const contours = [];
  for (;;) {
    const startKey = [...edges.keys()].find((k) => edges.get(k).length);
    if (!startKey) break;
    const pts = [];
    let [cx, cy] = startKey.split(',').map(Number);
    const sx = cx, sy = cy;
    do {
      pts.push([cx, cy]);
      const list = edges.get(`${cx},${cy}`);
      const [nx, ny] = list.pop();
      cx = nx; cy = ny;
    } while (cx !== sx || cy !== sy);
    // Drop points in the middle of straight runs.
    const out = pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
    });
    contours.push(out);
  }
  return contours;
}

// --- Minimal TrueType writer ----------------------------------------------------

class Writer {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 255); }
  u16(v) { this.u8(v >> 8); this.u8(v); }
  i16(v) { this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { this.u16((v >>> 16) & 0xffff); this.u16(v & 0xffff); }
  tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); }
  pad() { while (this.bytes.length % 4) this.u8(0); }
  get length() { return this.bytes.length; }
}

function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + ((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))) >>> 0;
  }
  return sum;
}

// Builds the font file. Returns an ArrayBuffer.
export function buildFont() {
  const chars = Object.keys(G).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const glyphs = [{ code: null, rows: [], width: 5 }]; // .notdef
  for (const ch of chars) {
    const rows = G[ch];
    glyphs.push({ code: ch.codePointAt(0), rows, width: Math.max(...rows.map((r) => r.length)) });
  }

  // glyf + loca + hmtx
  const glyf = new Writer();
  const loca = [];
  const hmtx = new Writer();
  let xMin = 0, yMin = 0, xMax = 0, yMax = 0, maxPoints = 0, maxContours = 0, advMax = 0;
  for (const g of glyphs) {
    loca.push(glyf.length);
    const advance = (g.width + 1) * PX;
    advMax = Math.max(advMax, advance);
    const contours = g.rows.length ? glyphContours(g.rows) : [];
    if (!contours.length) {
      hmtx.u16(advance); hmtx.i16(0);
      continue;
    }
    const pts = contours.flat();
    const gx0 = Math.min(...pts.map((p) => p[0])) * PX, gx1 = Math.max(...pts.map((p) => p[0])) * PX;
    const gy0 = Math.min(...pts.map((p) => p[1])) * PX, gy1 = Math.max(...pts.map((p) => p[1])) * PX;
    xMin = Math.min(xMin, gx0); yMin = Math.min(yMin, gy0); xMax = Math.max(xMax, gx1); yMax = Math.max(yMax, gy1);
    maxPoints = Math.max(maxPoints, pts.length);
    maxContours = Math.max(maxContours, contours.length);
    hmtx.u16(advance); hmtx.i16(gx0);
    glyf.i16(contours.length);
    glyf.i16(gx0); glyf.i16(gy0); glyf.i16(gx1); glyf.i16(gy1);
    let end = -1;
    for (const c of contours) { end += c.length; glyf.u16(end); }
    glyf.u16(0); // no instructions
    for (let i = 0; i < pts.length; i++) glyf.u8(0x01); // on-curve, 16-bit deltas
    let px = 0;
    for (const p of pts) { glyf.i16(p[0] * PX - px); px = p[0] * PX; }
    let py = 0;
    for (const p of pts) { glyf.i16(p[1] * PX - py); py = p[1] * PX; }
    glyf.pad();
  }
  loca.push(glyf.length);
  glyf.pad();

  const locaW = new Writer();
  for (const o of loca) locaW.u32(o);

  const ascender = 8 * PX, descender = -2 * PX;
  const head = new Writer();
  head.u32(0x00010000); head.u32(0x00010000); head.u32(0); head.u32(0x5f0f3cf5);
  head.u16(0x000b); head.u16(EM);
  head.u32(0); head.u32(0); head.u32(0); head.u32(0); // created, modified
  head.i16(xMin); head.i16(yMin); head.i16(xMax); head.i16(yMax);
  head.u16(0); head.u16(8); head.i16(2); head.i16(1); head.i16(0);

  const hhea = new Writer();
  hhea.u32(0x00010000); hhea.i16(ascender); hhea.i16(descender); hhea.i16(0);
  hhea.u16(advMax); hhea.i16(0); hhea.i16(0); hhea.i16(xMax);
  hhea.i16(1); hhea.i16(0); hhea.i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0); hhea.u16(glyphs.length);

  const maxp = new Writer();
  maxp.u32(0x00010000); maxp.u16(glyphs.length); maxp.u16(maxPoints); maxp.u16(maxContours);
  maxp.u16(0); maxp.u16(0); maxp.u16(2);
  for (let i = 0; i < 7; i++) maxp.u16(0);
  maxp.u16(0); maxp.u16(0);

  const codes = glyphs.slice(1).map((g) => g.code);
  const os2 = new Writer();
  os2.u16(3); os2.i16(6 * PX); os2.u16(400); os2.u16(5); os2.u16(0);
  for (const v of [5 * PX, 5 * PX, 0, PX, 5 * PX, 5 * PX, 0, 4 * PX, PX / 2, 3 * PX]) os2.i16(v);
  for (let i = 0; i < 10; i++) os2.u8(0); // panose
  os2.u32(1); os2.u32(0); os2.u32(0); os2.u32(0); // Basic Latin
  os2.tag('CLDE');
  os2.u16(0x40); os2.u16(Math.min(...codes)); os2.u16(Math.min(0xffff, Math.max(...codes)));
  os2.i16(ascender); os2.i16(descender); os2.i16(0);
  os2.u16(ascender); os2.u16(-descender);
  os2.u32(1); os2.u32(0);
  os2.i16(5 * PX); os2.i16(7 * PX); os2.u16(0); os2.u16(32); os2.u16(1);

  const strings = { 1: FONT_FAMILY, 2: 'Regular', 3: `${FONT_FAMILY} 1.0`, 4: FONT_FAMILY, 5: 'Version 1.0', 6: 'ClaudeCraftPixel' };
  const name = new Writer();
  const ids = Object.keys(strings).map(Number);
  name.u16(0); name.u16(ids.length); name.u16(6 + ids.length * 12);
  const storage = [];
  for (const id of ids) {
    const s = strings[id];
    name.u16(3); name.u16(1); name.u16(0x409); name.u16(id); name.u16(s.length * 2); name.u16(storage.length);
    for (const ch of s) { storage.push(ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 255); }
  }
  for (const b of storage) name.u8(b);

  // cmap format 4: one segment per run of consecutive codes.
  const segs = [];
  glyphs.slice(1).forEach((g, i) => {
    const gid = i + 1;
    const last = segs[segs.length - 1];
    if (last && g.code === last.end + 1 && gid - g.code === last.delta) last.end = g.code;
    else segs.push({ start: g.code, end: g.code, delta: gid - g.code });
  });
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segX2 = segs.length * 2;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segs.length));
  const sub = new Writer();
  sub.u16(4); sub.u16(16 + segs.length * 8); sub.u16(0);
  sub.u16(segX2); sub.u16(searchRange); sub.u16(Math.log2(searchRange / 2)); sub.u16(segX2 - searchRange);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0);
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16((s.delta + 65536) % 65536);
  for (let i = 0; i < segs.length; i++) sub.u16(0);
  const cmap = new Writer();
  cmap.u16(0); cmap.u16(1); cmap.u16(3); cmap.u16(1); cmap.u32(12);
  for (const b of sub.bytes) cmap.u8(b);

  const post = new Writer();
  post.u32(0x00030000); post.u32(0); post.i16(-PX); post.i16(PX / 2); post.u32(1);
  post.u32(0); post.u32(0); post.u32(0); post.u32(0);

  const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca: locaW, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const out = new Writer();
  const n = tags.length;
  const sr = 16 * 2 ** Math.floor(Math.log2(n));
  out.u32(0x00010000); out.u16(n); out.u16(sr); out.u16(Math.floor(Math.log2(n))); out.u16(n * 16 - sr);
  let offset = 12 + n * 16;
  const dir = [];
  for (const t of tags) {
    const bytes = tables[t].bytes;
    dir.push({ t, offset, length: bytes.length, sum: checksum(bytes) });
    offset += Math.ceil(bytes.length / 4) * 4;
  }
  for (const d of dir) { out.tag(d.t); out.u32(d.sum); out.u32(d.offset); out.u32(d.length); }
  for (const t of tags) { for (const b of tables[t].bytes) out.u8(b); out.pad(); }
  // head.checkSumAdjustment
  const total = checksum(out.bytes);
  const adj = (0xb1b0afba - total) >>> 0;
  const headOff = dir.find((d) => d.t === 'head').offset + 8;
  out.bytes[headOff] = adj >>> 24; out.bytes[headOff + 1] = (adj >>> 16) & 255;
  out.bytes[headOff + 2] = (adj >>> 8) & 255; out.bytes[headOff + 3] = adj & 255;
  return new Uint8Array(out.bytes).buffer;
}

// Registers the font with the document. Resolves once it's usable.
export async function loadPixelFont() {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
  try {
    const face = new FontFace(FONT_FAMILY, buildFont());
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (err) {
    console.warn('Pixel font unavailable', err);
    return false;
  }
}
