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
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS v FROM transactions WHERE category_id = ? AND status = 'accepted' AND is_transfer = 0 AND substr(execution_date, 1, 7) >= ? AND substr(execution_date, 1, 7) < ?")
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
      WHERE status = 'accepted' AND is_transfer = 0 AND substr(execution_date, 1, 7) = ?`)
    .get(month) as { income_cents: number; expense_cents: number };

  // Include a category if it has spending this month OR a budget for the month
  // (so an unspent-but-budgeted category still shows up). limit_cents is null when
  // no budget exists (added in M6).
  const categories = db
    .prepare(`
      SELECT c.id AS category_id, c.name, c.icon, c.color, c.is_income, c.rollover,
             c.goal_cents, c.goal_date,
             COALESCE(s.spent_cents, 0) AS spent_cents,
             COALESCE(s.txn_count, 0) AS txn_count,
             b.limit_cents
      FROM categories c
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) AS spent_cents, COUNT(*) AS txn_count
        FROM transactions
        WHERE status = 'accepted' AND is_transfer = 0 AND substr(execution_date, 1, 7) = ?
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
      WHERE t.status = 'accepted' AND t.is_transfer = 0 AND t.category_id IS NULL AND substr(t.execution_date, 1, 7) = ?
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

// Recurring charges still expected in `month` (roadmap 1.2): rows due on/before
// month-end that have NOT already been matched by a transaction this month. Uses the
// join table for "already happened" rather than next_expected_date (which only advances
// on import, so it goes stale between imports). expected_amount_cents is signed, so the
// income/expense split falls out of its sign. Dismissed recurring are excluded.
export function upcomingRecurring(db: DB, month: string) {
  const toDate = `${month}-31`; // lexical compare vs YYYY-MM-DD; covers every real day
  const rows = db
    .prepare(`
      SELECT r.id, r.label, r.expected_amount_cents, r.frequency, r.next_expected_date,
             c.name AS category_name, c.icon AS category_icon, c.color AS category_color
      FROM recurring_expenses r
      LEFT JOIN categories c ON c.id = r.category_id
      WHERE r.status != 'dismissed'
        AND r.next_expected_date IS NOT NULL
        AND r.next_expected_date <= ?
        AND NOT EXISTS (
          SELECT 1 FROM recurring_expense_transactions ret
          JOIN transactions t ON t.id = ret.transaction_id
          WHERE ret.recurring_expense_id = r.id
            AND t.status = 'accepted'
            AND substr(t.execution_date, 1, 7) = ?
        )
      ORDER BY r.next_expected_date`)
    .all(toDate, month) as { expected_amount_cents: number }[];

  let expected_income_cents = 0, expected_expense_cents = 0;
  for (const r of rows) {
    if (r.expected_amount_cents > 0) expected_income_cents += r.expected_amount_cents;
    else expected_expense_cents += r.expected_amount_cents;
  }
  return { month, upcoming: rows, expected_income_cents, expected_expense_cents };
}

