// Block and item registry.
//
// Block ids are stored in Uint8Arrays, so every block has an id < 256.
// Non-block items (tools, food, materials) use ids >= 256.
// Orientable blocks (furnaces, chests, stairs) use one id per facing.

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
  LANTERN: 51,
  HANGING_LANTERN: 52,
  OAK_FENCE: 53,
  MOSSY_COBBLESTONE: 54,
  CORNFLOWER: 55,
  OXEYE_DAISY: 56,
  FURNACE_PX: 57, // front facing +X
  FURNACE_NX: 58,
  FURNACE_PZ: 59,
  FURNACE_NZ: 60,
  FURNACE_LIT_PX: 61,
  FURNACE_LIT_NX: 62,
  FURNACE_LIT_PZ: 63,
  FURNACE_LIT_NZ: 64,
  CHEST_PX: 65,
  CHEST_NX: 66,
  CHEST_PZ: 67,
  CHEST_NZ: 68,
  FARMLAND: 69,
  WHEAT_0: 70,
  WHEAT_1: 71,
  WHEAT_2: 72,
  WHEAT_3: 73,
  TNT: 74,
  OAK_STAIRS_PX: 75, // the tall back half is on the +X side
  OAK_STAIRS_NX: 76,
  OAK_STAIRS_PZ: 77,
  OAK_STAIRS_NZ: 78,
  COBBLE_STAIRS_PX: 79,
  COBBLE_STAIRS_NX: 80,
  COBBLE_STAIRS_PZ: 81,
  COBBLE_STAIRS_NZ: 82,
  OAK_SLAB: 83,
  COBBLE_SLAB: 84,
  STONE_SLAB: 85,
  DIRT_PATH: 86,
};
// Inventory items for orientable blocks.
B.FURNACE = B.FURNACE_PZ;
B.CHEST = B.CHEST_PZ;
B.OAK_STAIRS = B.OAK_STAIRS_PZ;
B.COBBLE_STAIRS = B.COBBLE_STAIRS_PZ;

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
  WOODEN_SWORD: 273,
  STONE_SWORD: 274,
  IRON_SWORD: 275,
  DIAMOND_SWORD: 276,
  WOODEN_HOE: 277,
  STONE_HOE: 278,
  IRON_HOE: 279,
  DIAMOND_HOE: 280,
  WHEAT_SEEDS: 281,
  WHEAT: 282,
  BREAD: 283,
  APPLE: 284,
  RAW_PORKCHOP: 285,
  COOKED_PORKCHOP: 286,
  RAW_BEEF: 287,
  STEAK: 288,
  RAW_CHICKEN: 289,
  COOKED_CHICKEN: 290,
  RAW_MUTTON: 291,
  COOKED_MUTTON: 292,
  ROTTEN_FLESH: 293,
  LEATHER: 294,
  FEATHER: 295,
  GUNPOWDER: 296,
  FLINT: 297,
  FLINT_AND_STEEL: 298,
  PIG_SPAWN_EGG: 299,
  COW_SPAWN_EGG: 300,
  SHEEP_SPAWN_EGG: 301,
  CHICKEN_SPAWN_EGG: 302,
  ZOMBIE_SPAWN_EGG: 303,
  CREEPER_SPAWN_EGG: 304,
  VILLAGER_SPAWN_EGG: 305,
};

