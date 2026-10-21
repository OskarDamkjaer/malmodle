import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PALETTE, paintFor } from '../app/palette.mjs';

const STYLE = 'build/style.json';
test('every coloured basemap layer is recoloured by the palette', { skip: existsSync(STYLE) ? false : `${STYLE} is missing` }, () => {
  const { layers } = JSON.parse(readFileSync(STYLE, 'utf8'));
  for (const layer of layers) {
    if (!['fill', 'line', 'background', 'symbol'].includes(layer.type)) continue;
    assert.ok(Object.keys(paintFor(layer, PALETTE.map)).length, `the palette leaves ${layer.id} alone`);
  }
});
