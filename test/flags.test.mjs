import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFlags } from '../app/flags.mjs';

test('a flag in the address turns it on and replaces what was stored', () => {
  assert.deepEqual(readFlags('#flaggor=pin', '[]'), { on: ['pin'], changed: true, hash: '' });
  assert.deepEqual(readFlags('#flaggor=', '["pin"]'), { on: [], changed: true, hash: '' });
});

test('without the address the stored flags hold', () => {
  assert.deepEqual(readFlags('', '["pin"]').on, ['pin']);
  assert.deepEqual(readFlags('', null).on, []);
  assert.deepEqual(readFlags('', 'not json').on, []);
  assert.equal(readFlags('', '["pin"]').changed, false);
});

test('unknown flags are ignored and the rest of the address is kept', () => {
  const read = readFlags('#runda=abc&flaggor=pin,okänd', null);
  assert.deepEqual(read.on, ['pin']);
  assert.equal(read.hash, 'runda=abc');
});
