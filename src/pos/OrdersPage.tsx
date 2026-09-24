import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import OrderDetailModal from '../components/OrderDetailModal';
import { Badge, Empty, Input, PAY_META, STATUS_META, fmtDate } from '../components/ui';
import { formatMoney, payStatus } from '../lib/calc';
import { db } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { JOB_STATUSES, type JobStatus, type Order } from '../lib/types';

type Filter = JobStatus | 'active' | 'unpaid';

export default function OrdersPage() {
  const settings = useSettings();
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  // Claimed orders older than 30 days are only in the back office receipts list.
  const since = Date.now() - 30 * 86400000;
  const orders =
    useLiveQuery(
      async () =>
        (await db.orders.toArray())
          .filter((o) => !o.deleted && !o.refunded && (o.status !== 'claimed' || o.createdAt > since))
          .sort((a, b) => b.createdAt - a.createdAt),
      [],
    ) ?? [];

  const counts: Record<string, number> = { active: 0, unpaid: 0 };
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
    if (o.status !== 'claimed') counts.active++;
    if (o.balance > 0) counts.unpaid++;
  }

  const match = (o: Order) => {
    if (filter === 'active' && o.status === 'claimed') return false;
    if (filter === 'unpaid' && o.balance <= 0) return false;
    if (filter !== 'active' && filter !== 'unpaid' && o.status !== filter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return o.number.toLowerCase().includes(s) || (o.customerName ?? '').toLowerCase().includes(s) || (o.customerPhone ?? '').includes(s);
  };
  const list = orders.filter(match);
  const now = Date.now();

  const chips: { key: Filter; label: string }[] = [
    { key: 'active', label: 'In shop' },
    ...JOB_STATUSES.map((s) => ({ key: s, label: `${STATUS_META[s].emoji} ${STATUS_META[s].label}` })),
    { key: 'unpaid', label: '💸 Unpaid' },
  ];

  return (
    <div className="mx-auto max-w-5xl p-3 pb-24">
      <Input placeholder="🔍 Search claim #, name, or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="my-3 flex gap-2 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap ${filter === c.key ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-brand-100'}`}
          >
            {c.label} <span className="opacity-70">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty>No orders here 🫧</Empty>}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((o) => {
          const ps = payStatus(o);
          const overdue = o.dueAt && o.dueAt < now && o.status !== 'ready' && o.status !== 'claimed';
          return (
            <button
              key={o.id}
              onClick={() => setOpen(o.id)}
              className={`w-full min-w-0 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ${overdue ? 'ring-rose-300' : 'ring-brand-100'} active:scale-[.99]`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-bold text-navy">#{o.number}</span>
                <span className="shrink-0 font-bold">{formatMoney(o.total, settings.currency)}</span>
              </div>
              <div className="truncate text-sm font-semibold text-gray-700">{o.customerName ?? 'Walk-in'}</div>
              <div className="truncate text-xs text-gray-500">{o.lines.map((l) => `${l.name} ×${l.qty}`).join(', ')}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Badge color={STATUS_META[o.status].color}>
                  {STATUS_META[o.status].emoji} {STATUS_META[o.status].label}
                </Badge>
                <Badge color={PAY_META[ps].color}>{PAY_META[ps].label}</Badge>
                {o.dueAt && o.status !== 'claimed' && (
                  <span className={`ml-auto text-xs ${overdue ? 'font-bold text-rose-600' : 'text-gray-500'}`}>
                    {overdue ? 'Overdue · ' : 'Due '}
                    {fmtDate(o.dueAt)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {open && <OrderDetailModal orderId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
