import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import SyncBadge from '../components/SyncBadge';
import { Logo } from '../components/ui';
import { useSession } from '../lib/session';

const links = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/reports', label: 'Sales reports', icon: '📈' },
  { to: '/admin/receipts', label: 'Receipts', icon: '🧾' },
  { to: '/admin/items', label: 'Items & services', icon: '🧺' },
  { to: '/admin/categories', label: 'Categories', icon: '🗂️' },
  { to: '/admin/discounts', label: 'Discounts', icon: '🏷️' },
  { to: '/admin/inventory', label: 'Inventory', icon: '📦' },
  { to: '/admin/customers', label: 'Customers', icon: '👥' },
  { to: '/admin/employees', label: 'Employees', icon: '🧑‍💼' },
  { to: '/admin/shifts', label: 'Shifts', icon: '💵' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminLayout() {
  const nav = useNavigate();
  const { employee, logout } = useSession();
  const [menu, setMenu] = useState(false);

  const sidebar = (
    <nav className="space-y-1 p-3">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          onClick={() => setMenu(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-brand-500 text-white' : 'text-navy hover:bg-brand-100'}`
          }
        >
          <span>{l.icon}</span>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top flex items-center gap-3 bg-navy px-3 py-2 text-white">
        <button className="rounded-lg px-2 py-1 text-xl lg:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">
          ☰
        </button>
        <Logo size={34} />
        <div className="flex-1">
          <div className="font-display text-lg leading-tight font-bold">Back Office</div>
          <div className="text-xs opacity-70">{employee?.name}</div>
        </div>
        <SyncBadge />
        <button onClick={() => nav('/pos')} className="rounded-xl bg-bubble px-3 py-2 text-sm font-bold">
          Open POS
        </button>
        <button onClick={logout} className="rounded-xl px-2 py-2 text-sm" title="Log out">
          🔒
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-brand-100 bg-white lg:block">{sidebar}</aside>
        {menu && (
          <div className="fixed inset-0 z-40 bg-navy/40 lg:hidden" onClick={() => setMenu(false)}>
            <aside className="h-full w-64 overflow-y-auto bg-white" onClick={(e) => e.stopPropagation()}>
              {sidebar}
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
