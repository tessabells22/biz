import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Card, Field, Input, Modal, fmtDate } from '../components/ui';
import { formatMoney, round2 } from '../lib/calc';
import { db, getMeta } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { addCashMovement, closeShift, openShift, summarizeShift } from '../lib/ops';
import { useSession } from '../lib/session';
import type { Shift } from '../lib/types';

export default function ShiftPage() {
  const { employee } = useSession();
  const settings = useSettings();
  const cur = settings.currency;
  const data = useLiveQuery(async () => {
    const id = await getMeta<string | null>('shiftId', null);
    const shift = id ? await db.shifts.get(id) : undefined;
    const open = shift && !shift.closedAt && !shift.deleted ? shift : undefined;
    const orders = open ? await db.orders.where('createdAt').aboveOrEqual(open.openedAt - 90 * 86400000).toArray() : [];
    return { shift: open, orders };
  }, []);
  const [opening, setOpening] = useState('');
  const [move, setMove] = useState<'in' | 'out' | null>(null);
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [closed, setClosed] = useState<Shift | null>(null);

  if (!data || !employee) return null;
  const { shift, orders } = data;

  if (!shift) {
    return (
      <div className="mx-auto max-w-md p-4">
        {closed && (
          <Card className="mb-4">
            <h3 className="font-display text-lg font-bold text-navy">Shift closed</h3>
            <Row label="Expected cash" value={formatMoney(closed.expectedCash ?? 0, cur)} />
            <Row label="Counted cash" value={formatMoney(closed.actualCash ?? 0, cur)} />
            <Row
              label="Difference"
              value={formatMoney(round2((closed.actualCash ?? 0) - (closed.expectedCash ?? 0)), cur)}
              bold
            />
          </Card>
        )}
        <Card>
          <h2 className="mb-1 font-display text-xl font-bold text-navy">Open a shift</h2>
          <p className="mb-4 text-sm text-gray-500">Count the cash in the drawer before starting.</p>
          <Field label="Starting cash">
            <Input type="number" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
          </Field>
          <Button className="mt-4 w-full" size="lg" onClick={() => openShift(Number(opening) || 0, employee)}>
            Open shift
          </Button>
        </Card>
      </div>
    );
  }

  const sum = summarizeShift(shift, orders);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-navy">Shift open</h2>
            <p className="text-sm text-gray-500">
              {shift.deviceName} · since {fmtDate(shift.openedAt)} by {shift.openedBy}
            </p>
          </div>
          <Button variant="danger" onClick={() => setClosing(true)}>
            Close shift
          </Button>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-sm text-gray-500">Payments taken</div>
          <div className="font-display text-2xl font-bold text-brand-600">{formatMoney(sum.grossSales, cur)}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Expected cash in drawer</div>
          <div className="font-display text-2xl font-bold text-emerald-600">{formatMoney(sum.expectedCash, cur)}</div>
        </Card>
      </div>
      <Card>
        <h3 className="mb-2 font-bold text-navy">Cash drawer</h3>
        <Row label="Starting cash" value={formatMoney(shift.openingCash, cur)} />
        <Row label="Cash payments" value={formatMoney(sum.cashSales, cur)} />
        <Row label="Cash refunds" value={`-${formatMoney(sum.cashRefunds, cur)}`} />
        <Row label="Paid in" value={formatMoney(sum.cashIn, cur)} />
        <Row label="Paid out" value={`-${formatMoney(sum.cashOut, cur)}`} />
        <Row label="Expected" value={formatMoney(sum.expectedCash, cur)} bold />
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setMove('in')}>
            + Pay in
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setMove('out')}>
            − Pay out
          </Button>
        </div>
      </Card>
      <Card>
        <h3 className="mb-2 font-bold text-navy">By payment method</h3>
        {Object.entries(sum.byMethod).map(([m, v]) => (
          <Row key={m} label={m} value={formatMoney(v, cur)} />
        ))}
        {Object.keys(sum.byMethod).length === 0 && <p className="text-sm text-gray-500">No payments yet</p>}
      </Card>
      {shift.cashMovements.length > 0 && (
        <Card>
          <h3 className="mb-2 font-bold text-navy">Pay in / out</h3>
          {shift.cashMovements.map((m, i) => (
            <Row key={i} label={`${fmtDate(m.at)} · ${m.note || (m.type === 'in' ? 'Pay in' : 'Pay out')}`} value={`${m.type === 'out' ? '-' : ''}${formatMoney(m.amount, cur)}`} />
          ))}
        </Card>
      )}

      <Modal
        open={!!move}
        onClose={() => setMove(null)}
        title={move === 'in' ? 'Pay in' : 'Pay out'}
        footer={
          <Button
            className="flex-1"
            disabled={!(Number(amt) > 0)}
            onClick={async () => {
              await addCashMovement(shift, move!, Number(amt), note, employee);
              setMove(null);
              setAmt('');
              setNote('');
            }}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Amount">
            <Input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={move === 'out' ? 'e.g. bought detergent, LPG' : 'e.g. added change fund'} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title="Close shift"
        footer={
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              const c = await closeShift(shift, Number(counted) || 0, employee);
              setClosing(false);
              setCounted('');
              setClosed(c);
            }}
          >
            Close shift
          </Button>
        }
      >
        <p className="mb-3 text-sm text-gray-600">
          Expected cash: <b>{formatMoney(sum.expectedCash, cur)}</b>
        </p>
        <Field label="Actual cash counted">
          <Input type="number" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
        {counted && (
          <p className="mt-2 text-center font-bold">
            Difference: {formatMoney(round2(Number(counted) - sum.expectedCash), cur)}
          </p>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${bold ? 'border-t border-brand-100 pt-1 font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}
