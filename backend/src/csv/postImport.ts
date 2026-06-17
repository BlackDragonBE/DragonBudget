import type { DB } from '../db';
import { applyRules } from '../categorize/rules';
import { detectRecurring } from '../recurring/detect';

// Runs after new rows are inserted (DESIGN.md §4.3): apply category rules to the
// new transactions, then re-run recurring detection (new rows may complete a
// pattern or shift a next_expected_date).
export function runPostImport(db: DB, insertedIds: number[]): { autoCategorized: number } {
  if (insertedIds.length === 0) return { autoCategorized: 0 };
  const autoCategorized = applyRules(db, { ids: insertedIds });
  detectRecurring(db);
  return { autoCategorized };
}
