import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, ChartTooltip, GRID_STROKE } from '@/components/charts/chartTheme';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

interface TrendChartProps<T extends object> {
  data: T[];
  xKey: string;
  series: TrendSeries[];
  height?: number;
  xFormatter?: (value: string) => string;
  valueFormatter?: (value: number) => string;
  stacked?: boolean;
}

export function TrendChart<T extends object>({
  data,
  xKey,
  series,
  height = 300,
  xFormatter,
  valueFormatter,
  stacked = false,
}: TrendChartProps<T>) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => (xFormatter ? xFormatter(value) : value)}
            minTickGap={16}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => (valueFormatter ? valueFormatter(value) : String(value))} />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={<ChartTooltip valueFormatter={valueFormatter} labelFormatter={xFormatter} />}
          />
          {series.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              fill={`url(#fill-${item.key})`}
              stackId={stacked ? 'stack' : undefined}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
