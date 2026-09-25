// GLSL sources. Programs that exist in both a "fancy" (shaders on) and a
// "vanilla" variant are compiled twice with `#define FANCY 1/0`.

// Shared helpers: face normals, light curve, biome tints, wind animation.
const COMMON = `
const vec3 NORMALS[8] = vec3[8](
  vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0),
  vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));
float lightCurve(float l) { return pow(0.84, (1.0 - l) * 15.0); }
// Minecraft-like colormaps: cold -> temperate -> hot (dry or lush).
vec3 grassColor(vec2 c) {
  vec3 cold = vec3(0.50, 0.71, 0.59), temperate = vec3(0.56, 0.74, 0.35);
  vec3 dry = vec3(0.75, 0.72, 0.36), lush = vec3(0.40, 0.78, 0.25);
  vec3 col = mix(cold, temperate, smoothstep(0.33, 0.43, c.x));
  return mix(col, mix(dry, lush, smoothstep(0.45, 0.6, c.y)), smoothstep(0.56, 0.68, c.x));
}
vec3 foliageColor(vec2 c) {
  vec3 cold = vec3(0.38, 0.63, 0.48), temperate = vec3(0.45, 0.66, 0.19);
  vec3 dry = vec3(0.68, 0.64, 0.17), lush = vec3(0.33, 0.70, 0.13);
  vec3 col = mix(cold, temperate, smoothstep(0.33, 0.43, c.x));
  return mix(col, mix(dry, lush, smoothstep(0.45, 0.6, c.y)), smoothstep(0.56, 0.68, c.x));
}
// Texture alpha marks tintable pixels: 250 = grass, 245 = foliage.
vec3 applyTint(vec4 tex, vec2 climate) {
  if (tex.a > 0.99 || tex.a < 0.5) return tex.rgb;
  return tex.rgb * (tex.a > 0.97 ? grassColor(climate) : foliageColor(climate));
}
`;

const WAVE = `
uniform float uTime;
uniform float uLeafWave;
vec3 wave(vec3 wp, int flags) {
  vec3 o = vec3(0.0);
  if ((flags & 1) != 0) o.y += (sin(wp.x * 1.3 + uTime * 1.7) + sin(wp.z * 1.1 + uTime * 1.3)) * 0.03 - 0.05;
  if ((flags & 2) != 0) {
    o.x += sin(wp.x * 0.7 + wp.z * 0.3 + uTime * 1.6) * 0.06;
    o.z += cos(wp.z * 0.6 + wp.x * 0.2 + uTime * 1.3) * 0.06;
  }
  if ((flags & 4) != 0) {
    float t = uTime * 1.7 + wp.x * 0.8 + wp.z * 0.7 + wp.y * 0.5;
    o += vec3(sin(t), sin(t * 1.3 + 1.0) * 0.5, cos(t * 0.9)) * 0.028 * uLeafWave;
  }
  return o;
}
`;

// Atmospheric sky shared by the sky dome, fog and water reflections.
const SKY = `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
vec3 skyBase(vec3 dir, float sharp) {
  float h = dir.y;
  float hc = max(h, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(hc, 0.5));
  float sd = max(dot(dir, uSunDir), 0.0);
  float band = exp(-hc * 5.0);
  col += uSunGlow * (pow(sd, 6.0) * 0.35 * band + (pow(sd, 32.0) * 0.55 + pow(sd, 300.0) * 2.0) * sharp);
  if (h < 0.0) col = mix(col, uHorizon * 0.3, clamp(-h * 2.5, 0.0, 1.0));
  return col;
}
vec3 skyColor(vec3 dir) { return skyBase(dir, 1.0); }
// Fog/haze colour: the sky without the bright sun core.
vec3 fogColor(vec3 dir) { return skyBase(dir, 0.15); }
`;

// Soft sun shadows: 12-tap Poisson PCF on a hardware-compared shadow map.
const SHADOWS = `
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowTexel;
uniform float uShadowsOn;
const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
float shadowAt(vec3 pos, vec3 n) {
  if (uShadowsOn < 0.5) return 1.0;
  vec4 sp = uShadowMatrix * vec4(pos + n * 0.09, 1.0);
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    sum += texture(uShadowMap, vec3(c.xy + POISSON[i] * uShadowTexel * 1.8, c.z - 0.0004));
  }
  float s = sum / 12.0;
  float edge = max(abs(c.x - 0.5), abs(c.y - 0.5)) * 2.0;
  return mix(s, 1.0, smoothstep(0.8, 1.0, edge));
}
`;

