import { useState } from 'react';
import { api } from '../api';
import { useCategories } from '../useCategories';
import type { Category } from '../types';

export default function Categories() {
  const { categories, reload } = useCategories(true); // management view includes archived
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [error, setError] = useState('');

  async function add() {
    if (!name.trim()) return;
    try {
      await api('/categories', { method: 'POST', body: JSON.stringify({ name, icon: icon || null }) });
      setName('');
      setIcon('');
      setError('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">Categories</h2>

      <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-3">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🛒"
          className="w-14 rounded border border-slate-300 px-2 py-1.5 text-center text-sm"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New category name"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button onClick={add} className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
          Add
        </button>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} onChange={reload} />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ category, onChange }: { category: Category; onChange: () => void }) {
  const patch = (body: Record<string, unknown>) =>
    api(`/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(onChange);

  const archived = !!category.archived;
  return (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${archived ? 'opacity-50' : ''}`}>
      <input
        key={`icon-${category.icon ?? ''}`}
        defaultValue={category.icon ?? ''}
        onBlur={(e) => e.target.value !== (category.icon ?? '') && patch({ icon: e.target.value || null })}
        className="w-12 rounded border border-slate-200 px-2 py-1 text-center text-sm"
      />
      <input
        key={`name-${category.name}`}
        defaultValue={category.name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== category.name && patch({ name: e.target.value })}
        className="min-w-40 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
      />
      <input
        type="color"
        defaultValue={category.color ?? '#64748b'}
        onChange={(e) => patch({ color: e.target.value })}
        className="h-8 w-10 rounded border border-slate-200"
      />
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input type="checkbox" defaultChecked={!!category.is_income} onChange={(e) => patch({ is_income: e.target.checked })} />
        income
      </label>
      <button
        onClick={() => patch({ archived: !archived })}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        {archived ? 'Restore' : 'Archive'}
      </button>
    </div>
  );
}
