import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapShader, headerLines, PRESETS, TEMPLATE } from '../src/shaderpacks.js';

test('shader packs are wrapped with the inputs they can use', () => {
  const src = wrapShader(TEMPLATE);
  for (const u of ['uScene', 'uDepth', 'uResolution', 'uTime', 'uDaylight', 'uUnderwater', 'uNether', 'vUV']) assert.match(src, new RegExp(u));
  assert.equal((src.match(/out vec4 fragColor/g) || []).length, 1);
  // #version and precision lines from pasted code are dropped.
  assert.doesNotMatch(wrapShader('#version 300 es\nprecision mediump float;\nvoid main(){fragColor=vec4(1.0);}'), /#version|mediump/);
});

test('Shadertoy-style packs get a main() that calls mainImage', () => {
  const src = wrapShader('void mainImage(out vec4 c, in vec2 p) { c = texture(iChannel0, p / iResolution.xy); }');
  assert.match(src, /void main\(\) \{ mainImage\(fragColor, vUV \* uResolution\)/);
  assert.equal(PRESETS.length >= 5, true);
  for (const p of PRESETS) assert.ok(p.name && /main/.test(p.source), p.name);
});

test('errors point at the pack\'s own lines', () => {
  const user = 'void main() {\n  fragColor = oops;\n}';
  const compiled = ['#version 300 es', '#define FANCY 0', ...wrapShader(user).split('\n')];
  const line = compiled.findIndex((l) => l.includes('oops')) + 1; // 1-based, as a compiler reports it
  assert.equal(line - headerLines(user), 2);
});