export const CHUNK_VS = `
precision highp float;
precision highp int;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aData;   // layer, sky, block, ao
layout(location=3) in vec4 aExtra;  // flags, normal, temperature, humidity
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uOffset;
uniform vec3 uOrigin;
uniform float uUVScale;
out vec3 vUV;
out vec2 vLight;
out float vAO;
out vec3 vPos;
out vec3 vWorld;
out vec2 vClimate;
flat out int vNormal;
flat out int vFlags;
${WAVE}
void main() {
  vec3 local = (uModel * vec4(aPos / 16.0, 1.0)).xyz;
  int flags = int(aExtra.x + 0.5);
  vec3 wp = local + uOrigin;
  vec3 p = local + uOffset + wave(wp, flags);
  vPos = p;
  vWorld = wp;
  gl_Position = uViewProj * vec4(p, 1.0);
  vUV = vec3(aUV * uUVScale, aData.x);
  vLight = aData.yz / 240.0;
  vAO = aData.w / 255.0;
  vNormal = int(aExtra.y + 0.5);
  vFlags = flags;
  vClimate = aExtra.zw / 255.0;
}`;

export const CHUNK_FS = `
precision highp float;
precision highp int;
precision highp sampler2DArray;
in vec3 vUV;
in vec2 vLight;
in float vAO;
in vec3 vPos;
in vec3 vWorld;
in vec2 vClimate;
flat in int vNormal;
flat in int vFlags;
uniform sampler2DArray uTex;
uniform float uAlphaTest;
uniform float uAlphaMul;
uniform vec3 uLightOverride;
uniform vec4 uOverlay;
uniform mat4 uModel;
uniform vec2 uFogRange;
out vec4 fragColor;
${COMMON}
#if FANCY
${SKY}
${SHADOWS}
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform float uUnderwater;
uniform vec3 uWaterFog;
uniform float uHaze;
uniform float uTime;
#else
uniform vec3 uSkyLight;
uniform vec3 uFogColor;
#endif
void main() {
  vec4 tex = texture(uTex, vUV);
  if (tex.a < uAlphaTest) discard;
  vec3 albedo = applyTint(tex, vClimate);
  vec2 lv = uLightOverride.z > 0.5 ? uLightOverride.xy : vLight;
  vec3 N = normalize(mat3(uModel) * NORMALS[vNormal]);
  float dist = length(vPos);
#if FANCY
  vec3 alb = pow(albedo, vec3(2.2));
  bool plant = vNormal == 6;
  float skyVis = lightCurve(lv.x);
  float ndl = plant ? 0.75 : dot(N, uLightDir);
  float direct = 0.0;
  if (ndl > 0.0) {
    direct = ndl * smoothstep(0.45, 0.9, lv.x) * shadowAt(vPos, plant ? vec3(0.0, 1.0, 0.0) : N);
  }
  vec3 ambient = mix(uAmbientGround, uAmbientSky, N.y * 0.5 + 0.5) * skyVis;
  float bl = lightCurve(lv.y);
  float flicker = 1.0 + sin(uTime * 7.0 + vWorld.x * 3.1 + vWorld.z * 1.7) * 0.03;
  vec3 torch = vec3(1.0, 0.56, 0.24) * bl * bl * 1.7 * flicker;
  vec3 light = uLightColor * direct * mix(1.0, vAO, 0.35) + (ambient + torch) * vAO + vec3(0.004);
  vec3 col = alb * light;
  if ((vFlags & 8) != 0) {
    float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
    col += alb * smoothstep(0.45, 0.85, lum) * 5.0;
  }
  col = mix(col, uOverlay.rgb * (0.25 + skyVis), uOverlay.a);
  vec3 fogCol = fogColor(normalize(vec3(vPos.x, abs(vPos.y) * 0.15 + 0.03 * dist, vPos.z)));
  float fog = smoothstep(uFogRange.x, uFogRange.y, dist);
  float haze = (1.0 - exp(-dist * uHaze)) * 0.45;
  if (uUnderwater > 0.5) {
    fogCol = uWaterFog;
    fog = 1.0 - exp(-dist * 0.08);
    haze = 0.0;
  }
  col = mix(col, fogCol, clamp(max(fog, haze), 0.0, 1.0));
  fragColor = vec4(col, tex.a * uAlphaMul);
#else
  vec3 sky = lightCurve(lv.x) * uSkyLight;
  vec3 torch = lightCurve(lv.y) * vec3(1.0, 0.88, 0.7);
  vec3 light = max(max(sky, torch), vec3(0.03));
  float shade = vNormal == 6 ? 0.92 : N.y > 0.5 ? 1.0 : N.y < -0.5 ? 0.5 : abs(N.x) > 0.5 ? 0.6 : 0.8;
  vec3 col = albedo * light * shade * vAO;
  col = mix(col, uOverlay.rgb, uOverlay.a);
  float fog = smoothstep(uFogRange.x, uFogRange.y, dist);
  fragColor = vec4(mix(col, uFogColor, fog), tex.a * uAlphaMul);
#endif
}`;

