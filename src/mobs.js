// Mob definitions: box models (Minecraft-style box UV layout) and
// procedurally painted 64x64 skins.
import { MeshBuilder } from './mesher.js';
import { mulberry32, hashString } from './noise.js';
import { I } from './blocks.js';

export const SKIN = 64;

// Model boxes are in pixels (1/16 block) with the origin at the feet centre;
// the model faces +Z. `uv` is the top-left of the box's texture layout.
// Part kinds drive animation: head, body, legFL/legFR/legBL/legBR (quadrupeds),
// legL/legR/armL/armR (humanoids), wingL/wingR, static.
export const MOBS = {
  pig: {
    health: 10, width: 0.9, height: 0.9, speed: 1.5, passive: true, skin: 0,
    drops: [[I.RAW_PORKCHOP, 1, 3]], sound: 'pig',
    parts: [
      { kind: 'body', box: [-5, 6, -8, 5, 14, 8], uv: [0, 32] },
      { kind: 'head', box: [-4, 8, 6, 4, 16, 14], uv: [0, 0], pivot: [0, 12, 7] },
      { kind: 'head', box: [-2, 9, 14, 2, 12, 15], uv: [32, 0], pivot: [0, 12, 7] },
      { kind: 'legFL', box: [-5, 0, 3, -1, 6, 7], uv: [0, 16], pivot: [-3, 6, 5] },
      { kind: 'legFR', box: [1, 0, 3, 5, 6, 7], uv: [0, 16], pivot: [3, 6, 5] },
      { kind: 'legBL', box: [-5, 0, -7, -1, 6, -3], uv: [0, 16], pivot: [-3, 6, -5] },
      { kind: 'legBR', box: [1, 0, -7, 5, 6, -3], uv: [0, 16], pivot: [3, 6, -5] },
    ],
  },
  cow: {
    health: 10, width: 0.9, height: 1.4, speed: 1.4, passive: true, skin: 1,
    drops: [[I.RAW_BEEF, 1, 3], [I.LEATHER, 0, 2]], sound: 'cow',
    parts: [
      { kind: 'body', box: [-6, 12, -9, 6, 22, 9], uv: [0, 32] },
      { kind: 'head', box: [-4, 16, 8, 4, 24, 14], uv: [0, 0], pivot: [0, 20, 9] },
      { kind: 'head', box: [-5, 22, 10, -4, 25, 11], uv: [30, 0], pivot: [0, 20, 9] },
      { kind: 'head', box: [4, 22, 10, 5, 25, 11], uv: [30, 0], pivot: [0, 20, 9] },
      { kind: 'legFL', box: [-6, 0, 4, -2, 12, 8], uv: [0, 16], pivot: [-4, 12, 6] },
      { kind: 'legFR', box: [2, 0, 4, 6, 12, 8], uv: [0, 16], pivot: [4, 12, 6] },
      { kind: 'legBL', box: [-6, 0, -8, -2, 12, -4], uv: [0, 16], pivot: [-4, 12, -6] },
      { kind: 'legBR', box: [2, 0, -8, 6, 12, -4], uv: [0, 16], pivot: [4, 12, -6] },
    ],
  },
  sheep: {
    health: 8, width: 0.9, height: 1.3, speed: 1.4, passive: true, skin: 2,
    drops: [[40, 1, 1], [I.RAW_MUTTON, 1, 2]], sound: 'sheep',
    parts: [
      { kind: 'body', box: [-4, 12, -8, 4, 18, 8], uv: [0, 14] },
      { kind: 'body', box: [-6, 10, -10, 6, 20, 10], uv: [0, 36], uvBox: [8, 6, 16], fleece: true },
      { kind: 'head', box: [-3, 15, 7, 3, 21, 15], uv: [0, 0], pivot: [0, 18, 8] },
      { kind: 'head', box: [-4, 15, 7, 4, 22, 14], uv: [28, 0], uvBox: [6, 6, 6], pivot: [0, 18, 8], fleece: true },
      { kind: 'legFL', box: [-5, 0, 3, -1, 12, 7], uv: [48, 12], pivot: [-3, 12, 5] },
      { kind: 'legFR', box: [1, 0, 3, 5, 12, 7], uv: [48, 12], pivot: [3, 12, 5] },
      { kind: 'legBL', box: [-5, 0, -7, -1, 12, -3], uv: [48, 12], pivot: [-3, 12, -5] },
      { kind: 'legBR', box: [1, 0, -7, 5, 12, -3], uv: [48, 12], pivot: [3, 12, -5] },
    ],
  },
  chicken: {
    health: 4, width: 0.4, height: 0.7, speed: 1.2, passive: true, skin: 3, slowFall: true,
    drops: [[I.RAW_CHICKEN, 1, 1], [I.FEATHER, 0, 2]], sound: 'chicken',
    parts: [
      { kind: 'body', box: [-3, 4, -4, 3, 10, 4], uv: [0, 32] },
      { kind: 'head', box: [-2, 9, 3, 2, 15, 6], uv: [0, 0], pivot: [0, 10, 4] },
      { kind: 'head', box: [-2, 11, 6, 2, 13, 8], uv: [16, 0], pivot: [0, 10, 4] },
      { kind: 'head', box: [-1, 9, 6, 1, 11, 7], uv: [30, 0], pivot: [0, 10, 4] },
      { kind: 'wingL', box: [-4, 5, -3, -3, 9, 3], uv: [0, 16], pivot: [-3, 9, 0] },
      { kind: 'wingR', box: [3, 5, -3, 4, 9, 3], uv: [0, 16], pivot: [3, 9, 0] },
      { kind: 'legL', box: [-2, 0, 0, -1, 4, 1], uv: [20, 16], pivot: [-2, 4, 0] },
      { kind: 'legR', box: [1, 0, 0, 2, 4, 1], uv: [20, 16], pivot: [1, 4, 0] },
    ],
  },
  zombie: {
    health: 20, width: 0.6, height: 1.95, speed: 2.3, hostile: true, skin: 4, burnsInDay: true, attack: 3,
    drops: [[I.ROTTEN_FLESH, 0, 2]], sound: 'zombie',
    parts: humanoid(),
  },
  creeper: {
    health: 20, width: 0.6, height: 1.7, speed: 2.4, hostile: true, skin: 5, explodes: true,
    drops: [[I.GUNPOWDER, 0, 2]], sound: 'creeper',
    parts: [
      { kind: 'body', box: [-4, 6, -2, 4, 18, 2], uv: [16, 16] },
      { kind: 'head', box: [-4, 18, -4, 4, 26, 4], uv: [0, 0], pivot: [0, 18, 0] },
      { kind: 'legFL', box: [-4, 0, 2, 0, 6, 6], uv: [0, 16], pivot: [-2, 6, 4] },
      { kind: 'legFR', box: [0, 0, 2, 4, 6, 6], uv: [0, 16], pivot: [2, 6, 4] },
      { kind: 'legBL', box: [-4, 0, -6, 0, 6, -2], uv: [0, 16], pivot: [-2, 6, -4] },
      { kind: 'legBR', box: [0, 0, -6, 4, 6, -2], uv: [0, 16], pivot: [2, 6, -4] },
    ],
  },
  villager: {
    health: 20, width: 0.6, height: 1.95, speed: 1.0, passive: true, skin: 6, villager: true, xp: 0,
    drops: [], sound: 'villager',
    parts: [
      { kind: 'legL', box: [-4, 0, -2, 0, 12, 2], uv: [0, 20], pivot: [-2, 12, 0] },
      { kind: 'legR', box: [0, 0, -2, 4, 12, 2], uv: [0, 20], pivot: [2, 12, 0] },
      { kind: 'body', box: [-4, 12, -3, 4, 24, 3], uv: [16, 20] },
      { kind: 'head', box: [-4, 24, -4, 4, 34, 4], uv: [0, 0], pivot: [0, 24, 0] },
      { kind: 'head', box: [-1, 25, 4, 1, 29, 6], uv: [32, 0], pivot: [0, 24, 0] },
      { kind: 'static', box: [-6, 17, 3, 6, 21, 7], uv: [0, 40] },
    ],
  },
  skeleton: {
    health: 20, width: 0.6, height: 1.99, speed: 2.4, hostile: true, skin: 7, burnsInDay: true, ranged: true, attack: 3,
    drops: [[I.BONE, 0, 2], [I.ARROW, 0, 2]], sound: 'skeleton', holds: I.BOW,
    parts: [
      { kind: 'legL', box: [-3, 0, -1, -1, 12, 1], uv: [0, 16], pivot: [-2, 12, 0] },
      { kind: 'legR', box: [1, 0, -1, 3, 12, 1], uv: [0, 16], pivot: [2, 12, 0] },
      { kind: 'body', box: [-4, 12, -2, 4, 24, 2], uv: [16, 16] },
      { kind: 'head', box: [-4, 24, -4, 4, 32, 4], uv: [0, 0], pivot: [0, 24, 0] },
      { kind: 'armL', box: [-6, 12, -1, -4, 24, 1], uv: [40, 16], pivot: [-5, 22, 0] },
      { kind: 'armR', box: [4, 12, -1, 6, 24, 1], uv: [40, 16], pivot: [5, 22, 0] },
    ],
  },
  spider: {
    health: 16, width: 1.4, height: 0.9, speed: 3.2, hostile: true, skin: 8, climbs: true, neutralInDay: true, attack: 2,
    drops: [[I.STRING, 0, 2], [I.SPIDER_EYE, 0, 1]], sound: 'spider',
    parts: [
      { kind: 'body', box: [-5, 4, -12, 5, 12, 0], uv: [0, 0] },
      { kind: 'body', box: [-3, 5, 0, 3, 11, 6], uv: [32, 20] },
      { kind: 'head', box: [-4, 4, 6, 4, 12, 14], uv: [0, 20], pivot: [0, 8, 6] },
      ...[-1, 1].flatMap((side) => [0, 1, 2, 3].map((i) => ({
        kind: `spiderLeg${i}${side < 0 ? 'L' : 'R'}`,
        box: side < 0 ? [-18, 6, 3 - i * 2, -3, 8, 5 - i * 2] : [3, 6, 3 - i * 2, 18, 8, 5 - i * 2],
        uv: [0, 36], uvBox: [15, 2, 2], pivot: [side * 3, 7, 4 - i * 2],
      }))),
    ],
  },
  enderman: {
    health: 40, width: 0.6, height: 2.9, speed: 3.6, neutral: true, skin: 9, teleports: true, attack: 7,
    drops: [[I.ENDER_PEARL, 0, 1]], sound: 'enderman',
    parts: [
      { kind: 'legL', box: [-3, 0, -1, -1, 30, 1], uv: [56, 0], pivot: [-2, 30, 0] },
      { kind: 'legR', box: [1, 0, -1, 3, 30, 1], uv: [56, 0], pivot: [2, 30, 0] },
      { kind: 'body', box: [-4, 30, -2, 4, 42, 2], uv: [32, 16] },
      { kind: 'head', box: [-4, 42, -4, 4, 50, 4], uv: [0, 0], pivot: [0, 42, 0] },
      { kind: 'armL', box: [-6, 12, -1, -4, 42, 1], uv: [56, 0], pivot: [-5, 40, 0] },
      { kind: 'armR', box: [4, 12, -1, 6, 42, 1], uv: [56, 0], pivot: [5, 40, 0] },
    ],
  },
  slime: {
    health: 16, width: 0.52, height: 0.52, speed: 2.2, hostile: true, skin: 10, hops: true, attack: 4, sizes: true,
    drops: [], sound: 'slime',
    parts: [
      { kind: 'body', box: [-3, 1, -3, 3, 7, 3], uv: [0, 16] },
      { kind: 'body', box: [-2, 4, 3, 0, 6, 4], uv: [32, 0], uvBox: [2, 2, 1] },
      { kind: 'body', box: [0, 4, 3, 2, 6, 4], uv: [32, 4], uvBox: [2, 2, 1] },
      { kind: 'body', box: [-4, 0, -4, 4, 8, 4], uv: [0, 0], translucent: true },
    ],
  },
  wolf: {
    health: 8, width: 0.6, height: 0.85, speed: 3.0, neutral: true, skin: 11, tameSkin: 16, tameable: true, attack: 4,
    drops: [], sound: 'wolf',
    parts: [
      { kind: 'body', box: [-3, 6, -6, 3, 12, 3], uv: [18, 14] },
      { kind: 'body', box: [-4, 6, 1, 4, 13, 7], uv: [21, 0] },
      { kind: 'head', box: [-3, 7, 7, 3, 13, 11], uv: [0, 0], pivot: [0, 10, 7] },
      { kind: 'head', box: [-1, 7, 11, 1, 10, 14], uv: [0, 10], pivot: [0, 10, 7], uvBox: [2, 3, 3] },
      { kind: 'head', box: [-3, 13, 8, -1, 15, 9], uv: [50, 0], uvBox: [2, 2, 1], pivot: [0, 10, 7] },
      { kind: 'head', box: [1, 13, 8, 3, 15, 9], uv: [50, 0], uvBox: [2, 2, 1], pivot: [0, 10, 7] },
      { kind: 'legFL', box: [-3, 0, 2, -1, 8, 4], uv: [0, 18], pivot: [-2, 8, 3] },
      { kind: 'legFR', box: [1, 0, 2, 3, 8, 4], uv: [0, 18], pivot: [2, 8, 3] },
      { kind: 'legBL', box: [-3, 0, -5, -1, 8, -3], uv: [0, 18], pivot: [-2, 8, -4] },
      { kind: 'legBR', box: [1, 0, -5, 3, 8, -3], uv: [0, 18], pivot: [2, 8, -4] },
      { kind: 'tail', box: [-1, 4, -8, 1, 12, -6], uv: [9, 18], pivot: [0, 11, -6] },
    ],
  },
  iron_golem: {
    health: 100, width: 1.4, height: 2.7, speed: 1.6, neutral: true, skin: 12, defender: true, attack: 12, xp: 0,
    drops: [[I.IRON_INGOT, 3, 5], [28, 0, 2]], sound: 'golem',
    parts: [
      { kind: 'legL', box: [-7, 0, -3, -1, 16, 2], uv: [0, 41], pivot: [-4, 16, 0] },
      { kind: 'legR', box: [1, 0, -3, 7, 16, 2], uv: [0, 41], pivot: [4, 16, 0] },
      { kind: 'body', box: [-9, 16, -5, 9, 28, 6], uv: [0, 0] },
      { kind: 'body', box: [-5, 12, -3, 5, 18, 3], uv: [0, 0], uvBox: [9, 5, 6] },
      { kind: 'head', box: [-4, 28, -3, 4, 38, 5], uv: [0, 23], pivot: [0, 28, 0] },
      { kind: 'head', box: [-1, 29, 5, 1, 33, 7], uv: [52, 23], uvBox: [2, 4, 2], pivot: [0, 28, 0] },
      { kind: 'armL', box: [-13, 0, -3, -9, 28, 3], uv: [32, 23], uvBox: [4, 30, 6], pivot: [-11, 26, 0] },
      { kind: 'armR', box: [9, 0, -3, 13, 28, 3], uv: [32, 23], uvBox: [4, 30, 6], pivot: [11, 26, 0] },
    ],
  },
  squid: {
    health: 10, width: 0.8, height: 0.8, speed: 1.2, passive: true, skin: 13, swims: true,
    drops: [[I.INK_SAC, 1, 3]], sound: 'squid',
    parts: [
      { kind: 'body', box: [-6, 8, -6, 6, 24, 6], uv: [0, 0] },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * 5), z = Math.round(Math.sin(a) * 5);
        return { kind: 'tentacle', box: [x - 1, -10, z - 1, x + 1, 8, z + 1], uv: [48, 0], pivot: [x, 8, z], angle: a };
      }),
    ],
  },
  bat: {
    health: 6, width: 0.5, height: 0.9, speed: 4, passive: true, skin: 14, flies: true, xp: 0, scale: 0.55,
    drops: [], sound: 'bat',
    parts: [
      { kind: 'head', box: [-3, 8, -3, 3, 14, 3], uv: [0, 0] },
      { kind: 'body', box: [-3, 0, -2, 3, 8, 1], uv: [0, 16], uvBox: [6, 8, 3] },
      { kind: 'batWingL', box: [-13, -2, 0, -3, 12, 1], uv: [24, 0], uvBox: [10, 14, 1], pivot: [-3, 10, 0] },
      { kind: 'batWingR', box: [3, -2, 0, 13, 12, 1], uv: [24, 0], uvBox: [10, 14, 1], pivot: [3, 10, 0] },
    ],
  },
  rabbit: {
    health: 3, width: 0.4, height: 0.5, speed: 2.4, passive: true, skin: 15, hops: true,
    drops: [[I.RAW_RABBIT, 0, 1]], sound: 'rabbit',
    parts: [
      { kind: 'body', box: [-3, 2, -5, 3, 7, 3], uv: [0, 16] },
      { kind: 'head', box: [-2, 5, 2, 2, 9, 7], uv: [0, 0], pivot: [0, 6, 3], uvBox: [4, 4, 5] },
      { kind: 'head', box: [-2, 9, 3, -1, 14, 4], uv: [24, 0], uvBox: [1, 5, 1], pivot: [0, 6, 3] },
      { kind: 'head', box: [1, 9, 3, 2, 14, 4], uv: [24, 0], uvBox: [1, 5, 1], pivot: [0, 6, 3] },
      { kind: 'legBL', box: [-3, 0, -5, -1, 3, 0], uv: [30, 0], pivot: [-2, 3, -3] },
      { kind: 'legBR', box: [1, 0, -5, 3, 3, 0], uv: [30, 0], pivot: [2, 3, -3] },
      { kind: 'legFL', box: [-3, 0, 1, -1, 3, 3], uv: [30, 10], uvBox: [2, 3, 2], pivot: [-2, 3, 2] },
      { kind: 'legFR', box: [1, 0, 1, 3, 3, 3], uv: [30, 10], uvBox: [2, 3, 2], pivot: [2, 3, 2] },
    ],
  },
  guardian: {
    health: 30, width: 0.85, height: 0.85, speed: 3, hostile: true, skin: 17, swims: true, laser: true, attack: 6, xp: 10,
    drops: [[I.PRISMARINE_SHARD, 0, 2], [I.PRISMARINE_CRYSTALS, 0, 1], [I.RAW_COD, 0, 1]], sound: 'guardian',
    parts: [
      { kind: 'body', box: [-6, 1, -6, 6, 13, 6], uv: [0, 0] },
      { kind: 'body', box: [-1, 6, 6, 1, 8, 7], uv: [48, 0], uvBox: [2, 2, 1] },
      // Spikes sticking out of the edges.
      ...[[0, 13, 0, 0, 1, 0], [-6, 13, -6, -1, 1, -1], [6, 13, -6, 1, 1, -1], [-6, 13, 6, -1, 1, 1], [6, 13, 6, 1, 1, 1],
        [-6, 7, -6, -1, 0, -1], [6, 7, -6, 1, 0, -1], [-6, 7, 6, -1, 0, 1], [6, 7, 6, 1, 0, 1],
        [-6, 1, -6, -1, -1, -1], [6, 1, -6, 1, -1, -1], [-6, 1, 6, -1, -1, 1], [6, 1, 6, 1, -1, 1]].map(([x, y, z, dx, dy, dz]) => {
        const b = [x - 1 + dx, y - 1 + dy, z - 1 + dz];
        return { kind: 'spike', box: [b[0], b[1], b[2], b[0] + 2, b[1] + 2, b[2] + 2], uv: [0, 24], pivot: [x, y, z] };
      }),
      { kind: 'gtail', box: [-2, 5, -12, 2, 9, -6], uv: [24, 24], pivot: [0, 7, -6] },
      { kind: 'gtail', box: [-1, 6, -18, 1, 8, -12], uv: [24, 34], pivot: [0, 7, -6] },
    ],
  },
  cod: {
    health: 3, width: 0.5, height: 0.3, speed: 2, passive: true, skin: 18, swims: true, fish: true, xp: 1,
    drops: [[I.RAW_COD, 1, 1]], sound: 'squid',
    parts: [
      { kind: 'body', box: [-1, 0, -3, 1, 4, 4], uv: [0, 0] },
      { kind: 'body', box: [-1, 0, 4, 1, 3, 6], uv: [20, 0] },
      { kind: 'body', box: [0, 4, -2, 1, 5, 2], uv: [0, 12] },
      { kind: 'gtail', box: [0, 0, -7, 1, 4, -3], uv: [12, 12], pivot: [0, 2, -3] },
    ],
  },
};

