import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { maybeSuggestRule } from '../categorize/suggest';

export const transactionsRouter = Router();

const PAGE_SIZE = 50;

const TX_SELECT = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         ka.name AS known_account_name
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN known_accounts ka ON REPLACE(t.counterparty_account, ' ', '') = ka.account_number`;

const getTx = (id: number) => db.prepare(`${TX_SELECT} WHERE t.id = ?`).get(id);

// Whitelist sort/order query params to safe SQL fragments (raw string-interpolated
// into ORDER BY, so an unknown sort MUST fall back, never echo user input).
const SORT_COLS: Record<string, string> = {
  date: 't.execution_date', amount: 't.amount_cents', counterparty: 't.counterparty_name',
};
export function resolveSort(query: { sort?: unknown; order?: unknown }): { col: string; dir: 'ASC' | 'DESC' } {
  return {
    col: SORT_COLS[String(query.sort ?? '')] ?? 't.execution_date',
    dir: query.order === 'asc' ? 'ASC' : 'DESC',
  };
}

// GET /api/transactions?month=&category_id=&status=&q=&direction=&page=
// month filters on execution_date (YYYY-MM). category_id='none' => uncategorized.
// direction='income' => amount_cents > 0, 'expense' => amount_cents < 0.
transactionsRouter.get('/', (req, res) => {
  const where: string[] = [];
  const params: (string | number)[] = [];

  const month = req.query.month ? String(req.query.month) : '';
  if (/^\d{4}-\d{2}$/.test(month)) {
    where.push('substr(t.execution_date,1,7) = ?');
    params.push(month);
  }

  const category = req.query.category_id ? String(req.query.category_id) : '';
  if (category === 'none') where.push('t.category_id IS NULL');
  else if (category) { where.push('t.category_id = ?'); params.push(Number(category)); }

  const direction = req.query.direction ? String(req.query.direction) : '';
  if (direction === 'income') where.push('t.amount_cents > 0');
  else if (direction === 'expense') where.push('t.amount_cents < 0');

  const status = req.query.status ? String(req.query.status) : '';
  if (status === 'accepted' || status === 'rejected') { where.push('t.status = ?'); params.push(status); }

  const q = req.query.q ? String(req.query.q).trim() : '';
  if (q) {
    where.push('(t.details LIKE ? OR t.counterparty_name LIKE ? OR t.message LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { col: sortCol, dir: sortDir } = resolveSort(req.query);

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM transactions t ${whereSql}`).get(...params) as { n: number }).n;
  const transactions = db.prepare(`
    ${TX_SELECT}
    ${whereSql}
    ORDER BY ${sortCol} ${sortDir}, t.id ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...params, PAGE_SIZE, offset);

  res.json({ transactions, page, pageSize: PAGE_SIZE, total });
});

// DELETE /api/transactions — wipe all transactions and recurring entries.
transactionsRouter.delete('/', (_req, res) => {
  db.prepare('DELETE FROM recurring_expenses').run();
  db.prepare('DELETE FROM transactions').run();
  res.json({ ok: true });
});

// GET /api/transactions/:id
transactionsRouter.get('/:id', (req, res) => {
  const tx = getTx(Number(req.params.id));
  if (!tx) return res.status(404).json({ error: 'not found' });
  res.json(tx);
});

// PATCH /api/transactions/:id { category_id: number | null } — manual categorize.
// Always sets category_source='manual' (rules never overwrite this; §5.1/§5.3).
const PatchTx = z.object({ category_id: z.number().int().nullable() });

transactionsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const p = PatchTx.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'category_id must be a number or null' });

  if (p.data.category_id === null) {
    db.prepare('UPDATE transactions SET category_id = NULL, category_source = NULL WHERE id = ?').run(id);
  } else {
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(p.data.category_id)) {
      return res.status(400).json({ error: 'unknown category' });
    }
    db.prepare("UPDATE transactions SET category_id = ?, category_source = 'manual' WHERE id = ?").run(
      p.data.category_id, id,
    );
    maybeSuggestRule(db, id); // §5.2: repeated merchant token → suggest a rule
  }
  res.json(getTx(id));
});
