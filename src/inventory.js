import { ITEMS, RECIPES } from './blocks.js';

export function maxStack(id) {
  return ITEMS.get(id)?.maxStack ?? 64;
}

export function stack(id, count = 1) {
  return { id, count };
}

// 36 slots: 0-8 are the hotbar, 9-35 the main inventory.
export class Inventory {
  constructor(size = 36) {
    this.slots = new Array(size).fill(null);
    this.selected = 0;
  }

  get selectedStack() {
    return this.slots[this.selected];
  }

  get selectedId() {
    return this.slots[this.selected]?.id ?? 0;
  }

  // Adds items, merging into existing stacks first. Returns the leftover count.
  add(id, count = 1) {
    const max = maxStack(id);
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max) {
        const n = Math.min(max - s.count, count);
        s.count += n;
        count -= n;
      }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, count);
        this.slots[i] = stack(id, n);
        count -= n;
      }
    }
    return count;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  // Removes n items from the given slot. Returns how many were removed.
  take(slot, n = 1) {
    const s = this.slots[slot];
    if (!s) return 0;
    const taken = Math.min(n, s.count);
    s.count -= taken;
    if (s.count <= 0) this.slots[slot] = null;
    return taken;
  }

  // Selects the hotbar slot holding `id`, or puts a full stack of it into the
  // selected slot (creative "pick block").
  pick(id, creative) {
    for (let i = 0; i < 9; i++) {
      if (this.slots[i]?.id === id) {
        this.selected = i;
        return true;
      }
    }
    if (!creative) {
      const idx = this.slots.findIndex((s, i) => i >= 9 && s?.id === id);
      if (idx < 0) return false;
      const tmp = this.slots[this.selected];
      this.slots[this.selected] = this.slots[idx];
      this.slots[idx] = tmp;
      return true;
    }
    let target = this.selected;
    if (this.slots[target]) {
      const empty = this.slots.findIndex((s, i) => i < 9 && !s);
      if (empty >= 0) target = empty;
    }
    this.slots[target] = stack(id, maxStack(id));
    this.selected = target;
    return true;
  }

  toJSON() {
    return { slots: this.slots.map((s) => (s ? [s.id, s.count] : 0)), selected: this.selected };
  }

  static fromJSON(data) {
    const inv = new Inventory();
    if (data && Array.isArray(data.slots)) {
      data.slots.forEach((s, i) => {
        if (i < inv.slots.length && Array.isArray(s) && ITEMS.has(s[0]) && s[1] > 0) {
          inv.slots[i] = stack(s[0], Math.min(s[1], maxStack(s[0])));
        }
      });
      inv.selected = Math.min(8, Math.max(0, data.selected | 0));
    }
    return inv;
  }
}

// Minecraft-style slot click. `cursor` is the stack held by the mouse.
// Returns the new cursor. `button` is 0 (left) or 2 (right).
export function clickSlot(slots, index, cursor, button) {
  const slot = slots[index];
  if (button === 0) {
    if (!cursor) {
      slots[index] = null;
      return slot;
    }
    if (!slot) {
      slots[index] = cursor;
      return null;
    }
    if (slot.id === cursor.id) {
      const n = Math.min(maxStack(slot.id) - slot.count, cursor.count);
      slot.count += n;
      cursor.count -= n;
      return cursor.count > 0 ? cursor : null;
    }
    slots[index] = cursor;
    return slot;
  }
  // Right click: pick up half, or place one.
  if (!cursor) {
    if (!slot) return null;
    const half = Math.ceil(slot.count / 2);
    slot.count -= half;
    if (slot.count <= 0) slots[index] = null;
    return stack(slot.id, half);
  }
  if (!slot) {
    slots[index] = stack(cursor.id, 1);
  } else if (slot.id === cursor.id && slot.count < maxStack(slot.id)) {
    slot.count++;
  } else {
    slots[index] = cursor;
    return slot;
  }
  cursor.count--;
  return cursor.count > 0 ? cursor : null;
}

// ---------------------------------------------------------------------------
// Crafting

// grid: array of item ids (0 = empty) of length size*size.
export function matchRecipe(grid, size) {
  let minX = size, minY = size, maxX = -1, maxY = -1;
  const items = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = grid[y * size + x];
      if (id) {
        items.push(id);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (!items.length) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const at = (x, y) => grid[(minY + y) * size + (minX + x)];

  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.ingredients.length !== items.length) continue;
      const pool = [...items];
      let ok = true;
      for (const ing of r.ingredients) {
        const i = pool.indexOf(ing);
        if (i < 0) { ok = false; break; }
        pool.splice(i, 1);
      }
      if (ok) return { id: r.result, count: r.count };
      continue;
    }
    const ph = r.pattern.length;
    const pw = Math.max(...r.pattern.map((row) => row.length));
    if (pw !== w || ph !== h || pw > size || ph > size) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) {
        for (let x = 0; x < w && ok; x++) {
          const ch = r.pattern[y][mirror ? w - 1 - x : x] || ' ';
          const want = ch === ' ' ? 0 : r.key[ch];
          if ((at(x, y) || 0) !== want) ok = false;
        }
      }
      if (ok) return { id: r.result, count: r.count };
    }
  }
  return null;
}

// Consumes one of each ingredient from a crafting grid of stacks.
export function consumeCraftingGrid(slots) {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s) {
      s.count--;
      if (s.count <= 0) slots[i] = null;
    }
  }
}
