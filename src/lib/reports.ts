import { round2 } from './calc';
import type { Order } from './types';

export interface SalesSummary {
  grossSales: number;
  refunds: number;
  discounts: number;
  netSales: number;
  collected: number;
  receivables: number;
  orders: number;
  avgTicket: number;
  grossProfit: number;
}

/** Sales are counted on the day the order was created; refunds reverse the order. */
export function summarize(orders: Order[]): SalesSummary {
  let gross = 0;
  let refunds = 0;
  let discounts = 0;
  let collected = 0;
  let receivables = 0;
  let cost = 0;
  let count = 0;
  for (const o of orders) {
    gross += o.subtotal;
    discounts += o.discountTotal;
    if (o.refunded) {
      refunds += o.total;
      continue;
    }
    count++;
    collected += o.paid;
    receivables += o.balance;
    cost += o.lines.reduce((s, l) => s + (l.cost || 0) * l.qty, 0);
  }
  const net = gross - discounts - refunds;
  return {
    grossSales: round2(gross),
    refunds: round2(refunds),
    discounts: round2(discounts),
    netSales: round2(net),
    collected: round2(collected),
    receivables: round2(receivables),
    orders: count,
    avgTicket: count ? round2(net / count) : 0,
    grossProfit: round2(net - cost),
  };
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function salesByDay(orders: Order[], from: number, to: number) {
  const map = new Map<string, { day: string; sales: number; orders: number }>();
  for (let t = startOfDay(from); t <= to; t += 86400000) {
    const k = dayKey(t);
    map.set(k, { day: k, sales: 0, orders: 0 });
  }
  for (const o of orders) {
    if (o.refunded) continue;
    const row = map.get(dayKey(o.createdAt));
    if (!row) continue;
    row.sales = round2(row.sales + o.total);
    row.orders++;
  }
  return [...map.values()];
}

export function salesByHour(orders: Order[]) {
  const rows = Array.from({ length: 24 }, (_, h) => ({ hour: h, sales: 0, orders: 0 }));
  for (const o of orders) {
    if (o.refunded) continue;
    const r = rows[new Date(o.createdAt).getHours()];
    r.sales = round2(r.sales + o.total);
    r.orders++;
  }
  return rows;
}

export function salesByItem(orders: Order[]) {
  const map = new Map<string, { name: string; qty: number; sales: number; cost: number }>();
  for (const o of orders) {
    if (o.refunded) continue;
    // Spread order-level discounts across lines proportionally.
    const ratio = o.subtotal > 0 ? (o.subtotal - o.discountTotal) / o.subtotal : 0;
    for (const l of o.lines) {
      const row = map.get(l.itemId) ?? { name: l.name, qty: 0, sales: 0, cost: 0 };
      row.qty = round2(row.qty + l.qty);
      row.sales = round2(row.sales + l.price * l.qty * ratio);
      row.cost = round2(row.cost + (l.cost || 0) * l.qty);
      map.set(l.itemId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales);
}

export function salesByCategory(orders: Order[], categoryName: (id: string) => string) {
  const map = new Map<string, { name: string; qty: number; sales: number }>();
  for (const o of orders) {
    if (o.refunded) continue;
    const ratio = o.subtotal > 0 ? (o.subtotal - o.discountTotal) / o.subtotal : 0;
    for (const l of o.lines) {
      const row = map.get(l.categoryId) ?? { name: categoryName(l.categoryId), qty: 0, sales: 0 };
      row.qty = round2(row.qty + l.qty);
      row.sales = round2(row.sales + l.price * l.qty * ratio);
      map.set(l.categoryId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales);
}

export function salesByEmployee(orders: Order[]) {
  const map = new Map<string, { name: string; orders: number; sales: number }>();
  for (const o of orders) {
    if (o.refunded) continue;
    const row = map.get(o.employeeId) ?? { name: o.employeeName, orders: 0, sales: 0 };
    row.orders++;
    row.sales = round2(row.sales + o.total);
    map.set(o.employeeId, row);
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales);
}

/** Payments are grouped by the day they were received, so this is cash flow. */
export function paymentsByMethod(orders: Order[], from: number, to: number) {
  const map = new Map<string, { method: string; count: number; amount: number }>();
  for (const o of orders) {
    if (o.refunded) continue;
    for (const p of o.payments) {
      if (p.at < from || p.at > to) continue;
      const row = map.get(p.method) ?? { method: p.method, count: 0, amount: 0 };
      row.count++;
      row.amount = round2(row.amount + p.amount);
      map.set(p.method, row);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
