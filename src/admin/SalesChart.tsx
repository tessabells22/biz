import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../lib/calc';

/** Single-series bar chart; the card title names the series so no legend is needed. */
export default function SalesChart({
  data,
  xKey,
  xFormat,
  currency,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  xFormat?: (v: string | number) => string;
  currency: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#e5eef4" />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => `${currency}${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`}
          />
          <Tooltip
            cursor={{ fill: '#d8eff9' }}
            labelFormatter={(v) => (xFormat ? xFormat(v as string) : String(v))}
            formatter={(v, name) => (name === 'sales' ? [formatMoney(Number(v), currency), 'Sales'] : [v, name])}
            contentStyle={{ borderRadius: 12, border: '1px solid #b5e0f3', fontSize: 13 }}
          />
          <Bar dataKey="sales" fill="#2a95c8" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
