import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, ChartTooltip, CHART_COLORS, GRID_STROKE, SERIES_PALETTE } from '@/components/charts/chartTheme';

export interface BarDatum {
  label: string;
  value: number;
}

interface RankedBarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  valueFormatter?: (value: number) => string;
  highlightFirst?: boolean;
  layout?: 'horizontal' | 'vertical';
  labelWidth?: number;
}

export function RankedBarChart({
  data,
  height,
  color = CHART_COLORS.teal,
  valueFormatter,
  highlightFirst = false,
  layout = 'vertical',
  labelWidth = 150,
}: RankedBarChartProps) {
  const computedHeight = height ?? Math.max(220, data.length * 36 + 24);
  const isVertical = layout === 'vertical';

  return (
    <div style={{ height: computedHeight }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={isVertical ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
          {isVertical ? (
            <>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={labelWidth}
                tick={{ ...AXIS_TICK, fill: '#1e293b' }}
                tickLine={false}
                axisLine={false}
                interval={0}
                tickFormatter={(value: string) => (value.length > 22 ? `${value.slice(0, 21)}…` : value)}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
              <YAxis hide />
            </>
          )}
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip valueFormatter={valueFormatter} />} />
          <Bar dataKey="value" name="Complaints" radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={22}>
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={highlightFirst && index === 0 ? CHART_COLORS.navy : color} />
            ))}
            <LabelList
              dataKey="value"
              position={isVertical ? 'right' : 'top'}
              formatter={(value: number) => (valueFormatter ? valueFormatter(value) : String(value))}
              style={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedBarChart<T extends object>({
  data,
  xKey,
  series,
  height = 280,
}: {
  data: T[];
  xKey: string;
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip />} />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              stackId="a"
              fill={item.color ?? SERIES_PALETTE[index % SERIES_PALETTE.length]}
              radius={index === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
