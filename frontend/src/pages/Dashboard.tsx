import { useEffect, useState } from 'react';
import { api } from '../api';
import { euros } from '../format';
import { useCategories } from '../useCategories';
import type { MonthReport } from '../types';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Dashboard() {
  const { categories } = useCategories();
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState<MonthReport | null>(null);

  const load = () => api<MonthReport>(`/reports/month?month=${month}`).then(setReport);
  useEffect(() => { load(); }, [month]);

  async function assign(txId: number, categoryId: number | null) {
    await api(`/transactions/${txId}`, { method: 'PATCH', body: JSON.stringify({ category_id: categoryId }) });
    load();
  }

  const expenseCats = (report?.categories ?? []).filter((c) => c.spent_cents < 0);
  const maxSpend = Math.max(1, ...expenseCats.map((c) => Math.abs(c.spent_cents)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Month overview</h2>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Income" value={euros(report?.income_cents ?? 0)} tone="text-green-700" />
        <Stat label="Expenses" value={euros(Math.abs(report?.expense_cents ?? 0))} tone="text-slate-900" />
        <Stat
          label="Net"
          value={euros(report?.net_cents ?? 0)}
          tone={(report?.net_cents ?? 0) < 0 ? 'text-red-600' : 'text-green-700'}
        />
      </div>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-600">Spending by category</h3>
        {expenseCats.length === 0 && <p className="text-sm text-slate-400">No spending this month.</p>}
        <div className="space-y-2">
          {expenseCats.map((c) => {
            const amount = Math.abs(c.spent_cents);
            const limit = c.limit_cents ?? null;
            const over = limit != null && amount > limit;
            const pct = limit != null ? Math.min(100, (amount / limit) * 100) : (amount / maxSpend) * 100;
            return (
              <div key={c.category_id} className="text-sm">
                <div className="flex justify-between">
                  <span>{c.icon} {c.name} <span className="text-slate-400">· {c.txn_count}</span></span>
                  <span className="font-medium">
                    {euros(amount)}
                    {limit != null && <span className="font-normal text-slate-400"> / {euros(limit)}</span>}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded"
                    style={{ width: `${pct}%`, backgroundColor: over ? '#dc2626' : c.color ?? '#64748b' }}
                  />
                </div>
                {over && <div className="mt-0.5 text-xs text-red-600">Over budget by {euros(amount - limit!)}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-600">
          Uncategorized this month {report ? `(${report.uncategorized.length})` : ''}
        </h3>
        {report && report.uncategorized.length === 0 && (
          <p className="text-sm text-slate-400">All transactions categorized 🎉</p>
        )}
        <div className="divide-y divide-slate-100">
          {report?.uncategorized.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="w-24 shrink-0 text-slate-400">{t.execution_date}</span>
              <span className="min-w-40 flex-1 truncate">{t.counterparty_name || t.details}</span>
              <span className="w-24 text-right font-medium">{euros(t.amount_cents)}</span>
              <select
                defaultValue=""
                onChange={(e) => assign(t.id, e.target.value ? Number(e.target.value) : null)}
                className="rounded border border-slate-200 px-2 py-1 text-sm"
              >
                <option value="">Categorize…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
