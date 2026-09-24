import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Table, fmtDate } from '../components/ui';
import { formatMoney } from '../lib/calc';
import { db } from '../lib/db';
import { byName, useCollection, useSettings } from '../lib/hooks';
import { adjustStock } from '../lib/ops';
import { useSession } from '../lib/session';
import type { Item, StockMovement } from '../lib/types';

const REASONS: Record<StockMovement['reason'], string> = {
  receive: 'Received',
  sale: 'Sold',
  refund: 'Refunded',
  adjust: 'Count correction',
  loss: 'Damaged / used in-house',
};

export default function Inventory() {
  const settings = useSettings();
  const { employee } = useSession();
  const items = useCollection<Item>('items', byName).filter((i) => i.trackStock);
  const history = useLiveQuery(async () => (await db.stockMovements.orderBy('at').reverse().limit(100).toArray()).filter((m) => !m.deleted), []) ?? [];
  const [adj, setAdj] = useState<Item | null>(null);
  const [reason, setReason] = useState<StockMovement['reason']>('receive');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const value = items.reduce((s, i) => s + i.stock * i.cost, 0);

  const submit = async () => {
    if (!adj || !employee) return;
    const n = Number(qty) || 0;
    // Counts set the absolute level; other reasons add or remove.
    const delta = reason === 'adjust' ? n - adj.stock : reason === 'loss' ? -Math.abs(n) : Math.abs(n);
    await adjustStock(adj.id, delta, reason, employee.name, note);
    setAdj(null);
    setQty('');
    setNote('');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Inventory" actions={<span className="text-sm text-gray-600">Stock value at cost: <b>{formatMoney(value, settings.currency)}</b></span>} />
      <p className="mb-3 text-sm text-gray-500">Only items with “Track stock” turned on appear here. Sales deduct stock automatically.</p>
      <Table head={['Item', 'In stock', 'Low alert', 'Cost', '']}>
        {items.map((i) => (
          <tr key={i.id}>
            <td className="px-3 py-2 font-semibold">{i.name}</td>
            <td className="px-3 py-2">
              <Badge color={i.stock <= i.lowStock ? 'rose' : 'green'}>{i.stock}</Badge>
            </td>
            <td className="px-3 py-2">{i.lowStock}</td>
            <td className="px-3 py-2">{formatMoney(i.cost, settings.currency)}</td>
            <td className="px-3 py-2 text-right">
              <Button size="sm" variant="secondary" onClick={() => setAdj(i)}>
                Adjust
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <h2 className="mt-6 mb-2 font-display text-xl font-bold text-navy">Stock history</h2>
      <Table head={['Date', 'Item', 'Change', 'Reason', 'By']}>
        {history.map((m) => (
          <tr key={m.id}>
            <td className="px-3 py-2 whitespace-nowrap">{fmtDate(m.at)}</td>
            <td className="px-3 py-2">{m.itemName}</td>
            <td className={`px-3 py-2 font-bold ${m.qty < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {m.qty > 0 ? '+' : ''}
              {m.qty}
            </td>
            <td className="px-3 py-2">
              {REASONS[m.reason]} {m.note && <span className="text-gray-400">· {m.note}</span>}
            </td>
            <td className="px-3 py-2">{m.employeeName}</td>
          </tr>
        ))}
      </Table>

      {adj && (
        <Modal
          open
          onClose={() => setAdj(null)}
          title={`Adjust ${adj.name}`}
          footer={
            <Button className="flex-1" onClick={submit} disabled={qty === ''}>
              Save
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Currently in stock: <b>{adj.stock}</b>
            </p>
            <Field label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value as StockMovement['reason'])}>
                <option value="receive">Receive stock (add)</option>
                <option value="loss">Damaged / used in-house (remove)</option>
                <option value="adjust">Inventory count (set exact number)</option>
              </Select>
            </Field>
            <Field label={reason === 'adjust' ? 'Counted quantity' : 'Quantity'}>
              <Input type="number" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. supplier, receipt no." />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
