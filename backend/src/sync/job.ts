import type { DB } from '../db';
import { parseBnpCsv } from '../csv/parse';
import { importTransactions, type ImportSummary } from '../csv/import';
import { getSetting } from '../settings';
import { runSync, type SyncStep } from './runner';

export type JobStatus = 'idle' | SyncStep | 'importing' | 'done' | 'error';

export interface Job {
  status: JobStatus;
  startedAt: string | null;
  summary: ImportSummary | null;
  error: string | null;
}

// Single-user app → one job at a time, held in memory. A sync is short-lived;
// losing this on restart is fine (just start another).
let current: Job = { status: 'idle', startedAt: null, summary: null, error: null };

export function getJob(): Job {
  return current;
}

const RUNNING = new Set<JobStatus>(['launching', 'navigating', 'logging_in', 'waiting_itsme', 'navigating_account', 'downloading', 'importing']);
export function isRunning(): boolean {
  return RUNNING.has(current.status);
}

/**
 * Kick off a sync in the background (fire-and-forget). Returns immediately with
 * the job set to its first running state; callers poll getJob() for progress.
 * Throws synchronously if credentials are missing or a job is already running.
 */
export function startJob(db: DB): Job {
  if (isRunning()) throw new Error('A sync is already running.');
  const gsm = getSetting(db, 'bank_gsm_number');
  const client = getSetting(db, 'bank_client_number');
  const accountLabel = getSetting(db, 'bank_account_label');
  if (!gsm || !client || !accountLabel) {
    throw new Error('Bank sync is not configured. Fill in Settings → Bank sync.');
  }

  current = { status: 'launching', startedAt: new Date().toISOString(), summary: null, error: null };

  runSync({ gsm, client, accountLabel }, (step) => { current.status = step; })
    .then((csv) => {
      current.status = 'importing';
      const summary = importTransactions(db, parseBnpCsv(csv));
      current = { ...current, status: 'done', summary };
    })
    .catch((e: unknown) => {
      current = { ...current, status: 'error', error: e instanceof Error ? e.message : String(e) };
    });

  return current;
}
