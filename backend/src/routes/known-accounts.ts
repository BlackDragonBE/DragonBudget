import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';

export const knownAccountsRouter = Router();

knownAccountsRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM known_accounts ORDER BY name').all());
});

const Body = z.object({ name: z.string().min(1), account_number: z.string().min(1) });

knownAccountsRouter.post('/', (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const normalized = p.data.account_number.replace(/\s+/g, '');
  try {
    const row = db.prepare('INSERT INTO known_accounts (name, account_number) VALUES (?, ?) RETURNING *')
      .get(p.data.name, normalized);
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: 'Account number already exists' });
  }
});

knownAccountsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM known_accounts WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});
