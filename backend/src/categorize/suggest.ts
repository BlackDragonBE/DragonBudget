import type { DB } from '../db';
import { tx } from '../db';
import { extractMerchantToken } from './tokens';
import { applyRules } from './rules';

// Rule auto-suggestion (DESIGN.md §5.2). A convenience layer on top of manual
// rules — kept deliberately simple; the user refines accepted rules if needed.

const countUncategorizedWith = (db: DB, token: string): number =>
  (db
    .prepare(`SELECT COUNT(*) AS n FROM transactions
              WHERE category_id IS NULL AND status = 'accepted' AND UPPER(details) LIKE '%' || ? || '%'`)
    .get(token) as { n: number }).n;

const samplesWith = (db: DB, token: string) =>
  db
    .prepare(`SELECT id, execution_date, amount_cents, counterparty_name, details
              FROM transactions
              WHERE category_id IS NULL AND status = 'accepted' AND UPPER(details) LIKE '%' || ? || '%'
              ORDER BY execution_date DESC LIMIT 5`)
    .all(token);

/** Called after a manual categorization: if the merchant token repeats across
 *  ≥2 still-uncategorized transactions, record a pending suggestion. */
export function maybeSuggestRule(db: DB, txId: number): void {
  const t = db.prepare('SELECT details, category_id FROM transactions WHERE id = ?').get(txId) as
    | { details: string; category_id: number | null }
    | undefined;
  if (!t || t.category_id == null) return;

  const token = extractMerchantToken(t.details);
  if (!token) return;

  // One suggestion per token ever (don't re-suggest a dismissed token).
  if (db.prepare('SELECT 1 FROM rule_suggestions WHERE token = ?').get(token)) return;
  // Already covered by an existing rule? Then nothing to suggest.
  if (
    db
      .prepare(`SELECT 1 FROM category_rules
                WHERE enabled = 1 AND match_field = 'details' AND match_type = 'contains' AND UPPER(match_value) = ?`)
      .get(token)
  ) return;

  if (countUncategorizedWith(db, token) >= 2) {
    db.prepare("INSERT INTO rule_suggestions (token, match_field, category_id, status, created_at) VALUES (?, 'details', ?, 'pending', ?)")
      .run(token, t.category_id, new Date().toISOString());
  }
}

export function listSuggestions(db: DB) {
  const rows = db
    .prepare(`SELECT s.*, c.name AS category_name, c.icon AS category_icon
              FROM rule_suggestions s JOIN categories c ON c.id = s.category_id
              WHERE s.status = 'pending' ORDER BY s.id DESC`)
    .all() as { id: number; token: string; category_id: number }[];
  return rows.map((s) => ({ ...s, match_count: countUncategorizedWith(db, s.token), sample: samplesWith(db, s.token) }));
}

/** Accept: create the real rule (flagged created_from_suggestion) and apply it. */
export function acceptSuggestion(db: DB, id: number): { updated: number } | null {
  const s = db.prepare("SELECT * FROM rule_suggestions WHERE id = ? AND status = 'pending'").get(id) as
    | { id: number; token: string; match_field: string; category_id: number }
    | undefined;
  if (!s) return null;
  // Create the rule and consume the suggestion atomically, so a failure can't
  // leave the suggestion pending alongside a created rule (→ duplicate on retry).
  // applyRules() runs after — it has its own transaction (can't nest) and is
  // idempotent, so re-running it later is harmless if it somehow fails here.
  tx(db, () => {
    db.prepare(`INSERT INTO category_rules (category_id, match_field, match_type, match_value, priority, enabled, created_from_suggestion)
                VALUES (?, ?, 'contains', ?, 0, 1, 1)`).run(s.category_id, s.match_field, s.token);
    db.prepare('DELETE FROM rule_suggestions WHERE id = ?').run(id);
  });
  return { updated: applyRules(db) };
}

export function dismissSuggestion(db: DB, id: number): boolean {
  const r = db.prepare("UPDATE rule_suggestions SET status = 'dismissed' WHERE id = ? AND status = 'pending'").run(id);
  return r.changes > 0;
}
