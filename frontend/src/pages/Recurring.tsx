import { useEffect, useState } from 'react';
import { api } from '../api';
import { euros, shortDate } from '../format';
import { useCategories } from '../useCategories';
import type { RecurringExpense } from '../types';

const STATUS_BADGE: Record<string, string> = {
  detected: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  dismissed: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

export default function Recurring() {
  const { categories } = useCategories();
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [msg, setMsg] = useState('');

  const reload = () => api<RecurringExpense[]>('/recurring').then(setItems);
  useEffect(() => { reload(); }, []);

  async function redetect() {
    const { detected } = await api<{ detected: number }>('/recurring/detect', { method: 'POST', body: '{}' });
    setMsg(`Detection complete: ${detected} recurring pattern(s).`);
    reload();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recurring expenses</h2>
        <button onClick={redetect} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
          Re-detect
        </button>
      </div>
      {msg && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{msg}</p>}
      {items.length === 0 && (
        <p className="rounded border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
          No recurring expenses detected yet. Import transactions or click Re-detect.
        </p>
      )}
      <div className="space-y-3">
        {items.map((r) => (
          <Card key={r.id} item={r} categories={categories} onChange={reload} />
        ))}
      </div>
    </div>
  );
}

function Card({
  item,
  categories,
  onChange,
}: {
  item: RecurringExpense;
  categories: { id: number; name: string; icon: string | null }[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const patch = (body: Record<string, unknown>) =>
    api(`/recurring/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(onChange);

  return (
    <div className={`rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${item.status === 'dismissed' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            key={`label-${item.label}`}
            defaultValue={item.label}
            onBlur={(e) => e.target.value.trim() && e.target.value !== item.label && patch({ label: e.target.value })}
            className="rounded border border-transparent px-1 py-0.5 font-medium hover:border-slate-200 focus:border-slate-300 dark:bg-transparent dark:text-slate-100 dark:hover:border-slate-700 dark:focus:border-slate-600"
          />
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}>{item.status}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-400">{item.frequency}</span>
        </div>
        <span className="text-lg font-semibold">{euros(item.expected_amount_cents)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Last seen: {shortDate(item.last_seen_date)}</span>
        <span>Next expected: {shortDate(item.next_expected_date)}</span>
        <span>{item.occurrences ?? item.transactions.length} occurrence(s)</span>
        <button onClick={() => setOpen((o) => !o)} className="text-slate-600 underline dark:text-slate-400">
          {open ? 'Hide' : 'Show'} transactions
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={item.category_id ?? ''}
          onChange={(e) => patch({ category_id: e.target.value ? Number(e.target.value) : null })}
          className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        {item.status !== 'confirmed' && (
          <button onClick={() => patch({ status: 'confirmed' })} className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white">
            Confirm
          </button>
        )}
        {item.status !== 'dismissed' ? (
          <button onClick={() => patch({ status: 'dismissed' })} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Dismiss
          </button>
        ) : (
          <button onClick={() => patch({ status: 'detected' })} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Restore
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2 text-sm dark:divide-slate-800 dark:border-slate-800">
          {item.transactions.map((t) => (
            <li key={t.id} className="flex justify-between gap-2 py-1">
              <span className="text-slate-500">{shortDate(t.execution_date)} · {t.counterparty_name || t.details.slice(0, 40)}</span>
              <span>{euros(t.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
