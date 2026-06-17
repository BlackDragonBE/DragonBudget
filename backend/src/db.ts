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

  // Migration: add match_type to rule_suggestions if missing (DESIGN.md §5.2 upgrade)
  const info = conn.prepare('PRAGMA table_info(rule_suggestions)').all() as { name: string }[];
  if (!info.some((c) => c.name === 'match_type')) {
    conn.exec("ALTER TABLE rule_suggestions ADD COLUMN match_type TEXT NOT NULL DEFAULT 'contains'");
  }

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