function humanoid() {
  return [
    { kind: 'legL', box: [-4, 0, -2, 0, 12, 2], uv: [0, 16], pivot: [-2, 12, 0] },
    { kind: 'legR', box: [0, 0, -2, 4, 12, 2], uv: [0, 16], pivot: [2, 12, 0] },
    { kind: 'body', box: [-4, 12, -2, 4, 24, 2], uv: [16, 16] },
    { kind: 'head', box: [-4, 24, -4, 4, 32, 4], uv: [0, 0], pivot: [0, 24, 0] },
    { kind: 'armL', box: [-8, 12, -2, -4, 24, 2], uv: [40, 16], pivot: [-6, 22, 0] },
    { kind: 'armR', box: [4, 12, -2, 8, 24, 2], uv: [40, 16], pivot: [6, 22, 0] },
  ];
}

export const SPAWN_EGGS = {
  [I.PIG_SPAWN_EGG]: 'pig',
  [I.COW_SPAWN_EGG]: 'cow',
  [I.SHEEP_SPAWN_EGG]: 'sheep',
  [I.CHICKEN_SPAWN_EGG]: 'chicken',
  [I.ZOMBIE_SPAWN_EGG]: 'zombie',
  [I.CREEPER_SPAWN_EGG]: 'creeper',
  [I.VILLAGER_SPAWN_EGG]: 'villager',
  [I.SKELETON_SPAWN_EGG]: 'skeleton',
  [I.SPIDER_SPAWN_EGG]: 'spider',
  [I.ENDERMAN_SPAWN_EGG]: 'enderman',
  [I.SLIME_SPAWN_EGG]: 'slime',
  [I.WOLF_SPAWN_EGG]: 'wolf',
  [I.IRON_GOLEM_SPAWN_EGG]: 'iron_golem',
  [I.SQUID_SPAWN_EGG]: 'squid',
  [I.BAT_SPAWN_EGG]: 'bat',
  [I.RABBIT_SPAWN_EGG]: 'rabbit',
  [I.GUARDIAN_SPAWN_EGG]: 'guardian',
  [I.COD_SPAWN_EGG]: 'cod',
};

