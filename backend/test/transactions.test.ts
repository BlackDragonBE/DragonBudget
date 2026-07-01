import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db';
import { parseBnpCsv } from '../src/csv/parse';
import { importTransactions } from '../src/csv/import';
import { buildTxWhere, bulkCategorize } from '../src/routes/transactions';

const HEADERS =
  'Volgnummer;Uitvoeringsdatum;Valutadatum;Bedrag;Valuta rekening;Rekeningnummer;' +
  'Type verrichting;Tegenpartij;Naam van de tegenpartij;Mededeling;Details;Status;Reden van weigering';

const SAMPLE =
  '﻿' + HEADERS + '\n' +
  '2026-00001;01/06/2026;01/06/2026;-10,00;EUR;BE82001453755568;Kaartbetaling;;;;BETALING A BANKREFERENTIE : 1 ;Geaccepteerd;\n' +
  '2026-00002;15/06/2026;15/06/2026;-20,00;EUR;BE82001453755568;Kaartbetaling;;;;BETALING B BANKREFERENTIE : 2 ;Geaccepteerd;\n' +
  '2026-00003;30/06/2026;30/06/2026;-30,00;EUR;BE82001453755568;Kaartbetaling;;;;BETALING C BANKREFERENTIE : 3 ;Geaccepteerd;\n';

function seeded() {
  const db = createDb(':memory:');
  importTransactions(db, parseBnpCsv(SAMPLE));
  return db;
}

function idsFor(db: ReturnType<typeof createDb>, query: Record<string, unknown>): string[] {
  const { whereSql, params } = buildTxWhere(query);
  const rows = db.prepare(`SELECT t.execution_date AS d FROM transactions t ${whereSql} ORDER BY d`).all(...params) as { d: string }[];
  return rows.map((r) => r.d);
}

test('buildTxWhere: from/to bounds are inclusive on execution_date', () => {
  const db = seeded();
  assert.deepEqual(idsFor(db, { from: '2026-06-15' }), ['2026-06-15', '2026-06-30']);
  assert.deepEqual(idsFor(db, { to: '2026-06-15' }), ['2026-06-01', '2026-06-15']);
  assert.deepEqual(idsFor(db, { from: '2026-06-02', to: '2026-06-29' }), ['2026-06-15']);
});

test('buildTxWhere: malformed from/to are ignored', () => {
  const db = seeded();
  assert.equal(idsFor(db, { from: '15/06/2026', to: "'; DROP TABLE" }).length, 3);
});

test('bulkCategorize sets manual source, null clears both', () => {
  const db = seeded();
  const groceries = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number };
  const ids = (db.prepare('SELECT id FROM transactions').all() as { id: number }[]).map((r) => r.id);

  assert.equal(bulkCategorize(db, ids.slice(0, 2), groceries.id), 2);
  const rows = db.prepare('SELECT category_id, category_source FROM transactions ORDER BY id').all() as
    { category_id: number | null; category_source: string | null }[];
  assert.deepEqual({ ...rows[0] }, { category_id: groceries.id, category_source: 'manual' });
  assert.deepEqual({ ...rows[2] }, { category_id: null, category_source: null });

  assert.equal(bulkCategorize(db, ids, null), 3);
  const cleared = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NULL AND category_source IS NULL').get() as { n: number };
  assert.equal(cleared.n, 3);
});
