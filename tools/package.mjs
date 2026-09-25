// Builds the downloadable release files:
//   downloads/ClaudeCraft.exe  - Windows launcher with the game embedded (needs Go)
//   downloads/ClaudeCraft.zip  - HTML game + Windows launcher + instructions
// Usage: node tools/package.mjs
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { buildDist } from './build.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'downloads');

const README = `ClaudeCraft
===========

A Minecraft-inspired voxel sandbox game, written from scratch in JavaScript
and WebGL2. No installation needed.

HOW TO PLAY
-----------
Windows:  double-click ClaudeCraft.exe
          (it opens the game in a Microsoft Edge / Chrome app window).
          If Windows SmartScreen warns about an unknown publisher, click
          "More info" -> "Run anyway" (the launcher is not code-signed).
Any OS:   double-click ClaudeCraft.html to play it in your web browser
          (Chrome, Edge or Firefox recommended).

CONTROLS
--------
WASD            move              Mouse          look around
Space           jump / swim       Shift          sneak / fly down
Ctrl or W-W     sprint            Space-Space    fly (Creative)
Left click      break block       Right click    place block / use table
Middle click    pick block        1-9 / wheel    choose hotbar slot
E               inventory         F3             debug info
Esc             pause menu        F1             hide HUD

Your worlds are saved automatically in the browser.

Source code: https://github.com/Jeep200092919/Minecraft-Claude-Version
`;

// --- Minimal ZIP writer (deflate) ---------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp keeps the archive byte-for-byte reproducible.
const DOS_TIME = (12 << 11) | (0 << 5);
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// --- Build steps ------------------------------------------------------------------

function hasGo() {
  try {
    execFileSync('go', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function buildExe(html) {
  const launcher = join(ROOT, 'launcher');
  await copyFile(html, join(launcher, 'claudecraft.html'));
  const exe = join(OUT, 'ClaudeCraft.exe');
  execFileSync('go', ['build', '-trimpath', '-ldflags', '-s -w -H windowsgui', '-o', exe, '.'], {
    cwd: launcher,
    stdio: 'inherit',
    env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0', GOFLAGS: '-buildvcs=false' },
  });
  return exe;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const html = await buildDist();
  const files = [
    { name: 'ClaudeCraft/ClaudeCraft.html', data: await readFile(html) },
    { name: 'ClaudeCraft/README.txt', data: Buffer.from(README.replace(/\n/g, '\r\n')) },
  ];
  if (hasGo()) {
    const exe = await buildExe(html);
    console.log(`Built downloads/ClaudeCraft.exe (${((await stat(exe)).size / 1024 / 1024).toFixed(2)} MiB)`);
    files.splice(1, 0, { name: 'ClaudeCraft/ClaudeCraft.exe', data: await readFile(exe) });
  } else {
    console.warn('Go is not installed: skipping ClaudeCraft.exe (the zip will only contain the HTML game).');
  }
  const zip = createZip(files);
  await writeFile(join(OUT, 'ClaudeCraft.zip'), zip);
  await copyFile(html, join(OUT, 'ClaudeCraft.html'));
  console.log(`Built downloads/ClaudeCraft.zip (${(zip.length / 1024 / 1024).toFixed(2)} MiB) with ${files.map((f) => f.name.split('/')[1]).join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
