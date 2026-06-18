import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { SCHEMA } from './schema';
import { seedCategories } from './seed';

export type DB = DatabaseSync;

// Open a DB at `file` (':memory:' for tests), apply schema, seed defaults.
export function createDb(file: string): DB {
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL');
  conn.exec('PRAGMA foreign_keys = ON');
  conn.exec(SCHEMA);

  // Migration: add rollover to categories if missing
  const catInfo = conn.prepare('PRAGMA table_info(categories)').all() as { name: string }[];
  if (!catInfo.some((c) => c.name === 'rollover'))
    conn.exec('ALTER TABLE categories ADD COLUMN rollover INTEGER NOT NULL DEFAULT 0');

  // Migration: add match_type to rule_suggestions if missing (DESIGN.md §5.2 upgrade)
  const info = conn.prepare('PRAGMA table_info(rule_suggestions)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'match_type')) {
    conn.exec("ALTER TABLE rule_suggestions ADD COLUMN match_type TEXT NOT NULL DEFAULT 'contains'");
  }

  // Migration: add is_transfer to transactions if missing (roadmap 1.4)
  const txInfo = conn.prepare('PRAGMA table_info(transactions)').all() as { name: string }[];
  if (!txInfo.some((c) => c.name === 'is_transfer'))
    conn.exec('ALTER TABLE transactions ADD COLUMN is_transfer INTEGER NOT NULL DEFAULT 0');

  // Migration: add is_own_account to known_accounts if missing (roadmap 1.4 refinement)
  const kaInfo = conn.prepare('PRAGMA table_info(known_accounts)').all() as { name: string }[];
  if (!kaInfo.some((c) => c.name === 'is_own_account'))
    conn.exec('ALTER TABLE known_accounts ADD COLUMN is_own_account INTEGER NOT NULL DEFAULT 0');

  // Sync transfer flags on every startup so existing known_accounts take effect immediately.
  conn.exec(`UPDATE transactions SET is_transfer = CASE
    WHEN REPLACE(counterparty_account, ' ', '') IN (SELECT account_number FROM known_accounts WHERE is_own_account = 1)
    THEN 1 ELSE 0 END`);

  seedCategories(conn);
  return conn;
}

// Run fn inside a transaction; commit on success, roll back on throw.
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, 'budgeting.db');

// App-wide singleton connection.
export const db = createDb(DB_PATH);
