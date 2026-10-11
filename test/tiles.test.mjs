import { test } from 'node:test';
import assert from 'node:assert/strict';
import { namedLines, streetNear, tileAt } from '../app/tiles.mjs';

const varint = (n) => {
  const out = [];
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};
const bytes = (field, payload) => [...varint(field * 8 + 2), ...varint(payload.length), ...payload];
const number = (field, n) => [...varint(field * 8), ...varint(n)];
const str = (s) => [...new TextEncoder().encode(s)];
const zig = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const packed = (list) => list.flatMap(varint);

function encode(layerName, streets) {
  const features = streets.map((s, i) => {
    const [first, ...rest] = s.points;
    let [x, y] = first;
    const commands = [1 + 8, zig(x), zig(y), 2 + 8 * rest.length];
    for (const [nx, ny] of rest) {
      commands.push(zig(nx - x), zig(ny - y));
      [x, y] = [nx, ny];
    }
    return bytes(2, [...bytes(2, packed([0, i])), ...number(3, 2), ...bytes(4, packed(commands))]);
  });
  const layer = [
    ...bytes(1, str(layerName)),
    ...features.flat(),
    ...bytes(3, str('name')),
    ...streets.flatMap((s) => bytes(4, bytes(1, str(s.name)))),
    ...number(5, 4096),
  ];
  return new Uint8Array(bytes(3, layer));
}

const at = tileAt([13.0, 55.6], 14);

test('a point falls in the tile that covers it', () => {
  assert.deepEqual(at, { z: 14, x: 8783, y: 5134 });
});

test('named lines come back in longitude and latitude', () => {
  const data = encode('transportation_name', [{ name: 'Storgatan', points: [[0, 2048], [4096, 2048]] }]);
  const [line] = namedLines(data, at, 'transportation_name');
  assert.equal(line.name, 'Storgatan');
  const [[west, lat], [east]] = line.geometry.coordinates[0];
  assert.ok(Math.abs(east - west - 360 / 2 ** 14) < 1e-9);
  assert.ok(lat > 55.59 && lat < 55.61);
  assert.deepEqual(namedLines(data, at, 'water_name'), []);
});

test('the nearest named street within reach is the one tapped', () => {
  const data = encode('transportation_name', [
    { name: 'Norra gatan', points: [[0, 1000], [4096, 1000]] },
    { name: 'Södra gatan', points: [[0, 3000], [4096, 3000]] },
  ]);
  const lines = namedLines(data, at, 'transportation_name');
  const [[west, north]] = lines[0].geometry.coordinates[0];
  const tap = [west + 0.001, north - 0.0001];
  assert.equal(streetNear(lines, tap, 30).name, 'Norra gatan');
  assert.equal(streetNear(lines, tap, 5), null);
});
