// DOM user interface: menus, HUD, inventory and crafting screens.
import { ITEMS, CREATIVE_ITEMS } from './blocks.js';
import { clickSlot, matchRecipe, consumeCraftingGrid, maxStack, stack } from './inventory.js';
import { itemIcon, hudIcons, dirtBackground, textureDataURL } from './icons.js';
import { MAX_HEALTH, MAX_AIR } from './player.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screen = null;
    this.hotbarSig = '';
    this.statusSig = '';
    this.cursor = null; // stack held by the mouse in inventory screens
    this.craft = null; // { size, slots }
    this.selectedWorld = null;
    this.itemNameTimer = 0;
    this.toastTimer = 0;
    this.optionsReturn = 'title';
    this.controlsReturn = 'title';

    const dirt = `url(${dirtBackground()})`;
    document.querySelectorAll('.screen.dirt').forEach((el) => (el.style.backgroundImage = dirt));
    const logo = document.querySelector('.logo');
    logo.style.backgroundImage = `url(${textureDataURL('stone', 1.2)})`;
    logo.style.backgroundColor = '#9a9a9a';

    this.buildHotbar();
    this.bindButtons();
    this.bindOptions();
    this.bindInventoryEvents();
  }

  // --- Screens -----------------------------------------------------------------

  show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    this.screen = name;
    if (name) $(`screen-${name}`).classList.add('active');
    if (name !== 'inventory') this.hideTooltip();
  }

  setHudVisible(v) {
    $('hud').classList.toggle('hidden', !v);
  }

  bindButtons() {
    const actions = {
      singleplayer: () => this.showWorlds(),
      controls: () => { this.controlsReturn = 'title'; this.show('controls'); },
      'controls-game': () => { this.controlsReturn = 'pause'; this.show('controls'); },
      'controls-done': () => this.show(this.controlsReturn),
      'options-title': () => { this.optionsReturn = 'title'; this.showOptions(); },
      'options-game': () => { this.optionsReturn = 'pause'; this.showOptions(); },
      'options-done': () => { this.game.saveSettings(); this.show(this.optionsReturn); },
      'back-title': () => this.show('title'),
      'back-worlds': () => this.showWorlds(),
      'create-world': () => this.showCreate(),
      'play-selected': () => this.selectedWorld && this.game.playWorld(this.selectedWorld),
      'delete-world': () => {
        const w = this.game.storage.listWorlds().find((x) => x.id === this.selectedWorld);
        if (w && confirm(`Delete "${w.name}"? This cannot be undone.`)) {
          this.game.storage.deleteWorld(w.id);
          this.selectedWorld = null;
          this.showWorlds();
        }
      },
      resume: () => this.game.resume(),
      'save-quit': () => this.game.saveAndQuit(),
      respawn: () => this.game.respawn(),
    };
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      this.game.sound.unlock();
      this.game.sound.click();
      actions[btn.dataset.action]?.();
    });
    $('screen-resume').addEventListener('click', () => this.game.resume());

    const modeBtn = $('btn-mode');
    modeBtn.addEventListener('click', () => {
      const creative = modeBtn.dataset.mode === 'survival';
      modeBtn.dataset.mode = creative ? 'creative' : 'survival';
      modeBtn.textContent = `Game Mode: ${creative ? 'Creative' : 'Survival'}`;
      $('mode-hint').textContent = creative
        ? 'Unlimited blocks, instant breaking, flying (double-tap Space), no damage.'
        : 'Gather resources, craft tools, survive falls, lava and drowning.';
    });
    $('create-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.game.sound.unlock();
      this.game.createWorld({
        name: $('world-name').value.trim() || 'New World',
        seed: $('world-seed').value.trim(),
        mode: modeBtn.dataset.mode,
      });
    });
  }

  showWorlds() {
    const list = $('world-list');
    list.innerHTML = '';
    const worlds = this.game.storage.listWorlds();
    $('no-worlds').classList.toggle('hidden', worlds.length > 0);
    list.classList.toggle('hidden', worlds.length === 0);
    if (!worlds.some((w) => w.id === this.selectedWorld)) this.selectedWorld = worlds[0]?.id ?? null;
    for (const w of worlds) {
      const li = document.createElement('li');
      li.dataset.id = w.id;
      if (w.id === this.selectedWorld) li.classList.add('sel');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = w.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${w.mode === 'creative' ? 'Creative' : 'Survival'} · seed ${w.seed} · ${new Date(w.lastPlayed).toLocaleString()}`;
      li.append(name, meta);
      li.addEventListener('click', () => {
        this.selectedWorld = w.id;
        list.querySelectorAll('li').forEach((x) => x.classList.toggle('sel', x.dataset.id === w.id));
        this.updateWorldButtons();
      });
      li.addEventListener('dblclick', () => this.game.playWorld(w.id));
      list.appendChild(li);
    }
    this.updateWorldButtons();
    this.show('worlds');
  }

  updateWorldButtons() {
    $('btn-play').disabled = !this.selectedWorld;
    $('btn-delete').disabled = !this.selectedWorld;
  }

  showCreate() {
    const n = this.game.storage.listWorlds().length;
    $('world-name').value = n ? `New World ${n + 1}` : 'New World';
    $('world-seed').value = '';
    this.show('create');
    $('world-name').focus();
    $('world-name').select();
  }

  setLoading(progress, detail) {
    $('loading-bar').style.width = `${Math.round(progress * 100)}%`;
    if (detail) $('loading-detail').textContent = detail;
  }

  showError(message) {
    $('error-text').textContent = message;
    this.show('error');
  }

  // --- Options ---------------------------------------------------------------------

  bindOptions() {
    const s = () => this.game.settings;
    const bindRange = (id, key, fmt) => {
      const input = $(id);
      const label = $(`${id}-val`);
      input.addEventListener('input', () => {
        s()[key] = Number(input.value);
        label.textContent = fmt(s()[key]);
        this.game.applySettings();
      });
      this[`refresh_${key}`] = () => {
        input.value = s()[key];
        label.textContent = fmt(s()[key]);
      };
    };
    bindRange('opt-rd', 'renderDistance', (v) => `${v} chunks`);
    bindRange('opt-fov', 'fov', (v) => `${v}`);
    bindRange('opt-sens', 'sensitivity', (v) => `${v}%`);
    bindRange('opt-vol', 'volume', (v) => (v ? `${v}%` : 'OFF'));
    const toggle = (id, key, label) => {
      $(id).addEventListener('click', () => {
        s()[key] = !s()[key];
        $(id).textContent = `${label}: ${s()[key] ? 'ON' : 'OFF'}`;
        this.game.applySettings();
      });
      this[`refresh_${key}`] = () => ($(id).textContent = `${label}: ${s()[key] ? 'ON' : 'OFF'}`);
    };
    toggle('opt-bob', 'viewBobbing', 'View Bobbing');
    toggle('opt-invert', 'invertMouse', 'Invert Mouse');
    toggle('opt-shaders', 'shaders', 'Shaders');
    toggle('opt-shadows', 'shadows', 'Shadows');
  }

  showOptions() {
    for (const k of ['renderDistance', 'fov', 'sensitivity', 'volume', 'viewBobbing', 'invertMouse', 'shaders', 'shadows']) this[`refresh_${k}`]();
    this.show('options');
  }

  // --- HUD --------------------------------------------------------------------------

  buildHotbar() {
    const bar = $('hotbar');
    this.hotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'hslot';
      bar.appendChild(el);
      this.hotbarSlots.push(el);
    }
  }

  renderStackInto(el, s) {
    el.innerHTML = '';
    if (!s) return;
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.style.backgroundImage = `url(${itemIcon(s.id)})`;
    el.appendChild(icon);
    if (s.count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = s.count;
      el.appendChild(c);
    }
  }

  updateHotbar(inv) {
    const sig = inv.selected + '|' + inv.slots.slice(0, 9).map((s) => (s ? `${s.id}x${s.count}` : '-')).join(',');
    if (sig === this.hotbarSig) return;
    this.hotbarSig = sig;
    this.hotbarSlots.forEach((el, i) => {
      el.classList.toggle('sel', i === inv.selected);
      this.renderStackInto(el, inv.slots[i]);
    });
  }

  updateStatus(player, creative) {
    const air = player.headInWater || player.air < MAX_AIR ? Math.ceil((player.air / MAX_AIR) * 10) : -1;
    const sig = `${creative}|${player.health}|${air}|${player.hurtTime > 0}`;
    if (sig === this.statusSig) return;
    this.statusSig = sig;
    const hearts = $('hearts');
    const bubbles = $('bubbles');
    hearts.innerHTML = '';
    bubbles.innerHTML = '';
    $('bars').style.visibility = creative ? 'hidden' : 'visible';
    if (creative) return;
    const icons = hudIcons();
    for (let i = 0; i < MAX_HEALTH / 2; i++) {
      const img = document.createElement('img');
      const hp = player.health - i * 2;
      img.src = hp >= 2 ? icons.heartFull : hp === 1 ? icons.heartHalf : icons.heartEmpty;
      img.alt = '';
      hearts.appendChild(img);
    }
    hearts.classList.toggle('shake', player.health <= 4);
    for (let i = 0; i < Math.max(0, air); i++) {
      const img = document.createElement('img');
      img.src = icons.bubble;
      img.alt = '';
      bubbles.appendChild(img);
    }
    $('hurt').classList.toggle('on', player.hurtTime > 0.25);
  }

  setTint(kind) {
    const t = $('tint');
    t.className = kind || '';
  }

  showItemName(name) {
    const el = $('item-name');
    el.textContent = name || '';
    el.classList.add('on');
    this.itemNameTimer = 1.8;
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    this.toastTimer = 2.2;
  }

  tick(dt) {
    if (this.itemNameTimer > 0 && (this.itemNameTimer -= dt) <= 0) $('item-name').classList.remove('on');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) $('toast').classList.remove('on');
  }

  setDebug(visible, text) {
    const el = $('debug');
    el.classList.toggle('hidden', !visible);
    if (visible) el.innerHTML = text.split('\n').map((l) => `<span>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('\n');
  }

  // --- Inventory ----------------------------------------------------------------------

  openInventory(table) {
    const size = table ? 3 : 2;
    this.craft = { size, slots: new Array(size * size).fill(null), table };
    this.cursor = null;
    this.paletteScroll = 0;
    this.buildInventory();
    this.show('inventory');
  }

  // Returns crafting grid + cursor items to the inventory.
  closeInventory() {
    const inv = this.game.inventory;
    if (this.craft) {
      for (const s of this.craft.slots) if (s) inv.add(s.id, s.count);
    }
    if (this.cursor) inv.add(this.cursor.id, this.cursor.count);
    this.cursor = null;
    this.craft = null;
    this.updateCursor();
    this.hideTooltip();
  }

  buildInventory() {
    const panel = $('inventory-panel');
    panel.innerHTML = '';
    const creative = this.game.creative;
    const { size, table } = this.craft;

    if (creative && !table) {
      const h = document.createElement('h3');
      h.textContent = 'Creative Inventory';
      panel.appendChild(h);
      const pal = document.createElement('div');
      pal.className = 'grid palette';
      CREATIVE_ITEMS.forEach((id, i) => pal.appendChild(this.makeSlot('palette', i, stack(id, 1))));
      panel.appendChild(pal);
    } else {
      const h = document.createElement('h3');
      h.textContent = table ? 'Crafting Table' : 'Crafting';
      panel.appendChild(h);
      const row = document.createElement('div');
      row.className = 'crafting';
      const grid = document.createElement('div');
      grid.className = 'craft-grid';
      grid.style.gridTemplateColumns = `repeat(${size}, 36px)`;
      for (let i = 0; i < size * size; i++) grid.appendChild(this.makeSlot('craft', i));
      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      arrow.textContent = '➜';
      const result = this.makeSlot('result', 0);
      result.classList.add('big');
      row.append(grid, arrow, result);
      panel.appendChild(row);
    }
    const h2 = document.createElement('h3');
    h2.textContent = 'Inventory';
    panel.appendChild(h2);
    const main = document.createElement('div');
    main.className = 'grid';
    for (let i = 9; i < 36; i++) main.appendChild(this.makeSlot('inv', i));
    const hot = document.createElement('div');
    hot.className = 'grid hotbar-row';
    for (let i = 0; i < 9; i++) hot.appendChild(this.makeSlot('inv', i));
    panel.append(main, hot);
    this.refreshInventory();
  }

  makeSlot(kind, index, fixed = null) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.kind = kind;
    el.dataset.index = index;
    if (fixed) {
      el.dataset.item = fixed.id;
      this.renderStackInto(el, fixed);
    }
    return el;
  }

  craftResult() {
    if (!this.craft) return null;
    return matchRecipe(this.craft.slots.map((s) => (s ? s.id : 0)), this.craft.size);
  }

  refreshInventory() {
    const inv = this.game.inventory;
    const panel = $('inventory-panel');
    panel.querySelectorAll('.slot').forEach((el) => {
      const kind = el.dataset.kind, i = Number(el.dataset.index);
      if (kind === 'inv') this.renderStackInto(el, inv.slots[i]);
      else if (kind === 'craft') this.renderStackInto(el, this.craft.slots[i]);
      else if (kind === 'result') {
        const r = this.craftResult();
        this.renderStackInto(el, r ? stack(r.id, r.count) : null);
      }
    });
    this.updateCursor();
    this.hotbarSig = '';
    this.updateHotbar(inv);
  }

  updateCursor(x, y) {
    const el = $('cursor-stack');
    if (x !== undefined) {
      el.style.transform = `translate(${x - 16}px, ${y - 16}px)`;
    }
    const sig = this.cursor ? `${this.cursor.id}x${this.cursor.count}` : '';
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      this.renderStackInto(el, this.cursor);
    }
    el.classList.toggle('on', !!this.cursor);
  }

  hideTooltip() {
    $('tooltip').classList.remove('on');
  }

  bindInventoryEvents() {
    const panel = $('inventory-panel');
    panel.addEventListener('contextmenu', (e) => e.preventDefault());
    panel.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.slot');
      if (!el) return;
      e.preventDefault();
      this.onSlotClick(el, e.button === 2 ? 2 : 0, e.shiftKey);
      this.updateCursor(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.screen !== 'inventory') return;
      this.updateCursor(e.clientX, e.clientY);
      const el = e.target.closest?.('.slot');
      const tip = $('tooltip');
      let id = null;
      if (el) {
        const kind = el.dataset.kind, i = Number(el.dataset.index);
        if (kind === 'palette') id = Number(el.dataset.item);
        else if (kind === 'inv') id = this.game.inventory.slots[i]?.id;
        else if (kind === 'craft') id = this.craft.slots[i]?.id;
        else if (kind === 'result') id = this.craftResult()?.id;
      }
      if (id && !this.cursor) {
        tip.textContent = ITEMS.get(id).displayName;
        tip.style.left = `${e.clientX + 14}px`;
        tip.style.top = `${e.clientY - 28}px`;
        tip.classList.add('on');
      } else tip.classList.remove('on');
    });
    // Clicking outside the panel with a held stack puts it back.
    $('screen-inventory').addEventListener('mousedown', (e) => {
      if (e.target.id === 'screen-inventory' && this.cursor) {
        this.game.inventory.add(this.cursor.id, this.cursor.count);
        this.cursor = null;
        this.refreshInventory();
      }
    });
  }

  onSlotClick(el, button, shift) {
    const inv = this.game.inventory;
    const kind = el.dataset.kind;
    const i = Number(el.dataset.index);
    if (kind === 'palette') {
      const id = Number(el.dataset.item);
      if (shift) inv.add(id, maxStack(id));
      else if (this.cursor) this.cursor = null; // clicking the palette deletes the held stack
      else this.cursor = stack(id, button === 2 ? 1 : maxStack(id));
    } else if (kind === 'inv') {
      if (shift && inv.slots[i]) {
        this.quickMove(i);
      } else {
        this.cursor = clickSlot(inv.slots, i, this.cursor, button);
      }
    } else if (kind === 'craft') {
      if (shift && this.craft.slots[i]) {
        const s = this.craft.slots[i];
        const left = inv.add(s.id, s.count);
        this.craft.slots[i] = left ? stack(s.id, left) : null;
      } else {
        this.cursor = clickSlot(this.craft.slots, i, this.cursor, button);
      }
    } else if (kind === 'result') {
      this.takeResult(shift);
    }
    this.game.sound.click();
    this.refreshInventory();
  }

  quickMove(i) {
    const inv = this.game.inventory;
    const s = inv.slots[i];
    const [from, to] = i < 9 ? [9, 36] : [0, 9];
    const max = maxStack(s.id);
    for (let k = from; k < to && s.count > 0; k++) {
      const t = inv.slots[k];
      if (t && t.id === s.id && t.count < max) {
        const n = Math.min(max - t.count, s.count);
        t.count += n;
        s.count -= n;
      }
    }
    for (let k = from; k < to && s.count > 0; k++) {
      if (!inv.slots[k]) {
        inv.slots[k] = stack(s.id, s.count);
        s.count = 0;
      }
    }
    if (s.count <= 0) inv.slots[i] = null;
  }

  takeResult(shift) {
    const inv = this.game.inventory;
    for (let guard = 0; guard < 64; guard++) {
      const r = this.craftResult();
      if (!r) return;
      if (shift) {
        const left = inv.add(r.id, r.count);
        consumeCraftingGrid(this.craft.slots);
        if (left) {
          this.cursor = stack(r.id, left);
          return;
        }
        continue;
      }
      if (!this.cursor) this.cursor = stack(r.id, r.count);
      else if (this.cursor.id === r.id && this.cursor.count + r.count <= maxStack(r.id)) this.cursor.count += r.count;
      else return;
      consumeCraftingGrid(this.craft.slots);
      this.game.sound.pop();
      return;
    }
  }
}
