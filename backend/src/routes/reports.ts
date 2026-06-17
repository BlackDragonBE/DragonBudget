import { Router } from 'express';
import { db } from '../db';
import { monthReport, balanceHistory, categoryTrends } from '../reports';

export const reportsRouter = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

// Validate an optional query param against `re`. Absent => undefined (ok).
function optParam(v: unknown, re: RegExp): { ok: true; value?: string } | { ok: false } {
  if (v == null || v === '') return { ok: true };
  const s = String(v);
  return re.test(s) ? { ok: true, value: s } : { ok: false };
}

// GET /api/reports/month?month=YYYY-MM
reportsRouter.get('/month', (req, res) => {
  const month = String(req.query.month ?? '');
  if (!MONTH.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  res.json(monthReport(db, month));
});

// GET /api/reports/balance-history?from=YYYY-MM-DD&to=YYYY-MM-DD&start_cents=&current_cents=
reportsRouter.get('/balance-history', (req, res) => {
  const from = optParam(req.query.from, DATE);
  const to = optParam(req.query.to, DATE);
  if (!from.ok || !to.ok) return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
  res.json(balanceHistory(db, {
    from: from.value,
    to: to.value,
    startCents: req.query.start_cents ? Number(req.query.start_cents) : undefined,
    currentCents: req.query.current_cents ? Number(req.query.current_cents) : undefined,
  }));
});

// GET /api/reports/category-trends?from=YYYY-MM&to=YYYY-MM
reportsRouter.get('/category-trends', (req, res) => {
  const from = optParam(req.query.from, MONTH);
  const to = optParam(req.query.to, MONTH);
  if (!from.ok || !to.ok) return res.status(400).json({ error: 'from/to must be YYYY-MM' });
  res.json(categoryTrends(db, { from: from.value, to: to.value }));
});
