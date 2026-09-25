// Converts chunk block data into compact vertex buffers.
//
// Vertex layout (16 bytes):
//   int16  x, y, z      position in 1/16 block units, chunk-local
//   uint8  u, v         texture coords in 1/16 units
//   uint8  layer        texture array layer
//   uint8  sky, block   light levels * 16 (0..240)
//   uint8  ao           ambient occlusion (0..255)
//   uint8  flags        FLAG_* bits (waves, sway, leaves, emissive)
//   uint8  normal       face index 0-5, 6 = plant (lit as if facing up)
//   uint8  temp, humid  biome climate for grass/foliage tinting
import { CHUNK_SIZE, CHUNK_HEIGHT } from './constants.js';
import { B, BLOCKS, ITEMS, IS_OPAQUE, IS_SOLID, isBlockItem } from './blocks.js';
import { generateTextures } from './textures.js';

export const VERTEX_BYTES = 16;
export const FLAG_WAVE = 1; // liquid surface (top vertices)
export const FLAG_SWAY = 2; // plants (top vertices)
export const FLAG_LEAVES = 4; // leaves rustle (all vertices)
export const FLAG_EMISSIVE = 8; // bright pixels glow (torches, lava...)
export const NORMAL_PLANT = 6;

const PW = CHUNK_SIZE + 2; // padded width
const PH = CHUNK_HEIGHT + 2; // padded height
const PLANE = PW * PW;

const pidx = (x, y, z) => ((y + 1) * PW + (z + 1)) * PW + (x + 1);
const pdelta = (dx, dy, dz) => dx + dz * PW + dy * PLANE;

// Faces: normal, U and V axes (cross(U, V) = normal so quads wind CCW when
// seen from outside), and the base corner of the unit cube.
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], base: [1, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], base: [0, 0, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], base: [0, 1, 1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], base: [0, 0, 0] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], base: [0, 0, 1] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], base: [1, 0, 0] },
];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.42, 0.6, 0.8, 1.0];

for (const f of FACES) {
  f.delta = pdelta(...f.n);
  f.du = pdelta(...f.u);
  f.dv = pdelta(...f.v);
  // Corner positions of the unit face.
  f.corners = CORNERS.map(([cu, cv]) => [
    f.base[0] + f.u[0] * cu + f.v[0] * cv,
    f.base[1] + f.u[1] * cu + f.v[1] * cv,
    f.base[2] + f.u[2] * cu + f.v[2] * cv,
  ]);
}

// Per-block vertex flags applied to every vertex.
const BLOCK_FLAGS = new Uint8Array(256);
for (let id = 0; id < 256; id++) {
  const b = BLOCKS[id];
  BLOCK_FLAGS[id] = (b.waving ? FLAG_LEAVES : 0) | (b.emissive ? FLAG_EMISSIVE : 0);
}

let faceLayers = null;
let texIndex = null;
function initLayers() {
  if (faceLayers) return;
  const tex = generateTextures();
  texIndex = tex.index;
  faceLayers = new Uint8Array(256 * 6);
  for (let id = 0; id < 256; id++) {
    const faces = BLOCKS[id].faces;
    if (!faces) continue;
    for (let f = 0; f < 6; f++) {
      const layer = tex.index.get(faces[f]);
      if (layer === undefined) throw new Error(`Missing texture ${faces[f]}`);
      faceLayers[id * 6 + f] = layer;
    }
  }
}

export function textureLayer(name) {
  initLayers();
  return texIndex.get(name);
}

export function blockFaceLayer(id, face) {
  initLayers();
  return faceLayers[id * 6 + face];
}

