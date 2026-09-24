import { formatMoney, payStatus } from '../lib/calc';
import { useSettings } from '../lib/hooks';
import type { Order, Settings } from '../lib/types';
import { fmtDate } from './ui';

export function receiptText(o: Order, s: Settings): string {
  const cur = s.currency;
  const lines = [
    s.shopName,
    s.address,
    s.phone,
    s.receiptHeader,
    '',
    `Order #${o.number}`,
    fmtDate(o.createdAt),
    o.customerName ? `Customer: ${o.customerName}` : '',
    '',
    ...o.lines.map((l) => `${l.name}\n  ${l.qty} x ${formatMoney(l.price, cur)} = ${formatMoney(l.qty * l.price, cur)}`),
    '',
    `Subtotal: ${formatMoney(o.subtotal, cur)}`,
    o.discountTotal ? `Discount: -${formatMoney(o.discountTotal, cur)}` : '',
    `TOTAL: ${formatMoney(o.total, cur)}`,
    `Paid: ${formatMoney(o.paid, cur)}`,
    o.balance > 0 ? `Balance: ${formatMoney(o.balance, cur)}` : '',
    o.dueAt ? `Ready by: ${fmtDate(o.dueAt)}` : '',
    '',
    s.receiptFooter,
  ];
  return lines.filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
}

export default function ReceiptView({ order: o }: { order: Order }) {
  const s = useSettings();
  const cur = s.currency;
  const status = payStatus(o);
  return (
    <div className="print-area mx-auto max-w-xs font-mono text-[13px] leading-snug text-black">
      <div className="text-center">
        <img src="./logo.png" alt="" className="mx-auto mb-1 h-16 w-16" />
        <div className="text-base font-bold">{s.shopName}</div>
        {s.address && <div>{s.address}</div>}
        {s.phone && <div>{s.phone}</div>}
        {s.receiptHeader && <div className="italic">{s.receiptHeader}</div>}
      </div>
      <Dash />
      <div className="text-center text-lg font-bold">CLAIM #{o.number}</div>
      <div>{fmtDate(o.createdAt)}</div>
      <div>Cashier: {o.employeeName}</div>
      {o.customerName && (
        <div>
          Customer: {o.customerName} {o.customerPhone && `(${o.customerPhone})`}
        </div>
      )}
      {o.bags ? <div>Bags: {o.bags}</div> : null}
      <Dash />
      {o.lines.map((l, i) => (
        <div key={i}>
          <div>{l.name}</div>
          <div className="flex justify-between pl-2">
            <span>
              {l.qty} × {formatMoney(l.price, cur)}
            </span>
            <span>{formatMoney(l.qty * l.price, cur)}</span>
          </div>
        </div>
      ))}
      <Dash />
      <Line label="Subtotal" value={formatMoney(o.subtotal, cur)} />
      {o.discounts.map((d, i) => (
        <Line key={i} label={`  ${d.name}`} value={d.type === 'percent' ? `${d.value}%` : `-${formatMoney(d.value, cur)}`} />
      ))}
      {o.pointsRedeemed > 0 && <Line label="  Points used" value={String(o.pointsRedeemed)} />}
      {o.discountTotal > 0 && <Line label="Discount" value={`-${formatMoney(o.discountTotal, cur)}`} />}
      {o.tax > 0 && <Line label={s.taxIncluded ? 'VAT incl.' : 'Tax'} value={formatMoney(o.tax, cur)} />}
      <div className="flex justify-between text-base font-bold">
        <span>TOTAL</span>
        <span>{formatMoney(o.total, cur)}</span>
      </div>
      {o.payments.map((p, i) => (
        <Line key={i} label={p.method} value={formatMoney(p.amount, cur)} />
      ))}
      {o.balance > 0 && !o.refunded && (
        <div className="flex justify-between font-bold">
          <span>BALANCE DUE</span>
          <span>{formatMoney(o.balance, cur)}</span>
        </div>
      )}
      <div className="mt-1 text-center font-bold uppercase">{status}</div>
      {o.dueAt && <div className="text-center">Ready by: {fmtDate(o.dueAt)}</div>}
      {o.notes && <div className="mt-1">Notes: {o.notes}</div>}
      {o.pointsEarned > 0 && <div className="text-center">You earned {o.pointsEarned} point(s)!</div>}
      <Dash />
      <div className="text-center">{s.receiptFooter}</div>
    </div>
  );
}

function Dash() {
  return <div className="my-1 border-t border-dashed border-black" />;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="whitespace-pre">{label}</span>
      <span>{value}</span>
    </div>
  );
}
