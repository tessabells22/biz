import { useState } from 'react';
import { Button, Card, PageHeader, Stat, Table } from '../components/ui';
import { formatMoney } from '../lib/calc';
import { download, toCsv } from '../lib/csv';
import { useCollection, useSettings } from '../lib/hooks';
import { dayKey, paymentsByMethod, salesByCategory, salesByDay, salesByEmployee, salesByHour, salesByItem, summarize } from '../lib/reports';
import type { Category } from '../lib/types';
import RangePicker from './RangePicker';
import SalesChart from './SalesChart';
import { useRange } from './useOrdersInRange';

const TABS = ['Summary', 'By item', 'By category', 'By employee', 'By payment', 'By hour'] as const;
type Tab = (typeof TABS)[number];

export default function Reports() {
  const settings = useSettings();
  const cur = settings.currency;
  const categories = useCollection<Category>('categories');
  const { key, setKey, custom, setCustom, range, orders, paymentOrders } = useRange('30d');
  const [tab, setTab] = useState<Tab>('Summary');
  const m = (n: number) => formatMoney(n, cur);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';

  const sum = summarize(orders);
  const days = salesByDay(orders, range.from, range.to);
  const items = salesByItem(orders);
  const cats = salesByCategory(orders, catName);
  const emps = salesByEmployee(orders);
  const pays = paymentsByMethod(paymentOrders, range.from, range.to);
  const hours = salesByHour(orders).filter((h) => h.orders > 0 || (h.hour >= 7 && h.hour <= 21));

  const exportRows = (): Record<string, unknown>[] => {
    switch (tab) {
      case 'Summary':
        return days.map((d) => ({ date: d.day, orders: d.orders, net_sales: d.sales }));
      case 'By item':
        return items.map((i) => ({ item: i.name, qty: i.qty, net_sales: i.sales, cost: i.cost, profit: i.sales - i.cost }));
      case 'By category':
        return cats;
      case 'By employee':
        return emps;
      case 'By payment':
        return pays;
      case 'By hour':
        return hours;
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sales reports"
        actions={
          <>
            <RangePicker value={key} onChange={setKey} custom={custom} onCustom={setCustom} />
            <Button
              variant="secondary"
              onClick={() => download(`happi-bubbles-${tab.toLowerCase().replace(/ /g, '-')}-${dayKey(range.from)}_${dayKey(range.to)}.csv`, toCsv(exportRows()))}
            >
              ⬇ Export CSV
            </Button>
          </>
        }
      />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${tab === t ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-brand-100'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Summary' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Gross sales" value={m(sum.grossSales)} />
            <Stat label="Discounts" value={m(sum.discounts)} tone="orange" />
            <Stat label="Refunds" value={m(sum.refunds)} tone="rose" />
            <Stat label="Net sales" value={m(sum.netSales)} tone="green" />
            <Stat label="Orders" value={sum.orders} />
            <Stat label="Average order" value={m(sum.avgTicket)} />
            <Stat label="Unpaid (these orders)" value={m(sum.receivables)} tone="rose" />
            <Stat label="Gross profit" value={m(sum.grossProfit)} sub="Net sales minus item cost" tone="green" />
          </div>
          <Card className="mt-4">
            <h3 className="mb-2 font-bold text-navy">Net sales per day</h3>
            <SalesChart data={days} xKey="day" currency={cur} xFormat={(d) => String(d).slice(5).replace('-', '/')} />
          </Card>
          <div className="mt-4">
            <Table head={['Date', 'Orders', 'Net sales']}>
              {days
                .slice()
                .reverse()
                .map((d) => (
                  <tr key={d.day}>
                    <td className="px-3 py-2">{d.day}</td>
                    <td className="px-3 py-2">{d.orders}</td>
                    <td className="px-3 py-2 font-semibold">{m(d.sales)}</td>
                  </tr>
                ))}
            </Table>
          </div>
        </>
      )}

      {tab === 'By item' && (
        <Table head={['Item', 'Qty sold', 'Net sales', 'Cost', 'Profit']}>
          {items.map((i) => (
            <tr key={i.name}>
              <td className="px-3 py-2 font-semibold">{i.name}</td>
              <td className="px-3 py-2">{i.qty}</td>
              <td className="px-3 py-2">{m(i.sales)}</td>
              <td className="px-3 py-2">{m(i.cost)}</td>
              <td className="px-3 py-2">{m(i.sales - i.cost)}</td>
            </tr>
          ))}
        </Table>
      )}

      {tab === 'By category' && (
        <Table head={['Category', 'Qty sold', 'Net sales']}>
          {cats.map((c) => (
            <tr key={c.name}>
              <td className="px-3 py-2 font-semibold">{c.name}</td>
              <td className="px-3 py-2">{c.qty}</td>
              <td className="px-3 py-2">{m(c.sales)}</td>
            </tr>
          ))}
        </Table>
      )}

      {tab === 'By employee' && (
        <Table head={['Employee', 'Orders', 'Net sales']}>
          {emps.map((e) => (
            <tr key={e.name}>
              <td className="px-3 py-2 font-semibold">{e.name}</td>
              <td className="px-3 py-2">{e.orders}</td>
              <td className="px-3 py-2">{m(e.sales)}</td>
            </tr>
          ))}
        </Table>
      )}

      {tab === 'By payment' && (
        <>
          <p className="mb-2 text-sm text-gray-500">Payments received in this period, including balances collected on older orders.</p>
          <Table head={['Payment method', 'Transactions', 'Amount']}>
            {pays.map((p) => (
              <tr key={p.method}>
                <td className="px-3 py-2 font-semibold">{p.method}</td>
                <td className="px-3 py-2">{p.count}</td>
                <td className="px-3 py-2">{m(p.amount)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {tab === 'By hour' && (
        <Card>
          <h3 className="mb-2 font-bold text-navy">Net sales by hour of day</h3>
          <SalesChart
            data={hours}
            xKey="hour"
            currency={cur}
            xFormat={(h) => {
              const n = Number(h);
              return `${n % 12 || 12}${n < 12 ? 'am' : 'pm'}`;
            }}
          />
        </Card>
      )}
    </div>
  );
}
