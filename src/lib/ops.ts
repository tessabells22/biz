import { db, getMeta, save, setMeta, SETTINGS_ID, uid } from './db';
import { computeTotals, pointsEarned, round2, sumPayments } from './calc';
import { DEFAULT_SETTINGS } from './seed';
import type {
  AppliedDiscount,
  Customer,
  Employee,
  Item,
  JobStatus,
  Order,
  OrderLine,
  Payment,
  Settings,
  Shift,
  StockMovement,
} from './types';

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(SETTINGS_ID)) ?? DEFAULT_SETTINGS;
}

export async function getDeviceCode(): Promise<string> {
  return getMeta('deviceCode', 'A');
}

export async function getDeviceName(): Promise<string> {
  return getMeta('deviceName', 'Counter 1');
}

/** Claim-slip number like A0924-007: device code + date + daily sequence. */
export async function nextOrderNumber(now = new Date()): Promise<string> {
  const code = await getDeviceCode();
  const day = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seqState = await getMeta<{ day: string; seq: number }>('orderSeq', { day: '', seq: 0 });
  const seq = seqState.day === day ? seqState.seq + 1 : 1;
  await setMeta('orderSeq', { day, seq });
  return `${code}${day}-${String(seq).padStart(3, '0')}`;
}

export async function currentShift(): Promise<Shift | undefined> {
  const id = await getMeta<string | null>('shiftId', null);
  if (!id) return undefined;
  const s = await db.shifts.get(id);
  return s && !s.closedAt && !s.deleted ? s : undefined;
}

async function recordStock(item: Item, qty: number, reason: StockMovement['reason'], by: string, note?: string) {
  const updated = { ...item, stock: round2(item.stock + qty) };
  await save('items', updated);
  await save<StockMovement>('stockMovements', {
    id: uid(),
    updatedAt: 0,
    itemId: item.id,
    itemName: item.name,
    qty,
    reason,
    note,
    at: Date.now(),
    employeeName: by,
  });
}

export async function adjustStock(itemId: string, qty: number, reason: StockMovement['reason'], by: string, note?: string) {
  const item = await db.items.get(itemId);
  if (item) await recordStock(item, qty, reason, by, note);
}

export interface NewOrderInput {
  lines: OrderLine[];
  discounts: AppliedDiscount[];
  customer?: Customer;
  pointsRedeemed: number;
  payment?: { method: string; amount: number };
  dueAt?: number;
  notes?: string;
  bags?: number;
  employee: Employee;
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  const settings = await getSettings();
  const shift = await currentShift();
  const totals = computeTotals(
    input.lines,
    input.discounts,
    input.pointsRedeemed * settings.pointValue,
    settings.taxRate,
    settings.taxIncluded,
  );
  const now = Date.now();
  const payments: Payment[] = [];
  if (input.payment && input.payment.amount > 0) {
    payments.push({
      method: input.payment.method,
      // Cash tendered above the total is change, not revenue.
      amount: Math.min(round2(input.payment.amount), totals.total),
      at: now,
      employeeId: input.employee.id,
      shiftId: shift?.id,
    });
  }
  const paid = sumPayments(payments);
  const hasService = input.lines.some((l) => l.unit !== 'item');
  const earned = input.customer ? pointsEarned(totals.total, settings) : 0;
  const order: Order = {
    id: uid(),
    updatedAt: now,
    number: await nextOrderNumber(),
    createdAt: now,
    employeeId: input.employee.id,
    employeeName: input.employee.name,
    customerId: input.customer?.id,
    customerName: input.customer?.name,
    customerPhone: input.customer?.phone,
    lines: input.lines,
    discounts: input.discounts,
    pointsRedeemed: input.pointsRedeemed,
    ...totals,
    payments,
    paid,
    balance: round2(totals.total - paid),
    // Retail-only sales (e.g. a bottle of detergent) are handed over right away.
    status: hasService ? 'received' : 'claimed',
    claimedAt: hasService ? undefined : now,
    dueAt: hasService ? input.dueAt : undefined,
    notes: input.notes,
    bags: input.bags,
    pointsEarned: earned,
    shiftId: shift?.id,
  };
  await save('orders', order);

  for (const line of input.lines) {
    const item = await db.items.get(line.itemId);
    if (item?.trackStock) await recordStock(item, -line.qty, 'sale', input.employee.name, `Order #${order.number}`);
  }

