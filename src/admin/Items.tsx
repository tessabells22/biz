import { useState } from 'react';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Table, Toggle } from '../components/ui';
import { formatMoney } from '../lib/calc';
import { remove, save, uid } from '../lib/db';
import { byName, useCollection, useSettings } from '../lib/hooks';
import type { Category, Item } from '../lib/types';

export const COLORS = ['#38bdf8', '#0ea5e9', '#a78bfa', '#86efac', '#fdba74', '#f472b6', '#facc15', '#94a3b8'];

const blank = (categoryId: string): Item => ({
  id: '',
  updatedAt: 0,
  name: '',
  categoryId,
  price: 0,
  cost: 0,
  unit: 'load',
  color: COLORS[0],
  trackStock: false,
  stock: 0,
  lowStock: 5,
  isService: true,
  active: true,
});

export default function Items() {
  const settings = useSettings();
  const items = useCollection<Item>('items', byName);
  const categories = useCollection<Category>('categories', (a, b) => a.sort - b.sort);
  const [edit, setEdit] = useState<Item | null>(null);
  const [filter, setFilter] = useState('all');
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';
  const list = items.filter((i) => filter === 'all' || i.categoryId === filter);

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setEdit((e) => (e ? { ...e, [k]: v } : e));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Items & services"
        actions={
          <>
            <Select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button onClick={() => setEdit(blank(categories[0]?.id ?? ''))}>+ Add item</Button>
          </>
        }
      />
      <Table head={['Name', 'Category', 'Price', 'Cost', 'Stock', '']}>
        {list.map((i) => (
          <tr key={i.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEdit(i)}>
            <td className="px-3 py-2">
              <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: i.color }} />
              <span className="font-semibold">{i.name}</span>
            </td>
            <td className="px-3 py-2">{catName(i.categoryId)}</td>
            <td className="px-3 py-2">
              {formatMoney(i.price, settings.currency)}
              <span className="text-gray-400"> / {i.unit}</span>
            </td>
            <td className="px-3 py-2">{formatMoney(i.cost, settings.currency)}</td>
            <td className="px-3 py-2">{i.trackStock ? <Badge color={i.stock <= i.lowStock ? 'rose' : 'gray'}>{i.stock}</Badge> : '—'}</td>
            <td className="px-3 py-2">{!i.active && <Badge>Hidden</Badge>}</td>
          </tr>
        ))}
      </Table>

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? 'Edit item' : 'New item'}
          footer={
            <>
              {edit.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm(`Delete ${edit.name}?`)) {
                      await remove('items', edit.id);
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
                  await save('items', { ...edit, id: edit.id || uid(), name: edit.name.trim() });
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
              <Input autoFocus value={edit.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={edit.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sold by">
                <Select value={edit.unit} onChange={(e) => set('unit', e.target.value as Item['unit'])}>
                  <option value="load">Per load</option>
                  <option value="kg">Per kilo (weighed)</option>
                  <option value="pc">Per piece</option>
                  <option value="item">Retail item (no laundry job)</option>
                </Select>
              </Field>
              <Field label="Price">
                <Input type="number" value={edit.price} onChange={(e) => set('price', Number(e.target.value))} />
              </Field>
              <Field label="Cost" hint="For profit reports">
                <Input type="number" value={edit.cost} onChange={(e) => set('cost', Number(e.target.value))} />
              </Field>
              <Field label="SKU / code">
                <Input value={edit.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
              </Field>
            </div>
            <Field label="Color">
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => set('color', c)}
                    className={`h-8 w-8 rounded-full ring-offset-2 ${edit.color === c ? 'ring-2 ring-navy' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </Field>
            <Toggle label="Track stock" checked={edit.trackStock} onChange={(v) => set('trackStock', v)} />
            {edit.trackStock && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="In stock">
                  <Input type="number" value={edit.stock} onChange={(e) => set('stock', Number(e.target.value))} />
                </Field>
                <Field label="Low stock alert at">
                  <Input type="number" value={edit.lowStock} onChange={(e) => set('lowStock', Number(e.target.value))} />
                </Field>
              </div>
            )}
            <Toggle label="Show on POS" checked={edit.active} onChange={(v) => set('active', v)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
