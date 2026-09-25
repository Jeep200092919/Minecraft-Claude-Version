// Block and item registry.
//
// Block ids are stored in Uint8Arrays, so every block has an id < 256.
// Non-block items (tools, materials) use ids >= 256.

// Face indices used everywhere (mesher, raycast, textures).
export const FACE_PX = 0;
export const FACE_NX = 1;
export const FACE_PY = 2;
export const FACE_NY = 3;
export const FACE_PZ = 4;
export const FACE_NZ = 5;

export const B = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  BEDROCK: 6,
  SAND: 7,
  GRAVEL: 8,
  LOG: 9,
  LEAVES: 10,
  GLASS: 11,
  WATER: 12,
  LAVA: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GOLD_ORE: 16,
  DIAMOND_ORE: 17,
  SNOW: 18,
  SNOWY_GRASS: 19,
  CACTUS: 20,
  SANDSTONE: 21,
  BIRCH_LOG: 22,
  BIRCH_LEAVES: 23,
  SPRUCE_LOG: 24,
  SPRUCE_LEAVES: 25,
  TALL_GRASS: 26,
  DANDELION: 27,
  POPPY: 28,
  DEAD_BUSH: 29,
  TORCH: 30,
  WALL_TORCH_PX: 31, // attached to the block at -X, leaning towards +X
  WALL_TORCH_NX: 32,
  WALL_TORCH_PZ: 33,
  WALL_TORCH_NZ: 34,
  CRAFTING_TABLE: 35,
  BRICKS: 36,
  BOOKSHELF: 37,
  GLOWSTONE: 38,
  STONE_BRICKS: 39,
  WHITE_WOOL: 40,
  RED_WOOL: 41,
  YELLOW_WOOL: 42,
  GREEN_WOOL: 43,
  BLUE_WOOL: 44,
  BLACK_WOOL: 45,
  COAL_BLOCK: 46,
  IRON_BLOCK: 47,
  GOLD_BLOCK: 48,
  DIAMOND_BLOCK: 49,
  OBSIDIAN: 50,
};

export const I = {
  STICK: 256,
  COAL: 257,
  IRON_INGOT: 258,
  GOLD_INGOT: 259,
  DIAMOND: 260,
  WOODEN_PICKAXE: 261,
  WOODEN_AXE: 262,
  WOODEN_SHOVEL: 263,
  STONE_PICKAXE: 264,
  STONE_AXE: 265,
  STONE_SHOVEL: 266,
  IRON_PICKAXE: 267,
  IRON_AXE: 268,
  IRON_SHOVEL: 269,
  DIAMOND_PICKAXE: 270,
  DIAMOND_AXE: 271,
  DIAMOND_SHOVEL: 272,
};

const DEFAULT_BLOCK = {
  shape: 'cube', // cube | cross | torch | liquid | cactus | none
  solid: true, // collides with the player
  opaque: true, // blocks light and hides neighbouring faces
  translucent: false, // rendered in the blended (water) pass
  lightEmit: 0,
  lightOpacity: 0, // extra light attenuation for non-opaque blocks
  hardness: 1,
  tool: null, // pickaxe | axe | shovel
  harvestTier: 0, // minimum tool tier needed for the block to drop anything
  drop: undefined, // item id, null for no drop; undefined = drops itself
  dropChance: 1,
  sound: 'stone',
  replaceable: false, // placing a block into it replaces it (tall grass...)
  support: null, // 'ground' (plants), 'torch'
  falls: false,
  cullSame: false, // hide faces between two blocks of this type (glass)
  liquid: false,
  creative: true, // listed in the creative palette
  targetable: true,
  selectionBox: null, // [minX,minY,minZ,maxX,maxY,maxZ] for non-cube shapes
  emissive: false, // bright pixels glow with shaders on
  waving: false, // rustles in the wind with shaders on
};

export const BLOCKS = [];

function def(id, name, displayName, tex, opts = {}) {
  let faces;
  if (typeof tex === 'string') faces = [tex, tex, tex, tex, tex, tex];
  else if (tex) {
    const side = tex.side;
    faces = [
      tex.px || side, tex.nx || side,
      tex.top, tex.bottom || tex.top,
      tex.pz || side, tex.nz || side,
    ];
  } else faces = null;
  BLOCKS[id] = { ...DEFAULT_BLOCK, id, name, displayName, faces, ...opts };
}

const plant = { shape: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'ground', selectionBox: [0.2, 0, 0.2, 0.8, 0.8, 0.8] };
const torch = { shape: 'torch', solid: false, opaque: false, hardness: 0, sound: 'wood', lightEmit: 14, support: 'torch', drop: B.TORCH, emissive: true };
const leaves = { opaque: false, hardness: 0.2, sound: 'grass', lightOpacity: 1, tool: 'axe', drop: I.STICK, dropChance: 0.06, waving: true };
const wool = { hardness: 0.8, sound: 'wool' };
const metal = { hardness: 5, tool: 'pickaxe', harvestTier: 1, sound: 'stone' };

