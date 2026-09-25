// WebGL2 renderer: terrain, sky, clouds, selection outline, crack overlay
// and the first-person held item.
import { CHUNK_SIZE, DAY_LENGTH_TICKS } from './constants.js';
import { BLOCKS, ITEMS, isBlockItem } from './blocks.js';
import { generateTextures } from './textures.js';
import { VERTEX_BYTES, buildBlockMesh, buildOverlayCube, buildSpriteMesh, textureLayer } from './mesher.js';
import {
  mat4, perspective, multiply, viewRotation, cameraBasis, frustumPlanes, aabbInFrustum,
  smoothstep, clamp, compose, translation, rotationX, rotationY, rotationZ, scaling,
} from './math.js';
import { SimplexNoise } from './noise.js';

const CHUNK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aData;
layout(location=3) in float aFlags;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uOffset;
uniform vec3 uOrigin;
uniform float uTime;
out vec3 vUV;
out vec2 vLight;
out float vShade;
out float vDist;
void main() {
  vec3 local = (uModel * vec4(aPos / 16.0, 1.0)).xyz;
  vec3 p = local + uOffset;
  vec3 wp = local + uOrigin;
  if (aFlags > 0.5 && aFlags < 1.5) {
    p.y += (sin(wp.x * 1.3 + uTime * 1.7) + sin(wp.z * 1.1 + uTime * 1.3)) * 0.035 - 0.04;
  } else if (aFlags > 1.5) {
    p.x += sin(wp.x * 0.7 + wp.z * 0.3 + uTime * 1.6) * 0.05;
    p.z += cos(wp.z * 0.6 + wp.x * 0.2 + uTime * 1.3) * 0.05;
  }
  gl_Position = uViewProj * vec4(p, 1.0);
  vUV = vec3(aUV / 16.0, aData.x);
  vLight = aData.yz / 240.0;
  vShade = aData.w / 255.0;
  vDist = length(p);
}`;

const CHUNK_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vUV;
in vec2 vLight;
in float vShade;
in float vDist;
uniform sampler2DArray uTex;
uniform vec3 uSkyLight;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uAlphaTest;
uniform float uAlphaMul;
uniform vec3 uLightOverride;
out vec4 fragColor;
float curve(float l) { return pow(0.84, (1.0 - l) * 15.0); }
void main() {
  vec4 tex = texture(uTex, vUV);
  if (tex.a < uAlphaTest) discard;
  vec2 lv = uLightOverride.z > 0.5 ? uLightOverride.xy : vLight;
  vec3 sky = curve(lv.x) * uSkyLight;
  vec3 torch = curve(lv.y) * vec3(1.0, 0.88, 0.7);
  vec3 light = max(max(sky, torch), vec3(0.03));
  vec3 color = tex.rgb * light * vShade;
  float fog = smoothstep(uFogRange.x, uFogRange.y, vDist);
  fragColor = vec4(mix(color, uFogColor, fog), tex.a * uAlphaMul);
}`;

const SKY_VS = `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uForward, uRight, uUp;
uniform vec2 uTanHalf;
uniform vec3 uSunDir;
uniform vec3 uZenith, uHorizon, uSunsetColor;
uniform float uSunset, uNight, uStarAngle;
out vec4 fragColor;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float squareDisc(vec3 dir, vec3 axis, float size) {
  if (dot(dir, axis) <= 0.0) return 0.0;
  vec3 side = normalize(cross(axis, vec3(0.0, 0.0, 1.0)));
  vec3 up = cross(side, axis);
  vec2 q = vec2(dot(dir, side), dot(dir, up));
  return step(max(abs(q.x), abs(q.y)), size);
}
void main() {
  vec3 dir = normalize(uForward + vNdc.x * uTanHalf.x * uRight + vNdc.y * uTanHalf.y * uUp);
  float h = dir.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunsetColor * uSunset * pow(sd, 5.0) * (1.0 - clamp(abs(h) * 2.0, 0.0, 1.0));
  // Stars rotate with the sky.
  float c = cos(uStarAngle), s = sin(uStarAngle);
  vec3 sdir = vec3(c * dir.x + s * dir.y, -s * dir.x + c * dir.y, dir.z);
  vec3 cell = floor(sdir * 220.0);
  float star = step(0.9982, hash(cell)) * uNight * clamp(h * 4.0, 0.0, 1.0);
  col += vec3(star) * (0.6 + 0.4 * hash(cell + 3.0));
  // Sun and moon.
  float sun = squareDisc(dir, uSunDir, 0.055);
  col = mix(col, vec3(1.0, 0.97, 0.82), sun);
  col += vec3(1.0, 0.8, 0.5) * pow(sd, 400.0) * 0.6;
  vec3 moonDir = -uSunDir;
  float moon = squareDisc(dir, moonDir, 0.04);
  col = mix(col, vec3(0.86, 0.88, 0.96), moon);
  col += vec3(0.4, 0.45, 0.6) * pow(max(dot(dir, moonDir), 0.0), 300.0) * 0.4;
  fragColor = vec4(col, 1.0);
}`;

