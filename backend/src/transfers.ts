import type { DB } from './db';

// Re-sync is_transfer for all transactions: mark 1 when counterparty_account
// (spaces stripped) matches a known_accounts entry, clear to 0 otherwise.
// Full re-sync is intentional — handles both account addition and removal.
export function detectTransfers(db: DB): void {
  db.exec(`
    UPDATE transactions SET is_transfer = CASE
      WHEN REPLACE(counterparty_account, ' ', '') IN (SELECT account_number FROM known_accounts WHERE is_own_account = 1)
      THEN 1 ELSE 0 END`);
}
