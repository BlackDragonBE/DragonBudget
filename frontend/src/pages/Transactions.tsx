import { useEffect, useState } from 'react';
import { api } from '../api';
import { euros, shortDate } from '../format';
import { useCategories } from '../useCategories';
import type { Tx, TxPage } from '../types';

export default function Transactions() {
  const { categories } = useCategories();
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TxPage | null>(null);
  const [error, setError] = useState('');

  function setFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (month) params.set('month', month);
    if (status) params.set('status', status);
    if (category) params.set('category_id', category);
    params.set('page', String(page));
    api<TxPage>(`/transactions?${params}`).then(setData).catch((e) => setError(e.message));
  }, [q, month, status, category, page]);

  async function assign(txId: number, categoryId: number | null) {
    const updated = await api<Tx>(`/transactions/${txId}`, {
      method: 'PATCH',
      body: JSON.stringify({ category_id: categoryId }),
    });
    setData((d) => (d ? { ...d, transactions: d.transactions.map((t) => (t.id === txId ? updated : t)) } : d));
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Transactions</h2>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setFilter(() => setQ(e.target.value))}
          placeholder="Search details, merchant, message…"
          className="min-w-50 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          type="month"
          value={month}
          onChange={(e) => setFilter(() => setMonth(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setFilter(() => setCategory(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setFilter(() => setStatus(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Merchant / details</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.transactions.map((t) => (
              <tr
                key={t.id}
                className={`border-t border-slate-100 ${t.status === 'rejected' ? 'bg-slate-50 text-slate-400' : ''}`}
              >
                <td className="whitespace-nowrap px-3 py-2 align-top">{shortDate(t.execution_date)}</td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">
                    {t.counterparty_name || t.transaction_type}
                    {t.status === 'rejected' && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                        rejected
                      </span>
                    )}
                  </div>
                  <div className="max-w-xl truncate text-xs text-slate-400">{t.details}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={t.category_id ?? ''}
                    onChange={(e) => assign(t.id, e.target.value ? Number(e.target.value) : null)}
                    className="max-w-40 rounded border border-slate-200 px-2 py-1 text-sm"
                  >
                    <option value="">— uncategorized —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right align-top font-medium ${
                    t.status === 'rejected' ? '' : t.amount_cents < 0 ? 'text-slate-900' : 'text-green-700'
                  }`}
                >
                  {euros(t.amount_cents)}
                </td>
              </tr>
            ))}
            {data && data.transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                  No transactions. Import a CSV to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{data.total} transactions</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
