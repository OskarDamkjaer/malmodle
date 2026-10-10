import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_THEME, THEMES, paintFor, themeFromPath, themePath } from '../app/themes.mjs';

const names = Object.keys(THEMES);

test('a theme is picked by the first path segment', () => {
  assert.equal(themeFromPath('/'), DEFAULT_THEME);
  assert.equal(themeFromPath('/finns-inte/'), DEFAULT_THEME);
  for (const name of names) assert.equal(themeFromPath(themePath(name)), name);
});

test('every theme defines the same colours', () => {
  const shape = (t) => [Object.keys(t.map).sort(), Object.keys(t.marks).sort()];
  for (const name of names) assert.deepEqual(shape(THEMES[name]), shape(THEMES[DEFAULT_THEME]), name);
});

test('every non-default theme has its own CSS and is cached for offline use', () => {
  const css = readFileSync('app/app.css', 'utf8');
  const sw = readFileSync('app/sw.js', 'utf8');
  for (const name of names.filter((n) => n !== DEFAULT_THEME)) {
    assert.ok(css.includes(`[data-theme="${name}"]`), `${name} has no CSS block`);
    assert.ok(sw.includes(`'${themePath(name)}'`), `${name} is not in the service worker`);
  }
});

const STYLE = 'build/style.json';
test('every coloured basemap layer is recoloured by every theme', { skip: existsSync(STYLE) ? false : `${STYLE} is missing` }, () => {
  const { layers } = JSON.parse(readFileSync(STYLE, 'utf8'));
  for (const name of names) {
    for (const layer of layers) {
      if (!['fill', 'line', 'background', 'symbol'].includes(layer.type)) continue;
      assert.ok(Object.keys(paintFor(layer, THEMES[name].map)).length, `${name} leaves ${layer.id} alone`);
    }
  }
});
