import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, type DB } from '../src/db';
import { matchesRule, categoryForTx, applyRules, type Rule } from '../src/categorize/rules';

let h = 0;
function insertTx(db: DB, details: string, category_id: number | null = null, source: string | null = null): number {
  return Number(
    db
      .prepare(`INSERT INTO transactions
        (import_hash, amount_cents, account_number, transaction_type, details, status, created_at, category_id, category_source)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(`h${++h}`, -1000, 'BE1', 'Kaartbetaling', details, 'accepted', '2026-01-01T00:00:00Z', category_id, source)
      .lastInsertRowid,
  );
}
function sourceOf(db: DB, id: number): { category_id: number | null; category_source: string | null } {
  const r = db.prepare('SELECT category_id, category_source FROM transactions WHERE id = ?').get(id) as {
    category_id: number | null;
    category_source: string | null;
  };
  return { category_id: r.category_id, category_source: r.category_source }; // normalize null-proto row
}
function addRule(db: DB, value: string, cat: number, priority = 0, field = 'details', type = 'contains') {
  db.prepare(`INSERT INTO category_rules (category_id, match_field, match_type, match_value, priority, enabled)
              VALUES (?,?,?,?,?,1)`).run(cat, field, type, value, priority);
}

test('matchesRule: case-insensitive contains/equals/starts_with', () => {
  const t = { details: 'KRUIDVAT 8932 MECHELEN', counterparty_name: null, message: null };
  assert.ok(matchesRule(t, { match_field: 'details', match_type: 'contains', match_value: 'kruidvat' }));
  assert.ok(matchesRule(t, { match_field: 'details', match_type: 'starts_with', match_value: 'kruid' }));
  assert.ok(!matchesRule(t, { match_field: 'details', match_type: 'equals', match_value: 'kruidvat' }));
  assert.ok(!matchesRule(t, { match_field: 'counterparty_name', match_type: 'contains', match_value: 'x' }));
});

test('categoryForTx: higher priority wins (first match)', () => {
  const rules: Rule[] = [
    { id: 2, category_id: 3, match_field: 'details', match_type: 'contains', match_value: 'KRUIDVAT', priority: 10, enabled: 1, created_from_suggestion: 0 },
    { id: 1, category_id: 1, match_field: 'details', match_type: 'contains', match_value: 'MECHELEN', priority: 0, enabled: 1, created_from_suggestion: 0 },
  ];
  assert.equal(categoryForTx(rules, { details: 'KRUIDVAT MECHELEN', counterparty_name: null, message: null }), 3);
});

test('applyRules: categorizes uncategorized, never clobbers manual', () => {
  const db = createDb(':memory:');
  const a = insertTx(db, 'KRUIDVAT MECHELEN'); // uncategorized
  const b = insertTx(db, 'ALDI MECHELEN', 2, 'manual'); // manual -> must survive
  addRule(db, 'MECHELEN', 1);

  const updated = applyRules(db);
  assert.equal(updated, 1); // only A
  assert.deepEqual(sourceOf(db, a), { category_id: 1, category_source: 'rule' });
  assert.deepEqual(sourceOf(db, b), { category_id: 2, category_source: 'manual' }); // untouched
});

test('applyRules: recategorizeAll overrides manual', () => {
  const db = createDb(':memory:');
  const b = insertTx(db, 'ALDI MECHELEN', 2, 'manual');
  addRule(db, 'MECHELEN', 1);
  applyRules(db, { recategorizeAll: true });
  assert.deepEqual(sourceOf(db, b), { category_id: 1, category_source: 'rule' });
});

test('applyRules: clears rule-sourced rows when no rule matches anymore', () => {
  const db = createDb(':memory:');
  const a = insertTx(db, 'KRUIDVAT MECHELEN');
  addRule(db, 'MECHELEN', 1);
  applyRules(db);
  assert.equal(sourceOf(db, a).category_id, 1);

  db.prepare('DELETE FROM category_rules').run(); // rule removed
  applyRules(db);
  assert.deepEqual(sourceOf(db, a), { category_id: null, category_source: null });
});
