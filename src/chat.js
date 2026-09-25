// Chat box and commands (T to talk, / for commands).
import { ITEMS } from './blocks.js';
import { MOBS } from './mobs.js';
import { maxStack } from './inventory.js';

const $ = (id) => document.getElementById(id);
const VISIBLE_SECONDS = 10;

export class Chat {
  constructor(game) {
    this.game = game;
    this.lines = []; // { text, color, time }
    this.history = [];
    this.historyIndex = -1;
    this.open = false;
    const input = $('chat-input');
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        this.close();
        if (text) this.submit(text);
      } else if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowUp' && this.history.length) {
        this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
        input.value = this.history[this.history.length - 1 - this.historyIndex];
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        this.historyIndex = Math.max(-1, this.historyIndex - 1);
        input.value = this.historyIndex < 0 ? '' : this.history[this.history.length - 1 - this.historyIndex];
        e.preventDefault();
      }
    });
  }

  show(prefix = '') {
    const g = this.game;
    if (g.state !== 'playing') return;
    g.state = 'chat';
    g.mining = null;
    g.input.unlock();
    g.input.reset();
    this.open = true;
    const input = $('chat-input');
    input.value = prefix;
    $('chat').classList.add('open');
    setTimeout(() => { input.focus(); input.setSelectionRange(prefix.length, prefix.length); }, 0);
    this.historyIndex = -1;
    this.render();
  }

  close() {
    const g = this.game;
    this.open = false;
    $('chat').classList.remove('open');
    $('chat-input').blur();
    if (g.state === 'chat') {
      g.state = 'playing';
      g.input.reset();
      g.lockPointer();
    }
    this.render();
  }

  submit(text) {
    this.history.push(text);
    if (text.startsWith('/')) this.command(text.slice(1));
    else if (this.game.net) this.game.net.sendChat(text);
    else this.add(`<${this.game.playerName || 'Player'}> ${text}`);
  }

  add(text, color = '#ffffff') {
    this.lines.push({ text, color, time: this.game.seconds });
    if (this.lines.length > 100) this.lines.shift();
    this.render();
  }

  // Called every frame so old lines fade away.
  tick() {
    const now = this.game.seconds;
    const sig = this.open ? 'open' : this.lines.filter((l) => now - l.time < VISIBLE_SECONDS).length;
    if (sig !== this.lastSig) this.render();
  }

  render() {
    const box = $('chat-lines');
    const now = this.game.seconds;
    const lines = this.open ? this.lines.slice(-20) : this.lines.filter((l) => now - l.time < VISIBLE_SECONDS).slice(-10);
    this.lastSig = this.open ? 'open' : lines.length;
    box.innerHTML = '';
    for (const l of lines) {
      const div = document.createElement('div');
      div.textContent = l.text;
      div.style.color = l.color;
      box.appendChild(div);
    }
  }

  error(msg) {
    this.add(msg, '#ff5555');
  }

  command(line) {
    const g = this.game;
    const [cmd, ...args] = line.trim().split(/\s+/);
    const p = g.player;
    const num = (v, rel) => (v?.startsWith('~') ? rel + (Number(v.slice(1)) || 0) : Number(v));
    // Some commands change the shared world; in multiplayer they go through
    // the player who runs the world simulation.
    switch ((cmd || '').toLowerCase()) {
      case 'help':
        this.add('Commands: /time set <day|noon|night|midnight|n>, /time add <n>, /weather <clear|rain|thunder>, /gamemode <survival|creative>, /tp <x> <y> <z>, /give <item> [count], /summon <mob> [slime size], /kill, /spawnpoint, /xp <n>, /clear, /seed', '#aaaaaa');
        return;
      case 'time': {
        const names = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };
        let t = g.ticks;
        if (args[0] === 'set') t = names[args[1]] ?? Number(args[1]);
        else if (args[0] === 'add') t = g.ticks + Number(args[1]);
        else return this.error('Usage: /time set <day|noon|night|midnight|ticks> or /time add <ticks>');
        if (!Number.isFinite(t)) return this.error('Invalid time');
        g.ticks = ((t % 24000) + 24000) % 24000;
        g.net?.sendTime?.(g.ticks);
        this.add(`Set the time to ${Math.round(g.ticks)}`, '#aaaaaa');
        return;
      }
      case 'weather': {
        const kind = args[0];
        if (!['clear', 'rain', 'thunder'].includes(kind)) return this.error('Usage: /weather <clear|rain|thunder>');
        g.weather.set(kind, Number(args[1]) || undefined);
        g.net?.sendWeather?.();
        this.add(`Changing to ${kind === 'clear' ? 'clear weather' : kind === 'rain' ? 'rain' : 'rain and thunder'}`, '#aaaaaa');
        return;
      }
      case 'gamemode': {
        const m = (args[0] || '').toLowerCase();
        const creative = ['creative', 'c', '1'].includes(m);
        if (!creative && !['survival', 's', '0'].includes(m)) return this.error('Usage: /gamemode <survival|creative>');
        g.setGameMode(creative ? 'creative' : 'survival');
        this.add(`Set own game mode to ${creative ? 'Creative' : 'Survival'} Mode`, '#aaaaaa');
        return;
      }
      case 'tp':
      case 'teleport': {
        const x = num(args[0], p.pos[0]), y = num(args[1], p.pos[1]), z = num(args[2], p.pos[2]);
        if (![x, y, z].every(Number.isFinite)) return this.error('Usage: /tp <x> <y> <z> (~ for relative)');
        p.pos = [x, y, z];
        p.vel = [0, 0, 0];
        p.fallDistance = 0;
        this.add(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`, '#aaaaaa');
        return;
      }
      case 'give': {
        const name = (args[0] || '').toLowerCase().replace(/^minecraft:/, '');
        const it = [...ITEMS.values()].find((x) => x.name === name || x.displayName.toLowerCase() === name.replace(/_/g, ' '));
        if (!it) return this.error(`Unknown item '${args[0] || ''}'`);
        const count = Math.max(1, Math.min(64 * 36, Number(args[1]) || 1));
        let left = count;
        while (left > 0) {
          const n = Math.min(left, maxStack(it.id));
          if (g.inventory.add(it.id, n)) g.entities.dropItem({ id: it.id, count: n }, ...p.eye());
          left -= n;
        }
        this.add(`Gave ${count} [${it.displayName}]`, '#aaaaaa');
        return;
      }
      case 'summon': {
        const type = (args[0] || '').toLowerCase();
        if (!MOBS[type]) return this.error(`Unknown mob '${args[0] || ''}'. Try: ${Object.keys(MOBS).join(', ')}`);
        const d = p.lookDir();
        const size = Number(args[1]);
        g.entities.spawn(type, p.pos[0] + d[0] * 2, p.pos[1], p.pos[2] + d[2] * 2, { size: [1, 2, 4].includes(size) ? size : 0 });
        this.add(`Summoned new ${type}`, '#aaaaaa');
        return;
      }
      case 'kill':
        p.damage(1000, g.pendingEvents, false, { bypassArmor: true });
        return;
      case 'spawnpoint':
        p.spawn = [...p.pos];
        this.add('Set your spawn point', '#aaaaaa');
        return;
      case 'xp':
      case 'experience': {
        const n = Number(args[0]);
        if (!Number.isFinite(n)) return this.error('Usage: /xp <amount>');
        g.gainXP(n);
        this.add(`Gave ${n} experience`, '#aaaaaa');
        return;
      }
      case 'clear':
        g.inventory.slots.fill(null);
        g.inventory.armor.fill(null);
        g.ui.hotbarSig = '';
        this.add('Cleared your inventory', '#aaaaaa');
        return;
      case 'seed':
        this.add(`Seed: ${g.world.seed}`, '#aaaaaa');
        return;
      default:
        this.error(`Unknown command '/${cmd}'. Type /help for a list.`);
    }
  }
}
