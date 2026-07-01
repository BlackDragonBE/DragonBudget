import { useEffect, useState } from 'react';

interface Toast { id: number; kind: 'success' | 'error'; text: string }

// ponytail: module-level pub/sub instead of a context provider — one listener,
// callable from non-React code (api.ts). Upgrade to context if we ever need two mounts.
let nextId = 1;
let listener: ((t: Toast) => void) | null = null;

export function toast(kind: Toast['kind'], text: string) {
  listener?.({ id: nextId++, kind, text });
}

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listener = (t) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4000);
    };
    return () => { listener = null; };
  }, []);
  if (!items.length) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 z-[60] w-max max-w-[90vw] -translate-x-1/2 space-y-2">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}
          className={`block w-full rounded border px-4 py-2 text-left text-sm shadow-lg ${
            t.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
