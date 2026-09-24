import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui';
import { all } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { useSession } from '../lib/session';
import type { Employee } from '../lib/types';

export default function Login() {
  const { employee, login } = useSession();
  const settings = useSettings();
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (employee) return <Navigate to="/pos" replace />;

  const press = async (d: string) => {
    setError('');
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      const match = (await all<Employee>('employees')).find((e) => e.active && e.pin === next);
      if (match) {
        login(match);
        nav('/pos');
      } else {
        setError('Wrong PIN');
        setPin('');
      }
    }
  };

  return (
    <div className="bubbles-bg safe-top flex min-h-full flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-3 w-fit rounded-full bg-white p-1 shadow-lg">
          <Logo size={120} />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-bubble drop-shadow-sm">{settings.shopName}</h1>
        <p className="mb-6 font-semibold text-navy/70">Enter your PIN</p>
        <div className="mb-2 flex justify-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className={`h-4 w-4 rounded-full border-2 border-navy ${i < pin.length ? 'bg-navy' : 'bg-white/60'}`} />
          ))}
        </div>
        <div className="mb-4 h-5 text-sm font-bold text-rose-600">{error}</div>
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
            <button
              key={k}
              onClick={() => (k === 'C' ? setPin('') : k === '⌫' ? setPin(pin.slice(0, -1)) : press(k))}
              className="h-16 rounded-2xl bg-white/90 font-display text-2xl font-bold text-navy shadow-sm active:scale-95 active:bg-brand-100"
            >
              {k}
            </button>
          ))}
        </div>
        <p className="mt-6 text-xs text-navy/60">First time? The default owner PIN is 1234. Change it in Back Office → Employees.</p>
      </div>
    </div>
  );
}
