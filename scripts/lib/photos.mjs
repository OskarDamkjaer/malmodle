import { distance, lineLength } from './geo.mjs';

const M_PER_DEG_LAT = 111320;
const LON_SCALE = Math.cos((55.6 * Math.PI) / 180);

export const MIN_YEAR = 2018;
export const GOOD_YEAR = 2021;

const toXY = ([lon, lat]) => [lon * M_PER_DEG_LAT * LON_SCALE, lat * M_PER_DEG_LAT];

export function bearing(a, b) {
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  return ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
}

export function angleGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function lines(geometry) {
  return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
}

export function nearestOnLine(geometry, p) {
  let best = { dist: Infinity, point: null, bearing: 0 };
  const [px, py] = toXY(p);
  for (const line of lines(geometry)) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = toXY(line[i - 1]);
      const [bx, by] = toXY(line[i]);
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d < best.dist) {
        const a = line[i - 1], b = line[i];
        best = { dist: d, point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], bearing: bearing(a, b) };
      }
    }
  }
  return best;
}

export function midpoint(geometry) {
  const parts = lines(geometry);
  let rest = parts.reduce((s, l) => s + lineLength(l), 0) / 2;
  for (const line of parts) {
    for (let i = 1; i < line.length; i++) {
      const d = distance(line[i - 1], line[i]);
      if (rest <= d) {
        const t = d ? rest / d : 0;
        const a = line[i - 1], b = line[i];
        return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      }
      rest -= d;
    }
  }
  const last = parts.at(-1);
  return last.at(-1);
}

function segmentCross(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (!den) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

export function crossings(geometry, other, mergeM = 60) {
  const out = [];
  for (const l1 of lines(geometry)) for (let i = 1; i < l1.length; i++) {
    for (const l2 of lines(other)) for (let j = 1; j < l2.length; j++) {
      const p = segmentCross(l1[i - 1], l1[i], l2[j - 1], l2[j]);
      if (p && !out.some((q) => distance(p, q) < mergeM)) out.push(p);
    }
  }
  return out;
}

export function samplePoints(street, others, mergeM = 60) {
  const points = [{ label: 'mitten', point: midpoint(street.geometry) }];
  for (const o of others) {
    if (o.name === street.name) continue;
    for (const p of crossings(street.geometry, o.geometry, mergeM)) {
      if (points.some((q) => distance(p, q.point) < mergeM)) continue;
      points.push({ label: `vid ${o.name}`, point: p });
    }
  }
  return points;
}

export function streetAhead(geometry, point, heading, cone = 25) {
  let ahead = 0;
  for (const line of lines(geometry)) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const steps = Math.max(1, Math.ceil(distance(a, b) / 5));
      for (let s = 0; s <= steps; s++) {
        const p = [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps];
        const d = distance(point, p);
        if (d > ahead && angleGap(bearing(point, p), heading) <= cone) ahead = d;
      }
    }
  }
  return Math.round(ahead);
}

export function imagePoint(img) {
  return (img.computed_geometry ?? img.geometry).coordinates;
}

export function imageHeading(img) {
  return img.computed_compass_angle ?? img.compass_angle;
}

export function pickAlong(images, street, sample, { radius = 25, offLine = 12, maxAngle = 30, perDirection = 3 } = {}) {
  const local = nearestOnLine(street.geometry, sample).bearing;
  const directions = [local, (local + 180) % 360];
  const usable = images.filter((img) => {
    if (img.is_pano) return false;
    if (new Date(img.captured_at).getUTCFullYear() < MIN_YEAR) return false;
    const p = imagePoint(img);
    return distance(p, sample) <= radius && nearestOnLine(street.geometry, p).dist <= offLine;
  });
  return directions.map((dir) => {
    const rank = usable
      .filter((img) => angleGap(imageHeading(img), dir) <= maxAngle)
      .map((img) => ({
        img,
        good: new Date(img.captured_at).getUTCFullYear() >= GOOD_YEAR,
        score: distance(imagePoint(img), sample) + angleGap(imageHeading(img), dir) / 2,
      }))
      .sort((a, b) => b.good - a.good || a.score - b.score);
    const picked = [];
    const sequences = new Set();
    for (const r of rank) {
      if (sequences.has(r.img.sequence)) continue;
      sequences.add(r.img.sequence);
      picked.push(r.img);
      if (picked.length === perDirection) break;
    }
    return { heading: Math.round(dir), images: picked };
  });
}
