import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import OrderDetailModal from '../components/OrderDetailModal';
import { Badge, Button, Field, Input, Modal, PageHeader, Table, Textarea, fmtDate } from '../components/ui';
import { formatMoney } from '../lib/calc';
import { download, toCsv } from '../lib/csv';
import { db, remove, save, uid } from '../lib/db';
import { byName, useCollection, useSettings } from '../lib/hooks';
import { useSession } from '../lib/session';
import type { Customer } from '../lib/types';

const blank = (): Customer => ({ id: '', updatedAt: 0, name: '', phone: '', points: 0, visits: 0, totalSpent: 0 });

export default function Customers() {
  const settings = useSettings();
  const { canManage } = useSession();
  const customers = useCollection<Customer>('customers', byName);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Customer | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const cur = settings.currency;
  const s = q.toLowerCase();
  const list = customers.filter((c) => !q || c.name.toLowerCase().includes(s) || c.phone.includes(q));

  const history =
    useLiveQuery(
      async () => (edit?.id ? (await db.orders.where('customerId').equals(edit.id).toArray()).sort((a, b) => b.createdAt - a.createdAt) : []),
      [edit?.id],
    ) ?? [];
  const owed = history.filter((o) => !o.refunded).reduce((s, o) => s + o.balance, 0);

  return (
    <div className="mx-auto max-w-6xl p-3 lg:p-0">
      <PageHeader
        title="Customers"
        actions={
          <>
            {canManage && (
              <Button
                variant="secondary"
                onClick={() =>
                  download(
                    'happi-bubbles-customers.csv',
                    toCsv(customers.map(({ name, phone, email, address, points, visits, totalSpent }) => ({ name, phone, email, address, points, visits, totalSpent }))),
                  )
                }
              >
                ⬇ Export
              </Button>
            )}
            <Button onClick={() => setEdit(blank())}>+ Add customer</Button>
          </>
        }
      />
      <Input className="mb-3" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      <Table head={['Name', 'Phone', 'Visits', 'Total spent', 'Points']}>
        {list.map((c) => (
          <tr key={c.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEdit(c)}>
            <td className="px-3 py-2 font-semibold">{c.name}</td>
            <td className="px-3 py-2">{c.phone}</td>
            <td className="px-3 py-2">{c.visits}</td>
            <td className="px-3 py-2">{formatMoney(c.totalSpent, cur)}</td>
            <td className="px-3 py-2">⭐ {c.points}</td>
          </tr>
        ))}
      </Table>

      {edit && (
        <Modal
          open
          wide
          onClose={() => setEdit(null)}
          title={edit.id ? edit.name : 'New customer'}
          footer={
            <>
              {edit.id && canManage && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm(`Delete ${edit.name}?`)) {
                      await remove('customers', edit.id);
                      setEdit(null);
                    }
                  }}
                >
                  Delete
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={!edit.name.trim()}
                onClick={async () => {
                  await save('customers', { ...edit, id: edit.id || uid() });
                  setEdit(null);
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Field label="Name">
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Mobile number">
                <Input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label="Address">
                <Input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
              </Field>
              <Field label="Notes" hint="Preferences, e.g. hypoallergenic detergent">
                <Textarea rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </Field>
              {canManage && (
                <Field label="Loyalty points">
                  <Input type="number" value={edit.points} onChange={(e) => setEdit({ ...edit, points: Number(e.target.value) })} />
                </Field>
              )}
            </div>
            {edit.id && (
              <div>
                <div className="mb-2 flex gap-2">
                  <Badge color="blue">{edit.visits} visits</Badge>
                  <Badge color="green">{formatMoney(edit.totalSpent, cur)} spent</Badge>
                  {owed > 0 && <Badge color="rose">{formatMoney(owed, cur)} owed</Badge>}
                </div>
                <div className="max-h-80 divide-y divide-brand-50 overflow-y-auto rounded-xl ring-1 ring-brand-100">
                  {history.map((o) => (
                    <button key={o.id} onClick={() => setOrderId(o.id)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50">
                      <span>
                        <b>#{o.number}</b> <span className="text-gray-500">{fmtDate(o.createdAt)}</span>
                      </span>
                      <span className={o.refunded ? 'line-through' : ''}>{formatMoney(o.total, cur)}</span>
                    </button>
                  ))}
                  {history.length === 0 && <p className="p-3 text-sm text-gray-500">No orders yet</p>}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
      {orderId && <OrderDetailModal orderId={orderId} onClose={() => setOrderId(null)} />}
    </div>
  );
}
