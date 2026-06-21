import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';
import { getSetting, setSetting } from '../src/settings';

test('settings: missing key returns null', () => {
  const db = createDb(':memory:');
  assert.equal(getSetting(db, 'bank_card_number'), null);
});

test('settings: set then get round-trips, and upsert overwrites', () => {
  const db = createDb(':memory:');
  setSetting(db, 'bank_card_number', '1234567890');
  assert.equal(getSetting(db, 'bank_card_number'), '1234567890');

  setSetting(db, 'bank_card_number', '9999');
  assert.equal(getSetting(db, 'bank_card_number'), '9999');
});

test('settings: null clears the value', () => {
  const db = createDb(':memory:');
  setSetting(db, 'bank_card_number', '1234');
  setSetting(db, 'bank_card_number', null);
  assert.equal(getSetting(db, 'bank_card_number'), null);
});
