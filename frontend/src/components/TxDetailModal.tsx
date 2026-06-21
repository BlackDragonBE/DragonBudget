import React, { useEffect } from 'react';
import { euros, shortDate } from '../format';
import type { Tx } from '../types';

export function TxDetailModal({ tx, onClose, onSaveNote }: { tx: Tx; onClose: () => void; onSaveNote: (note: string | null) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl sm:p-6 dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">{tx.counterparty_name || tx.transaction_type}</p>
            {tx.status === 'rejected' && (
              <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">rejected</span>
            )}
            {tx.is_transfer ? (
              <span className="mt-1 inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">transfer — excluded from income/expense</span>
            ) : null}
          </div>
          <button onClick={onClose} className="ml-4 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">✕</button>
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="Amount">
            <span className={tx.amount_cents >= 0 ? 'font-semibold text-green-700' : 'font-semibold'}>
              {euros(tx.amount_cents)}
            </span>
          </Row>
          <Row label="Execution date">{shortDate(tx.execution_date)}</Row>
          {tx.value_date && tx.value_date !== tx.execution_date && (
            <Row label="Value date">{shortDate(tx.value_date)}</Row>
          )}
          <Row label="Type">{tx.transaction_type}</Row>
          <Row label="Details"><span className="break-all">{tx.details}</span></Row>
          <Row label="Category">
            {tx.category_name
              ? <span>{tx.category_icon} {tx.category_name}</span>
              : <span className="text-slate-400">Uncategorized</span>}
          </Row>
        </dl>

        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Note</label>
          <textarea
            key={tx.id}
            defaultValue={tx.notes ?? ''}
            onBlur={(e) => onSaveNote(e.target.value.trim() || null)}
            rows={2}
            maxLength={1000}
            placeholder="Add a note…"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-32 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="flex-1 text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}
