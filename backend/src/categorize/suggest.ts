import type { DB } from '../db';
import { tx } from '../db';
import { extractMerchantPhrases } from './tokens';
import { applyRules } from './rules';

// Rule auto-suggestion (DESIGN.md §5.2). A convenience layer on top of manual
// rules — kept deliberately simple; the user refines accepted rules if needed.

const countUncategorizedMatches = (db: DB, field: string, type: string, token: string): number => {
  const op = type === 'equals' ? '= ?' : type === 'starts_with' ? "LIKE ? || '%'" : "LIKE '%' || ? || '%'";
  return (db
    .prepare(`SELECT COUNT(*) AS n FROM transactions
              WHERE category_id IS NULL AND status = 'accepted' AND UPPER(${field}) ${op}`)
    .get(token) as { n: number }).n;
};

const samplesWithMatches = (db: DB, field: string, type: string, token: string) => {
  const op = type === 'equals' ? '= ?' : type === 'starts_with' ? "LIKE ? || '%'" : "LIKE '%' || ? || '%'";
  return db
    .prepare(`SELECT id, execution_date, amount_cents, counterparty_name, details
              FROM transactions
              WHERE category_id IS NULL AND status = 'accepted' AND UPPER(${field}) ${op}
              ORDER BY execution_date DESC LIMIT 5`)
    .all(token);
};

const isNoisy = (db: DB, field: string, token: string, categoryId: number): boolean => {
  // If this token appears in transactions already manually categorized differently, it's noisy.
  return (db
    .prepare(`SELECT COUNT(DISTINCT category_id) AS n FROM transactions
              WHERE category_id IS NOT NULL AND category_id != ? AND UPPER(${field}) LIKE '%' || ? || '%'`)
    .get(categoryId, token) as { n: number }).n > 0;
};

/** Called after a manual categorization: if the merchant token repeats across
 *  ≥2 still-uncategorized transactions, record a pending suggestion. */
export function maybeSuggestRule(db: DB, txId: number): void {
  const t = db.prepare('SELECT details, counterparty_name, category_id FROM transactions WHERE id = ?').get(txId) as
    | { details: string; counterparty_name: string | null; category_id: number | null }
    | undefined;
  if (!t || t.category_id == null) return;

  const candidates: { token: string; field: 'details' | 'counterparty_name'; type: 'contains' | 'equals' | 'starts_with' }[] = [];

  if (t.counterparty_name) {
    candidates.push({ token: t.counterparty_name.toUpperCase(), field: 'counterparty_name', type: 'equals' });
  }

  const phrases = extractMerchantPhrases(t.details);
  for (const p of phrases) {
    candidates.push({ token: p, field: 'details', type: 'contains' });
  }

  for (const cand of candidates) {
    // One suggestion per token ever (don't re-suggest a dismissed token).
    // If a better candidate (e.g. multi-word) was already suggested, don't fall back to a worse one.
    if (db.prepare('SELECT 1 FROM rule_suggestions WHERE token = ?').get(cand.token)) return;

    // Already covered by an existing rule? Then nothing to suggest.
    if (
      db
        .prepare(`SELECT 1 FROM category_rules
                  WHERE enabled = 1 AND match_field = ? AND match_type = ? AND UPPER(match_value) = ?`)
        .get(cand.field, cand.type, cand.token)
    ) continue;

    // Skip noisy tokens that appear across multiple categories.
    if (isNoisy(db, cand.field, cand.token, t.category_id)) continue;

    if (countUncategorizedMatches(db, cand.field, cand.type, cand.token) >= 2) {
      db.prepare("INSERT INTO rule_suggestions (token, match_field, match_type, category_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
        .run(cand.token, cand.field, cand.type, t.category_id, new Date().toISOString());
      return; // Found the best candidate (priority: counterparty > longest phrase)
    }
  }
}

export function listSuggestions(db: DB) {
  const rows = db
    .prepare(`SELECT s.*, c.name AS category_name, c.icon AS category_icon
              FROM rule_suggestions s JOIN categories c ON c.id = s.category_id
              WHERE s.status = 'pending' ORDER BY s.id DESC`)
    .all() as { id: number; token: string; match_field: string; match_type: string; category_id: number }[];
  return rows.map((s) => ({
    ...s,
    match_count: countUncategorizedMatches(db, s.match_field, s.match_type, s.token),
    sample: samplesWithMatches(db, s.match_field, s.match_type, s.token),
  }));
}

/** Accept: create the real rule (flagged created_from_suggestion) and apply it.
 *  categoryId overrides the suggested category when the user picks a different one. */
export function acceptSuggestion(db: DB, id: number, categoryId?: number): { updated: number } | null {
  const s = db.prepare("SELECT * FROM rule_suggestions WHERE id = ? AND status = 'pending'").get(id) as
    | { id: number; token: string; match_field: string; match_type: string; category_id: number }
    | undefined;
  if (!s) return null;
  if (categoryId != null) s.category_id = categoryId;
  // Create the rule and consume the suggestion atomically, so a failure can't
  // leave the suggestion pending alongside a created rule (→ duplicate on retry).
  // applyRules() runs after — it has its own transaction (can't nest) and is
  // idempotent, so re-running it later is harmless if it somehow fails here.
  tx(db, () => {
    db.prepare(`INSERT INTO category_rules (category_id, match_field, match_type, match_value, priority, enabled, created_from_suggestion)
                VALUES (?, ?, ?, ?, 0, 1, 1)`).run(s.category_id, s.match_field, s.match_type, s.token);
    db.prepare('DELETE FROM rule_suggestions WHERE id = ?').run(id);
  });
  return { updated: applyRules(db) };
}

export function dismissSuggestion(db: DB, id: number): boolean {
  const r = db.prepare("UPDATE rule_suggestions SET status = 'dismissed' WHERE id = ? AND status = 'pending'").run(id);
  return r.changes > 0;
}
