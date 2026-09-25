import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFont, glyphContours, GLYPHS } from '../src/font.js';
import { buildExtrudedSprite } from '../src/mesher.js';
import { generateTextures } from '../src/textures.js';

test('the pixel font is a well-formed TrueType file', () => {
  const buf = new DataView(buildFont());
  assert.equal(buf.getUint32(0), 0x00010000, 'sfnt version');
  const numTables = buf.getUint16(4);
  const tags = [];
  let sum = 0;
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tags.push(String.fromCharCode(buf.getUint8(o), buf.getUint8(o + 1), buf.getUint8(o + 2), buf.getUint8(o + 3)));
    const off = buf.getUint32(o + 8), len = buf.getUint32(o + 12);
    assert.ok(off % 4 === 0 && off + len <= buf.byteLength, `${tags[i]} in bounds`);
  }
  assert.deepEqual(tags, [...tags].sort(), 'tables sorted by tag');
  for (const t of ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']) assert.ok(tags.includes(t), t);
  // Whole-file checksum must be 0xB1B0AFBA once checkSumAdjustment is set.
  for (let i = 0; i < buf.byteLength; i += 4) sum = (sum + buf.getUint32(i)) >>> 0;
  assert.equal(sum, 0xb1b0afba);
  const maxp = 12 + tags.indexOf('maxp') * 16;
  assert.equal(buf.getUint16(buf.getUint32(maxp + 8) + 4), Object.keys(GLYPHS).length + 1, 'glyph count');
});

test('glyph outlines cover exactly the glyph pixels', () => {
  // Shoelace area of all contours (clockwise = negative in y-up space) must
  // equal the number of filled pixels: nothing missing, nothing doubled.
  const area = (c) => c.reduce((a, p, i) => a + (p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1]), 0) / 2;
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    const filled = rows.join('').split('').filter((c) => c === '#').length;
    const total = glyphContours(rows).reduce((a, c) => a + area(c), 0);
    assert.equal(-total || 0, filled, `glyph ${JSON.stringify(ch)}`);
  }
});

test('held item sprites are extruded one pixel thick', () => {
  generateTextures();
  const stick = buildExtrudedSprite('item_stick');
  assert.equal(stick.uvScale, 1 / 32);
  assert.ok(stick.quads > 20, 'sides for the silhouette');
  const solid = buildExtrudedSprite('item_diamond');
  assert.ok(solid.quads > 2);
});
