import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';
import { monthReport } from '../src/reports';

function setup() {
  const db = createDb(':memory:');
  const catId = Number(
    db.prepare("INSERT INTO categories (name, rollover) VALUES ('Car Fund', 1)").run().lastInsertRowid,
  );
  // Helper: insert a fake transaction
  function addTx(month: string, cents: number) {
    db.prepare(`INSERT INTO transactions
      (import_hash, execution_date, value_date, amount_cents, currency, account_number, transaction_type, details, status, category_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(`h-${month}-${cents}-${Math.random()}`, `${month}-15`, `${month}-15`, cents, 'EUR',
           'BE00000000000000', 'Kaartbetaling', 'GARAGE DETAIL', 'accepted', catId, new Date().toISOString());
  }
  return { db, catId, addTx };
}

test('carryover: unspent budget rolls forward', () => {
  const { db, catId, addTx } = setup();
  // Budget €30/month for 3 months; spend €10 in month 1, €0 in month 2
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-01', 3000);
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-02', 3000);
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-03', 3000);
  addTx('2026-01', -1000); // spent €10
  // month 2: no spending

  const report = monthReport(db, '2026-03');
  const cat = report.categories.find((c: any) => c.category_id === catId) as any;
  assert.ok(cat, 'category should appear in report');
  // carried_in = budget(Jan+Feb) + spending(Jan+Feb) = 6000 + (-1000) = 5000
  assert.equal(cat.carried_in_cents, 5000, 'should carry €50 into March');
  // available = 3000 (March limit) + 5000 = 8000
  assert.equal(cat.available_cents, 8000, 'available should be €80 in March');
});

test('carryover: overspend rolls forward as negative', () => {
  const { db, catId, addTx } = setup();
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-01', 3000);
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-02', 3000);
  addTx('2026-01', -8000); // spent €80 against a €30 budget

  const report = monthReport(db, '2026-02');
  const cat = report.categories.find((c: any) => c.category_id === catId) as any;
  // carried_in = 3000 + (-8000) = -5000
  assert.equal(cat.carried_in_cents, -5000, 'overspend should carry forward as negative');
  assert.equal(cat.available_cents, -2000, 'available = 3000 limit - 5000 deficit = -2000');
});

test('carryover: zero if no prior budget months', () => {
  const { db, catId } = setup();
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-03', 3000);

  const report = monthReport(db, '2026-03');
  const cat = report.categories.find((c: any) => c.category_id === catId) as any;
  assert.equal(cat.carried_in_cents, 0, 'no prior months = no carryover');
  assert.equal(cat.available_cents, 3000);
});

test('non-rollover category has no carried_in_cents', () => {
  const db = createDb(':memory:');
  const catId = Number(
    db.prepare("INSERT INTO categories (name, rollover) VALUES ('Normal Category', 0)").run().lastInsertRowid,
  );
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-01', 5000);
  db.prepare('INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)').run(catId, '2026-02', 5000);

  const report = monthReport(db, '2026-02');
  const cat = report.categories.find((c: any) => c.category_id === catId) as any;
  assert.equal(cat.carried_in_cents, undefined, 'non-rollover category should not have carried_in_cents');
  assert.equal(cat.available_cents, undefined);
});
