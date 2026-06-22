import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBalance } from '../src/sync/runner';

test('parseBalance handles Belgian on-screen amounts', () => {
  assert.equal(parseBalance('514,62'), 51462);
  assert.equal(parseBalance('6.371,66'), 637166); // thousands dot
  assert.equal(parseBalance('-19,00'), -1900);
  assert.equal(parseBalance('€ 0,00'), 0);
  assert.equal(parseBalance(null), null);
  assert.equal(parseBalance('n/a'), null);
});
