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
  GRANITE: 87,
  DIORITE: 88,
  ANDESITE: 89,
  POLISHED_GRANITE: 90,
  POLISHED_DIORITE: 91,
  POLISHED_ANDESITE: 92,
  DEEPSLATE: 93,
  COBBLED_DEEPSLATE: 94,
  DEEPSLATE_IRON_ORE: 95,
  DEEPSLATE_GOLD_ORE: 96,
  DEEPSLATE_DIAMOND_ORE: 97,
  DEEPSLATE_REDSTONE_ORE: 98,
  REDSTONE_ORE: 99,
  LAPIS_ORE: 100,
  EMERALD_ORE: 101,
  COPPER_ORE: 102,
  CLAY: 103,
  ICE: 104,
  PACKED_ICE: 105,
  SNOW_LAYER: 106,
  TERRACOTTA: 107,
  ORANGE_TERRACOTTA: 108,
  BLUE_TERRACOTTA: 109,
  CHISELED_SANDSTONE: 110,
  CUT_SANDSTONE: 111,
  SMOOTH_SANDSTONE: 112,
  SUGAR_CANE: 113,
  PUMPKIN: 114,
  JACK_O_LANTERN_PX: 115,
  JACK_O_LANTERN_NX: 116,
  JACK_O_LANTERN_PZ: 117,
  JACK_O_LANTERN_NZ: 118,
  MELON: 119,
  CARROTS_0: 120,
  CARROTS_1: 121,
  CARROTS_2: 122,
  CARROTS_3: 123,
  POTATOES_0: 124,
  POTATOES_1: 125,
  POTATOES_2: 126,
  POTATOES_3: 127,
  RED_MUSHROOM: 128,
  BROWN_MUSHROOM: 129,
  ALLIUM: 130,
  AZURE_BLUET: 131,
  RED_TULIP: 132,
  ORANGE_TULIP: 133,
  LILY_OF_THE_VALLEY: 134,
  FERN: 135,
  LILY_PAD: 136,
  OAK_SAPLING: 137,
  BIRCH_SAPLING: 138,
  SPRUCE_SAPLING: 139,
  ORANGE_WOOL: 140,
  MAGENTA_WOOL: 141,
  LIGHT_BLUE_WOOL: 142,
  LIME_WOOL: 143,
  PINK_WOOL: 144,
  GRAY_WOOL: 145,
  LIGHT_GRAY_WOOL: 146,
  CYAN_WOOL: 147,
  PURPLE_WOOL: 148,
  BROWN_WOOL: 149,
  GLASS_PANE: 150,
  IRON_BARS: 151,
  BIRCH_PLANKS: 152,
  SPRUCE_PLANKS: 153,
  MOSSY_STONE_BRICKS: 154,
  CRACKED_STONE_BRICKS: 155,
  CHISELED_STONE_BRICKS: 156,
  SMOOTH_STONE: 157,
  HAY_BALE: 158,
  PRISMARINE: 159,
  PRISMARINE_BRICKS: 160,
  DARK_PRISMARINE: 161,
  SEA_LANTERN: 162,
  NETHERRACK: 163,
  SOUL_SAND: 164,
  NETHER_BRICKS: 165,
  NETHER_QUARTZ_ORE: 166,
  MAGMA_BLOCK: 167,
  NETHER_PORTAL_X: 168, // the portal plane runs along X
  NETHER_PORTAL_Z: 169,
  CRYING_OBSIDIAN: 170,
  COBWEB: 171,
  SPAWNER: 172,
  RAIL_NS: 173,
  RAIL_EW: 174,
  LADDER_PX: 175, // attached to the block at -X
  LADDER_NX: 176,
  LADDER_PZ: 177,
  LADDER_NZ: 178,
  OAK_DOOR: 179, // 179..194: + upper * 8 + open * 4 + facing
  BED: 195, // 195..202: + head * 4 + facing
  EMERALD_BLOCK: 203,
  LAPIS_BLOCK: 204,
  REDSTONE_BLOCK: 205,
  QUARTZ_BLOCK: 206,
};
// Inventory items for orientable blocks.
B.FURNACE = B.FURNACE_PZ;
B.CHEST = B.CHEST_PZ;
B.OAK_STAIRS = B.OAK_STAIRS_PZ;
B.COBBLE_STAIRS = B.COBBLE_STAIRS_PZ;
B.JACK_O_LANTERN = B.JACK_O_LANTERN_PZ;
B.LADDER = B.LADDER_PZ;

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
  BOW: 306,
  ARROW: 307,
  BUCKET: 308,
  WATER_BUCKET: 309,
  LAVA_BUCKET: 310,
  MILK_BUCKET: 311,
  BONE: 312,
  BONE_MEAL: 313,
  STRING: 314,
  SPIDER_EYE: 315,
  ENDER_PEARL: 316,
  SLIMEBALL: 317,
  EGG: 318,
  SNOWBALL: 319,
  CARROT: 320,
  POTATO: 321,
  BAKED_POTATO: 322,
  GOLDEN_APPLE: 323,
  COOKIE: 324,
  SUGAR: 325,
  PAPER: 326,
  BOOK: 327,
  COMPASS: 328,
  CLOCK: 329,
  EMERALD: 330,
  LAPIS_LAZULI: 331,
  REDSTONE: 332,
  IRON_NUGGET: 333,
  GOLD_NUGGET: 334,
  SHEARS: 335,
  BOWL: 336,
  MUSHROOM_STEW: 337,
  PUMPKIN_PIE: 338,
  MELON_SLICE: 339,
  CHARCOAL: 340,
  CLAY_BALL: 341,
  BRICK: 342,
  COPPER_INGOT: 343,
  QUARTZ: 344,
  BLAZE_ROD: 345,
  OAK_DOOR: 346,
  RED_BED: 347,
  // Armour: 350 + material * 4 + piece (helmet, chestplate, leggings, boots).
  LEATHER_HELMET: 350,
  GOLDEN_PICKAXE: 366,
  GOLDEN_AXE: 367,
  GOLDEN_SHOVEL: 368,
  GOLDEN_SWORD: 369,
  GOLDEN_HOE: 370,
};
export const ARMOR_MATERIALS = ['leather', 'iron', 'golden', 'diamond'];
export const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];
ARMOR_MATERIALS.forEach((m, mi) => ARMOR_PIECES.forEach((p, pi) => {
  I[`${m.toUpperCase()}_${p.toUpperCase()}`] = 350 + mi * 4 + pi;
}));

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
def(B.COAL_ORE, 'coal_ore', 'Coal Ore', 'coal_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 1, drop: I.COAL, xp: [0, 2] });
def(B.IRON_ORE, 'iron_ore', 'Iron Ore', 'iron_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 2 });
def(B.GOLD_ORE, 'gold_ore', 'Gold Ore', 'gold_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 3 });
def(B.DIAMOND_ORE, 'diamond_ore', 'Diamond Ore', 'diamond_ore', { hardness: 3, tool: 'pickaxe', harvestTier: 3, drop: I.DIAMOND, xp: [3, 7] });
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

// --- Stone variants, ores and natural blocks ---------------------------------------

const stoneLike = { hardness: 1.5, tool: 'pickaxe', harvestTier: 1 };
def(B.GRANITE, 'granite', 'Granite', 'granite', stoneLike);
def(B.DIORITE, 'diorite', 'Diorite', 'diorite', stoneLike);
def(B.ANDESITE, 'andesite', 'Andesite', 'andesite', stoneLike);
def(B.POLISHED_GRANITE, 'polished_granite', 'Polished Granite', 'polished_granite', stoneLike);
def(B.POLISHED_DIORITE, 'polished_diorite', 'Polished Diorite', 'polished_diorite', stoneLike);
def(B.POLISHED_ANDESITE, 'polished_andesite', 'Polished Andesite', 'polished_andesite', stoneLike);
def(B.DEEPSLATE, 'deepslate', 'Deepslate', { top: 'deepslate_top', side: 'deepslate' }, { hardness: 3, tool: 'pickaxe', harvestTier: 1, drop: B.COBBLED_DEEPSLATE });
def(B.COBBLED_DEEPSLATE, 'cobbled_deepslate', 'Cobbled Deepslate', 'cobbled_deepslate', { hardness: 3.5, tool: 'pickaxe', harvestTier: 1 });
const ore = (harvestTier, extra = {}) => ({ hardness: 3, tool: 'pickaxe', harvestTier, ...extra });
def(B.DEEPSLATE_IRON_ORE, 'deepslate_iron_ore', 'Deepslate Iron Ore', 'deepslate_iron_ore', ore(2, { hardness: 4.5, drop: B.IRON_ORE }));
def(B.DEEPSLATE_GOLD_ORE, 'deepslate_gold_ore', 'Deepslate Gold Ore', 'deepslate_gold_ore', ore(3, { hardness: 4.5, drop: B.GOLD_ORE }));
def(B.DEEPSLATE_DIAMOND_ORE, 'deepslate_diamond_ore', 'Deepslate Diamond Ore', 'deepslate_diamond_ore', ore(3, { hardness: 4.5, drop: I.DIAMOND, xp: [3, 7] }));
def(B.DEEPSLATE_REDSTONE_ORE, 'deepslate_redstone_ore', 'Deepslate Redstone Ore', 'deepslate_redstone_ore', ore(3, { hardness: 4.5, drops: [[I.REDSTONE, 4, 5]], xp: [1, 5] }));
def(B.REDSTONE_ORE, 'redstone_ore', 'Redstone Ore', 'redstone_ore', ore(3, { drops: [[I.REDSTONE, 4, 5]], xp: [1, 5] }));
def(B.LAPIS_ORE, 'lapis_ore', 'Lapis Lazuli Ore', 'lapis_ore', ore(2, { drops: [[I.LAPIS_LAZULI, 4, 8]], xp: [2, 5] }));
def(B.EMERALD_ORE, 'emerald_ore', 'Emerald Ore', 'emerald_ore', ore(3, { drop: I.EMERALD, xp: [3, 7] }));
def(B.COPPER_ORE, 'copper_ore', 'Copper Ore', 'copper_ore', ore(2));
def(B.CLAY, 'clay', 'Clay', 'clay', { hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: [[I.CLAY_BALL, 4]] });
def(B.ICE, 'ice', 'Ice', 'ice', { opaque: false, cullSame: true, hardness: 0.5, tool: 'pickaxe', sound: 'glass', drop: null, lightOpacity: 1, slippery: true });
def(B.PACKED_ICE, 'packed_ice', 'Packed Ice', 'packed_ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass', drop: null, slippery: true });
def(B.SNOW_LAYER, 'snow_layer', 'Snow', { top: 'snow', side: 'snow' }, {
  shape: 'box', box: [0, 0, 0, 16, 2, 16], solid: false, opaque: false, hardness: 0.1, tool: 'shovel', sound: 'snow',
  replaceable: true, support: 'ground', drops: [[I.SNOWBALL, 1]], selectionBox: [0, 0, 0, 1, 2 / 16, 1],
});
def(B.TERRACOTTA, 'terracotta', 'Terracotta', 'terracotta', { hardness: 1.25, tool: 'pickaxe', harvestTier: 1 });
def(B.ORANGE_TERRACOTTA, 'orange_terracotta', 'Orange Terracotta', 'orange_terracotta', { hardness: 1.25, tool: 'pickaxe', harvestTier: 1 });
def(B.BLUE_TERRACOTTA, 'blue_terracotta', 'Blue Terracotta', 'blue_terracotta', { hardness: 1.25, tool: 'pickaxe', harvestTier: 1 });
const sandstone = { hardness: 0.8, tool: 'pickaxe', harvestTier: 1 };
def(B.CHISELED_SANDSTONE, 'chiseled_sandstone', 'Chiseled Sandstone', { top: 'sandstone_top', side: 'chiseled_sandstone' }, sandstone);
def(B.CUT_SANDSTONE, 'cut_sandstone', 'Cut Sandstone', { top: 'sandstone_top', side: 'cut_sandstone' }, sandstone);
def(B.SMOOTH_SANDSTONE, 'smooth_sandstone', 'Smooth Sandstone', 'sandstone_top', sandstone);
def(B.SUGAR_CANE, 'sugar_cane', 'Sugar Cane', 'sugar_cane', { ...plant, support: 'sugar_cane', itemTexture: 'sugar_cane_item', selectionBox: [0.125, 0, 0.125, 0.875, 1, 0.875] });
def(B.PUMPKIN, 'pumpkin', 'Pumpkin', { top: 'pumpkin_top', side: 'pumpkin_side' }, { hardness: 1, tool: 'axe', sound: 'wood' });
orientable([B.JACK_O_LANTERN_PX, B.JACK_O_LANTERN_NX, B.JACK_O_LANTERN_PZ, B.JACK_O_LANTERN_NZ], 'jack_o_lantern', "Jack o'Lantern", 'jack_o_lantern',
  { top: 'pumpkin_top', side: 'pumpkin_side' }, { hardness: 1, tool: 'axe', sound: 'wood', lightEmit: 15, emissive: true });
def(B.MELON, 'melon', 'Melon', { top: 'melon_top', side: 'melon_side' }, { hardness: 1, tool: 'axe', sound: 'wood', drops: [[I.MELON_SLICE, 3, 7]] });
const cropDrops = (item, stage) => (stage < 3 ? [[item, 1]] : [[item, 2, 5]]);
[[B.CARROTS_0, 'carrots', 'Carrots', I.CARROT], [B.POTATOES_0, 'potatoes', 'Potatoes', I.POTATO]].forEach(([first, name, label, crop]) => {
  for (let stage = 0; stage < 4; stage++) {
    def(first + stage, `${name}_${stage}`, label, `${name}_${stage}`, {
      shape: 'crop', solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'farmland', creative: false,
      drops: cropDrops(crop, stage), crop: stage, selectionBox: [0, 0, 0, 1, (2 + stage * 3) / 16, 1],
    });
  }
});
def(B.RED_MUSHROOM, 'red_mushroom', 'Red Mushroom', 'red_mushroom', { ...plant, support: 'mushroom', lightEmit: 0, selectionBox: [0.3, 0, 0.3, 0.7, 0.4, 0.7] });
def(B.BROWN_MUSHROOM, 'brown_mushroom', 'Brown Mushroom', 'brown_mushroom', { ...plant, support: 'mushroom', lightEmit: 1, selectionBox: [0.3, 0, 0.3, 0.7, 0.4, 0.7] });
def(B.ALLIUM, 'allium', 'Allium', 'allium', plant);
def(B.AZURE_BLUET, 'azure_bluet', 'Azure Bluet', 'azure_bluet', plant);
def(B.RED_TULIP, 'red_tulip', 'Red Tulip', 'red_tulip', plant);
def(B.ORANGE_TULIP, 'orange_tulip', 'Orange Tulip', 'orange_tulip', plant);
def(B.LILY_OF_THE_VALLEY, 'lily_of_the_valley', 'Lily of the Valley', 'lily_of_the_valley', plant);
def(B.FERN, 'fern', 'Fern', 'fern', { ...plant, replaceable: true, drop: I.WHEAT_SEEDS, dropChance: 0.125, sway: true });
def(B.LILY_PAD, 'lily_pad', 'Lily Pad', 'lily_pad', {
  shape: 'box', box: [0, 0, 0, 16, 1, 16], solid: false, opaque: false, hardness: 0, sound: 'grass', support: 'water',
  selectionBox: [0, 0, 0, 1, 1 / 16, 1], topOnly: true, tint: 'foliage',
});
const sapling = { ...plant, support: 'ground', sapling: true };
def(B.OAK_SAPLING, 'oak_sapling', 'Oak Sapling', 'oak_sapling', { ...sapling, tree: 'oak' });
def(B.BIRCH_SAPLING, 'birch_sapling', 'Birch Sapling', 'birch_sapling', { ...sapling, tree: 'birch' });
def(B.SPRUCE_SAPLING, 'spruce_sapling', 'Spruce Sapling', 'spruce_sapling', { ...sapling, tree: 'spruce' });
BLOCKS[B.LEAVES].altDrops = [[B.OAK_SAPLING, 0.05], [I.APPLE, 0.03]];
BLOCKS[B.BIRCH_LEAVES].altDrops = [[B.BIRCH_SAPLING, 0.05]];
BLOCKS[B.SPRUCE_LEAVES].altDrops = [[B.SPRUCE_SAPLING, 0.05]];
export const WOOL_COLORS = {
  white: [232, 234, 234], orange: [240, 118, 20], magenta: [190, 68, 180], light_blue: [58, 176, 218],
  yellow: [246, 196, 40], lime: [112, 186, 26], pink: [238, 142, 170], gray: [62, 68, 72],
  light_gray: [142, 142, 136], cyan: [22, 138, 146], purple: [122, 42, 172], blue: [54, 60, 160],
  brown: [114, 72, 40], green: [86, 112, 30], red: [162, 40, 36], black: [28, 24, 26],
};
for (const color of ['orange', 'magenta', 'light_blue', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'brown']) {
  const label = color.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  def(B[`${color.toUpperCase()}_WOOL`], `${color}_wool`, `${label} Wool`, `${color}_wool`, wool);
}
const pane = {
  shape: 'pane', opaque: false, hardness: 0.3, selectionBox: [0, 0, 0, 1, 1, 1],
  collision: [[7 / 16, 0, 0, 9 / 16, 1, 1], [0, 0, 7 / 16, 1, 1, 9 / 16]],
};
def(B.GLASS_PANE, 'glass_pane', 'Glass Pane', 'glass', { ...pane, sound: 'glass', drop: null, itemTexture: 'glass' });
def(B.IRON_BARS, 'iron_bars', 'Iron Bars', 'iron_bars', { ...pane, hardness: 5, tool: 'pickaxe', itemTexture: 'iron_bars' });
def(B.BIRCH_PLANKS, 'birch_planks', 'Birch Planks', 'birch_planks', { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.SPRUCE_PLANKS, 'spruce_planks', 'Spruce Planks', 'spruce_planks', { hardness: 2, tool: 'axe', sound: 'wood' });
def(B.MOSSY_STONE_BRICKS, 'mossy_stone_bricks', 'Mossy Stone Bricks', 'mossy_stone_bricks', stoneLike);
def(B.CRACKED_STONE_BRICKS, 'cracked_stone_bricks', 'Cracked Stone Bricks', 'cracked_stone_bricks', stoneLike);
def(B.CHISELED_STONE_BRICKS, 'chiseled_stone_bricks', 'Chiseled Stone Bricks', 'chiseled_stone_bricks', stoneLike);
def(B.SMOOTH_STONE, 'smooth_stone', 'Smooth Stone', 'smooth_stone', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.HAY_BALE, 'hay_bale', 'Hay Bale', { top: 'hay_top', side: 'hay_side' }, { hardness: 0.5, sound: 'grass' });
def(B.PRISMARINE, 'prismarine', 'Prismarine', 'prismarine', stoneLike);
def(B.PRISMARINE_BRICKS, 'prismarine_bricks', 'Prismarine Bricks', 'prismarine_bricks', stoneLike);
def(B.DARK_PRISMARINE, 'dark_prismarine', 'Dark Prismarine', 'dark_prismarine', stoneLike);
def(B.SEA_LANTERN, 'sea_lantern', 'Sea Lantern', 'sea_lantern', { hardness: 0.3, sound: 'glass', lightEmit: 15, emissive: true });
def(B.NETHERRACK, 'netherrack', 'Netherrack', 'netherrack', { hardness: 0.4, tool: 'pickaxe', harvestTier: 1 });
def(B.SOUL_SAND, 'soul_sand', 'Soul Sand', 'soul_sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', collision: [[0, 0, 0, 1, 14 / 16, 1]], slow: true });
def(B.NETHER_BRICKS, 'nether_bricks', 'Nether Bricks', 'nether_bricks', { hardness: 2, tool: 'pickaxe', harvestTier: 1 });
def(B.NETHER_QUARTZ_ORE, 'nether_quartz_ore', 'Nether Quartz Ore', 'nether_quartz_ore', ore(1, { drop: I.QUARTZ, xp: [2, 5] }));
def(B.MAGMA_BLOCK, 'magma_block', 'Magma Block', 'magma', { hardness: 0.5, tool: 'pickaxe', harvestTier: 1, lightEmit: 3, emissive: true, hot: true });
const portal = {
  shape: 'portal', solid: false, opaque: false, translucentCutout: true, hardness: -1, lightEmit: 11, emissive: true,
  targetable: false, creative: false, drop: null, portal: true,
};
def(B.NETHER_PORTAL_X, 'nether_portal_x', 'Nether Portal', 'nether_portal', { ...portal, axis: 0 });
def(B.NETHER_PORTAL_Z, 'nether_portal_z', 'Nether Portal', 'nether_portal', { ...portal, axis: 2 });
def(B.CRYING_OBSIDIAN, 'crying_obsidian', 'Crying Obsidian', 'crying_obsidian', { hardness: 50, tool: 'pickaxe', harvestTier: 4, lightEmit: 10, emissive: true });
def(B.COBWEB, 'cobweb', 'Cobweb', 'cobweb', { ...plant, support: null, hardness: 4, tool: 'sword', drops: [[I.STRING, 1]], web: true, sound: 'wool' });
def(B.SPAWNER, 'spawner', 'Monster Spawner', 'spawner', { opaque: false, hardness: 5, tool: 'pickaxe', harvestTier: 1, drop: null, creative: false, xp: [15, 43] });
const rail = {
  shape: 'box', box: [0, 0, 0, 16, 1, 16], solid: false, opaque: false, hardness: 0.7, tool: 'pickaxe', sound: 'stone',
  support: 'ground', topOnly: true, selectionBox: [0, 0, 0, 1, 2 / 16, 1], drop: B.RAIL_NS,
};
def(B.RAIL_NS, 'rail', 'Rail', 'rail', { ...rail });
def(B.RAIL_EW, 'rail_ew', 'Rail', 'rail', { ...rail, creative: false, rotateTop: 1 });
const LADDER_BOXES = [[0, 0, 0, 1, 16, 16], [15, 0, 0, 16, 16, 16], [0, 0, 0, 16, 16, 1], [0, 0, 15, 16, 16, 16]];
[B.LADDER_PX, B.LADDER_NX, B.LADDER_PZ, B.LADDER_NZ].forEach((id, f) => {
  const box = LADDER_BOXES[f];
  def(id, `ladder_${FACINGS[f]}`, 'Ladder', 'ladder', {
    shape: 'box', box, solid: false, opaque: false, hardness: 0.4, tool: 'axe', sound: 'wood', ladder: true,
    support: 'wall', attach: [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]][f], facing: f, baseId: B.LADDER_PZ,
    creative: f === 2, itemTexture: 'ladder', selectionBox: box.map((v) => v / 16), drop: B.LADDER_PZ,
  });
});
// Doors: the panel lies along one side of the cell; opening swings it to the
// neighbouring side. Facing is the direction the player looked when placing.
const DOOR_SIDE_BOX = [[13, 0, 0, 16, 16, 16], [0, 0, 0, 3, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 16, 16, 3]];
const DOOR_CLOSED_SIDE = [1, 0, 3, 2]; // flush with the edge nearest the player
const DOOR_OPEN_SIDE = [2, 3, 0, 1];
for (let upper = 0; upper < 2; upper++) {
  for (let open = 0; open < 2; open++) {
    for (let f = 0; f < 4; f++) {
      const id = B.OAK_DOOR + upper * 8 + open * 4 + f;
      const box = DOOR_SIDE_BOX[(open ? DOOR_OPEN_SIDE : DOOR_CLOSED_SIDE)[f]];
      def(id, `oak_door_${upper ? 'upper' : 'lower'}_${open ? 'open' : 'closed'}_${FACINGS[f]}`, 'Oak Door', upper ? 'oak_door_top' : 'oak_door_bottom', {
        shape: 'box', box, opaque: false, hardness: 3, tool: 'axe', sound: 'wood', door: { upper, open, facing: f },
        collision: [box.map((v) => v / 16)], selectionBox: box.map((v) => v / 16), creative: false,
        drop: upper ? null : I.OAK_DOOR, support: upper ? 'door_upper' : 'ground',
      });
    }
  }
}
// Beds: foot and head halves; the head lies in the facing direction.
for (let head = 0; head < 2; head++) {
  for (let f = 0; f < 4; f++) {
    const id = B.BED + head * 4 + f;
    def(id, `bed_${head ? 'head' : 'foot'}_${FACINGS[f]}`, 'Red Bed', { top: head ? 'bed_head_top' : 'bed_foot_top', bottom: 'planks', side: 'bed_side' }, {
      shape: 'box', box: [0, 0, 0, 16, 9, 16], opaque: false, hardness: 0.2, sound: 'wool', bed: { head, facing: f },
      collision: [[0, 0, 0, 1, 9 / 16, 1]], selectionBox: [0, 0, 0, 1, 9 / 16, 1], creative: false,
      drop: head ? null : I.RED_BED, rotateTop: [1, 3, 0, 2][f],
    });
  }
}
def(B.EMERALD_BLOCK, 'emerald_block', 'Block of Emerald', 'emerald_block', { ...metal, harvestTier: 3 });
def(B.LAPIS_BLOCK, 'lapis_block', 'Block of Lapis Lazuli', 'lapis_block', { ...metal, harvestTier: 2 });
def(B.REDSTONE_BLOCK, 'redstone_block', 'Block of Redstone', 'redstone_block', { ...metal, lightEmit: 0 });
def(B.QUARTZ_BLOCK, 'quartz_block', 'Block of Quartz', { top: 'quartz_top', side: 'quartz_side' }, { hardness: 0.8, tool: 'pickaxe', harvestTier: 1 });

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
  { key: 'wooden', name: 'Wooden', tier: 1, speed: 2, material: B.PLANKS, bonus: 0, uses: 59 },
  { key: 'stone', name: 'Stone', tier: 2, speed: 4, material: B.COBBLESTONE, bonus: 1, uses: 131 },
  { key: 'iron', name: 'Iron', tier: 3, speed: 6, material: I.IRON_INGOT, bonus: 2, uses: 250 },
  { key: 'golden', name: 'Golden', tier: 1, speed: 12, material: I.GOLD_INGOT, bonus: 0, uses: 32 },
  { key: 'diamond', name: 'Diamond', tier: 4, speed: 8, material: I.DIAMOND, bonus: 3, uses: 1561 },
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
      durability: tier.uses,
      tool: { type, tier: tier.tier, speed: tier.speed, tierKey: tier.key },
    });
  }
}
function food(hunger, saturation) {
  return { food: { hunger, saturation } };
}
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
item(I.FLINT_AND_STEEL, 'flint_and_steel', 'Flint and Steel', { maxStack: 1, durability: 64 });
for (const mob of ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'creeper', 'villager']) {
  const label = mob[0].toUpperCase() + mob.slice(1);
  item(I[`${mob.toUpperCase()}_SPAWN_EGG`], `${mob}_spawn_egg`, `${label} Spawn Egg`, { spawns: mob });
}
item(I.BOW, 'bow', 'Bow', { maxStack: 1, durability: 384, bow: true });
item(I.ARROW, 'arrow', 'Arrow');
item(I.BUCKET, 'bucket', 'Bucket', { maxStack: 16, bucket: 'empty' });
item(I.WATER_BUCKET, 'water_bucket', 'Water Bucket', { maxStack: 1, bucket: B.WATER });
item(I.LAVA_BUCKET, 'lava_bucket', 'Lava Bucket', { maxStack: 1, bucket: B.LAVA });
item(I.MILK_BUCKET, 'milk_bucket', 'Milk Bucket', { maxStack: 1, food: { hunger: 0, saturation: 0, always: true }, leaves: I.BUCKET });
item(I.BONE, 'bone', 'Bone');
item(I.BONE_MEAL, 'bone_meal', 'Bone Meal', { fertilizer: true });
item(I.STRING, 'string', 'String');
item(I.SPIDER_EYE, 'spider_eye', 'Spider Eye', food(2, 3.2));
item(I.ENDER_PEARL, 'ender_pearl', 'Ender Pearl', { maxStack: 16, throwable: 'ender_pearl' });
item(I.SLIMEBALL, 'slimeball', 'Slimeball');
item(I.EGG, 'egg', 'Egg', { maxStack: 16, throwable: 'egg' });
item(I.SNOWBALL, 'snowball', 'Snowball', { maxStack: 16, throwable: 'snowball' });
item(I.CARROT, 'carrot', 'Carrot', { ...food(3, 3.6), plants: B.CARROTS_0 });
item(I.POTATO, 'potato', 'Potato', { ...food(1, 0.6), plants: B.POTATOES_0 });
item(I.BAKED_POTATO, 'baked_potato', 'Baked Potato', food(5, 6));
item(I.GOLDEN_APPLE, 'golden_apple', 'Golden Apple', { food: { hunger: 4, saturation: 9.6, always: true, regen: 5, absorb: 4 } });
item(I.COOKIE, 'cookie', 'Cookie', food(2, 0.4));
item(I.SUGAR, 'sugar', 'Sugar');
item(I.PAPER, 'paper', 'Paper');
item(I.BOOK, 'book', 'Book');
item(I.COMPASS, 'compass', 'Compass', { maxStack: 1 });
item(I.CLOCK, 'clock', 'Clock', { maxStack: 1 });
item(I.EMERALD, 'emerald', 'Emerald');
item(I.LAPIS_LAZULI, 'lapis_lazuli', 'Lapis Lazuli');
item(I.REDSTONE, 'redstone', 'Redstone Dust');
item(I.IRON_NUGGET, 'iron_nugget', 'Iron Nugget');
item(I.GOLD_NUGGET, 'gold_nugget', 'Gold Nugget');
item(I.SHEARS, 'shears', 'Shears', { maxStack: 1, durability: 238, tool: { type: 'shears', tier: 1, speed: 2, tierKey: 'iron' } });
item(I.BOWL, 'bowl', 'Bowl');
item(I.MUSHROOM_STEW, 'mushroom_stew', 'Mushroom Stew', { maxStack: 1, ...food(6, 7.2), leaves: I.BOWL });
item(I.PUMPKIN_PIE, 'pumpkin_pie', 'Pumpkin Pie', food(8, 4.8));
item(I.MELON_SLICE, 'melon_slice', 'Melon Slice', food(2, 1.2));
item(I.CHARCOAL, 'charcoal', 'Charcoal');
item(I.CLAY_BALL, 'clay_ball', 'Clay Ball');
item(I.BRICK, 'brick', 'Brick');
item(I.COPPER_INGOT, 'copper_ingot', 'Copper Ingot');
item(I.QUARTZ, 'quartz', 'Nether Quartz');
item(I.BLAZE_ROD, 'blaze_rod', 'Blaze Rod');
item(I.OAK_DOOR, 'oak_door', 'Oak Door', { places: 'door' });
item(I.RED_BED, 'red_bed', 'Red Bed', { maxStack: 1, places: 'bed' });
// Armour: defence points per piece and durability, like the original game.
export const ARMOR = {
  leather: { name: 'Leather', points: [1, 3, 2, 1], uses: [55, 80, 75, 65], label: ['Cap', 'Tunic', 'Pants', 'Boots'] },
  iron: { name: 'Iron', points: [2, 6, 5, 2], uses: [165, 240, 225, 195] },
  golden: { name: 'Golden', points: [2, 5, 3, 1], uses: [77, 112, 105, 91] },
  diamond: { name: 'Diamond', points: [3, 8, 6, 3], uses: [363, 528, 495, 429] },
};
const PIECE_LABEL = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];
ARMOR_MATERIALS.forEach((m, mi) => ARMOR_PIECES.forEach((piece, pi) => {
  const a = ARMOR[m];
  item(350 + mi * 4 + pi, `${m}_${piece}`, `${a.name} ${a.label ? a.label[pi] : PIECE_LABEL[pi]}`, {
    maxStack: 1, durability: a.uses[pi], armor: { slot: pi, points: a.points[pi], material: m },
  });
}));

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
  if (tool && tool.type === 'sword' && block.web) speed = 15;
  if (tool && tool.type === 'shears' && (block.waving || block.web || block.name.endsWith('_wool'))) speed = block.web ? 15 : 5;
  return (block.hardness * (canHarvest ? 1.5 : 5)) / speed;
}

