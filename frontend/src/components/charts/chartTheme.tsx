import type { ReactNode } from 'react';
import type { TooltipProps } from 'recharts';
import { formatNumber } from '@/utils/format';

export const CHART_COLORS = {
  navy: '#1f3d63',
  teal: '#1ea8a0',
  sky: '#0ea5e9',
  amber: '#f59e0b',
  slate: '#94a3b8',
  rose: '#e11d48',
  emerald: '#10b981',
};

export const SERIES_PALETTE = [
  CHART_COLORS.navy,
  CHART_COLORS.teal,
  CHART_COLORS.sky,
  CHART_COLORS.amber,
  CHART_COLORS.slate,
  CHART_COLORS.rose,
  CHART_COLORS.emerald,
  '#5a84b8',
  '#6ddcd5',
  '#86a7cf',
];

export const AXIS_TICK = { fill: '#64748b', fontSize: 12 };

export const GRID_STROKE = '#e2e8f0';

interface TooltipRow {
  name?: string | number;
  value?: number | string;
  color?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: TooltipProps<number, string> & {
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}): ReactNode {
  if (!active || !payload?.length) return null;
  const rows = payload as TooltipRow[];
  const title = labelFormatter && label !== undefined ? labelFormatter(String(label)) : String(label ?? '');
  return (
    <div className="min-w-[160px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2.5 shadow-raised backdrop-blur">
      {title && <p className="mb-1.5 text-xs font-semibold text-navy-900">{title}</p>}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={String(row.name)} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
              {row.name}
            </span>
            <span className="font-medium tabular-nums text-navy-900">
              {typeof row.value === 'number'
                ? valueFormatter
                  ? valueFormatter(row.value)
                  : formatNumber(row.value)
                : row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
