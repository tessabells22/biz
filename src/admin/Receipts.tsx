import { useState } from 'react';
import OrderDetailModal from '../components/OrderDetailModal';
import { Badge, Button, Empty, Input, PageHeader, PAY_META, STATUS_META, Table, fmtDate } from '../components/ui';
import { formatMoney, payStatus } from '../lib/calc';
import { download, toCsv } from '../lib/csv';
import { useSettings } from '../lib/hooks';
import RangePicker from './RangePicker';
import { useRange } from './useOrdersInRange';

export default function Receipts() {
  const settings = useSettings();
  const cur = settings.currency;
  const { key, setKey, custom, setCustom, orders } = useRange('7d');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const s = q.toLowerCase();
  const list = orders
    .filter((o) => !q || o.number.toLowerCase().includes(s) || (o.customerName ?? '').toLowerCase().includes(s))
    .sort((a, b) => b.createdAt - a.createdAt);

  const exportCsv = () =>
    download(
      'happi-bubbles-receipts.csv',
      toCsv(
        list.map((o) => ({
          number: o.number,
          date: new Date(o.createdAt).toISOString(),
          customer: o.customerName ?? '',
          phone: o.customerPhone ?? '',
          items: o.lines.map((l) => `${l.name} x${l.qty}`).join('; '),
          subtotal: o.subtotal,
          discount: o.discountTotal,
          total: o.total,
          paid: o.paid,
          balance: o.balance,
          payment: o.payments.map((p) => p.method).join('; '),
          status: o.status,
          refunded: o.refunded ? 'yes' : '',
          cashier: o.employeeName,
        })),
      ),
    );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Receipts"
        actions={
          <>
            <RangePicker value={key} onChange={setKey} custom={custom} onCustom={setCustom} />
            <Button variant="secondary" onClick={exportCsv}>
              ⬇ Export CSV
            </Button>
          </>
        }
      />
      <Input className="mb-3" placeholder="Search claim # or customer" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? (
        <Empty>No receipts in this period</Empty>
      ) : (
        <Table head={['#', 'Date', 'Customer', 'Total', 'Payment', 'Job', 'Cashier']}>
          {list.map((o) => {
            const ps = payStatus(o);
            return (
              <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer hover:bg-brand-50">
                <td className="px-3 py-2 font-bold text-navy">{o.number}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                <td className="px-3 py-2">{o.customerName ?? 'Walk-in'}</td>
                <td className="px-3 py-2 font-semibold">{formatMoney(o.total, cur)}</td>
                <td className="px-3 py-2">
                  <Badge color={PAY_META[ps].color}>{PAY_META[ps].label}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge color={STATUS_META[o.status].color}>{STATUS_META[o.status].label}</Badge>
                </td>
                <td className="px-3 py-2">{o.employeeName}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {open && <OrderDetailModal orderId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
