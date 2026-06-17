import type { DB } from '../db';
import { tx } from '../db';
import { counterpartyKey, extractMerchantToken } from '../categorize/tokens';

export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'irregular';

// Direct debits & standing orders are recurring by the bank's own definition (§6.1).
// Compared case-insensitively so a future export-format casing change doesn't break it.
const RECURRING_TYPES = new Set(['domiciliëring', 'doorlopende betalingsopdracht']);
const isRecurringType = (t: string) => RECURRING_TYPES.has(t.trim().toLowerCase());

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Gaps in days between consecutive (already sorted) ISO dates.
export function dayGaps(sortedDates: string[]): number[] {
  const g: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    g.push(Math.round((Date.parse(sortedDates[i]) - Date.parse(sortedDates[i - 1])) / 86_400_000));
  }
  return g;
}

// Tolerance bands, not statistics (§6.2).
export function inferFrequency(gaps: number[]): Frequency {
  if (!gaps.length) return 'irregular';
  const m = median(gaps);
  if (m >= 5 && m <= 10) return 'weekly';
  if (m >= 24 && m <= 35) return 'monthly';
  if (m >= 350 && m <= 385) return 'yearly';
  return 'irregular';
}

export function amountsSimilar(amounts: number[], tol = 0.1): boolean {
  const abs = amounts.map((a) => Math.abs(a));
  const m = median(abs);
  if (m === 0) return abs.every((a) => a === 0);
  return abs.every((a) => Math.abs(a - m) <= tol * m);
}

function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(iso));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Txn {
  id: number;
  date: string;
  amount_cents: number;
  transaction_type: string;
  counterparty_account: string | null;
  counterparty_name: string | null;
  details: string;
}

/**
 * Detect recurring patterns and upsert them (DESIGN.md §6). Direct debits/standing
 * orders qualify from a single occurrence; other types need >=2 occurrences with
 * consistent amounts (±10%) and gaps. User-set status ('confirmed'/'dismissed') and
 * edited labels are preserved across re-runs (matched by counterparty_key).
 */
export function detectRecurring(db: DB): { detected: number } {
  const txns = db
    .prepare(`SELECT id, execution_date AS date, amount_cents, transaction_type,
                     counterparty_account, counterparty_name, details
              FROM transactions
              WHERE status = 'accepted' AND execution_date IS NOT NULL`)
    .all() as unknown as Txn[];

  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const key = counterpartyKey(t);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  let detected = 0;
  tx(db, () => {
    for (const [key, items] of groups) {
      items.sort((a, b) => (a.date < b.date ? -1 : 1));
      const dates = items.map((i) => i.date);
      const amounts = items.map((i) => i.amount_cents);
      const gaps = dayGaps(dates);
      const isDirectDebit = items.some((i) => isRecurringType(i.transaction_type));

      let frequency: Frequency;
      if (isDirectDebit) {
        frequency = gaps.length ? inferFrequency(gaps) : 'monthly';
        if (frequency === 'irregular') frequency = 'monthly';
      } else {
        if (items.length < 2) continue;
        frequency = inferFrequency(gaps);
        if (frequency === 'irregular' || !amountsSimilar(amounts)) continue;
      }

      const last = dates[dates.length - 1];
      const expected = amounts[amounts.length - 1];
      const gapDays = gaps.length ? Math.round(median(gaps)) : 30;
      const next = addDays(last, gapDays);
      const catRow = db.prepare(`
        SELECT category_id FROM transactions
        WHERE id IN (${items.map(() => '?').join(',')}) AND category_id IS NOT NULL
        GROUP BY category_id ORDER BY COUNT(*) DESC LIMIT 1
      `).get(...items.map((i) => i.id)) as { category_id: number } | undefined;
      const categoryId = catRow?.category_id ?? null;

      const label =
        items.find((i) => i.counterparty_name)?.counterparty_name ||
        extractMerchantToken(items[items.length - 1].details) ||
        key.replace(/^(IBAN|MERCH):/, '');

      upsertRecurring(db, { key, label, expected, frequency, last, next, ids: items.map((i) => i.id), categoryId });
      detected++;
    }
  });
  return { detected };
}

function upsertRecurring(
  db: DB,
  r: { key: string; label: string; expected: number; frequency: Frequency; last: string; next: string; ids: number[]; categoryId: number | null },
) {
  const existing = db.prepare('SELECT id FROM recurring_expenses WHERE counterparty_key = ?').get(r.key) as
    | { id: number }
    | undefined;

  let id: number;
  if (existing) {
    // Keep user-controlled fields (status, label, category); refresh detected metrics.
    id = existing.id;
    db.prepare(`UPDATE recurring_expenses
                SET expected_amount_cents = ?, frequency = ?, last_seen_date = ?, next_expected_date = ?,
                    category_id = COALESCE(category_id, ?)
                WHERE id = ?`).run(r.expected, r.frequency, r.last, r.next, r.categoryId, id);
  } else {
    id = Number(
      db
        .prepare(`INSERT INTO recurring_expenses
                  (label, counterparty_key, expected_amount_cents, frequency, status, category_id, next_expected_date, last_seen_date)
                  VALUES (?,?,?,?, 'detected', ?, ?, ?)`)
        .run(r.label, r.key, r.expected, r.frequency, r.categoryId, r.next, r.last).lastInsertRowid,
    );
  }

  db.prepare('DELETE FROM recurring_expense_transactions WHERE recurring_expense_id = ?').run(id);
  const link = db.prepare('INSERT OR IGNORE INTO recurring_expense_transactions (recurring_expense_id, transaction_id) VALUES (?,?)');
  for (const tid of r.ids) link.run(id, tid);
}
