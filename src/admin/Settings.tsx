import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, Field, Input, PageHeader, Textarea, Toggle } from '../components/ui';
import { download } from '../lib/csv';
import { db, getMeta, save, setMeta } from '../lib/db';
import { useSettings, useSyncStatus } from '../lib/hooks';
import { useSession } from '../lib/session';
import { getCloudConfig, localHasUnsyncedSales, setCloudConfig, signIn, signOut, syncNow } from '../lib/sync';
import { COLLECTIONS, type Settings } from '../lib/types';

export default function SettingsPage() {
  const { employee } = useSession();
  const isOwner = employee?.role === 'owner';
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" />
      {isOwner ? <ShopSettings /> : <p className="text-sm text-gray-500">Only the owner can change shop settings.</p>}
      <DeviceSettings />
      {isOwner && <CloudSettings />}
      {isOwner && <Backup />}
    </div>
  );
}

function Section({ title, children, desc }: { title: string; children: ReactNode; desc?: string }) {
  return (
    <Card>
      <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
      {desc && <p className="mb-2 text-sm text-gray-500">{desc}</p>}
      <div className="mt-2 space-y-3">{children}</div>
    </Card>
  );
}

function ShopSettings() {
  const current = useSettings();
  const [s, setS] = useState<Settings>(current);
  const [saved, setSaved] = useState(false);
  useEffect(() => setS(current), [current]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSaved(false);
    setS((x) => ({ ...x, [k]: v }));
  };
  return (
    <>
      <Section title="Shop & receipt">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shop name">
            <Input value={s.shopName} onChange={(e) => set('shopName', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={s.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <Input value={s.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Receipt header">
          <Input value={s.receiptHeader} onChange={(e) => set('receiptHeader', e.target.value)} />
        </Field>
        <Field label="Receipt footer">
          <Textarea rows={2} value={s.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
        </Field>
      </Section>
      <Section title="Payments & tax">
        <Field label="Payment methods" hint="Comma separated. Keep “Cash” so the cash drawer is tracked.">
          <Input
            value={s.paymentMethods.join(', ')}
            onChange={(e) =>
              set(
                'paymentMethods',
                e.target.value.split(',').map((x) => x.trim()),
              )
            }
            onBlur={() => set('paymentMethods', s.paymentMethods.filter(Boolean))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Currency symbol">
            <Input value={s.currency} onChange={(e) => set('currency', e.target.value)} />
          </Field>
          <Field label="Tax / VAT rate (%)" hint="0 for non-VAT registered">
            <Input type="number" value={s.taxRate} onChange={(e) => set('taxRate', Number(e.target.value))} />
          </Field>
        </div>
        <Toggle label="Prices already include tax" checked={s.taxIncluded} onChange={(v) => set('taxIncluded', v)} />
      </Section>
      <Section title="Laundry & loyalty">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Default turnaround (hours)">
            <Input type="number" value={s.defaultTurnaroundHours} onChange={(e) => set('defaultTurnaroundHours', Number(e.target.value))} />
          </Field>
          <Field label="Points per ₱1 spent" hint="0.01 = 1 point per ₱100">
            <Input type="number" step="0.01" value={s.pointsPerCurrency} onChange={(e) => set('pointsPerCurrency', Number(e.target.value))} />
          </Field>
          <Field label="Value of 1 point">
            <Input type="number" value={s.pointValue} onChange={(e) => set('pointValue', Number(e.target.value))} />
          </Field>
        </div>
        <Field label="“Ready for pickup” text message" hint="Placeholders: {name} {number} {balance} {total}">
          <Textarea rows={3} value={s.readyMessage} onChange={(e) => set('readyMessage', e.target.value)} />
        </Field>
      </Section>
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm font-bold text-emerald-600">Saved ✓</span>}
        <Button
          onClick={async () => {
            await save('settings', { ...s, paymentMethods: s.paymentMethods.filter(Boolean) });
            setSaved(true);
          }}
        >
          Save settings
        </Button>
      </div>
    </>
  );
}

function DeviceSettings() {
  const [code, setCode] = useState('A');
  const [name, setName] = useState('Counter 1');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void getMeta('deviceCode', 'A').then(setCode);
    void getMeta('deviceName', 'Counter 1').then(setName);
  }, []);
  return (
    <Section title="This device" desc="Give each phone/tablet a different letter so claim numbers never collide.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Device letter" hint="Claim numbers look like A0924-001">
          <Input maxLength={2} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </Field>
        <Field label="Device name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm font-bold text-emerald-600">Saved ✓</span>}
        <Button
          variant="secondary"
          onClick={async () => {
            await setMeta('deviceCode', code || 'A');
            await setMeta('deviceName', name || 'Counter 1');
            setSaved(true);
          }}
        >
          Save device
        </Button>
      </div>
    </Section>
  );
}

function CloudSettings() {
  const status = useSyncStatus();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCloudConfig().then((c) => {
      setUrl(c?.url ?? '');
      setKey(c?.anonKey ?? '');
    });
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const connected = status.state !== 'off';
  const signedIn = connected && status.state !== 'signed-out';

  return (
    <Section
      title="Cloud sync"
      desc="Connect a free Supabase project so the phone app and the browser back office share the same data. Without it, data stays on this device only."
    >
      {!connected && (
        <>
          <Field label="Supabase project URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://xxxx.supabase.co" />
          </Field>
          <Field label="Supabase anon (public) key">
            <Input value={key} onChange={(e) => setKey(e.target.value.trim())} />
          </Field>
          <Button disabled={!url || !key || busy} onClick={() => run(() => setCloudConfig({ url, anonKey: key }))}>
            Connect
          </Button>
        </>
      )}
      {connected && !signedIn && (
        <>
          <p className="text-sm text-gray-600">Sign in with the shop account. Use the same account on every device.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !email || !password}
              onClick={() =>
                run(async () => {
                  if ((await localHasUnsyncedSales()) && !confirm('If the cloud account already has data, this device will switch to it and its unsynced sales will be removed. Continue?')) return;
                  await signIn(email, password);
                })
              }
            >
              Sign in
            </Button>
            <Button variant="secondary" disabled={busy || !email || password.length < 6} onClick={() => run(() => signIn(email, password, { signUp: true }))}>
              Create shop account
            </Button>
            <Button variant="ghost" onClick={() => run(() => setCloudConfig(null))}>
              Disconnect project
            </Button>
          </div>
        </>
      )}
      {signedIn && (
        <>
          <p className="text-sm">
            Signed in as <b>{status.email}</b> · status: <b>{status.state}</b>
            {status.lastSync && <> · last sync {new Date(status.lastSync).toLocaleTimeString()}</>}
          </p>
          {status.error && <p className="text-sm text-rose-600">{status.error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void syncNow()}>
              Sync now
            </Button>
            <Button variant="ghost" onClick={() => run(signOut)}>
              Sign out
            </Button>
          </div>
        </>
      )}
      {msg && <p className="text-sm font-bold text-rose-600">{msg}</p>}
    </Section>
  );
}

function Backup() {
  const [msg, setMsg] = useState('');
  const exportAll = async () => {
    const data: Record<string, unknown[]> = {};
    for (const c of COLLECTIONS) data[c] = await db.table(c).toArray();
    download(`happi-bubbles-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, data }), 'application/json');
  };
  const importAll = async (file: File) => {
    const json = JSON.parse(await file.text()) as { data: Record<string, { id: string }[]> };
    if (!confirm('Restore this backup? Records in the backup will overwrite matching records on this device.')) return;
    const now = Date.now();
    for (const c of COLLECTIONS) {
      const rows = json.data?.[c];
      if (Array.isArray(rows)) await db.table(c).bulkPut(rows.map((r) => ({ ...r, updatedAt: now, dirty: 1 })));
    }
    void syncNow();
    setMsg('Backup restored ✓');
  };
  return (
    <Section title="Backup" desc="Download all data as a file, or restore from a previous backup.">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={exportAll}>
          ⬇ Download backup
        </Button>
        <label className="cursor-pointer rounded-xl border border-brand-200 bg-white px-4 py-2 font-semibold text-navy hover:bg-brand-50">
          ⬆ Restore backup
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
        </label>
        {msg && <span className="text-sm font-bold text-emerald-600">{msg}</span>}
      </div>
    </Section>
  );
}
