import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';
import { parseBnpCsv } from '../src/csv/parse';
import { importTransactions } from '../src/csv/import';
import {
  exportTransactions, exportConfig, importTransactionRows, importConfig,
} from '../src/routes/dataport';
import { resolveSort } from '../src/routes/transactions';

const HEADERS =
  'Volgnummer;Uitvoeringsdatum;Valutadatum;Bedrag;Valuta rekening;Rekeningnummer;' +
  'Type verrichting;Tegenpartij;Naam van de tegenpartij;Mededeling;Details;Status;Reden van weigering';

const SAMPLE =
  '﻿' + HEADERS + '\n' +
  '2026-00001;17/06/2026;17/06/2026;-12,05;EUR;BE82001453755568;Kaartbetaling;;;;BETALING KRUIDVAT MECHELEN BANKREFERENTIE : 2606171025209289 ;Geaccepteerd;\n' +
  '2026-00003;15/06/2026;15/06/2026;2750.00;EUR;BE82001453755568;Overschrijving in euro;BE11000000000000;EMPLOYER NV;SALARIS;LOON JUNI BANKREFERENTIE : x;Geaccepteerd;\n';

// Seed db1 with the sample, then manually categorize the Kruidvat row as Groceries.
function seededSource() {
  const db = createDb(':memory:');
  importTransactions(db, parseBnpCsv(SAMPLE));
  const groceries = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number };
  db.prepare("UPDATE transactions SET category_id = ?, category_source = 'manual' WHERE details LIKE '%KRUIDVAT%'")
    .run(groceries.id);
  return db;
}

test('dataport: transactions round-trip preserves category by name', () => {
  const exported = exportTransactions(seededSource()) as any[];
  assert.equal(exported.length, 2);

  const db2 = createDb(':memory:');
  const result = importTransactionRows(db2, exported);
  assert.deepEqual({ ...result }, { imported: 2, total: 2 });

  const kruidvat = db2.prepare(
    "SELECT t.category_source, c.name AS category_name FROM transactions t " +
    "LEFT JOIN categories c ON c.id = t.category_id WHERE t.details LIKE '%KRUIDVAT%'"
  ).get() as { category_source: string; category_name: string | null };
  assert.equal(kruidvat.category_name, 'Groceries'); // resolved by name in the fresh db
  assert.equal(kruidvat.category_source, 'manual');

  const salary = db2.prepare("SELECT category_id FROM transactions WHERE details LIKE '%LOON%'")
    .get() as { category_id: number | null };
  assert.equal(salary.category_id, null); // uncategorized stays null
});

test('dataport: re-importing the same transactions is idempotent', () => {
  const exported = exportTransactions(seededSource()) as any[];
  const db2 = createDb(':memory:');
  importTransactionRows(db2, exported);
  const again = importTransactionRows(db2, exported);
  assert.equal(again.imported, 0); // INSERT OR IGNORE on import_hash
});

test('dataport: config round-trip imports rules once (no duplicates)', () => {
  const db1 = createDb(':memory:');
  db1.prepare("INSERT INTO categories (name, is_income) VALUES ('Pet Care', 0)").run();
  const cat = db1.prepare("SELECT id FROM categories WHERE name = 'Pet Care'").get() as { id: number };
  db1.prepare(
    "INSERT INTO category_rules (category_id, match_field, match_type, match_value, priority, enabled, created_from_suggestion) " +
    "VALUES (?, 'details', 'contains', 'NETFLIX', 0, 1, 0)"
  ).run(cat.id);

  const cfg = exportConfig(db1) as any;

  const db2 = createDb(':memory:');
  const first = importConfig(db2, cfg);
  assert.equal(first.rulesImported, 1);
  assert.ok(db2.prepare("SELECT 1 FROM categories WHERE name = 'Pet Care'").get());
  assert.ok(db2.prepare("SELECT 1 FROM category_rules WHERE match_value = 'NETFLIX'").get());

  const second = importConfig(db2, cfg);
  assert.equal(second.rulesImported, 0); // exact-duplicate rule skipped
});

test('dataport: transaction with unknown category_name imports as uncategorized', () => {
  const db = createDb(':memory:');
  const result = importTransactionRows(db, [{
    import_hash: 'abc123', amount_cents: -500, currency: 'EUR',
    account_number: 'BE82001453755568', transaction_type: 'Kaartbetaling',
    details: 'X', status: 'accepted', category_name: 'NoSuchCategory',
  } as any]);
  assert.equal(result.imported, 1);
  const row = db.prepare('SELECT category_id FROM transactions WHERE import_hash = ?')
    .get('abc123') as { category_id: number | null };
  assert.equal(row.category_id, null);
});

test('resolveSort: whitelists columns and falls back safely', () => {
  assert.deepEqual(resolveSort({ sort: 'amount', order: 'asc' }), { col: 't.amount_cents', dir: 'ASC' });
  assert.deepEqual(resolveSort({ sort: 'counterparty' }), { col: 't.counterparty_name', dir: 'DESC' });
  // injection attempt / unknown sort -> default column, never echoed
  assert.deepEqual(resolveSort({ sort: 'id; DROP TABLE transactions' }), { col: 't.execution_date', dir: 'DESC' });
});
