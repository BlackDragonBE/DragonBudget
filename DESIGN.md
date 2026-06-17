# Home Budgeting App — Design Document

## 1. Purpose and scope

A self-hosted budgeting web app for personal use, deployed as a single Docker
container on Eric's home server (Ubuntu, Docker-based stack already running
Immich, arr-stack, Plex, Tailscale). Accessed remotely via Tailscale, so no
public exposure and no need for heavyweight auth — a single shared
password gate is sufficient.

**Out of scope for v1** (explicitly deferred, but the data model should not
make these painful to add later):
- Live bank sync via PSD2/aggregator APIs (Ponto, Tink, etc.) — data enters
  the app exclusively via manual CSV import for now.
- Multi-user support with separate logins/permissions. Bonnie's transactions
  are not available (separate account, no export access), so this is single
  account, single user for v1. Keep the schema from actively blocking a
  second user later (see §3.7), but don't build UI for it now.
- Investments/assets tracking, bill splitting, multi-currency. The source
  account is EUR-only.

**In scope for v1:**
- Import BNP Paribas Fortis Easy Banking CSV exports, safely re-importable
  without creating duplicates.
- Categorize transactions via user-defined rules, with manual override and
  rule auto-suggestion from repeated merchants.
- Month view: spending by category vs. budget, for a selected month.
- All-time view: balance-over-time chart, plus longer-range category trends.
- Recurring expense detection (subscriptions, domiciliëringen, standing
  orders) with confirm/dismiss workflow.
- Responsive web frontend, usable on both desktop and mobile.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js (LTS) + TypeScript | Already installed on the home server; one language across stack |
| Backend framework | Express | Minimal, well-understood, fine for this scope |
| Database | SQLite via `better-sqlite3` | File-based, zero extra container, trivial to back up (copy one file), more than enough for a personal dataset of a few thousand transactions/year |
| Frontend | React + TypeScript + Vite | Vite builds to static assets that Express serves directly — keeps this a single container with no separate frontend service |
| Styling | Tailwind CSS | Fast to build a clean, responsive UI without hand-rolling a design system |
| Charts | Recharts or Chart.js | Either is fine; Recharts has a slightly nicer React API |
| Validation | Zod | Validate CSV rows and API request bodies with one schema library |
| Auth | Single shared password, session cookie | Tailscale already restricts network access; this just stops anyone else on the tailnet (e.g. future guests) from poking at it without a password |

