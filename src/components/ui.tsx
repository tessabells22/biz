import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  accent: 'bg-bubble text-white hover:brightness-95 shadow-sm',
  secondary: 'bg-white text-navy border border-brand-200 hover:bg-brand-50',
  ghost: 'text-navy hover:bg-brand-100',
  danger: 'bg-rose-500 text-white hover:bg-rose-600',
};

export function Button({
  variant = 'primary',
  className = '',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2', lg: 'px-5 py-3 text-lg' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-navy/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-brand-200 bg-white px-3 py-2 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-brand-100 px-5 py-3">
          <h2 className="font-display text-xl font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-2xl leading-none text-gray-400 hover:bg-gray-100" aria-label="Close">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex gap-2 border-t border-brand-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100 ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub, tone = 'brand' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'orange' | 'green' | 'rose' }) {
  const tones = { brand: 'text-brand-600', orange: 'text-bubble', green: 'text-emerald-600', rose: 'text-rose-500' };
  return (
    <Card>
      <div className="text-sm font-semibold text-gray-500">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </Card>
  );
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: string }) {
  const map: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-brand-100 text-brand-700',
    green: 'bg-emerald-100 text-emerald-700',
    orange: 'bg-bubble-light text-orange-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
    yellow: 'bg-amber-100 text-amber-700',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${map[color] ?? map.gray}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-gray-500">{children}</div>;
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="font-display text-2xl font-bold text-navy">{title}</h1>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm font-semibold text-navy/80">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-brand-500' : 'bg-gray-300'}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-brand-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-50 text-xs uppercase tracking-wide text-navy/70">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">{children}</tbody>
      </table>
    </div>
  );
}

export const STATUS_META: Record<string, { label: string; color: string; emoji: string }> = {
  received: { label: 'Received', color: 'gray', emoji: '📥' },
  washing: { label: 'Washing', color: 'blue', emoji: '🫧' },
  drying: { label: 'Drying', color: 'yellow', emoji: '🌀' },
  folding: { label: 'Folding', color: 'violet', emoji: '👕' },
  ready: { label: 'Ready', color: 'green', emoji: '✅' },
  claimed: { label: 'Claimed', color: 'orange', emoji: '🛍️' },
};

export const PAY_META: Record<string, { label: string; color: string }> = {
  paid: { label: 'Paid', color: 'green' },
  partial: { label: 'Partial', color: 'yellow' },
  unpaid: { label: 'Unpaid', color: 'rose' },
  refunded: { label: 'Refunded', color: 'gray' },
};

export function Logo({ size = 48 }: { size?: number }) {
  return <img src="./logo.png" alt="Happi Bubbles" width={size} height={size} className="rounded-full" />;
}

export function fmtDate(ts?: number, withTime = true) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: withTime ? undefined : 'numeric',
    hour: withTime ? 'numeric' : undefined,
    minute: withTime ? '2-digit' : undefined,
  });
}
