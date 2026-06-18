import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AllTime from './pages/AllTime';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Rules from './pages/Rules';
import Budgets from './pages/Budgets';
import Recurring from './pages/Recurring';
import Import from './pages/Import';
import Settings from './pages/Settings';
import Help from './pages/Help';

interface AuthStatus {
  authRequired: boolean;
  authenticated: boolean;
}

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const check = () =>
    api<AuthStatus>('/auth/status')
      .then(setAuth)
      .catch(() => setAuth({ authRequired: false, authenticated: true }));
  useEffect(() => {
    check();
  }, []);

  if (!auth) return null; // brief auth check
  if (auth.authRequired && !auth.authenticated) return <Login onSuccess={check} />;

  return (
    <Routes>
      <Route element={<Layout authRequired={auth.authRequired} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/all-time" element={<AllTime />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
