import { useEffect, useState } from 'react';
import { api } from './api';
import type { Category } from './types';

// Shared category fetch — used by transactions, categories, rules, budgets.
export function useCategories(includeArchived = false) {
  const [categories, setCategories] = useState<Category[]>([]);
  function reload() {
    api<Category[]>(`/categories${includeArchived ? '?include_archived=1' : ''}`).then(setCategories);
  }
  useEffect(reload, [includeArchived]);
  return { categories, reload };
}
