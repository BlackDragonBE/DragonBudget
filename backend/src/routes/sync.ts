import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { getSetting, setSetting } from '../settings';
import { startJob, getJob, isRunning } from '../sync/job';

export const syncRouter = Router();

// These are login identifiers, not secrets (itsme on the phone is the real auth),
// so they're stored and returned in plaintext — same as account numbers shown in
// Settings → Accounts. The DB is already behind the auth gate + Tailscale.
function readSettings() {
  const gsm = getSetting(db, 'bank_gsm_number') ?? '';
  const client = getSetting(db, 'bank_client_number') ?? '';
  const accountLabel = getSetting(db, 'bank_account_label') ?? '';
  return { gsm, client, accountLabel, configured: !!(gsm && client && accountLabel) };
}

// GET /api/sync/settings
syncRouter.get('/settings', (_req, res) => res.json(readSettings()));

// PUT /api/sync/settings — save all three login fields.
const Settings = z.object({
  gsm: z.string().trim().max(40),
  client: z.string().trim().max(40),
  accountLabel: z.string().trim().max(120),
});
syncRouter.put('/settings', (req, res) => {
  const p = Settings.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  setSetting(db, 'bank_gsm_number', p.data.gsm || null);
  setSetting(db, 'bank_client_number', p.data.client || null);
  setSetting(db, 'bank_account_label', p.data.accountLabel || null);
  res.json(readSettings());
});

// POST /api/sync/start — kick off a background sync; 409 if one is already running.
syncRouter.post('/start', (_req, res) => {
  if (isRunning()) return res.status(409).json(getJob());
  try {
    res.json(startJob(db));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to start sync.' });
  }
});

// GET /api/sync/status — current job state for polling.
syncRouter.get('/status', (_req, res) => res.json(getJob()));
