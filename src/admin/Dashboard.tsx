import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Badge, Card, PageHeader, Stat, STATUS_META } from '../components/ui';
import { formatMoney } from '../lib/calc';
import { all } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { paymentsByMethod, salesByDay, salesByItem, summarize } from '../lib/reports';
import { JOB_STATUSES, type Item, type Order } from '../lib/types';
import RangePicker from './RangePicker';
import SalesChart from './SalesChart';
import { useRange } from './useOrdersInRange';

export default function Dashboard() {
  const settings = useSettings();
  const cur = settings.currency;
  const { key, setKey, custom, setCustom, range, orders, paymentOrders } = useRange('7d');
  const sum = summarize(orders);
  const days = salesByDay(orders, range.from, range.to);
  const top = salesByItem(orders).slice(0, 6);
  const pays = paymentsByMethod(paymentOrders, range.from, range.to);
  const collected = pays.reduce((s, p) => s + p.amount, 0);

  const live = useLiveQuery(async () => {
    const all_ = await all<Order>('orders');
    const open = all_.filter((o) => !o.refunded && o.status !== 'claimed');
    const receivable = all_.filter((o) => !o.refunded).reduce((s, o) => s + o.balance, 0);
    const lowStock = (await all<Item>('items')).filter((i) => i.trackStock && i.stock <= i.lowStock);
    return { open, receivable, lowStock };
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Dashboard" actions={<RangePicker value={key} onChange={setKey} custom={custom} onCustom={setCustom} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales" value={formatMoney(sum.netSales, cur)} sub={`${sum.orders} orders`} />
        <Stat label="Collected" value={formatMoney(collected, cur)} sub="Payments received in period" tone="green" />
        <Stat label="Average order" value={formatMoney(sum.avgTicket, cur)} tone="orange" />
        <Stat label="Unpaid balances" value={formatMoney(live?.receivable ?? 0, cur)} sub="All open orders" tone="rose" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-2 font-bold text-navy">Net sales per day</h3>
          <SalesChart data={days} xKey="day" currency={cur} xFormat={(d) => String(d).slice(5).replace('-', '/')} />
        </Card>
        <Card>
          <h3 className="mb-3 font-bold text-navy">Laundry in the shop</h3>
          <div className="space-y-2">
            {JOB_STATUSES.filter((s) => s !== 'claimed').map((s) => (
              <div key={s} className="flex items-center justify-between">
                <Badge color={STATUS_META[s].color}>
                  {STATUS_META[s].emoji} {STATUS_META[s].label}
                </Badge>
                <span className="font-display text-xl font-bold text-navy">{live?.open.filter((o) => o.status === s).length ?? 0}</span>
              </div>
            ))}
          </div>
          <Link to="/pos/orders" className="mt-3 block text-sm font-bold text-brand-600">
            Open order board →
          </Link>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 font-bold text-navy">Top services</h3>
          {top.length === 0 && <p className="text-sm text-gray-500">No sales yet</p>}
          {top.map((t) => (
            <div key={t.name} className="flex justify-between py-1 text-sm">
              <span>
                {t.name} <span className="text-gray-400">×{t.qty}</span>
              </span>
              <span className="font-semibold">{formatMoney(t.sales, cur)}</span>
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-2 font-bold text-navy">Payments received</h3>
          {pays.length === 0 && <p className="text-sm text-gray-500">No payments yet</p>}
          {pays.map((p) => (
            <div key={p.method} className="py-1 text-sm">
              <div className="flex justify-between">
                <span>{p.method}</span>
                <span className="font-semibold">{formatMoney(p.amount, cur)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-brand-50">
                <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${collected ? (p.amount / collected) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-2 font-bold text-navy">Low stock</h3>
          {live?.lowStock.length === 0 && <p className="text-sm text-gray-500">All supplies are stocked 👍</p>}
          {live?.lowStock.map((i) => (
            <div key={i.id} className="flex justify-between py-1 text-sm">
              <span>{i.name}</span>
              <Badge color="rose">⚠ {i.stock} left</Badge>
            </div>
          ))}
          <Link to="/admin/inventory" className="mt-3 block text-sm font-bold text-brand-600">
            Manage inventory →
          </Link>
        </Card>
      </div>
    </div>
  );
}