// Growable vertex buffer.
export class MeshBuilder {
  constructor(initialVerts = 4096) {
    this._alloc(initialVerts);
    this.count = 0;
    this.temp = 128; // climate written into every vertex
    this.humid = 128;
  }
  _alloc(verts) {
    const buf = new ArrayBuffer(verts * VERTEX_BYTES);
    if (this.u8) new Uint8Array(buf).set(this.u8.subarray(0, this.count * VERTEX_BYTES));
    this.u8 = new Uint8Array(buf);
    this.i16 = new Int16Array(buf);
    this.capacity = verts;
  }
  reset() {
    this.count = 0;
  }
  vertex(x, y, z, u, v, layer, sky, blk, ao, flags, normal) {
    if (this.count >= this.capacity) this._alloc(this.capacity * 2);
    const i = this.count++;
    const s = i * 8;
    this.i16[s] = x;
    this.i16[s + 1] = y;
    this.i16[s + 2] = z;
    const b = i * VERTEX_BYTES;
    const u8 = this.u8;
    u8[b + 6] = u;
    u8[b + 7] = v;
    u8[b + 8] = layer;
    u8[b + 9] = sky;
    u8[b + 10] = blk;
    u8[b + 11] = ao;
    u8[b + 12] = flags;
    u8[b + 13] = normal;
    u8[b + 14] = this.temp;
    u8[b + 15] = this.humid;
  }
  get quads() {
    return this.count >> 2;
  }
  result() {
    return this.u8.slice(0, this.count * VERTEX_BYTES);
  }
}

const solid = new MeshBuilder(1 << 15);
const liquid = new MeshBuilder(1 << 12);
const padBlocks = new Uint8Array(PW * PW * PH);
const padLight = new Uint8Array(PW * PW * PH);

// Copies the chunk plus a 1-block border from its neighbours.
function gatherPadded(world, chunk) {
  padBlocks.fill(0);
  padLight.fill(0);
  // Below the world: opaque. Above: open sky.
  for (let i = 0; i < PLANE; i++) {
    padBlocks[i] = B.BEDROCK;
    padLight[(PH - 1) * PLANE + i] = 0xf0;
  }
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!c) continue;
      const x0 = dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : 15;
      const z0 = dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : 15;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let z = z0; z <= z1; z++) {
          const pz = z + dz * 16;
          let src = (y << 8) | (z << 4) | x0;
          let dst = pidx(x0 + dx * 16, y, pz);
          for (let x = x0; x <= x1; x++, src++, dst++) {
            padBlocks[dst] = c.blocks[src];
            padLight[dst] = c.light[src];
          }
        }
      }
    }
  }
}

function shouldDrawFace(id, nid) {
  if (IS_OPAQUE[nid]) return false;
  if (nid === id && BLOCKS[id].cullSame) return false;
  return true;
}

const AO = new Int32Array(4);
const SKYV = new Int32Array(4);
const BLKV = new Int32Array(4);

// Emits one full cube face with smooth lighting and ambient occlusion.
// `topFlags` apply to the upper vertices only, `allFlags` to every vertex.
function emitCubeFace(mb, f, x, y, z, pc, layer, topHeight = 16, topFlags = 0, allFlags = 0) {
  const face = FACES[f];
  const front = pc + face.delta;
  const ao = AO, sky = SKYV, blk = BLKV;
  for (let c = 0; c < 4; c++) {
    const [cu, cv] = CORNERS[c];
    const su = cu ? face.du : -face.du;
    const sv = cv ? face.dv : -face.dv;
    const s1 = front + su, s2 = front + sv, sc = front + su + sv;
    const o1 = IS_OPAQUE[padBlocks[s1]], o2 = IS_OPAQUE[padBlocks[s2]], oc = IS_OPAQUE[padBlocks[sc]];
    ao[c] = o1 && o2 ? 0 : 3 - o1 - o2 - oc;
    let l = padLight[front];
    let s = l >> 4, b = l & 15, n = 1;
    if (!o1) { l = padLight[s1]; s += l >> 4; b += l & 15; n++; }
    if (!o2) { l = padLight[s2]; s += l >> 4; b += l & 15; n++; }
    if (!oc && !(o1 && o2)) { l = padLight[sc]; s += l >> 4; b += l & 15; n++; }
    sky[c] = Math.round((s * 16) / n);
    blk[c] = Math.round((b * 16) / n);
  }
  // Split the quad along the diagonal that keeps AO/light gradients smooth.
  const flip = ao[0] * 64 + sky[0] + blk[0] + ao[2] * 64 + sky[2] + blk[2] <
    ao[1] * 64 + sky[1] + blk[1] + ao[3] * 64 + sky[3] + blk[3];
  for (let k = 0; k < 4; k++) {
    const c = flip ? (k + 1) & 3 : k;
    const p = face.corners[c];
    const [cu, cv] = CORNERS[c];
    const py = p[1] ? topHeight : 0;
    mb.vertex(
      (x + p[0]) * 16, y * 16 + py, (z + p[2]) * 16,
      cu * 16, (1 - cv) * 16,
      layer, sky[c], blk[c],
      Math.round(AO_CURVE[ao[c]] * 255),
      (p[1] ? topFlags : 0) | allFlags,
      f,
    );
  }
}

