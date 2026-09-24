/** Every synced record carries these fields. */
export interface Base {
  id: string;
  updatedAt: number;
  /** 1 when changed locally and not yet pushed to the cloud. */
  dirty?: 0 | 1;
  /** Soft delete so deletions can sync to other devices. */
  deleted?: 0 | 1;
}

export type Role = 'owner' | 'manager' | 'cashier';

export interface Employee extends Base {
  name: string;
  pin: string;
  role: Role;
  active: boolean;
}

export interface Category extends Base {
  name: string;
  color: string;
  sort: number;
}

export type Unit = 'load' | 'kg' | 'pc' | 'item';

export interface Item extends Base {
  name: string;
  categoryId: string;
  price: number;
  cost: number;
  unit: Unit;
  sku?: string;
  color: string;
  trackStock: boolean;
  stock: number;
  lowStock: number;
  /** Laundry services create a job to track; retail add-ons don't need to. */
  isService: boolean;
  active: boolean;
}

export interface Discount extends Base {
  name: string;
  type: 'percent' | 'amount';
  value: number;
}

export interface Customer extends Base {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  points: number;
  visits: number;
  totalSpent: number;
}

export interface OrderLine {
  itemId: string;
  name: string;
  price: number;
  qty: number;
  unit: Unit;
  cost: number;
  categoryId: string;
}

export interface AppliedDiscount {
  name: string;
  type: 'percent' | 'amount';
  value: number;
}

export interface Payment {
  method: string;
  amount: number;
  at: number;
  employeeId: string;
  shiftId?: string;
}

export type JobStatus = 'received' | 'washing' | 'drying' | 'folding' | 'ready' | 'claimed';

export const JOB_STATUSES: JobStatus[] = ['received', 'washing', 'drying', 'folding', 'ready', 'claimed'];

export interface Order extends Base {
  number: string;
  createdAt: number;
  employeeId: string;
  employeeName: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  lines: OrderLine[];
  discounts: AppliedDiscount[];
  pointsRedeemed: number;
  subtotal: number;
  discountTotal: number;
  tax: number;
  total: number;
  payments: Payment[];
  paid: number;
  balance: number;
  status: JobStatus;
  dueAt?: number;
  claimedAt?: number;
  notes?: string;
  bags?: number;
  pointsEarned: number;
  refunded?: boolean;
  refundedAt?: number;
  refundReason?: string;
  refundShiftId?: string;
  shiftId?: string;
}

export interface CashMovement {
  type: 'in' | 'out';
  amount: number;
  note: string;
  at: number;
  employeeName: string;
}

export interface Shift extends Base {
  deviceName: string;
  openedAt: number;
  openedBy: string;
  closedAt?: number;
  closedBy?: string;
  openingCash: number;
  cashMovements: CashMovement[];
  /** Filled at close time. */
  expectedCash?: number;
  actualCash?: number;
  cashSales?: number;
  cashRefunds?: number;
  grossSales?: number;
}

export interface StockMovement extends Base {
  itemId: string;
  itemName: string;
  qty: number;
  reason: 'receive' | 'sale' | 'refund' | 'adjust' | 'loss';
  note?: string;
  at: number;
  employeeName: string;
}

export interface Settings extends Base {
  shopName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  taxIncluded: boolean;
  receiptHeader: string;
  receiptFooter: string;
  paymentMethods: string[];
  /** Points earned per 1 unit of currency spent (e.g. 0.01 = 1 point per 100). */
  pointsPerCurrency: number;
  /** Currency value of one point when redeemed. */
  pointValue: number;
  defaultTurnaroundHours: number;
  readyMessage: string;
}

export const COLLECTIONS = [
  'employees',
  'categories',
  'items',
  'discounts',
  'customers',
  'orders',
  'shifts',
  'stockMovements',
  'settings',
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];
