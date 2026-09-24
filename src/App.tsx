import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session';
import Login from './pages/Login';
import PosLayout from './pos/PosLayout';
import SalePage from './pos/SalePage';
import OrdersPage from './pos/OrdersPage';
import ShiftPage from './pos/ShiftPage';
import CustomersPage from './admin/Customers';
import AdminLayout from './admin/AdminLayout';
import Dashboard from './admin/Dashboard';
import Reports from './admin/Reports';
import Receipts from './admin/Receipts';
import Items from './admin/Items';
import Categories from './admin/Categories';
import Discounts from './admin/Discounts';
import Inventory from './admin/Inventory';
import Employees from './admin/Employees';
import Shifts from './admin/Shifts';
import SettingsPage from './admin/Settings';

function RequireLogin({ children, manager }: { children: ReactNode; manager?: boolean }) {
  const { employee, canManage } = useSession();
  if (!employee) return <Navigate to="/login" replace />;
  if (manager && !canManage) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/pos"
            element={
              <RequireLogin>
                <PosLayout />
              </RequireLogin>
            }
          >
            <Route index element={<SalePage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="shift" element={<ShiftPage />} />
          </Route>
          <Route
            path="/admin"
            element={
              <RequireLogin manager>
                <AdminLayout />
              </RequireLogin>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="reports" element={<Reports />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="items" element={<Items />} />
            <Route path="categories" element={<Categories />} />
            <Route path="discounts" element={<Discounts />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="employees" element={<Employees />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </HashRouter>
    </SessionProvider>
  );
}
