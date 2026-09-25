// Renders players (other people in multiplayer, and yourself in third
// person): the humanoid body, worn armour and the item in the right hand.
import { ITEMS } from './blocks.js';
import { PLAYER_MODEL, PLAYER_SKIN_BASE, ARMOR_SKIN_BASE, ARMOR_MATERIAL_LIST, buildPartMesh } from './mobs.js';
import { compose, translation, rotationX, rotationY, rotationZ, scaling } from './math.js';

// Armour boxes are the body boxes grown by one pixel. Leggings and boots
// split the leg so they never overlap.
function grow(box, n, yRange = null) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const b = [x0 - n, y0 - n, z0 - n, x1 + n, y1 + n, z1 + n];
  if (yRange) { b[1] = yRange[0]; b[4] = yRange[1]; }
  return b;
}
const ARMOR_PARTS = [
  // slot 0 helmet, 1 chestplate, 2 leggings, 3 boots
  (p) => (p.kind === 'head' ? [{ ...p, box: grow(p.box, 1), uvBox: [8, 8, 8] }] : []),
  (p) => (p.kind === 'body' ? [{ ...p, box: grow(p.box, 1), uvBox: [8, 12, 4] }]
    : p.kind === 'armL' || p.kind === 'armR' ? [{ ...p, box: grow(p.box, 1, [17, 25]), uvBox: [4, 12, 4] }] : []),
  (p) => (p.kind === 'legL' || p.kind === 'legR' ? [{ ...p, box: grow(p.box, 1, [4, 12]), uvBox: [4, 12, 4] }] : []),
  (p) => (p.kind === 'legL' || p.kind === 'legR' ? [{ ...p, box: grow(p.box, 1, [-1, 4]), uvBox: [4, 12, 4] }] : []),
];

export class PlayerRenderer {
  constructor(renderer, entities) {
    this.renderer = renderer;
    this.entities = entities; // for item meshes
    this.cache = new Map();
  }

  bodyParts(variant) {
    const key = `body:${variant}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, PLAYER_MODEL.parts.map((p) => {
        const built = buildPartMesh(p, PLAYER_SKIN_BASE + variant);
        return { kind: p.kind, mesh: this.renderer.createMesh(built.data, built.quads), pivot: p.pivot || [0, 0, 0] };
      }));
    }
    return this.cache.get(key);
  }

  armorParts(slot, material) {
    const key = `armor:${slot}:${material}`;
    if (!this.cache.has(key)) {
      const layer = ARMOR_SKIN_BASE + ARMOR_MATERIAL_LIST.indexOf(material);
      const parts = PLAYER_MODEL.parts.flatMap(ARMOR_PARTS[slot]).map((p) => {
        const built = buildPartMesh(p, layer);
        return { kind: p.kind, mesh: this.renderer.createMesh(built.data, built.quads), pivot: p.pivot || [0, 0, 0] };
      });
      this.cache.set(key, parts);
    }
    return this.cache.get(key);
  }

  // p: { pos, yaw, headYaw, pitch, walkPhase, walkAmount, swing (0..1),
  // sneaking, variant, armor: [ids], held, light, hurt }
  renderEntries(p, time) {
    const swing = Math.sin(p.walkPhase) * 0.8 * p.walkAmount;
    const attack = p.swing > 0 ? Math.sin(p.swing * Math.PI) : 0;
    const base = [rotationY(p.yaw + Math.PI)];
    if (p.sneaking) base.push(translation(0, -0.15, 0));
    const partMatrix = (kind, pivot) => {
      let rot = null;
      switch (kind) {
        case 'head': rot = compose(rotationY(p.headYaw || 0), rotationX(-(p.pitch || 0))); break;
        case 'legL': rot = rotationX(swing); break;
        case 'legR': rot = rotationX(-swing); break;
        case 'armL': rot = rotationX(-swing * 0.8); break;
        case 'armR': rot = compose(rotationX(swing * 0.8 - attack * 1.6 - (p.held ? 0.3 : 0)), rotationZ(attack * 0.3)); break;
        case 'body': rot = p.sneaking ? rotationX(0.35) : null; break;
      }
      const pv = pivot.map((v) => v / 16);
      return rot ? compose(...base, translation(pv[0], pv[1], pv[2]), rot) : compose(...base, translation(pv[0], pv[1], pv[2]));
    };
    const overlay = p.hurt ? [1, 0.1, 0.1, 0.45] : [0, 0, 0, 0];
    const parts = this.bodyParts(p.variant || 0).map((part) => ({ mesh: part.mesh, matrix: partMatrix(part.kind, part.pivot) }));
    (p.armor || []).forEach((id, slot) => {
      const a = id && ITEMS.get(id)?.armor;
      if (!a) return;
      for (const part of this.armorParts(slot, a.material)) parts.push({ mesh: part.mesh, matrix: partMatrix(part.kind, part.pivot) });
    });
    const out = [{ parts, pos: p.pos, light: p.light, overlay, texture: 'entity' }];
    if (p.held) {
      // The item sits in the right hand, pointing forward.
      const m = this.entities.itemMesh(p.held);
      const arm = partMatrix('armR', [6, 22, 0]);
      const hand = m.block
        ? compose(arm, translation(0, -0.62, 0.12), scaling(0.3), translation(-0.5, 0, -0.5))
        : compose(arm, translation(0, -0.66, 0.05), rotationY(-Math.PI / 2), rotationZ(Math.PI / 4), rotationX(0), scaling(0.6), translation(-0.2, -0.2, -0.5));
      out.push({ parts: [{ mesh: m.mesh, matrix: hand }], pos: p.pos, light: p.light, overlay: [0, 0, 0, 0], texture: m.texture, uvScale: m.uvScale });
    }
    return out;
  }
}
