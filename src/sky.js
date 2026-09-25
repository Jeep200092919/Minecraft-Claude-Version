// Time-of-day lighting model. Produces both the linear HDR values used by
// the shader pipeline and the gamma-space values of the vanilla renderer.
import { DAY_LENGTH_TICKS } from './constants.js';
import { smoothstep, clamp } from './math.js';

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const gray = (c, k) => {
  const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * k;
  return [l, l, l];
};

// `rain` (0..1) darkens and greys the sky; `flash` (0..1) is lightning.
export function skyState(ticks, rain = 0, flash = 0) {
  const angle = (ticks / DAY_LENGTH_TICKS) * Math.PI * 2;
  const sunDir = [Math.cos(angle), Math.sin(angle), 0.18];
  const len = Math.hypot(...sunDir);
  sunDir[0] /= len; sunDir[1] /= len; sunDir[2] /= len;
  const moonDir = [-sunDir[0], -sunDir[1], -sunDir[2]];
  const e = sunDir[1];

  const day = smoothstep(-0.12, 0.25, e);
  const sunset = Math.exp(-(e * e) / (2 * 0.13 * 0.13)); // peaks at the horizon
  const night = 1 - smoothstep(-0.28, 0.02, e);

  // --- Shader pipeline (linear HDR) ---
  let zenith = mix3([0.0012, 0.002, 0.007], [0.05, 0.17, 0.62], day);
  zenith = add3(zenith, scale3([0.03, 0.02, 0.05], sunset * 0.5));
  let horizon = mix3([0.005, 0.008, 0.018], [0.36, 0.55, 0.9], day);
  horizon = mix3(horizon, scale3([0.85, 0.3, 0.06], Math.max(day, 0.3)), sunset * 0.92);
  const sunGlow = add3(scale3([1.0, 0.38, 0.08], sunset), scale3([0.22, 0.18, 0.12], day * (1 - sunset)));

  const sunUp = e > -0.03;
  const lightDir = sunUp ? sunDir : moonDir;
  let lightColor;
  if (sunUp) {
    const warm = smoothstep(0.0, 0.45, e);
    lightColor = scale3(mix3([1.0, 0.52, 0.22], [1.0, 0.9, 0.76], warm), (1.4 + 1.1 * warm) * smoothstep(-0.03, 0.08, e));
  } else {
    lightColor = scale3([0.22, 0.30, 0.55], 0.3 * smoothstep(-0.03, 0.12, moonDir[1]));
  }
  let ambientSky = mix3([0.016, 0.024, 0.055], [0.24, 0.33, 0.5], day);
  ambientSky = add3(ambientSky, scale3([0.16, 0.07, 0.02], sunset * day));
  const ambientGround = mix3(scale3(ambientSky, 0.45), [0.14, 0.11, 0.08], 0.3 * day);

  // --- Vanilla renderer (gamma space) ---
  const vDay = smoothstep(-0.22, 0.28, e);
  const vSunset = clamp(1 - Math.abs(e) / 0.32, 0, 1);
  const vZenith = mix3([0.005, 0.008, 0.028], [0.36, 0.6, 1.0], vDay);
  let vHorizon = mix3([0.025, 0.035, 0.075], [0.7, 0.83, 1.0], vDay);
  vHorizon = mix3(vHorizon, [0.95, 0.55, 0.3], vSunset * 0.45 * Math.max(vDay, 0.3));
  const daylight = 0.16 + 0.84 * smoothstep(-0.2, 0.25, e);
  const skyLight = mix3([0.55, 0.6, 0.9], [1, 1, 1], vDay).map((v) => v * daylight);

  const r = rain;
  if (r > 0) {
    zenith = mix3(zenith, gray(zenith, 0.55), r * 0.85);
    horizon = mix3(horizon, gray(horizon, 0.6), r * 0.85);
    lightColor = scale3(lightColor, 1 - 0.8 * r);
    ambientSky = mix3(ambientSky, gray(ambientSky, 0.7), r * 0.7);
  }
  let sunGlowOut = scale3(sunGlow, 1 - r);
  let vz = mix3(vZenith, gray(vZenith, 0.6), r * 0.8), vh = mix3(vHorizon, gray(vHorizon, 0.65), r * 0.8);
  let vSkyLight = skyLight.map((v) => v * (1 - 0.35 * r));
  if (flash > 0) {
    ambientSky = add3(ambientSky, scale3([0.6, 0.65, 0.8], flash * 2));
    zenith = add3(zenith, scale3([0.3, 0.32, 0.4], flash));
    horizon = add3(horizon, scale3([0.3, 0.32, 0.4], flash));
    vSkyLight = vSkyLight.map((v) => Math.min(1.3, v + flash * 0.7));
    vz = add3(vz, scale3([0.5, 0.5, 0.6], flash));
    vh = add3(vh, scale3([0.5, 0.5, 0.6], flash));
  }
  return {
    angle, sunDir, moonDir, lightDir, lightColor, day, sunset, night,
    zenith, horizon, sunGlow: sunGlowOut, ambientSky, ambientGround,
    sunVisible: smoothstep(-0.06, 0.02, e) * (1 - r),
    rain: r,
    vanilla: { zenith: vz, horizon: vh, sunset: vSunset * (1 - r), skyLight: vSkyLight, day: vDay, night: 1 - vDay },
  };
}
