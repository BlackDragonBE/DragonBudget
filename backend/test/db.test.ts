import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';

test('fresh DB seeds the default categories once', () => {
  const db = createDb(':memory:');
  const n = (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n;
  assert.equal(n, 14);
  assert.ok(db.prepare("SELECT 1 FROM categories WHERE name='Groceries'").get());
});

test('all six tables exist', () => {
  const db = createDb(':memory:');
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map((r) => r.name);
  for (const t of ['transactions', 'categories', 'category_rules', 'budgets', 'recurring_expenses', 'recurring_expense_transactions']) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
});
