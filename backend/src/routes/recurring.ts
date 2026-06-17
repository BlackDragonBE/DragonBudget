import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { detectRecurring } from '../recurring/detect';

export const recurringRouter = Router();

const withTransactions = (id: number) =>
  db
    .prepare(`
      SELECT t.id, t.execution_date, t.amount_cents, t.counterparty_name, t.transaction_type, t.details
      FROM recurring_expense_transactions ret
      JOIN transactions t ON t.id = ret.transaction_id
      WHERE ret.recurring_expense_id = ?
      ORDER BY t.execution_date DESC`)
    .all(id);

const getRecurring = (id: number) => {
  const row = db
    .prepare(`
      SELECT r.*, c.name AS category_name, c.icon AS category_icon
      FROM recurring_expenses r LEFT JOIN categories c ON c.id = r.category_id
      WHERE r.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? { ...row, transactions: withTransactions(id) } : undefined;
};

// GET /api/recurring — detected first, then by soonest next_expected_date.
recurringRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT r.*, c.name AS category_name, c.icon AS category_icon,
             (SELECT COUNT(*) FROM recurring_expense_transactions ret WHERE ret.recurring_expense_id = r.id) AS occurrences
      FROM recurring_expenses r LEFT JOIN categories c ON c.id = r.category_id
      ORDER BY CASE r.status WHEN 'detected' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, r.next_expected_date`)
    .all() as { id: number }[];
  res.json(rows.map((r) => ({ ...r, transactions: withTransactions(r.id) })));
});

const PatchInput = z.object({
  status: z.enum(['detected', 'confirmed', 'dismissed']).optional(),
  label: z.string().trim().min(1).optional(),
  category_id: z.number().int().nullable().optional(),
});

recurringRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM recurring_expenses WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const p = PatchInput.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  if (p.data.category_id != null && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(p.data.category_id)) {
    return res.status(400).json({ error: 'unknown category' });
  }
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (p.data.status !== undefined) { sets.push('status = ?'); vals.push(p.data.status); }
  if (p.data.label !== undefined) { sets.push('label = ?'); vals.push(p.data.label); }
  if (p.data.category_id !== undefined) { sets.push('category_id = ?'); vals.push(p.data.category_id); }
  if (sets.length) db.prepare(`UPDATE recurring_expenses SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json(getRecurring(id));
});

// POST /api/recurring/detect — manually re-run detection.
recurringRouter.post('/detect', (_req, res) => {
  res.json(detectRecurring(db));
});
