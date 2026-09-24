import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db } from './db';
import type { Employee } from './types';

interface SessionValue {
  employee: Employee | null;
  login: (e: Employee) => void;
  logout: () => void;
  canManage: boolean;
}

const Ctx = createContext<SessionValue>({ employee: null, login: () => {}, logout: () => {}, canManage: false });

const KEY = 'hb-employee';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(KEY);
    (id ? db.employees.get(id) : Promise.resolve(undefined)).then((e) => {
      if (e && e.active && !e.deleted) setEmployee(e);
      setReady(true);
    });
  }, []);

  const value: SessionValue = {
    employee,
    login: (e) => {
      localStorage.setItem(KEY, e.id);
      setEmployee(e);
    },
    logout: () => {
      localStorage.removeItem(KEY);
      setEmployee(null);
    },
    canManage: employee?.role === 'owner' || employee?.role === 'manager',
  };
  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