// Texture rectangles of a box laid out Minecraft-style: [u, v, w, h] per face,
// indexed like mesher faces (+X, -X, +Y, -Y, +Z, -Z).
export function boxLayout(u, v, w, h, d) {
  return [
    [u + d + w, v + d, d, h], // +X
    [u, v + d, d, h], // -X
    [u + d, v, w, d], // +Y (top)
    [u + d + w, v, w, d], // -Y (bottom)
    [u + d, v + d, w, h], // +Z (front)
    [u + d + w + d, v + d, w, h], // -Z (back)
  ];
}

const FACE_DEFS = [
  { u: [0, 0, -1], v: [0, 1, 0], base: [1, 0, 1] },
  { u: [0, 0, 1], v: [0, 1, 0], base: [0, 0, 0] },
  { u: [1, 0, 0], v: [0, 0, -1], base: [0, 1, 1] },
  { u: [1, 0, 0], v: [0, 0, 1], base: [0, 0, 0] },
  { u: [1, 0, 0], v: [0, 1, 0], base: [0, 0, 1] },
  { u: [-1, 0, 0], v: [0, 1, 0], base: [1, 0, 0] },
];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Builds the vertex data for one model part, positioned relative to its pivot.
export function buildPartMesh(part, layer) {
  const [x0, y0, z0, x1, y1, z1] = part.box;
  const pv = part.pivot || [0, 0, 0];
  const [w, h, d] = part.uvBox || [x1 - x0, y1 - y0, z1 - z0];
  const rects = boxLayout(part.uv[0], part.uv[1], w, h, d);
  const mb = new MeshBuilder(32);
  for (let f = 0; f < 6; f++) {
    const fd = FACE_DEFS[f];
    const [ru, rv, rw, rh] = rects[f];
    for (const [cu, cv] of CORNERS) {
      const c = [
        fd.base[0] + fd.u[0] * cu + fd.v[0] * cv,
        fd.base[1] + fd.u[1] * cu + fd.v[1] * cv,
        fd.base[2] + fd.u[2] * cu + fd.v[2] * cv,
      ];
      const px = (c[0] ? x1 : x0) - pv[0];
      const py = (c[1] ? y1 : y0) - pv[1];
      const pz = (c[2] ? z1 : z0) - pv[2];
      mb.vertex(px, py, pz, ru + cu * rw, rv + (1 - cv) * rh, layer, 240, 0, 255, 0, f);
    }
  }
  return { data: mb.result(), quads: mb.quads };
}