def(B.AIR, 'air', 'Air', null, { shape: 'none', solid: false, opaque: false, hardness: 0, replaceable: true, targetable: false, creative: false });
def(B.STONE, 'stone', 'Stone', 'stone', { hardness: 1.5, tool: 'pickaxe', harvestTier: 1, drop: B.COBBLESTONE });
def(B.GRASS, 'grass', 'Grass Block', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, { hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'grass' });
def(B.DIRT, 'dirt', 'Dirt', 'dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def(B.COBBLESTONE, 'cobblestone', 'Cobblestone', 'cobblestone', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.PLANKS, 'planks', 'Oak Planks', 'planks', { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BEDROCK, 'bedrock', 'Bedrock', 'bedrock', { hardness: -1 });
def(B.SAND, 'sand', 'Sand', 'sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', falls: true });
def(B.GRAVEL, 'gravel', 'Gravel', 'gravel', { hardness: 0.6, tool: 'shovel', sound: 'gravel', falls: true });
def(B.LOG, 'log', 'Oak Log', { top: 'log_top', side: 'log_side' }, { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.LEAVES, 'leaves', 'Oak Leaves', 'leaves', leaves);
def(B.GLASS, 'glass', 'Glass', 'glass', { opaque: false, hardness: 0.3, sound: 'glass', drop: null, cullSame: true });
def(B.WATER, 'water', 'Water', 'water', {
  shape: 'liquid', solid: false, opaque: false, translucent: true, liquid: true, hardness: -1,
  lightOpacity: 1, replaceable: true, targetable: false, creative: false,
});
def(B.LAVA, 'lava', 'Lava', 'lava', {
  shape: 'liquid', solid: false, opaque: false, liquid: true, hardness: -1, lightEmit: 15,
  replaceable: true, targetable: false, creative: false, emissive: true,
});
def(B.COAL_ORE, 'coal_ore', 'Coal Ore', 'coal_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 1, drop: I.COAL });
def(B.IRON_ORE, 'iron_ore', 'Iron Ore', 'iron_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 2 });
def(B.GOLD_ORE, 'gold_ore', 'Gold Ore', 'gold_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 3 });
def(B.DIAMOND_ORE, 'diamond_ore', 'Diamond Ore', 'diamond_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 3, drop: I.DIAMOND });
def(B.SNOW, 'snow', 'Snow Block', 'snow', { hardness: 0.2, tool: 'shovel', sound: 'snow' });
def(B.SNOWY_GRASS, 'snowy_grass', 'Snowy Grass Block', { top: 'snow', bottom: 'dirt', side: 'snowy_grass_side' }, { hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'snow' });
def(B.CACTUS, 'cactus', 'Cactus', { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, {
  shape: 'cactus', opaque: false, hardness: 0.4, sound: 'wool', support: 'cactus',
  selectionBox: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16],
});
def(B.SANDSTONE, 'sandstone', 'Sandstone', { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' }, { hardness: 0.8, tool: 'pickaxe', harvestTier: 1 });
def(B.BIRCH_LOG, 'birch_log', 'Birch Log', { top: 'birch_log_top', side: 'birch_log_side' }, { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BIRCH_LEAVES, 'birch_leaves', 'Birch Leaves', 'birch_leaves', leaves);
def(B.SPRUCE_LOG, 'spruce_log', 'Spruce Log', { top: 'spruce_log_top', side: 'spruce_log_side' }, { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.SPRUCE_LEAVES, 'spruce_leaves', 'Spruce Leaves', 'spruce_leaves', leaves);
def(B.TALL_GRASS, 'tall_grass', 'Grass', 'tall_grass', { ...plant, replaceable: true, drop: null });
def(B.DANDELION, 'dandelion', 'Dandelion', 'dandelion', plant);
def(B.POPPY, 'poppy', 'Poppy', 'poppy', plant);
def(B.DEAD_BUSH, 'dead_bush', 'Dead Bush', 'dead_bush', { ...plant, replaceable: true, drop: I.STICK, dropChance: 0.5 });
def(B.TORCH, 'torch', 'Torch', 'torch', { ...torch, selectionBox: [6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16] });
def(B.WALL_TORCH_PX, 'wall_torch_px', 'Torch', 'torch', { ...torch, creative: false, attach: [-1, 0, 0], selectionBox: [0, 3 / 16, 5 / 16, 5 / 16, 13 / 16, 11 / 16] });
def(B.WALL_TORCH_NX, 'wall_torch_nx', 'Torch', 'torch', { ...torch, creative: false, attach: [1, 0, 0], selectionBox: [11 / 16, 3 / 16, 5 / 16, 1, 13 / 16, 11 / 16] });
def(B.WALL_TORCH_PZ, 'wall_torch_pz', 'Torch', 'torch', { ...torch, creative: false, attach: [0, 0, -1], selectionBox: [5 / 16, 3 / 16, 0, 11 / 16, 13 / 16, 5 / 16] });
def(B.WALL_TORCH_NZ, 'wall_torch_nz', 'Torch', 'torch', { ...torch, creative: false, attach: [0, 0, 1], selectionBox: [5 / 16, 3 / 16, 11 / 16, 11 / 16, 13 / 16, 1] });
BLOCKS[B.TORCH].attach = [0, -1, 0];
def(B.CRAFTING_TABLE, 'crafting_table', 'Crafting Table', { top: 'crafting_table_top', bottom: 'planks', side: 'crafting_table_side', pz: 'crafting_table_front', nz: 'crafting_table_front' }, { hardness: 2.5, tool: 'axe', sound: 'wood' });
def(B.BRICKS, 'bricks', 'Bricks', 'bricks', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.BOOKSHELF, 'bookshelf', 'Bookshelf', { top: 'planks', side: 'bookshelf' }, { hardness: 1.5, tool: 'axe', sound: 'wood' });
def(B.GLOWSTONE, 'glowstone', 'Glowstone', 'glowstone', { hardness: 0.3, sound: 'glass', lightEmit: 15, emissive: true });
def(B.STONE_BRICKS, 'stone_bricks', 'Stone Bricks', 'stone_bricks', { hardness: 1.5, tool: 'pickaxe', harvestTier: 1 });
def(B.WHITE_WOOL, 'white_wool', 'White Wool', 'white_wool', wool);
def(B.RED_WOOL, 'red_wool', 'Red Wool', 'red_wool', wool);
def(B.YELLOW_WOOL, 'yellow_wool', 'Yellow Wool', 'yellow_wool', wool);
def(B.GREEN_WOOL, 'green_wool', 'Green Wool', 'green_wool', wool);
def(B.BLUE_WOOL, 'blue_wool', 'Blue Wool', 'blue_wool', wool);
def(B.BLACK_WOOL, 'black_wool', 'Black Wool', 'black_wool', wool);
def(B.COAL_BLOCK, 'coal_block', 'Block of Coal', 'coal_block', metal);
def(B.IRON_BLOCK, 'iron_block', 'Block of Iron', 'iron_block', { ...metal, harvestTier: 2 });
def(B.GOLD_BLOCK, 'gold_block', 'Block of Gold', 'gold_block', { ...metal, harvestTier: 3 });
def(B.DIAMOND_BLOCK, 'diamond_block', 'Block of Diamond', 'diamond_block', { ...metal, harvestTier: 3 });
def(B.OBSIDIAN, 'obsidian', 'Obsidian', 'obsidian', { hardness: 50, tool: 'pickaxe', harvestTier: 4 });

// Fill any unused ids with inert air-like entries so lookups never fail.
for (let i = 0; i < 256; i++) {
  if (!BLOCKS[i]) BLOCKS[i] = { ...BLOCKS[B.AIR], id: i, name: `unused_${i}` };
  const b = BLOCKS[i];
  // Held in first person as a 3D block (true) or as a flat sprite (false).
  if (b.heldAsBlock === undefined) b.heldAsBlock = b.shape === 'cube' || b.shape === 'cactus';
}

// Fast per-id lookup tables used in hot loops (meshing, lighting, physics).
export const IS_OPAQUE = new Uint8Array(256);
export const IS_SOLID = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const LIGHT_ATTEN = new Uint8Array(256); // 15 means fully blocks light
for (let i = 0; i < 256; i++) {
  const b = BLOCKS[i];
  IS_OPAQUE[i] = b.opaque ? 1 : 0;
  IS_SOLID[i] = b.solid ? 1 : 0;
  LIGHT_EMIT[i] = b.lightEmit;
  LIGHT_ATTEN[i] = b.opaque ? 15 : 1 + b.lightOpacity;
}

// ---------------------------------------------------------------------------
// Items

const TOOL_TIERS = [
  { key: 'wooden', name: 'Wooden', tier: 1, speed: 2, material: B.PLANKS },
  { key: 'stone', name: 'Stone', tier: 2, speed: 4, material: B.COBBLESTONE },
  { key: 'iron', name: 'Iron', tier: 3, speed: 6, material: I.IRON_INGOT },
  { key: 'diamond', name: 'Diamond', tier: 4, speed: 8, material: I.DIAMOND },
];

export const ITEMS = new Map();

function item(id, name, displayName, opts = {}) {
  ITEMS.set(id, { id, name, displayName, maxStack: 64, block: null, tool: null, creative: true, ...opts });
}

for (let i = 1; i < 256; i++) {
  const b = BLOCKS[i];
  if (!b.name.startsWith('unused_')) {
    item(i, b.name, b.displayName, { block: i, creative: b.creative });
  }
}
item(I.STICK, 'stick', 'Stick');
item(I.COAL, 'coal', 'Coal');
item(I.IRON_INGOT, 'iron_ingot', 'Iron Ingot');
item(I.GOLD_INGOT, 'gold_ingot', 'Gold Ingot');
item(I.DIAMOND, 'diamond', 'Diamond');
for (const tier of TOOL_TIERS) {
  for (const type of ['pickaxe', 'axe', 'shovel']) {
    const id = I[`${tier.key.toUpperCase()}_${type.toUpperCase()}`];
    const label = type[0].toUpperCase() + type.slice(1);
    item(id, `${tier.key}_${type}`, `${tier.name} ${label}`, {
      maxStack: 1,
      tool: { type, tier: tier.tier, speed: tier.speed, tierKey: tier.key },
    });
  }
}

export function getItem(id) {
  return ITEMS.get(id);
}

export function isBlockItem(id) {
  return id > 0 && id < 256;
}

// Seconds needed to break a block with the given held item (Minecraft formula).
export function breakTime(blockId, heldItemId) {
  const block = BLOCKS[blockId];
  if (block.hardness < 0) return Infinity;
  if (block.hardness === 0) return 0;
  const tool = heldItemId ? ITEMS.get(heldItemId)?.tool : null;
  const rightTool = tool && block.tool === tool.type;
  const canHarvest = block.harvestTier === 0 || (rightTool && tool.tier >= block.harvestTier);
  const speed = rightTool ? tool.speed : 1;
  return (block.hardness * (canHarvest ? 1.5 : 5)) / speed;
}

// What a broken block yields, or null.
export function blockDrop(blockId, heldItemId, random = Math.random) {
  const block = BLOCKS[blockId];
  const tool = heldItemId ? ITEMS.get(heldItemId)?.tool : null;
  if (block.harvestTier > 0) {
    if (!tool || tool.type !== block.tool || tool.tier < block.harvestTier) return null;
  }
  const drop = block.drop === undefined ? blockId : block.drop;
  if (drop === null) return null;
  if (block.dropChance < 1 && random() >= block.dropChance) return null;
  return drop;
}

export const CREATIVE_ITEMS = [...ITEMS.values()].filter((it) => it.creative).map((it) => it.id);

// ---------------------------------------------------------------------------
// Crafting recipes. Shaped recipes use a pattern of rows; spaces are empty.
// "Smelting" is simplified into shapeless recipes that consume coal.

export const RECIPES = [];

function shaped(pattern, key, result, count = 1) {
  RECIPES.push({ type: 'shaped', pattern, key, result, count });
}
function shapeless(ingredients, result, count = 1) {
  RECIPES.push({ type: 'shapeless', ingredients, result, count });
}

shapeless([B.LOG], B.PLANKS, 4);
shapeless([B.BIRCH_LOG], B.PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.PLANKS, 4);
shaped(['P', 'P'], { P: B.PLANKS }, I.STICK, 4);
shaped(['PP', 'PP'], { P: B.PLANKS }, B.CRAFTING_TABLE);
shaped(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE);
shaped(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
for (const tier of TOOL_TIERS) {
  const M = tier.material;
  const id = (type) => I[`${tier.key.toUpperCase()}_${type}`];
  shaped(['MMM', ' S ', ' S '], { M, S: I.STICK }, id('PICKAXE'));
  shaped(['MM', 'MS', ' S'], { M, S: I.STICK }, id('AXE'));
  shaped(['M', 'S', 'S'], { M, S: I.STICK }, id('SHOVEL'));
}
const STORAGE = [
  [I.COAL, B.COAL_BLOCK],
  [I.IRON_INGOT, B.IRON_BLOCK],
  [I.GOLD_INGOT, B.GOLD_BLOCK],
  [I.DIAMOND, B.DIAMOND_BLOCK],
];
for (const [material, blockId] of STORAGE) {
  shaped(['MMM', 'MMM', 'MMM'], { M: material }, blockId);
  shapeless([blockId], material, 9);
}
// Simplified smelting (there is no furnace): input + fuel in the crafting grid.
shapeless([B.IRON_ORE, I.COAL], I.IRON_INGOT);
shapeless([B.GOLD_ORE, I.COAL], I.GOLD_INGOT);
shapeless([B.SAND, I.COAL], B.GLASS);
shapeless([B.COBBLESTONE, I.COAL], B.STONE);
// "Charcoal": a log burned with planks as fuel yields coal.
shapeless([B.LOG, B.PLANKS], I.COAL);
shapeless([B.BIRCH_LOG, B.PLANKS], I.COAL);
shapeless([B.SPRUCE_LOG, B.PLANKS], I.COAL);