  if (input.customer) {
    const c = (await db.customers.get(input.customer.id)) ?? input.customer;
    await save('customers', {
      ...c,
      points: Math.max(0, c.points - input.pointsRedeemed + earned),
      visits: c.visits + 1,
      totalSpent: round2(c.totalSpent + totals.total),
    });
  }
  return order;
}

export async function addPayment(order: Order, method: string, amount: number, employee: Employee): Promise<Order> {
  const shift = await currentShift();
  const applied = Math.min(round2(amount), order.balance);
  if (applied <= 0) return order;
  const payments = [...order.payments, { method, amount: applied, at: Date.now(), employeeId: employee.id, shiftId: shift?.id }];
  const paid = sumPayments(payments);
  return save('orders', { ...order, payments, paid, balance: round2(order.total - paid) });
}

export async function setStatus(order: Order, status: JobStatus): Promise<Order> {
  return save('orders', {
    ...order,
    status,
    claimedAt: status === 'claimed' ? Date.now() : undefined,
  });
}

export async function refundOrder(order: Order, reason: string, employee: Employee): Promise<Order> {
  if (order.refunded) return order;
  for (const line of order.lines) {
    const item = await db.items.get(line.itemId);
    if (item?.trackStock) await recordStock(item, line.qty, 'refund', employee.name, `Refund #${order.number}`);
  }
  if (order.customerId) {
    const c = await db.customers.get(order.customerId);
    if (c) {
      await save('customers', {
        ...c,
        points: Math.max(0, c.points - order.pointsEarned + order.pointsRedeemed),
        visits: Math.max(0, c.visits - 1),
        totalSpent: Math.max(0, round2(c.totalSpent - order.total)),
      });
    }
  }
  const shift = await currentShift();
  return save('orders', {
    ...order,
    refunded: true,
    refundedAt: Date.now(),
    refundReason: reason,
    refundShiftId: shift?.id,
  });
}

export async function openShift(openingCash: number, employee: Employee): Promise<Shift> {
  const shift = await save<Shift>('shifts', {
    id: uid(),
    updatedAt: 0,
    deviceName: await getDeviceName(),
    openedAt: Date.now(),
    openedBy: employee.name,
    openingCash: round2(openingCash),
    cashMovements: [],
  });
  await setMeta('shiftId', shift.id);
  return shift;
}

export async function addCashMovement(shift: Shift, type: 'in' | 'out', amount: number, note: string, employee: Employee) {
  return save('shifts', {
    ...shift,
    cashMovements: [...shift.cashMovements, { type, amount: round2(amount), note, at: Date.now(), employeeName: employee.name }],
  });
}

export interface ShiftSummary {
  grossSales: number;
  cashSales: number;
  cashRefunds: number;
  byMethod: Record<string, number>;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
}

/** Cash expected in the drawer: opening + cash taken - cash refunded + paid in - paid out. */
export function summarizeShift(shift: Shift, orders: Order[]): ShiftSummary {
  const byMethod: Record<string, number> = {};
  let cashSales = 0;
  let grossSales = 0;
  let cashRefunds = 0;
  for (const o of orders) {
    for (const p of o.payments) {
      if (p.shiftId !== shift.id) continue;
      byMethod[p.method] = round2((byMethod[p.method] ?? 0) + p.amount);
      grossSales += p.amount;
      if (p.method === 'Cash') cashSales += p.amount;
    }
    if (o.refunded && o.refundShiftId === shift.id) {
      cashRefunds += o.payments.filter((p) => p.method === 'Cash').reduce((s, p) => s + p.amount, 0);
    }
  }
  const cashIn = shift.cashMovements.filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0);
  const cashOut = shift.cashMovements.filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0);
  return {
    grossSales: round2(grossSales),
    cashSales: round2(cashSales),
    cashRefunds: round2(cashRefunds),
    byMethod,
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    expectedCash: round2(shift.openingCash + cashSales - cashRefunds + cashIn - cashOut),
  };
}

export async function closeShift(shift: Shift, actualCash: number, employee: Employee): Promise<Shift> {
  const orders = await db.orders.toArray();
  const sum = summarizeShift(shift, orders);
  const closed = await save('shifts', {
    ...shift,
    closedAt: Date.now(),
    closedBy: employee.name,
    actualCash: round2(actualCash),
    expectedCash: sum.expectedCash,
    cashSales: sum.cashSales,
    cashRefunds: sum.cashRefunds,
    grossSales: sum.grossSales,
  });
  await setMeta('shiftId', null);
  return closed;
}
