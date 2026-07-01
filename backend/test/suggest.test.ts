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

test('acceptSuggestion: category override creates the rule in the chosen category', () => {
  const db = createDb(':memory:');
  const a = insertKruidvat(db);
  insertKruidvat(db);
  insertKruidvat(db);
  db.prepare("UPDATE transactions SET category_id = 1, category_source = 'manual' WHERE id = ?").run(a);
  maybeSuggestRule(db, a); // suggests category 1

  const id = (db.prepare("SELECT id FROM rule_suggestions WHERE status = 'pending'").get() as { id: number }).id;
  const result = acceptSuggestion(db, id, 2); // user picked a different category on accept
  assert.equal(result?.updated, 2);

  const rule = db.prepare("SELECT category_id FROM category_rules WHERE match_value = 'KRUIDVAT'").get() as
    { category_id: number } | undefined;
  assert.equal(rule?.category_id, 2);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = 2').get() as { n: number }).n, 2);
});

function insertTx(db: DB, { name = null as string | null, details = '', cat = null as number | null } = {}): number {
  return Number(
    db
      .prepare(`INSERT INTO transactions
        (import_hash, amount_cents, account_number, transaction_type, counterparty_name, details, status, created_at, category_id, category_source)
        VALUES (?,?,?,?,?,?,'accepted','t',?,?)`)
      .run(`h${++h}`, -1000, 'BE1', 'Kaartbetaling', name, details, cat, cat ? 'manual' : null)
      .lastInsertRowid,
  );
}

test('maybeSuggestRule: prioritizes counterparty_name over details', () => {
  const db = createDb(':memory:');
  const a = insertTx(db, { name: 'NETFLIX', details: 'NETFLIX.COM BE', cat: 1 });
  insertTx(db, { name: 'NETFLIX', details: 'NETFLIX.COM BE' });
  insertTx(db, { name: 'NETFLIX', details: 'NETFLIX.COM BE' });

  maybeSuggestRule(db, a);
  const sugg = db.prepare('SELECT * FROM rule_suggestions').all() as any[];
  assert.equal(sugg.length, 1);
  assert.equal(sugg[0].token, 'NETFLIX');
  assert.equal(sugg[0].match_field, 'counterparty_name');
  assert.equal(sugg[0].match_type, 'equals');
});

test('maybeSuggestRule: suggests multi-word phrases if adjacent', () => {
  const db = createDb(':memory:');
  const a = insertTx(db, { details: 'ALBERT HEIJN 123', cat: 1 });
  insertTx(db, { details: 'ALBERT HEIJN 456' });
  insertTx(db, { details: 'ALBERT HEIJN 789' });

  maybeSuggestRule(db, a);
  const sugg = db.prepare('SELECT * FROM rule_suggestions').all() as any[];
  assert.equal(sugg.length, 1);
  assert.equal(sugg[0].token, 'ALBERT HEIJN');
  assert.equal(sugg[0].match_field, 'details');
  assert.equal(sugg[0].match_type, 'contains');
});

test('maybeSuggestRule: noise filtering avoids cross-category tokens', () => {
  const db = createDb(':memory:');
  // Token "PARKING" already used in category 2 (Transport)
  insertTx(db, { details: 'CITY PARKING MECHELEN', cat: 2 });

  // Now we manually categorize a new "PARKING" tx as category 1 (Dining?)
  const a = insertTx(db, { details: 'RESTAURANT PARKING GENT', cat: 1 });
  insertTx(db, { details: 'RESTAURANT PARKING GENT' });
  insertTx(db, { details: 'RESTAURANT PARKING GENT' });

  maybeSuggestRule(db, a);
  const sugg = db.prepare('SELECT * FROM rule_suggestions').all() as any[];
  // Should NOT suggest "PARKING" (noisy). Should suggest the most specific non-noisy phrase.
  assert.equal(sugg.length, 1);
  assert.equal(sugg[0].token, 'RESTAURANT PARKING GENT');
});

