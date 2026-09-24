import Dexie, { type Table } from 'dexie';
import type {
  Base,
  Category,
  CollectionName,
  Customer,
  Discount,
  Employee,
  Item,
  Order,
  Settings,
  Shift,
  StockMovement,
} from './types';

export interface Meta {
  key: string;
  value: unknown;
}

class HappiDB extends Dexie {
  employees!: Table<Employee, string>;
  categories!: Table<Category, string>;
  items!: Table<Item, string>;
  discounts!: Table<Discount, string>;
  customers!: Table<Customer, string>;
  orders!: Table<Order, string>;
  shifts!: Table<Shift, string>;
  stockMovements!: Table<StockMovement, string>;
  settings!: Table<Settings, string>;
  /** Device-local values that never sync. */
  meta!: Table<Meta, string>;

  constructor() {
    super('happi-bubbles');
    this.version(1).stores({
      employees: 'id, dirty',
      categories: 'id, dirty',
      items: 'id, categoryId, dirty',
      discounts: 'id, dirty',
      customers: 'id, phone, dirty',
      orders: 'id, number, createdAt, status, customerId, shiftId, dirty',
      shifts: 'id, openedAt, dirty',
      stockMovements: 'id, itemId, at, dirty',
      settings: 'id, dirty',
      meta: 'key',
    });
  }
}

export const db = new HappiDB();

export function table<T extends Base>(name: CollectionName): Table<T, string> {
  return db.table(name) as Table<T, string>;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Called after any local write so the sync engine can push soon. */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** Insert or update a record, stamping it for sync. */
export async function save<T extends Base>(name: CollectionName, record: T): Promise<T> {
  const next = { ...record, updatedAt: Date.now(), dirty: 1 as const };
  await table<T>(name).put(next);
  notify();
  return next;
}

export async function saveMany<T extends Base>(name: CollectionName, records: T[]): Promise<void> {
  const now = Date.now();
  await table<T>(name).bulkPut(records.map((r) => ({ ...r, updatedAt: now, dirty: 1 as const })));
  notify();
}

export async function remove(name: CollectionName, id: string): Promise<void> {
  const t = table<Base>(name);
  const existing = await t.get(id);
  if (!existing) return;
  await t.put({ ...existing, deleted: 1, updatedAt: Date.now(), dirty: 1 });
  notify();
}

/** All non-deleted records in a collection. */
export async function all<T extends Base>(name: CollectionName): Promise<T[]> {
  return (await table<T>(name).toArray()).filter((r) => !r.deleted);
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export const SETTINGS_ID = 'settings';