// --- Skins ---------------------------------------------------------------------

// Smooth 2D value noise over skin pixels, for patches and mottling.
function valueNoise(seed, cell) {
  const h = (x, y) => {
    let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * tx;
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Skin {
  constructor(seed) {
    this.data = new Uint8ClampedArray(SKIN * SKIN * 4);
    this.rng = mulberry32(hashString(seed));
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= SKIN || y >= SKIN) return;
    const i = (y * SKIN + x) * 4;
    if (!c) { this.data[i + 3] = 0; return; }
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3] ?? 255;
  }
  get(x, y) {
    const i = (y * SKIN + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  rect(r, color, noise = 12) {
    const [u, v, w, h] = r;
    for (let y = v; y < v + h; y++) {
      for (let x = u; x < u + w; x++) {
        const n = (this.rng() - 0.5) * noise;
        const c = typeof color === 'function' ? color(x - u, y - v, w, h, x, y) : color;
        this.set(x, y, c && [c[0] + n, c[1] + n, c[2] + n, c[3]]);
      }
    }
  }
  // Paints every face of a box. fn(face, x, y, w, h, sx, sy) returns a colour
  // (or null for transparent); face is 0..5 = +X, -X, +Y, -Y, +Z (front), -Z.
  box(u, v, w, h, d, fn, noise = 10) {
    boxLayout(u, v, w, h, d).forEach((r, f) => {
      this.rect(r, typeof fn === 'function' ? (x, y, rw, rh, sx, sy) => fn(f, x, y, rw, rh, sx, sy) : fn, noise);
    });
  }
  face(u, v, w, h, d, f) {
    return boxLayout(u, v, w, h, d)[f];
  }
  px(r, x, y, c) {
    this.set(r[0] + x, r[1] + y, c);
  }
}

const FRONT = 4, TOP = 2, BOTTOM = 3;

// Mottled colour: blends a base and an alternate colour by value noise.
function mottle(seed, cell, base, alt, amount = 1) {
  const n = valueNoise(seed, cell);
  return (sx, sy) => mixc(base, alt, Math.max(0, Math.min(1, (n(sx, sy) - 0.35) * 2.2 * amount)));
}

function eyes(s, f, y, x1, x2, white, pupil, outward = true) {
  // Two-pixel eyes: a white and a dark pupil, pupils towards the middle.
  s.px(f, x1, y, outward ? white : pupil); s.px(f, x1 + 1, y, outward ? pupil : white);
  s.px(f, x2, y, outward ? pupil : white); s.px(f, x2 + 1, y, outward ? white : pupil);
}

function paintPig() {
  const s = new Skin('pig');
  const pink = [242, 166, 164], deep = [222, 138, 140], light = [250, 188, 184];
  const skin = mottle(11, 3, pink, deep, 0.7);
  const fn = (f, x, y, w, h, sx, sy) => {
    const c = skin(sx, sy);
    if (f === TOP) return mixc(c, light, 0.25);
    if (f === BOTTOM) return shade(c, 0.9);
    return c;
  };
  s.box(0, 32, 10, 8, 16, fn, 6);
  s.box(0, 0, 8, 8, 8, fn, 6);
  const face = s.face(0, 0, 8, 8, 8, FRONT);
  eyes(s, face, 3, 1, 5, [255, 255, 255], [18, 18, 22]);
  s.px(face, 1, 2, shade(pink, 0.85)); s.px(face, 6, 2, shade(pink, 0.85));
  s.box(32, 0, 4, 3, 1, [246, 176, 178], 4);
  const snout = s.face(32, 0, 4, 3, 1, FRONT);
  s.rect([snout[0], snout[1], 4, 3], (x, y) => (y === 0 ? [250, 190, 192] : [240, 170, 172]), 4);
  s.px(snout, 1, 1, [150, 76, 92]); s.px(snout, 2, 1, [150, 76, 92]);
  s.box(0, 16, 4, 6, 4, (f, x, y, w, h, sx, sy) => (f !== TOP && f !== BOTTOM && y >= h - 1 ? [120, 78, 70] : f === BOTTOM ? [112, 72, 64] : skin(sx, sy)), 6);
  return s;
}

function paintCow() {
  const s = new Skin('cow');
  const dark = [58, 42, 30], black = [30, 24, 20], white = [236, 234, 228];
  const spots = valueNoise(21, 4);
  const hide = (sx, sy) => {
    const n = spots(sx, sy);
    return n > 0.62 ? white : n > 0.3 ? dark : black;
  };
  s.box(0, 32, 12, 10, 18, (f, x, y, w, h, sx, sy) => {
    if (f === BOTTOM && y >= 3 && y <= 8 && x >= 4 && x <= 7) return [238, 168, 168]; // udder
    return hide(sx, sy);
  }, 8);
  s.box(0, 0, 8, 8, 6, (f, x, y, w, h, sx, sy) => (f === FRONT ? dark : hide(sx, sy)), 6);
  const face = s.face(0, 0, 8, 8, 6, FRONT);
  // White blaze down the face, grey-pink muzzle with nostrils.
  s.rect([face[0] + 3, face[1], 2, 5], white, 4);
  s.rect([face[0] + 2, face[1] + 5, 4, 3], (x, y) => (y === 0 ? [210, 180, 170] : [196, 166, 156]), 5);
  s.px(face, 2, 6, [90, 70, 64]); s.px(face, 5, 6, [90, 70, 64]);
  eyes(s, face, 3, 1, 5, [240, 240, 240], [12, 12, 12]);
  s.box(30, 0, 1, 3, 1, (f, x, y) => (y === 0 ? [170, 166, 150] : [226, 222, 208]), 4);
  s.box(0, 16, 4, 12, 4, (f, x, y, w, h, sx, sy) => {
    if (f === BOTTOM || y >= h - 2) return [60, 56, 52];
    if (y >= 6) return white;
    return hide(sx, sy);
  }, 6);
  return s;
}

function woolColor(seed) {
  const n = valueNoise(seed, 1.6);
  return (sx, sy) => {
    const v = n(sx, sy);
    return v > 0.7 ? [250, 250, 246] : v < 0.3 ? [206, 206, 200] : [234, 234, 228];
  };
}

function paintSheep() {
  const s = new Skin('sheep');
  const wool = woolColor(31);
  const skinC = [214, 180, 158];
  // Shorn body (under the fleece) and the fleece box, mapped onto 8x6x16.
  s.box(0, 14, 8, 6, 16, skinC, 6);
  s.box(0, 36, 8, 6, 16, (f, x, y, w, h, sx, sy) => wool(sx, sy), 6);
  // Head: skin face, fleece cap on a separate slightly larger box.
  s.box(0, 0, 6, 6, 8, skinC, 6);
  const face = s.face(0, 0, 6, 6, 8, FRONT);
  s.rect([face[0], face[1], 6, 6], (x, y) => (y >= 4 && x >= 1 && x <= 4 ? [230, 196, 176] : skinC), 5);
  eyes(s, face, 2, 0, 4, [240, 240, 240], [20, 20, 24], true);
  s.px(face, 2, 4, [150, 110, 100]); s.px(face, 3, 4, [150, 110, 100]);
  s.box(28, 0, 6, 6, 6, (f, x, y, w, h, sx, sy) => {
    if (f === FRONT) return y < 2 ? wool(sx, sy) : null; // face shows through
    if (f === BOTTOM) return null;
    return wool(sx, sy);
  }, 6);
  s.box(48, 12, 4, 12, 4, (f, x, y, w, h, sx, sy) => (y < 5 && f !== BOTTOM ? wool(sx, sy) : y >= h - 1 || f === BOTTOM ? [150, 120, 104] : skinC), 6);
  return s;
}

function paintChicken() {
  const s = new Skin('chicken');
  const white = [246, 246, 242], grey = [216, 216, 212];
  const feathers = mottle(41, 2, white, grey, 0.8);
  s.box(0, 32, 6, 6, 8, (f, x, y, w, h, sx, sy) => (f === BOTTOM ? grey : feathers(sx, sy)), 6);
  s.box(0, 0, 4, 6, 3, (f, x, y, w, h, sx, sy) => feathers(sx, sy), 4);
  const face = s.face(0, 0, 4, 6, 3, FRONT);
  s.px(face, 0, 2, [16, 16, 16]); s.px(face, 3, 2, [16, 16, 16]);
  s.box(16, 0, 4, 2, 2, (f, x, y) => (y === 0 ? [250, 196, 60] : [226, 150, 30]), 4);
  s.box(30, 0, 2, 2, 1, [214, 36, 36], 6);
  s.box(0, 16, 1, 4, 6, (f, x, y, w, h, sx, sy) => (y === h - 1 ? grey : feathers(sx, sy)), 6);
  s.box(20, 16, 1, 4, 1, [236, 160, 50], 4);
  return s;
}

function paintHumanoid(name, skinFn, shirt, pants, shoes, faceFn) {
  const s = new Skin(name);
  s.box(0, 0, 8, 8, 8, (f, x, y, w, h, sx, sy) => skinFn(sx, sy), 6);
  s.box(16, 16, 8, 12, 4, (f, x, y, w, h, sx, sy) => (y >= h - 1 ? shade(shirt(sx, sy), 0.8) : shirt(sx, sy)), 6);
  s.box(40, 16, 4, 12, 4, (f, x, y, w, h, sx, sy) => (y < 5 && f !== BOTTOM ? shirt(sx, sy) : skinFn(sx, sy)), 6);
  s.box(0, 16, 4, 12, 4, (f, x, y, w, h, sx, sy) => (y >= h - 2 || f === BOTTOM ? shoes : pants(sx, sy)), 6);
  faceFn(s, s.face(0, 0, 8, 8, 8, FRONT));
  return s;
}

function paintZombie() {
  const skin = mottle(51, 2.5, [92, 140, 74], [70, 112, 56], 0.9);
  const shirt = mottle(52, 3, [30, 160, 162], [20, 122, 126], 0.8);
  const pants = mottle(53, 3, [64, 58, 150], [46, 40, 118], 0.7);
  return paintHumanoid('zombie', skin, shirt, pants, [74, 74, 80], (s, f) => {
    const eye = [22, 30, 20];
    s.rect([f[0] + 1, f[1] + 3, 2, 2], (x, y) => (y === 0 ? eye : [40, 60, 36]), 0);
    s.rect([f[0] + 5, f[1] + 3, 2, 2], (x, y) => (y === 0 ? eye : [40, 60, 36]), 0);
    s.rect([f[0] + 2, f[1] + 6, 4, 1], [48, 76, 40], 0);
    s.px(f, 3, 5, [64, 98, 52]); s.px(f, 4, 5, [64, 98, 52]);
  });
}

function paintCreeper() {
  const s = new Skin('creeper');
  const n1 = valueNoise(61, 1.5), n2 = valueNoise(62, 3);
  const green = (sx, sy) => {
    const v = n1(sx, sy) * 0.6 + n2(sx, sy) * 0.4;
    if (v > 0.68) return [150, 222, 120];
    if (v > 0.52) return [96, 188, 76];
    if (v > 0.34) return [72, 156, 56];
    return [48, 110, 40];
  };
  const fn = (f, x, y, w, h, sx, sy) => green(sx, sy);
  s.box(0, 0, 8, 8, 8, fn, 8);
  s.box(16, 16, 8, 12, 4, fn, 8);
  s.box(0, 16, 4, 6, 4, (f, x, y, w, h, sx, sy) => (y >= h - 1 ? [40, 88, 34] : green(sx, sy)), 8);
  const f = s.face(0, 0, 8, 8, 8, FRONT);
  const black = [14, 14, 14], dark = [30, 46, 28];
  s.rect([f[0] + 1, f[1] + 2, 2, 2], black, 0);
  s.rect([f[0] + 5, f[1] + 2, 2, 2], black, 0);
  s.rect([f[0] + 3, f[1] + 4, 2, 3], black, 0);
  s.px(f, 2, 5, black); s.px(f, 5, 5, black); s.px(f, 2, 6, black); s.px(f, 5, 6, black);
  s.px(f, 2, 7, dark); s.px(f, 5, 7, dark);
  return s;
}

function paintVillager() {
  const s = new Skin('villager');
  const skin = mottle(71, 3, [196, 150, 112], [180, 134, 98], 0.6);
  const robe = mottle(72, 3, [112, 74, 46], [92, 58, 36], 0.8);
  const hair = [74, 54, 36];
  s.box(0, 0, 8, 10, 8, (f, x, y, w, h, sx, sy) => (f === TOP || (f !== FRONT && y < 2) ? hair : skin(sx, sy)), 5);
  const f = s.face(0, 0, 8, 10, 8, FRONT);
  s.rect([f[0], f[1], 8, 1], hair, 3);
  s.rect([f[0] + 1, f[1] + 3, 6, 1], [58, 42, 28], 2); // unibrow
  eyes(s, f, 4, 1, 5, [250, 250, 250], [40, 130, 50]);
  s.rect([f[0] + 2, f[1] + 7, 4, 1], [150, 104, 76], 2);
  s.box(32, 0, 2, 4, 2, (fc, x, y) => (y === 3 ? [170, 118, 88] : [188, 138, 102]), 5);
  s.box(16, 20, 8, 12, 6, (fc, x, y, w, h, sx, sy) => (y >= h - 2 ? [70, 46, 28] : robe(sx, sy)), 6);
  s.box(0, 20, 4, 12, 4, (fc, x, y, w, h, sx, sy) => (y >= h - 2 || fc === BOTTOM ? [60, 44, 30] : robe(sx, sy)), 6);
  s.box(0, 40, 12, 4, 4, (fc, x, y, w, h, sx, sy) => (fc === FRONT && (x < 3 || x > 8) ? skin(sx, sy) : robe(sx, sy)), 6);
  return s;
}

function paintSkeleton() {
  const s = new Skin('skeleton');
  const bone = mottle(140, 2, [222, 222, 214], [190, 190, 184], 0.6);
  s.box(0, 0, 8, 8, 8, (fc, x, y, w, h, sx, sy) => bone(sx, sy), 6);
  const f = s.face(0, 0, 8, 8, 8, FRONT);
  const dark = [30, 30, 30];
  s.rect([f[0] + 1, f[1] + 3, 2, 2], dark, 0);
  s.rect([f[0] + 5, f[1] + 3, 2, 2], dark, 0);
  s.px(f, 3, 5, dark); s.px(f, 4, 5, [70, 70, 70]);
  for (let x = 1; x < 7; x++) s.px(f, x, 6, x % 2 ? [60, 60, 60] : [200, 200, 194]);
  // Rib cage: spine and ribs, gaps are see-through.
  s.box(16, 16, 8, 12, 4, (fc, x, y, w, h, sx, sy) => {
    if (fc === FRONT || fc === 5) {
      if (x === 3 || x === 4) return bone(sx, sy);
      if (y < 8 && y % 2 === 0) return bone(sx, sy);
      return y >= 9 && y <= 10 ? bone(sx, sy) : null;
    }
    if (fc === TOP || fc === BOTTOM) return bone(sx, sy);
    return y < 8 && y % 2 === 0 ? bone(sx, sy) : null;
  }, 4);
  s.box(40, 16, 2, 12, 2, (fc, x, y, w, h, sx, sy) => bone(sx, sy), 6);
  s.box(0, 16, 2, 12, 2, (fc, x, y, w, h, sx, sy) => bone(sx, sy), 6);
  return s;
}

function paintSpider() {
  const s = new Skin('spider');
  const hide = mottle(150, 2, [60, 50, 44], [36, 30, 26], 0.8);
  s.box(0, 0, 10, 8, 12, (fc, x, y, w, h, sx, sy) => {
    // Lighter markings on the back of the abdomen.
    if (fc === TOP && (x === 4 || x === 5) && y % 3 !== 0) return [110, 90, 70];
    return hide(sx, sy);
  }, 8);
  s.box(32, 20, 6, 6, 6, (fc, x, y, w, h, sx, sy) => hide(sx, sy), 8);
  s.box(0, 20, 8, 8, 8, (fc, x, y, w, h, sx, sy) => hide(sx, sy), 8);
  const f = s.face(0, 20, 8, 8, 8, FRONT);
  const red = [220, 20, 20], dim = [150, 10, 10];
  s.rect([f[0] + 1, f[1] + 3, 2, 2], red, 0); s.rect([f[0] + 5, f[1] + 3, 2, 2], red, 0);
  s.px(f, 3, 2, dim); s.px(f, 4, 2, dim); s.px(f, 2, 1, dim); s.px(f, 5, 1, dim);
  s.box(0, 36, 15, 2, 2, (fc, x, y, w, h, sx, sy) => (x % 5 === 0 ? [80, 66, 56] : hide(sx, sy)), 6);
  return s;
}

function paintEnderman() {
  const s = new Skin('enderman');
  const black = mottle(160, 2, [24, 22, 28], [12, 12, 16], 0.8);
  const fn = (fc, x, y, w, h, sx, sy) => black(sx, sy);
  s.box(0, 0, 8, 8, 8, fn, 4);
  const f = s.face(0, 0, 8, 8, 8, FRONT);
  const eye = [224, 121, 250], glow = [250, 200, 255];
  s.rect([f[0], f[1] + 4, 3, 1], eye, 0); s.rect([f[0] + 5, f[1] + 4, 3, 1], eye, 0);
  s.px(f, 1, 4, glow); s.px(f, 6, 4, glow);
  s.box(32, 16, 8, 12, 4, fn, 4);
  s.box(56, 0, 2, 30, 2, fn, 4);
  return s;
}

function paintSlime() {
  const s = new Skin('slime');
  const inner = mottle(170, 2, [96, 180, 76], [76, 150, 60], 0.7);
  // Outer gel: a rim on each face, clear in the middle.
  // Outer gel: see-through, a little denser along the edges.
  s.box(0, 0, 8, 8, 8, (fc, x, y, w, h) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? [120, 200, 100, 190] : [110, 190, 90, 120]), 6);
  s.box(0, 16, 6, 6, 6, (fc, x, y, w, h, sx, sy) => inner(sx, sy), 6);
  s.box(32, 0, 2, 2, 1, [20, 30, 20], 0);
  s.box(32, 4, 2, 2, 1, [20, 30, 20], 0);
  const f = s.face(0, 16, 6, 6, 6, FRONT);
  s.px(f, 3, 4, [40, 70, 36]);
  return s;
}

function paintWolf(tame = false) {
  const s = new Skin(tame ? 'wolf_tame' : 'wolf');
  const fur = mottle(180, 2, [216, 212, 206], [186, 180, 174], 0.8);
  const back = [150, 144, 140];
  const fn = (fc, x, y, w, h, sx, sy) => (fc === TOP ? mixc(fur(sx, sy), back, 0.4) : fur(sx, sy));
  s.box(0, 0, 6, 6, 4, fn, 4);
  const f = s.face(0, 0, 6, 6, 4, FRONT);
  s.px(f, 1, 2, [20, 20, 20]); s.px(f, 4, 2, [20, 20, 20]);
  s.box(0, 10, 2, 3, 3, (fc, x, y) => (fc === FRONT && y === 0 ? [30, 30, 30] : [230, 226, 220]), 4);
  s.box(50, 0, 2, 2, 1, [170, 160, 156], 4);
  // Mane; a tamed wolf wears a red collar around its front edge.
  const collar = (fc, x, y, w, h) => (fc === 0 && x === 1) || (fc === 1 && x === w - 2) || (fc === 2 && y === h - 2) || (fc === 3 && y === 1);
  s.box(21, 0, 8, 7, 6, (fc, x, y, w, h, sx, sy) => (tame && collar(fc, x, y, w, h) ? [186, 32, 32] : fn(fc, x, y, w, h, sx, sy)), 6);
  s.box(18, 14, 6, 6, 9, fn, 6);
  s.box(0, 18, 2, 8, 2, fur, 6);
  s.box(9, 18, 2, 8, 2, (fc, x, y, w, h, sx, sy) => (y > 5 ? [236, 234, 230] : fur(sx, sy)), 6);
  return s;
}

function paintIronGolem() {
  const s = new Skin('iron_golem');
  const iron = mottle(190, 3, [206, 200, 190], [176, 168, 158], 0.8);
  const vines = valueNoise(191, 3);
  const fn = (fc, x, y, w, h, sx, sy) => (vines(sx, sy) > 0.8 ? [80, 120, 50] : iron(sx, sy));
  s.box(0, 0, 18, 12, 11, fn, 8);
  s.box(0, 23, 8, 10, 8, (fc, x, y, w, h, sx, sy) => iron(sx, sy), 6);
  const f = s.face(0, 23, 8, 10, 8, FRONT);
  s.rect([f[0] + 1, f[1] + 3, 6, 1], [120, 110, 100], 0);
  s.px(f, 2, 4, [150, 30, 30]); s.px(f, 5, 4, [150, 30, 30]);
  s.box(52, 23, 2, 4, 2, [196, 188, 178], 4);
  s.box(32, 23, 4, 30, 6, fn, 8);
  s.box(0, 41, 6, 16, 5, fn, 8);
  return s;
}

function paintSquid() {
  const s = new Skin('squid');
  const skin = mottle(200, 3, [36, 62, 96], [26, 46, 74], 0.8);
  s.box(0, 0, 12, 16, 12, (fc, x, y, w, h, sx, sy) => skin(sx, sy), 6);
  for (const fc of [0, 1]) {
    const r = s.face(0, 0, 12, 16, 12, fc);
    s.rect([r[0] + 4, r[1] + 10, 3, 3], [230, 230, 220], 0);
    s.rect([r[0] + 5, r[1] + 11, 1, 1], [10, 10, 10], 0);
  }
  s.box(48, 0, 2, 18, 2, (fc, x, y, w, h, sx, sy) => mixc(skin(sx, sy), [120, 140, 170], y / 30), 6);
  return s;
}

function paintBat() {
  const s = new Skin('bat');
  const fur = mottle(210, 2, [76, 60, 44], [56, 44, 32], 0.8);
  s.box(0, 0, 6, 6, 6, (fc, x, y, w, h, sx, sy) => fur(sx, sy), 6);
  const f = s.face(0, 0, 6, 6, 6, FRONT);
  s.px(f, 1, 2, [10, 10, 10]); s.px(f, 4, 2, [10, 10, 10]);
  s.box(0, 16, 6, 8, 3, (fc, x, y, w, h, sx, sy) => fur(sx, sy), 6);
  // Wing membrane with finger bones and a scalloped trailing edge.
  s.box(24, 0, 10, 14, 1, (fc, x, y, w, h) => {
    if (fc === 4 || fc === 5) {
      const edge = h - 1 - Math.round(4 * Math.sin((x / w) * Math.PI * 1.5) ** 2);
      if (y > edge) return null;
      if (y < 2 || x % 3 === 0 && y < edge - 1) return [58, 46, 36];
    }
    return [34, 27, 22];
  }, 4);
  return s;
}

function paintRabbit() {
  const s = new Skin('rabbit');
  const fur = mottle(220, 2, [156, 116, 84], [128, 94, 66], 0.8);
  s.box(0, 0, 4, 4, 5, (fc, x, y, w, h, sx, sy) => fur(sx, sy), 5);
  const f = s.face(0, 0, 4, 4, 5, FRONT);
  s.px(f, 0, 1, [20, 20, 20]); s.px(f, 3, 1, [20, 20, 20]); s.px(f, 1, 3, [220, 170, 170]); s.px(f, 2, 3, [220, 170, 170]);
  s.box(24, 0, 1, 5, 1, (fc, x, y) => (y < 2 ? [120, 88, 62] : [226, 180, 170]), 4);
  s.box(0, 16, 6, 5, 8, (fc, x, y, w, h, sx, sy) => (fc === BOTTOM ? [226, 214, 196] : fur(sx, sy)), 5);
  s.box(30, 0, 2, 3, 5, fur, 5);
  s.box(30, 10, 2, 3, 2, fur, 5);
  return s;
}

function paintGuardian() {
  const s = new Skin('guardian');
  const hide = mottle(230, 3, [98, 160, 142], [70, 126, 116], 0.9);
  const plates = valueNoise(231, 4);
  s.box(0, 0, 12, 12, 12, (fc, x, y, w, h, sx, sy) => {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return [60, 104, 96];
    if (plates(sx, sy) > 0.78) return [208, 120, 70]; // orange patches
    return (x + y) % 6 === 0 ? [130, 184, 166] : hide(sx, sy);
  }, 6);
  // The big eye.
  s.box(48, 0, 2, 2, 1, (fc, x) => (fc === FRONT ? (x === 0 ? [250, 250, 244] : [40, 20, 50]) : [240, 236, 226]), 0);
  s.box(0, 24, 2, 2, 2, (fc, x, y) => (y === 0 ? [240, 220, 180] : [220, 150, 90]), 4);
  s.box(24, 24, 4, 4, 6, (fc, x, y, w, h, sx, sy) => hide(sx, sy), 6);
  s.box(24, 34, 2, 2, 6, (fc, x, y, w, h, sx, sy) => (x > w - 3 ? [208, 120, 70] : hide(sx, sy)), 6);
  return s;
}

function paintCod() {
  const s = new Skin('cod');
  const scales = mottle(240, 2, [176, 150, 108], [140, 116, 80], 0.9);
  s.box(0, 0, 2, 4, 7, (fc, x, y, w, h, sx, sy) => (fc === BOTTOM || (fc < 2 && y === h - 1) ? [226, 214, 190] : scales(sx, sy)), 6);
  s.box(20, 0, 2, 3, 2, (fc, x, y, w, h, sx, sy) => (fc < 2 && y === 1 && x === (fc === 0 ? 0 : w - 1) ? [20, 20, 20] : scales(sx, sy)), 4);
  s.box(0, 12, 1, 1, 4, [130, 110, 80], 4);
  s.box(12, 12, 1, 4, 4, (fc, x, y) => (y === 0 || y === 3 ? [120, 100, 70] : [160, 136, 100]), 4);
  return s;
}

// The player character: an original explorer in a few colour variants.
export const PLAYER_COLORS = [
  { shirt: [60, 160, 80], pants: [96, 70, 44], hair: [200, 160, 80] },
  { shirt: [196, 60, 50], pants: [50, 50, 60], hair: [30, 24, 20] },
  { shirt: [58, 120, 196], pants: [60, 56, 110], hair: [70, 46, 26] },
  { shirt: [230, 190, 50], pants: [40, 70, 120], hair: [120, 60, 30] },
  { shirt: [150, 70, 180], pants: [60, 60, 60], hair: [20, 20, 22] },
  { shirt: [240, 140, 40], pants: [70, 90, 60], hair: [160, 90, 50] },
  { shirt: [230, 230, 230], pants: [40, 40, 50], hair: [220, 210, 190] },
  { shirt: [40, 170, 170], pants: [110, 80, 60], hair: [90, 40, 20] },
];

function paintPlayer(variant) {
  const c = PLAYER_COLORS[variant];
  const skinTone = [212, 160, 126];
  const skin = mottle(90 + variant, 3, skinTone, [196, 144, 110], 0.4);
  const shirt = mottle(100 + variant, 3, c.shirt, shade(c.shirt, 0.82), 0.6);
  const pants = mottle(110 + variant, 3, c.pants, shade(c.pants, 0.8), 0.5);
  const s = paintHumanoid(`player${variant}`, skin, shirt, pants, [60, 50, 44], (sk, f) => {
    sk.rect([f[0], f[1], 8, 2], c.hair, 4);
    sk.px(f, 0, 2, c.hair); sk.px(f, 7, 2, c.hair);
    eyes(sk, f, 4, 1, 5, [250, 250, 250], [50, 80, 150]);
    sk.rect([f[0] + 3, f[1] + 5, 2, 1], shade(skinTone, 0.85), 0);
    sk.rect([f[0] + 2, f[1] + 6, 4, 1], [150, 90, 80], 0);
  });
  // Hair on top and at the back of the head; a belt on the shirt.
  s.box(0, 0, 8, 8, 8, (fc, x, y, w, h, sx, sy) => {
    if (fc === TOP || fc === 5 || ((fc === 0 || fc === 1) && y < 3)) return c.hair;
    return fc === FRONT ? s.get(sx, sy) : skin(sx, sy);
  }, 0);
  s.box(16, 16, 8, 12, 4, (fc, x, y, w, h, sx, sy) => (y === h - 2 ? [60, 40, 24] : s.get(sx, sy)), 0);
  return s;
}

// Armour worn by players: the humanoid layout painted in the material's
// colours (drawn on slightly larger boxes around the body).
const ARMOR_COLORS = {
  leather: [[150, 88, 44], [120, 66, 30]],
  iron: [[206, 206, 206], [160, 160, 164]],
  golden: [[246, 206, 60], [206, 150, 30]],
  diamond: [[76, 222, 206], [40, 160, 150]],
};
function paintArmor(material) {
  const [base, dark] = ARMOR_COLORS[material];
  const s = new Skin(`armor_${material}`);
  const metal = mottle(130 + base[0], 2, base, dark, 0.7);
  const fn = (fc, x, y, w, h, sx, sy) => (y === 0 || x === 0 ? mixc(metal(sx, sy), [255, 255, 255], 0.2) : metal(sx, sy));
  s.box(0, 0, 8, 8, 8, (fc, x, y, w, h, sx, sy) => {
    // Helmet: open face.
    if (fc === FRONT && y >= 2 && x >= 1 && x <= 6) return null;
    if (fc === BOTTOM) return null;
    return fn(fc, x, y, w, h, sx, sy);
  }, 6);
  s.box(16, 16, 8, 12, 4, fn, 6);
  s.box(40, 16, 4, 12, 4, (fc, x, y, w, h, sx, sy) => (y < 5 ? fn(fc, x, y, w, h, sx, sy) : null), 6);
  s.box(0, 16, 4, 12, 4, fn, 6);
  return s;
}
export const ARMOR_MATERIAL_LIST = ['leather', 'iron', 'golden', 'diamond'];

const MOB_PAINTERS = [paintPig, paintCow, paintSheep, paintChicken, paintZombie, paintCreeper, paintVillager,
  paintSkeleton, paintSpider, paintEnderman, paintSlime, () => paintWolf(), paintIronGolem, paintSquid, paintBat, paintRabbit,
  () => paintWolf(true), paintGuardian, paintCod];
export const PLAYER_SKIN_BASE = MOB_PAINTERS.length;
export const ARMOR_SKIN_BASE = PLAYER_SKIN_BASE + PLAYER_COLORS.length;

let skinCache = null;
export function mobSkins() {
  if (skinCache) return skinCache;
  const skins = [...MOB_PAINTERS.map((f) => f()), ...PLAYER_COLORS.map((_, i) => paintPlayer(i)), ...ARMOR_MATERIAL_LIST.map(paintArmor)];
  const pixels = new Uint8Array(skins.length * SKIN * SKIN * 4);
  skins.forEach((s, i) => pixels.set(s.data, i * SKIN * SKIN * 4));
  skinCache = { pixels, count: skins.length };
  return skinCache;
}

// Model used for other players and the third-person view.
export const PLAYER_MODEL = { parts: humanoid(), width: 0.6, height: 1.8 };
