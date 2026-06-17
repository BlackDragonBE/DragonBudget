// Display helpers. Money is integer cents everywhere except here, at the boundary.
export function euros(cents: number): string {
  return (cents / 100).toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });
}

export function shortDate(iso: string | null): string {
  return iso ?? '—';
}

export const thisMonth = () => new Date().toISOString().slice(0, 7);

// 'YYYY-MM' -> previous month 'YYYY-MM'.
export function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
