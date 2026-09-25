// End-to-end smoke test: serves the game, drives it in headless Chromium,
// fails on any console error and saves screenshots to ./screenshots.
// Usage: node tools/smoke.mjs [--dist]   (--dist tests the single-file build)
import { spawn, execSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'screenshots');
const useDist = process.argv.includes('--dist');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  let server = null;
  let url;
  if (useDist) {
    url = pathToFileURL(join(ROOT, 'dist/claudecraft.html')).href;
  } else {
    const port = 8765;
    server = spawn(process.execPath, [join(ROOT, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
    url = `http://localhost:${port}/`;
    await sleep(600);
  }
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(url);
    await page.waitForSelector('#screen-title.active', { timeout: 15000 });
    await sleep(4000);
    await page.screenshot({ path: join(OUT, '01-title.png'), timeout: 120000 });

    await page.click('[data-action="singleplayer"]');
    await page.click('[data-action="create-world"]');
    await page.fill('#world-name', 'Smoke Test');
    await page.fill('#world-seed', process.env.SEED || 'claude');
    if (process.env.MODE === 'creative') await page.click('#btn-mode');
    await page.click('#create-form button[type="submit"]');
    await page.waitForFunction(() => window.claudecraft?.state === 'playing', null, { timeout: 120000 });
    // Let more chunks stream in.
    await page.evaluate(() => { window.claudecraft.settings.renderDistance = 6; });
    await sleep(8000);
    await page.screenshot({ path: join(OUT, '02-world.png'), timeout: 120000 });

    const info = await page.evaluate(() => {
      const g = window.claudecraft;
      return { state: g.state, pos: g.player.pos, chunks: g.world.chunks.size, stats: g.renderer.stats, fps: g.fps };
    });
    console.log('World info:', JSON.stringify(info));

    // Look around and at the ground, open the inventory, check night time.
    await page.evaluate(() => { const g = window.claudecraft; g.player.pitch = -0.6; g.showDebug = true; });
    await sleep(1500);
    await page.screenshot({ path: join(OUT, '03-look-down-debug.png'), timeout: 120000 });
    await page.evaluate(() => { const g = window.claudecraft; g.showDebug = false; g.player.pitch = 0.05; g.ticks = 12600; });
    await sleep(1500);
    await page.screenshot({ path: join(OUT, '04-sunset.png'), timeout: 120000 });
    await page.evaluate(() => { window.claudecraft.ticks = 18000; });
    await sleep(1500);
    await page.screenshot({ path: join(OUT, '05-night.png'), timeout: 120000 });
    await page.evaluate(() => { const g = window.claudecraft; g.ticks = 6000; g.openInventory(false); });
    await sleep(800);
    await page.screenshot({ path: join(OUT, '06-inventory.png'), timeout: 120000 });
    await page.evaluate(() => window.claudecraft.closeInventory());
    if (errors.length) {
      console.error('Console errors:\n' + errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(`Smoke test passed. Screenshots in ${OUT}`);
    }
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