// Depth-only pass from the sun's point of view (alpha-tested for leaves).
export const SHADOW_VS = `
precision highp float;
precision highp int;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aData;
layout(location=3) in vec4 aExtra;
uniform mat4 uShadowMatrix;
uniform mat4 uModel;
uniform vec3 uOffset;
uniform vec3 uOrigin;
uniform float uUVScale;
out vec3 vUV;
${WAVE}
void main() {
  vec3 local = (uModel * vec4(aPos / 16.0, 1.0)).xyz;
  int flags = int(aExtra.x + 0.5);
  vec3 p = local + uOffset + wave(local + uOrigin, flags);
  gl_Position = uShadowMatrix * vec4(p, 1.0);
  vUV = vec3(aUV * uUVScale, aData.x);
}`;

export const SHADOW_FS = `
precision highp float;
precision highp sampler2DArray;
in vec3 vUV;
uniform sampler2DArray uTex;
void main() {
  if (texture(uTex, vUV).a < 0.5) discard;
}`;

// Water with screen-space reflections, refraction and sun glints.
export const WATER_FS = `
precision highp float;
precision highp int;
precision highp sampler2DArray;
in vec3 vUV;
in vec2 vLight;
in float vAO;
in vec3 vPos;
in vec3 vWorld;
in vec2 vClimate;
flat in int vNormal;
flat in int vFlags;
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec2 uScreen;
uniform float uNear;
uniform float uFar;
uniform vec2 uFogRange;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbientSky;
uniform float uUnderwater;
uniform vec3 uWaterFog;
uniform float uHaze;
uniform float uTime;
out vec4 fragColor;
${COMMON}
${SKY}
${SHADOWS}
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}
vec2 waveGrad(vec2 p, vec2 dir, float freq, float amp, float speed) {
  float ph = dot(p, dir) * freq + uTime * speed;
  return dir * cos(ph) * freq * amp;
}
vec3 waterNormal(vec2 p) {
  vec2 g = waveGrad(p, normalize(vec2(1.0, 0.35)), 0.9, 0.05, 1.4);
  g += waveGrad(p, normalize(vec2(-0.6, 1.0)), 1.6, 0.03, 1.9);
  g += waveGrad(p, normalize(vec2(0.25, -1.0)), 3.1, 0.014, 2.6);
  g += waveGrad(p, normalize(vec2(-1.0, -0.2)), 5.3, 0.008, 3.3);
  return normalize(vec3(-g.x, 1.0, -g.y));
}
vec4 traceReflection(vec3 posV, vec3 dirV) {
  vec3 p = posV;
  float stepLen = 0.25 + length(posV) * 0.01;
  for (int i = 0; i < 40; i++) {
    p += dirV * stepLen;
    stepLen *= 1.12;
    vec4 clip = uProj * vec4(p, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sceneZ = linDepth(texture(uSceneDepth, uv).r);
    float rayZ = -p.z;
    if (rayZ > sceneZ && rayZ - sceneZ < stepLen * 2.5 + 0.4) {
      // Refine the hit with a short binary search.
      vec3 a = p - dirV * stepLen, b = p;
      for (int k = 0; k < 5; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 mc = uProj * vec4(m, 1.0);
        vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
        if (-m.z > linDepth(texture(uSceneDepth, muv).r)) b = m; else a = m;
      }
      vec4 bc = uProj * vec4(b, 1.0);
      uv = bc.xy / bc.w * 0.5 + 0.5;
      if (texture(uSceneDepth, uv).r >= 0.99999) break; // sky: use the sky model
      vec2 e = smoothstep(0.0, 0.12, uv) * smoothstep(0.0, 0.12, 1.0 - uv);
      return vec4(texture(uSceneColor, uv).rgb, e.x * e.y);
    }
  }
  return vec4(0.0);
}
void main() {
  bool top = vNormal == 2;
  vec3 N = top ? waterNormal(vWorld.xz) : NORMALS[vNormal];
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPos);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec2 suv = gl_FragCoord.xy / uScreen;
  float waterZ = linDepth(gl_FragCoord.z);
  vec2 ruv = clamp(suv + N.xz * 0.05 / max(1.0, waterZ * 0.08), 0.001, 0.999);
  float sceneZ = linDepth(texture(uSceneDepth, ruv).r);
  if (sceneZ < waterZ) {
    ruv = suv;
    sceneZ = linDepth(texture(uSceneDepth, suv).r);
  }
  vec3 behind = texture(uSceneColor, ruv).rgb;
  float thick = uUnderwater > 0.5 ? 0.0 : max(sceneZ - waterZ, 0.0);
  vec3 absorb = exp(-thick * vec3(0.30, 0.10, 0.06));
  float skyVis = lightCurve(vLight.x);
  vec3 scatter = vec3(0.02, 0.09, 0.13) * (uAmbientSky * 1.2 + uLightColor * 0.12) * skyVis;
  vec3 refr = behind * absorb + scatter * (1.0 - absorb);
  vec3 refl = skyColor(vec3(R.x, max(R.y, 0.02), R.z)) * skyVis;
  if (gl_FrontFacing) {
    vec3 posV = (uView * vec4(vPos, 1.0)).xyz;
    vec3 dirV = normalize(mat3(uView) * R);
    vec4 hit = traceReflection(posV, dirV);
    refl = mix(refl, hit.rgb, hit.a);
  } else {
    fres = min(fres, 0.3);
  }
  vec3 col = mix(refr, refl, fres);
  float sun = pow(max(dot(R, uLightDir), 0.0), 240.0) * 7.0 + pow(max(dot(R, uLightDir), 0.0), 24.0) * 0.12;
  col += uLightColor * sun * shadowAt(vPos, vec3(0.0, 1.0, 0.0)) * smoothstep(0.45, 0.9, vLight.x) * (gl_FrontFacing ? 1.0 : 0.0);
  float dist = length(vPos);
  vec3 fogCol = fogColor(normalize(vec3(vPos.x, abs(vPos.y) * 0.15 + 0.03 * dist, vPos.z)));
  float fog = smoothstep(uFogRange.x, uFogRange.y, dist);
  float haze = (1.0 - exp(-dist * uHaze)) * 0.45;
  if (uUnderwater > 0.5) {
    fogCol = uWaterFog;
    fog = 1.0 - exp(-dist * 0.08);
    haze = 0.0;
  }
  col = mix(col, fogCol, clamp(max(fog, haze), 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}`;

