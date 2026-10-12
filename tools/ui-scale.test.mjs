import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUiScale } from '../src/services/uiScale.ts';

test('automatic scale adapts to touch and CSS viewport size without multiplying Retina density', () => {
  assert.equal(resolveUiScale(undefined, true, 1366, 1024), 1.4);
  assert.equal(resolveUiScale(undefined, true, 1024, 1366), 1.4);
  assert.equal(resolveUiScale(undefined, true, 390, 844), 1.3);
  assert.equal(resolveUiScale(undefined, false, 2560, 1440), 1);
});
test('manual preference wins and malformed values remain safe', () => {
  assert.equal(resolveUiScale(1.75, true, 1024, 1366), 1.75);
  assert.equal(resolveUiScale(0, true, 1024, 1366), 1);
  assert.equal(resolveUiScale(8, false, 1024, 1366), 1.8);
  assert.equal(resolveUiScale(NaN, true, 1024, 1366), 1.4);
});
