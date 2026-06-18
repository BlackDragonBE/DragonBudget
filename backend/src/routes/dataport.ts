import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { DB } from '../db';

export const dataportRouter = Router();

// --- Pure functions (take db) so they're unit-testable; handlers below are thin wrappers. ---

/** All transactions + category_name (not id) so they re-import across DBs. */
export function exportTransactions(db: DB) {
  return db.prepare(
    `SELECT t.*, c.name AS category_name
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     ORDER BY t.execution_date DESC, t.id DESC`
  ).all();
}

/** Categories + rules; rules carry category_name for portable re-import. */
export function exportConfig(db: DB) {
  const categories = db.prepare('SELECT * FROM categories').all();
  const rules = db.prepare(
    `SELECT r.*, c.name AS category_name
     FROM category_rules r JOIN categories c ON c.id = r.category_id`
  ).all();
  return { categories, rules };
}

/** Upsert transactions by import_hash (idempotent); resolve category by name. */
export function importTransactionRows(db: DB, rows: TxRowT[]): { imported: number; total: number } {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO transactions
     (import_hash, execution_date, value_date, amount_cents, currency, account_number,
      transaction_type, counterparty_account, counterparty_name, message, details,
      status, rejection_reason, category_id, category_source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let imported = 0;
  const now = new Date().toISOString();
  for (const tx of rows) {
    let categoryId: number | null = null;
    if (tx.category_name) {
      const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(tx.category_name) as { id: number } | undefined;
      categoryId = cat?.id ?? null;
    }
    const r = stmt.run(
      tx.import_hash,
      tx.execution_date ?? null, tx.value_date ?? null,
      tx.amount_cents, tx.currency, tx.account_number, tx.transaction_type,
      tx.counterparty_account ?? null, tx.counterparty_name ?? null,
      tx.message ?? null, tx.details, tx.status, tx.rejection_reason ?? null,
      categoryId, categoryId ? 'manual' : null,
      tx.created_at ?? now,
    );
    if (r.changes > 0) imported++;
  }
  return { imported, total: rows.length };
}

/** Upsert categories by name, then insert rules skipping exact duplicates. */
export function importConfig(db: DB, body: ConfigBodyT): { categoriesImported: number; rulesImported: number } {
  let categoriesImported = 0;
  for (const cat of body.categories) {
    const r = db.prepare(
      'INSERT OR IGNORE INTO categories (name, icon, color, is_income) VALUES (?, ?, ?, ?)'
    ).run(cat.name, cat.icon ?? null, cat.color ?? null, cat.is_income ?? 0);
    if (r.changes > 0) categoriesImported++;
  }

  let rulesImported = 0;
  for (const rule of body.rules) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(rule.category_name) as { id: number } | undefined;
    if (!cat) continue;
    const exists = db.prepare(
      'SELECT 1 FROM category_rules WHERE category_id = ? AND match_field = ? AND match_type = ? AND match_value = ?'
    ).get(cat.id, rule.match_field, rule.match_type, rule.match_value);
    if (exists) continue;
    db.prepare(
      `INSERT INTO category_rules (category_id, match_field, match_type, match_value, priority, enabled, created_from_suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(cat.id, rule.match_field, rule.match_type, rule.match_value,
      rule.priority ?? 0, rule.enabled ?? 1, rule.created_from_suggestion ?? 0);
    rulesImported++;
  }

  return { categoriesImported, rulesImported };
}

// --- Routes ---

dataportRouter.get('/export/transactions', (_req, res) => res.json(exportTransactions(db)));
dataportRouter.get('/export/config', (_req, res) => res.json(exportConfig(db)));

// POST /api/import/transactions — upserts by import_hash; resolves category by name
const TxRow = z.object({
  import_hash: z.string(),
  execution_date: z.string().nullable().optional(),
  value_date: z.string().nullable().optional(),
  amount_cents: z.number().int(),
  currency: z.string().default('EUR'),
  account_number: z.string(),
  transaction_type: z.string(),
  counterparty_account: z.string().nullable().optional(),
  counterparty_name: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  details: z.string(),
  status: z.string(),
  rejection_reason: z.string().nullable().optional(),
  category_name: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
type TxRowT = z.infer<typeof TxRow>;

dataportRouter.post('/import/transactions', (req, res) => {
  const parsed = z.array(TxRow).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(importTransactionRows(db, parsed.data));
});

// POST /api/import/config — upserts categories by name, skips duplicate rules
const ConfigBody = z.object({
  categories: z.array(z.object({
    name: z.string(),
    icon: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    is_income: z.number().int().optional(),
    archived: z.number().int().optional(),
  })),
  rules: z.array(z.object({
    category_name: z.string(),
    match_field: z.string(),
    match_type: z.string(),
    match_value: z.string(),
    priority: z.number().int().optional(),
    enabled: z.number().int().optional(),
    created_from_suggestion: z.number().int().optional(),
  })),
});
type ConfigBodyT = z.infer<typeof ConfigBody>;

dataportRouter.post('/import/config', (req, res) => {
  const parsed = ConfigBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json(importConfig(db, parsed.data));
});