export const FULLSCREEN_VS = `
out vec2 vUV;
out vec2 vNdc;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vNdc = p;
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const SKY_FS = `
precision highp float;
in vec2 vNdc;
uniform vec3 uForward, uRight, uUp;
uniform vec2 uTanHalf;
uniform float uNight, uStarAngle, uSunVis;
out vec4 fragColor;
#if FANCY
${SKY}
#else
uniform vec3 uSunDir;
uniform vec3 uZenith, uHorizon, uSunsetColor;
uniform float uSunset;
#endif
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
#if FANCY
  vec3 col = skyColor(dir);
#else
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));
  float sdv = max(dot(dir, uSunDir), 0.0);
  col += uSunsetColor * uSunset * pow(sdv, 5.0) * (1.0 - clamp(abs(h) * 2.0, 0.0, 1.0));
#endif
  float c = cos(uStarAngle), s = sin(uStarAngle);
  vec3 sdir = vec3(c * dir.x + s * dir.y, -s * dir.x + c * dir.y, dir.z);
  vec3 cell = floor(sdir * 220.0);
  float star = step(0.9982, hash(cell)) * uNight * clamp(h * 4.0, 0.0, 1.0);
  col += vec3(star) * (0.6 + 0.4 * hash(cell + 3.0));
  float sun = squareDisc(dir, uSunDir, 0.05);
  float moon = squareDisc(dir, -uSunDir, 0.038);