**Why a single container:** Express serves the built React static files
*and* the API from the same process/port. SQLite lives on a mounted volume.
No nginx, no separate frontend container, no docker-compose required for the
baseline (though docker-compose is fine if it's more convenient for volume
mapping — that's an implementation detail, not an architectural one).

```
Dockerfile (multi-stage):
  Stage 1: build frontend (npm ci && npm run build in /frontend)
  Stage 2: build backend (npm ci && npm run build in /backend)
  Stage 3: runtime — copy backend dist + frontend dist + node_modules,
           expose port, CMD runs the Express server

Volumes:
  /data  → contains budgeting.db (SQLite file), mounted from host
```

---

## 3. Data model

All monetary amounts are stored as **integer cents** (not floats), to avoid
floating-point rounding issues in sums. Convert to/from decimal euros only
at the API/display boundary.

### 3.1 `transactions`

The core imported record. One row per bank transaction line from the CSV.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `import_hash` | TEXT, UNIQUE, NOT NULL | dedup key, see §4.2 |
| `execution_date` | TEXT (ISO `YYYY-MM-DD`) | from `Uitvoeringsdatum` |
| `value_date` | TEXT (ISO `YYYY-MM-DD`) | from `Valutadatum` |
| `amount_cents` | INTEGER, NOT NULL | positive = income, negative = expense |
| `currency` | TEXT, NOT NULL, default `'EUR'` | from `Valuta rekening` |
| `account_number` | TEXT, NOT NULL | from `Rekeningnummer` (IBAN) |
| `transaction_type` | TEXT, NOT NULL | raw value from `Type verrichting` (Dutch), see §3.1.1 |
| `counterparty_account` | TEXT, nullable | from `Tegenpartij` |
| `counterparty_name` | TEXT, nullable | from `Naam van de tegenpartij` |
| `message` | TEXT, nullable | from `Mededeling` (structured remittance info, when present) |
| `details` | TEXT, NOT NULL | from `Details` (free-text dump — always present, richest source for card payments) |
| `status` | TEXT, NOT NULL | `'accepted'` or `'rejected'`, mapped from `Geaccepteerd`/`Geweigerd` |
| `rejection_reason` | TEXT, nullable | from `Reden van weigering` |
| `category_id` | INTEGER, nullable, FK → `categories.id` | assigned category, nullable until categorized |
| `category_source` | TEXT, nullable | `'rule'` \| `'manual'` \| `null` — tracks whether a rule or the user assigned it, so re-running rules doesn't clobber manual overrides (see §5.3) |
| `created_at` | TEXT (ISO datetime) | row insert timestamp |

**3.1.1 — Known `transaction_type` values observed in real exports** (Dutch,
verbatim from BNP Paribas Fortis — store as-is, map to friendlier labels only
in the UI layer):

- `Kaartbetaling` — card payment (merchant name buried in `details`, no
  structured counterparty)
- `Overschrijving in euro` — standard transfer
- `Instantoverschrijving in euro` — instant transfer (e.g. Wero payments)
- `Domiciliëring` — direct debit (recurring by nature — mandate number
  present in `details`)
- `Doorlopende betalingsopdracht` — standing order (recurring by
  definition — e.g. monthly rent/alimony)
- `Consumentenkrediet Terugbetaling` — loan repayment
- `Kosten in verband met de rekening` — account fees (e.g. monthly package fee)
- `Kosten diverse verrichtingen` — misc. transaction fees
- `Geldstorting via kaart` — cash deposit via card
- `Correctie kaartverrichting` — card transaction correction/refund

This list is not guaranteed exhaustive — the importer should not reject
unrecognized types, just store them as-is and let them be categorized like
anything else.

**Important real-world quirks to handle (confirmed from a 485-row, 6-month
sample export):**
- `status = 'rejected'` rows exist (e.g. a failed direct debit) and **must
  be excluded** from balance calculations, spending totals, and recurring
  detection, but should still be visible in the transaction list (greyed
  out / flagged) so the user knows a payment failed.
- `Tegenpartij`/`Naam van de tegenpartij` are empty for ~65% of rows in
  practice (all card payments) — do not assume these fields are populated.
  Merchant identification for card payments must come from parsing
  `details`.
- Amounts use `.` as decimal separator, no thousands separator, no currency
  symbol (e.g. `-1900.00`, `2750.00`). Negative sign prefix for debits.
- The CSV's own `Volgnummer` (sequence number) field is unreliable — at
  least one observed row had a malformed value (`2026-` with no number).
  **Do not use it as a dedup key.**
- File encoding is UTF-8 with a BOM; delimiter is `;`. Strip BOM when reading.

### 3.2 `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT, UNIQUE, NOT NULL | e.g. "Groceries", "Fuel", "Subscriptions" |
| `icon` | TEXT, nullable | optional emoji or icon key for UI |
| `color` | TEXT, nullable | hex color for charts |
| `is_income` | BOOLEAN, NOT NULL, default `false` | distinguishes income categories from expense categories for reporting |
| `archived` | BOOLEAN, NOT NULL, default `false` | soft-delete instead of hard delete, so historical transactions keep their category label intact |

Seed with a sensible default set on first run (Groceries, Fuel/Transport,
Subscriptions, Housing, Utilities, Insurance, Health, Dining Out,
Shopping, Income, Transfers, Fees, Loan Repayment, Other) but make these
fully editable — don't hardcode them in app logic.

### 3.3 `category_rules`

Rules are matched against transaction fields to auto-assign a category on
import.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `category_id` | INTEGER, NOT NULL, FK → `categories.id` | |
| `match_field` | TEXT, NOT NULL | `'details'` \| `'counterparty_name'` \| `'message'` |
| `match_type` | TEXT, NOT NULL | `'contains'` \| `'equals'` \| `'starts_with'` |
| `match_value` | TEXT, NOT NULL | case-insensitive comparison value, e.g. `"KRUIDVAT"` |
| `priority` | INTEGER, NOT NULL, default `0` | higher priority evaluated first; first match wins |
| `enabled` | BOOLEAN, NOT NULL, default `true` | |
| `created_from_suggestion` | BOOLEAN, NOT NULL, default `false` | tracks whether this rule originated from auto-suggestion (§5.2) vs. manually authored, purely informational |

Rule matching is substring-based against the relevant field (uppercased
comparison, since BNP's `details` field is all-caps). `details` is the
field most card payments are matched against, since it contains the
merchant name positionally (e.g. `...4871 04XX XXXX 7437 KRUIDVAT 8932
MECHELEN...`).

### 3.4 `budgets`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `category_id` | INTEGER, NOT NULL, FK → `categories.id` | |
| `month` | TEXT, NOT NULL | `YYYY-MM` |
| `limit_cents` | INTEGER, NOT NULL | |

Unique constraint on `(category_id, month)`. When creating a new month,
offer a "copy budgets from previous month" action in the UI rather than
auto-creating rows — keeps the table only containing intentional budgets.

### 3.5 `recurring_expenses`

Represents a detected or user-confirmed recurring pattern.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `label` | TEXT, NOT NULL | display name, defaulted from counterparty/merchant name, user-editable |
| `counterparty_key` | TEXT, NOT NULL | normalized matching key (see §5.4) |
| `category_id` | INTEGER, nullable, FK → `categories.id` | |
| `expected_amount_cents` | INTEGER, NOT NULL | typically the average or most recent matched amount |
| `frequency` | TEXT, NOT NULL | `'weekly'` \| `'monthly'` \| `'yearly'` \| `'irregular'` |
| `status` | TEXT, NOT NULL, default `'detected'` | `'detected'` \| `'confirmed'` \| `'dismissed'` |
| `next_expected_date` | TEXT (ISO date), nullable | projected forward from last occurrence + frequency |
| `last_seen_date` | TEXT (ISO date), nullable | |

### 3.6 `recurring_expense_transactions`

Join table linking detected occurrences back to actual transactions, so the
detail view can show "here are the 6 transactions that make up this
recurring expense."

| Column | Type | Notes |
|---|---|---|
| `recurring_expense_id` | INTEGER, FK → `recurring_expenses.id` | |
| `transaction_id` | INTEGER, FK → `transactions.id` | |

Composite primary key on both columns.

### 3.7 Forward-compatibility note for multi-user

Don't build a `users` table or auth-per-row in v1. But avoid hardcoding
single-user assumptions into the schema that would force a migration
later: specifically, don't put user-identifying data inline on
`transactions` — if a second account/user is added later, the natural
extension is an `accounts` table (one row per bank account, keyed by
`account_number`) and a `users`-to-`accounts` mapping, added alongside the
existing tables rather than replacing them.

---

## 4. CSV import pipeline

### 4.1 Parsing

- Read file as UTF-8, strip BOM if present.
- Delimiter: `;`. Use a proper CSV parser (e.g. `csv-parse` or `papaparse`
  in Node) rather than naive string splitting — `details` and other fields
  may theoretically contain delimiter-like characters.
- Expected headers (Dutch, exact strings from the bank export):
  `Volgnummer;Uitvoeringsdatum;Valutadatum;Bedrag;Valuta rekening;
  Rekeningnummer;Type verrichting;Tegenpartij;Naam van de tegenpartij;
  Mededeling;Details;Status;Reden van weigering`
- Validate headers on import; if they don't match, reject the file with a
  clear error rather than silently misparsing (the bank could change the
  export format).
- Parse dates from `DD/MM/YYYY` to ISO `YYYY-MM-DD`.
- Parse amounts: replace `,` with `.` defensively (in case of locale
  variance), parse as float, convert to integer cents via
  `Math.round(parseFloat(value) * 100)` — never store the float directly.
- Map `Geaccepteerd` → `'accepted'`, `Geweigerd` → `'rejected'`.

### 4.2 Deduplication

Since the user will re-export overlapping date ranges over time (e.g.
exporting "last 3 months" repeatedly), imports must be idempotent.

Compute `import_hash` as a SHA-256 hash of a stable concatenation of fields
that together uniquely identify a transaction line:

```
import_hash = sha256(
  execution_date + '|' +
  value_date + '|' +
  amount_cents + '|' +
  account_number + '|' +
  transaction_type + '|' +
  details
)
```

`details` is included because it contains the bank's own reference number
(`BANKREFERENTIE : ...`) which is far more reliable than `Volgnummer` for
disambiguating same-day, same-amount transactions (e.g. two coffee
purchases at the same shop on the same day for the same price would
otherwise collide).

On import, `INSERT OR IGNORE` (or equivalent — check-then-insert) against
this unique constraint. Report back to the user: N new transactions
imported, M skipped as duplicates.

### 4.3 Post-import processing

After inserting new rows, in order:
1. Run category rules against newly inserted, uncategorized transactions
   (§5.1).
2. Re-run recurring expense detection (§5.4) — new transactions may
   complete a pattern or shift a `next_expected_date`.

### 4.4 Import UI

A simple file upload (drag-and-drop or file picker) on a dedicated Import
page. After upload, show a summary: rows parsed, new transactions added,
duplicates skipped, rejected-status transactions found (flagged
separately), and how many were auto-categorized vs. left uncategorized.

---

## 5. Categorization logic

### 5.1 Rule application

On each new transaction, evaluate enabled rules in descending `priority`
order (ties broken by `id` ascending, for determinism). First matching
rule sets `category_id` and `category_source = 'rule'`. If no rule
matches, leave `category_id` null for manual categorization.

**Never overwrite a transaction where `category_source = 'manual'`** when
re-running rules in bulk (e.g. after editing a rule). Manual assignment
always wins. Re-running rules should only ever populate previously-null
categories or update ones still marked `'rule'`-sourced, unless the user
explicitly chooses a "re-categorize everything" action.

### 5.2 Rule auto-suggestion

After a user manually categorizes a transaction, check whether other
*uncategorized* transactions exist whose `details` (or `counterparty_name`,
if present) contain a shared distinctive substring with the one just
categorized. A reasonable approach:

1. Extract a candidate merchant token from `details` — for card payments
   this is typically the text between the card number block and the
   following postal-code-and-city pattern (e.g. `KRUIDVAT 8932 MECHELEN`
   → candidate token `KRUIDVAT`). A simpler, more robust heuristic: take
   the longest all-caps word sequence in `details` that isn't a known
   boilerplate term (`BETALING`, `MET`, `DEBETKAART`, `NUMMER`,
   `BANCONTACT`, `BANKREFERENTIE`, `VALUTADATUM`, city names is harder to
   filter generically — start simple and let the user refine suggested
   rules rather than trying to perfectly extract merchant names).
2. Count how many *other* uncategorized transactions contain that same
   token.
3. If count ≥ 2 (i.e. this isn't a one-off), surface a suggestion: "Create
   a rule: transactions containing 'KRUIDVAT' → Groceries?" with
   accept/dismiss actions in the UI.
4. On accept, create the `category_rules` row (`created_from_suggestion =
   true`) and immediately apply it to matching uncategorized transactions.

This doesn't need to be perfect NLP — it's a convenience feature, and the
user can always write/edit rules manually too. Build the manual rule
editor first; treat suggestion as an enhancement on top of working manual
rules.

### 5.3 Manual categorization UI

Transaction list should support inline category assignment (e.g. a
dropdown per row, or multi-select + bulk-assign). Setting a category
manually always sets `category_source = 'manual'`.

---

## 6. Recurring expense detection

### 6.1 Easy wins from transaction type

Any transaction with `transaction_type` of `Domiciliëring` or
`Doorlopende betalingsopdracht` is recurring by definition (these are
direct debits and standing orders — the bank-level concept already
guarantees recurrence). Group these by `counterparty_account` (most
reliable key, since the IBAN doesn't change) and surface them as detected
recurring expenses immediately, even from a single occurrence — flag
single-occurrence ones as "detected, awaiting confirmation" since the
pattern is only assumed, not yet observed.

### 6.2 Pattern detection for card payments and transfers

For `Kaartbetaling` and other types without inherent recurrence, detect
patterns by:

1. Group transactions by a normalized counterparty key (§6.3).
2. Within each group, sort by date and compute the gaps between
   consecutive occurrences.
3. Look for amount similarity (within ~10% tolerance, configurable) *and*
   date-gap consistency (e.g. gaps clustering around 28-31 days →
   monthly; around 7 days → weekly; around 365 days → yearly). Use a
   simple tolerance band rather than building statistical models — this is
   a personal finance tool, not a research project.
4. Require at least 2 qualifying occurrences before suggesting a pattern
   (3+ gives higher confidence and should be the bar for auto-`'detected'`
   status; 2 occurrences can be surfaced as a lower-confidence hint).
5. On confirmation (or auto-detection for direct debits/standing orders),
   compute `next_expected_date` as `last_seen_date + typical_gap`.

### 6.3 Normalizing the counterparty key

- If `counterparty_account` (IBAN) is present and non-empty, use it
  directly — most reliable.
- Otherwise (card payments), extract a merchant token from `details` using
  the same heuristic as §5.2's rule suggestion logic, and use the
  normalized (uppercased, whitespace-collapsed) token as the key.
- Be aware that one merchant chain may appear with positional variants in
  `details` (e.g. different store numbers/locations for the same
  retailer) — exact merchant-extraction precision is a nice-to-have;
  don't block v1 on solving this perfectly. Card-based recurring
  detection will be the least reliable category — direct debits and
  standing orders are the reliable, high-value part of this feature.

### 6.4 Recurring expenses UI

A dedicated page listing detected recurring expenses, each showing: label
(editable), amount, frequency, last seen date, next expected date, status
badge, and a list of the linked transactions. Actions: confirm, dismiss
(mark as not actually recurring — e.g. a coincidental amount match), edit
label/category.

---

## 7. Views and pages

### 7.1 Dashboard / Month view

- Month selector (defaults to current month).
- Total income, total expenses, net for the selected month.
- Spending by category: list or bar chart, each category showing spent
  vs. budgeted (if a budget exists for that category+month), with a
  progress indicator and a visual warning state when over budget.
- List of uncategorized transactions for the month, prominently surfaced
  (a budgeting app is only as useful as its categorization completeness).

### 7.2 All-time view

- Balance-over-time line chart, computed as a running sum of all accepted
  transactions ordered by `value_date` (starting balance can be treated
  as 0 / relative, unless the user wants to set an actual starting
  balance as a configurable constant — simplest v1 approach: relative
  balance, with a one-time "starting balance" setting if the user wants
  absolute figures).
- Category spending trends across months (e.g. stacked bar or multi-line
  chart, spending per category per month over the full dataset).
- Date range filter (e.g. last 3/6/12 months, year-to-date, all-time).

### 7.3 Transactions list

- Full searchable, filterable (by category, date range, type, status)
  paginated list.
- Inline categorization.
- Visual distinction for rejected-status transactions.

### 7.4 Categories & Rules management

- CRUD for categories.
- CRUD for category rules, with manual test ("show me which existing
  transactions this rule would match") before saving — very useful for
  trusting a rule before it's applied broadly.
- Pending rule suggestions (§5.2) shown here for accept/dismiss.

### 7.5 Budgets

- Per-month budget editor: pick a month, set/edit limit per category,
  "copy from previous month" action.

### 7.6 Recurring expenses

As described in §6.4.

### 7.7 Import

As described in §4.4.

---

## 8. API surface (suggested)

REST, JSON. Rough shape — Claude Code should feel free to adjust naming for
consistency with whatever conventions it settles on, this is a starting
point, not a contract:

```
POST   /api/auth/login              { password } → session cookie
POST   /api/auth/logout

POST   /api/import                  multipart CSV upload → import summary
GET    /api/transactions             ?month=&category_id=&status=&q=&page=
PATCH  /api/transactions/:id         { category_id } → manual categorize

GET    /api/categories
POST   /api/categories
PATCH  /api/categories/:id
DELETE /api/categories/:id           (soft delete → archived = true)

GET    /api/rules
POST   /api/rules
PATCH  /api/rules/:id
DELETE /api/rules/:id
POST   /api/rules/:id/preview        → matching transactions, without saving
GET    /api/rules/suggestions        → pending auto-suggested rules
POST   /api/rules/suggestions/:id/accept
POST   /api/rules/suggestions/:id/dismiss

GET    /api/budgets                  ?month=
PUT    /api/budgets                  { category_id, month, limit_cents }
POST   /api/budgets/copy             { from_month, to_month }

GET    /api/recurring
PATCH  /api/recurring/:id            { status, label, category_id }

GET    /api/reports/month            ?month=   → totals + per-category breakdown
GET    /api/reports/balance-history  ?from=&to=
GET    /api/reports/category-trends  ?from=&to=
```

---

## 9. Deployment

```
Dockerfile        — multi-stage build as described in §2
docker-compose.yml (optional, for convenience):
  - service: budgeting-app
  - volume: ./data:/data  (persists budgeting.db)
  - ports: "PORT:3000" (bind to tailscale-reachable interface or 0.0.0.0,
    since access control is via Tailscale network membership + the app's
    own password gate)
  - environment: APP_PASSWORD, SESSION_SECRET
```

Backups: since everything lives in one SQLite file, back it up the same
way other self-hosted data is handled on the home server (periodic copy of
`/data/budgeting.db` to wherever Eric's existing backup routine already
covers, e.g. alongside the Immich/arr-stack backup approach).

---

## 10. Suggested build order

Roughly the order that minimizes rework:

1. Project scaffold: Express + TypeScript backend, Vite + React + TS
   frontend, SQLite schema migrations, Dockerfile.
2. CSV import pipeline (§4) + transactions list view (read-only first).
3. Categories CRUD + manual categorization in the transaction list.
4. Category rules CRUD + rule application on import + rule preview.
5. Month view dashboard with category breakdown (no budgets yet — just
   spending).
6. Budgets CRUD + budget-vs-actual in month view.
7. All-time view: balance chart + category trends.
8. Recurring expense detection (§6) + recurring expenses page.
9. Rule auto-suggestion (§5.2) — last, since it's the most heuristic-heavy
   and least essential piece.
10. Auth/password gate, Docker packaging, deploy to home server.

---

## 11. Sample data note

A real 6-month CSV export (485 transactions, Jan–Jun 2026) was used to
validate the assumptions in this document, including: transaction type
variety, the ~65% empty-counterparty rate on card payments, the unreliable
`Volgnummer` field, the one observed rejected-transaction case, and decimal
amount formatting. Use this same export (or a similarly-shaped one) as a
fixture for development and testing rather than synthetic data — the real
export surfaces edge cases (empty fields, free-text merchant parsing,
rejected transactions) that synthetic test data tends to gloss over.
