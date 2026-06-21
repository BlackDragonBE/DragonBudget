import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ImportSummary, SyncJob, SyncJobStatus, SyncSettings } from '../types';

const STEP_TEXT: Record<SyncJobStatus, string> = {
  idle: '',
  launching: 'Launching browser…',
  waiting_itsme: 'Confirm the login in your itsme app on your phone…',
  downloading: 'Downloading transactions…',
  importing: 'Importing…',
  done: '',
  error: '',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Bank sync
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncJobStatus>('idle');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    api<SyncSettings>('/sync/settings').then(setSettings).catch(() => {});
  }, []);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Import failed');
      setSummary(body as ImportSummary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncError('');
    setSummary(null);
    setError('');
    try {
      let job = await api<SyncJob>('/sync/start', { method: 'POST' });
      setSyncStatus(job.status);
      while (job.status !== 'done' && job.status !== 'error' && job.status !== 'idle') {
        await sleep(2000);
        job = await api<SyncJob>('/sync/status');
        setSyncStatus(job.status);
      }
      if (job.status === 'error') setSyncError(job.error || 'Sync failed.');
      else if (job.summary) setSummary(job.summary);
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Import transactions</h2>

      {/* Bank sync */}
      <div className="space-y-3 rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="font-medium">Sync from bank</h3>
        <p className="text-sm text-slate-500">
          Logs into Easy Banking Web and downloads the last 90 days. You confirm the
          login once in your itsme app.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={syncNow}
            disabled={syncing || !settings?.configured}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {syncing && STEP_TEXT[syncStatus] && (
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              {STEP_TEXT[syncStatus]}
            </span>
          )}
        </div>
        {settings && !settings.configured && (
          <p className="text-sm text-slate-500">
            No card number set yet —{' '}
            <Link to="/settings" className="text-blue-600 underline dark:text-blue-400">configure it in Settings</Link>.
          </p>
        )}
        {syncError && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{syncError}</p>}
      </div>

      {/* Manual upload */}
      <div className="space-y-3 rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="font-medium">Upload a CSV</h3>
        <p className="text-sm text-slate-500">
          Upload a BNP Paribas Fortis Easy Banking CSV export. Re-importing overlapping
          date ranges is safe — duplicates are skipped automatically.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setSummary(null);
            setError('');
          }}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-white dark:file:bg-slate-100 dark:file:text-slate-900"
        />
        <button
          onClick={upload}
          disabled={!file || busy}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {summary && (
        <div className="rounded border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 font-medium">Import complete</h3>
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-slate-500">Rows parsed</dt>
            <dd className="text-right">{summary.parsed}</dd>
            <dt className="text-slate-500">New transactions</dt>
            <dd className="text-right font-medium text-green-700">{summary.inserted}</dd>
            <dt className="text-slate-500">Duplicates skipped</dt>
            <dd className="text-right">{summary.duplicates}</dd>
            <dt className="text-slate-500">Rejected-status found</dt>
            <dd className="text-right text-red-700">{summary.rejected}</dd>
            <dt className="text-slate-500">Auto-categorized</dt>
            <dd className="text-right">{summary.autoCategorized}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
