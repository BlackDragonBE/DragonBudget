import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseBnpCsv, CsvFormatError } from '../src/csv/parse';
import { importTransactions } from '../src/csv/import';
import { createDb } from '../src/db';

const HEADERS =
  'Volgnummer;Uitvoeringsdatum;Valutadatum;Bedrag;Valuta rekening;Rekeningnummer;' +
  'Type verrichting;Tegenpartij;Naam van de tegenpartij;Mededeling;Details;Status;Reden van weigering';

// Synthetic export covering the documented quirks: BOM, comma+dot decimals,
// empty counterparties on card payments, a rejected row, malformed Volgnummer.
const SAMPLE =
  '﻿' + HEADERS + '\n' +
  '2026-00001;17/06/2026;17/06/2026;-12,05;EUR;BE82001453755568;Kaartbetaling;;;;BETALING MET DEBETKAART NUMMER 4871 04XX XXXX 7437 KRUIDVAT 8932 MECHELEN BANKREFERENTIE : 2606171025209289 ;Geaccepteerd;\n' +
  '2026-;01/06/2026;01/06/2026;-31.41;EUR;BE82001453755568;Domiciliëring;BE38001697497572;AG INSURANCE;T. WONING;EUROPESE DOMICILIERING BANKREFERENTIE : 2606010931487335;Geweigerd;Raadpleeg uw contactpersoon.\n' +
  '2026-00003;15/06/2026;15/06/2026;2750.00;EUR;BE82001453755568;Overschrijving in euro;BE11000000000000;EMPLOYER NV;SALARIS;LOON JUNI BANKREFERENTIE : x;Geaccepteerd;\n';

test('parse: BOM, decimals, dates, status, empty counterparties', () => {
  const rows = parseBnpCsv(SAMPLE);
  assert.equal(rows.length, 3);

  const card = rows[0];
  assert.equal(card.amount_cents, -1205); // comma decimal -> cents
  assert.equal(card.status, 'accepted');
  assert.equal(card.counterparty_name, null); // empty card-payment counterparty
  assert.equal(card.execution_date, '2026-06-17'); // DD/MM/YYYY -> ISO

  const rejected = rows[1];
  assert.equal(rejected.status, 'rejected');
  assert.ok(rejected.rejection_reason);
  assert.equal(rejected.counterparty_name, 'AG INSURANCE');

  assert.equal(rows[2].amount_cents, 275000); // dot decimal, positive income
});

test('parse: rejects a file with wrong headers', () => {
  assert.throws(() => parseBnpCsv('foo;bar\n1;2\n'), CsvFormatError);
});

test('parse: rejects a malformed amount', () => {
  const bad = '﻿' + HEADERS + '\n2026-1;01/01/2026;01/01/2026;NOPE;EUR;BE1;Kaartbetaling;;;;DETAILS;Geaccepteerd;\n';
  assert.throws(() => parseBnpCsv(bad), CsvFormatError);
});

test('import: is idempotent on re-import (dedup by import_hash)', () => {
  const db = createDb(':memory:');
  const rows = parseBnpCsv(SAMPLE);

  const first = importTransactions(db, rows);
  assert.equal(first.inserted, 3);
  assert.equal(first.duplicates, 0);
  assert.equal(first.rejected, 1);

  const second = importTransactions(db, rows);
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 3);

  const count = (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n;
  assert.equal(count, 3);
});

// Real 485-row export (DESIGN.md §11). Skipped if the private file is absent.
const FIXTURE = path.join(__dirname, '..', '..', 'csv_exports', 'CSV_2026-06-17-16.52.csv');
test('import: real BNP export parses and dedups', { skip: !fs.existsSync(FIXTURE) }, () => {
  const content = fs.readFileSync(FIXTURE, 'utf8');
  const rows = parseBnpCsv(content);
  assert.equal(rows.length, 485);
  assert.ok(rows.every((r) => Number.isInteger(r.amount_cents)));
  assert.ok(rows.some((r) => r.status === 'rejected'));
  assert.ok(rows.some((r) => r.counterparty_name === null)); // card payments

  const db = createDb(':memory:');
  assert.equal(importTransactions(db, rows).inserted, 485);
  assert.equal(importTransactions(db, rows).inserted, 0); // idempotent
});
