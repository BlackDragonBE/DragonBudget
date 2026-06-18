import { useRef, useState } from 'react';
import { api } from '../api';

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

export default function Settings() {
  const [confirming, setConfirming] = useState(false);
  const [clearStatus, setClearStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const txFileRef = useRef<HTMLInputElement>(null);
  const cfgFileRef = useRef<HTMLInputElement>(null);

  async function clearAll() {
    try {
      await api('/transactions', { method: 'DELETE' });
      setClearStatus('done');
      setConfirming(false);
    } catch {
      setClearStatus('error');
    }
  }

  async function exportTransactions() {
    try {
      const data = await api('/export/transactions');
      download('transactions.json', data);
    } catch (e) {
      setMsg(`Export failed: ${(e as Error).message}`);
    }
  }

  async function exportConfig() {
    try {
      const data = await api('/export/config');
      download('categories-rules.json', data);
    } catch (e) {
      setMsg(`Export failed: ${(e as Error).message}`);
    }
  }

  async function importFile(file: File, endpoint: string, label: string) {
    try {
      const data = JSON.parse(await file.text());
      const result = await api<Record<string, number>>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setMsg(`${label}: ${Object.entries(result).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {msg && (
        <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {msg}{' '}
          <button onClick={() => setMsg('')} className="ml-2 text-slate-400 hover:text-slate-600">✕</button>
        </p>
      )}

      <Section title="Export">
        <div className="flex flex-wrap gap-2">
          <button onClick={exportTransactions} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Export transactions
          </button>
          <button onClick={exportConfig} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Export categories &amp; rules
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Downloads a JSON file you can use as a backup or to migrate to another instance.</p>
      </Section>

      <Section title="Import">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => txFileRef.current?.click()} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Import transactions
          </button>
          <button onClick={() => cfgFileRef.current?.click()} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Import categories &amp; rules
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Existing data is preserved — duplicates are skipped.</p>
        <input ref={txFileRef} type="file" accept=".json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f, '/import/transactions', 'Imported'); e.target.value = ''; }} />
        <input ref={cfgFileRef} type="file" accept=".json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f, '/import/config', 'Imported'); e.target.value = ''; }} />
      </Section>

      <section className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="mb-1 font-medium text-red-800">Danger zone</h2>
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
    </div>
  );
}
