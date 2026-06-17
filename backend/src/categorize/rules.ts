import type { DB } from '../db';
import { tx } from '../db';

export type MatchField = 'details' | 'counterparty_name' | 'message';
export type MatchType = 'contains' | 'equals' | 'starts_with';

export interface Rule {
  id: number;
  category_id: number;
  match_field: MatchField;
  match_type: MatchType;
  match_value: string;
  priority: number;
  enabled: number;
  created_from_suggestion: number;
}

export interface MatchableTx {
  id?: number;
  details: string;
  counterparty_name: string | null;
  message: string | null;
  category_id?: number | null;
  category_source?: string | null;
}

// Case-insensitive (BNP `details` is all-caps) substring/prefix/exact match.
export function matchesRule(
  txn: MatchableTx,
  rule: { match_field: MatchField; match_type: MatchType; match_value: string },
): boolean {
  const field =
    rule.match_field === 'details' ? txn.details
    : rule.match_field === 'counterparty_name' ? txn.counterparty_name
    : txn.message;
  if (field == null) return false;
  const hay = field.toUpperCase();
  const needle = rule.match_value.toUpperCase();
  switch (rule.match_type) {
    case 'equals': return hay === needle;
    case 'starts_with': return hay.startsWith(needle);
    default: return hay.includes(needle);
  }
}

// First matching enabled rule wins (rules must be pre-sorted priority desc, id asc).
export function categoryForTx(rules: Rule[], txn: MatchableTx): number | null {
  for (const r of rules) if (matchesRule(txn, r)) return r.category_id;
  return null;
}

export function enabledRulesSorted(db: DB): Rule[] {
  return db
    .prepare('SELECT * FROM category_rules WHERE enabled = 1 ORDER BY priority DESC, id ASC')
    .all() as unknown as Rule[];
}

/**
 * Apply rules to transactions and return how many rows changed.
 * - Manual assignments (`category_source='manual'`) are never touched unless
 *   `recategorizeAll` is set (the explicit "re-categorize everything" action, §5.1).
 * - A rule-sourced row that no longer matches any rule is cleared.
 * - `ids` limits the scope (used post-import for just the new rows).
 */
export function applyRules(db: DB, opts: { ids?: number[]; recategorizeAll?: boolean } = {}): number {
  const rules = enabledRulesSorted(db);
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (opts.ids) {
    if (opts.ids.length === 0) return 0;
    where.push(`id IN (${opts.ids.map(() => '?').join(',')})`);
    params.push(...opts.ids);
  }
  if (!opts.recategorizeAll) where.push("(category_source IS NULL OR category_source = 'rule')");

  const rows = db
    .prepare(
      `SELECT id, details, counterparty_name, message, category_id, category_source
       FROM transactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
    )
    .all(...params) as unknown as Required<MatchableTx>[];

  const setRule = db.prepare("UPDATE transactions SET category_id = ?, category_source = 'rule' WHERE id = ?");
  const clear = db.prepare('UPDATE transactions SET category_id = NULL, category_source = NULL WHERE id = ?');

  let updated = 0;
  tx(db, () => {
    for (const t of rows) {
      const cat = categoryForTx(rules, t);
      if (cat != null) {
        if (t.category_id !== cat || t.category_source !== 'rule') {
          setRule.run(cat, t.id);
          updated++;
        }
      } else if (t.category_id != null) {
        // No rule matches but it had a category. In the normal path the WHERE
        // clause guarantees this is a rule-sourced row; in recategorizeAll it
        // may be manual. Either way, clear the now-orphaned assignment.
        clear.run(t.id);
        updated++;
      }
    }
  });
  return updated;
}
