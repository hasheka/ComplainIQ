import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip, SERIES_PALETTE } from '@/components/charts/chartTheme';

export interface DonutDatum {
  name: string;
  value: number;
}

interface DonutChartProps {
  data: DonutDatum[];
  height?: number;
  colors?: string[];
  centerLabel?: string;
  centerValue?: string;
  valueFormatter?: (value: number) => string;
}

export function DonutChart({
  data,
  height = 240,
  colors = SERIES_PALETTE,
  centerLabel,
  centerValue,
  valueFormatter,
}: DonutChartProps) {
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="66%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="text-xl font-semibold text-navy-950">{centerValue}</span>}
          {centerLabel && <span className="text-xs text-slate-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function ChartLegend({ items }: { items: { name: string; value: string; color: string }[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-navy-800">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="truncate">{item.name}</span>
          </span>
          <span className="shrink-0 tabular-nums font-medium text-slate-600">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
