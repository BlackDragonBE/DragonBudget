import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, type DB } from '../src/db';
import { detectRecurring, inferFrequency, amountsSimilar, dayGaps, filterToMedianCluster } from '../src/recurring/detect';

let h = 0;
function insertTx(
  db: DB,
  o: { date: string; amount: number; type?: string; iban?: string | null; name?: string | null; details?: string },
): void {
  db.prepare(`INSERT INTO transactions
      (import_hash, execution_date, value_date, amount_cents, account_number, transaction_type,
       counterparty_account, counterparty_name, details, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,'accepted','t')`).run(
    `h${++h}`, o.date, o.date, o.amount, 'BE1', o.type ?? 'Kaartbetaling',
    o.iban ?? null, o.name ?? null, o.details ?? 'BETALING MET DEBETKAART NUMMER 4871 04XX XXXX 7437 SHOP',
  );
}

test('inferFrequency: tolerance bands', () => {
  assert.equal(inferFrequency([30, 31, 29]), 'monthly');
  assert.equal(inferFrequency([7, 7, 8]), 'weekly');
  assert.equal(inferFrequency([365]), 'yearly');
  assert.equal(inferFrequency([12, 90]), 'irregular'); // median 51 — no band
  assert.equal(inferFrequency([]), 'irregular');
});

test('amountsSimilar: within / outside 10%', () => {
  assert.ok(amountsSimilar([-1000, -1050, -950]));
  assert.ok(!amountsSimilar([-1000, -2000]));
});

test('dayGaps: day differences between ISO dates', () => {
  assert.deepEqual(dayGaps(['2026-01-01', '2026-02-01', '2026-02-08']), [31, 7]);
});

test('detectRecurring: direct debit (single), card pattern, ignores one-off', () => {
  const db = createDb(':memory:');
  // Direct debit — recurring by definition even at one occurrence.
  insertTx(db, { date: '2026-03-01', amount: -3141, type: 'Domiciliëring', iban: 'BE38001697497572', name: 'AG INSURANCE' });
  // Card pattern — 3 monthly KRUIDVAT, similar amounts.
  for (const [date, amt] of [['2026-01-15', -1205], ['2026-02-15', -1230], ['2026-03-15', -1190]] as const) {
    insertTx(db, { date, amount: amt, details: 'BETALING MET DEBETKAART NUMMER 4871 04XX XXXX 7437 KRUIDVAT 8932 MECHELEN' });
  }
  // One-off — must NOT be detected.
  insertTx(db, { date: '2026-02-02', amount: -5000, details: 'BETALING MET DEBETKAART NUMMER 4871 04XX XXXX 7437 ESSO MECHELEN' });

  const { detected } = detectRecurring(db);
  assert.equal(detected, 2);

  const rows = db.prepare('SELECT label, frequency, status, counterparty_key FROM recurring_expenses ORDER BY label').all() as
    { label: string; frequency: string; status: string; counterparty_key: string }[];
  assert.equal(rows.length, 2);
  const ag = rows.find((r) => r.label === 'AG INSURANCE')!;
  assert.equal(ag.frequency, 'monthly');
  assert.equal(ag.status, 'detected');
  assert.ok(rows.some((r) => r.counterparty_key === 'MERCH:KRUIDVAT'));
  assert.ok(!rows.some((r) => r.counterparty_key === 'MERCH:ESSO'));

  // KRUIDVAT should link its 3 occurrences.
  const kruid = rows.find((r) => r.counterparty_key === 'MERCH:KRUIDVAT')!;
  const linkCount = db
    .prepare(`SELECT COUNT(*) AS n FROM recurring_expense_transactions ret
              JOIN recurring_expenses r ON r.id = ret.recurring_expense_id WHERE r.counterparty_key = 'MERCH:KRUIDVAT'`)
    .get() as { n: number };
  assert.equal(linkCount.n, 3);
  assert.ok(kruid);
});

test('detectRecurring: preserves user-set dismissed status on re-run', () => {
  const db = createDb(':memory:');
  for (const date of ['2026-01-15', '2026-02-15', '2026-03-15']) {
    insertTx(db, { date, amount: -1200, details: 'BETALING MET DEBETKAART NUMMER 4871 04XX XXXX 7437 KRUIDVAT 8932 MECHELEN' });
  }
  detectRecurring(db);
  db.prepare("UPDATE recurring_expenses SET status = 'dismissed' WHERE counterparty_key = 'MERCH:KRUIDVAT'").run();

  detectRecurring(db); // re-run must not resurrect it
  const status = (db.prepare("SELECT status FROM recurring_expenses WHERE counterparty_key = 'MERCH:KRUIDVAT'").get() as { status: string }).status;
  assert.equal(status, 'dismissed');
});

test('detectRecurring: detects salary despite holiday-pay outliers from same IBAN', () => {
  const db = createDb(':memory:');
  const iban = 'BE48091000543027';
  const name = 'PROVINCIE ANTWERPEN';
  // 4 monthly salary payments + 2 outliers (partial month, holiday pay) from same IBAN.
  for (const [date, amt] of [
    ['2026-01-29', 273900],
    ['2026-02-26', 274000],
    ['2026-03-30', 148100], // partial month — outlier
    ['2026-04-29', 279100],
    ['2026-05-11', 197800], // holiday pay — outlier
    ['2026-05-28', 277000],
  ] as const) {
    insertTx(db, { date, amount: amt, type: 'Overschrijving', iban, name });
  }

  const { detected } = detectRecurring(db);
  assert.equal(detected, 1);

  const row = db.prepare('SELECT label, frequency, expected_amount_cents FROM recurring_expenses').get() as
    { label: string; frequency: string; expected_amount_cents: number };
  assert.equal(row.label, 'PROVINCIE ANTWERPEN');
  assert.equal(row.frequency, 'monthly');
  assert.equal(row.expected_amount_cents, 277000); // last of the core cluster, not an outlier

  const linkCount = db
    .prepare(`SELECT COUNT(*) AS n FROM recurring_expense_transactions ret
              JOIN recurring_expenses r ON r.id = ret.recurring_expense_id`).get() as { n: number };
  assert.equal(linkCount.n, 4); // only the 4 salary transactions, outliers excluded
});

test('filterToMedianCluster: keeps core, drops outliers', () => {
  const mk = (amt: number): any => ({ amount_cents: amt });
  const core = filterToMedianCluster([mk(273900), mk(274000), mk(148100), mk(279100), mk(197800), mk(277000)].map((x: any, i: number) => ({ ...x, id: i, date: `2026-0${i + 1}-01`, transaction_type: '', counterparty_account: null, counterparty_name: null, details: '' })));
  assert.equal(core.length, 4);
  assert.ok(core.every((c) => c.amount_cents >= 205000));
});
