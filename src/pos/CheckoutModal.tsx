import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '../components/ui';
import { formatMoney, round2 } from '../lib/calc';
import { useSettings } from '../lib/hooks';
import { createOrder, type NewOrderInput } from '../lib/ops';
import { useSession } from '../lib/session';
import type { Order } from '../lib/types';

export function quickCash(total: number): number[] {
  const bills = [20, 50, 100, 200, 500, 1000];
  const opts = new Set<number>([total]);
  for (const b of bills) {
    const v = Math.ceil(total / b) * b;
    if (v > total) opts.add(v);
  }
  return [...opts].sort((a, b) => a - b).slice(0, 4);
}

export default function CheckoutModal({
  open,
  onClose,
  draft,
  total,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  draft: Omit<NewOrderInput, 'employee' | 'payment'>;
  total: number;
  onDone: (o: Order) => void;
}) {
  const settings = useSettings();
  const { employee } = useSession();
  const cur = settings.currency;
  const [method, setMethod] = useState('Cash');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(total));
      setMethod(settings.paymentMethods[0] ?? 'Cash');
    }
  }, [open, total, settings.paymentMethods]);

  const tendered = Number(amount) || 0;
  const change = method === 'Cash' ? Math.max(0, round2(tendered - total)) : 0;
  const balance = Math.max(0, round2(total - tendered));

  const finish = async (payLater: boolean) => {
    if (!employee) return;
    setBusy(true);
    try {
      const order = await createOrder({
        ...draft,
        employee,
        payment: payLater ? undefined : { method, amount: tendered },
      });
      onDone(order);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Charge ${formatMoney(total, cur)}`}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => finish(true)}>
            Pay on pickup
          </Button>
          <Button variant="accent" className="flex-1" size="lg" disabled={busy || tendered <= 0} onClick={() => finish(false)}>
            {balance > 0 ? `Take ${formatMoney(tendered, cur)} (partial)` : 'Complete sale'}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {settings.paymentMethods.map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-xl px-3 py-3 font-bold ring-2 ${method === m ? 'bg-brand-500 text-white ring-brand-500' : 'text-navy ring-brand-100'}`}
          >
            {m}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-semibold text-navy/80">Amount received</label>
      <Input
        inputMode="decimal"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="text-center font-display text-3xl"
      />
      {method === 'Cash' && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {quickCash(total).map((v) => (
            <button key={v} onClick={() => setAmount(String(v))} className="rounded-lg bg-brand-50 py-2 text-sm font-bold text-navy">
              {formatMoney(v, cur)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-center">
        {change > 0 && (
          <div>
            <div className="text-sm font-semibold text-gray-500">Change</div>
            <div className="font-display text-4xl font-extrabold text-emerald-600">{formatMoney(change, cur)}</div>
          </div>
        )}
        {balance > 0 && (
          <div>
            <div className="text-sm font-semibold text-gray-500">Balance to collect on pickup</div>
            <div className="font-display text-3xl font-extrabold text-rose-500">{formatMoney(balance, cur)}</div>
          </div>
        )}
        {change === 0 && balance === 0 && <div className="font-bold text-emerald-600">Exact amount 👍</div>}
      </div>
    </Modal>
  );
}
