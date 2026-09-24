import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui';
import SyncBadge from '../components/SyncBadge';
import { useSession } from '../lib/session';

const tabs = [
  { to: '/pos', label: 'Sale', icon: '🧺', end: true },
  { to: '/pos/orders', label: 'Orders', icon: '🫧' },
  { to: '/pos/customers', label: 'Customers', icon: '👥' },
  { to: '/pos/shift', label: 'Shift', icon: '💵' },
];

export default function PosLayout() {
  const { employee, logout, canManage } = useSession();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <header className="safe-top bg-brand-300 text-navy shadow-sm">
        <div className="flex items-center gap-3 px-3 py-2">
          <Logo size={36} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg leading-tight font-extrabold text-navy">Happi Bubbles</div>
            <div className="truncate text-xs font-semibold">{employee?.name}</div>
          </div>
          <nav className="hidden gap-1 md:flex">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => `rounded-xl px-3 py-2 text-sm font-bold ${isActive ? 'bg-white text-navy' : 'text-navy/80 hover:bg-white/40'}`}
              >
                {t.icon} {t.label}
              </NavLink>
            ))}
          </nav>
          <SyncBadge />
          {canManage && (
            <button onClick={() => nav('/admin')} className="rounded-xl bg-white/70 px-3 py-2 text-sm font-bold hover:bg-white">
              Back Office
            </button>
          )}
          <button onClick={logout} className="rounded-xl px-2 py-2 text-sm font-bold hover:bg-white/40" title="Lock">
            🔒
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="safe-bottom grid grid-cols-4 border-t border-brand-100 bg-white md:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `flex flex-col items-center py-2 text-xs font-bold ${isActive ? 'text-brand-600' : 'text-gray-500'}`}
          >
            <span className="text-xl">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
