import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { KnownAccount } from '../types';
import { getTheme, setTheme, type Theme } from '../theme';

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

const NAV = [
  { id: 'appearance', label: 'Appearance',   icon: '🎨' },
  { id: 'data',       label: 'Data',         icon: '🗄️' },
  { id: 'accounts',   label: 'Accounts',     icon: '🏦' },
  { id: 'danger',     label: 'Danger zone',  icon: '⚠️' },
] as const;
type Section = typeof NAV[number]['id'];

export default function Settings() {
  const [section, setSection] = useState<Section>('appearance');
  const [theme, setThemeState] = useState<Theme>(getTheme);

  function handleTheme(t: Theme) {
    setTheme(t);
    setThemeState(t);
  }

  // data section
  const [msg, setMsg] = useState('');
  const txFileRef = useRef<HTMLInputElement>(null);
  const cfgFileRef = useRef<HTMLInputElement>(null);
  const budgetFileRef = useRef<HTMLInputElement>(null);

  // accounts section
  const [accounts, setAccounts] = useState<KnownAccount[]>([]);
  const [acctName, setAcctName] = useState('');
  const [acctNumber, setAcctNumber] = useState('');
  const [acctError, setAcctError] = useState('');

  // danger section
  const [confirming, setConfirming] = useState(false);
  const [clearStatus, setClearStatus] = useState<'idle' | 'done' | 'error'>('idle');

  useEffect(() => {
    api<KnownAccount[]>('/known-accounts').then(setAccounts).catch(() => {});
  }, []);

  async function exportTransactions() {
    try { download('transactions.json', await api('/export/transactions')); }
    catch (e) { setMsg(`Export failed: ${(e as Error).message}`); }
  }
  async function exportConfig() {
    try { download('categories-rules.json', await api('/export/config')); }
    catch (e) { setMsg(`Export failed: ${(e as Error).message}`); }
  }
  async function exportBudgets() {
    try { download('budgets.json', await api('/export/budgets')); }
    catch (e) { setMsg(`Export failed: ${(e as Error).message}`); }
  }
  async function importFile(file: File, endpoint: string, label: string) {
    try {
      const result = await api<Record<string, number>>(endpoint, {
        method: 'POST',
        body: JSON.stringify(JSON.parse(await file.text())),
      });
      setMsg(`${label}: ${Object.entries(result).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  }

  async function addAccount() {
    setAcctError('');
    try {
      const row = await api<KnownAccount>('/known-accounts', {
        method: 'POST',
        body: JSON.stringify({ name: acctName.trim(), account_number: acctNumber.trim() }),
      });
      setAccounts((a) => [...a, row].sort((x, y) => x.name.localeCompare(y.name)));
      setAcctName(''); setAcctNumber('');
    } catch (e) { setAcctError((e as Error).message); }
  }
  async function deleteAccount(id: number) {
    await api(`/known-accounts/${id}`, { method: 'DELETE' });
    setAccounts((a) => a.filter((x) => x.id !== id));
  }

  async function clearAll() {
    try {
      await api('/transactions', { method: 'DELETE' });
      setClearStatus('done'); setConfirming(false);
    } catch { setClearStatus('error'); }
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <nav className="w-44 shrink-0">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Settings</p>
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setSection(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  section === item.id
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-6">

        {section === 'appearance' && (
          <>
            <h1 className="text-xl font-semibold">Appearance</h1>
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 font-medium text-slate-700 dark:text-slate-300">Theme</h2>
              <div className="flex gap-2">
                {(['light', 'system', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTheme(t)}
                    className={`rounded border px-4 py-2 text-sm font-medium capitalize ${
                      theme === t
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {section === 'data' && (
          <>
            <h1 className="text-xl font-semibold">Data</h1>

            {msg && (
              <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {msg}{' '}
                <button onClick={() => setMsg('')} className="ml-2 text-slate-400 hover:text-slate-600">✕</button>
              </p>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 font-medium text-slate-700 dark:text-slate-300">Export</h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportTransactions} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  Export transactions
                </button>
                <button onClick={exportConfig} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  Export categories &amp; rules
                </button>
                <button onClick={exportBudgets} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  Export budgets
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">Downloads a JSON file you can use as a backup or to migrate to another instance.</p>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 font-medium text-slate-700 dark:text-slate-300">Import</h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => txFileRef.current?.click()} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  Import transactions
                </button>
                <button onClick={() => cfgFileRef.current?.click()} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  Import categories &amp; rules
                </button>
                <button onClick={() => budgetFileRef.current?.click()} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  Import budgets
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">Existing data is preserved — duplicates are skipped.</p>
              <input ref={txFileRef} type="file" accept=".json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f, '/import/transactions', 'Imported'); e.target.value = ''; }} />
              <input ref={cfgFileRef} type="file" accept=".json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f, '/import/config', 'Imported'); e.target.value = ''; }} />
              <input ref={budgetFileRef} type="file" accept=".json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f, '/import/budgets', 'Imported'); e.target.value = ''; }} />
            </section>
          </>
        )}

        {section === 'accounts' && (
          <>
            <h1 className="text-xl font-semibold">Accounts</h1>
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-1 font-medium text-slate-700 dark:text-slate-300">Known accounts</h2>
              <p className="mb-4 text-sm text-slate-500">
                Transactions whose counterparty account matches will show a labelled tag.
              </p>
              {accounts.length > 0 && (
                <ul className="mb-4 space-y-1">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                      <span>
                        <span className="font-medium">{a.name}</span>
                        <span className="ml-3 font-mono text-xs text-slate-400">{a.account_number}</span>
                      </span>
                      <button onClick={() => deleteAccount(a.id)} className="text-slate-300 hover:text-red-500">✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  value={acctName}
                  onChange={(e) => setAcctName(e.target.value)}
                  placeholder="Name (e.g. Savings)"
                  className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  value={acctNumber}
                  onChange={(e) => setAcctNumber(e.target.value)}
                  placeholder="BE79 0351 3401 4433"
                  className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-mono"
                />
                <button
                  onClick={addAccount}
                  disabled={!acctName.trim() || !acctNumber.trim()}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Add
                </button>
              </div>
              {acctError && <p className="mt-2 text-xs text-red-600">{acctError}</p>}
            </section>
          </>
        )}

        {section === 'danger' && (
          <>
            <h1 className="text-xl font-semibold">Danger zone</h1>
            <section className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h2 className="mb-1 font-medium text-red-800">Clear all transactions</h2>
              <p className="mb-3 text-sm text-red-700">
                Permanently deletes all transactions and recurring expense data. This cannot be undone.
              </p>
              {clearStatus === 'done' && <p className="mb-3 text-sm font-medium text-green-700">All transactions cleared.</p>}
              {clearStatus === 'error' && <p className="mb-3 text-sm font-medium text-red-700">Something went wrong.</p>}
              {confirming ? (
                <div className="flex gap-2">
                  <button onClick={clearAll} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                    Yes, delete everything
                  </button>
                  <button onClick={() => setConfirming(false)} className="rounded border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => { setClearStatus('idle'); setConfirming(true); }} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                  Clear all transactions
                </button>
              )}
            </section>
          </>
        )}

      </div>
    </div>
  );
}
