import { useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Textarea } from '../components/ui';
import CustomerPicker from '../components/CustomerPicker';
import CheckoutModal from './CheckoutModal';
import ReceiptModal from '../components/ReceiptModal';
import { computeTotals, formatMoney, round2 } from '../lib/calc';
import { byName, useCollection, useSettings } from '../lib/hooks';
import type { AppliedDiscount, Category, Customer, Discount, Item, Order, OrderLine } from '../lib/types';

const UNIT_LABEL: Record<string, string> = { load: 'load', kg: 'kg', pc: 'pc', item: '' };

export function toLocalInput(ts: number) {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function SalePage() {
  const settings = useSettings();
  const cur = settings.currency;
  const categories = useCollection<Category>('categories', (a, b) => a.sort - b.sort);
  const items = useCollection<Item>('items', byName).filter((i) => i.active);
  const discounts = useCollection<Discount>('discounts', byName);

  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [applied, setApplied] = useState<AppliedDiscount[]>([]);
  const [customer, setCustomer] = useState<Customer | undefined>();
  const [points, setPoints] = useState(0);
  const [notes, setNotes] = useState('');
  const [bags, setBags] = useState(1);
  const [dueAt, setDueAt] = useState<number | undefined>();

  const [qtyItem, setQtyItem] = useState<{ item: Item; index?: number } | null>(null);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);

  const catOrder = (id: string) => categories.find((c) => c.id === id)?.sort ?? 99;
  const visible = items
    .filter((i) => (cat === 'all' || i.categoryId === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => catOrder(a.categoryId) - catOrder(b.categoryId));

  const maxPoints = customer ? customer.points : 0;
  const totals = useMemo(
    () => computeTotals(lines, applied, points * settings.pointValue, settings.taxRate, settings.taxIncluded),
    [lines, applied, points, settings],
  );
  const hasService = lines.some((l) => l.unit !== 'item');
  const count = lines.length;

  const addItem = (item: Item) => {
    if (item.unit === 'kg') return setQtyItem({ item });
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.itemId === item.id && l.price === item.price);
      if (idx >= 0) return ls.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, lineFor(item, 1)];
    });
  };

  const lineFor = (item: Item, qty: number): OrderLine => ({
    itemId: item.id,
    name: item.name,
    price: item.price,
    qty,
    unit: item.unit,
    cost: item.cost,
    categoryId: item.categoryId,
  });

  const setQty = (index: number, qty: number) =>
    setLines((ls) => (qty <= 0 ? ls.filter((_, i) => i !== index) : ls.map((l, i) => (i === index ? { ...l, qty: round2(qty) } : l))));

  const reset = () => {
    setLines([]);
    setApplied([]);
    setCustomer(undefined);
    setPoints(0);
    setNotes('');
    setBags(1);
    setDueAt(undefined);
    setShowCart(false);
  };

  const effectiveDue = dueAt ?? Date.now() + settings.defaultTurnaroundHours * 3600000;

  const cart = (
    <div className="flex h-full flex-col">
      <div className="border-b border-brand-100 p-3">
        <button
          onClick={() => setPickCustomer(true)}
          className="flex w-full items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-left hover:bg-brand-100"
        >
          <span className="text-xl">👤</span>
          {customer ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-navy">{customer.name}</span>
              <span className="text-xs text-gray-500">
                {customer.phone} · {customer.points} pts
              </span>
            </span>
          ) : (
            <span className="flex-1 font-semibold text-gray-500">Add customer</span>
          )}
          {customer && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setCustomer(undefined);
                setPoints(0);
              }}
              className="px-1 text-gray-400"
            >
              ×
            </span>
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 && <div className="p-8 text-center text-gray-400">Tap a service to start an order 🫧</div>}
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-brand-50 px-3 py-2">
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                const item = items.find((it) => it.id === l.itemId);
                if (item) setQtyItem({ item, index: i });
              }}
            >
              <div className="truncate font-semibold text-navy">{l.name}</div>
              <div className="text-xs text-gray-500">
                {l.qty} {UNIT_LABEL[l.unit]} × {formatMoney(l.price, cur)}
              </div>
            </button>
            {l.unit !== 'kg' && (
              <div className="flex items-center gap-1">
                <button className="h-8 w-8 rounded-lg bg-brand-50 font-bold" onClick={() => setQty(i, l.qty - 1)}>
                  −
                </button>
                <button className="h-8 w-8 rounded-lg bg-brand-50 font-bold" onClick={() => setQty(i, l.qty + 1)}>
                  +
                </button>
              </div>
            )}
            <div className="w-20 text-right font-bold">{formatMoney(l.price * l.qty, cur)}</div>
          </div>
        ))}
        {lines.length > 0 && (
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowDiscounts(true)}>
                🏷️ Discounts {applied.length > 0 && `(${applied.length})`}
              </Button>
              {customer && customer.points > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const max = Math.min(maxPoints, Math.floor(totals.subtotal / settings.pointValue));
                    setPoints(points ? 0 : max);
                  }}
                >
                  ⭐ {points ? `Using ${points} pts` : 'Use points'}
                </Button>
              )}
            </div>
            {hasService && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Due / pickup">
                  <Input type="datetime-local" value={toLocalInput(effectiveDue)} onChange={(e) => setDueAt(new Date(e.target.value).getTime())} />
                </Field>
                <Field label="Bags">
                  <Input type="number" min={0} value={bags} onChange={(e) => setBags(Number(e.target.value))} />
                </Field>
              </div>
            )}
            <Field label="Notes">
              <Textarea rows={2} placeholder="e.g. separate whites, no fabcon" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
      <div className="safe-bottom border-t border-brand-100 bg-white p-3">
        <div className="mb-2 space-y-0.5 text-sm">
          <Row label="Subtotal" value={formatMoney(totals.subtotal, cur)} />
          {totals.discountTotal > 0 && <Row label="Discount" value={`-${formatMoney(totals.discountTotal, cur)}`} />}
          {totals.tax > 0 && <Row label={settings.taxIncluded ? 'VAT (incl.)' : 'Tax'} value={formatMoney(totals.tax, cur)} />}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset} disabled={!lines.length}>
            Clear
          </Button>
          <Button variant="accent" size="lg" className="flex-1" disabled={!lines.length} onClick={() => setCheckout(true)}>
            Charge {formatMoney(totals.total, cur)}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-2 p-3">
          <Input placeholder="🔍 Search services & items" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-2 overflow-x-auto pb-1">
            <CatChip active={cat === 'all'} onClick={() => setCat('all')} label="All" color="#1e2a6e" />
            {categories.map((c) => (
              <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={c.name} color={c.color} />
            ))}
          </div>
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-3 pb-24 sm:grid-cols-3 lg:grid-cols-4 lg:pb-3">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => addItem(item)}
              className="relative flex min-h-24 flex-col justify-between overflow-hidden rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-brand-100 active:scale-[.97]"
            >
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: item.color }} />
              <span className="font-bold leading-tight text-navy">{item.name}</span>
              <span className="mt-2 flex items-end justify-between">
                <span className="font-display text-lg font-bold text-brand-600">{formatMoney(item.price, cur)}</span>
                <span className="text-xs text-gray-500">
                  {UNIT_LABEL[item.unit] && `/${UNIT_LABEL[item.unit]}`}
                  {item.trackStock && <Badge color={item.stock <= item.lowStock ? 'rose' : 'gray'}>{item.stock} left</Badge>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="hidden w-96 shrink-0 border-l border-brand-100 bg-white lg:block">{cart}</aside>

      {count > 0 && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed inset-x-3 bottom-20 z-30 flex items-center justify-between rounded-2xl bg-bubble px-4 py-3 font-bold text-white shadow-lg md:bottom-4 lg:hidden"
        >
          <span>🧺 {count} item{count > 1 ? 's' : ''}</span>
          <span>View order · {formatMoney(totals.total, cur)}</span>
        </button>
      )}
      {showCart && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white lg:hidden">
          <div className="safe-top flex items-center justify-between border-b border-brand-100 px-3 py-2">
            <h2 className="font-display text-xl font-bold text-navy">Current order</h2>
            <Button variant="ghost" onClick={() => setShowCart(false)}>
              Close
            </Button>
          </div>
          <div className="min-h-0 flex-1">{cart}</div>
        </div>
      )}

      {qtyItem && (
        <QtyModal
          item={qtyItem.item}
          initial={qtyItem.index !== undefined ? lines[qtyItem.index].qty : undefined}
          onClose={() => setQtyItem(null)}
          onSave={(qty) => {
            if (qtyItem.index !== undefined) setQty(qtyItem.index, qty);
            else if (qty > 0) setLines((ls) => [...ls, lineFor(qtyItem.item, qty)]);
            setQtyItem(null);
          }}
        />
      )}

      <CustomerPicker
        open={pickCustomer}
        onClose={() => setPickCustomer(false)}
        onPick={(c) => {
          setCustomer(c);
          setPoints(0);
          setPickCustomer(false);
        }}
      />

      <Modal open={showDiscounts} onClose={() => setShowDiscounts(false)} title="Discounts">
        <div className="space-y-2">
          {discounts.length === 0 && <p className="text-gray-500">No discounts yet. Add them in Back Office.</p>}
          {discounts.map((d) => {
            const on = applied.some((a) => a.name === d.name);
            return (
              <button
                key={d.id}
                onClick={() =>
                  setApplied((a) => (on ? a.filter((x) => x.name !== d.name) : [...a, { name: d.name, type: d.type, value: d.value }]))
                }
                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 font-semibold ring-1 ${on ? 'bg-brand-100 ring-brand-400' : 'ring-brand-100'}`}
              >
                <span>{d.name}</span>
                <span>{d.type === 'percent' ? `${d.value}%` : formatMoney(d.value, cur)}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      <CheckoutModal
        open={checkout}
        onClose={() => setCheckout(false)}
        draft={{ lines, discounts: applied, customer, pointsRedeemed: points, notes, bags: hasService ? bags : undefined, dueAt: hasService ? effectiveDue : undefined }}
        total={totals.total}
        onDone={(order) => {
          setCheckout(false);
          reset();
          setReceipt(order);
        }}
      />
      {receipt && <ReceiptModal order={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-gray-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function CatChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap ring-2 ${active ? 'text-white' : 'bg-white text-navy'}`}
      style={{ background: active ? color : undefined, borderColor: color, ['--tw-ring-color' as string]: color }}
    >
      {label}
    </button>
  );
}

function QtyModal({ item, initial, onClose, onSave }: { item: Item; initial?: number; onClose: () => void; onSave: (qty: number) => void }) {
  const [val, setVal] = useState(initial !== undefined ? String(initial) : '');
  const qty = Number(val) || 0;
  const unit = item.unit === 'kg' ? 'kg' : 'qty';
  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      footer={
        <>
          {initial !== undefined && (
            <Button variant="danger" onClick={() => onSave(0)}>
              Remove
            </Button>
          )}
          <Button className="flex-1" onClick={() => onSave(qty)} disabled={qty <= 0 && initial === undefined}>
            Save
          </Button>
        </>
      }
    >
      <Field label={item.unit === 'kg' ? 'Weight (kg)' : 'Quantity'}>
        <Input
          autoFocus
          inputMode="decimal"
          type="number"
          step={item.unit === 'kg' ? '0.1' : '1'}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave(qty)}
          className="text-center font-display text-3xl"
        />
      </Field>
      <p className="mt-3 text-center text-gray-600">
        {qty} {unit} × {formatMoney(item.price)} = <b>{formatMoney(round2(qty * item.price))}</b>
      </p>
    </Modal>
  );
}
