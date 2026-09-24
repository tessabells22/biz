import { useState } from 'react';
import { Button, Field, Input, Modal, PageHeader, Select, Table } from '../components/ui';
import { formatMoney } from '../lib/calc';
import { remove, save, uid } from '../lib/db';
import { byName, useCollection, useSettings } from '../lib/hooks';
import type { Discount } from '../lib/types';

export default function Discounts() {
  const settings = useSettings();
  const list = useCollection<Discount>('discounts', byName);
  const [edit, setEdit] = useState<Discount | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Discounts" actions={<Button onClick={() => setEdit({ id: '', updatedAt: 0, name: '', type: 'percent', value: 10 })}>+ Add discount</Button>} />
      <Table head={['Name', 'Value']}>
        {list.map((d) => (
          <tr key={d.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEdit(d)}>
            <td className="px-3 py-2 font-semibold">{d.name}</td>
            <td className="px-3 py-2">{d.type === 'percent' ? `${d.value}%` : formatMoney(d.value, settings.currency)}</td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? 'Edit discount' : 'New discount'}
          footer={
            <>
              {edit.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await remove('discounts', edit.id);
                    setEdit(null);
                  }}
                >
                  Delete
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={!edit.name.trim() || edit.value <= 0}
                onClick={async () => {
                  await save('discounts', { ...edit, id: edit.id || uid() });
                  setEdit(null);
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Name">
              <Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Discount['type'] })}>
                  <option value="percent">Percent (%)</option>
                  <option value="amount">Fixed amount</option>
                </Select>
              </Field>
              <Field label="Value">
                <Input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
