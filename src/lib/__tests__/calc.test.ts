import { describe, expect, it } from 'vitest';
import { computeTotals, fillTemplate, formatMoney, payStatus, smsNumber } from '../calc';

describe('computeTotals', () => {
  const lines = [
    { price: 180, qty: 2 },
    { price: 35, qty: 4.5 },
  ];

  it('sums lines', () => {
    expect(computeTotals(lines, [], 0, 0, true)).toEqual({ subtotal: 517.5, discountTotal: 0, tax: 0, total: 517.5 });
  });

  it('applies percent then fixed discounts and points', () => {
    const t = computeTotals(
      lines,
      [
        { name: 'Senior', type: 'percent', value: 20 },
        { name: 'Less 20', type: 'amount', value: 20 },
      ],
      10,
      0,
      true,
    );
    expect(t.total).toBe(384);
    expect(t.discountTotal).toBe(133.5);
  });

  it('never goes below zero', () => {
    expect(computeTotals([{ price: 10, qty: 1 }], [{ name: 'x', type: 'amount', value: 50 }], 0, 0, true).total).toBe(0);
  });

  it('handles inclusive and added tax', () => {
    expect(computeTotals([{ price: 112, qty: 1 }], [], 0, 12, true)).toMatchObject({ tax: 12, total: 112 });
    expect(computeTotals([{ price: 100, qty: 1 }], [], 0, 12, false)).toMatchObject({ tax: 12, total: 112 });
  });
});

describe('helpers', () => {
  it('formats money', () => {
    expect(formatMoney(1234.5)).toBe('₱1,234.50');
    expect(formatMoney(-5)).toBe('-₱5.00');
  });
  it('derives pay status', () => {
    expect(payStatus({ paid: 100, total: 100 })).toBe('paid');
    expect(payStatus({ paid: 50, total: 100 })).toBe('partial');
    expect(payStatus({ paid: 0, total: 100 })).toBe('unpaid');
    expect(payStatus({ paid: 100, total: 100, refunded: true })).toBe('refunded');
  });
  it('fills message templates', () => {
    expect(fillTemplate('Hi {name}, #{number}', { name: 'Ana', number: 'A1' })).toBe('Hi Ana, #A1');
  });
  it('normalizes PH numbers', () => {
    expect(smsNumber('0917 123 4567')).toBe('+639171234567');
    expect(smsNumber('+63 917 123 4567')).toBe('+639171234567');
  });
});
