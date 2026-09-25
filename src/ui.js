// DOM user interface: menus, HUD, inventory and crafting screens.
import { ITEMS, BLOCKS, CREATIVE_ITEMS, SMELTING, SMELT_TIME, fuelTime, isBlockItem } from './blocks.js';
import { clickSlot, matchRecipe, consumeCraftingGrid, maxStack, stack } from './inventory.js';
import { itemIcon, hudIcons, dirtBackground, logoDataURL, buttonTexture, playerPreview } from './icons.js';
import { MAX_HEALTH, MAX_AIR, MAX_HUNGER } from './player.js';

const $ = (id) => document.getElementById(id);

// Creative inventory tabs.
const TABS = [
  { key: 'building', label: 'Building Blocks', icon: 36 },
  { key: 'nature', label: 'Natural Blocks', icon: 2 },
  { key: 'functional', label: 'Functional Blocks', icon: 35 },
  { key: 'tools', label: 'Tools & Utilities', icon: 270 },
  { key: 'combat', label: 'Combat', icon: 276 },
  { key: 'food', label: 'Food & Drinks', icon: 284 },
  { key: 'materials', label: 'Ingredients', icon: 258 },
  { key: 'eggs', label: 'Spawn Eggs', icon: 304 },
  { key: 'search', label: 'Search', icon: 0 },
];
const NATURE = /(^|_)(grass|dirt|sand|gravel|clay|snow|ice|stone$|log|leaves|sapling|ore|mushroom|cactus|sugar_cane|pumpkin|melon|lily|fern|bush|flower|tulip|allium|bluet|daisy|poppy|dandelion|valley|cornflower|netherrack|soul_sand|magma|obsidian|granite|diorite|andesite|deepslate|bedrock|cobweb)/;
function tabOf(id) {
  const it = ITEMS.get(id);
  if (it.spawns) return 'eggs';
  if (it.food) return 'food';
  if (it.armor || it.bow || id === 307 || it.tool?.type === 'sword') return 'combat';
  if (it.tool || it.bucket !== undefined || it.throwable === 'ender_pearl' || ['flint_and_steel', 'compass', 'clock', 'bone_meal'].includes(it.name)) return 'tools';
  if (!isBlockItem(id)) return it.places ? 'functional' : 'materials';
  const b = BLOCKS[id];
  if (b.container || b.lightEmit || b.ladder || ['crafting_table', 'tnt', 'rail', 'spawner', 'bookshelf', 'hay_bale'].includes(b.name)) return 'functional';
  if (NATURE.test(b.name) && !/polished|brick|cut_|chiseled|smooth/.test(b.name)) return 'nature';
  return 'building';
}

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
    const art = logoDataURL('CLAUDECRAFT');
    logo.style.backgroundImage = `url(${art.url})`;
    logo.style.aspectRatio = `${art.width} / ${art.height}`;
    document.documentElement.style.setProperty('--button-tex', `url(${buttonTexture()})`);

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
    bindRange('opt-music', 'music', (v) => (v ? `${v}%` : 'OFF'));
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
    for (const k of ['renderDistance', 'fov', 'sensitivity', 'volume', 'music', 'viewBobbing', 'invertMouse', 'shaders', 'shadows']) this[`refresh_${k}`]();
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
    const max = ITEMS.get(s.id)?.durability;
    if (s.dmg && max) {
      const frac = Math.max(0, 1 - s.dmg / max);
      const bar = document.createElement('div');
      bar.className = 'dur';
      bar.innerHTML = `<div style="width:${Math.round(frac * 100)}%;background:hsl(${Math.round(frac * 120)},100%,45%)"></div>`;
      el.appendChild(bar);
    }
  }

  updateHotbar(inv) {
    const sig = inv.selected + '|' + inv.slots.slice(0, 9).map((s) => (s ? `${s.id}x${s.count}d${s.dmg || 0}` : '-')).join(',');
    if (sig === this.hotbarSig) return;
    this.hotbarSig = sig;
    this.hotbarSlots.forEach((el, i) => {
      el.classList.toggle('sel', i === inv.selected);
      this.renderStackInto(el, inv.slots[i]);
    });
  }

  updateStatus(player, creative) {
    const xpSig = `${creative}|${player.xpLevel}|${Math.round(player.xpProgress * 182)}|${player.armor}`;
    if (xpSig !== this.xpSig) {
      this.xpSig = xpSig;
      $('xp').style.visibility = creative ? 'hidden' : 'visible';
      $('xp-fill').style.width = `${(player.xpProgress * 100).toFixed(1)}%`;
      $('xp-level').textContent = player.xpLevel > 0 ? player.xpLevel : '';
      const armor = $('armor');
      armor.innerHTML = '';
      if (!creative && player.armor > 0) {
        const icons = hudIcons();
        for (let i = 0; i < 10; i++) {
          const img = document.createElement('img');
          const a = player.armor - i * 2;
          img.src = a >= 2 ? icons.armorFull : a === 1 ? icons.armorHalf : icons.armorEmpty;
          img.alt = '';
          armor.appendChild(img);
        }
      }
    }
    const air = player.headInWater || player.air < MAX_AIR ? Math.ceil((player.air / MAX_AIR) * 10) : -1;
    const starving = player.hunger <= 0 || (player.saturation <= 0 && Math.floor(this.game.seconds * 6) % 5 === 0);
    const sig = `${creative}|${player.health}|${air}|${player.hurtTime > 0}|${player.hunger}|${starving}|${player.absorption}`;
    if (sig === this.statusSig) return;
    this.statusSig = sig;
    const hearts = $('hearts');
    const bubbles = $('bubbles');
    const hunger = $('hunger');
    hearts.innerHTML = '';
    bubbles.innerHTML = '';
    hunger.innerHTML = '';
    $('bars').style.visibility = creative ? 'hidden' : 'visible';
    if (creative) return;
    const icons = hudIcons();
    for (let i = 0; i < MAX_HEALTH / 2; i++) {
      const img = document.createElement('img');
      const hp = player.health - i * 2;
      img.src = hp >= 2 ? icons.heartFull : hp >= 1 ? icons.heartHalf : icons.heartEmpty;
      img.alt = '';
      hearts.appendChild(img);
    }
    for (let i = 0; i < Math.ceil(player.absorption / 2); i++) {
      const img = document.createElement('img');
      img.src = player.absorption - i * 2 >= 2 ? icons.heartGold : icons.heartGoldHalf;
      img.alt = '';
      hearts.appendChild(img);
    }
    hearts.classList.toggle('shake', player.health <= 4);
    for (let i = 0; i < MAX_HUNGER / 2; i++) {
      const img = document.createElement('img');
      const f = player.hunger - i * 2;
      img.src = f >= 2 ? icons.foodFull : f === 1 ? icons.foodHalf : icons.foodEmpty;
      img.alt = '';
      hunger.appendChild(img);
    }
    hunger.classList.toggle('shake', starving);
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

  setSleepFade(v) {
    const el = $('sleep-fade');
    el.style.opacity = v;
    el.style.display = v > 0 ? 'block' : 'none';
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

  // mode: 'player', 'table' or a container { type: 'chest' | 'furnace', entity }.
  openInventory(mode) {
    this.container = typeof mode === 'object' && mode ? mode : null;
    if (this.container) {
      this.craft = null;
    } else {
      const table = mode === 'table';
      const size = table ? 3 : 2;
      this.craft = { size, slots: new Array(size * size).fill(null), table };
    }
    this.containerSig = '';
    this.cursor = null;
    this.paletteScroll = 0;
    this.tab = this.tab || 'building';
    this.search = '';
    this.buildInventory();
    this.show('inventory');
  }

  // Returns crafting grid + cursor items to the inventory.
  closeInventory() {
    const inv = this.game.inventory;
    if (this.craft) {
      for (const s of this.craft.slots) if (s) inv.add(s.id, s.count);
    }
    if (this.cursor) inv.addStack(this.cursor);
    this.cursor = null;
    this.craft = null;
    this.container = null;
    this.updateCursor();
    this.hideTooltip();
  }

  buildInventory() {
    const panel = $('inventory-panel');
    panel.innerHTML = '';
    const creative = this.game.creative;
    const { size, table } = this.craft || {};

    if (this.container) {
      this.buildContainer(panel);
    } else if (creative && !table) {
      this.buildCreative(panel);
    } else {
      const h = document.createElement('h3');
      h.textContent = table ? 'Crafting Table' : 'Crafting';
      panel.appendChild(h);
      const row = document.createElement('div');
      row.className = 'crafting';
      if (!table) {
        // Armour slots and a picture of the player, like the survival inventory.
        const armor = document.createElement('div');
        armor.className = 'armor-col';
        for (let i = 0; i < 4; i++) armor.appendChild(this.makeSlot('armor', i));
        const preview = document.createElement('div');
        preview.className = 'preview';
        preview.style.backgroundImage = `url(${playerPreview(this.game.skinIndex ?? 0)})`;
        row.append(armor, preview);
      }
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

  buildCreative(panel) {
    const tabs = document.createElement('div');
    tabs.className = 'ctabs';
    for (const t of TABS) {
      const b = document.createElement('div');
      b.className = `ctab${t.key === this.tab ? ' on' : ''}`;
      b.title = t.label;
      b.dataset.tab = t.key;
      if (t.icon) b.style.backgroundImage = `url(${itemIcon(t.icon)})`;
      else b.textContent = '?';
      tabs.appendChild(b);
    }
    panel.appendChild(tabs);
    const head = document.createElement('div');
    head.className = 'chead';
    const h = document.createElement('h3');
    h.textContent = TABS.find((t) => t.key === this.tab).label;
    head.appendChild(h);
    if (this.tab === 'search') {
      const input = document.createElement('input');
      input.id = 'creative-search';
      input.placeholder = 'Search items…';
      input.value = this.search;
      input.addEventListener('input', () => { this.search = input.value; this.fillPalette(); });
      input.addEventListener('keydown', (e) => e.stopPropagation());
      head.appendChild(input);
    }
    panel.appendChild(head);
    const pal = document.createElement('div');
    pal.className = 'grid palette';
    pal.id = 'palette';
    panel.appendChild(pal);
    this.fillPalette();
    if (this.tab === 'search') setTimeout(() => $('creative-search')?.focus(), 0);
  }

  fillPalette() {
    const pal = $('palette');
    if (!pal) return;
    pal.innerHTML = '';
    const q = this.search.trim().toLowerCase();
    const ids = CREATIVE_ITEMS.filter((id) => (this.tab === 'search' ? !q || ITEMS.get(id).displayName.toLowerCase().includes(q) : tabOf(id) === this.tab));
    ids.forEach((id, i) => pal.appendChild(this.makeSlot('palette', i, stack(id, 1))));
    for (let i = ids.length; i < Math.max(45, Math.ceil(ids.length / 9) * 9); i++) pal.appendChild(this.makeSlot('empty', i));
  }

  buildContainer(panel) {
    const { type } = this.container;
    const h = document.createElement('h3');
    h.textContent = type === 'chest' ? 'Chest' : 'Furnace';
    panel.appendChild(h);
    if (type === 'chest') {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (let i = 0; i < 27; i++) grid.appendChild(this.makeSlot('container', i));
      panel.appendChild(grid);
      return;
    }
    const row = document.createElement('div');
    row.className = 'crafting furnace';
    const col = document.createElement('div');
    col.className = 'furnace-col';
    const flame = document.createElement('div');
    flame.className = 'flame';
    flame.innerHTML = '<div id="furnace-flame"></div>';
    col.append(this.makeSlot('container', 0), flame, this.makeSlot('container', 1));
    const arrow = document.createElement('div');
    arrow.className = 'progress';
    arrow.innerHTML = '<div id="furnace-progress"></div>';
    const out = this.makeSlot('container', 2);
    out.classList.add('big');
    row.append(col, arrow, out);
    panel.appendChild(row);
  }

  // Called every frame while a container is open: furnaces change on their own.
  refreshContainer() {
    const c = this.container;
    if (!c || this.screen !== 'inventory') return;
    const be = c.entity;
    const sig = be.slots.map((s) => (s ? `${s.id}x${s.count}` : '-')).join(',');
    if (sig !== this.containerSig) {
      this.containerSig = sig;
      $('inventory-panel').querySelectorAll('.slot[data-kind="container"]').forEach((el) => {
        this.renderStackInto(el, be.slots[Number(el.dataset.index)]);
      });
    }
    if (c.type === 'furnace') {
      const flame = $('furnace-flame'), prog = $('furnace-progress');
      if (flame) flame.style.height = `${be.burnMax > 0 ? Math.round((be.burn / be.burnMax) * 100) : 0}%`;
      if (prog) prog.style.width = `${Math.round((be.cook / SMELT_TIME) * 100)}%`;
    }
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
      else if (kind === 'armor') {
        this.renderStackInto(el, inv.armor[i]);
        el.classList.toggle('armor-empty', !inv.armor[i]);
        el.dataset.piece = i;
      } else if (kind === 'container') this.renderStackInto(el, this.container.entity.slots[i]);
      else if (kind === 'result') {
        const r = this.craftResult();
        this.renderStackInto(el, r ? stack(r.id, r.count) : null);
      }
    });
    this.containerSig = '';
    this.refreshContainer();
    this.updateCursor();
    this.hotbarSig = '';
    this.updateHotbar(inv);
  }

  updateCursor(x, y) {
    const el = $('cursor-stack');
    if (x !== undefined) {
      el.style.transform = `translate(${x - 16}px, ${y - 16}px)`;
    }
    const sig = this.cursor ? `${this.cursor.id}x${this.cursor.count}d${this.cursor.dmg || 0}` : '';
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
      const tab = e.target.closest('.ctab');
      if (tab) {
        this.tab = tab.dataset.tab;
        this.game.sound.click();
        this.buildInventory();
        return;
      }
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
      let st = null;
      if (el) {
        const kind = el.dataset.kind, i = Number(el.dataset.index);
        const inv = this.game.inventory;
        if (kind === 'palette') st = { id: Number(el.dataset.item) };
        else if (kind === 'inv') st = inv.slots[i];
        else if (kind === 'armor') st = inv.armor[i];
        else if (kind === 'craft') st = this.craft.slots[i];
        else if (kind === 'container') st = this.container?.entity.slots[i];
        else if (kind === 'result') st = this.craftResult();
      }
      const id = st?.id;
      if (id && !this.cursor) {
        const it = ITEMS.get(id);
        tip.innerHTML = '';
        tip.append(it.displayName);
        const extra = [];
        if (it.armor) extra.push(`+${it.armor.points} Armor`);
        else if (it.tool || it.damage > 1) extra.push(`${it.damage} Attack Damage`);
        if (st.dmg && it.durability) extra.push(`Durability: ${it.durability - st.dmg} / ${it.durability}`);
        for (const line of extra) {
          const d = document.createElement('div');
          d.className = 'tip-extra';
          d.textContent = line;
          tip.appendChild(d);
        }
        tip.style.left = `${e.clientX + 14}px`;
        tip.style.top = `${e.clientY - 28}px`;
        tip.classList.add('on');
      } else tip.classList.remove('on');
    });
    // Clicking outside the panel with a held stack throws it on the ground.
    $('screen-inventory').addEventListener('mousedown', (e) => {
      if (e.target.id === 'screen-inventory' && this.cursor) {
        const g = this.game;
        if (g.creative) this.cursor = null;
        else {
          const p = g.player, eye = p.eye(), d = p.lookDir();
          const it = g.entities.dropItem(this.cursor, eye[0] + d[0] * 0.3, eye[1] - 0.3, eye[2] + d[2] * 0.3, [d[0] * 4, 2, d[2] * 4]);
          if (it) it.pickupDelay = 2;
          this.cursor = null;
        }
        this.refreshInventory();
      }
    });
  }

  onSlotClick(el, button, shift) {
    const inv = this.game.inventory;
    const kind = el.dataset.kind;
    const i = Number(el.dataset.index);
    if (kind === 'empty') {
      this.cursor = null; // dropping a stack into the creative palette deletes it
    } else if (kind === 'palette') {
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
    } else if (kind === 'armor') {
      const worn = inv.armor[i];
      const c = this.cursor;
      if (shift) {
        if (worn && inv.addStack(worn) === 0) inv.armor[i] = null;
      } else if (!c) {
        this.cursor = worn;
        inv.armor[i] = null;
      } else if (ITEMS.get(c.id)?.armor?.slot === i && c.count === 1) {
        inv.armor[i] = c;
        this.cursor = worn;
      }
    } else if (kind === 'result') {
      this.takeResult(shift);
    } else if (kind === 'container') {
      this.onContainerClick(i, button, shift);
    }
    this.game.sound.click();
    this.refreshInventory();
  }

  onContainerClick(i, button, shift) {
    const inv = this.game.inventory;
    const slots = this.container.entity.slots;
    const s = slots[i];
    const furnace = this.container.type === 'furnace';
    if (shift) {
      if (!s) return;
      const left = inv.add(s.id, s.count);
      slots[i] = left ? stack(s.id, left) : null;
      return;
    }
    if (furnace && i === 2) {
      // Output slot: take only.
      if (!s) return;
      if (!this.cursor) {
        this.cursor = s;
        slots[2] = null;
      } else if (this.cursor.id === s.id && this.cursor.count + s.count <= maxStack(s.id)) {
        this.cursor.count += s.count;
        slots[2] = null;
      }
      return;
    }
    if (furnace && i === 1 && this.cursor && fuelTime(this.cursor.id) <= 0) return;
    this.cursor = clickSlot(slots, i, this.cursor, button);
  }

  // Moves as much of `s` as fits into slots[from..to). Returns the leftover.
  moveInto(slots, s, from, to) {
    const max = maxStack(s.id);
    for (let k = from; k < to && s.count > 0; k++) {
      const t = slots[k];
      if (t && t.id === s.id && t.count < max) {
        const n = Math.min(max - t.count, s.count);
        t.count += n;
        s.count -= n;
      }
    }
    for (let k = from; k < to && s.count > 0; k++) {
      if (!slots[k]) {
        slots[k] = stack(s.id, s.count);
        s.count = 0;
      }
    }
    return s.count;
  }

  quickMove(i) {
    const inv = this.game.inventory;
    const s = inv.slots[i];
    const c = this.container;
    const armor = ITEMS.get(s.id)?.armor;
    if (!c && !this.game.creative && armor && !inv.armor[armor.slot]) {
      inv.armor[armor.slot] = s;
      inv.slots[i] = null;
      return;
    }
    if (c) {
      if (c.type === 'chest') this.moveInto(c.entity.slots, s, 0, 27);
      else if (SMELTING.has(s.id)) this.moveInto(c.entity.slots, s, 0, 1);
      else if (fuelTime(s.id) > 0) this.moveInto(c.entity.slots, s, 1, 2);
      if (s.count <= 0) inv.slots[i] = null;
      return;
    }
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
