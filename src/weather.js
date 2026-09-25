// Weather: clear skies, rain (snow in cold biomes) and thunderstorms with
// lightning. Rain falls only on columns open to the sky, like the original.
import { textureLayer } from './mesher.js';

const RADIUS = 11;

export class Weather {
  constructor() {
    this.rain = 0; // 0..1 current intensity
    this.raining = false;
    this.thunder = false;
    this.timer = 300 + Math.random() * 600; // seconds until the weather changes
    this.flash = 0;
    this.bolts = [];
    this.boltTimer = 10;
  }

  set(kind, duration = 300 + Math.random() * 300) {
    this.raining = kind !== 'clear';
    this.thunder = kind === 'thunder';
    this.timer = duration;
  }

  // Shared with other players in multiplayer.
  toJSON() {
    return { rain: this.rain, raining: this.raining, thunder: this.thunder, timer: this.timer };
  }

  fromJSON(w) {
    if (!w) return;
    this.raining = !!w.raining;
    this.thunder = !!w.thunder;
    if (Number.isFinite(w.timer)) this.timer = w.timer;
    if (Number.isFinite(w.rain) && Math.abs(w.rain - this.rain) > 0.5) this.rain = w.rain;
  }

  get kind() {
    return this.thunder ? 'thunder' : this.raining ? 'rain' : 'clear';
  }

  // `authority`: only one player decides the weather in multiplayer.
  update(dt, game, authority = true) {
    if (authority) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.raining) this.set('clear', 600 + Math.random() * 900);
        else this.set(Math.random() < 0.3 ? 'thunder' : 'rain', 240 + Math.random() * 360);
        game.net?.sendWeather?.();
      }
    }
    const target = this.raining ? 1 : 0;
    this.rain += Math.sign(target - this.rain) * Math.min(Math.abs(target - this.rain), dt / 8);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    if (this.thunder && this.rain > 0.8 && authority) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = 5 + Math.random() * 20;
        const p = game.player.pos;
        const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 60;
        this.strike(game, Math.floor(p[0] + Math.cos(a) * d), Math.floor(p[2] + Math.sin(a) * d));
        game.net?.sendLightning?.(this.bolts[this.bolts.length - 1]);
      }
    }
    game.sound.setRain?.(this.rain * (game.player?.headInWater ? 0.2 : 1));
  }

  // A lightning bolt from the clouds to the ground at (x, z).
  // `remote`: a bolt another player's game created (it already hurt the mobs).
  strike(game, x, z, seed = Math.random(), remote = false) {
    const w = game.world;
    const ground = w.isReady(x, z) ? w.heightAt(x, z) + 1 : 64;
    const pts = [];
    let px = x + 0.5, pz = z + 0.5;
    let rnd = seed * 9999;
    const r = () => { rnd = (rnd * 16807) % 2147483647; return (rnd % 1000) / 1000; };
    for (let y = ground + 70; y > ground; y -= 3 + r() * 4) {
      pts.push([px, y, pz]);
      px += (r() - 0.5) * 2.4; pz += (r() - 0.5) * 2.4;
    }
    pts.push([x + 0.5, ground, z + 0.5]);
    this.bolts.push({ pts, life: 0.35, x, z, seed });
    this.flash = 1;
    const dist = Math.hypot(game.player.pos[0] - x, game.player.pos[2] - z);
    game.sound.thunder?.(dist);
    // Mobs and players struck take damage.
    const p = game.player;
    if (Math.hypot(p.pos[0] - x - 0.5, p.pos[2] - z - 0.5) < 2) p.damage(5, game.pendingEvents, game.creative);
    if (remote) return;
    for (const e of game.entities.list) {
      if (e.kind === 'mob' && Math.hypot(e.pos[0] - x - 0.5, e.pos[2] - z - 0.5) < 2) e.hurt(5, null, game.entities);
    }
  }

  // Quads for the rain/snow columns around the camera:
  // Float32Array of [x, y, z, u, v, layer, alpha] (camera-relative).
  buildMesh(world, cam, time, generator) {
    if (this.rain <= 0.01) return null;
    const rainLayer = textureLayer('rain_streaks');
    const snowLayer = textureLayer('snowfall');
    const cx = Math.floor(cam[0]), cz = Math.floor(cam[2]);
    const out = [];
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > RADIUS) continue;
        const x = cx + dx, z = cz + dz;
        if (!world.isReady(x, z)) continue;
        const top = world.heightAt(x, z) + 1;
        const y1 = cam[1] + 14;
        const y0 = Math.max(top, cam[1] - 12);
        if (y1 <= y0) continue;
        const snow = generator.column(x, z).temp < -0.25;
        const h = ((x * 734287 + z * 912931) >>> 0) % 997 / 997;
        const speed = snow ? 0.8 : 7;
        const fall = time * speed + h * 8;
        // Face the camera, rotating around the vertical axis.
        const ox = x + 0.5 - cam[0], oz = z + 0.5 - cam[2];
        const len = Math.hypot(ox, oz) || 1;
        const rx = (-oz / len) * 0.5, rz = (ox / len) * 0.5;
        const sway = snow ? Math.sin(time * 1.3 + h * 20) * 0.25 : 0;
        // Fade far columns and the ones right at the camera (huge flakes).
        const alpha = this.rain * (1 - d / (RADIUS + 1)) * Math.min(1, d / 2.5) * (snow ? 0.95 : 0.55);
        const layer = snow ? snowLayer : rainLayer;
        const v0 = (y0 + fall) / 4, v1 = (y1 + fall) / 4;
        const bx = ox + sway, by0 = y0 - cam[1], by1 = y1 - cam[1];
        out.push(
          bx - rx, by0, oz - rz, h, v1, layer, alpha,
          bx + rx, by0, oz + rz, h + 1, v1, layer, alpha,
          bx + rx, by1, oz + rz, h + 1, v0, layer, alpha,
          bx - rx, by0, oz - rz, h, v1, layer, alpha,
          bx + rx, by1, oz + rz, h + 1, v0, layer, alpha,
          bx - rx, by1, oz - rz, h, v0, layer, alpha,
        );
      }
    }
    return out.length ? new Float32Array(out) : null;
  }

  // Lightning bolts as camera-facing strips: same vertex format.
  buildBoltMesh(cam) {
    if (!this.bolts.length) return null;
    const layer = textureLayer('lightning');
    const out = [];
    for (const b of this.bolts) {
      for (let i = 0; i + 1 < b.pts.length; i++) {
        const [ax, ay, az] = b.pts[i], [bx, by, bz] = b.pts[i + 1];
        const mx = (ax + bx) / 2 - cam[0], mz = (az + bz) / 2 - cam[2];
        const len = Math.hypot(mx, mz) || 1;
        const rx = (-mz / len) * 0.25, rz = (mx / len) * 0.25;
        const p = (x, y, z, u, v) => out.push(x - cam[0], y - cam[1], z - cam[2], u, v, layer, 1);
        p(ax - rx, ay, az - rz, 0.2, 0.2); p(ax + rx, ay, az + rz, 0.8, 0.2); p(bx + rx, by, bz + rz, 0.8, 0.8);
        p(ax - rx, ay, az - rz, 0.2, 0.2); p(bx + rx, by, bz + rz, 0.8, 0.8); p(bx - rx, by, bz - rz, 0.2, 0.8);
      }
    }
    return new Float32Array(out);
  }
}
