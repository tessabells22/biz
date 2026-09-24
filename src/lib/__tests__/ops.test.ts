import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { addPayment, closeShift, createOrder, openShift, refundOrder, summarizeShift } from '../ops';
import { summarize } from '../reports';
import { seedIfEmpty } from '../seed';
import type { Customer, Employee, OrderLine } from '../types';

let owner: Employee;

const line = async (name: string, qty: number): Promise<OrderLine> => {
  const item = (await db.items.toArray()).find((i) => i.name === name)!;
  return { itemId: item.id, name: item.name, price: item.price, qty, unit: item.unit, cost: item.cost, categoryId: item.categoryId };
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfEmpty();
  owner = (await db.employees.toArray())[0];
});

describe('order lifecycle', () => {
  it('creates an order, deducts stock, and awards points', async () => {
    const customer: Customer = { id: 'c1', updatedAt: 0, name: 'Ana', phone: '09171234567', points: 0, visits: 0, totalSpent: 0 };
    await db.customers.put(customer);
    const before = (await db.items.toArray()).find((i) => i.name === 'Detergent')!.stock;

    const order = await createOrder({
      lines: [await line('Full Service (Wash-Dry-Fold)', 2), await line('Detergent', 2)],
      discounts: [],
      customer,
      pointsRedeemed: 0,
      payment: { method: 'Cash', amount: 500 },
      employee: owner,
    });

    expect(order.total).toBe(390);
    expect(order.paid).toBe(390); // change is not revenue
    expect(order.balance).toBe(0);
    expect(order.status).toBe('received');
    expect(order.number).toMatch(/^A\d{4}-001$/);
    expect((await db.items.get(order.lines[1].itemId))!.stock).toBe(before - 2);
    const c = (await db.customers.get('c1'))!;
    expect(c.points).toBe(3);
    expect(c.visits).toBe(1);
  });

  it('supports pay on pickup and refunds', async () => {
    const order = await createOrder({
      lines: [await line('Per Kilo Service', 6.5)],
      discounts: [],
      pointsRedeemed: 0,
      employee: owner,
    });
    expect(order.total).toBe(227.5);
    expect(order.balance).toBe(227.5);
    const paid = await addPayment(order, 'GCash', 227.5, owner);
    expect(paid.balance).toBe(0);
    const refunded = await refundOrder(paid, 'test', owner);
    expect(refunded.refunded).toBe(true);
    expect(summarize([refunded]).netSales).toBe(0);
  });

  it('marks retail-only sales as claimed immediately', async () => {
    const order = await createOrder({ lines: [await line('Laundry Bag', 1)], discounts: [], pointsRedeemed: 0, employee: owner });
    expect(order.status).toBe('claimed');
  });
});

describe('shifts', () => {
  it('computes expected cash', async () => {
    const shift = await openShift(1000, owner);
    await createOrder({
      lines: [await line('Wash Only', 1)],
      discounts: [],
      pointsRedeemed: 0,
      payment: { method: 'Cash', amount: 100 },
      employee: owner,
    });
    await createOrder({
      lines: [await line('Dry Only', 1)],
      discounts: [],
      pointsRedeemed: 0,
      payment: { method: 'GCash', amount: 60 },
      employee: owner,
    });
    const s = await db.shifts.get(shift.id);
    const sum = summarizeShift(s!, await db.orders.toArray());
    expect(sum.cashSales).toBe(60);
    expect(sum.expectedCash).toBe(1060);
    expect(sum.byMethod).toEqual({ Cash: 60, GCash: 60 });
    const closed = await closeShift(s!, 1050, owner);
    expect(closed.expectedCash).toBe(1060);
    expect(closed.actualCash).toBe(1050);
  });
});