// Emits the faces of an arbitrary box (in 1/16 units) with flat lighting.
// `transform` optionally remaps vertex positions (used for wall torches).
function emitBox(mb, x, y, z, box, layers, sky, blk, faceMask = 63, transform = null, uvOverride = null, flags = 0) {
  const [x0, y0, z0, x1, y1, z1] = box;
  for (let f = 0; f < 6; f++) {
    if (!(faceMask & (1 << f))) continue;
    const face = FACES[f];
    for (let k = 0; k < 4; k++) {
      const c = face.corners[k];
      let px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
      // UVs from the box's projection onto the face (Minecraft-style).
      const du = face.u[0] * px + face.u[1] * py + face.u[2] * pz + (face.u[0] + face.u[1] + face.u[2] < 0 ? 16 : 0);
      const dv = face.v[0] * px + face.v[1] * py + face.v[2] * pz + (face.v[0] + face.v[1] + face.v[2] < 0 ? 16 : 0);
      let u = du, v = 16 - dv;
      if (uvOverride && uvOverride[f]) [u, v] = uvOverride[f](u, v);
      if (transform) [px, py, pz] = transform(px, py, pz);
      mb.vertex(x * 16 + px, y * 16 + py, z * 16 + pz, u, v, layers[f], sky, blk, 255, flags, f);
    }
  }
}

function emitCross(mb, x, y, z, layer, light, sway) {
  const sky = (light >> 4) * 16, blk = (light & 15) * 16;
  const X = x * 16, Y = y * 16, Z = z * 16;
  const planes = [
    [[2, 2], [14, 14]],
    [[2, 14], [14, 2]],
  ];
  for (const [[ax, az], [bx, bz]] of planes) {
    const quad = [
      [ax, 0, az, 0, 16], [bx, 0, bz, 16, 16], [bx, 16, bz, 16, 0], [ax, 16, az, 0, 0],
    ];
    for (const order of [[0, 1, 2, 3], [1, 0, 3, 2]]) {
      for (const i of order) {
        const q = quad[i];
        mb.vertex(X + q[0], Y + q[1], Z + q[2], q[3], q[4], layer, sky, blk, 255, q[1] && sway ? FLAG_SWAY : 0, NORMAL_PLANT);
      }
    }
  }
}

// Partial blocks: faces on the cell boundary are hidden against opaque
// neighbours and lit by the neighbouring cell; interior faces use the
// block's own light.
function onBoundary(box, f) {
  switch (f) {
    case 0: return box[3] === 16;
    case 1: return box[0] === 0;
    case 2: return box[4] === 16;
    case 3: return box[1] === 0;
    case 4: return box[5] === 16;
    default: return box[2] === 0;
  }
}

function emitBoxesCulled(mb, x, y, z, pc, boxes, layers, flags = 0) {
  for (const box of boxes) {
    for (let f = 0; f < 6; f++) {
      const edge = onBoundary(box, f);
      const npc = pc + FACES[f].delta;
      if (edge && IS_OPAQUE[padBlocks[npc]]) continue;
      const l = edge ? padLight[npc] : padLight[pc];
      emitBox(mb, x, y, z, box, layers, (l >> 4) * 16, (l & 15) * 16, 1 << f, null, null, flags);
    }
  }
}