const CLOUD_VS = `#version 300 es
precision highp float;
uniform mat4 uViewProj;
uniform float uRadius, uHeight;
out vec2 vLocal;
void main() {
  int i = gl_VertexID;
  vec2 corners[6] = vec2[6](vec2(-1,-1), vec2(1,-1), vec2(1,1), vec2(-1,-1), vec2(1,1), vec2(-1,1));
  vec2 c = corners[i] * uRadius;
  vLocal = c;
  gl_Position = uViewProj * vec4(c.x, uHeight, c.y, 1.0);
}`;

const CLOUD_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform sampler2D uClouds;
uniform vec2 uCamXZ;
uniform float uTime, uRadius;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  vec2 world = uCamXZ + vLocal + vec2(uTime * 1.2, 0.0);
  float c = texture(uClouds, world / (12.0 * 128.0)).r;
  float fade = 1.0 - smoothstep(uRadius * 0.45, uRadius, length(vLocal));
  float a = c * 0.78 * fade;
  if (a < 0.01) discard;
  fragColor = vec4(uColor, a);
}`;

const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aInfo; // u, v, layer, size
layout(location=2) in vec2 aLight;
uniform mat4 uViewProj;
uniform float uScale;
uniform float uMaxSize;
out vec3 vInfo;
out vec2 vLight;
out float vDist;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
  gl_PointSize = clamp(aInfo.w * uScale / max(gl_Position.w, 0.05), 1.0, uMaxSize);
  vInfo = aInfo.xyz;
  vLight = aLight;
  vDist = length(aPos);
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vInfo;
in vec2 vLight;
in float vDist;
uniform sampler2DArray uTex;
uniform vec3 uSkyLight;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
out vec4 fragColor;
float curve(float l) { return pow(0.84, (1.0 - l) * 15.0); }
void main() {
  vec2 uv = (vInfo.xy + gl_PointCoord * 4.0) / 16.0;
  vec4 tex = texture(uTex, vec3(uv, vInfo.z));
  if (tex.a < 0.5) discard;
  vec3 light = max(max(curve(vLight.x) * uSkyLight, curve(vLight.y) * vec3(1.0, 0.88, 0.7)), vec3(0.03));
  float fog = smoothstep(uFogRange.x, uFogRange.y, vDist);
  fragColor = vec4(mix(tex.rgb * light, uFogColor, fog), 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
void main() { gl_Position = uViewProj * vec4(aPos, 1.0); }`;

