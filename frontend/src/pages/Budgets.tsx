import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  useEffect(() => { setReport(null); load(); setMsg(''); }, [month]);

  // category_id -> { spent_cents, limit_cents }
  const byCat = new Map(report?.categories.map((c) => [c.category_id, c]) ?? []);
  const expenseCategories = categories.filter((c) => !c.is_income);
  const incomeCategories = categories.filter((c) => (byCat.get(c.id)?.spent_cents ?? 0) > 0);
  const totalLimit = expenseCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.limit_cents ?? 0), 0);
  const totalSpent = expenseCategories.reduce((sum, c) => sum + Math.abs(byCat.get(c.id)?.spent_cents ?? 0), 0);
  const totalIncomeLimit = incomeCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.limit_cents ?? 0), 0);
  const totalIncome = incomeCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.spent_cents ?? 0), 0);

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
    <div className="max-w-5xl space-y-4">
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Income — top on narrow, right on wide */}
        <div className="order-first divide-y divide-slate-100 rounded border border-slate-200 bg-white lg:order-last lg:w-72 lg:shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
            <span className="flex-1">Income</span>
            <span className="w-24 text-right">Received</span>
            <span className="w-28 text-right">Expected (€)</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-sm font-medium">
            <span className="flex-1 text-slate-700">Total</span>
            <span className="w-24 text-right text-green-700">{euros(totalIncome)}</span>
            <span className="w-28 text-right text-slate-700">{totalIncomeLimit > 0 ? euros(totalIncomeLimit) : '—'}</span>
          </div>
          {incomeCategories.map((c) => {
            const row = byCat.get(c.id);
            const received = row?.spent_cents ?? 0;
            return (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Link to={`/transactions?month=${month}&category_id=${c.id}&direction=income`} className="flex-1 rounded hover:bg-slate-50">{c.icon} {c.name}</Link>
                <span className="w-24 text-right text-green-700">{euros(received)}</span>
                <input
                  key={`${c.id}-${month}-${report ? 'y' : 'n'}`}
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

        {/* Expenses — bottom on narrow, left on wide */}
        <div className="order-last min-w-0 flex-1 divide-y divide-slate-100 rounded border border-slate-200 bg-white lg:order-first">
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
                <Link to={`/transactions?month=${month}&category_id=${c.id}&direction=expense`} className="flex-1 rounded hover:bg-slate-50">{c.icon} {c.name}</Link>
                <span className={`w-24 text-right ${over ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                  {euros(spent)}
                </span>
                <input
                  key={`${c.id}-${month}-${report ? 'y' : 'n'}`}
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
    </div>
  );
}
