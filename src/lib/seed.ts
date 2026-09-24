import { db, SETTINGS_ID, uid } from './db';
import type { Category, Discount, Employee, Item, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  updatedAt: 0,
  shopName: 'Happi Bubbles',
  address: '',
  phone: '',
  currency: '₱',
  taxRate: 0,
  taxIncluded: true,
  receiptHeader: 'Laundry made happy!',
  receiptFooter: 'Thank you! Please present this claim slip when picking up.',
  paymentMethods: ['Cash', 'GCash', 'Maya', 'Card', 'Bank Transfer'],
  pointsPerCurrency: 0.01,
  pointValue: 1,
  defaultTurnaroundHours: 24,
  readyMessage:
    'Hi {name}! Your laundry (order #{number}) at Happi Bubbles is ready for pickup. Balance due: {balance}. Thank you!',
};

/** Fill an empty database with a starter catalog the owner can edit. */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.employees.count();
  if (count > 0) return;
  const now = Date.now();
  const base = { updatedAt: now, dirty: 1 as const };

  const owner: Employee = { ...base, id: uid(), name: 'Owner', pin: '1234', role: 'owner', active: true };

  const cats: Category[] = [
    { ...base, id: uid(), name: 'Wash & Dry', color: '#38bdf8', sort: 1 },
    { ...base, id: uid(), name: 'Special Items', color: '#a78bfa', sort: 2 },
    { ...base, id: uid(), name: 'Add-ons', color: '#86efac', sort: 3 },
    { ...base, id: uid(), name: 'Supplies', color: '#fdba74', sort: 4 },
  ];
  const [wash, special, addon, supply] = cats.map((c) => c.id);

  const item = (
    name: string,
    categoryId: string,
    price: number,
    unit: Item['unit'],
    isService: boolean,
    color: string,
    stock?: number,
  ): Item => ({
    ...base,
    id: uid(),
    name,
    categoryId,
    price,
    cost: 0,
    unit,
    color,
    isService,
    trackStock: stock !== undefined,
    stock: stock ?? 0,
    lowStock: stock !== undefined ? 10 : 0,
    active: true,
  });

  const items: Item[] = [
    item('Full Service (Wash-Dry-Fold)', wash, 180, 'load', true, '#38bdf8'),
    item('Wash Only', wash, 60, 'load', true, '#7dd3fc'),
    item('Dry Only', wash, 60, 'load', true, '#7dd3fc'),
    item('Fold Only', wash, 30, 'load', true, '#bae6fd'),
    item('Per Kilo Service', wash, 35, 'kg', true, '#0ea5e9'),
    item('Comforter / Blanket', special, 250, 'pc', true, '#a78bfa'),
    item('Curtains', special, 150, 'kg', true, '#c4b5fd'),
    item('Ironing', special, 15, 'pc', true, '#ddd6fe'),
    item('Extra Rinse', addon, 20, 'load', true, '#86efac'),
    item('Stain Treatment', addon, 30, 'pc', true, '#bbf7d0'),
    item('Detergent', supply, 15, 'item', false, '#fdba74', 100),
    item('Fabric Conditioner', supply, 15, 'item', false, '#fed7aa', 100),
    item('Color-safe Bleach', supply, 12, 'item', false, '#ffedd5', 50),
    item('Laundry Bag', supply, 25, 'item', false, '#fb923c', 30),
  ];

  const discounts: Discount[] = [
    { ...base, id: uid(), name: 'Senior / PWD', type: 'percent', value: 20 },
    { ...base, id: uid(), name: 'Suki 10%', type: 'percent', value: 10 },
    { ...base, id: uid(), name: 'Less ₱20', type: 'amount', value: 20 },
  ];

  await db.transaction('rw', [db.employees, db.categories, db.items, db.discounts, db.settings], async () => {
    await db.employees.put(owner);
    await db.categories.bulkPut(cats);
    await db.items.bulkPut(items);
    await db.discounts.bulkPut(discounts);
    if (!(await db.settings.get(SETTINGS_ID))) await db.settings.put({ ...DEFAULT_SETTINGS, ...base });
  });
}
