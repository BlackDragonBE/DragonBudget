// Full v1 schema (DESIGN.md §3). Embedded as a string so no file-copy step is
// needed at build time. All booleans are INTEGER 0/1; all money is integer cents.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  icon      TEXT,
  color     TEXT,
  is_income INTEGER NOT NULL DEFAULT 0,
  archived  INTEGER NOT NULL DEFAULT 0,
  rollover  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  import_hash          TEXT NOT NULL UNIQUE,
  execution_date       TEXT,
  value_date           TEXT,
  amount_cents         INTEGER NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'EUR',
  account_number       TEXT NOT NULL,
  transaction_type     TEXT NOT NULL,
  counterparty_account TEXT,
  counterparty_name    TEXT,
  message              TEXT,
  details              TEXT NOT NULL,
  status               TEXT NOT NULL,
  rejection_reason     TEXT,
  category_id          INTEGER REFERENCES categories(id),
  category_source      TEXT,
  is_transfer          INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_value_date ON transactions(value_date);
CREATE INDEX IF NOT EXISTS idx_tx_exec_date  ON transactions(execution_date);
CREATE INDEX IF NOT EXISTS idx_tx_category   ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_status     ON transactions(status);

CREATE TABLE IF NOT EXISTS category_rules (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id             INTEGER NOT NULL REFERENCES categories(id),
  match_field             TEXT NOT NULL,
  match_type              TEXT NOT NULL,
  match_value             TEXT NOT NULL,
  priority                INTEGER NOT NULL DEFAULT 0,
  enabled                 INTEGER NOT NULL DEFAULT 1,
  created_from_suggestion INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  month       TEXT NOT NULL,
  limit_cents INTEGER NOT NULL,
  UNIQUE(category_id, month)
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  label                 TEXT NOT NULL,
  counterparty_key      TEXT NOT NULL,
  category_id           INTEGER REFERENCES categories(id),
  expected_amount_cents INTEGER NOT NULL,
  frequency             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'detected',
  next_expected_date    TEXT,
  last_seen_date        TEXT
);

CREATE TABLE IF NOT EXISTS recurring_expense_transactions (
  recurring_expense_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  transaction_id       INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (recurring_expense_id, transaction_id)
);

-- Auto-suggested category rules (§5.2). Generated when a manual categorization
-- reveals a repeated merchant token; user accepts (→ creates a real rule) or
-- dismisses (kept so it isn't re-suggested). One suggestion per token.
CREATE TABLE IF NOT EXISTS rule_suggestions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT NOT NULL UNIQUE,
  match_field TEXT NOT NULL,
  match_type  TEXT NOT NULL DEFAULT 'contains',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS known_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  account_number  TEXT NOT NULL UNIQUE,
  is_own_account  INTEGER NOT NULL DEFAULT 0
);
`;
