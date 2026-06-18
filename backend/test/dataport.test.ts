import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';
import { parseBnpCsv } from '../src/csv/parse';
import { importTransactions } from '../src/csv/import';
import {
  exportTransactions, exportConfig, importTransactionRows, importConfig,
  exportKnownAccounts, exportBudgets, importKnownAccounts, importBudgets,
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

test('dataport: known accounts round-trip works', () => {
  const db1 = createDb(':memory:');
  db1.prepare("INSERT INTO known_accounts (name, account_number, is_own_account) VALUES ('Test Account 1', 'BE12345678', 0), ('Personal Account', 'BE87654321', 1)").run();

  const exported = exportKnownAccounts(db1) as any[];
  assert.equal(exported.length, 2);

  const db2 = createDb(':memory:');
  const result = importKnownAccounts(db2, exported);
  assert.deepEqual({ ...result }, { imported: 2, total: 2 });

  const account1 = db2.prepare("SELECT * FROM known_accounts WHERE account_number = 'BE12345678'").get() as { name: string; is_own_account: number };
  const account2 = db2.prepare("SELECT * FROM known_accounts WHERE account_number = 'BE87654321'").get() as { name: string; is_own_account: number };
  assert.equal(account1.name, 'Test Account 1');
  assert.equal(account1.is_own_account, 0);
  assert.equal(account2.name, 'Personal Account');
  assert.equal(account2.is_own_account, 1);
});

test('dataport: re-importing known accounts is idempotent', () => {
  const db1 = createDb(':memory:');
  db1.prepare("INSERT INTO known_accounts (name, account_number, is_own_account) VALUES ('Account', 'BE11223344', 0)").run();

  const exported = exportKnownAccounts(db1) as any[];
  const db2 = createDb(':memory:');
  importKnownAccounts(db2, exported);
  const again = importKnownAccounts(db2, exported);
  assert.equal(again.imported, 0); // INSERT OR IGNORE on account_number
});

test('dataport: budgets round-trip works', () => {
  const db1 = createDb(':memory:');
  // 'Housing' is a default seed category, present in both db1 and a fresh db2.
  const cat = db1.prepare("SELECT id FROM categories WHERE name = 'Housing'").get() as { id: number };
  db1.prepare("INSERT INTO budgets (category_id, month, limit_cents) VALUES (?, '2026-01', ?)").run(cat.id, 50000);

  const exported = exportBudgets(db1) as any[];
  assert.equal(exported.length, 1);
  assert.equal(exported[0].category_name, 'Housing');

  const db2 = createDb(':memory:');
  const result = importBudgets(db2, exported);
  assert.deepEqual({ ...result }, { imported: 1, total: 1 });

  const budget = db2.prepare("SELECT b.limit_cents, c.name FROM budgets b JOIN categories c ON b.category_id = c.id").get() as { limit_cents: number; name: string };
  assert.equal(budget.limit_cents, 50000);
  assert.equal(budget.name, 'Housing');
});

test('dataport: re-importing budgets is idempotent', () => {
  const db1 = createDb(':memory:');
  const cat = db1.prepare("SELECT id FROM categories WHERE name = 'Housing'").get() as { id: number };
  db1.prepare("INSERT INTO budgets (category_id, month, limit_cents) VALUES (?, '2026-02', ?)").run(cat.id, 100000);

  const exported = exportBudgets(db1) as any[];
  const db2 = createDb(':memory:');
  const first = importBudgets(db2, exported);
  assert.equal(first.imported, 1);

  const second = importBudgets(db2, exported);
  assert.equal(second.imported, 0); // INSERT OR IGNORE pattern (no conflict)
});
