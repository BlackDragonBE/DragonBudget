import { NavLink, Outlet } from 'react-router-dom';
import { api } from './api';

// Nav grows as milestones land. Transactions + Import wired in M2.
const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/all-time', label: 'All-time' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/rules', label: 'Rules' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/recurring', label: 'Recurring' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout({ authRequired = false }: { authRequired?: boolean }) {
  async function logout() {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b bg-white dark:bg-slate-900 dark:border-slate-700">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-semibold">🐉 DragonBudget</span>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          {authRequired && (
            <button onClick={logout} className="ml-auto text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
              Log out
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