// Richer insights for a month (roadmap 1.3), all on existing data, no schema:
// per-category month-over-month delta, largest expenses, and burn rate vs budget.
// `today` (ISO YYYY-MM-DD) is injected so the function stays pure/testable; burn rate
// degrades naturally for past months (elapsed == days_in_month → projected == actual).
export function insights(db: DB, month: string, today: string) {
  const prev = prevMonthOf(month);
  const [y, mo] = month.split('-').map(Number);
  const days_in_month = new Date(y, mo, 0).getDate();
  const tMonth = today.slice(0, 7);
  const days_elapsed = tMonth < month ? 0 : tMonth > month ? days_in_month : Number(today.slice(8, 10));

  const expense = (db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE status = 'accepted' AND is_transfer = 0 AND amount_cents < 0 AND substr(execution_date, 1, 7) = ?")
    .get(month) as { s: number }).s;
  const budget_total_cents = (db
    .prepare("SELECT COALESCE(SUM(b.limit_cents), 0) AS s FROM budgets b JOIN categories c ON c.id = b.category_id WHERE b.month = ? AND c.is_income = 0")
    .get(month) as { s: number }).s;

  const daily_avg_cents = days_elapsed > 0 ? Math.round(expense / days_elapsed) : 0;
  const projected_expense_cents = days_elapsed > 0 ? Math.round((expense / days_elapsed) * days_in_month) : expense;

  const top_expenses = db
    .prepare(`SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                     ka.name AS known_account_name
              FROM transactions t
              LEFT JOIN categories c ON c.id = t.category_id
              LEFT JOIN known_accounts ka ON REPLACE(t.counterparty_account, ' ', '') = ka.account_number
              WHERE t.status = 'accepted' AND t.is_transfer = 0 AND t.amount_cents < 0 AND substr(t.execution_date, 1, 7) = ?
              ORDER BY t.amount_cents ASC LIMIT 5`)
    .all(month);

  const deltas = db
    .prepare(`SELECT c.id AS category_id, c.name, c.icon, c.color, c.is_income,
                     COALESCE(cur.s, 0) AS spent_cents, COALESCE(prv.s, 0) AS prev_cents
              FROM categories c
              LEFT JOIN (SELECT category_id, SUM(amount_cents) s FROM transactions
                         WHERE status = 'accepted' AND is_transfer = 0 AND substr(execution_date, 1, 7) = ? GROUP BY category_id) cur ON cur.category_id = c.id
              LEFT JOIN (SELECT category_id, SUM(amount_cents) s FROM transactions
                         WHERE status = 'accepted' AND is_transfer = 0 AND substr(execution_date, 1, 7) = ? GROUP BY category_id) prv ON prv.category_id = c.id
              WHERE c.archived = 0 AND (cur.s IS NOT NULL OR prv.s IS NOT NULL)`)
    .all(month, prev) as { spent_cents: number; prev_cents: number }[];
  // Top movers by absolute change in magnitude (works for both income and expense).
  const category_deltas = deltas
    .map((d) => ({ ...d, delta_cents: d.spent_cents - d.prev_cents }))
    .sort((a, b) => Math.abs(Math.abs(b.spent_cents) - Math.abs(b.prev_cents)) - Math.abs(Math.abs(a.spent_cents) - Math.abs(a.prev_cents)))
    .slice(0, 6);

  return {
    month, days_in_month, days_elapsed, expense_cents: expense,
    daily_avg_cents, projected_expense_cents, budget_total_cents,
    top_expenses, category_deltas,
  };
}

// 'YYYY-MM' -> previous month 'YYYY-MM'. (Mirrors frontend format.ts:prevMonth.)
function prevMonthOf(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Per-category spending per month (DESIGN.md §7.2), pivoted for a stacked chart:
// rows are { month, <CategoryName>: absCents }. isIncome=true flips to income categories.
export function categoryTrends(db: DB, opts: { from?: string; to?: string; isIncome?: boolean } = {}) {
  const where = ["t.status = 'accepted'", "t.is_transfer = 0", `c.is_income = ${opts.isIncome ? 1 : 0}`, 't.execution_date IS NOT NULL'];
  const params: string[] = [];
  if (opts.from) { where.push("substr(t.execution_date,1,7) >= ?"); params.push(opts.from); }
  if (opts.to) { where.push("substr(t.execution_date,1,7) <= ?"); params.push(opts.to); }

  const rows = db
    .prepare(`SELECT substr(t.execution_date,1,7) AS month, c.id, c.name, c.color, SUM(t.amount_cents) AS spent
              FROM transactions t JOIN categories c ON c.id = t.category_id
              WHERE ${where.join(' AND ')}
              GROUP BY month, c.id ORDER BY month`)
    .all(...params) as { month: string; id: number; name: string; color: string | null; spent: number }[];

  // Uncategorized rows: no JOIN possible, filter by amount sign instead of is_income.
  const uncatWhere = ["t.status = 'accepted'", "t.is_transfer = 0", "t.category_id IS NULL", "t.execution_date IS NOT NULL",
    opts.isIncome ? "t.amount_cents > 0" : "t.amount_cents < 0"];
  const uncatParams: string[] = [];
  if (opts.from) { uncatWhere.push("substr(t.execution_date,1,7) >= ?"); uncatParams.push(opts.from); }
  if (opts.to) { uncatWhere.push("substr(t.execution_date,1,7) <= ?"); uncatParams.push(opts.to); }
  const uncatRows = db
    .prepare(`SELECT substr(t.execution_date,1,7) AS month, SUM(t.amount_cents) AS spent
              FROM transactions t WHERE ${uncatWhere.join(' AND ')} GROUP BY month`)
    .all(...uncatParams) as { month: string; spent: number }[];

  const cats = new Map<number, { id: number; name: string; color: string | null }>();
  const byMonth = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    cats.set(r.id, { id: r.id, name: r.name, color: r.color });
    if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month });
    byMonth.get(r.month)![r.name] = Math.abs(r.spent);
  }
  // id=0 is the sentinel for "Uncategorized" (real IDs start at 1).
  if (uncatRows.length > 0) {
    cats.set(0, { id: 0, name: 'Uncategorized', color: null });
    for (const r of uncatRows) {
      if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month });
      byMonth.get(r.month)!['Uncategorized'] = Math.abs(r.spent);
    }
  }
  return { categories: [...cats.values()], data: [...byMonth.values()] };
}
