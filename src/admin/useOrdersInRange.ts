import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../lib/db';
import { endOfDay, startOfDay } from '../lib/reports';

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastMonth' | 'custom';

export function rangeFor(key: RangeKey, custom: { from: string; to: string }): { from: number; to: number } {
  const now = Date.now();
  const d = new Date();
  switch (key) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      return { from: startOfDay(now - 86400000), to: endOfDay(now - 86400000) };
    case '7d':
      return { from: startOfDay(now - 6 * 86400000), to: endOfDay(now) };
    case '30d':
      return { from: startOfDay(now - 29 * 86400000), to: endOfDay(now) };
    case 'month':
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: endOfDay(now) };
    case 'lastMonth':
      return {
        from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
        to: new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1,
      };
    case 'custom':
      return {
        from: custom.from ? startOfDay(new Date(custom.from + 'T00:00').getTime()) : startOfDay(now),
        to: custom.to ? endOfDay(new Date(custom.to + 'T00:00').getTime()) : endOfDay(now),
      };
  }
}

export function useRange(initial: RangeKey = '7d') {
  const [key, setKey] = useState<RangeKey>(initial);
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = rangeFor(key, custom);
  const orders =
    useLiveQuery(
      async () => (await db.orders.where('createdAt').between(range.from, range.to, true, true).toArray()).filter((o) => !o.deleted),
      [range.from, range.to],
    ) ?? [];
  // Payments on older orders (balances collected in this range) count toward cash flow.
  const paymentOrders =
    useLiveQuery(
      async () => (await db.orders.toArray()).filter((o) => !o.deleted && o.payments.some((p) => p.at >= range.from && p.at <= range.to)),
      [range.from, range.to],
    ) ?? [];
  return { key, setKey, custom, setCustom, range, orders, paymentOrders };
}