const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(p)}`);
  }
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, u: uniforms };
}

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Sky colours and light levels for a time of day (0..24000 ticks).
export function skyState(ticks) {
  const angle = (ticks / DAY_LENGTH_TICKS) * Math.PI * 2;
  const sunDir = [Math.cos(angle), Math.sin(angle), 0.18];
  const len = Math.hypot(...sunDir);
  sunDir[0] /= len; sunDir[1] /= len; sunDir[2] /= len;
  const day = smoothstep(-0.22, 0.28, sunDir[1]);
  const sunset = clamp(1 - Math.abs(sunDir[1]) / 0.32, 0, 1);
  const zenith = mix3([0.005, 0.008, 0.028], [0.36, 0.6, 1.0], day);
  let horizon = mix3([0.025, 0.035, 0.075], [0.7, 0.83, 1.0], day);
  horizon = mix3(horizon, [0.95, 0.55, 0.3], sunset * 0.45 * Math.max(day, 0.3));
  const daylight = 0.16 + 0.84 * smoothstep(-0.2, 0.25, sunDir[1]);
  const skyLight = mix3([0.55, 0.6, 0.9], [1, 1, 1], day).map((v) => v * daylight);
  return { sunDir, day, sunset, zenith, horizon, daylight, skyLight, angle, night: 1 - day };
}

// Maps the 4x12x4 px arm box so its long axis runs from `shoulder` to `hand`.
function armMatrix(shoulder, hand, thickness) {
  const y = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
  const len = Math.hypot(...y);
  const yn = y.map((v) => v / len);
  let x = [yn[2], 0, -yn[0]]; // cross(y, up): horizontal and perpendicular to y
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
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.chunkProg = program(gl, CHUNK_VS, CHUNK_FS);
    this.skyProg = program(gl, SKY_VS, SKY_FS);
    this.cloudProg = program(gl, CLOUD_VS, CLOUD_FS);
    this.lineProg = program(gl, LINE_VS, LINE_FS);
    this.emptyVao = gl.createVertexArray();
    this.proj = mat4();
    this.view = mat4();
    this.viewProj = mat4();
    this.identity = mat4();
    this.quadCapacity = 0;
    this.indexBuffer = gl.createBuffer();
    this.ensureIndexCapacity(65536);
    this.initTextures();
    this.initClouds();
    this.lineBuffer = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 24 * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.particleProg = program(gl, PARTICLE_VS, PARTICLE_FS);
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
    gl.bindVertexArray(null);
    this.maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;
    this.crackMeshes = [];
    this.heldCache = new Map();
    this.stats = { chunks: 0, drawn: 0, quads: 0 };
  }

  initTextures() {
    const gl = this.gl;
    const tex = generateTextures();
    this.textures = tex;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, tex.count, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex.pixels);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // No anisotropic filtering: several drivers then blur magnified texels,
    // which ruins the crisp pixel-art look.
  }

  initClouds() {
    const gl = this.gl;
    const size = 128;
    const noise = new SimplexNoise(1234);
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Sample on a torus so the texture tiles seamlessly.
        const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
        const v = noise.fbm2(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3 * 0.9 + 20, 3) +
          noise.noise2D(Math.sin(b) * 3 + 40, Math.cos(b) * 3) * 0.35;
        data[y * size + x] = v > 0.12 ? 255 : 0;
      }
    }
    this.cloudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
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
      gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, VERTEX_BYTES, 12);
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

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.resolutionScale || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setChunkUniforms(sky, fogColor, fogRange, time) {
    const gl = this.gl;
    const u = this.chunkProg.u;
    gl.useProgram(this.chunkProg.program);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uModel, false, this.identity);
    gl.uniform3fv(u.uSkyLight, sky.skyLight);
    gl.uniform3fv(u.uFogColor, fogColor);
    gl.uniform2f(u.uFogRange, fogRange[0], fogRange[1]);
    gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uTex, 0);
    gl.uniform3f(u.uLightOverride, 0, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
  }

  // state: { world, camera: {pos, yaw, pitch, fov}, ticks, seconds, renderDistance,
  //          selection, crack, held, underwater, inLava, handSwing, bob, blockLight }
  render(state) {
    const gl = this.gl;
    this.resize();
    const { camera, world } = state;
    const aspect = this.canvas.width / this.canvas.height;
    const fovY = (camera.fov * Math.PI) / 180;
    const far = Math.max(160, state.renderDistance * CHUNK_SIZE * 1.6 + 64);
    perspective(this.proj, fovY, aspect, 0.05, far);
    viewRotation(this.view, camera.yaw, camera.pitch);
    multiply(this.viewProj, this.proj, this.view);

    const sky = skyState(state.ticks);
    let fogColor = sky.horizon;
    const viewDist = state.renderDistance * CHUNK_SIZE;
    let fogRange = [viewDist * 0.55, viewDist * 0.95];
    if (state.inLava) {
      fogColor = [0.75, 0.25, 0.04];
      fogRange = [0, 2.5];
    } else if (state.underwater) {
      fogColor = mix3([0.02, 0.04, 0.12], [0.1, 0.26, 0.55], sky.day);
      fogRange = [1, 28];
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky
    if (!state.underwater && !state.inLava) {
      const basis = cameraBasis(camera.yaw, camera.pitch);
      const tanY = Math.tan(fovY / 2);
      const su = this.skyProg.u;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(this.skyProg.program);
      gl.uniform3fv(su.uForward, basis.forward);
      gl.uniform3fv(su.uRight, basis.right);
      gl.uniform3fv(su.uUp, basis.up);
      gl.uniform2f(su.uTanHalf, tanY * aspect, tanY);
      gl.uniform3fv(su.uSunDir, sky.sunDir);
      gl.uniform3fv(su.uZenith, sky.zenith);
      gl.uniform3fv(su.uHorizon, sky.horizon);
      gl.uniform3f(su.uSunsetColor, 1.0, 0.42, 0.12);
      gl.uniform1f(su.uSunset, sky.sunset);
      gl.uniform1f(su.uNight, clamp(sky.night * 1.4 - 0.3, 0, 1));
      gl.uniform1f(su.uStarAngle, sky.angle);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    const cam = camera.pos;
    const planes = frustumPlanes(this.viewProj);
    const visible = [];
    this.stats.chunks = 0;
    this.stats.quads = 0;
    for (const chunk of world.chunks.values()) {
      if (!chunk.mesh) continue;
      this.stats.chunks++;
      const ox = chunk.cx * CHUNK_SIZE - cam[0];
      const oz = chunk.cz * CHUNK_SIZE - cam[2];
      if (Math.hypot(ox + 8, oz + 8) > viewDist + 24) continue;
      if (!aabbInFrustum(planes, ox, -cam[1], oz, ox + CHUNK_SIZE, chunk.mesh.maxY - cam[1], oz + CHUNK_SIZE)) continue;
      visible.push({ chunk, ox, oz, d: ox * ox + oz * oz });
    }
    this.stats.drawn = visible.length;

    // Opaque + cut-out pass
    this.setChunkUniforms(sky, fogColor, fogRange, state.seconds);
    const u = this.chunkProg.u;
    gl.uniform1f(u.uAlphaTest, 0.5);
    gl.uniform1f(u.uAlphaMul, 1);
    for (const v of visible) {
      const m = v.chunk.mesh.solid;
      if (!m) continue;
      gl.uniform3f(u.uOffset, v.ox, -cam[1], v.oz);
      gl.uniform3f(u.uOrigin, v.chunk.cx * CHUNK_SIZE, 0, v.chunk.cz * CHUNK_SIZE);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      this.stats.quads += m.quads;
    }

    // Crack overlay on the block being mined
    if (state.crack) {
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
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // Clouds
    if (!state.underwater && !state.inLava) {
      const cu = this.cloudProg.u;
      const radius = Math.max(viewDist * 1.5, 192);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.cloudProg.program);
      gl.uniformMatrix4fv(cu.uViewProj, false, this.viewProj);
      gl.uniform1f(cu.uRadius, radius);
      gl.uniform1f(cu.uHeight, 116 - cam[1]);
      gl.uniform2f(cu.uCamXZ, cam[0], cam[2]);
      gl.uniform1f(cu.uTime, state.seconds);
      const c = mix3([0.12, 0.13, 0.18], [1, 1, 1], sky.day);
      gl.uniform3fv(cu.uColor, mix3(c, [1, 0.75, 0.6], sky.sunset * 0.35 * sky.day));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
      gl.uniform1i(cu.uClouds, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
    }

    // Translucent pass (water), back to front, both faces visible.
    this.setChunkUniforms(sky, fogColor, fogRange, state.seconds);
    gl.uniform1f(u.uAlphaTest, 0.0);
    gl.uniform1f(u.uAlphaMul, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    visible.sort((a, b) => b.d - a.d);
    for (const v of visible) {
      const m = v.chunk.mesh.water;
      if (!m) continue;
      gl.uniform3f(u.uOffset, v.ox, -cam[1], v.oz);
      gl.uniform3f(u.uOrigin, v.chunk.cx * CHUNK_SIZE, 0, v.chunk.cz * CHUNK_SIZE);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);

    if (state.particles && state.particles.length) this.drawParticles(state.particles, world, cam, sky, fogColor, fogRange, fovY);

    // Selection outline
    if (state.selection) this.drawSelection(state.selection, cam);
    gl.disable(gl.BLEND);

    // First-person hand / held item
    if (state.showHand) this.drawHeld(state, aspect, sky);
    gl.bindVertexArray(null);
  }

  drawParticles(list, world, cam, sky, fogColor, fogRange, fovY) {
    const gl = this.gl;
    const data = new Float32Array(list.length * 9);
    let o = 0;
    for (const p of list) {
      const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
      const l = world.getLight(bx, by, bz);
      data[o++] = p.x - cam[0]; data[o++] = p.y - cam[1]; data[o++] = p.z - cam[2];
      data[o++] = p.u; data[o++] = p.v; data[o++] = p.layer; data[o++] = p.size;
      data[o++] = (l >> 4) / 15; data[o++] = (l & 15) / 15;
    }
    const u = this.particleProg.u;
    gl.useProgram(this.particleProg.program);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniform1f(u.uScale, this.canvas.height / (2 * Math.tan(fovY / 2)));
    gl.uniform1f(u.uMaxSize, this.maxPointSize);
    gl.uniform3fv(u.uSkyLight, sky.skyLight);
    gl.uniform3fv(u.uFogColor, fogColor);
    gl.uniform2f(u.uFogRange, fogRange[0], fogRange[1]);
    gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
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
    gl.useProgram(this.lineProg.program);
    gl.uniformMatrix4fv(this.lineProg.u.uViewProj, false, this.viewProj);
    gl.uniform4f(this.lineProg.u.uColor, 0, 0, 0, 0.55);
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
      } else if (isBlockItem(itemId) && ['cube', 'cactus'].includes(BLOCKS[itemId].shape)) {
        built = buildBlockMesh(itemId);
      } else if (isBlockItem(itemId)) {
        built = buildSpriteMesh(textureLayer(BLOCKS[itemId].faces[0])); // plants, torches
      } else {
        built = buildSpriteMesh(textureLayer(`item_${ITEMS.get(itemId).name}`));
      }
      const kind = !itemId ? 'hand' : built.quads > 2 ? 'block' : 'flat';
      this.heldCache.set(key, { mesh: this.createMesh(built.data, built.quads), kind });
    }
    return this.heldCache.get(key);
  }

  drawHeld(state, aspect, sky) {
    const gl = this.gl;
    const held = this.getHeldMesh(state.held);
    if (!held.mesh) return;
    const proj = perspective(mat4(), (70 * Math.PI) / 180, aspect, 0.01, 10);
    const swing = state.handSwing || 0; // 0..1
    const s = Math.sin(swing * Math.PI);
    const bobX = Math.sin(state.bob || 0) * 0.025 * (state.bobAmount || 0);
    const bobY = -Math.abs(Math.cos(state.bob || 0)) * 0.03 * (state.bobAmount || 0);
    const place = state.placeAnim || 0;
    let model;
    if (held.kind === 'hand') {
      // Arm box (4x12x4 px) spanning from an off-screen shoulder to the hand.
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
        translation(0.52 + bobX - s * 0.18, -0.42 + bobY + s * 0.12 - place * 0.12, -0.72 - s * 0.2),
        rotationX(s * -1.0),
        rotationY(-Math.PI / 2 + 0.35),
        rotationZ(0.35),
        scaling(0.5),
        translation(-0.5, -0.5, -0.5),
      );
    }
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.chunkProg.program);
    const u = this.chunkProg.u;
    gl.uniformMatrix4fv(u.uViewProj, false, proj);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3f(u.uOffset, 0, 0, 0);
    gl.uniform3f(u.uOrigin, 0, 0, 0);
    gl.uniform3fv(u.uSkyLight, sky.skyLight);
    gl.uniform2f(u.uFogRange, 1000, 2000);
    gl.uniform1f(u.uAlphaTest, 0.5);
    gl.uniform1f(u.uAlphaMul, 1);
    const [sl, bl] = state.light || [15, 0];
    gl.uniform3f(u.uLightOverride, sl / 15, bl / 15, 1);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(held.mesh.vao);
    gl.drawElements(gl.TRIANGLES, held.mesh.count, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
    gl.uniform3f(u.uLightOverride, 0, 0, 0);
    gl.uniformMatrix4fv(u.uModel, false, this.identity);
  }

  dispose(world) {
    if (world) for (const c of world.chunks.values()) this.deleteChunk(c);
  }
}

