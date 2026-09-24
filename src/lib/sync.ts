import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, getMeta, onLocalChange, setMeta, table } from './db';
import { COLLECTIONS, type Base, type CollectionName } from './types';

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export type SyncState = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline';

interface Status {
  state: SyncState;
  lastSync?: number;
  error?: string;
  email?: string;
}

let status: Status = { state: 'off' };
const subs = new Set<(s: Status) => void>();

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch };
  subs.forEach((fn) => fn(status));
}

export function getSyncStatus() {
  return status;
}

export function subscribeSync(fn: (s: Status) => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

let client: SupabaseClient | null = null;

export async function getCloudConfig(): Promise<CloudConfig | null> {
  const saved = await getMeta<CloudConfig | null>('cloud', null);
  if (saved?.url && saved.anonKey) return saved;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export async function setCloudConfig(cfg: CloudConfig | null) {
  await setMeta('cloud', cfg);
  client = null;
  await initSync();
}

async function getClient(): Promise<SupabaseClient | null> {
  if (client) return client;
  const cfg = await getCloudConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, storageKey: 'hb-auth' } });
  return client;
}

const PAGE = 500;

async function push(sb: SupabaseClient) {
  for (const name of COLLECTIONS) {
    const t = table<Base>(name);
    const dirty = await t.where('dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += PAGE) {
      const chunk = dirty.slice(i, i + PAGE);
      const rows = chunk.map((r) => {
        const { dirty: _d, ...data } = r;
        return { collection: name, id: r.id, data, updated_at: r.updatedAt, deleted: !!r.deleted };
      });
      const { error } = await sb.from('records').upsert(rows, { onConflict: 'shop_id,collection,id' });
      if (error) throw error;
      await db.transaction('rw', t, async () => {
        for (const r of chunk) {
          const cur = await t.get(r.id);
          // Only clear the flag if nothing changed while we were uploading.
          if (cur && cur.updatedAt === r.updatedAt) await t.put({ ...cur, dirty: 0 });
        }
      });
    }
  }
}

interface RemoteRow {
  collection: CollectionName;
  id: string;
  data: Base;
  updated_at: number;
  deleted: boolean;
  server_seq: number;
}

async function pull(sb: SupabaseClient) {
  let seq = await getMeta<number>('pullSeq', 0);
  // Re-read a small window in case concurrent writes committed out of order.
  let from = Math.max(0, seq - 50);
  for (;;) {
    const { data, error } = await sb
      .from('records')
      .select('collection,id,data,updated_at,deleted,server_seq')
      .gt('server_seq', from)
      .order('server_seq', { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    const rows = (data ?? []) as RemoteRow[];
    for (const row of rows) {
      if (!COLLECTIONS.includes(row.collection)) continue;
      const t = table<Base>(row.collection);
      const local = await t.get(row.id);
      if (local && local.dirty && local.updatedAt > row.updated_at) continue;
      if (local && !local.dirty && local.updatedAt >= row.updated_at) continue;
      await t.put({ ...row.data, id: row.id, updatedAt: row.updated_at, deleted: row.deleted ? 1 : 0, dirty: 0 });
    }
    if (rows.length) {
      seq = Math.max(seq, rows[rows.length - 1].server_seq);
      from = rows[rows.length - 1].server_seq;
    }
    if (rows.length < PAGE) break;
  }
  await setMeta('pullSeq', seq);
}

let running: Promise<void> | null = null;
let again = false;

export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const sb = await getClient();
    if (!sb) return setStatus({ state: 'off' });
    const { data } = await sb.auth.getSession();
    if (!data.session) return setStatus({ state: 'signed-out', email: undefined });
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setStatus({ state: 'offline' });
    setStatus({ state: 'syncing', email: data.session.user.email });
    try {
      await push(sb);
      await pull(sb);
      setStatus({ state: 'idle', lastSync: Date.now(), error: undefined });
    } catch (e) {
      setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

let started = false;
let interval: ReturnType<typeof setInterval> | undefined;
let channelCleanup: (() => void) | undefined;

export async function initSync() {
  channelCleanup?.();
  channelCleanup = undefined;
  const sb = await getClient();
  if (!sb) {
    setStatus({ state: 'off' });
    return;
  }
  if (!started) {
    started = true;
    onLocalChange(() => schedule());
    window.addEventListener('online', () => schedule(100));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule(100);
    });
    interval = setInterval(() => void syncNow(), 60000);
  }
  const channel = sb
    .channel('records-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => schedule(300))
    .subscribe();
  channelCleanup = () => void sb.removeChannel(channel);
  await syncNow();
}

export function stopSync() {
  clearInterval(interval);
  channelCleanup?.();
}

/**
 * Sign in to the shop's cloud account. If the cloud already has data and this
 * device has never synced, the device adopts the cloud data (its starter
 * catalog is discarded) so the same items don't appear twice.
 */
export async function signIn(email: string, password: string, opts: { signUp?: boolean } = {}) {
  const sb = await getClient();
  if (!sb) throw new Error('Cloud sync is not configured.');
  const res = opts.signUp
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (res.error) throw res.error;
  if (!res.data.session) throw new Error('Check your email to confirm the account, then sign in.');

  const everSynced = await getMeta('everSynced', false);
  if (!everSynced) {
    const { count, error } = await sb.from('records').select('id', { count: 'exact', head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) {
      await db.transaction('rw', COLLECTIONS.map((c) => db.table(c)), async () => {
        for (const c of COLLECTIONS) await db.table(c).clear();
      });
      await setMeta('pullSeq', 0);
    }
    await setMeta('everSynced', true);
  }
  await initSync();
}

export async function signOut() {
  const sb = await getClient();
  await sb?.auth.signOut();
  setStatus({ state: 'signed-out', email: undefined });
}

export async function localHasUnsyncedSales(): Promise<boolean> {
  return (await db.orders.where('dirty').equals(1).count()) > 0;
}
