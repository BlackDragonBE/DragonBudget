import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db';

export const budgetsRouter = Router();

const MONTH = z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM');
const BudgetInput = z.object({ category_id: z.number().int(), month: MONTH, limit_cents: z.number().int().min(0) });
const CopyInput = z.object({ from_month: MONTH, to_month: MONTH });

const upsert = db.prepare(`
  INSERT INTO budgets (category_id, month, limit_cents) VALUES (?,?,?)
  ON CONFLICT(category_id, month) DO UPDATE SET limit_cents = excluded.limit_cents`);

// GET /api/budgets?month=YYYY-MM
budgetsRouter.get('/', (req, res) => {
  const month = String(req.query.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  res.json(
    db.prepare(`
      SELECT b.*, c.name AS category_name, c.icon AS category_icon
      FROM budgets b JOIN categories c ON c.id = b.category_id
      WHERE b.month = ? ORDER BY c.name`).all(month),
  );
});

// PUT /api/budgets { category_id, month, limit_cents } — upsert; 0 clears the budget.
budgetsRouter.put('/', (req, res) => {
  const p = BudgetInput.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { category_id, month, limit_cents } = p.data;
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(category_id)) {
    return res.status(400).json({ error: 'unknown category' });
  }
  if (limit_cents === 0) {
    db.prepare('DELETE FROM budgets WHERE category_id = ? AND month = ?').run(category_id, month);
    return res.json({ category_id, month, limit_cents: 0 });
  }
  upsert.run(category_id, month, limit_cents);
  res.json(db.prepare('SELECT * FROM budgets WHERE category_id = ? AND month = ?').get(category_id, month));
});

// POST /api/budgets/copy { from_month, to_month }
budgetsRouter.post('/copy', (req, res) => {
  const p = CopyInput.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const rows = db
    .prepare('SELECT category_id, limit_cents FROM budgets WHERE month = ?')
    .all(p.data.from_month) as { category_id: number; limit_cents: number }[];
  tx(db, () => {
    for (const r of rows) upsert.run(r.category_id, p.data.to_month, r.limit_cents);
  });
  res.json({ copied: rows.length });
});
