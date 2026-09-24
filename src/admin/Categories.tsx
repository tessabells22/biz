import { useState } from 'react';
import { Button, Field, Input, Modal, PageHeader, Table } from '../components/ui';
import { remove, save, uid } from '../lib/db';
import { useCollection } from '../lib/hooks';
import type { Category, Item } from '../lib/types';
import { COLORS } from './Items';

export default function Categories() {
  const cats = useCollection<Category>('categories', (a, b) => a.sort - b.sort);
  const items = useCollection<Item>('items');
  const [edit, setEdit] = useState<Category | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Categories"
        actions={<Button onClick={() => setEdit({ id: '', updatedAt: 0, name: '', color: COLORS[0], sort: cats.length + 1 })}>+ Add category</Button>}
      />
      <Table head={['Name', 'Items', 'Order']}>
        {cats.map((c) => (
          <tr key={c.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEdit(c)}>
            <td className="px-3 py-2 font-semibold">
              <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: c.color }} />
              {c.name}
            </td>
            <td className="px-3 py-2">{items.filter((i) => i.categoryId === c.id).length}</td>
            <td className="px-3 py-2">{c.sort}</td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? 'Edit category' : 'New category'}
          footer={
            <>
              {edit.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (items.some((i) => i.categoryId === edit.id)) return alert('Move or delete the items in this category first.');
                    await remove('categories', edit.id);
                    setEdit(null);
                  }}
                >
                  Delete
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={!edit.name.trim()}
                onClick={async () => {
                  await save('categories', { ...edit, id: edit.id || uid() });
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
            <Field label="Display order">
              <Input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} />
            </Field>
            <Field label="Color">
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEdit({ ...edit, color: c })}
                    className={`h-8 w-8 rounded-full ring-offset-2 ${edit.color === c ? 'ring-2 ring-navy' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
