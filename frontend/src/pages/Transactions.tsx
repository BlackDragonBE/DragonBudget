import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { euros, shortDate } from '../format';
import { useCategories } from '../useCategories';
import type { Tx, TxPage } from '../types';
import { TxDetailModal } from '../components/TxDetailModal';

const SS_KEY = 'tx_filters';

function loadFilters(sp: URLSearchParams) {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? 'null'); } catch { return null; } })();
  return {
    q:         sp.get('q')          ?? saved?.q         ?? '',
    month:     sp.get('month')      ?? saved?.month      ?? '',
    from:      sp.get('from')       ?? saved?.from       ?? '',
    to:        sp.get('to')         ?? saved?.to         ?? '',
    status:    sp.get('status')     ?? saved?.status     ?? '',
    category:  sp.get('category_id')?? saved?.category   ?? '',
    direction: sp.get('direction')  ?? saved?.direction  ?? '',
    sort:      saved?.sort  ?? 'date',
    order:     saved?.order ?? 'desc',
    page:      saved?.page  ?? 1,
  };
}

export default function Transactions() {
  const { categories } = useCategories();
  const [sp] = useSearchParams();
  const init = loadFilters(sp);
  const [q, setQ] = useState(init.q);
  const [qDebounced, setQDebounced] = useState(init.q);
  const [month, setMonth] = useState(init.month);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [status, setStatus] = useState(init.status);
  const [category, setCategory] = useState(init.category);
  const [direction, setDirection] = useState(init.direction);
  const [sort, setSort] = useState(init.sort);
  const [order, setOrder] = useState<'asc' | 'desc'>(init.order);
  const [page, setPage] = useState<number>(init.page);
  const [data, setData] = useState<TxPage | null>(null);
  const [error, setError] = useState('');
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCat, setBulkCat] = useState('');
  const [refresh, setRefresh] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // '/' focuses search (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function setFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  const anyFilter = !!(q || month || from || to || status || category || direction);
  const csvHref = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (month) p.set('month', month);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (status) p.set('status', status);
    if (category) p.set('category_id', category);
    if (direction) p.set('direction', direction);
    p.set('sort', sort);
    p.set('order', order);
    return `/api/transactions/export/csv?${p}`;
  }, [q, month, from, to, status, category, direction, sort, order]);

  function clearFilters() {
    setQ(''); setMonth(''); setFrom(''); setTo(''); setStatus(''); setCategory(''); setDirection('');
    setPage(1);
  }

  useEffect(() => {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ q, month, from, to, status, category, direction, sort, order, page }));
  }, [q, month, from, to, status, category, direction, sort, order, page]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (qDebounced) params.set('q', qDebounced);
    if (month) params.set('month', month);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    if (category) params.set('category_id', category);
    if (direction) params.set('direction', direction);
    params.set('sort', sort);
    params.set('order', order);
    params.set('page', String(page));
    api<TxPage>(`/transactions?${params}`).then(setData).catch((e) => setError(e.message));
  }, [qDebounced, month, from, to, status, category, direction, sort, order, page, refresh]);

  // Selection doesn't survive a page/filter change — the visible rows do change.
  useEffect(() => setSelected(new Set()), [qDebounced, month, from, to, status, category, direction, page, refresh]);

  async function assign(txId: number, categoryId: number | null) {
    // Optimistic: reflect the pick immediately, revert on failure (api() toasts the error).
    const prev = data;
    const cat = categories.find((c) => c.id === categoryId);
    setData((d) => (d ? { ...d, transactions: d.transactions.map((t) => (t.id === txId
      ? { ...t, category_id: categoryId, category_name: cat?.name ?? null, category_icon: cat?.icon ?? null }
      : t)) } : d));
    try {
      const updated = await api<Tx>(`/transactions/${txId}`, {
        method: 'PATCH',
        body: JSON.stringify({ category_id: categoryId }),
      });
      setData((d) => (d ? { ...d, transactions: d.transactions.map((t) => (t.id === txId ? updated : t)) } : d));
    } catch {
      setData(prev);
    }
  }

  function toggleSelect(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (!selected.size) return;
    await api(`/transactions/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ ids: [...selected], category_id: bulkCat ? Number(bulkCat) : null }),
    });
    setRefresh((r) => r + 1);
  }

  async function saveNote(txId: number, note: string | null) {
    const updated = await api<Tx>(`/transactions/${txId}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes: note }),
    });
    setData((d) => (d ? { ...d, transactions: d.transactions.map((t) => (t.id === txId ? updated : t)) } : d));
    setSelectedTx((s) => (s?.id === txId ? updated : s));
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function toggleSort(col: string) {
    if (sort === col) setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else { setSort(col); setOrder('desc'); }
    setPage(1);
  }
  function SortTh({ col, children, right }: { col: string; children: React.ReactNode; right?: boolean }) {
    const active = sort === col;
    const arrow = active ? (order === 'desc' ? ' ↓' : ' ↑') : '';
    return (
      <th
        onClick={() => toggleSort(col)}
        className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-slate-700 dark:hover:text-slate-300${right ? ' text-right' : ''}`}
      >
        {children}{arrow && <span className="font-bold text-slate-900 dark:text-slate-100">{arrow}</span>}
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Transactions</h2>

      <div className="flex flex-wrap gap-2">
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setFilter(() => setQ(e.target.value))}
          placeholder="Search details, merchant, message…  ( / )"
          className="min-w-50 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          type="month"
          value={month}
          onChange={(e) => setFilter(() => setMonth(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          type="date"
          value={from}
          title="From date"
          aria-label="From date"
          onChange={(e) => setFilter(() => setFrom(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          type="date"
          value={to}
          title="To date"
          aria-label="To date"
          onChange={(e) => setFilter(() => setTo(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <select
          value={category}
          onChange={(e) => setFilter(() => setCategory(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
          value={direction}
          onChange={(e) => setFilter(() => setDirection(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Income & expense</option>
          <option value="income">Income only</option>
          <option value="expense">Expense only</option>
        </select>
        <select
          value={status}
          onChange={(e) => setFilter(() => setStatus(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
        {anyFilter && (
          <button
            onClick={clearFilters}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Clear filters
          </button>
        )}
        <a
          href={csvHref}
          download="transactions.csv"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Export CSV
        </a>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-950">
          <span className="font-medium text-blue-800 dark:text-blue-200">{selected.size} selected</span>
          <select
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">— uncategorized —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <button
            onClick={applyBulk}
            className="rounded bg-slate-900 px-3 py-1 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Apply
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded border border-slate-300 px-3 py-1 text-slate-600 dark:border-slate-600 dark:text-slate-300"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Mobile: card list (avoids horizontal scroll) */}
      <div className="space-y-2 sm:hidden">
        {data?.transactions.map((t) => (
          <div
            key={t.id}
            onClick={() => setSelectedTx(t)}
            className={`cursor-pointer rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${t.status === 'rejected' ? 'text-slate-400' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {t.counterparty_name || t.transaction_type}
                  {t.status === 'rejected' && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                      rejected
                    </span>
                  )}
                  {t.known_account_name && (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {t.known_account_name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{shortDate(t.execution_date)}</div>
                <div className="mt-0.5 truncate text-xs text-slate-400">{t.details}</div>
              </div>
              <span
                className={`whitespace-nowrap font-medium ${
                  t.status === 'rejected' ? '' : t.amount_cents < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-green-700'
                }`}
              >
                {euros(t.amount_cents)}
              </span>
            </div>
            <select
              value={t.category_id ?? ''}
              onChange={(e) => assign(t.id, e.target.value ? Number(e.target.value) : null)}
              onClick={(e) => e.stopPropagation()}
              className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">— uncategorized —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {data && data.transactions.length === 0 && (
          <p className="rounded border border-slate-200 bg-white px-3 py-8 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            No transactions. Import a CSV to get started.
          </p>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded border border-slate-200 bg-white sm:block dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={!!data?.transactions.length && data.transactions.every((t) => selected.has(t.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(data?.transactions.map((t) => t.id)) : new Set())
                  }
                />
              </th>
              <SortTh col="date">Date</SortTh>
              <SortTh col="counterparty">Merchant / details</SortTh>
              <th className="px-3 py-2 font-medium">Category</th>
              <SortTh col="amount" right>Amount</SortTh>
            </tr>
          </thead>
          <tbody>
            {data?.transactions.map((t) => (
              <tr
                key={t.id}
                onClick={() => setSelectedTx(t)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${t.status === 'rejected' ? 'bg-slate-50 text-slate-400 dark:bg-slate-800/60' : ''}`}
              >
                <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Select transaction"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">{shortDate(t.execution_date)}</td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">
                    {t.counterparty_name || t.transaction_type}
                    {t.status === 'rejected' && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                        rejected
                      </span>
                    )}
                    {t.is_transfer ? (
                      <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        transfer
                      </span>
                    ) : null}
                    {t.known_account_name && (
                      <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {t.known_account_name}
                      </span>
                    )}
                  </div>
                  <div className="max-w-xl truncate text-xs text-slate-400">
                    {t.details}
                    {t.notes && <span className="ml-1.5 text-slate-400" title={t.notes}>·</span>}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={t.category_id ?? ''}
                    onChange={(e) => assign(t.id, e.target.value ? Number(e.target.value) : null)}
                    onClick={(e) => e.stopPropagation()}
                    className="max-w-40 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                    t.status === 'rejected' || t.is_transfer ? 'text-slate-400 dark:text-slate-500' : t.amount_cents < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-green-700'
                  }`}
                >
                  {euros(t.amount_cents)}
                </td>
              </tr>
            ))}
            {data && data.transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  No transactions. Import a CSV to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>{data.total} transactions</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
            >
              Prev
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedTx && <TxDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} onSaveNote={(n) => saveNote(selectedTx.id, n)} />}
    </div>
  );
}
