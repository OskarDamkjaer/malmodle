import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_STYLE, STYLES, paintFor } from '../app/palette.mjs';

const STYLE = 'build/style.json';
const names = Object.keys(STYLES);

test('every style defines the same colours', () => {
  const shape = (s) => [Object.keys(s.map).sort(), Object.keys(s.marks).sort()];
  for (const name of names) assert.deepEqual(shape(STYLES[name]), shape(STYLES[DEFAULT_STYLE]), name);
});

test('every coloured basemap layer is recoloured by every style', { skip: existsSync(STYLE) ? false : `${STYLE} is missing` }, () => {
  const { layers } = JSON.parse(readFileSync(STYLE, 'utf8'));
  for (const name of names) {
    for (const layer of layers) {
      if (!['fill', 'line', 'background', 'symbol'].includes(layer.type)) continue;
      assert.ok(Object.keys(paintFor(layer, STYLES[name].map)).length, `${name} leaves ${layer.id} alone`);
    }
  }
});
