import type { DatabaseSync } from 'node:sqlite';

// Default category set (DESIGN.md §3.2). Seeded only on a fresh DB — fully
// editable afterwards, never re-applied, never referenced by app logic.
const DEFAULTS: Array<{ name: string; icon: string; is_income?: boolean }> = [
  { name: 'Groceries', icon: '🛒' },
  { name: 'Fuel/Transport', icon: '⛽' },
  { name: 'Subscriptions', icon: '🔁' },
  { name: 'Housing', icon: '🏠' },
  { name: 'Utilities', icon: '💡' },
  { name: 'Insurance', icon: '🛡️' },
  { name: 'Health', icon: '🩺' },
  { name: 'Dining Out', icon: '🍽️' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Income', icon: '💰', is_income: true },
  { name: 'Transfers', icon: '↔️' },
  { name: 'Fees', icon: '🧾' },
  { name: 'Loan Repayment', icon: '🏦' },
  { name: 'Other', icon: '❓' },
];

export function seedCategories(db: DatabaseSync): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO categories (name, icon, is_income) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const c of DEFAULTS) insert.run(c.name, c.icon, c.is_income ? 1 : 0);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
