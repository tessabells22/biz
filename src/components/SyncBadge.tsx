import { useSyncStatus } from '../lib/hooks';
import { syncNow } from '../lib/sync';

const labels = {
  off: { text: 'Local', cls: 'bg-white/60 text-gray-600', title: 'Data is stored on this device only. Set up cloud sync in Back Office → Settings.' },
  'signed-out': { text: 'Signed out', cls: 'bg-amber-100 text-amber-700', title: 'Sign in to the shop account in Settings to sync.' },
  idle: { text: 'Synced', cls: 'bg-emerald-100 text-emerald-700', title: 'All changes are saved to the cloud.' },
  syncing: { text: 'Syncing…', cls: 'bg-brand-100 text-brand-700', title: 'Syncing' },
  error: { text: 'Sync error', cls: 'bg-rose-100 text-rose-700', title: '' },
  offline: { text: 'Offline', cls: 'bg-gray-200 text-gray-700', title: 'Changes will sync when back online.' },
};

export default function SyncBadge() {
  const s = useSyncStatus();
  const l = labels[s.state];
  return (
    <button
      onClick={() => void syncNow()}
      title={s.error ?? l.title}
      className={`hidden rounded-full px-2 py-1 text-xs font-bold sm:inline-block ${l.cls}`}
    >
      ● {l.text}
    </button>
  );
}
