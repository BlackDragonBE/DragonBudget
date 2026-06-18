import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';

export const categoriesRouter = Router();

const CategoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(16).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #RRGGBB hex').nullish(),
  is_income: z.boolean().optional(),
});
const CategoryPatch = CategoryInput.partial().extend({ archived: z.boolean().optional() });

const getCategory = (id: number) => db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

// GET /api/categories?include_archived=1
categoriesRouter.get('/', (req, res) => {
  const all = req.query.include_archived === '1';
  res.json(
    db.prepare(`
      SELECT c.*, COUNT(t.id) AS txn_count
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.status = 'accepted'
      ${all ? '' : 'WHERE c.archived = 0'}
      GROUP BY c.id
      ORDER BY c.archived, c.is_income DESC, c.name
    `).all(),
  );
});

categoriesRouter.post('/', (req, res) => {
  const p = CategoryInput.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  try {
    const info = db
      .prepare('INSERT INTO categories (name, icon, color, is_income) VALUES (?,?,?,?)')
      .run(p.data.name, p.data.icon || null, p.data.color || null, p.data.is_income ? 1 : 0);
    res.status(201).json(getCategory(Number(info.lastInsertRowid)));
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw e;
  }
});

categoriesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getCategory(id)) return res.status(404).json({ error: 'not found' });
  const p = CategoryPatch.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  const d = p.data;
  if (d.name !== undefined) { sets.push('name = ?'); vals.push(d.name); }
  if (d.icon !== undefined) { sets.push('icon = ?'); vals.push(d.icon || null); }
  if (d.color !== undefined) { sets.push('color = ?'); vals.push(d.color || null); }
  if (d.is_income !== undefined) { sets.push('is_income = ?'); vals.push(d.is_income ? 1 : 0); }
  if (d.archived !== undefined) { sets.push('archived = ?'); vals.push(d.archived ? 1 : 0); }
  if (!sets.length) return res.json(getCategory(id));

  try {
    db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw e;
  }
  res.json(getCategory(id));
});

categoriesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getCategory(id)) return res.status(404).json({ error: 'not found' });
  const { txn_count } = db.prepare(
    `SELECT COUNT(*) AS txn_count FROM transactions WHERE category_id = ?`,
  ).get(id) as { txn_count: number };
  if (txn_count > 0) {
    return res.status(409).json({ error: `Cannot delete: ${txn_count} transaction(s) use this category. Archive it instead.` });
  }
  db.prepare('DELETE FROM category_rules WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM budgets WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM rule_suggestions WHERE category_id = ?').run(id);
  db.prepare('UPDATE recurring_expenses SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.status(204).end();
});
