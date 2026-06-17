import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, type DB } from '../src/db';
import { maybeSuggestRule, acceptSuggestion } from '../src/categorize/suggest';

let h = 0;
function insertKruidvat(db: DB, categoryId: number | null = null, source: string | null = null): number {
  return Number(
    db
      .prepare(`INSERT INTO transactions
        (import_hash, amount_cents, account_number, transaction_type, details, status, created_at, category_id, category_source)
        VALUES (?,?,?,?,?,'accepted','t',?,?)`)
      .run(`h${++h}`, -1205, 'BE1', 'Kaartbetaling', 'BETALING MET DEBETKAART NUMMER 4871 04XX XXXX 7437 KRUIDVAT 8932 MECHELEN', categoryId, source)
      .lastInsertRowid,
  );
}

test('maybeSuggestRule: suggests when token repeats across >=2 uncategorized', () => {
  const db = createDb(':memory:');
  const a = insertKruidvat(db); // will be categorized manually
  insertKruidvat(db); // 2 others remain uncategorized
  insertKruidvat(db);

  db.prepare("UPDATE transactions SET category_id = 1, category_source = 'manual' WHERE id = ?").run(a);
  maybeSuggestRule(db, a);

  const sugg = db.prepare("SELECT token, category_id FROM rule_suggestions WHERE status = 'pending'").all() as
    { token: string; category_id: number }[];
  assert.equal(sugg.length, 1);
  assert.equal(sugg[0].token, 'KRUIDVAT');
  assert.equal(sugg[0].category_id, 1);

  // Idempotent: re-running doesn't create a second suggestion for the same token.
  maybeSuggestRule(db, a);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM rule_suggestions").get() as { n: number }).n, 1);
});

test('maybeSuggestRule: no suggestion when only a one-off (no other uncategorized)', () => {
  const db = createDb(':memory:');
  const a = insertKruidvat(db);
  db.prepare("UPDATE transactions SET category_id = 1, category_source = 'manual' WHERE id = ?").run(a);
  maybeSuggestRule(db, a);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM rule_suggestions').get() as { n: number }).n, 0);
});

test('acceptSuggestion: creates a rule, applies it, consumes the suggestion atomically', () => {
  const db = createDb(':memory:');
  const a = insertKruidvat(db);
  insertKruidvat(db);
  insertKruidvat(db);
  db.prepare("UPDATE transactions SET category_id = 1, category_source = 'manual' WHERE id = ?").run(a);
  maybeSuggestRule(db, a);

  const id = (db.prepare("SELECT id FROM rule_suggestions WHERE status = 'pending'").get() as { id: number }).id;
  const result = acceptSuggestion(db, id);
  assert.equal(result?.updated, 2); // the two other uncategorized rows

  const rule = db.prepare("SELECT created_from_suggestion FROM category_rules WHERE match_value = 'KRUIDVAT'").get() as
    { created_from_suggestion: number } | undefined;
  assert.equal(rule?.created_from_suggestion, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM rule_suggestions').get() as { n: number }).n, 0); // consumed
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE category_id = 1").get() as { n: number }).n, 3);

  // Accepting again is a no-op (suggestion already consumed) — no duplicate rule.
  assert.equal(acceptSuggestion(db, id), null);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM category_rules WHERE match_value = 'KRUIDVAT'").get() as { n: number }).n, 1);
});
