import { useState } from 'react';
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
  { to: '/help', label: 'Help' },
];

export default function Layout({ authRequired = false }: { authRequired?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    window.location.reload();
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded px-3 py-2 text-sm font-medium ${
      isActive
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b bg-white dark:bg-slate-900 dark:border-slate-700">
        <div className="mx-auto max-w-5xl px-4">
          {/* Top bar: logo + (desktop nav) + hamburger */}
          <div className="flex items-center gap-x-4 py-3">
            <span className="text-lg font-semibold">🐉 DragonBudget</span>

            {/* Desktop / wide nav */}
            <nav className="hidden flex-wrap gap-1 md:flex">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={linkClass}>
                  {n.label}
                </NavLink>
              ))}
            </nav>

            {authRequired && (
              <button
                onClick={logout}
                className="ml-auto hidden text-sm text-slate-500 hover:text-slate-900 md:block dark:text-slate-400 dark:hover:text-slate-100"
              >
                Log out
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? (
                  <>
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Mobile dropdown nav */}
          {menuOpen && (
            <nav className="flex flex-col gap-1 border-t border-slate-100 py-2 md:hidden dark:border-slate-800">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={linkClass} onClick={() => setMenuOpen(false)}>
                  {n.label}
                </NavLink>
              ))}
              {authRequired && (
                <button
                  onClick={logout}
                  className="mt-1 block rounded px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Log out
                </button>
              )}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
