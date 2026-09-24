import { useState } from 'react';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Table, Toggle } from '../components/ui';
import { all, remove, save, uid } from '../lib/db';
import { byName, useCollection } from '../lib/hooks';
import { useSession } from '../lib/session';
import type { Employee, Role } from '../lib/types';

const ROLE_INFO: Record<Role, string> = {
  owner: 'Full access including settings',
  manager: 'POS + back office, refunds',
  cashier: 'POS only',
};

export default function Employees() {
  const { employee: me } = useSession();
  const list = useCollection<Employee>('employees', byName);
  const [edit, setEdit] = useState<Employee | null>(null);
  const [error, setError] = useState('');
  const isOwner = me?.role === 'owner';

  const submit = async () => {
    if (!edit) return;
    if (!/^\d{4}$/.test(edit.pin)) return setError('PIN must be exactly 4 digits.');
    const clash = (await all<Employee>('employees')).find((e) => e.pin === edit.pin && e.id !== edit.id);
    if (clash) return setError('Another employee already uses this PIN.');
    const owners = list.filter((e) => e.role === 'owner' && e.active && e.id !== edit.id);
    if (owners.length === 0 && (edit.role !== 'owner' || !edit.active)) return setError('Keep at least one active owner.');
    await save('employees', { ...edit, id: edit.id || uid() });
    setEdit(null);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Employees"
        actions={
          isOwner && (
            <Button
              onClick={() => {
                setError('');
                setEdit({ id: '', updatedAt: 0, name: '', pin: '', role: 'cashier', active: true });
              }}
            >
              + Add employee
            </Button>
          )
        }
      />
      <Table head={['Name', 'Role', 'Status']}>
        {list.map((e) => (
          <tr
            key={e.id}
            className={isOwner ? 'cursor-pointer hover:bg-brand-50' : ''}
            onClick={() => {
              if (!isOwner) return;
              setError('');
              setEdit(e);
            }}
          >
            <td className="px-3 py-2 font-semibold">{e.name}</td>
            <td className="px-3 py-2 capitalize">{e.role}</td>
            <td className="px-3 py-2">{e.active ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
          </tr>
        ))}
      </Table>
      {!isOwner && <p className="mt-3 text-sm text-gray-500">Only the owner can add or edit employees.</p>}

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? 'Edit employee' : 'New employee'}
          footer={
            <>
              {edit.id && edit.id !== me?.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm(`Remove ${edit.name}?`)) {
                      await remove('employees', edit.id);
                      setEdit(null);
                    }
                  }}
                >
                  Delete
                </Button>
              )}
              <Button className="flex-1" disabled={!edit.name.trim()} onClick={submit}>
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Name">
              <Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="4-digit PIN" hint="Used to log in to the POS">
              <Input
                inputMode="numeric"
                maxLength={4}
                value={edit.pin}
                onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              />
            </Field>
            <Field label="Role" hint={ROLE_INFO[edit.role]}>
              <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </Select>
            </Field>
            <Toggle label="Active" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
            {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