const DEFAULT_BLOCK = {
  shape: 'cube', // cube | cross | torch | liquid | cactus | lantern | fence | stairs | slab | box | crop | chest | none
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
  support: null, // 'ground', 'torch', 'cactus', 'lantern', 'hanging', 'farmland'
  falls: false,
  cullSame: false, // hide faces between two blocks of this type (glass)
  liquid: false,
  creative: true, // listed in the creative palette
  targetable: true,
  selectionBox: null, // [minX,minY,minZ,maxX,maxY,maxZ] for non-cube shapes
  collision: undefined, // list of boxes; undefined = full cube when solid
  emissive: false, // bright pixels glow with shaders on
  waving: false, // rustles in the wind with shaders on
  facing: -1, // 0..3 = +X, -X, +Z, -Z for orientable blocks
  baseId: undefined, // the inventory item of an orientable block
  container: null, // 'chest' | 'furnace'
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
const FACINGS = ['px', 'nx', 'pz', 'nz'];
export const FACING_FACE = [FACE_PX, FACE_NX, FACE_PZ, FACE_NZ];

def(B.AIR, 'air', 'Air', null, { shape: 'none', solid: false, opaque: false, hardness: 0, replaceable: true, targetable: false, creative: false });
def(B.STONE, 'stone', 'Stone', 'stone', { hardness: 1.5, tool: 'pickaxe', harvestTier: 1, drop: B.COBBLESTONE });
def(B.GRASS, 'grass', 'Grass Block', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, { hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'grass' });
def(B.DIRT, 'dirt', 'Dirt', 'dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def(B.COBBLESTONE, 'cobblestone', 'Cobblestone', 'cobblestone', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.PLANKS, 'planks', 'Oak Planks', 'planks', { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BEDROCK, 'bedrock', 'Bedrock', 'bedrock', { hardness: -1 });
def(B.SAND, 'sand', 'Sand', 'sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', falls: true });
def(B.GRAVEL, 'gravel', 'Gravel', 'gravel', { hardness: 0.6, tool: 'shovel', sound: 'gravel', falls: true, drop: B.GRAVEL, altDrop: [I.FLINT, 0.1] });
def(B.LOG, 'log', 'Oak Log', { top: 'log_top', side: 'log_side' }, { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.LEAVES, 'leaves', 'Oak Leaves', 'leaves', { ...leaves, altDrop: [I.APPLE, 0.03] });
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
def(B.TALL_GRASS, 'tall_grass', 'Grass', 'tall_grass', { ...plant, replaceable: true, drop: I.WHEAT_SEEDS, dropChance: 0.125 });
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

const lantern = {
  shape: 'lantern', solid: false, opaque: false, hardness: 3.5, tool: 'pickaxe', lightEmit: 15,
  emissive: true, itemTexture: 'lantern_item', drop: B.LANTERN,
};
def(B.LANTERN, 'lantern', 'Lantern', { top: 'lantern_top', side: 'lantern' }, { ...lantern, support: 'lantern', selectionBox: [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16] });
def(B.HANGING_LANTERN, 'hanging_lantern', 'Lantern', { top: 'lantern_top', side: 'lantern' }, { ...lantern, support: 'hanging', creative: false, selectionBox: [5 / 16, 1 / 16, 5 / 16, 11 / 16, 1, 11 / 16] });
def(B.OAK_FENCE, 'oak_fence', 'Oak Fence', 'planks', {
  shape: 'fence', opaque: false, hardness: 2, tool: 'axe', sound: 'wood', itemTexture: 'fence_item',
  selectionBox: [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16],
});
def(B.MOSSY_COBBLESTONE, 'mossy_cobblestone', 'Mossy Cobblestone', 'mossy_cobblestone', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.CORNFLOWER, 'cornflower', 'Cornflower', 'cornflower', plant);
def(B.OXEYE_DAISY, 'oxeye_daisy', 'Oxeye Daisy', 'oxeye_daisy', plant);

// Orientable blocks: one id per facing (+X, -X, +Z, -Z).
function orientable(ids, name, displayName, frontTex, otherTex, opts) {
  ids.forEach((id, f) => {
    const tex = { top: otherTex.top, bottom: otherTex.bottom || otherTex.top, side: otherTex.side, [FACINGS[f]]: frontTex };
    def(id, `${name}_${FACINGS[f]}`, displayName, tex, { ...opts, facing: f, baseId: ids[2], creative: f === 2 && opts.creative !== false });
  });
}
const furnaceTex = { top: 'furnace_top', side: 'furnace_side' };
const furnace = { hardness: 3.5, tool: 'pickaxe', harvestTier: 1, container: 'furnace' };
orientable([B.FURNACE_PX, B.FURNACE_NX, B.FURNACE_PZ, B.FURNACE_NZ], 'furnace', 'Furnace', 'furnace_front', furnaceTex, furnace);
orientable([B.FURNACE_LIT_PX, B.FURNACE_LIT_NX, B.FURNACE_LIT_PZ, B.FURNACE_LIT_NZ], 'furnace_lit', 'Furnace', 'furnace_front_on', furnaceTex,
  { ...furnace, lightEmit: 13, emissive: true, creative: false, drop: B.FURNACE });
for (const id of [B.FURNACE_LIT_PX, B.FURNACE_LIT_NX, B.FURNACE_LIT_PZ, B.FURNACE_LIT_NZ]) BLOCKS[id].baseId = B.FURNACE;
orientable([B.CHEST_PX, B.CHEST_NX, B.CHEST_PZ, B.CHEST_NZ], 'chest', 'Chest', 'chest_front', { top: 'chest_top', side: 'chest_side' }, {
  shape: 'chest', opaque: false, hardness: 2.5, tool: 'axe', sound: 'wood', container: 'chest', heldAsBlock: true,
  selectionBox: [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16], collision: [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]],
});
def(B.FARMLAND, 'farmland', 'Farmland', { top: 'farmland', side: 'dirt' }, {
  shape: 'box', box: [0, 0, 0, 16, 15, 16], opaque: false, hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: B.DIRT,
  creative: false, selectionBox: [0, 0, 0, 1, 15 / 16, 1], collision: [[0, 0, 0, 1, 15 / 16, 1]],
});
const wheatDrops = (stage) => (stage < 3 ? [[I.WHEAT_SEEDS, 1]] : [[I.WHEAT, 1], [I.WHEAT_SEEDS, 1, 3]]);
[B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3].forEach((id, stage) => {
  def(id, `wheat_${stage}`, 'Wheat Crops', `wheat_${stage}`, {
    shape: 'crop', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'farmland', creative: false,
    drops: wheatDrops(stage), crop: stage, selectionBox: [0, 0, 0, 1, (3 + stage * 4) / 16, 1],
  });
});
def(B.TNT, 'tnt', 'TNT', { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, { hardness: 0, sound: 'grass' });
const STAIR_BACK = [[8, 8, 0, 16, 16, 16], [0, 8, 0, 8, 16, 16], [0, 8, 8, 16, 16, 16], [0, 8, 0, 16, 16, 8]];
function stairs(ids, name, displayName, tex, opts) {
  ids.forEach((id, f) => {
    const back = STAIR_BACK[f];
    def(id, `${name}_${FACINGS[f]}`, displayName, tex, {
      shape: 'stairs', opaque: false, heldAsBlock: true, ...opts, facing: f, baseId: ids[2], creative: f === 2,
      boxes: [[0, 0, 0, 16, 8, 16], back],
      collision: [[0, 0, 0, 1, 0.5, 1], back.map((v) => v / 16)],
    });
  });
}
stairs([B.OAK_STAIRS_PX, B.OAK_STAIRS_NX, B.OAK_STAIRS_PZ, B.OAK_STAIRS_NZ], 'oak_stairs', 'Oak Stairs', 'planks', { hardness: 2, tool: 'axe', sound: 'wood' });
stairs([B.COBBLE_STAIRS_PX, B.COBBLE_STAIRS_NX, B.COBBLE_STAIRS_PZ, B.COBBLE_STAIRS_NZ], 'cobblestone_stairs', 'Cobblestone Stairs', 'cobblestone', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
const slab = { shape: 'slab', opaque: false, heldAsBlock: true, boxes: [[0, 0, 0, 16, 8, 16]], selectionBox: [0, 0, 0, 1, 0.5, 1], collision: [[0, 0, 0, 1, 0.5, 1]] };
def(B.OAK_SLAB, 'oak_slab', 'Oak Slab', 'planks', { ...slab, hardness: 2, tool: 'axe', sound: 'wood' });
def(B.COBBLE_SLAB, 'cobblestone_slab', 'Cobblestone Slab', 'cobblestone', { ...slab, hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.STONE_SLAB, 'stone_slab', 'Stone Slab', { top: 'stone_slab_top', side: 'stone_slab_side' }, { ...slab, hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.DIRT_PATH, 'dirt_path', 'Dirt Path', { top: 'dirt_path_top', side: 'dirt_path_side', bottom: 'dirt' }, {
  shape: 'box', box: [0, 0, 0, 16, 15, 16], opaque: false, hardness: 0.65, tool: 'shovel', sound: 'gravel', drop: B.DIRT,
  selectionBox: [0, 0, 0, 1, 15 / 16, 1], collision: [[0, 0, 0, 1, 15 / 16, 1]],
});

// Fill any unused ids with inert air-like entries so lookups never fail.
for (let i = 0; i < 256; i++) {
  if (!BLOCKS[i]) BLOCKS[i] = { ...BLOCKS[B.AIR], id: i, name: `unused_${i}` };
  const b = BLOCKS[i];
  // Held in first person as a 3D block (true) or as a flat sprite (false).
  if (b.heldAsBlock === undefined) b.heldAsBlock = b.shape === 'cube' || b.shape === 'cactus';
  if (b.collision === undefined) b.collision = b.solid ? [[0, 0, 0, 1, 1, 1]] : [];
}

// Fast per-id lookup tables used in hot loops (meshing, lighting, physics).
export const IS_OPAQUE = new Uint8Array(256);
export const IS_SOLID = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const LIGHT_ATTEN = new Uint8Array(256); // 15 means fully blocks light
export const IS_FULL_CUBE = new Uint8Array(256); // solid with a full-cube collision box
for (let i = 0; i < 256; i++) {
  const b = BLOCKS[i];
  IS_OPAQUE[i] = b.opaque ? 1 : 0;
  IS_SOLID[i] = b.solid ? 1 : 0;
  LIGHT_EMIT[i] = b.lightEmit;
  LIGHT_ATTEN[i] = b.opaque ? 15 : 1 + b.lightOpacity;
  const c = b.collision;
  IS_FULL_CUBE[i] = c.length === 1 && c[0].join() === '0,0,0,1,1,1' ? 1 : 0;
}

// The block variant for an orientable block facing `f` (0..3).
export function orientedBlock(baseId, f) {
  for (let id = 0; id < 256; id++) {
    const b = BLOCKS[id];
    if (b.baseId === baseId && b.facing === f && !b.name.startsWith('furnace_lit')) return id;
  }
  return baseId;
}

// ---------------------------------------------------------------------------
// Items

const TOOL_TIERS = [
  { key: 'wooden', name: 'Wooden', tier: 1, speed: 2, material: B.PLANKS, bonus: 0 },
  { key: 'stone', name: 'Stone', tier: 2, speed: 4, material: B.COBBLESTONE, bonus: 1 },
  { key: 'iron', name: 'Iron', tier: 3, speed: 6, material: I.IRON_INGOT, bonus: 2 },
  { key: 'diamond', name: 'Diamond', tier: 4, speed: 8, material: I.DIAMOND, bonus: 3 },
];
const BASE_DAMAGE = { sword: 5, axe: 4, pickaxe: 3, shovel: 2, hoe: 1 };

export const ITEMS = new Map();

function item(id, name, displayName, opts = {}) {
  ITEMS.set(id, { id, name, displayName, maxStack: 64, block: null, tool: null, food: null, damage: 1, creative: true, ...opts });
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
  for (const type of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) {
    const id = I[`${tier.key.toUpperCase()}_${type.toUpperCase()}`];
    const label = type[0].toUpperCase() + type.slice(1);
    item(id, `${tier.key}_${type}`, `${tier.name} ${label}`, {
      maxStack: 1,
      damage: BASE_DAMAGE[type] + tier.bonus,
      tool: { type, tier: tier.tier, speed: tier.speed, tierKey: tier.key },
    });
  }
}
const food = (hunger, saturation) => ({ food: { hunger, saturation } });
item(I.WHEAT_SEEDS, 'wheat_seeds', 'Wheat Seeds', { plants: B.WHEAT_0 });
item(I.WHEAT, 'wheat', 'Wheat');
item(I.BREAD, 'bread', 'Bread', food(5, 6));
item(I.APPLE, 'apple', 'Apple', food(4, 2.4));
item(I.RAW_PORKCHOP, 'raw_porkchop', 'Raw Porkchop', food(3, 1.8));
item(I.COOKED_PORKCHOP, 'cooked_porkchop', 'Cooked Porkchop', food(8, 12.8));
item(I.RAW_BEEF, 'raw_beef', 'Raw Beef', food(3, 1.8));
item(I.STEAK, 'steak', 'Steak', food(8, 12.8));
item(I.RAW_CHICKEN, 'raw_chicken', 'Raw Chicken', food(2, 1.2));
item(I.COOKED_CHICKEN, 'cooked_chicken', 'Cooked Chicken', food(6, 7.2));
item(I.RAW_MUTTON, 'raw_mutton', 'Raw Mutton', food(2, 1.2));
item(I.COOKED_MUTTON, 'cooked_mutton', 'Cooked Mutton', food(6, 9.6));
item(I.ROTTEN_FLESH, 'rotten_flesh', 'Rotten Flesh', food(4, 0.8));
item(I.LEATHER, 'leather', 'Leather');
item(I.FEATHER, 'feather', 'Feather');
item(I.GUNPOWDER, 'gunpowder', 'Gunpowder');
item(I.FLINT, 'flint', 'Flint');
item(I.FLINT_AND_STEEL, 'flint_and_steel', 'Flint and Steel', { maxStack: 1 });
for (const mob of ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'creeper', 'villager']) {
  const label = mob[0].toUpperCase() + mob.slice(1);
  item(I[`${mob.toUpperCase()}_SPAWN_EGG`], `${mob}_spawn_egg`, `${label} Spawn Egg`, { spawns: mob });
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
  let speed = rightTool ? tool.speed : 1;
  if (tool && tool.type === 'sword' && block.waving) speed = 1.5;
  return (block.hardness * (canHarvest ? 1.5 : 5)) / speed;
}

// What a broken block yields: a list of [itemId, count] pairs (may be empty).
export function blockDrops(blockId, heldItemId, random = Math.random) {
  const block = BLOCKS[blockId];
  const tool = heldItemId ? ITEMS.get(heldItemId)?.tool : null;
  if (block.harvestTier > 0) {
    if (!tool || tool.type !== block.tool || tool.tier < block.harvestTier) return [];
  }
  if (block.drops) {
    return block.drops
      .map(([id, min, max = min]) => [id, min + Math.floor(random() * (max - min + 1))])
      .filter(([, n]) => n > 0);
  }
  if (block.altDrop && random() < block.altDrop[1]) return [[block.altDrop[0], 1]];
  const drop = block.drop === undefined ? (block.baseId ?? blockId) : block.drop;
  if (drop === null) return [];
  if (block.dropChance < 1 && random() >= block.dropChance) return [];
  return [[drop, 1]];
}

// Backwards-compatible single-drop helper.
export function blockDrop(blockId, heldItemId, random = Math.random) {
  const d = blockDrops(blockId, heldItemId, random);
  return d.length ? d[0][0] : null;
}

export const CREATIVE_ITEMS = [...ITEMS.values()].filter((it) => it.creative).map((it) => it.id);

// ---------------------------------------------------------------------------
// Furnace: smelting results and fuel burn times (seconds).

export const SMELTING = new Map([
  [B.IRON_ORE, I.IRON_INGOT],
  [B.GOLD_ORE, I.GOLD_INGOT],
  [B.SAND, B.GLASS],
  [B.COBBLESTONE, B.STONE],
  [B.LOG, I.COAL],
  [B.BIRCH_LOG, I.COAL],
  [B.SPRUCE_LOG, I.COAL],
  [B.CACTUS, B.GREEN_WOOL],
  [I.RAW_PORKCHOP, I.COOKED_PORKCHOP],
  [I.RAW_BEEF, I.STEAK],
  [I.RAW_CHICKEN, I.COOKED_CHICKEN],
  [I.RAW_MUTTON, I.COOKED_MUTTON],
]);
export const SMELT_TIME = 10;

export function fuelTime(id) {
  if (id === I.COAL) return 80;
  if (id === B.COAL_BLOCK) return 800;
  if (id === I.STICK) return 5;
  if (id === B.LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG || id === B.PLANKS) return 15;
  if (id === B.CRAFTING_TABLE || id === B.OAK_FENCE || id === B.CHEST || id === B.BOOKSHELF) return 15;
  if (id === B.OAK_SLAB) return 7.5;
  const it = ITEMS.get(id);
  if (it?.tool && it.tool.tierKey === 'wooden') return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// Crafting recipes. Shaped recipes use a pattern of rows; spaces are empty.

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
shaped(['CCC', 'C C', 'CCC'], { C: B.COBBLESTONE }, B.FURNACE);
shaped(['PPP', 'P P', 'PPP'], { P: B.PLANKS }, B.CHEST);
shaped(['PSP', 'PSP'], { P: B.PLANKS, S: I.STICK }, B.OAK_FENCE, 3);
shaped(['P  ', 'PP ', 'PPP'], { P: B.PLANKS }, B.OAK_STAIRS, 4);
shaped(['C  ', 'CC ', 'CCC'], { C: B.COBBLESTONE }, B.COBBLE_STAIRS, 4);
shaped(['PPP'], { P: B.PLANKS }, B.OAK_SLAB, 6);
shaped(['CCC'], { C: B.COBBLESTONE }, B.COBBLE_SLAB, 6);
shaped(['SSS'], { S: B.STONE }, B.STONE_SLAB, 6);
shaped(['I', 'T'], { I: I.IRON_INGOT, T: B.TORCH }, B.LANTERN);
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
shaped(['WWW'], { W: I.WHEAT }, I.BREAD);
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL);
for (const tier of TOOL_TIERS) {
  const M = tier.material;
  const id = (type) => I[`${tier.key.toUpperCase()}_${type}`];
  shaped(['MMM', ' S ', ' S '], { M, S: I.STICK }, id('PICKAXE'));
  shaped(['MM', 'MS', ' S'], { M, S: I.STICK }, id('AXE'));
  shaped(['M', 'S', 'S'], { M, S: I.STICK }, id('SHOVEL'));
  shaped(['M', 'M', 'S'], { M, S: I.STICK }, id('SWORD'));
  shaped(['MM', ' S', ' S'], { M, S: I.STICK }, id('HOE'));
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
shapeless([B.COBBLESTONE, B.TALL_GRASS], B.MOSSY_COBBLESTONE);
