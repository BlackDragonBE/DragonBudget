import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { api } from '../api';
import { euros } from '../format';
import type { BalancePoint, CategoryTrends, SyncSettings } from '../types';

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

function useDark() {
  return useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributeFilter: ['class'] });
      return () => mo.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
  );
}

type ChartColors = { grid: string; tick: string; tooltip: object };

// Small multiples: one mini trend chart per category, biggest total first.
// Each cell scales to its own max (independent y-axis) so small categories stay
// legible; the header total carries absolute magnitude.
function CategorySmallMultiples({ trends, chartColors, onCellClick }: {
  trends: CategoryTrends;
  chartColors: ChartColors;
  onCellClick: (categoryId: number, month: string) => void;
}) {
  const cells = trends.categories
    .map((c, i) => {
      const series = trends.data.map((row) => ({ month: row.month as string, value: (row[c.name] as number) ?? 0 }));
      const total = series.reduce((s, p) => s + p.value, 0);
      return { ...c, color: c.color ?? PALETTE[i % PALETTE.length], series, total };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {cells.map((c) => (
        <div key={c.id} className="rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
            <span className="text-xs tabular-nums text-slate-500">{euros(c.total)}</span>
          </div>
          <div className="mt-1 h-12 w-full cursor-pointer" title="Click a point to view transactions">
            <ResponsiveContainer>
              <AreaChart
                data={c.series}
                margin={{ top: 4, right: 2, bottom: 0, left: 2 }}
                onClick={(d) => { if (d?.activeLabel) onCellClick(c.id, d.activeLabel as string); }}
              >
                <XAxis dataKey="month" hide />
                <Tooltip
                  formatter={(v: number) => euros(v)}
                  contentStyle={{ ...chartColors.tooltip, padding: '2px 8px', fontSize: 12 }}
                  allowEscapeViewBox={{ x: true, y: true }}
                  position={{ y: -52 }}
                  cursor={{ stroke: chartColors.tick, strokeWidth: 1 }}
                  wrapperStyle={{ zIndex: 10 }}
                />
                <Area type="monotone" dataKey="value" stroke={c.color} fill={c.color} fillOpacity={0.13} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AllTime() {
  const navigate = useNavigate();
  const dark = useDark();
  const chartColors = {
    grid: dark ? '#334155' : '#f1f5f9',
    tick: dark ? '#94a3b8' : '#64748b',
    tooltip: dark ? { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' } : {},
  };
  const [preset, setPreset] = useState('6m');
  const [sync, setSync] = useState<SyncSettings | null>(null);
  const [balance, setBalance] = useState<BalancePoint[]>([]);
  const [trends, setTrends] = useState<CategoryTrends>({ categories: [], data: [] });
  const [incomeTrends, setIncomeTrends] = useState<CategoryTrends>({ categories: [], data: [] });

  useEffect(() => {
    api<SyncSettings>('/sync/settings').then(setSync).catch(() => {});
  }, []);

  // Chart anchor: total net worth across all accounts. The history curve is built
  // from the synced account's transactions, so the savings balance is a constant
  // offset that lifts the whole line to end at the real total.
  const accounts = sync?.accounts ?? [];
  const currentCents = accounts.reduce((s, a) => s + (a.balanceCents ?? 0), 0);

  useEffect(() => {
    const { fromDate, toDate } = rangeFor(preset);
    const bp = new URLSearchParams({ to: toDate, current_cents: String(currentCents) });
    if (fromDate) bp.set('from', fromDate);
    api<BalancePoint[]>(`/reports/balance-history?${bp}`).then(setBalance);

    const tp = new URLSearchParams({ to: toDate.slice(0, 7) });
    if (fromDate) tp.set('from', fromDate.slice(0, 7));
    api<CategoryTrends>(`/reports/category-trends?${tp}`).then(setTrends);
    api<CategoryTrends>(`/reports/category-trends?${tp}&income=1`).then(setIncomeTrends);
  }, [preset, currentCents]);

  const syncedAt = sync?.balanceSyncedAt
    ? new Date(sync.balanceSyncedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">All-time overview</h2>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
          {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Current balance</h3>
          {syncedAt && <span className="text-xs text-slate-400">synced {syncedAt}</span>}
        </div>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No balance yet — run a sync on the Import page.</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{euros(currentCents)}</p>
            {accounts.length > 1 && (
              <dl className="mt-3 space-y-1 text-sm">
                {accounts.map((a) => (
                  <div key={a.iban ?? a.name} className="flex justify-between gap-2">
                    <dt className="text-slate-500">{a.name}{a.type ? ` · ${a.type}` : ''}</dt>
                    <dd className="tabular-nums">{euros(a.balanceCents ?? 0)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Balance over time</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={balance} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartColors.tick }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11, fill: chartColors.tick }} tickFormatter={eurTick} width={60} />
              <Tooltip formatter={(v: number) => euros(v)} contentStyle={chartColors.tooltip} />
              <Line type="monotone" dataKey="balance_cents" name="Balance" stroke="#0ea5e9" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Spending by category per month</h3>
        {trends.data.length === 0 ? (
          <p className="text-sm text-slate-400">No spending in this range.</p>
        ) : (
          <CategorySmallMultiples trends={trends} chartColors={chartColors} onCellClick={(id, month) => navigate(`/transactions?category_id=${id === 0 ? 'none' : id}&month=${month}`)} />
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Income by category per month</h3>
        {incomeTrends.data.length === 0 ? (
          <p className="text-sm text-slate-400">No income in this range.</p>
        ) : (
          <CategorySmallMultiples trends={incomeTrends} chartColors={chartColors} onCellClick={(id, month) => navigate(`/transactions?category_id=${id === 0 ? 'none' : id}&month=${month}`)} />
        )}
      </section>
    </div>
  );
}
