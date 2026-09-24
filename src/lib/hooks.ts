import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { all, db, SETTINGS_ID } from './db';
import { DEFAULT_SETTINGS } from './seed';
import { getSyncStatus, subscribeSync } from './sync';
import type { Base, CollectionName, Settings } from './types';

export function useCollection<T extends Base>(name: CollectionName, sort?: (a: T, b: T) => number): T[] {
  return (
    useLiveQuery(async () => {
      const rows = await all<T>(name);
      return sort ? rows.sort(sort) : rows;
    }, [name]) ?? []
  );
}

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get(SETTINGS_ID), []) ?? DEFAULT_SETTINGS;
}

export function useSyncStatus() {
  const [s, setS] = useState(getSyncStatus());
  useEffect(() => subscribeSync(setS), []);
  return s;
}

export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
