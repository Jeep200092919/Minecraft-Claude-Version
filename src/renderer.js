// WebGL2 renderer with two pipelines:
//  - "fancy" (shaders on): HDR scene buffer, sun/moon shadow maps, physically
//    inspired lighting, atmospheric sky and fog, reflective water, bloom,
//    light shafts, ACES tonemapping and color grading;
//  - "vanilla" (shaders off): the classic look, rendered straight to screen.
import { CHUNK_SIZE } from './constants.js';
import { BLOCKS, isBlockItem } from './blocks.js';
import { generateTextures } from './textures.js';
import { VERTEX_BYTES, buildBlockMesh, buildOverlayCube, buildExtrudedSprite, itemSpriteName, textureLayer } from './mesher.js';
import {
  mat4, perspective, multiply, viewRotation, cameraBasis, frustumPlanes, aabbInFrustum,
  compose, translation, rotationX, rotationY, rotationZ, scaling, ortho, lookRotation, transformPoint,
} from './math.js';
import { SimplexNoise, mulberry32 } from './noise.js';
import { skyState } from './sky.js';
import * as S from './shaders.js';

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error(`Shader compile error: ${log}`);
  }
  return s;
}

function program(gl, vs, fs, fancy = false) {
  const head = `#version 300 es\n#define FANCY ${fancy ? 1 : 0}\n`;
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, head + vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, head + fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(p)}`);
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, u };
}

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lightCurve = (l) => Math.pow(0.84, (1 - l) * 15);

// Maps the 4x12x4 px arm box so its long axis runs from `shoulder` to `hand`.
function armMatrix(shoulder, hand, thickness) {
  const y = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
  const len = Math.hypot(...y);
  const yn = y.map((v) => v / len);
  let x = [yn[2], 0, -yn[0]];
  const xl = Math.hypot(...x) || 1;
  x = x.map((v) => v / xl);
  const z = [x[1] * yn[2] - x[2] * yn[1], x[2] * yn[0] - x[0] * yn[2], x[0] * yn[1] - x[1] * yn[0]];
  const sy = len / (12 / 16);
  const m = mat4();
  for (let i = 0; i < 3; i++) {
    m[i] = x[i] * thickness;
    m[4 + i] = yn[i] * sy;
    m[8 + i] = z[i] * thickness;
    m[12 + i] = shoulder[i] - (2 / 16) * thickness * (x[i] + z[i]);
  }
  return m;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.fancy = true;
    this.shadowsEnabled = true;
    this.shadowSize = 2048;
    this.shadowDistance = 96;
    this.resolutionScale = 1;

    this.prog = {
      chunk: program(gl, S.CHUNK_VS, S.CHUNK_FS, false),
      chunkFancy: program(gl, S.CHUNK_VS, S.CHUNK_FS, true),
      water: program(gl, S.CHUNK_VS, S.WATER_FS, true),
      shadow: program(gl, S.SHADOW_VS, S.SHADOW_FS),
      sky: program(gl, S.FULLSCREEN_VS, S.SKY_FS, false),
      skyFancy: program(gl, S.FULLSCREEN_VS, S.SKY_FS, true),
      cloud: program(gl, S.CLOUD_VS, S.CLOUD_FS, false),
      cloudFancy: program(gl, S.CLOUD_VS, S.CLOUD_FS, true),
      line: program(gl, S.LINE_VS, S.LINE_FS),
      particle: program(gl, S.PARTICLE_VS, S.PARTICLE_FS),
      bright: program(gl, S.FULLSCREEN_VS, S.BRIGHT_FS),
      blur: program(gl, S.FULLSCREEN_VS, S.BLUR_FS),
      copy: program(gl, S.FULLSCREEN_VS, S.COPY_FS),
      rayMask: program(gl, S.FULLSCREEN_VS, S.RAYMASK_FS),
      rays: program(gl, S.FULLSCREEN_VS, S.RAYS_FS),
      composite: program(gl, S.FULLSCREEN_VS, S.COMPOSITE_FS),
      weather: program(gl, S.WEATHER_VS, S.WEATHER_FS),
    };
    this.emptyVao = gl.createVertexArray();
    this.proj = mat4();
    this.view = mat4();
    this.viewProj = mat4();
    this.identity = mat4();
    this.shadowMatrix = mat4();
    this.quadCapacity = 0;
    this.indexBuffer = gl.createBuffer();
    this.ensureIndexCapacity(65536);
    this.initTextures();
    this.initClouds();
    this.initDynamicBuffers();
    this.crackMeshes = [];
    this.heldCache = new Map();
    this.targets = null;
    this.shadowTarget = null;
    this.exposure = 1;
    this.lastSeconds = 0;
    this.stats = { chunks: 0, drawn: 0, quads: 0 };
  }

  // --- Resources -----------------------------------------------------------------

  initTextures() {
    const gl = this.gl;
    const tex = generateTextures();
    this.textures = tex;
    const makeArray = (pixels, layers) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const L = 16 * 16 * 4;
    this.itemTexture = makeArray(tex.pixels.subarray(tex.itemBase * L), Math.max(1, tex.itemCount));
    this.texture = makeArray(tex.pixels.subarray(0, tex.blockCount * L), tex.blockCount);
    // No anisotropic filtering: several drivers then blur magnified texels.
    this.entityTexture = null;
  }

  // Entity skins: `count` layers of 64x64 RGBA pixels.
  setEntitySkins(pixels, count) {
    const gl = this.gl;
    if (!this.entityTexture) this.entityTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.entityTexture);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 64, 64, count, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  initClouds() {
    const gl = this.gl;
    // Vanilla: blocky tileable cloud map.
    const size = 128;
    const noise = new SimplexNoise(1234);
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
        const v = noise.fbm2(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3 * 0.9 + 20, 3) +
          noise.noise2D(Math.sin(b) * 3 + 40, Math.cos(b) * 3) * 0.35;
        data[y * size + x] = v > 0.12 ? 255 : 0;
      }
    }
    this.cloudTex = this.makeTexture2D(size, size, gl.R8, gl.RED, gl.UNSIGNED_BYTE, data, gl.NEAREST, gl.REPEAT);
    // Fancy: smooth tileable value noise (16x16 cells, smoothstep
    // interpolated), sampled at several scales as fBm in the shader.
    const n = 256, cells = 16, cell = n / cells;
    const rng = mulberry32(99);
    const grid = Array.from({ length: cells * cells }, () => rng());
    const g = (i, j) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)];
    const sm = (t) => t * t * (3 - 2 * t);
    const noiseData = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = x / cell, fy = y / cell;
        const i = Math.floor(fx), j = Math.floor(fy);
        const tx = sm(fx - i), ty = sm(fy - j);
        const a = g(i, j) + (g(i + 1, j) - g(i, j)) * tx;
        const b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * tx;
        noiseData[y * n + x] = Math.round((a + (b - a) * ty) * 255);
      }
    }
    this.noiseTex = this.makeTexture2D(n, n, gl.R8, gl.RED, gl.UNSIGNED_BYTE, noiseData, gl.LINEAR, gl.REPEAT);
    // Placeholder black texture for disabled effects.
    this.blackTex = this.makeTexture2D(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4), gl.NEAREST, gl.CLAMP_TO_EDGE);
  }

  makeTexture2D(w, h, internal, format, type, data, filter, wrap) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  initDynamicBuffers() {
    const gl = this.gl;
    this.lineBuffer = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 24 * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.particleBuffer = gl.createBuffer();
    this.particleVao = gl.createVertexArray();
    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
    this.weatherBuffer = gl.createBuffer();
    this.weatherVao = gl.createVertexArray();
    gl.bindVertexArray(this.weatherVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weatherBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    this.maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;
  }

  // Rain/snow columns and lightning (built by weather.js), alpha blended.
  drawWeather(state, light, linear) {
    const meshes = [[state.weatherMesh, light], [state.boltMesh, linear ? [12, 12, 16] : [1.5, 1.5, 1.6]]];
    if (!meshes.some(([m]) => m)) return;
    const gl = this.gl;
    const p = this.prog.weather;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform1f(p.u.uLinear, linear ? 1 : 0);
    gl.uniform1i(p.u.uTex, 0);
    this.bindBlockTexture(0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.weatherVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weatherBuffer);
    for (const [mesh, l] of meshes) {
      if (!mesh) continue;
      gl.uniform3fv(p.u.uLight, l);
      gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 7);
    }
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  // One shared index buffer describes every quad (0,1,2, 0,2,3 pattern).
  ensureIndexCapacity(quads) {
    if (quads <= this.quadCapacity) return;
    let cap = Math.max(this.quadCapacity * 2, 1024);
    while (cap < quads) cap *= 2;
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
      idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
    }
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quadCapacity = cap;
  }

  createMesh(data, quads, existing = null) {
    const gl = this.gl;
    if (!quads) {
      if (existing) this.deleteMesh(existing);
      return null;
    }
    this.ensureIndexCapacity(quads);
    const mesh = existing || { vao: gl.createVertexArray(), vbo: gl.createBuffer() };
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    if (!existing) {
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.SHORT, false, VERTEX_BYTES, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, false, VERTEX_BYTES, 6);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, VERTEX_BYTES, 8);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, false, VERTEX_BYTES, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    }
    gl.bindVertexArray(null);
    mesh.count = quads * 6;
    mesh.quads = quads;
    return mesh;
  }

  deleteMesh(mesh) {
    if (!mesh) return;
    this.gl.deleteBuffer(mesh.vbo);
    this.gl.deleteVertexArray(mesh.vao);
  }

  uploadChunk(chunk, data) {
    const old = chunk.mesh || {};
    let maxY = 0;
    for (let i = 0; i < chunk.heightmap.length; i++) maxY = Math.max(maxY, chunk.heightmap[i]);
    chunk.mesh = {
      solid: this.createMesh(data.solid, data.solidQuads, old.solid),
      water: this.createMesh(data.water, data.waterQuads, old.water),
      maxY: maxY + 1,
    };
  }

  deleteChunk(chunk) {
    if (!chunk.mesh) return;
    this.deleteMesh(chunk.mesh.solid);
    this.deleteMesh(chunk.mesh.water);
    chunk.mesh = null;
  }

  // --- Render targets -----------------------------------------------------------------

  colorTarget(w, h, withDepthTexture = false, withDepthBuffer = false) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex = this.hdr
      ? this.makeTexture2D(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE)
      : this.makeTexture2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let depth = null, depthRb = null;
    if (withDepthTexture) {
      depth = this.makeTexture2D(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null, gl.NEAREST, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    } else if (withDepthBuffer) {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete (${status})`);
    return { fbo, tex, depth, depthRb, w, h };
  }

  deleteTarget(t) {
    const gl = this.gl;
    gl.deleteFramebuffer(t.fbo);
    gl.deleteTexture(t.tex);
    if (t.depth) gl.deleteTexture(t.depth);
    if (t.depthRb) gl.deleteRenderbuffer(t.depthRb);
  }

  ensureTargets(w, h) {
    if (this.targets && this.targets.w === w && this.targets.h === h) return this.targets;
    if (this.targets) for (const t of this.targets.list) this.deleteTarget(t);
    const half = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
    const quarter = [Math.max(1, w >> 2), Math.max(1, h >> 2)];
    const eighth = [Math.max(1, w >> 3), Math.max(1, h >> 3)];
    const t = {
      w, h,
      scene: this.colorTarget(w, h, false, true),
      copy: this.colorTarget(w, h, true),
      b1: [this.colorTarget(...half), this.colorTarget(...half)],
      b2: [this.colorTarget(...quarter), this.colorTarget(...quarter)],
      b3: [this.colorTarget(...eighth), this.colorTarget(...eighth)],
      rays: [this.colorTarget(...quarter), this.colorTarget(...quarter)],
    };
    t.list = [t.scene, t.copy, ...t.b1, ...t.b2, ...t.b3, ...t.rays];
    this.targets = t;
    return t;
  }

  ensureShadowTarget() {
    const gl = this.gl;
    if (this.shadowTarget && this.shadowTarget.size === this.shadowSize) return this.shadowTarget;
    if (this.shadowTarget) {
      gl.deleteFramebuffer(this.shadowTarget.fbo);
      gl.deleteTexture(this.shadowTarget.tex);
    }
    const size = this.shadowSize;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shadowTarget = { fbo, tex, size };
    return this.shadowTarget;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.resolutionScale || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // --- Frame --------------------------------------------------------------------------

  // state: { world, camera: {pos, yaw, pitch, fov}, ticks, seconds, renderDistance,
  //          selection, crack, held, underwater, inLava, handSwing, bob, light,
  //          particles, entities, showHand }
  render(state) {
    this.resize();
    const { camera } = state;
    const aspect = this.canvas.width / this.canvas.height;
    const fovY = (camera.fov * Math.PI) / 180;
    this.far = Math.max(200, state.renderDistance * CHUNK_SIZE * 1.6 + 96);
    this.near = 0.05;
    perspective(this.proj, fovY, aspect, this.near, this.far);
    viewRotation(this.view, camera.yaw, camera.pitch);
    multiply(this.viewProj, this.proj, this.view);
    const sky = skyState(state.ticks, state.rain || 0, state.flash || 0);
    const visible = this.collectVisible(state);
    const frame = { state, sky, aspect, fovY, visible, cam: camera.pos, viewDist: state.renderDistance * CHUNK_SIZE };
    const dt = Math.min(0.2, Math.max(0, state.seconds - this.lastSeconds));
    this.lastSeconds = state.seconds;
    if (this.fancy) {
      this.updateExposure(state, sky, dt);
      this.renderFancy(frame);
    } else {
      this.renderVanilla(frame);
    }
    this.gl.bindVertexArray(null);
  }

  collectVisible(state) {
    const cam = state.camera.pos;
    const viewDist = state.renderDistance * CHUNK_SIZE;
    const planes = frustumPlanes(this.viewProj);
    const visible = [];
    this.stats.chunks = 0;
    this.stats.quads = 0;
    this.meshed = [];
    for (const chunk of state.world.chunks.values()) {
      if (!chunk.mesh) continue;
      this.stats.chunks++;
      const ox = chunk.cx * CHUNK_SIZE - cam[0];
      const oz = chunk.cz * CHUNK_SIZE - cam[2];
      const d = Math.hypot(ox + 8, oz + 8);
      this.meshed.push({ chunk, ox, oz, d });
      if (d > viewDist + 24) continue;
      if (!aabbInFrustum(planes, ox, -cam[1], oz, ox + CHUNK_SIZE, chunk.mesh.maxY - cam[1], oz + CHUNK_SIZE)) continue;
      visible.push({ chunk, ox, oz, d2: ox * ox + oz * oz });
    }
    this.stats.drawn = visible.length;
    return visible;
  }

  // Eye adaptation: brighter exposure at night and underground.
  updateExposure(state, sky, dt) {
    const [sl, bl] = state.light || [15, 0];
    const env = Math.max(lightCurve(sl / 15) * (0.05 + 0.95 * sky.day), lightCurve(bl / 15) * 0.5);
    const target = Math.min(2.6, Math.max(0.95, 0.42 / (env + 0.06)));
    this.exposure += (target - this.exposure) * Math.min(1, dt * 1.2);
  }

  bindBlockTexture(unit = 0) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
  }

  drawChunkList(prog, list, cam, which) {
    const gl = this.gl;
    const u = prog.u;
    for (const v of list) {
      const m = v.chunk.mesh[which];
      if (!m) continue;
      gl.uniform3f(u.uOffset, v.ox, -cam[1], v.oz);
      gl.uniform3f(u.uOrigin, v.chunk.cx * CHUNK_SIZE, 0, v.chunk.cz * CHUNK_SIZE);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      if (which === 'solid' && prog !== this.prog.shadow) this.stats.quads += m.quads;
    }
  }

  // Entities: each has parts [{ mesh, matrix }], pos, light [sky, block],
  // overlay [r, g, b, a] and texture ('entity' | 'blocks').
  drawEntities(prog, entities, cam, shadowPass = false) {
    if (!entities || !entities.length) return;
    const gl = this.gl;
    const u = prog.u;
    for (const e of entities) {
      const kind = e.texture || 'entity';
      if (kind === 'entity' && !this.entityTexture) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, kind === 'blocks' ? this.texture : kind === 'items' ? this.itemTexture : this.entityTexture);
      const baseScale = kind === 'entity' ? 1 / 64 : 1 / 16;
      gl.uniform1f(u.uUVScale, e.uvScale || baseScale);
      gl.uniform3f(u.uOffset, e.pos[0] - cam[0], e.pos[1] - cam[1], e.pos[2] - cam[2]);
      gl.uniform3f(u.uOrigin, e.pos[0], e.pos[1], e.pos[2]);
      if (!shadowPass) {
        gl.uniform3f(u.uLightOverride, e.light[0] / 15, e.light[1] / 15, 1);
        const o = e.overlay || [0, 0, 0, 0];
        gl.uniform4f(u.uOverlay, o[0], o[1], o[2], o[3]);
      }
      for (const part of e.parts) {
        if (!part.mesh) continue;
        gl.uniformMatrix4fv(u.uModel, false, part.matrix);
        gl.bindVertexArray(part.mesh.vao);
        gl.drawElements(gl.TRIANGLES, part.mesh.count, gl.UNSIGNED_INT, 0);
      }
    }
    gl.uniformMatrix4fv(u.uModel, false, this.identity);
    gl.uniform1f(u.uUVScale, 1 / 16);
    if (!shadowPass) {
      gl.uniform3f(u.uLightOverride, 0, 0, 0);
      gl.uniform4f(u.uOverlay, 0, 0, 0, 0);
    }
    this.bindBlockTexture(0);
  }

  // --- Vanilla pipeline ------------------------------------------------------------------

  renderVanilla({ state, sky, aspect, fovY, visible, cam, viewDist }) {
    const gl = this.gl;
    const v = sky.vanilla;
    let fogColor = v.horizon;
    const rainFog = 1 - 0.45 * (state.rain || 0);
    let fogRange = [viewDist * 0.55 * rainFog, viewDist * 0.95 * rainFog];
    if (state.inLava) { fogColor = [0.75, 0.25, 0.04]; fogRange = [0, 2.5]; }
    else if (state.underwater) { fogColor = mix3([0.02, 0.04, 0.12], [0.1, 0.26, 0.55], v.day); fogRange = [1, 28]; }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!state.underwater && !state.inLava) this.drawSky(this.prog.sky, state, sky, aspect, fovY, false);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const p = this.prog.chunk;
    const setup = () => {
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
      gl.uniformMatrix4fv(p.u.uModel, false, this.identity);
      gl.uniform3fv(p.u.uSkyLight, v.skyLight);
      gl.uniform3fv(p.u.uFogColor, fogColor);
      gl.uniform2f(p.u.uFogRange, fogRange[0], fogRange[1]);
      gl.uniform1f(p.u.uTime, state.seconds);
      gl.uniform1f(p.u.uLeafWave, 0);
      gl.uniform1f(p.u.uUVScale, 1 / 16);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform3f(p.u.uLightOverride, 0, 0, 0);
      gl.uniform4f(p.u.uOverlay, 0, 0, 0, 0);
      this.bindBlockTexture(0);
    };
    setup();
    gl.uniform1f(p.u.uAlphaTest, 0.5);
    gl.uniform1f(p.u.uAlphaMul, 1);
    this.drawChunkList(p, visible, cam, 'solid');
    this.drawEntities(p, state.entities, cam);
    this.drawCrack(p, state, cam);

    if (!state.underwater && !state.inLava) this.drawClouds(this.prog.cloud, state, sky, cam, viewDist, false);

    setup();
    gl.uniform1f(p.u.uAlphaTest, 0);
    gl.uniform1f(p.u.uAlphaMul, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    visible.sort((a, b) => b.d2 - a.d2);
    this.drawChunkList(p, visible, cam, 'water');
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);

    this.drawParticles(state, cam, v.skyLight, fogColor, fogRange, fovY, false);
    this.drawWeather(state, v.skyLight.map((c) => c * 0.9), false);
    if (state.selection) this.drawSelection(state.selection, cam);
    gl.disable(gl.BLEND);
    if (state.showHand) this.drawHeld(p, state, aspect, sky, false);
  }

  drawSky(p, state, sky, aspect, fovY, fancy) {
    const gl = this.gl;
    const { camera } = state;
    const basis = cameraBasis(camera.yaw, camera.pitch);
    const tanY = Math.tan(fovY / 2);
    const u = p.u;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.useProgram(p.program);
    gl.uniform3fv(u.uForward, basis.forward);
    gl.uniform3fv(u.uRight, basis.right);
    gl.uniform3fv(u.uUp, basis.up);
    gl.uniform2f(u.uTanHalf, tanY * aspect, tanY);
    gl.uniform3fv(u.uSunDir, sky.sunDir);
    gl.uniform1f(u.uStarAngle, sky.angle);
    if (fancy) {
      this.setSkyUniforms(p, sky);
      gl.uniform1f(u.uNight, Math.min(1, sky.night * 1.3));
      gl.uniform1f(u.uSunVis, sky.sunVisible);
    } else {
      const v = sky.vanilla;
      gl.uniform3fv(u.uZenith, v.zenith);
      gl.uniform3fv(u.uHorizon, v.horizon);
      gl.uniform3f(u.uSunsetColor, 1.0, 0.42, 0.12);
      gl.uniform1f(u.uSunset, v.sunset);
      gl.uniform1f(u.uNight, Math.max(0, Math.min(1, v.night * 1.4 - 0.3)));
    }
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  }

  setSkyUniforms(p, sky) {
    const gl = this.gl;
    gl.uniform3fv(p.u.uSunDir, sky.sunDir);
    gl.uniform3fv(p.u.uZenith, sky.zenith);
    gl.uniform3fv(p.u.uHorizon, sky.horizon);
    gl.uniform3fv(p.u.uSunGlow, sky.sunGlow);
  }

  drawClouds(p, state, sky, cam, viewDist, fancy) {
    const gl = this.gl;
    const u = p.u;
    const radius = Math.max(viewDist * 1.6, 220);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform1f(u.uHeight, 118 - cam[1]);
    gl.uniform2f(u.uCamXZ, cam[0], cam[2]);
    gl.uniform1f(u.uTime, state.seconds);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, fancy ? this.noiseTex : this.cloudTex);
    gl.uniform1i(u.uClouds, 5);
    if (fancy) {
      this.setSkyUniforms(p, sky);
      gl.uniform3fv(u.uLightDir, sky.lightDir);
      gl.uniform3fv(u.uLightColor, sky.lightColor);
      gl.uniform3fv(u.uAmbientSky, sky.ambientSky);
    } else {
      const c = mix3([0.12, 0.13, 0.18], [1, 1, 1], sky.vanilla.day);
      gl.uniform3fv(u.uColor, mix3(c, [1, 0.75, 0.6], sky.vanilla.sunset * 0.35 * sky.vanilla.day));
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }

  drawCrack(p, state, cam) {
    if (!state.crack) return;
    const gl = this.gl;
    const u = p.u;
    const mesh = this.getCrackMesh(state.crack.stage);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -2);
    gl.depthMask(false);
    gl.uniform1f(u.uAlphaTest, 0.01);
    gl.uniform3f(u.uOffset, state.crack.x - cam[0], state.crack.y - cam[1], state.crack.z - cam[2]);
    gl.uniform3f(u.uLightOverride, 1, 1, 1);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.uniform3f(u.uLightOverride, 0, 0, 0);
    gl.uniform1f(u.uAlphaTest, 0.5);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // --- Fancy pipeline ---------------------------------------------------------------------

  computeShadowMatrix(sky, cam) {
    const R = this.shadowDistance;
    const rot = lookRotation(mat4(), [-sky.lightDir[0], -sky.lightDir[1], -sky.lightDir[2]], [0, 0, 1]);
    // Snap the shadow map to whole texels so shadows don't shimmer as you move.
    const center = transformPoint(rot, cam);
    const texel = (2 * R) / this.shadowSize;
    const frac = [center[0] - Math.floor(center[0] / texel) * texel, center[1] - Math.floor(center[1] / texel) * texel, 0];
    const proj = ortho(mat4(), -R, R, -R, R, -R - 160, R + 160);
    compose(proj, translation(frac[0], frac[1], frac[2]), rot).forEach((v, i) => (this.shadowMatrix[i] = v));
    return this.shadowMatrix;
  }

  renderShadows(state, sky, cam) {
    const gl = this.gl;
    const target = this.ensureShadowTarget();
    const m = this.computeShadowMatrix(sky, cam);
    const p = this.prog.shadow;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.size, target.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 3);
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uShadowMatrix, false, m);
    gl.uniformMatrix4fv(p.u.uModel, false, this.identity);
    gl.uniform1f(p.u.uTime, state.seconds);
    gl.uniform1f(p.u.uLeafWave, 1);
    gl.uniform1f(p.u.uUVScale, 1 / 16);
    gl.uniform1i(p.u.uTex, 0);
    this.bindBlockTexture(0);
    const R = this.shadowDistance + 20;
    const list = this.meshed.filter((v) => v.d < R);
    this.drawChunkList(p, list, cam, 'solid');
    this.drawEntities(p, state.entities, cam, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.CULL_FACE);
  }

  setFancyChunkUniforms(p, state, sky, fog, shadows) {
    const gl = this.gl;
    const u = p.u;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, this.identity);
    this.setSkyUniforms(p, sky);
    gl.uniform3fv(u.uLightDir, sky.lightDir);
    gl.uniform3fv(u.uLightColor, sky.lightColor);
    gl.uniform3fv(u.uAmbientSky, sky.ambientSky);
    gl.uniform3fv(u.uAmbientGround, sky.ambientGround);
    gl.uniform2f(u.uFogRange, fog.range[0], fog.range[1]);
    gl.uniform1f(u.uHaze, fog.haze);
    gl.uniform1f(u.uUnderwater, fog.underwater ? 1 : 0);
    gl.uniform3fv(u.uWaterFog, fog.waterColor);
    gl.uniform1f(u.uTime, state.seconds);
    gl.uniform1f(u.uLeafWave, 1);
    gl.uniform1f(u.uUVScale, 1 / 16);
    gl.uniform1i(u.uTex, 0);
    gl.uniform3f(u.uLightOverride, 0, 0, 0);
    gl.uniform4f(u.uOverlay, 0, 0, 0, 0);
    gl.uniform1f(u.uAlphaTest, 0.5);
    gl.uniform1f(u.uAlphaMul, 1);
    gl.uniform1f(u.uShadowsOn, shadows ? 1 : 0);
    gl.uniformMatrix4fv(u.uShadowMatrix, false, this.shadowMatrix);
    gl.uniform1f(u.uShadowTexel, 1 / this.shadowSize);
    gl.uniform1i(u.uShadowMap, 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, shadows ? this.shadowTarget.tex : null);
    this.bindBlockTexture(0);
  }

  renderFancy({ state, sky, aspect, fovY, visible, cam, viewDist }) {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const t = this.ensureTargets(w, h);
    const shadows = this.shadowsEnabled && Math.max(...sky.lightColor) > 0.004;
    if (shadows) this.renderShadows(state, sky, cam);
    else this.ensureShadowTarget();

    const underwater = !!state.underwater;
    const fog = {
      range: [viewDist * 0.6 * (1 - 0.45 * (state.rain || 0)), viewDist * (1 - 0.35 * (state.rain || 0))],
      haze: 0.0025,
      underwater,
      waterColor: mix3([0.004, 0.012, 0.03], [0.03, 0.12, 0.22], sky.day),
    };
    if (state.inLava) {
      fog.underwater = true;
      fog.waterColor = [1.2, 0.35, 0.05];
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(...(fog.underwater ? fog.waterColor : sky.horizon), 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!fog.underwater) this.drawSky(this.prog.skyFancy, state, sky, aspect, fovY, true);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const p = this.prog.chunkFancy;
    this.setFancyChunkUniforms(p, state, sky, fog, shadows);
    this.drawChunkList(p, visible, cam, 'solid');
    this.drawEntities(p, state.entities, cam);
    this.drawCrack(p, state, cam);
    if (!fog.underwater) this.drawClouds(this.prog.cloudFancy, state, sky, cam, viewDist, true);

    // Snapshot color + depth so water can refract and reflect the scene.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.scene.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.copy.fbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.fbo);

    // Water
    const wp = this.prog.water;
    this.setFancyChunkUniforms(wp, state, sky, fog, shadows);
    gl.uniformMatrix4fv(wp.u.uProj, false, this.proj);
    gl.uniformMatrix4fv(wp.u.uView, false, this.view);
    gl.uniform2f(wp.u.uScreen, w, h);
    gl.uniform1f(wp.u.uNear, this.near);
    gl.uniform1f(wp.u.uFar, this.far);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, t.copy.tex);
    gl.uniform1i(wp.u.uSceneColor, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, t.copy.depth);
    gl.uniform1i(wp.u.uSceneDepth, 4);
    gl.disable(gl.CULL_FACE);
    this.drawChunkList(wp, visible, cam, 'water');
    gl.enable(gl.CULL_FACE);

    const partLight = sky.ambientSky.map((v, i) => v * 1.6 + sky.lightColor[i] * 0.6);
    this.drawParticles(state, cam, partLight, sky.horizon, fog.range, fovY, true);
    this.drawWeather(state, partLight.map((c) => c * 0.8), true);
    if (state.selection) this.drawSelection(state.selection, cam);
    gl.disable(gl.BLEND);
    if (state.showHand) {
      this.setFancyChunkUniforms(p, state, sky, { ...fog, range: [1000, 2000], haze: 0, underwater: false }, false);
      this.drawHeld(p, state, aspect, sky, true);
    }

    this.postProcess(state, sky, t, w, h);
  }

  fullscreen(p, target, w, h) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(p.program);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindTex(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  blur(pair) {
    const gl = this.gl;
    const p = this.prog.blur;
    const [a, b] = pair;
    gl.useProgram(p.program);
    this.bindTex(0, a.tex, p.u.uTex);
    gl.uniform2f(p.u.uDir, 1 / a.w, 0);
    this.fullscreen(p, b, b.w, b.h);
    this.bindTex(0, b.tex, p.u.uTex);
    gl.uniform2f(p.u.uDir, 0, 1 / b.h);
    this.fullscreen(p, a, a.w, a.h);
  }

  postProcess(state, sky, t, w, h) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    // Bloom: bright pass then a three-level blur pyramid.
    const bp = this.prog.bright;
    gl.useProgram(bp.program);
    this.bindTex(0, t.scene.tex, bp.u.uTex);
    gl.uniform2f(bp.u.uTexel, 1 / w, 1 / h);
    gl.uniform1f(bp.u.uThreshold, 2.2);
    this.fullscreen(bp, t.b1[0], t.b1[0].w, t.b1[0].h);
    this.blur(t.b1);
    const cp = this.prog.copy;
    gl.useProgram(cp.program);
    this.bindTex(0, t.b1[0].tex, cp.u.uTex);
    this.fullscreen(cp, t.b2[0], t.b2[0].w, t.b2[0].h);
    this.blur(t.b2);
    gl.useProgram(cp.program);
    this.bindTex(0, t.b2[0].tex, cp.u.uTex);
    this.fullscreen(cp, t.b3[0], t.b3[0].w, t.b3[0].h);
    this.blur(t.b3);

    // Light shafts from the sun when it is on (or near) the screen.
    let rayTex = this.blackTex;
    let rayStrength = 0;
    const clip = [0, 0, 0, 0];
    const d = sky.sunDir, m = this.viewProj;
    for (let i = 0; i < 4; i++) clip[i] = m[i] * d[0] + m[4 + i] * d[1] + m[8 + i] * d[2];
    if (clip[3] > 0 && !state.underwater && sky.sunVisible > 0) {
      const sun = [clip[0] / clip[3] * 0.5 + 0.5, clip[1] / clip[3] * 0.5 + 0.5];
      const off = Math.max(Math.abs(sun[0] - 0.5), Math.abs(sun[1] - 0.5));
      rayStrength = (1 - Math.min(1, Math.max(0, (off - 0.5) / 0.6))) * sky.sunVisible * (0.25 + 0.75 * sky.sunset);
      if (rayStrength > 0.01) {
        const mp = this.prog.rayMask;
        gl.useProgram(mp.program);
        this.bindTex(0, t.copy.tex, mp.u.uColor);
        this.bindTex(1, t.copy.depth, mp.u.uDepth);
        gl.uniform2f(mp.u.uSunUV, sun[0], sun[1]);
        gl.uniform1f(mp.u.uAspect, w / h);
        this.fullscreen(mp, t.rays[0], t.rays[0].w, t.rays[0].h);
        const rp = this.prog.rays;
        gl.useProgram(rp.program);
        this.bindTex(0, t.rays[0].tex, rp.u.uTex);
        gl.uniform2f(rp.u.uSunUV, sun[0], sun[1]);
        this.fullscreen(rp, t.rays[1], t.rays[1].w, t.rays[1].h);
        rayTex = t.rays[1].tex;
      }
    }

    const c = this.prog.composite;
    gl.useProgram(c.program);
    this.bindTex(0, t.scene.tex, c.u.uScene);
    this.bindTex(1, t.b1[0].tex, c.u.uBloom1);
    this.bindTex(2, t.b2[0].tex, c.u.uBloom2);
    this.bindTex(3, t.b3[0].tex, c.u.uBloom3);
    this.bindTex(4, rayTex, c.u.uRays);
    gl.uniform1f(c.u.uBloomStrength, this.hdr ? 0.12 : 0.25);
    const rc = sky.lightColor;
    gl.uniform3f(c.u.uRayColor, 0.9 * rayStrength * (0.6 + rc[0] * 0.2), 0.75 * rayStrength * (0.6 + rc[1] * 0.2), 0.55 * rayStrength * (0.6 + rc[2] * 0.2));
    gl.uniform1f(c.u.uExposure, this.exposure);
    gl.uniform1f(c.u.uUnderwater, state.underwater ? 1 : 0);
    gl.uniform1f(c.u.uTime, state.seconds);
    gl.uniform1f(c.u.uSaturation, 1.18);
    this.fullscreen(c, null, w, h);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
  }

  // --- Overlays ----------------------------------------------------------------------------

  drawParticles(state, cam, skyLight, fogColor, fogRange, fovY, linear) {
    const list = state.particles;
    if (!list || !list.length) return;
    const gl = this.gl;
    const world = state.world;
    const data = new Float32Array(list.length * 9);
    let o = 0;
    for (const p of list) {
      const l = world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      data[o++] = p.x - cam[0]; data[o++] = p.y - cam[1]; data[o++] = p.z - cam[2];
      data[o++] = p.u; data[o++] = p.v; data[o++] = p.layer; data[o++] = p.size;
      data[o++] = (l >> 4) / 15; data[o++] = (l & 15) / 15;
    }
    const pr = this.prog.particle;
    const u = pr.u;
    gl.useProgram(pr.program);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniform1f(u.uScale, this.canvas.height / (2 * Math.tan(fovY / 2)));
    gl.uniform1f(u.uMaxSize, this.maxPointSize);
    gl.uniform3fv(u.uSkyLight, skyLight);
    gl.uniform3fv(u.uFogColor, fogColor);
    gl.uniform2f(u.uFogRange, fogRange[0], fogRange[1]);
    gl.uniform1f(u.uLinear, linear ? 1 : 0);
    gl.uniform1i(u.uTex, 0);
    this.bindBlockTexture(0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.drawArrays(gl.POINTS, 0, list.length);
  }

  drawSelection(sel, cam) {
    const gl = this.gl;
    const e = 0.003;
    const b = sel.box;
    const x0 = sel.x + b[0] - e - cam[0], y0 = sel.y + b[1] - e - cam[1], z0 = sel.z + b[2] - e - cam[2];
    const x1 = sel.x + b[3] + e - cam[0], y1 = sel.y + b[4] + e - cam[1], z1 = sel.z + b[5] + e - cam[2];
    const v = new Float32Array([
      x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1, x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0,
      x0, y1, z0, x1, y1, z0, x1, y1, z0, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y1, z0,
      x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1,
    ]);
    const p = this.prog.line;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform4f(p.u.uColor, 0, 0, 0, 0.55);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
    gl.drawArrays(gl.LINES, 0, 24);
  }

  getCrackMesh(stage) {
    if (!this.crackMeshes[stage]) {
      const { data, quads } = buildOverlayCube(textureLayer(`destroy_${stage}`));
      this.crackMeshes[stage] = this.createMesh(data, quads);
    }
    return this.crackMeshes[stage];
  }

  getHeldMesh(itemId) {
    const key = itemId || 0;
    if (!this.heldCache.has(key)) {
      let built;
      if (!itemId) {
        built = buildOverlayCube(textureLayer('skin'), [0, 0, 0, 4, 12, 4]);
      } else if (isBlockItem(itemId) && BLOCKS[itemId].heldAsBlock) {
        built = buildBlockMesh(itemId);
      } else {
        built = buildExtrudedSprite(itemSpriteName(itemId));
      }
      const kind = !itemId ? 'hand' : built.uvScale ? 'flat' : 'block';
      this.heldCache.set(key, { mesh: this.createMesh(built.data, built.quads), kind, uvScale: built.uvScale || 1 / 16, atlas: built.atlas || 'blocks' });
    }
    return this.heldCache.get(key);
  }

  drawHeld(p, state, aspect, sky, fancy) {
    const gl = this.gl;
    const held = this.getHeldMesh(state.held);
    if (!held.mesh) return;
    const proj = perspective(mat4(), (70 * Math.PI) / 180, aspect, 0.01, 10);
    const swing = state.handSwing || 0;
    const s = Math.sin(swing * Math.PI);
    const bobX = Math.sin(state.bob || 0) * 0.025 * (state.bobAmount || 0);
    const bobY = -Math.abs(Math.cos(state.bob || 0)) * 0.03 * (state.bobAmount || 0);
    const place = state.placeAnim || 0;
    const eat = state.eating || 0;
    const eatBob = eat ? Math.abs(Math.sin(state.seconds * 14)) * 0.04 : 0;
    let model;
    if (held.kind === 'hand') {
      const shoulder = [0.78 + bobX, -1.0 + bobY, -0.2];
      const hand = [0.44 + bobX - s * 0.14, -0.4 + bobY + s * 0.12, -0.86 - s * 0.2];
      model = armMatrix(shoulder, hand, 1.1);
    } else if (held.kind === 'block') {
      model = compose(
        translation(0.6 + bobX - s * 0.2, -0.46 + bobY + s * 0.15 - place * 0.15, -1.0 - s * 0.25),
        rotationX(0.12 + s * -0.8),
        rotationY(Math.PI / 4 + 0.1),
        scaling(0.34),
        translation(-0.5, -0.5, -0.5),
      );
    } else {
      model = compose(
        translation(0.56 + bobX - s * 0.18 - eat * 0.35, -0.44 + bobY + s * 0.12 - place * 0.12 + eat * 0.12 - eatBob, -0.86 - s * 0.2),
        rotationX(s * -1.0),
        rotationY(-Math.PI / 2 + 0.35 + eat * 0.9),
        rotationZ(0.35),
        scaling(0.42),
        translation(-0.5, -0.5, -0.5),
      );
    }
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(p.program);
    const u = p.u;
    gl.uniformMatrix4fv(u.uViewProj, false, proj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3f(u.uOffset, 0, 0, 0);
    gl.uniform3f(u.uOrigin, 0, 0, 0);
    gl.uniform2f(u.uFogRange, 1000, 2000);
    gl.uniform1f(u.uAlphaTest, 0.5);
    gl.uniform1f(u.uAlphaMul, 1);
    gl.uniform1f(u.uLeafWave, 0);
    if (fancy) {
      // Light the hand from a fixed direction in view space (above, left and
      // in front, so the face of a held sprite is lit).
      gl.uniform3f(u.uLightDir, -0.45, 0.75, 0.5);
      gl.uniform1f(u.uShadowsOn, 0);
    } else {
      gl.uniform3fv(u.uSkyLight, sky.vanilla.skyLight);
    }
    const [sl, bl] = state.light || [15, 0];
    gl.uniform3f(u.uLightOverride, sl / 15, bl / 15, 1);
    gl.disable(gl.CULL_FACE);
    if (held.atlas === 'items') {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.itemTexture);
    } else this.bindBlockTexture(0);
    gl.uniform1f(u.uUVScale, held.uvScale);
    gl.bindVertexArray(held.mesh.vao);
    gl.drawElements(gl.TRIANGLES, held.mesh.count, gl.UNSIGNED_INT, 0);
    gl.uniform1f(u.uUVScale, 1 / 16);
    gl.enable(gl.CULL_FACE);
    gl.uniform3f(u.uLightOverride, 0, 0, 0);
    gl.uniformMatrix4fv(u.uModel, false, this.identity);
  }

  dispose(world) {
    if (world) for (const c of world.chunks.values()) this.deleteChunk(c);
  }
}
