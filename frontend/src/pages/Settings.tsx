import { useState } from 'react';
import { api } from '../api';

export default function Settings() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');

  async function clearAll() {
    try {
      await api('/transactions', { method: 'DELETE' });
      setStatus('done');
      setConfirming(false);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="mb-1 font-medium text-red-800">Danger zone</h2>
        <p className="mb-3 text-sm text-red-700">
          Permanently deletes all transactions and recurring expense data. This cannot be undone.
        </p>
        {status === 'done' && (
          <p className="mb-3 text-sm font-medium text-green-700">All transactions cleared.</p>
        )}
        {status === 'error' && (
          <p className="mb-3 text-sm font-medium text-red-700">Something went wrong.</p>
        )}
        {confirming ? (
          <div className="flex gap-2">
            <button
              onClick={clearAll}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Yes, delete everything
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setStatus('idle'); setConfirming(true); }}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Clear all transactions
          </button>
        )}
      </section>
    </div>
  );
}
