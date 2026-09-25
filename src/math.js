// Minimal column-major 4x4 matrix helpers (same layout as WebGL expects).

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function multiply(out, a, b) {
  const r = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      r[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  out.set(r);
  return out;
}

// Camera basis for a yaw/pitch camera. yaw = 0 looks towards -Z, positive
// pitch looks up.
export function cameraBasis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const forward = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
}

// Rotation-only view matrix: geometry is rendered camera-relative so that
// huge world coordinates never lose float precision on the GPU.
export function viewRotation(out, yaw, pitch) {
  const { forward: f, right: r, up: u } = cameraBasis(yaw, pitch);
  out.fill(0);
  out[0] = r[0]; out[4] = r[1]; out[8] = r[2];
  out[1] = u[0]; out[5] = u[1]; out[9] = u[2];
  out[2] = -f[0]; out[6] = -f[1]; out[10] = -f[2];
  out[15] = 1;
  return out;
}

// Extracts the 6 frustum planes (normalized) from a view-projection matrix.
export function frustumPlanes(m) {
  const planes = [];
  const rows = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = rows(0), r1 = rows(1), r2 = rows(2), r3 = rows(3);
  const combos = [
    [r3, r0, 1], [r3, r0, -1],
    [r3, r1, 1], [r3, r1, -1],
    [r3, r2, 1], [r3, r2, -1],
  ];
  for (const [a, b, s] of combos) {
    const p = [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
    const len = Math.hypot(p[0], p[1], p[2]) || 1;
    planes.push([p[0] / len, p[1] / len, p[2] / len, p[3] / len]);
  }
  return planes;
}

// True if the axis-aligned box intersects (or is inside) the frustum.
export function aabbInFrustum(planes, minX, minY, minZ, maxX, maxY, maxZ) {
  for (const p of planes) {
    const x = p[0] >= 0 ? maxX : minX;
    const y = p[1] >= 0 ? maxY : minY;
    const z = p[2] >= 0 ? maxZ : minZ;
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
  }
  return true;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// --- Affine transform builders (column-major) ---

export function translation(x, y, z) {
  const m = mat4();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function scaling(x, y = x, z = x) {
  const m = mat4();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

export function rotationX(a) {
  const m = mat4(), c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function rotationY(a) {
  const m = mat4(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function rotationZ(a) {
  const m = mat4(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

// compose(A, B, C) = A * B * C (C is applied first).
export function compose(...ms) {
  const out = mat4();
  for (const m of ms) multiply(out, out, m);
  return out;
}
