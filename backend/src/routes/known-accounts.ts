import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { detectTransfers } from '../transfers';

export const knownAccountsRouter = Router();

knownAccountsRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM known_accounts ORDER BY name').all());
});

const Body = z.object({ name: z.string().min(1), account_number: z.string().min(1), is_own_account: z.number().int().min(0).max(1).default(0) });

knownAccountsRouter.post('/', (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const normalized = p.data.account_number.replace(/\s+/g, '');
  try {
    const row = db.prepare('INSERT INTO known_accounts (name, account_number, is_own_account) VALUES (?, ?, ?) RETURNING *')
      .get(p.data.name, normalized, p.data.is_own_account);
    detectTransfers(db);
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: 'Account number already exists' });
  }
});

knownAccountsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM known_accounts WHERE id = ?').run(Number(req.params.id));
  detectTransfers(db);
  res.json({ ok: true });
});
