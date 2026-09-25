// Voxel ray traversal (Amanatides & Woo DDA) with per-shape hit boxes.
import { BLOCKS } from './blocks.js';

const FULL_BOX = [0, 0, 0, 1, 1, 1];

export function selectionBox(id) {
  return BLOCKS[id].selectionBox || FULL_BOX;
}

// Ray / AABB slab test. Returns { t, face } or null. face follows FACE_* order.
function rayBox(ox, oy, oz, dx, dy, dz, box) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const lo = box[a], hi = box[a + 3];
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < lo || o[a] > hi) return null;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    // Entering through the low side means the hit face points negative.
    let f1 = a * 2 + 1, f2 = a * 2;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      [f1, f2] = [f2, f1];
    }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  // Face index layout: +X=0 -X=1 +Y=2 -Y=3 +Z=4 -Z=5.
  return { t: tmin, face };
}

const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Returns the first targetable block hit within maxDist, or null.
// `getBlock(x, y, z)` supplies block ids.
export function raycast(getBlock, origin, dir, maxDist) {
  let [x, y, z] = origin.map(Math.floor);
  const [dx, dy, dz] = dir;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dx), tDeltaY = Math.abs(1 / dy), tDeltaZ = Math.abs(1 / dz);
  const frac = (v, s) => (s > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v));
  let tMaxX = dx === 0 ? Infinity : frac(origin[0], stepX) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : frac(origin[1], stepY) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : frac(origin[2], stepZ) * tDeltaZ;
  let t = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const id = getBlock(x, y, z);
    if (id && BLOCKS[id].targetable) {
      const hit = rayBox(origin[0] - x, origin[1] - y, origin[2] - z, dx, dy, dz, selectionBox(id));
      if (hit && hit.t <= maxDist) {
        const face = hit.face >= 0 ? hit.face : 2;
        return { x, y, z, id, face, normal: NORMALS[face], distance: Math.max(0, hit.t) };
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
    }
  }
  return null;
}
