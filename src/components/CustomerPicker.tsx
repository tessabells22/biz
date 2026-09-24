import { useState } from 'react';
import { Button, Field, Input, Modal } from './ui';
import { save, uid } from '../lib/db';
import { byName, useCollection } from '../lib/hooks';
import type { Customer } from '../lib/types';

export default function CustomerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Customer) => void }) {
  const customers = useCollection<Customer>('customers', byName);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const list = customers
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))
    .slice(0, 50);

  const create = async () => {
    const c = await save<Customer>('customers', {
      id: uid(),
      updatedAt: 0,
      name: name.trim(),
      phone: phone.trim(),
      points: 0,
      visits: 0,
      totalSpent: 0,
    });
    setAdding(false);
    setName('');
    setPhone('');
    onPick(c);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={adding ? 'New customer' : 'Customer'}
      footer={
        adding ? (
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Back
            </Button>
            <Button className="flex-1" disabled={!name.trim()} onClick={create}>
              Save customer
            </Button>
          </>
        ) : (
          <Button
            className="flex-1"
            onClick={() => {
              setAdding(true);
              if (/^\d+$/.test(q)) setPhone(q);
              else setName(q);
            }}
          >
            + New customer
          </Button>
        )
      }
    >
      {adding ? (
        <div className="space-y-3">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Mobile number" hint="Used to text the customer when laundry is ready.">
            <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxxx" />
          </Field>
        </div>
      ) : (
        <>
          <Input autoFocus placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 divide-y divide-brand-50">
            {list.map((c) => (
              <button key={c.id} onClick={() => onPick(c)} className="flex w-full items-center justify-between px-1 py-2 text-left hover:bg-brand-50">
                <span>
                  <span className="block font-bold text-navy">{c.name}</span>
                  <span className="text-xs text-gray-500">{c.phone}</span>
                </span>
                <span className="text-xs font-semibold text-bubble">⭐ {c.points}</span>
              </button>
            ))}
            {list.length === 0 && <p className="py-6 text-center text-gray-500">No customers found</p>}
          </div>
        </>
      )}
    </Modal>
  );
}
