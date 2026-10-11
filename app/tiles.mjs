import { closest } from './geo.mjs';

export function tileAt([lon, lat], z) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    z,
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n),
  };
}

function reader(bytes) {
  let i = 0;
  const varint = () => {
    let value = 0;
    let scale = 1;
    for (;;) {
      const b = bytes[i++];
      value += (b & 0x7f) * scale;
      if (b < 0x80) return value;
      scale *= 128;
    }
  };
  return {
    more: () => i < bytes.length,
    varint,
    field() {
      const key = varint();
      const type = key & 7;
      let value;
      if (type === 0) value = varint();
      else if (type === 2) {
        const len = varint();
        value = bytes.subarray(i, i + len);
        i += len;
      } else if (type === 1) i += 8;
      else if (type === 5) i += 4;
      return { field: Math.floor(key / 8), value };
    },
  };
}

function packed(bytes) {
  const r = reader(bytes);
  const out = [];
  while (r.more()) out.push(r.varint());
  return out;
}

const zigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
const text = new TextDecoder();

function lines(commands) {
  const out = [];
  let x = 0;
  let y = 0;
  let line = null;
  for (let i = 0; i < commands.length;) {
    const id = commands[i] & 7;
    const count = Math.floor(commands[i++] / 8);
    if (id === 7) continue;
    for (let k = 0; k < count; k++) {
      x += zigzag(commands[i++]);
      y += zigzag(commands[i++]);
      if (id === 1) out.push((line = []));
      line.push([x, y]);
    }
  }
  return out;
}

export function namedLines(bytes, { z, x, y }, layerName) {
  const top = reader(bytes);
  while (top.more()) {
    const { field, value } = top.field();
    if (field !== 3) continue;
    const layer = reader(value);
    let name = null;
    let extent = 4096;
    const keys = [];
    const values = [];
    const features = [];
    while (layer.more()) {
      const f = layer.field();
      if (f.field === 1) name = text.decode(f.value);
      else if (f.field === 2) features.push(f.value);
      else if (f.field === 3) keys.push(text.decode(f.value));
      else if (f.field === 4) {
        const v = reader(f.value).field();
        values.push(v.field === 1 ? text.decode(v.value) : v.value);
      } else if (f.field === 5) extent = f.value;
    }
    if (name !== layerName) continue;
    const n = 2 ** z;
    const lngLat = ([px, py]) => [
      ((x + px / extent) / n) * 360 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) * 180) / Math.PI,
    ];
    return features.flatMap((bytesOf) => {
      const feature = reader(bytesOf);
      let tags = [];
      let type = 0;
      let geometry = [];
      while (feature.more()) {
        const f = feature.field();
        if (f.field === 2) tags = packed(f.value);
        else if (f.field === 3) type = f.value;
        else if (f.field === 4) geometry = packed(f.value);
      }
      if (type !== 2) return [];
      const props = {};
      for (let t = 0; t < tags.length; t += 2) props[keys[tags[t]]] = values[tags[t + 1]];
      if (!props.name) return [];
      return [{ name: props.name, geometry: { type: 'MultiLineString', coordinates: lines(geometry).map((l) => l.map(lngLat)) } }];
    });
  }
  return [];
}

export function streetNear(lines, tap, reach) {
  let best = null;
  for (const line of lines) {
    const { distance, point } = closest(line.geometry, tap);
    if (distance <= reach && (!best || distance < best.distance)) best = { name: line.name, distance, point };
  }
  if (!best) return null;
  const coordinates = lines.filter((l) => l.name === best.name).flatMap((l) => l.geometry.coordinates);
  return { name: best.name, kind: 'street', point: best.point, geometry: { type: 'MultiLineString', coordinates } };
}
