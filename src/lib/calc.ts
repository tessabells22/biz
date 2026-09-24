import type { AppliedDiscount, Order, OrderLine, Payment, Settings } from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function formatMoney(n: number, currency = '₱'): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency}${Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface Totals {
  subtotal: number;
  discountTotal: number;
  tax: number;
  total: number;
}

/**
 * Discounts apply in order: percent discounts on the running amount, fixed
 * amounts subtracted, then redeemed points. The total never goes below zero.
 */
export function computeTotals(
  lines: Pick<OrderLine, 'price' | 'qty'>[],
  discounts: AppliedDiscount[],
  pointsValue: number,
  taxRate: number,
  taxIncluded: boolean,
): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  let running = subtotal;
  for (const d of discounts) {
    const cut = d.type === 'percent' ? (running * d.value) / 100 : d.value;
    running = Math.max(0, running - cut);
  }
  running = Math.max(0, running - pointsValue);
  running = round2(running);
  const discountTotal = round2(subtotal - running);
  let tax = 0;
  let total = running;
  if (taxRate > 0) {
    if (taxIncluded) {
      tax = round2((running * taxRate) / (100 + taxRate));
    } else {
      tax = round2((running * taxRate) / 100);
      total = round2(running + tax);
    }
  }
  return { subtotal, discountTotal, tax, total };
}

export function sumPayments(payments: Payment[]): number {
  return round2(payments.reduce((s, p) => s + p.amount, 0));
}

export type PayStatus = 'paid' | 'partial' | 'unpaid' | 'refunded';

export function payStatus(o: Pick<Order, 'paid' | 'total' | 'refunded'>): PayStatus {
  if (o.refunded) return 'refunded';
  if (o.paid >= o.total - 0.001) return 'paid';
  if (o.paid > 0) return 'partial';
  return 'unpaid';
}

export function pointsEarned(total: number, settings: Pick<Settings, 'pointsPerCurrency'>): number {
  return Math.floor(total * settings.pointsPerCurrency);
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Normalize a PH mobile number for sms: links (09xx -> +639xx). */
export function smsNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('09') && digits.length === 11) return '+63' + digits.slice(1);
  return digits;
}