const LANTERN_BOXES = [[5, 0, 5, 11, 7, 11], [6, 7, 6, 10, 9, 10]];
const HANGING_LANTERN_BOXES = [[5, 1, 5, 11, 8, 11], [6, 8, 6, 10, 10, 10], [7, 10, 7, 9, 16, 9]];
const FENCE_POST = [6, 0, 6, 10, 16, 10];
const FENCE_ARMS = [
  [[10, 6, 7, 16, 9, 9], [10, 12, 7, 16, 15, 9]],
  [[0, 6, 7, 6, 9, 9], [0, 12, 7, 6, 15, 9]],
  null, null,
  [[7, 6, 10, 9, 9, 16], [7, 12, 10, 9, 15, 16]],
  [[7, 6, 0, 9, 9, 6], [7, 12, 0, 9, 15, 6]],
];
const CHEST_BOX = [1, 0, 1, 15, 14, 15];

function fenceConnects(nid) {
  return nid === B.OAK_FENCE || (IS_OPAQUE[nid] && IS_SOLID[nid]);
}

// '#'-shaped crop planes, sunk 1px into the farmland below.
function emitCrop(mb, x, y, z, layer, light) {
  const sky = (light >> 4) * 16, blk = (light & 15) * 16;
  const X = x * 16, Y = y * 16 - 1, Z = z * 16;
  const planes = [
    [[4, 0], [4, 16]], [[12, 0], [12, 16]],
    [[0, 4], [16, 4]], [[0, 12], [16, 12]],
  ];
  for (const [[ax, az], [bx, bz]] of planes) {
    const quad = [[ax, 0, az, 0, 16], [bx, 0, bz, 16, 16], [bx, 16, bz, 16, 0], [ax, 16, az, 0, 0]];
    for (const order of [[0, 1, 2, 3], [1, 0, 3, 2]]) {
      for (const i of order) {
        const q = quad[i];
        mb.vertex(X + q[0], Y + q[1], Z + q[2], q[3], q[4], layer, sky, blk, 255, q[1] ? FLAG_SWAY : 0, NORMAL_PLANT);
      }
    }
  }
}

const TORCH_BOX = [7, 0, 7, 9, 10, 9];
// Makes the torch top show the flame pixels (texture rows 6-7).
const TORCH_UV = [null, null, (u, v) => [u, v - 1], null, null, null];
const WALL_TORCH_TRANSFORMS = {
  [B.WALL_TORCH_PX]: (px, py, pz) => [px - 7 + 0.4 * py, py + 3, pz],
  [B.WALL_TORCH_NX]: (px, py, pz) => [16 - (px - 7 + 0.4 * py), py + 3, 16 - pz],
  [B.WALL_TORCH_PZ]: (px, py, pz) => [16 - pz, py + 3, px - 7 + 0.4 * py],
  [B.WALL_TORCH_NZ]: (px, py, pz) => [pz, py + 3, 16 - (px - 7 + 0.4 * py)],
};