#if FANCY
  col += vec3(1.0, 0.85, 0.6) * sun * 18.0 * uSunVis;
  col = mix(col, vec3(0.8, 0.84, 0.95) * 1.6, moon * uNight);
#else
  col = mix(col, vec3(1.0, 0.97, 0.82), sun);
  col = mix(col, vec3(0.86, 0.88, 0.96), moon);
#endif
  fragColor = vec4(col, 1.0);
}`;

export const CLOUD_VS = `
precision highp float;
uniform mat4 uViewProj;
uniform float uRadius, uHeight;
out vec2 vLocal;
void main() {
  vec2 corners[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));
  vec2 c = corners[gl_VertexID] * uRadius;
  vLocal = c;
  gl_Position = uViewProj * vec4(c.x, uHeight, c.y, 1.0);
}`;

export const CLOUD_FS = `
precision highp float;
in vec2 vLocal;
uniform sampler2D uClouds;
uniform vec2 uCamXZ;
uniform float uTime, uRadius, uHeight;
uniform vec3 uColor;
out vec4 fragColor;
#if FANCY
${SKY}
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbientSky;
float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 5; i++) {
    v += texture(uClouds, p).r * a;
    p = p * 2.03 + vec2(0.17, 0.31);
    a *= 0.5;
  }
  return v;
}
#endif
void main() {
  float fade = 1.0 - smoothstep(uRadius * 0.45, uRadius, length(vLocal));
#if FANCY
  vec2 wp = uCamXZ + vLocal + vec2(uTime * 1.5, uTime * 0.4);
  vec2 p = wp / 1900.0;
  float n = fbm(p);
  float cover = smoothstep(0.5, 0.68, n);
  float thick = smoothstep(0.58, 0.85, n);
  vec3 viewDir = normalize(vec3(vLocal.x, uHeight, vLocal.y));
  float toward = pow(max(dot(viewDir, uLightDir), 0.0), 5.0);
  vec3 lit = uLightColor * (0.45 + 0.9 * toward) * (1.0 - thick * 0.5) + uAmbientSky * (1.3 - thick * 0.4);
  vec3 col = mix(lit, fogColor(viewDir), (1.0 - fade) * 0.8);
  float a = cover * 0.9 * fade;
  if (a < 0.01) discard;
  fragColor = vec4(col, a);
#else
  vec2 world = uCamXZ + vLocal + vec2(uTime * 1.2, 0.0);
  float c = step(0.5, texture(uClouds, world / (12.0 * 128.0)).r);
  float a = c * 0.78 * fade;
  if (a < 0.01) discard;
  fragColor = vec4(uColor, a);
#endif
}`;

export const LINE_VS = `
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
void main() { gl_Position = uViewProj * vec4(aPos, 1.0); }`;

export const LINE_FS = `
precision mediump float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;

