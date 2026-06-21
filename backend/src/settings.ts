import type { DB } from './db';

/** Read a setting value, or null if unset. */
export function getSetting(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

/** Upsert a setting. Pass null to store an explicit empty value. */
export function setSetting(db: DB, key: string, value: string | null): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
