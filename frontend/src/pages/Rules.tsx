import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { euros, shortDate } from '../format';
import { useCategories } from '../useCategories';
import type { Category, Rule, RulePreview, RuleSuggestion, Tx } from '../types';
import { TxDetailModal } from '../components/TxDetailModal';

const FIELDS = [
  { v: 'details', label: 'Details' },
  { v: 'counterparty_name', label: 'Counterparty name' },
  { v: 'message', label: 'Message' },
];
const TYPES = [
  { v: 'contains', label: 'contains' },
  { v: 'starts_with', label: 'starts with' },
  { v: 'equals', label: 'equals' },
];

export default function Rules() {
  const { categories } = useCategories();
  const [rules, setRules] = useState<Rule[]>([]);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [search, setSearch] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const [previewSuggId, setPreviewSuggId] = useState<number | null>(null);
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const openTx = (id: number) => api<Tx>(`/transactions/${id}`).then(setSelectedTx);

  const reload = () => api<Rule[]>('/rules').then(setRules);
  const reloadSuggestions = () => api<RuleSuggestion[]>('/rules/suggestions').then(setSuggestions);
  useEffect(() => { reload(); reloadSuggestions(); }, []);

  async function applyAll() {
    const { updated } = await api<{ updated: number }>('/rules/apply', { method: 'POST', body: '{}' });
    setApplyMsg(`Re-ran rules: ${updated} transaction(s) updated.`);
  }

  async function accept(id: number) {
    await api(`/rules/suggestions/${id}/accept`, { method: 'POST', body: '{}' });
    reload();
    reloadSuggestions();
  }
  async function dismiss(id: number) {
    await api(`/rules/suggestions/${id}/dismiss`, { method: 'POST', body: '{}' });
    reloadSuggestions();
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Category rules</h2>
        <button onClick={applyAll} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
          Re-run rules now
        </button>
      </div>
      {applyMsg && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{applyMsg}</p>}

      {suggestions.length > 0 && (
        <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Suggested rules</h3>
          {suggestions.map((s) => (
            <div key={s.id} className="rounded bg-white px-3 py-2 text-sm dark:bg-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Transactions containing <span className="font-medium">"{s.token}"</span> →{' '}
                  <span>{s.category_icon} {s.category_name}</span>{' '}
                  <span className="text-slate-400">({s.match_count} uncategorized match)</span>
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() => setPreviewSuggId(previewSuggId === s.id ? null : s.id)}
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  >
                    {previewSuggId === s.id ? 'Hide' : 'Preview'}
                  </button>
                  <button onClick={() => accept(s.id)} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                    Accept
                  </button>
                  <button onClick={() => dismiss(s.id)} className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
                    Dismiss
                  </button>
                </span>
              </div>
              {previewSuggId === s.id && s.sample.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-700">
                  {s.sample.map((t) => (
                    <li key={t.id} onClick={() => openTx(t.id)} className="flex cursor-pointer justify-between gap-2 rounded px-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-700">
                      <span className="truncate text-slate-500">
                        {shortDate(t.execution_date)} · {t.counterparty_name || t.details.slice(0, 50)}
                      </span>
                      <span className="whitespace-nowrap">{euros(t.amount_cents)}</span>
                    </li>
                  ))}
                  {s.match_count > s.sample.length && (
                    <li className="text-xs text-slate-400">…and {s.match_count - s.sample.length} more</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <NewRuleForm categories={categories} onCreated={reload} onOpenTx={openTx} />

      <input
        type="search"
        placeholder="Search rules…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />

      {(() => {
        const q = search.toLowerCase();
        const visible = q ? rules.filter((r) => r.match_value.toLowerCase().includes(q) || r.category_name?.toLowerCase().includes(q)) : rules;
        return (
          <div className="divide-y divide-slate-100 rounded border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
            {visible.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                {rules.length === 0 ? 'No rules yet.' : `No rules match "${search}".`}
              </p>
            )}
            {visible.map((r) => (
              <RuleRow key={r.id} rule={r} categories={categories} onChange={reload} onOpenTx={openTx} />
            ))}
          </div>
        );
      })()}

      {selectedTx && <TxDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  );
}

function NewRuleForm({ categories, onCreated, onOpenTx }: { categories: Category[]; onCreated: () => void; onOpenTx: (id: number) => void }) {
  const [categoryId, setCategoryId] = useState('');
  const [field, setField] = useState('details');
  const [type, setType] = useState('contains');
  const [value, setValue] = useState('');
  const [priority, setPriority] = useState(0);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [error, setError] = useState('');

  const body = () => ({ match_field: field, match_type: type, match_value: value });

  async function doPreview() {
    setError('');
    if (!value.trim()) return;
    try {
      setPreview(await api<RulePreview>('/rules/preview', { method: 'POST', body: JSON.stringify(body()) }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    setError('');
    if (!categoryId) return setError('Pick a category');
    if (!value.trim()) return setError('Enter a match value');
    try {
      await api('/rules', {
        method: 'POST',
        body: JSON.stringify({ ...body(), category_id: Number(categoryId), priority }),
      });
      setValue('');
      setPreview(null);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">New rule</h3>
      <RuleFields
        categories={categories}
        field={field} setField={setField}
        type={type} setType={setType}
        value={value} setValue={setValue}
        categoryId={categoryId} setCategoryId={setCategoryId}
        priority={priority} setPriority={setPriority}
      />

      <div className="flex gap-2">
        <button onClick={doPreview} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
          Preview matches
        </button>
        <button onClick={save} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
          Save rule
        </button>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {preview && <PreviewList preview={preview} onOpenTx={onOpenTx} />}
    </div>
  );
}

function RuleRow({ rule, categories, onChange, onOpenTx }: { rule: Rule; categories: Category[]; onChange: () => void; onOpenTx: (id: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [field, setField] = useState(rule.match_field as string);
  const [type, setType] = useState(rule.match_type as string);
  const [value, setValue] = useState(rule.match_value);
  const [categoryId, setCategoryId] = useState(String(rule.category_id));
  const [priority, setPriority] = useState(rule.priority);
  const [enabled, setEnabled] = useState(!!rule.enabled);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [error, setError] = useState('');

  function reset() {
    setField(rule.match_field);
    setType(rule.match_type);
    setValue(rule.match_value);
    setCategoryId(String(rule.category_id));
    setPriority(rule.priority);
    setEnabled(!!rule.enabled);
    setPreview(null);
    setError('');
  }

  function cancel() {
    setEditing(false);
    reset();
  }

  const draftBody = () => ({ match_field: field, match_type: type, match_value: value });

  async function doPreview() {
    setError('');
    if (!value.trim()) return;
    try {
      setPreview(await api<RulePreview>('/rules/preview', { method: 'POST', body: JSON.stringify(draftBody()) }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    setError('');
    if (!categoryId) return setError('Pick a category');
    if (!value.trim()) return setError('Enter a match value');
    try {
      await api(`/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          match_field: field,
          match_type: type,
          match_value: value,
          category_id: Number(categoryId),
          priority,
          enabled,
        }),
      });
      setEditing(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggle = () => api(`/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) }).then(onChange);
  const remove = () => api(`/rules/${rule.id}`, { method: 'DELETE' }).then(onChange);

  if (editing) {
    return (
      <div className="space-y-3 px-3 py-2">
        <RuleFields
          categories={categories}
          field={field} setField={setField}
          type={type} setType={setType}
          value={value} setValue={setValue}
          categoryId={categoryId} setCategoryId={setCategoryId}
          priority={priority} setPriority={setPriority}
          enabled={enabled} setEnabled={setEnabled}
        />

        <div className="flex gap-2">
          <button onClick={doPreview} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Preview matches
          </button>
          <button onClick={save} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
            Save
          </button>
          <button onClick={cancel} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Cancel
          </button>
        </div>

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        {preview && <PreviewList preview={preview} onOpenTx={onOpenTx} />}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${rule.enabled ? '' : 'opacity-50'}`}>
      <span className="font-mono text-xs text-slate-500">P{rule.priority}</span>
      <span className="flex-1">
        <span className="text-slate-500">{rule.match_field} {rule.match_type}</span>{' '}
        <span className="font-medium">"{rule.match_value}"</span>{' '}
        <span className="text-slate-400">→</span>{' '}
        <span>{rule.category_icon} {rule.category_name}</span>
        {!!rule.created_from_suggestion && (
          <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900 dark:text-blue-400">suggested</span>
        )}
      </span>
      <button onClick={toggle} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
        {rule.enabled ? 'Disable' : 'Enable'}
      </button>
      <button onClick={() => setEditing(true)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
        Edit
      </button>
      <button onClick={remove} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950">
        Delete
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// Shared When/type/Value/Category/Priority grid. RuleRow passes the optional
// enabled pair to render the extra checkbox; NewRuleForm omits it.
function RuleFields({
  categories, field, setField, type, setType, value, setValue,
  categoryId, setCategoryId, priority, setPriority, enabled, setEnabled,
}: {
  categories: Category[];
  field: string; setField: (v: string) => void;
  type: string; setType: (v: string) => void;
  value: string; setValue: (v: string) => void;
  categoryId: string; setCategoryId: (v: string) => void;
  priority: number; setPriority: (v: number) => void;
  enabled?: boolean; setEnabled?: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <Field label="When">
        <select value={field} onChange={(e) => setField(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          {FIELDS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
        </select>
      </Field>
      <Field label=" ">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="Value">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. KRUIDVAT"
          className="rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </Field>
      <Field label="→ Category">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          <option value="">Select…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </Field>
      <Field label="Priority">
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="w-20 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </Field>
      {setEnabled && (
        <Field label="Enabled">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300"
          />
        </Field>
      )}
    </div>
  );
}

// Shared "N existing transaction(s) would match" preview list.
function PreviewList({ preview, onOpenTx }: { preview: RulePreview; onOpenTx: (id: number) => void }) {
  return (
    <div className="rounded bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <p className="mb-2 font-medium">{preview.total} existing transaction(s) would match:</p>
      <ul className="space-y-1">
        {preview.sample.slice(0, 8).map((t) => (
          <li key={t.id} onClick={() => onOpenTx(t.id)} className="flex cursor-pointer justify-between gap-2 rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-700">
            <span className="truncate text-slate-500">
              {shortDate(t.execution_date)} · {t.counterparty_name || t.details.slice(0, 50)}
            </span>
            <span className="whitespace-nowrap">{euros(t.amount_cents)}</span>
          </li>
        ))}
      </ul>
      {preview.total > 8 && <p className="mt-1 text-xs text-slate-400">…and {preview.total - 8} more</p>}
    </div>
  );
}
