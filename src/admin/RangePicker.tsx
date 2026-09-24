import { Input, Select } from '../components/ui';
import type { RangeKey } from './useOrdersInRange';

export default function RangePicker({
  value,
  onChange,
  custom,
  onCustom,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onChange={(e) => onChange(e.target.value as RangeKey)} className="w-auto">
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="month">This month</option>
        <option value="lastMonth">Last month</option>
        <option value="custom">Custom…</option>
      </Select>
      {value === 'custom' && (
        <>
          <Input type="date" className="w-auto" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <span>to</span>
          <Input type="date" className="w-auto" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </>
      )}
    </div>
  );
}
