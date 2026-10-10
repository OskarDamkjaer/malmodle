import { openSync, readSync, closeSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

function reader(buf) {
  let p = 0;
  const varint = () => {
    let x = 0;
    let shift = 0;
    for (;;) {
      const b = buf[p++];
      x += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return x;
      shift += 7;
    }
  };
  return {
    get done() { return p >= buf.length; },
    varint,
    bytes: () => { const n = varint(); const b = buf.subarray(p, p + n); p += n; return b; },
    skip: (wire) => {
      if (wire === 0) varint();
      else if (wire === 2) { const n = varint(); p += n; }
      else if (wire === 5) p += 4;
      else if (wire === 1) p += 8;
      else throw new Error(`unknown protobuf wire type ${wire}`);
    },
  };
}

function fields(buf, fn) {
  const r = reader(buf);
  while (!r.done) {
    const tag = r.varint();
    if (!fn(tag >> 3, tag & 7, r)) r.skip(tag & 7);
  }
}

function tileValue(buf) {
  let out = null;
  fields(buf, (num, wire, r) => {
    if (num === 1 && wire === 2) { out = r.bytes().toString(); return true; }
    if (num === 4 || num === 5) { out = r.varint(); return true; }
    return false;
  });
  return out;
}

function rings(buf) {
  const r = reader(buf);
  const out = [];
  let ring = null;
  let x = 0;
  let y = 0;
  while (!r.done) {
    const header = r.varint();
    const command = header & 7;
    const count = header >> 3;
    if (command === 7) continue;
    for (let i = 0; i < count; i++) {
      const dx = r.varint();
      const dy = r.varint();
      x += (dx >> 1) ^ -(dx & 1);
      y += (dy >> 1) ^ -(dy & 1);
      if (command === 1) { ring = [[x, y]]; out.push(ring); } else ring?.push([x, y]);
    }
  }
  return out;
}

function layerOf(tile, wanted, at = null) {
  const out = [];
  fields(tile, (num, wire, r) => {
    if (num !== 3 || wire !== 2) return false;
    const buf = r.bytes();
    const keys = [];
    const values = [];
    const features = [];
    let name = '';
    let extent = 4096;
    fields(buf, (n, w, rr) => {
      if (n === 1) { name = rr.bytes().toString(); return true; }
      if (n === 5) { extent = rr.varint(); return true; }
      if (n === 3) { keys.push(rr.bytes().toString()); return true; }
      if (n === 4) { values.push(tileValue(rr.bytes())); return true; }
      if (n === 2) {
        const feature = { tags: [], type: 0, geometry: null };
        fields(rr.bytes(), (fn, fw, fr) => {
          if (fn === 3) { feature.type = fr.varint(); return true; }
          if (fn === 4 && at) { feature.geometry = rings(fr.bytes()); return true; }
          if (fn !== 2 || fw !== 2) return false;
          const packed = reader(fr.bytes());
          while (!packed.done) feature.tags.push(packed.varint());
          return true;
        });
        features.push(feature);
        return true;
      }
      return false;
    });
    if (name !== wanted) return true;
    for (const f of features) {
      const props = {};
      for (let i = 0; i < f.tags.length; i += 2) props[keys[f.tags[i]]] = values[f.tags[i + 1]];
      out.push(at ? { properties: props, geometry: geoJSON(f, extent, at) } : props);
    }
    return true;
  });
  return out;
}

function geoJSON({ type, geometry }, extent, { z, x, y }) {
  const size = extent * 2 ** z;
  const project = ([px, py]) => {
    const lon = ((x * extent + px) * 360) / size - 180;
    const y2 = 180 - ((y * extent + py) * 360) / size;
    const lat = (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90;
    return [lon, lat];
  };
  const lines = (geometry ?? []).map((ring) => ring.map(project));
  if (type === 1) return { type: 'Point', coordinates: lines[0]?.[0] ?? [0, 0] };
  if (type === 3) return { type: 'Polygon', coordinates: lines };
  return lines.length === 1
    ? { type: 'LineString', coordinates: lines[0] }
    : { type: 'MultiLineString', coordinates: lines };
}


export const layerFeatures = (tile, wanted, at) => layerOf(tile, wanted, at);

function directory(buf) {
  const r = reader(buf);
  const n = r.varint();
  const ids = new Array(n);
  const runs = new Array(n);
  const lengths = new Array(n);
  const offsets = new Array(n);
  let id = 0;
  for (let i = 0; i < n; i++) { id += r.varint(); ids[i] = id; }
  for (let i = 0; i < n; i++) runs[i] = r.varint();
  for (let i = 0; i < n; i++) lengths[i] = r.varint();
  for (let i = 0; i < n; i++) {
    const v = r.varint();
    offsets[i] = v === 0 && i > 0 ? offsets[i - 1] + lengths[i - 1] : v - 1;
  }
  return ids.map((tileId, i) => ({ tileId, run: runs[i], length: lengths[i], offset: offsets[i] }));
}

function zoomOf(tileId) {
  let z = 0;
  let base = 0;
  while (base + 4 ** (z + 1) <= tileId + 1) { base += 4 ** z; z++; }
  return z;
}

function xyOf(tileId, z) {
  let base = 0;
  for (let i = 0; i < z; i++) base += 4 ** i;
  let t = tileId - base;
  let x = 0;
  let y = 0;
  for (let s = 1; s < 2 ** z; s *= 2) {
    const rx = 1 & Math.floor(t / 2);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

export function* tiles(file, { minZoom = 0, zoom: only = null } = {}) {
  const fd = openSync(file, 'r');
  try {
    const read = (off, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, off); return b; };
    const head = read(0, 127);
    if (head.subarray(0, 7).toString() !== 'PMTiles') throw new Error(`not a pmtiles archive: ${file}`);
    const u64 = (o) => Number(head.readBigUInt64LE(o));
    const [rootOff, rootLen] = [u64(8), u64(16)];
    const [leafOff, dataOff] = [u64(40), u64(56)];
    const internal = head.readUInt8(97);
    const tileComp = head.readUInt8(98);
    const decompress = (buf, kind) => (kind === 2 ? gunzipSync(buf) : buf);

    const entries = [];
    for (const e of directory(decompress(read(rootOff, rootLen), internal))) {
      if (e.run === 0) entries.push(...directory(decompress(read(leafOff + e.offset, e.length), internal)));
      else entries.push(e);
    }

    for (const e of entries) {
      const zoom = zoomOf(e.tileId);
      if (zoom < minZoom || (only !== null && zoom !== only)) continue;
      const [x, y] = xyOf(e.tileId, zoom);
      yield { z: zoom, x, y, zoom, data: decompress(read(dataOff + e.offset, e.length), tileComp) };
    }
  } finally {
    closeSync(fd);
  }
}
