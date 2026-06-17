import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { applyRules, matchesRule, type MatchableTx } from '../categorize/rules';
import { listSuggestions, acceptSuggestion, dismissSuggestion } from '../categorize/suggest';

export const rulesRouter = Router();

// --- Auto-suggestions (§5.2). Registered before /:id routes (distinct paths). ---
rulesRouter.get('/suggestions', (_req, res) => res.json(listSuggestions(db)));

rulesRouter.post('/suggestions/:id/accept', (req, res) => {
  const result = acceptSuggestion(db, Number(req.params.id));
  if (!result) return res.status(404).json({ error: 'no pending suggestion' });
  res.json(result);
});

rulesRouter.post('/suggestions/:id/dismiss', (req, res) => {
  if (!dismissSuggestion(db, Number(req.params.id))) return res.status(404).json({ error: 'no pending suggestion' });
  res.json({ ok: true });
});

const RuleInput = z.object({
  category_id: z.number().int(),
  match_field: z.enum(['details', 'counterparty_name', 'message']),
  match_type: z.enum(['contains', 'equals', 'starts_with']),
  match_value: z.string().trim().min(1),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

const getRule = (id: number) =>
  db.prepare(`
    SELECT r.*, c.name AS category_name, c.icon AS category_icon
    FROM category_rules r LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.id = ?`).get(id);

const categoryExists = (id: number) => !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);

rulesRouter.get('/', (_req, res) => {
  res.json(
    db.prepare(`
      SELECT r.*, c.name AS category_name, c.icon AS category_icon
      FROM category_rules r LEFT JOIN categories c ON c.id = r.category_id
      ORDER BY r.priority DESC, r.id ASC`).all(),
  );
});

rulesRouter.post('/', (req, res) => {
  const p = RuleInput.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  if (!categoryExists(p.data.category_id)) return res.status(400).json({ error: 'unknown category' });
  const info = db
    .prepare(`INSERT INTO category_rules (category_id, match_field, match_type, match_value, priority, enabled)
              VALUES (?,?,?,?,?,?)`)
    .run(
      p.data.category_id, p.data.match_field, p.data.match_type, p.data.match_value,
      p.data.priority ?? 0, p.data.enabled === false ? 0 : 1,
    );
  applyRules(db);
  res.status(201).json(getRule(Number(info.lastInsertRowid)));
});

rulesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getRule(id)) return res.status(404).json({ error: 'not found' });
  const p = RuleInput.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  if (p.data.category_id !== undefined && !categoryExists(p.data.category_id)) {
    return res.status(400).json({ error: 'unknown category' });
  }
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  const d = p.data;
  if (d.category_id !== undefined) { sets.push('category_id = ?'); vals.push(d.category_id); }
  if (d.match_field !== undefined) { sets.push('match_field = ?'); vals.push(d.match_field); }
  if (d.match_type !== undefined) { sets.push('match_type = ?'); vals.push(d.match_type); }
  if (d.match_value !== undefined) { sets.push('match_value = ?'); vals.push(d.match_value); }
  if (d.priority !== undefined) { sets.push('priority = ?'); vals.push(d.priority); }
  if (d.enabled !== undefined) { sets.push('enabled = ?'); vals.push(d.enabled ? 1 : 0); }
  if (sets.length) db.prepare(`UPDATE category_rules SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  applyRules(db);
  res.json(getRule(id));
});

rulesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getRule(id)) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM category_rules WHERE id = ?').run(id);
  applyRules(db);
  res.status(204).end();
});

// POST /api/rules/preview { match_field, match_type, match_value } — show which
// existing transactions this (unsaved) rule would match, before committing it (§7.4).
const PreviewInput = RuleInput.pick({ match_field: true, match_type: true, match_value: true });

rulesRouter.post('/preview', (req, res) => {
  const p = PreviewInput.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const rows = db
    .prepare(`SELECT id, execution_date, amount_cents, counterparty_name, transaction_type, details, message
              FROM transactions ORDER BY execution_date DESC`)
    .all() as (MatchableTx & Record<string, unknown>)[];
  const matches = rows.filter((t) => matchesRule(t, p.data));
  res.json({ total: matches.length, sample: matches.slice(0, 100) });
});

// POST /api/rules/apply { recategorize_all? } — re-run rules over the dataset.
rulesRouter.post('/apply', (req, res) => {
  const recategorizeAll = req.body?.recategorize_all === true;
  res.json({ updated: applyRules(db, { recategorizeAll }) });
});