// Builds the meshes for one chunk. Returns { solid, water } vertex data.
export function buildChunkMesh(world, chunk) {
  initLayers();
  gatherPadded(world, chunk);
  solid.reset();
  liquid.reset();
  let maxY = 0;
  for (let i = 0; i < chunk.heightmap.length; i++) maxY = Math.max(maxY, chunk.heightmap[i]);
  maxY = Math.min(CHUNK_HEIGHT - 1, maxY);

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let pc = pidx(0, y, z);
      for (let x = 0; x < CHUNK_SIZE; x++, pc++) {
        const id = padBlocks[pc];
        if (id === B.AIR) continue;
        const block = BLOCKS[id];
        const layerBase = id * 6;
        const ci = ((z << 4) | x) * 2;
        solid.temp = liquid.temp = chunk.climate[ci];
        solid.humid = liquid.humid = chunk.climate[ci + 1];
        const allFlags = BLOCK_FLAGS[id];
        switch (block.shape) {
          case 'cube': {
            for (let f = 0; f < 6; f++) {
              const nid = padBlocks[pc + FACES[f].delta];
              if (shouldDrawFace(id, nid)) emitCubeFace(solid, f, x, y, z, pc, faceLayers[layerBase + f], 16, 0, allFlags);
            }
            break;
          }
          case 'liquid': {
            const mb = block.translucent ? liquid : solid;
            const aboveSame = padBlocks[pc + FACES[2].delta] === id;
            const top = aboveSame ? 16 : 14;
            for (let f = 0; f < 6; f++) {
              const nid = padBlocks[pc + FACES[f].delta];
              if (nid === id || IS_OPAQUE[nid]) continue;
              if (f === 2 && aboveSame) continue;
              emitCubeFace(mb, f, x, y, z, pc, faceLayers[layerBase + f], top, aboveSame ? 0 : FLAG_WAVE, allFlags);
            }
            break;
          }
          case 'cross': {
            const sway = id === B.TALL_GRASS || id === B.DANDELION || id === B.POPPY;
            emitCross(solid, x, y, z, faceLayers[layerBase], padLight[pc], sway);
            break;
          }
          case 'torch': {
            const l = padLight[pc];
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            emitBox(solid, x, y, z, TORCH_BOX, layers, (l >> 4) * 16, (l & 15) * 16, 63 & ~(1 << 3), WALL_TORCH_TRANSFORMS[id] || null, TORCH_UV, allFlags);
            break;
          }
          case 'lantern': {
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            emitBoxesCulled(solid, x, y, z, pc, id === B.HANGING_LANTERN ? HANGING_LANTERN_BOXES : LANTERN_BOXES, layers, allFlags);
            break;
          }
          case 'fence': {
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            const boxes = [FENCE_POST];
            for (const f of [0, 1, 4, 5]) {
              if (fenceConnects(padBlocks[pc + FACES[f].delta])) boxes.push(...FENCE_ARMS[f]);
            }
            emitBoxesCulled(solid, x, y, z, pc, boxes, layers, allFlags);
            break;
          }
          case 'stairs':
          case 'slab': {
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            emitBoxesCulled(solid, x, y, z, pc, block.boxes, layers, allFlags);
            break;
          }
          case 'box': {
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            emitBoxesCulled(solid, x, y, z, pc, [block.box], layers, allFlags);
            break;
          }
          case 'chest': {
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            emitBoxesCulled(solid, x, y, z, pc, [CHEST_BOX], layers, allFlags);
            break;
          }
          case 'crop': {
            emitCrop(solid, x, y, z, faceLayers[layerBase], padLight[pc]);
            break;
          }
          case 'cactus': {
            let mask = 0b110011; // sides always (they are inset)
            if (shouldDrawFace(id, padBlocks[pc + FACES[2].delta]) && padBlocks[pc + FACES[2].delta] !== id) mask |= 1 << 2;
            if (shouldDrawFace(id, padBlocks[pc + FACES[3].delta]) && padBlocks[pc + FACES[3].delta] !== id) mask |= 1 << 3;
            const l = padLight[pc];
            const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[layerBase + f]);
            emitBox(solid, x, y, z, [1, 0, 1, 15, 16, 15], layers, (l >> 4) * 16, (l & 15) * 16, mask);
            break;
          }
        }
      }
    }
  }
  return {
    solid: solid.result(),
    solidQuads: solid.quads,
    water: liquid.result(),
    waterQuads: liquid.quads,
  };
}

// Mesh for a single block (held item, crack overlay), lit uniformly.
export function buildBlockMesh(id, sky = 240, blk = 0) {
  initLayers();
  const mb = new MeshBuilder(64);
  const block = BLOCKS[id];
  const layers = [0, 1, 2, 3, 4, 5].map((f) => faceLayers[id * 6 + f]);
  if (block.shape === 'cross') {
    emitCross(mb, 0, 0, 0, layers[0], (sky >> 4 << 4) | (blk >> 4), false);
  } else if (block.shape === 'torch') {
    emitBox(mb, 0, 0, 0, TORCH_BOX, layers, sky, blk, 63, null, TORCH_UV);
  } else if (block.shape === 'cactus') {
    emitBox(mb, 0, 0, 0, [1, 0, 1, 15, 16, 15], layers, sky, blk);
  } else if (block.shape === 'chest') {
    emitBox(mb, 0, 0, 0, CHEST_BOX, layers, sky, blk);
  } else if (block.boxes) {
    for (const box of block.boxes) emitBox(mb, 0, 0, 0, box, layers, sky, blk);
  } else if (block.box) {
    emitBox(mb, 0, 0, 0, block.box, layers, sky, blk);
  } else {
    emitBox(mb, 0, 0, 0, [0, 0, 0, 16, 16, 16], layers, sky, blk);
  }
  return { data: mb.result(), quads: mb.quads };
}

