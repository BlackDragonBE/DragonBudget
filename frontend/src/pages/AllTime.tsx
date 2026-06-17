import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { api } from '../api';
import { euros } from '../format';
import type { BalancePoint, CategoryTrends } from '../types';

const PRESETS = [
  { v: '3m', label: 'Last 3 months', months: 3 },
  { v: '6m', label: 'Last 6 months', months: 6 },
  { v: '12m', label: 'Last 12 months', months: 12 },
  { v: 'ytd', label: 'Year to date', months: 0 },
  { v: 'all', label: 'All time', months: -1 },
];

// Fallback palette for categories without a chosen color.
const PALETTE = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899', '#64748b', '#6366f1'];

function rangeFor(preset: string): { fromDate?: string; toDate: string } {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  if (preset === 'all') return { toDate };
  const from = new Date(now);
  if (preset === 'ytd') from.setMonth(0, 1);
  else from.setMonth(from.getMonth() - (PRESETS.find((p) => p.v === preset)?.months ?? 6));
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

const eurTick = (v: number) => '€' + Math.round(v / 100);

export default function AllTime() {
  const [preset, setPreset] = useState('6m');
  const [currentEuros, setCurrentEuros] = useState(() => localStorage.getItem('currentBalance') ?? '0');
  const [balance, setBalance] = useState<BalancePoint[]>([]);
  const [trends, setTrends] = useState<CategoryTrends>({ categories: [], data: [] });

  useEffect(() => {
    const { fromDate, toDate } = rangeFor(preset);
    const currentCents = Math.round((parseFloat(currentEuros.replace(',', '.')) || 0) * 100);
    const bp = new URLSearchParams({ to: toDate, current_cents: String(currentCents) });
    if (fromDate) bp.set('from', fromDate);
    api<BalancePoint[]>(`/reports/balance-history?${bp}`).then(setBalance);

    const tp = new URLSearchParams({ to: toDate.slice(0, 7) });
    if (fromDate) tp.set('from', fromDate.slice(0, 7));
    api<CategoryTrends>(`/reports/category-trends?${tp}`).then(setTrends);
  }, [preset, currentEuros]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">All-time overview</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-slate-500">
            Current balance €
            <input
              value={currentEuros}
              onChange={(e) => { setCurrentEuros(e.target.value); localStorage.setItem('currentBalance', e.target.value); }}
              className="w-24 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5">
            {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-600">Balance over time</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={balance} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={eurTick} width={60} />
              <Tooltip formatter={(v: number) => euros(v)} />
              <Line type="monotone" dataKey="balance_cents" name="Balance" stroke="#0ea5e9" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-600">Spending by category per month</h3>
        {trends.data.length === 0 ? (
          <p className="text-sm text-slate-400">No spending in this range.</p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <BarChart data={trends.data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={eurTick} width={60} />
                <Tooltip formatter={(v: number) => euros(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {trends.categories.map((c, i) => (
                  <Bar key={c.id} dataKey={c.name} stackId="spend" fill={c.color ?? PALETTE[i % PALETTE.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
