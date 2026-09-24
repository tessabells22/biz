import { useState } from 'react';
import { Badge, Card, Empty, Modal, PageHeader, Table, fmtDate } from '../components/ui';
import { formatMoney, round2 } from '../lib/calc';
import { useCollection, useSettings } from '../lib/hooks';
import type { Shift } from '../lib/types';

export default function Shifts() {
  const settings = useSettings();
  const cur = settings.currency;
  const shifts = useCollection<Shift>('shifts', (a, b) => b.openedAt - a.openedAt);
  const [open, setOpen] = useState<Shift | null>(null);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Shifts" />
      {shifts.length === 0 && <Empty>No shifts yet. Open one from the POS → Shift tab.</Empty>}
      {shifts.length > 0 && (
        <Table head={['Device', 'Opened', 'Closed', 'Payments', 'Expected cash', 'Counted', 'Difference']}>
          {shifts.map((s) => {
            const diff = s.closedAt ? round2((s.actualCash ?? 0) - (s.expectedCash ?? 0)) : 0;
            return (
              <tr key={s.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setOpen(s)}>
                <td className="px-3 py-2">{s.deviceName}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {fmtDate(s.openedAt)} <span className="text-gray-400">{s.openedBy}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{s.closedAt ? fmtDate(s.closedAt) : <Badge color="green">Open</Badge>}</td>
                <td className="px-3 py-2">{s.grossSales !== undefined ? formatMoney(s.grossSales, cur) : '—'}</td>
                <td className="px-3 py-2">{s.expectedCash !== undefined ? formatMoney(s.expectedCash, cur) : '—'}</td>
                <td className="px-3 py-2">{s.actualCash !== undefined ? formatMoney(s.actualCash, cur) : '—'}</td>
                <td className={`px-3 py-2 font-bold ${diff < 0 ? 'text-rose-600' : diff > 0 ? 'text-emerald-600' : ''}`}>
                  {s.closedAt ? formatMoney(diff, cur) : '—'}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {open && (
        <Modal open onClose={() => setOpen(null)} title={`Shift · ${open.deviceName}`}>
          <Card className="space-y-1 text-sm">
            <Row label="Opened" value={`${fmtDate(open.openedAt)} by ${open.openedBy}`} />
            {open.closedAt && <Row label="Closed" value={`${fmtDate(open.closedAt)} by ${open.closedBy}`} />}
            <Row label="Starting cash" value={formatMoney(open.openingCash, cur)} />
            {open.cashSales !== undefined && <Row label="Cash payments" value={formatMoney(open.cashSales, cur)} />}
            {open.cashRefunds !== undefined && <Row label="Cash refunds" value={formatMoney(open.cashRefunds, cur)} />}
            {open.cashMovements.map((m, i) => (
              <Row key={i} label={`${m.type === 'in' ? 'Pay in' : 'Pay out'}: ${m.note}`} value={`${m.type === 'out' ? '-' : ''}${formatMoney(m.amount, cur)}`} />
            ))}
            {open.expectedCash !== undefined && <Row label="Expected cash" value={formatMoney(open.expectedCash, cur)} />}
            {open.actualCash !== undefined && <Row label="Counted cash" value={formatMoney(open.actualCash, cur)} />}
          </Card>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
