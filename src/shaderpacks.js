// Custom shader packs: a fragment shader, written by the player (or pasted
// from Shadertoy), that runs over the finished frame as a last pass. It sees
// the rendered image and can recolour, blur, distort or stylise it.
//
// A pack is GLSL ES 3.0 with either
//   void main() { fragColor = ...; }            (ClaudeCraft style), or
//   void mainImage(out vec4 c, in vec2 p) {...} (Shadertoy style)
// Available inputs:
//   uScene       sampler2D  the rendered frame (also iChannel0)
//   uDepth       sampler2D  scene depth, 0..1 (shaders on; 1.0 otherwise)
//   uResolution  vec2       size in pixels (also iResolution.xy)
//   uTime        float      seconds (also iTime)
//   uDaylight    float      0 at night .. 1 at noon
//   uUnderwater  float      1 when the camera is in water
//   uNether      float      1 in the Nether
//   vUV          vec2       0..1 texture coordinate of this pixel

export const SHADER_HEADER = `precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDaylight;
uniform float uUnderwater;
uniform float uNether;
#define iChannel0 uScene
#define iTime uTime
#define iResolution vec3(uResolution, 1.0)
`;

// Lines the wrapper adds before the pack's own code (plus the two that the
// renderer adds: #version and #define), to report errors on the right line.
export function headerLines(source) {
  return 2 + wrapShader(source).split(cleanSource(source))[0].split('\n').length - 1;
}

function cleanSource(source) {
  return String(source ?? '').replace(/^\s*#version[^\n]*\n?/m, '').replace(/^\s*precision\s+\w+\s+float\s*;/m, '');
}

// The full fragment shader for a pack's source.
export function wrapShader(source) {
  const src = cleanSource(source);
  const shadertoy = /\bmainImage\s*\(/.test(src) && !/\bvoid\s+main\s*\(/.test(src);
  const declaresOut = /\bout\s+vec4\s+\w+\s*;/.test(src);
  let out = SHADER_HEADER + (declaresOut ? '' : 'out vec4 fragColor;\n') + src;
  if (shadertoy) out += '\nvoid main() { mainImage(fragColor, vUV * uResolution); fragColor.a = 1.0; }\n';
  return out;
}

export const PRESETS = [
  {
    name: 'Cinematic',
    source: `// Warm highlights, teal shadows, black bars and a soft vignette.
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 grade = mix(vec3(0.0, 0.08, 0.12), vec3(0.12, 0.05, -0.04), smoothstep(0.2, 0.8, l));
  c = clamp(c + grade * 0.6, 0.0, 1.0);
  c = mix(vec3(l), c, 1.15);
  vec2 v = vUV - 0.5;
  c *= 1.0 - dot(v, v) * 0.9;
  float bars = step(0.1, vUV.y) * step(vUV.y, 0.9);
  fragColor = vec4(c * bars, 1.0);
}
`,
  },
  {
    name: 'Retro Pixels',
    source: `// Chunky pixels with a limited colour palette, like an old console.
void main() {
  vec2 cells = uResolution / 4.0;
  vec2 uv = (floor(vUV * cells) + 0.5) / cells;
  vec3 c = texture(uScene, uv).rgb;
  c = floor(c * 6.0 + 0.5) / 6.0;
  fragColor = vec4(c, 1.0);
}
`,
  },
  {
    name: 'Dreamy Glow',
    source: `// Bright areas bleed a soft glow and colours get a little pastel.
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec2 o = vec2(cos(a), sin(a)) * 6.0 / uResolution;
    vec3 s = texture(uScene, vUV + o).rgb + texture(uScene, vUV + o * 2.5).rgb;
    glow += max(s - 0.9, 0.0);
  }
  c += glow * 0.12;
  c = mix(c, vec3(dot(c, vec3(0.33))), -0.1) * 0.95 + 0.05;
  fragColor = vec4(c, 1.0);
}
`,
  },
  {
    name: 'Black and White Film',
    source: `// Grainy black-and-white film with flicker.
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  l = smoothstep(0.02, 0.98, l);
  l += (hash(vUV * uResolution + fract(uTime) * 100.0) - 0.5) * 0.08;
  l *= 0.95 + 0.05 * sin(uTime * 30.0);
  vec2 v = vUV - 0.5;
  l *= 1.0 - dot(v, v) * 1.2;
  fragColor = vec4(vec3(l), 1.0);
}
`,
  },
  {
    name: 'Cartoon Outlines',
    source: `// Dark outlines where colours change sharply, and flatter shading.
float lum(vec2 uv) { return dot(texture(uScene, uv).rgb, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 px = 1.0 / uResolution;
  float gx = lum(vUV + vec2(px.x, 0.0)) - lum(vUV - vec2(px.x, 0.0));
  float gy = lum(vUV + vec2(0.0, px.y)) - lum(vUV - vec2(0.0, px.y));
  float edge = smoothstep(0.12, 0.3, length(vec2(gx, gy)));
  vec3 c = texture(uScene, vUV).rgb;
  c = floor(c * 5.0 + 0.5) / 5.0;
  fragColor = vec4(mix(c, vec3(0.05), edge), 1.0);
}
`,
  },
  {
    name: 'Shadertoy Example (wavy)',
    source: `// Shadertoy-style code works too: mainImage, iTime, iResolution, iChannel0.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  uv.x += sin(uv.y * 20.0 + iTime * 2.0) * 0.003;
  fragColor = texture(iChannel0, uv);
}
`,
  },
];

export const TEMPLATE = `// Your shader pack. Runs over every frame.
// Inputs: uScene (the frame), uDepth, uResolution, uTime, uDaylight,
// uUnderwater, uNether, vUV. Write the colour to fragColor.
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  // Try: c = c.bgr;  or  c *= vec3(1.1, 1.0, 0.9);
  fragColor = vec4(c, 1.0);
}
`;
