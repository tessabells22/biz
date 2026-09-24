import { useState } from 'react';
import { fillTemplate, formatMoney, payStatus, smsNumber } from '../lib/calc';
import { db } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { addPayment, refundOrder, setStatus } from '../lib/ops';
import { useSession } from '../lib/session';
import { JOB_STATUSES, type Order } from '../lib/types';
import { useLiveQuery } from 'dexie-react-hooks';
import ReceiptView, { receiptText } from './ReceiptView';
import { shareReceipt } from './ReceiptModal';
import { Badge, Button, Field, Input, Modal, PAY_META, STATUS_META, fmtDate } from './ui';

export function readyMessage(o: Order, tpl: string, currency: string) {
  return fillTemplate(tpl, {
    name: o.customerName?.split(' ')[0] ?? 'there',
    number: o.number,
    balance: formatMoney(o.balance, currency),
    total: formatMoney(o.total, currency),
  });
}

export default function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useLiveQuery(() => db.orders.get(orderId), [orderId]);
  const settings = useSettings();
  const { employee, canManage } = useSession();
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState(settings.paymentMethods[0] ?? 'Cash');
  const [amount, setAmount] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  if (!order || !employee) return null;
  const cur = settings.currency;
  const ps = payStatus(order);
  const idx = JOB_STATUSES.indexOf(order.status);
  const next = JOB_STATUSES[idx + 1];

  const sms = order.customerPhone
    ? `sms:${smsNumber(order.customerPhone)}?body=${encodeURIComponent(readyMessage(order, settings.readyMessage, cur))}`
    : undefined;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          #{order.number} <Badge color={STATUS_META[order.status].color}>{STATUS_META[order.status].label}</Badge>
          <Badge color={PAY_META[ps].color}>{PAY_META[ps].label}</Badge>
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowReceipt(true)}>
            🧾 Receipt
          </Button>
          {sms && (
            <a href={sms}>
              <Button variant="secondary" size="sm">
                💬 Text customer
              </Button>
            </a>
          )}
          {canManage && !order.refunded && (
            <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => setRefunding(true)}>
              Refund
            </Button>
          )}
          <div className="flex-1" />
          {!order.refunded && order.balance > 0 && (
            <Button
              variant="accent"
              onClick={() => {
                setAmount(String(order.balance));
                setPaying(true);
              }}
            >
              Collect {formatMoney(order.balance, cur)}
            </Button>
          )}
          {!order.refunded && next && (
            <Button onClick={() => setStatus(order, next)}>
              {STATUS_META[next].emoji} Mark {STATUS_META[next].label}
            </Button>
          )}
        </div>
      }
    >
      {order.refunded && (
        <div className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          Refunded {fmtDate(order.refundedAt)} {order.refundReason && `· ${order.refundReason}`}
        </div>
      )}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {JOB_STATUSES.map((s, i) => (
          <button
            key={s}
            disabled={order.refunded}
            onClick={() => setStatus(order, s)}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold whitespace-nowrap ${i <= idx ? 'bg-brand-500 text-white' : 'bg-brand-50 text-navy/60'}`}
          >
            {STATUS_META[s].emoji} {STATUS_META[s].label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <Info label="Customer" value={order.customerName ? `${order.customerName} ${order.customerPhone ?? ''}` : 'Walk-in'} />
          <Info label="Received" value={fmtDate(order.createdAt)} />
          {order.dueAt && <Info label="Due" value={fmtDate(order.dueAt)} />}
          {order.claimedAt && <Info label="Claimed" value={fmtDate(order.claimedAt)} />}
          <Info label="Cashier" value={order.employeeName} />
          {order.bags ? <Info label="Bags" value={String(order.bags)} /> : null}
          {order.notes && <Info label="Notes" value={order.notes} />}
        </div>
        <div className="rounded-xl bg-brand-50 p-3 text-sm">
          {order.lines.map((l, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {l.name} × {l.qty}
              </span>
              <span>{formatMoney(l.qty * l.price, cur)}</span>
            </div>
          ))}
          <div className="my-1 border-t border-brand-200" />
          {order.discountTotal > 0 && <Info label="Discount" value={`-${formatMoney(order.discountTotal, cur)}`} />}
          <Info label="Total" value={formatMoney(order.total, cur)} bold />
          {order.payments.map((p, i) => (
            <Info key={i} label={`${p.method} · ${fmtDate(p.at)}`} value={formatMoney(p.amount, cur)} />
          ))}
          {order.balance > 0 && <Info label="Balance" value={formatMoney(order.balance, cur)} bold />}
        </div>
      </div>

      <Modal
        open={paying}
        onClose={() => setPaying(false)}
        title="Collect payment"
        footer={
          <Button
            className="flex-1"
            onClick={async () => {
              await addPayment(order, method, Number(amount) || 0, employee);
              setPaying(false);
            }}
          >
            Save payment
          </Button>
        }
      >
        <div className="mb-3 grid grid-cols-3 gap-2">
          {settings.paymentMethods.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-xl px-2 py-2 font-bold ring-2 ${method === m ? 'bg-brand-500 text-white ring-brand-500' : 'ring-brand-100'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <Field label="Amount">
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-center text-2xl" />
        </Field>
        {method === 'Cash' && Number(amount) > order.balance && (
          <p className="mt-2 text-center font-bold text-emerald-600">Change: {formatMoney(Number(amount) - order.balance, cur)}</p>
        )}
      </Modal>

      <Modal
        open={refunding}
        onClose={() => setRefunding(false)}
        title="Refund order"
        footer={
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              await refundOrder(order, reason, employee);
              setRefunding(false);
            }}
          >
            Refund {formatMoney(order.paid, cur)}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-gray-600">This voids the order, returns stock, and reverses customer points.</p>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer cancelled" />
        </Field>
      </Modal>

      <Modal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        title="Receipt"
        footer={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              🖨️ Print
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => shareReceipt(receiptText(order, settings))}>
              📤 Share
            </Button>
          </>
        }
      >
        <ReceiptView order={order} />
      </Modal>
    </Modal>
  );
}

function Info({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
