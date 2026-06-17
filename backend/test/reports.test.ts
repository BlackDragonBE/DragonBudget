import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';
import { balanceHistory } from '../src/reports';

test('balanceHistory with startCents', () => {
  const db = createDb(':memory:');
  db.prepare("INSERT INTO transactions (import_hash, value_date, amount_cents, status, details, created_at, currency, account_number, transaction_type) VALUES ('h1', '2026-01-01', 1000, 'accepted', 'd', '2026-01-01', 'EUR', 'a', 't')").run();
  db.prepare("INSERT INTO transactions (import_hash, value_date, amount_cents, status, details, created_at, currency, account_number, transaction_type) VALUES ('h2', '2026-01-02', -200, 'accepted', 'd', '2026-01-01', 'EUR', 'a', 't')").run();

  const history = balanceHistory(db, { startCents: 500 });
  assert.deepEqual(history, [
    { date: '2026-01-01', balance_cents: 1500 },
    { date: '2026-01-02', balance_cents: 1300 },
  ]);
});

test('balanceHistory with currentCents', () => {
  const db = createDb(':memory:');
  db.prepare("INSERT INTO transactions (import_hash, value_date, amount_cents, status, details, created_at, currency, account_number, transaction_type) VALUES ('h1', '2026-01-01', 1000, 'accepted', 'd', '2026-01-01', 'EUR', 'a', 't')").run();
  db.prepare("INSERT INTO transactions (import_hash, value_date, amount_cents, status, details, created_at, currency, account_number, transaction_type) VALUES ('h2', '2026-01-02', -200, 'accepted', 'd', '2026-01-01', 'EUR', 'a', 't')").run();

  // Total sum is 800. If current is 1000, start must be 200.
  const history = balanceHistory(db, { currentCents: 1000 });
  assert.deepEqual(history, [
    { date: '2026-01-01', balance_cents: 1200 },
    { date: '2026-01-02', balance_cents: 1000 },
  ]);
});

test('balanceHistory with currentCents and from filter', () => {
  const db = createDb(':memory:');
  db.prepare("INSERT INTO transactions (import_hash, value_date, amount_cents, status, details, created_at, currency, account_number, transaction_type) VALUES ('h1', '2026-01-01', 1000, 'accepted', 'd', '2026-01-01', 'EUR', 'a', 't')").run();
  db.prepare("INSERT INTO transactions (import_hash, value_date, amount_cents, status, details, created_at, currency, account_number, transaction_type) VALUES ('h2', '2026-01-02', -200, 'accepted', 'd', '2026-01-01', 'EUR', 'a', 't')").run();

  // Total sum is 800. If current is 1000, start must be 200.
  // Report from 2026-01-02.
  // Balance before 2026-01-02 is 200 (start) + 1000 (h1) = 1200.
  const history = balanceHistory(db, { currentCents: 1000, from: '2026-01-02' });
  assert.deepEqual(history, [
    { date: '2026-01-02', balance_cents: 1000 },
  ]);
});