// A cube using one texture layer on all faces (crack overlay).
export function buildOverlayCube(layer, box = [0, 0, 0, 16, 16, 16]) {
  initLayers();
  const mb = new MeshBuilder(32);
  emitBox(mb, 0, 0, 0, box, [layer, layer, layer, layer, layer, layer], 240, 240);
  return { data: mb.result(), quads: mb.quads };
}

// A flat, double-sided sprite quad (held non-block items).
export function buildSpriteMesh(layer) {
  const mb = new MeshBuilder(8);
  const quad = [[0, 0, 0, 16], [16, 0, 16, 16], [16, 16, 16, 0], [0, 16, 0, 0]];
  for (const [order, normal] of [[[0, 1, 2, 3], 4], [[1, 0, 3, 2], 5]]) {
    for (const i of order) {
      const q = quad[i];
      mb.vertex(q[0], q[1], 8, q[2], q[3], layer, 240, 0, 255, 0, normal);
    }
  }
  return { data: mb.result(), quads: mb.quads };
}

// The texture layer name that shows an item as a flat sprite.
export function itemSpriteName(id) {
  if (isBlockItem(id)) return BLOCKS[id].itemTexture || BLOCKS[id].faces[0];
  return `item_${ITEMS.get(id).name}`;
}

// An item sprite with real thickness (one pixel), like held and dropped
// items: front and back faces cut out by the alpha test, plus a side face for
// every pixel edge that borders transparency. UVs are in half texels so the
// sides can sample pixel centres; draw with uUVScale = 1/32.
export function buildExtrudedSprite(name) {
  const tex = generateTextures();
  const layer = tex.index.get(name);
  const px = tex.pixels.subarray(layer * 1024, layer * 1024 + 1024);
  const solidAt = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && px[(y * 16 + x) * 4 + 3] >= 128;
  const mb = new MeshBuilder(256);
  const z0 = 7, z1 = 8;
  const quad = (verts, u, v, normal) => {
    for (const [x, y, z, uu = u, vv = v] of verts) mb.vertex(x, y, z, uu, vv, layer, 240, 0, 255, 0, normal);
  };
  quad([[0, 0, z1, 0, 32], [16, 0, z1, 32, 32], [16, 16, z1, 32, 0], [0, 16, z1, 0, 0]], 0, 0, 4);
  quad([[16, 0, z0, 32, 32], [0, 0, z0, 0, 32], [0, 16, z0, 0, 0], [16, 16, z0, 32, 0]], 0, 0, 5);
  for (let py = 0; py < 16; py++) {
    for (let x = 0; x < 16; x++) {
      if (!solidAt(x, py)) continue;
      const y0 = 15 - py, y1 = 16 - py;
      const u = x * 2 + 1, v = py * 2 + 1;
      if (!solidAt(x - 1, py)) quad([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], u, v, 1);
      if (!solidAt(x + 1, py)) quad([[x + 1, y0, z1], [x + 1, y0, z0], [x + 1, y1, z0], [x + 1, y1, z1]], u, v, 0);
      if (!solidAt(x, py - 1)) quad([[x, y1, z1], [x + 1, y1, z1], [x + 1, y1, z0], [x, y1, z0]], u, v, 2);
      if (!solidAt(x, py + 1)) quad([[x, y0, z0], [x + 1, y0, z0], [x + 1, y0, z1], [x, y0, z1]], u, v, 3);
    }
  }
  return { data: mb.result(), quads: mb.quads, uvScale: 1 / 32 };
}