export const PARTICLE_VS = `
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

export const PARTICLE_FS = `
precision highp float;
precision highp sampler2DArray;
in vec3 vInfo;
in vec2 vLight;
in float vDist;
uniform sampler2DArray uTex;
uniform vec3 uSkyLight;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uLinear;
out vec4 fragColor;
float curve(float l) { return pow(0.84, (1.0 - l) * 15.0); }
void main() {
  vec2 uv = (vInfo.xy + gl_PointCoord * 4.0) / 16.0;
  vec4 tex = texture(uTex, vec3(uv, vInfo.z));
  if (tex.a < 0.5) discard;
  vec3 c = tex.rgb;
  if (tex.a < 0.99) c *= vec3(0.5, 0.72, 0.32);
  vec3 light = max(max(curve(vLight.x) * uSkyLight, curve(vLight.y) * vec3(1.0, 0.7, 0.45)), vec3(0.03));
  if (uLinear > 0.5) c = pow(c, vec3(2.2));
  float fog = smoothstep(uFogRange.x, uFogRange.y, vDist);
  fragColor = vec4(mix(c * light, uFogColor, fog), 1.0);
}`;

// ---- Post-processing -------------------------------------------------------

export const BRIGHT_FS = `
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUV + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUV + uTexel * vec2(0.5, -0.5)).rgb
         + texture(uTex, vUV + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUV + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + 0.5, 0.0, 1.0);
  soft = soft * soft * 0.5;
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(min(c * w, vec3(10.0)), 1.0);
}`;

export const BLUR_FS = `
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 0.227027;
  c += texture(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}`;

export const COPY_FS = `
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 fragColor;
void main() { fragColor = vec4(texture(uTex, vUV).rgb, 1.0); }`;

// Occlusion mask for light shafts: bright sky pixels only.
export const RAYMASK_FS = `
precision highp float;
in vec2 vUV;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uSunUV;
uniform float uAspect;
out vec4 fragColor;
void main() {
  float sky = step(0.99999, texture(uDepth, vUV).r);
  vec2 d = (vUV - uSunUV) * vec2(uAspect, 1.0);
  float near = exp(-dot(d, d) * 18.0);
  vec3 c = min(texture(uColor, vUV).rgb, vec3(4.0));
  fragColor = vec4(c * sky * near * 0.5, 1.0);
}`;

export const RAYS_FS = `
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uSunUV;
out vec4 fragColor;
void main() {
  vec2 delta = (vUV - uSunUV) / 48.0;
  vec2 uv = vUV;
  float decay = 1.0;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    uv -= delta;
    sum += texture(uTex, uv).rgb * decay;
    decay *= 0.965;
  }
  fragColor = vec4(sum / 48.0, 1.0);
}`;

export const COMPOSITE_FS = `
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;
uniform sampler2D uRays;
uniform float uBloomStrength;
uniform vec3 uRayColor;
uniform float uExposure;
uniform float uUnderwater;
uniform float uTime;
uniform float uSaturation;
out vec4 fragColor;
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec2 uv = vUV;
  if (uUnderwater > 0.5) uv += vec2(sin(uv.y * 28.0 + uTime * 2.1), cos(uv.x * 24.0 + uTime * 1.7)) * 0.0022;
  vec3 col = texture(uScene, uv).rgb;
  vec3 bloom = texture(uBloom1, uv).rgb * 0.5 + texture(uBloom2, uv).rgb * 0.8 + texture(uBloom3, uv).rgb * 1.1;
  col += bloom * uBloomStrength;
  col += texture(uRays, uv).rgb * uRayColor;
  col *= uExposure;
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSaturation), 0.0);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 v = vUV - 0.5;
  col *= 1.0 - 0.28 * pow(length(v) * 1.35, 2.4);
  if (uUnderwater > 0.5) col *= vec3(0.55, 0.8, 1.0);
  fragColor = vec4(col, 1.0);
}`;

// ---- Weather: rain, snow and lightning -------------------------------------

export const WEATHER_VS = `
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aUV;
layout(location=2) in float aAlpha;
uniform mat4 uViewProj;
out vec3 vUV;
out float vAlpha;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
  vUV = aUV;
  vAlpha = aAlpha;
}`;

export const WEATHER_FS = `
precision highp float;
precision highp sampler2DArray;
in vec3 vUV;
in float vAlpha;
uniform sampler2DArray uTex;
uniform vec3 uLight;
uniform float uLinear;
out vec4 fragColor;
void main() {
  // Level 0 only: mipmaps would smear the thin streaks into a haze.
  vec4 t = textureLod(uTex, vec3(fract(vUV.xy), vUV.z), 0.0);
  if (t.a < 0.05) discard;
  vec3 c = t.rgb;
  if (uLinear > 0.5) c = pow(c, vec3(2.2));
  fragColor = vec4(c * uLight, t.a * vAlpha);
}`;
