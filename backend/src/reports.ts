import type { DB } from './db';

// All reports exclude rejected transactions (DESIGN.md §3.1.1). Month grouping is
// on execution_date; balance history (M7) uses value_date.

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
      SELECT c.id AS category_id, c.name, c.icon, c.color, c.is_income,
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

  const uncategorized = db
    .prepare(`
      SELECT t.*, NULL AS category_name, NULL AS category_icon, NULL AS category_color
      FROM transactions t
      WHERE t.status = 'accepted' AND t.category_id IS NULL AND substr(t.execution_date, 1, 7) = ?
      ORDER BY t.execution_date DESC`)
    .all(month);

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
// rows are { month, <CategoryName>: absCents }. Expense categories only.
export function categoryTrends(db: DB, opts: { from?: string; to?: string } = {}) {
  const where = ["t.status = 'accepted'", 'c.is_income = 0', 't.execution_date IS NOT NULL'];
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
