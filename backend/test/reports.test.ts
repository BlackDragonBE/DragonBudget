import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, type DB } from '../src/db';
import { balanceHistory, upcomingRecurring, insights } from '../src/reports';

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

// --- upcomingRecurring (roadmap 1.2) ---

let recHash = 0;
function addRecurring(db: DB, o: { label: string; amount: number; status?: string; next: string }): number {
  return Number(
    db.prepare(`INSERT INTO recurring_expenses
        (label, counterparty_key, expected_amount_cents, frequency, status, next_expected_date, last_seen_date)
        VALUES (?,?,?, 'monthly', ?, ?, ?)`)
      .run(o.label, `KEY:${o.label}`, o.amount, o.status ?? 'detected', o.next, o.next).lastInsertRowid,
  );
}
function addLinkedTx(db: DB, recId: number, date: string, amount: number): void {
  const tid = Number(
    db.prepare(`INSERT INTO transactions
        (import_hash, execution_date, value_date, amount_cents, account_number, transaction_type, details, status, created_at)
        VALUES (?,?,?,?, 'a', 't', 'd', 'accepted', 't')`)
      .run(`r${++recHash}`, date, date, amount).lastInsertRowid,
  );
  db.prepare('INSERT INTO recurring_expense_transactions (recurring_expense_id, transaction_id) VALUES (?,?)').run(recId, tid);
}

test('upcomingRecurring: excludes matched-this-month & dismissed, splits signs', () => {
  const db = createDb(':memory:');
  const month = '2026-06';

  // (a) due this month but already matched by a June txn → excluded
  const rent = addRecurring(db, { label: 'RENT', amount: -90000, next: '2026-06-05' });
  addLinkedTx(db, rent, '2026-06-03', -90000);

  // (b) due this month, no matching txn yet → included (expense)
  addRecurring(db, { label: 'INSURANCE', amount: -3141, next: '2026-06-20' });

  // (c) dismissed → excluded even though due and unmatched
  addRecurring(db, { label: 'OLDGYM', amount: -2500, status: 'dismissed', next: '2026-06-15' });

  // (d) recurring income (positive) → included, counts as income
  addRecurring(db, { label: 'SALARY', amount: 250000, next: '2026-06-25' });

  const r = upcomingRecurring(db, month);
  assert.deepEqual((r.upcoming as { label: string }[]).map((u) => u.label).sort(), ['INSURANCE', 'SALARY']);
  assert.equal(r.expected_expense_cents, -3141);
  assert.equal(r.expected_income_cents, 250000);
});

// --- insights (roadmap 1.3) ---

function addTx(db: DB, o: { date: string; amount: number; cat?: number }): void {
  db.prepare(`INSERT INTO transactions
      (import_hash, execution_date, value_date, amount_cents, account_number, transaction_type, details, status, created_at, category_id)
      VALUES (?,?,?,?, 'a', 't', 'd', 'accepted', 't', ?)`)
    .run(`i${++recHash}`, o.date, o.date, o.amount, o.cat ?? null);
}

test('insights: burn rate, MoM deltas, largest expenses', () => {
  const db = createDb(':memory:');
  const a = Number(db.prepare("INSERT INTO categories (name) VALUES ('A')").run().lastInsertRowid);
  const b = Number(db.prepare("INSERT INTO categories (name) VALUES ('B')").run().lastInsertRowid);

  addTx(db, { date: '2026-05-10', amount: -2000, cat: a }); // prev month A
  addTx(db, { date: '2026-06-05', amount: -3000, cat: a }); // June A
  addTx(db, { date: '2026-06-12', amount: -2000, cat: a }); // June A
  addTx(db, { date: '2026-06-08', amount: -10000, cat: b }); // June B, largest

  // 15 of 30 days elapsed; June expense total -15000.
  const r = insights(db, '2026-06', '2026-06-15');
  assert.equal(r.days_in_month, 30);
  assert.equal(r.days_elapsed, 15);
  assert.equal(r.expense_cents, -15000);
  assert.equal(r.daily_avg_cents, -1000);
  assert.equal(r.projected_expense_cents, -30000);

  // Largest expense first.
  assert.equal(r.top_expenses[0].amount_cents, -10000);
  assert.equal(r.top_expenses.length, 3);

  // B is up €100 (0 → -10000), A up €30 (-2000 → -5000); B sorts first by magnitude.
  assert.deepEqual(r.category_deltas.map((d) => d.name), ['B', 'A']);
  assert.equal(r.category_deltas.find((d) => d.name === 'A')!.delta_cents, -3000);

  // Past month: elapsed == days_in_month, projected == actual.
  const past = insights(db, '2026-05', '2026-06-15');
  assert.equal(past.days_elapsed, 31);
  assert.equal(past.projected_expense_cents, past.expense_cents);
});