// What a broken block yields: a list of [itemId, count] pairs (may be empty).
export function blockDrops(blockId, heldItemId, random = Math.random) {
  const block = BLOCKS[blockId];
  const tool = heldItemId ? ITEMS.get(heldItemId)?.tool : null;
  // Shears collect leaves, grass, ferns and cobwebs themselves.
  if (tool?.type === 'shears' && (block.waving || blockId === B.TALL_GRASS || blockId === B.FERN || blockId === B.COBWEB)) return [[blockId, 1]];
  if (block.web && tool?.type !== 'sword') return [];
  if (block.harvestTier > 0) {
    if (!tool || tool.type !== block.tool || tool.tier < block.harvestTier) return [];
  }
  if (block.drops) {
    return block.drops
      .map(([id, min, max = min]) => [id, min + Math.floor(random() * (max - min + 1))])
      .filter(([, n]) => n > 0);
  }
  if (block.altDrop && random() < block.altDrop[1]) return [[block.altDrop[0], 1]];
  if (block.altDrops) {
    const out = [];
    for (const [id, chance] of block.altDrops) if (random() < chance) out.push([id, 1]);
    if (out.length) return out;
  }
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

export const PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
export const LOGS = [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG];
export const WOOLS = Object.keys(WOOL_COLORS).map((c) => B[`${c.toUpperCase()}_WOOL`]);

export const SMELTING = new Map([
  [B.IRON_ORE, I.IRON_INGOT],
  [B.GOLD_ORE, I.GOLD_INGOT],
  [B.SAND, B.GLASS],
  [B.COBBLESTONE, B.STONE],
  [B.LOG, I.CHARCOAL],
  [B.BIRCH_LOG, I.CHARCOAL],
  [B.SPRUCE_LOG, I.CHARCOAL],
  [B.CACTUS, B.GREEN_WOOL],
  [B.COPPER_ORE, I.COPPER_INGOT],
  [B.CLAY, B.TERRACOTTA],
  [I.CLAY_BALL, I.BRICK],
  [I.POTATO, I.BAKED_POTATO],
  [B.STONE, B.SMOOTH_STONE],
  [B.COBBLED_DEEPSLATE, B.DEEPSLATE],
  [B.STONE_BRICKS, B.CRACKED_STONE_BRICKS],
  [B.SANDSTONE, B.SMOOTH_SANDSTONE],
  [B.NETHER_QUARTZ_ORE, I.QUARTZ],
  [B.REDSTONE_ORE, I.REDSTONE],
  [B.LAPIS_ORE, I.LAPIS_LAZULI],
  [B.EMERALD_ORE, I.EMERALD],
  [B.DIAMOND_ORE, I.DIAMOND],
  [B.COAL_ORE, I.COAL],
  [I.RAW_PORKCHOP, I.COOKED_PORKCHOP],
  [I.RAW_BEEF, I.STEAK],
  [I.RAW_CHICKEN, I.COOKED_CHICKEN],
  [I.RAW_MUTTON, I.COOKED_MUTTON],
]);
export const SMELT_TIME = 10;

export function fuelTime(id) {
  if (id === I.COAL || id === I.CHARCOAL) return 80;
  if (id === B.COAL_BLOCK) return 800;
  if (id === I.BLAZE_ROD) return 120;
  if (id === I.STICK || id === I.BOWL || BLOCKS[id]?.sapling) return 5;
  if (LOGS.includes(id) || PLANKS.includes(id)) return 15;
  if (id === B.CRAFTING_TABLE || id === B.OAK_FENCE || id === B.CHEST || id === B.BOOKSHELF || id === B.LADDER) return 15;
  if (id === I.BOW || id === I.OAK_DOOR) return 10;
  if (id === B.HAY_BALE) return 0;
  if (id === B.OAK_SLAB) return 7.5;
  if (BLOCKS[id]?.name.endsWith('_wool')) return 5;
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

const ANY_PLANKS = PLANKS;
const COBBLES = [B.COBBLESTONE, B.COBBLED_DEEPSLATE];
shapeless([B.LOG], B.PLANKS, 4);
shapeless([B.BIRCH_LOG], B.BIRCH_PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.SPRUCE_PLANKS, 4);
shaped(['P', 'P'], { P: ANY_PLANKS }, I.STICK, 4);
shaped(['PP', 'PP'], { P: ANY_PLANKS }, B.CRAFTING_TABLE);
shaped(['C', 'S'], { C: [I.COAL, I.CHARCOAL], S: I.STICK }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE);
shaped(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
shaped(['CCC', 'C C', 'CCC'], { C: COBBLES }, B.FURNACE);
shaped(['PPP', 'P P', 'PPP'], { P: ANY_PLANKS }, B.CHEST);
shaped(['PSP', 'PSP'], { P: ANY_PLANKS, S: I.STICK }, B.OAK_FENCE, 3);
shaped(['P  ', 'PP ', 'PPP'], { P: ANY_PLANKS }, B.OAK_STAIRS, 4);
shaped(['C  ', 'CC ', 'CCC'], { C: B.COBBLESTONE }, B.COBBLE_STAIRS, 4);
shaped(['PPP'], { P: ANY_PLANKS }, B.OAK_SLAB, 6);
shaped(['CCC'], { C: B.COBBLESTONE }, B.COBBLE_SLAB, 6);
shaped(['SSS'], { S: B.STONE }, B.STONE_SLAB, 6);
shaped(['I', 'T'], { I: I.IRON_INGOT, T: B.TORCH }, B.LANTERN);
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
shaped(['WWW'], { W: I.WHEAT }, I.BREAD);
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL);
for (const tier of TOOL_TIERS) {
  const M = tier.key === 'wooden' ? ANY_PLANKS : tier.key === 'stone' ? COBBLES : tier.material;
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
  [I.EMERALD, B.EMERALD_BLOCK],
  [I.LAPIS_LAZULI, B.LAPIS_BLOCK],
  [I.REDSTONE, B.REDSTONE_BLOCK],
  [I.WHEAT, B.HAY_BALE],
  [I.IRON_NUGGET, I.IRON_INGOT],
  [I.GOLD_NUGGET, I.GOLD_INGOT],
];
for (const [material, blockId] of STORAGE) {
  shaped(['MMM', 'MMM', 'MMM'], { M: material }, blockId);
  shapeless([blockId], material, 9);
}
shapeless([B.COBBLESTONE, B.TALL_GRASS], B.MOSSY_COBBLESTONE);
shaped([' ST', 'S T', ' ST'], { S: I.STICK, T: I.STRING }, I.BOW);
shaped(['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER }, I.ARROW, 4);
shaped(['I I', ' I '], { I: I.IRON_INGOT }, I.BUCKET);
shaped([' I', 'I '], { I: I.IRON_INGOT }, I.SHEARS);
shapeless([I.BONE], I.BONE_MEAL, 3);
shaped(['SSS'], { S: B.SUGAR_CANE }, I.PAPER, 3);
shapeless([B.SUGAR_CANE], I.SUGAR);
shapeless([I.PAPER, I.PAPER, I.PAPER, I.LEATHER], I.BOOK);
shaped(['PPP', 'BBB', 'PPP'], { P: ANY_PLANKS, B: I.BOOK }, B.BOOKSHELF);
shapeless([B.PUMPKIN, I.SUGAR, I.EGG], I.PUMPKIN_PIE);
shapeless([I.BOWL, B.RED_MUSHROOM, B.BROWN_MUSHROOM], I.MUSHROOM_STEW);
shaped(['P P', ' P '], { P: ANY_PLANKS }, I.BOWL, 4);
shaped(['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE }, I.GOLDEN_APPLE);
shaped([' I ', 'IRI', ' I '], { I: I.IRON_INGOT, R: I.REDSTONE }, I.COMPASS);
shaped([' G ', 'GRG', ' G '], { G: I.GOLD_INGOT, R: I.REDSTONE }, I.CLOCK);
shaped(['P', 'T'], { P: B.PUMPKIN, T: B.TORCH }, B.JACK_O_LANTERN);
shaped(['BB', 'BB'], { B: I.BRICK }, B.BRICKS);
shaped(['CC', 'CC'], { C: I.CLAY_BALL }, B.CLAY);
shaped(['SS', 'SS'], { S: I.SNOWBALL }, B.SNOW);
shaped(['SSS'], { S: B.SNOW }, B.SNOW_LAYER, 6);
shaped(['GGG', 'GGG'], { G: B.GLASS }, B.GLASS_PANE, 16);
shaped(['III', 'III'], { I: I.IRON_INGOT }, B.IRON_BARS, 16);
shaped(['S S', 'SSS', 'S S'], { S: I.STICK }, B.LADDER, 3);
shaped(['PP', 'PP', 'PP'], { P: ANY_PLANKS }, I.OAK_DOOR, 3);
shaped(['WWW', 'PPP'], { W: WOOLS, P: ANY_PLANKS }, I.RED_BED);
shaped(['SS', 'SS'], { S: I.STRING }, B.WHITE_WOOL);
shaped(['I I', 'ISI', 'I I'], { I: I.IRON_INGOT, S: I.STICK }, B.RAIL_NS, 16);
shaped(['SS', 'SS'], { S: B.GRANITE }, B.POLISHED_GRANITE, 4);
shaped(['SS', 'SS'], { S: B.DIORITE }, B.POLISHED_DIORITE, 4);
shaped(['SS', 'SS'], { S: B.ANDESITE }, B.POLISHED_ANDESITE, 4);
shaped(['SS', 'SS'], { S: B.SANDSTONE }, B.CUT_SANDSTONE, 4);
shaped(['S', 'S'], { S: B.SANDSTONE }, B.CHISELED_SANDSTONE);
shaped(['S', 'S'], { S: B.STONE_BRICKS }, B.CHISELED_STONE_BRICKS);
shapeless([B.STONE_BRICKS, B.TALL_GRASS], B.MOSSY_STONE_BRICKS);
shaped(['QQ', 'QQ'], { Q: I.QUARTZ }, B.QUARTZ_BLOCK);
ARMOR_MATERIALS.forEach((m, mi) => {
  const M = m === 'leather' ? I.LEATHER : m === 'iron' ? I.IRON_INGOT : m === 'golden' ? I.GOLD_INGOT : I.DIAMOND;
  const base = 350 + mi * 4;
  shaped(['MMM', 'M M'], { M }, base);
  shaped(['M M', 'MMM', 'MMM'], { M }, base + 1);
  shaped(['MMM', 'M M', 'M M'], { M }, base + 2);
  shaped(['M M', 'M M'], { M }, base + 3);
});
