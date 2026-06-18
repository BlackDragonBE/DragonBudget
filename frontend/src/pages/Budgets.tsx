import { useEffect, useState } from 'react';
import { api } from '../api';
import { euros, thisMonth, prevMonth } from '../format';
import { useCategories } from '../useCategories';
import type { MonthReport } from '../types';

export default function Budgets() {
  const { categories } = useCategories();
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState<MonthReport | null>(null);
  const [msg, setMsg] = useState('');

  const load = () => api<MonthReport>(`/reports/month?month=${month}`).then(setReport);
  useEffect(() => { load(); setMsg(''); }, [month]);

  // category_id -> { spent_cents, limit_cents }
  const byCat = new Map(report?.categories.map((c) => [c.category_id, c]) ?? []);
  const expenseCategories = categories.filter((c) => !c.is_income);
  const totalLimit = expenseCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.limit_cents ?? 0), 0);
  const totalSpent = expenseCategories.reduce((sum, c) => sum + Math.abs(byCat.get(c.id)?.spent_cents ?? 0), 0);

  async function setLimit(categoryId: number, euroStr: string) {
    const limit_cents = Math.round((parseFloat(euroStr.replace(',', '.')) || 0) * 100);
    await api('/budgets', { method: 'PUT', body: JSON.stringify({ category_id: categoryId, month, limit_cents }) });
    load();
  }

  async function copyPrev() {
    const { copied } = await api<{ copied: number }>('/budgets/copy', {
      method: 'POST',
      body: JSON.stringify({ from_month: prevMonth(month), to_month: month }),
    });
    setMsg(copied ? `Copied ${copied} budget(s) from ${prevMonth(month)}.` : `No budgets in ${prevMonth(month)} to copy.`);
    load();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Budgets</h2>
        <div className="flex gap-2">
          <button onClick={copyPrev} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Copy from {prevMonth(month)}
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {msg && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}

      <div className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          <span className="flex-1">Category</span>
          <span className="w-24 text-right">Spent</span>
          <span className="w-28 text-right">Monthly limit (€)</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-sm font-medium">
          <span className="flex-1 text-slate-700">Total</span>
          <span className={`w-24 text-right ${totalSpent > totalLimit && totalLimit > 0 ? 'text-red-600' : 'text-slate-700'}`}>
            {euros(totalSpent)}
          </span>
          <span className="w-28 text-right text-slate-700">{totalLimit > 0 ? euros(totalLimit) : '—'}</span>
        </div>
        {expenseCategories.map((c) => {
          const row = byCat.get(c.id);
          const spent = Math.abs(row?.spent_cents ?? 0);
          const over = row?.limit_cents != null && spent > row.limit_cents;
          return (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1">{c.icon} {c.name}</span>
              <span className={`w-24 text-right ${over ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                {euros(spent)}
              </span>
              <input
                key={`${c.id}-${month}`}
                type="number"
                step="0.01"
                min="0"
                defaultValue={row?.limit_cents != null ? (row.limit_cents / 100).toFixed(2) : ''}
                onBlur={(e) => setLimit(c.id, e.target.value)}
                placeholder="—"
                className="w-28 rounded border border-slate-300 px-2 py-1 text-right"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
