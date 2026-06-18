import type { DB } from './db';

// All reports exclude rejected transactions (DESIGN.md §3.1.1). Month grouping is
// on execution_date; balance history (M7) uses value_date.

// Computes the signed cents carried into `month` for a rollover category.
// = sum of all prior budgets + sum of all prior spending (spending is negative cents).
// Anchored at the category's first budget month so pre-budget spending is ignored.
function carryover(db: DB, categoryId: number, month: string): number {
  const row = db
    .prepare('SELECT MIN(month) AS m FROM budgets WHERE category_id = ?')
    .get(categoryId) as { m: string | null };
  if (!row.m || row.m >= month) return 0;
  const b = db
    .prepare('SELECT COALESCE(SUM(limit_cents), 0) AS v FROM budgets WHERE category_id = ? AND month >= ? AND month < ?')
    .get(categoryId, row.m, month) as { v: number };
  const s = db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS v FROM transactions WHERE category_id = ? AND status = 'accepted' AND substr(execution_date, 1, 7) >= ? AND substr(execution_date, 1, 7) < ?")
    .get(categoryId, row.m, month) as { v: number };
  return b.v + s.v;
}

export function monthReport(db: DB, month: string) {
  const totals = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN amount_cents < 0 THEN amount_cents END), 0) AS expense_cents
      FROM transactions
      WHERE status = 'accepted' AND substr(execution_date, 1, 7) = ?`)
    .get(month) as { income_cents: number; expense_cents: number };

  // Include a category if it has spending this month OR a budget for the month
  // (so an unspent-but-budgeted category still shows up). limit_cents is null when
  // no budget exists (added in M6).
  const categories = db
    .prepare(`
      SELECT c.id AS category_id, c.name, c.icon, c.color, c.is_income, c.rollover,
             COALESCE(s.spent_cents, 0) AS spent_cents,
             COALESCE(s.txn_count, 0) AS txn_count,
             b.limit_cents
      FROM categories c
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) AS spent_cents, COUNT(*) AS txn_count
        FROM transactions
        WHERE status = 'accepted' AND substr(execution_date, 1, 7) = ?
        GROUP BY category_id
      ) s ON s.category_id = c.id
      LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
      WHERE c.archived = 0 AND (s.spent_cents IS NOT NULL OR b.limit_cents IS NOT NULL)
      ORDER BY ABS(COALESCE(s.spent_cents, 0)) DESC`)
    .all(month, month);

  // Augment rollover categories with carried-in amount and effective available budget.
  for (const r of categories as any[]) {
    if (r.rollover) {
      r.carried_in_cents = carryover(db, r.category_id, month);
      r.available_cents = (r.limit_cents ?? 0) + r.carried_in_cents;
    }
  }

  const uncategorized = db
    .prepare(`
      SELECT t.*, NULL AS category_name, NULL AS category_icon, NULL AS category_color
      FROM transactions t
      WHERE t.status = 'accepted' AND t.category_id IS NULL AND substr(t.execution_date, 1, 7) = ?
      ORDER BY t.execution_date DESC`)
    .all(month);

  const raw = uncategorized as { amount_cents: number }[];
  if (raw.length > 0) {
    let expSum = 0, expCount = 0, incSum = 0, incCount = 0;
    for (const t of raw) {
      if (t.amount_cents < 0) { expSum += t.amount_cents; expCount++; }
      else { incSum += t.amount_cents; incCount++; }
    }
    if (expSum < 0) {
      (categories as any[]).push({
        category_id: -1, name: 'Uncategorized', icon: '❓', color: '#94a3b8',
        is_income: 0, spent_cents: expSum, txn_count: expCount, limit_cents: null,
      });
    }
    if (incSum > 0) {
      (categories as any[]).push({
        category_id: -1, name: 'Uncategorized', icon: '❓', color: '#94a3b8',
        is_income: 1, spent_cents: incSum, txn_count: incCount, limit_cents: null,
      });
    }
  }

  return {
    month,
    income_cents: totals.income_cents,
    expense_cents: totals.expense_cents,
    net_cents: totals.income_cents + totals.expense_cents,
    categories,
    uncategorized,
  };
}

// Running balance over time by value_date (DESIGN.md §7.2). Relative to startCents
// (default 0); when `from` is set, the pre-window balance is folded into the baseline
// so the series is continuous. One point per day that has activity.
export function balanceHistory(
  db: DB,
  opts: { from?: string; to?: string; startCents?: number; currentCents?: number } = {},
): { date: string; balance_cents: number }[] {
  let baseline = opts.startCents ?? 0;
  if (opts.currentCents !== undefined) {
    const total = db
      .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE status = 'accepted' AND value_date IS NOT NULL")
      .get() as { s: number };
    baseline = opts.currentCents - total.s;
  }

  if (opts.from) {
    const before = db
      .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE status = 'accepted' AND value_date < ?")
      .get(opts.from) as { s: number };
    baseline += before.s;
  }

  const where = ["status = 'accepted'", 'value_date IS NOT NULL'];
  const params: string[] = [];
  if (opts.from) { where.push('value_date >= ?'); params.push(opts.from); }
  if (opts.to) { where.push('value_date <= ?'); params.push(opts.to); }

  const daily = db
    .prepare(`SELECT value_date AS date, SUM(amount_cents) AS delta
              FROM transactions WHERE ${where.join(' AND ')}
              GROUP BY value_date ORDER BY value_date`)
    .all(...params) as { date: string; delta: number }[];

  let bal = baseline;
  return daily.map((d) => ({ date: d.date, balance_cents: (bal += d.delta) }));
}

// Per-category spending per month (DESIGN.md §7.2), pivoted for a stacked chart:
// rows are { month, <CategoryName>: absCents }. isIncome=true flips to income categories.
export function categoryTrends(db: DB, opts: { from?: string; to?: string; isIncome?: boolean } = {}) {
  const where = ["t.status = 'accepted'", `c.is_income = ${opts.isIncome ? 1 : 0}`, 't.execution_date IS NOT NULL'];
  const params: string[] = [];
  if (opts.from) { where.push("substr(t.execution_date,1,7) >= ?"); params.push(opts.from); }
  if (opts.to) { where.push("substr(t.execution_date,1,7) <= ?"); params.push(opts.to); }

  const rows = db
    .prepare(`SELECT substr(t.execution_date,1,7) AS month, c.id, c.name, c.color, SUM(t.amount_cents) AS spent
              FROM transactions t JOIN categories c ON c.id = t.category_id
              WHERE ${where.join(' AND ')}
              GROUP BY month, c.id ORDER BY month`)
    .all(...params) as { month: string; id: number; name: string; color: string | null; spent: number }[];

  const cats = new Map<number, { id: number; name: string; color: string | null }>();
  const byMonth = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    cats.set(r.id, { id: r.id, name: r.name, color: r.color });
    if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month });
    byMonth.get(r.month)![r.name] = Math.abs(r.spent);
  }
  return { categories: [...cats.values()], data: [...byMonth.values()] };
}
