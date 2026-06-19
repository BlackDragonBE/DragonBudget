import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { euros, thisMonth, prevMonth } from '../format';
import { useCategories } from '../useCategories';
import type { MonthReport } from '../types';

export default function Budgets() {
  const { categories, reload } = useCategories();
  const [month, setMonth] = useState(() => localStorage.getItem('budgets-month') ?? thisMonth());
  const [report, setReport] = useState<MonthReport | null>(null);
  const [msg, setMsg] = useState('');

  const load = () => api<MonthReport>(`/reports/month?month=${month}`).then(setReport);
  useEffect(() => { setReport(null); load(); setMsg(''); }, [month]);

  async function toggleRollover(categoryId: number, current: number) {
    await api(`/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ rollover: !current }) });
    reload();
    load();
  }

  async function setGoal(categoryId: number, euroStr: string, date: string | null | undefined) {
    const goal_cents = euroStr ? Math.round((parseFloat(euroStr.replace(',', '.')) || 0) * 100) || null : null;
    await api(`/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ goal_cents, goal_date: date || null }),
    });
    reload();
    load();
  }

  // category_id -> { spent_cents, limit_cents }
  const byCat = new Map(report?.categories.map((c) => [c.category_id, c]) ?? []);
  const expenseCategories = categories.filter((c) => !c.is_income);
  const incomeCategories = categories.filter((c) => (byCat.get(c.id)?.spent_cents ?? 0) > 0);
  const totalLimit = expenseCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.limit_cents ?? 0), 0);
  const totalSpent = expenseCategories.reduce((sum, c) => sum + Math.max(0, -(byCat.get(c.id)?.spent_cents ?? 0)), 0);
  const totalIncomeLimit = incomeCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.limit_cents ?? 0), 0);
  const totalIncome = incomeCategories.reduce((sum, c) => sum + (byCat.get(c.id)?.spent_cents ?? 0), 0);
  const uncategorizedSpent = (report?.uncategorized ?? []).reduce((sum, t) => sum + Math.max(0, -t.amount_cents), 0);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Budgets</h2>
        <div className="flex gap-2">
          <button onClick={copyPrev} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Copy from {prevMonth(month)}
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); localStorage.setItem('budgets-month', e.target.value); }}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>
      {msg && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{msg}</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Income — top on narrow, right on wide */}
        <div className="order-first divide-y divide-slate-100 rounded border border-slate-200 bg-white lg:order-last lg:w-72 lg:shrink-0 dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <span className="flex-1">Income</span>
            <span className="w-24 text-right">Received</span>
            <span className="w-28 text-right">Expected (€)</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-sm font-medium dark:bg-slate-800">
            <span className="flex-1 text-slate-700 dark:text-slate-300">Total</span>
            <span className="w-24 text-right text-green-700">{euros(totalIncome)}</span>
            <span className="w-28 text-right text-slate-700 dark:text-slate-300">{totalIncomeLimit > 0 ? euros(totalIncomeLimit) : '—'}</span>
          </div>
          {incomeCategories.map((c) => {
            const row = byCat.get(c.id);
            const received = row?.spent_cents ?? 0;
            return (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Link to={`/transactions?month=${month}&category_id=${c.id}&direction=income`} className="flex-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">{c.icon} {c.name}</Link>
                <span className="w-24 text-right text-green-700">{euros(received)}</span>
                <input
                  key={`${c.id}-${month}-${report ? 'y' : 'n'}`}
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={row?.limit_cents != null ? (row.limit_cents / 100).toFixed(2) : ''}
                  onBlur={(e) => setLimit(c.id, e.target.value)}
                  placeholder="—"
                  className="w-28 rounded border border-slate-300 px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            );
          })}
        </div>

        {/* Expenses — bottom on narrow, left on wide */}
        <div className="order-last min-w-0 flex-1 divide-y divide-slate-100 rounded border border-slate-200 bg-white lg:order-first dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <span className="w-40 shrink-0">Category</span>
            <span className="flex-1" />
            <span className="w-24 text-right">Spent</span>
            <span className="w-28 text-right">Monthly limit (€)</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-sm font-medium dark:bg-slate-800">
            <span className="w-40 shrink-0 text-slate-700 dark:text-slate-300">Total</span>
            <div className="flex flex-1 items-center gap-1.5">
              <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                {totalLimit > 0 && (
                  <div
                    className={`h-2 rounded-full ${totalSpent > totalLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (totalSpent / totalLimit) * 100)}%` }}
                  />
                )}
              </div>
            </div>
            <span className={`w-24 text-right ${totalSpent > totalLimit && totalLimit > 0 ? 'text-red-600' : 'text-slate-700'}`}>
              {euros(totalSpent)}
            </span>
            <span className="w-28 text-right text-slate-700 dark:text-slate-300">{totalLimit > 0 ? euros(totalLimit) : '—'}</span>
          </div>
          {expenseCategories.map((c) => {
            const row = byCat.get(c.id);
            const spent = Math.max(0, -(row?.spent_cents ?? 0));
            const isRollover = !!(row?.rollover ?? c.rollover);
            // For rollover categories, compare against available (limit + carry); else limit.
            const budget = isRollover
              ? (row?.available_cents ?? row?.limit_cents ?? null)
              : (row?.limit_cents ?? null);
            const over = budget != null && spent > budget;
            const rawPct = budget != null && budget > 0 ? (spent / budget) * 100 : 0;
            const pct = Math.min(100, rawPct);
            const carried = row?.carried_in_cents;

            // Goal progress (only meaningful on rollover categories)
            const goalCents = row?.goal_cents ?? c.goal_cents ?? null;
            const goalDate = row?.goal_date ?? c.goal_date ?? null;
            const savedCents = isRollover ? (row?.available_cents ?? 0) : 0;
            const goalPct = goalCents && goalCents > 0 ? Math.min(100, (savedCents / goalCents) * 100) : null;
            const goalOver = goalCents != null && savedCents >= goalCents;

            let onTrackLabel: string | null = null;
            if (goalCents && !goalOver && goalDate && isRollover) {
              const [gy, gm] = goalDate.slice(0, 7).split('-').map(Number);
              const [cy, cm] = month.split('-').map(Number);
              const monthsLeft = (gy - cy) * 12 + (gm - cm);
              if (monthsLeft > 0) {
                const needed = Math.ceil((goalCents - savedCents) / monthsLeft);
                const limit = row?.limit_cents ?? 0;
                onTrackLabel = limit >= needed
                  ? `On track for ${goalDate.slice(0, 7)}`
                  : `Need ${euros(needed)}/mo for ${goalDate.slice(0, 7)}`;
              } else if (monthsLeft === 0) {
                onTrackLabel = 'Goal month reached';
              }
            }

            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Link to={`/transactions?month=${month}&category_id=${c.id}&direction=expense`} className="w-40 shrink-0 rounded hover:bg-slate-50 dark:hover:bg-slate-800">{c.icon} {c.name}</Link>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                      {budget != null && budget > 0 ? (
                        <div
                          className={`h-2 rounded-full transition-all ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      ) : null}
                    </div>
                    {budget != null && budget > 0 ? (
                      <span className="w-12 text-right text-xs text-slate-400">{Math.round(rawPct)}%</span>
                    ) : null}
                  </div>
                  {isRollover && carried != null && carried !== 0 && (
                    <span className={`text-xs ${carried > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      ↪ {carried > 0 ? '+' : ''}{euros(carried)} carried
                    </span>
                  )}
                  {goalCents != null && goalCents > 0 && isRollover && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={`h-1.5 rounded-full transition-all ${goalOver ? 'bg-blue-500' : 'bg-sky-400'}`}
                          style={{ width: `${goalPct ?? 0}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-slate-400">
                        {goalOver ? '✓ goal' : `${Math.round(goalPct ?? 0)}%`}
                      </span>
                    </div>
                  )}
                  {onTrackLabel && (
                    <span className="text-xs text-sky-500 dark:text-sky-400">{onTrackLabel}</span>
                  )}
                </div>
                <span className={`w-24 text-right ${over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {euros(spent)}
                </span>
                <div className="flex w-28 items-center gap-1">
                  <input
                    key={`${c.id}-${month}-${report ? 'y' : 'n'}`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={row?.limit_cents != null ? (row.limit_cents / 100).toFixed(2) : ''}
                    onBlur={(e) => setLimit(c.id, e.target.value)}
                    placeholder="—"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    title={isRollover ? 'Sinking fund on — click to disable' : 'Enable sinking fund (rollover)'}
                    onClick={() => toggleRollover(c.id, c.rollover)}
                    className={`shrink-0 rounded px-1 text-base leading-none transition-colors ${isRollover ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'}`}
                  >
                    ↺
                  </button>
                </div>
                {isRollover && (
                  <div className="flex w-full items-center gap-2 pl-[168px] text-xs text-slate-400">
                    <span>Goal:</span>
                    <input
                      key={`goal-${c.id}-${report ? 'y' : 'n'}`}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={goalCents != null ? (goalCents / 100).toFixed(2) : ''}
                      onBlur={(e) => setGoal(c.id, e.target.value, goalDate)}
                      placeholder="target €"
                      className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <input
                      key={`goaldate-${c.id}-${report ? 'y' : 'n'}`}
                      type="month"
                      defaultValue={goalDate?.slice(0, 7) ?? ''}
                      onBlur={(e) => setGoal(c.id, goalCents != null ? String(goalCents / 100) : '', e.target.value || null)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            );
          })}
          {uncategorizedSpent > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm">
              <Link to={`/transactions?month=${month}&category_id=none`} className="w-40 shrink-0 rounded text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Uncategorized</Link>
              <span className="flex-1" />
              <span className="w-24 text-right text-slate-600 dark:text-slate-400">{euros(uncategorizedSpent)}</span>
              <span className="w-28" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
