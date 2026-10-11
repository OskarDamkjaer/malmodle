const M_PER_DEG = 111320;

const scale = (lat) => M_PER_DEG * Math.cos((lat * Math.PI) / 180);

export function metersBetween(a, b) {
  return Math.hypot((a[0] - b[0]) * scale(b[1]), (a[1] - b[1]) * M_PER_DEG);
}

export function offset(from, to) {
  return {
    east: (to[0] - from[0]) * scale(from[1]),
    north: (to[1] - from[1]) * M_PER_DEG,
  };
}

function lines(geometry) {
  switch (geometry.type) {
    case 'LineString': return [geometry.coordinates];
    case 'MultiLineString': return geometry.coordinates;
    case 'Polygon': return geometry.coordinates;
    case 'MultiPolygon': return geometry.coordinates.flat();
    default: return [];
  }
}

function crossings(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function contains(geometry, point) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some((rings) => rings.reduce((inside, ring) => (crossings(ring, point) ? !inside : inside), false));
}

function closestOnSegment(p, a, b) {
  const kx = scale(p[1]);
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * M_PER_DEG;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * M_PER_DEG;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { point: [p[0] + x / kx, p[1] + y / M_PER_DEG], distance: Math.hypot(x, y) };
}

export function closest(geometry, point) {
  if (geometry.type === 'Point') {
    return { point: geometry.coordinates, distance: metersBetween(point, geometry.coordinates) };
  }
  if (contains(geometry, point)) return { point, distance: 0 };
  let best = { point: null, distance: Infinity };
  for (const line of lines(geometry)) {
    for (let i = 1; i < line.length; i++) {
      const c = closestOnSegment(point, line[i - 1], line[i]);
      if (c.distance < best.distance) best = c;
    }
  }
  return best;
}

export const distanceTo = (geometry, point) => closest(geometry, point).distance;

function crosses(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

const vertices = (geometry) => (geometry.type === 'Point' ? [geometry.coordinates] : lines(geometry).flat());

export function gap(a, b) {
  for (const p of lines(a)) {
    for (const q of lines(b)) {
      for (let i = 1; i < p.length; i++) {
        for (let j = 1; j < q.length; j++) if (crosses(p[i - 1], p[i], q[j - 1], q[j])) return 0;
      }
    }
  }
  let best = Infinity;
  for (const v of vertices(a)) best = Math.min(best, distanceTo(b, v));
  for (const v of vertices(b)) best = Math.min(best, distanceTo(a, v));
  return best;
}

export function bounds(geometries) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(visit);
  };
  for (const g of geometries) visit(g.coordinates);
  return [[w, s], [e, n]];
}

export function around(center, meters) {
  const dx = meters / scale(center[1]);
  const dy = meters / M_PER_DEG;
  return [[center[0] - dx, center[1] - dy], [center[0] + dx, center[1] + dy]];
}

export function union(a, b) {
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}
