import crypto from 'node:crypto';
import type { DB } from '../db';
import { tx } from '../db';
import type { ParsedTransaction } from './parse';
import { runPostImport } from './postImport';

export interface ImportSummary {
  parsed: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  autoCategorized: number;
}

// Stable dedup key (DESIGN.md §4.2). `details` carries the bank's own reference
// number, so it disambiguates same-day/same-amount lines that Volgnummer can't.
function importHash(t: ParsedTransaction): string {
  const key = [
    t.execution_date ?? '',
    t.value_date ?? '',
    t.amount_cents,
    t.account_number,
    t.transaction_type,
    t.details,
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Insert parsed rows idempotently (INSERT OR IGNORE on import_hash), then run
 *  post-import hooks (rules, recurring). Safe to re-import overlapping ranges. */
export function importTransactions(db: DB, rows: ParsedTransaction[]): ImportSummary {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (import_hash, execution_date, value_date, amount_cents, currency, account_number,
       transaction_type, counterparty_account, counterparty_name, message, details,
       status, rejection_reason, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  const insertedIds: number[] = [];

  tx(db, () => {
    for (const r of rows) {
      const res = insert.run(
        importHash(r), r.execution_date, r.value_date, r.amount_cents, r.currency,
        r.account_number, r.transaction_type, r.counterparty_account, r.counterparty_name,
        r.message, r.details, r.status, r.rejection_reason, now,
      );
      if (res.changes === 1) insertedIds.push(Number(res.lastInsertRowid));
    }
  });

  const { autoCategorized } = runPostImport(db, insertedIds);
  return {
    parsed: rows.length,
    inserted: insertedIds.length,
    duplicates: rows.length - insertedIds.length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    autoCategorized,
  };
}

export { importHash };
