import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './state/AuthContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Collection from './pages/Collection';
import CollectionChit from './pages/CollectionChit';
import Pending from './pages/Pending';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Loans from './pages/Loans';
import LoanNew from './pages/LoanNew';
import LoanDetail from './pages/LoanDetail';
import Employees from './pages/Employees';
import EmployeePermissions from './pages/EmployeePermissions';
import AuditLogs from './pages/AuditLogs';
import Profile from './pages/Profile';
import Finance from './pages/Finance';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div style={{ minHeight: '100vh' }}><Spinner label="Starting…" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

function RequirePerm({ perm, children }) {
  const { can } = useAuth();
  if (!can(perm)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="collection" element={<RequirePerm perm="collection.view"><Collection /></RequirePerm>} />
        <Route path="collection/chit/:id" element={<RequirePerm perm="collection.view"><CollectionChit /></RequirePerm>} />
        <Route path="pending" element={<RequirePerm perm="pending.view"><Pending /></RequirePerm>} />
        <Route path="customers" element={<RequirePerm perm="customers.view"><Customers /></RequirePerm>} />
        <Route path="customers/:id" element={<RequirePerm perm="customers.view"><CustomerDetail /></RequirePerm>} />
        <Route path="loans" element={<RequirePerm perm="loans.view"><Loans /></RequirePerm>} />
        <Route path="loans/new" element={<RequirePerm perm="loans.create"><LoanNew /></RequirePerm>} />
        <Route path="loans/:id" element={<RequirePerm perm="loans.view"><LoanDetail /></RequirePerm>} />
        <Route path="employees" element={<RequirePerm perm="employees.view"><Employees /></RequirePerm>} />
        <Route path="employees/:id/permissions" element={<RequirePerm perm="permissions.view"><EmployeePermissions /></RequirePerm>} />
        <Route path="audit" element={<RequirePerm perm="audit.view"><AuditLogs /></RequirePerm>} />
        <Route path="reports" element={<RequirePerm perm="reports.view"><Reports /></RequirePerm>} />
        <Route path="finance" element={<RequirePerm perm="expenses.view"><Finance /></RequirePerm>} />
        <Route path="expenses" element={<RequirePerm perm="expenses.view"><Finance /></RequirePerm>} />
        <Route path="income" element={<RequirePerm perm="income.view"><Finance /></RequirePerm>} />
        <Route path="transactions" element={<RequirePerm perm="transactions.view"><Transactions /></RequirePerm>} />
        <Route path="settings" element={<RequirePerm perm="settings.view"><Settings /></RequirePerm>} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
