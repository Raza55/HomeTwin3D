import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStartPage, startPath } from '../src/services/startPage.ts';

test('automatic start selects mobile only for small screens', () => {
  assert.equal(startPath('auto', true), '/mobile');
  assert.equal(startPath('auto', false), '/board');
});
test('explicit choice overrides size; simulation keeps the board', () => {
  assert.equal(startPath('board', true), '/board');
  assert.equal(startPath('mobile', false), '/mobile');
  assert.equal(startPath('mobile', true, true), '/board');
});
test('invalid or inaccessible preferences use automatic routing', () => {
  globalThis.localStorage = { getItem: () => 'invalid' };
  assert.equal(loadStartPage(), 'auto');
  globalThis.localStorage.getItem = () => 'mobile';
  assert.equal(loadStartPage(), 'mobile');
  globalThis.localStorage.getItem = () => { throw Error('Storage unavailable'); };
  assert.equal(loadStartPage(), 'auto');
  delete globalThis.localStorage;
});
