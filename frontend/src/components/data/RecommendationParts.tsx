import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { RecommendationItem, RecommendationReport, ScoreBreakdown } from '@/types/api';

export const TIER_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = { High: 'danger', Medium: 'warning', Low: 'neutral' };
export const TIER_BORDER: Record<string, string> = { High: 'border-l-rose-500', Medium: 'border-l-amber-500', Low: 'border-l-slate-300' };

/** The label every recommendation must carry: these are leads to investigate, not proven causes. */
export function DisclaimerBanner({ report }: { report: RecommendationReport }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note">
      <p className="font-semibold">{report.label}</p>
      {report.disclaimer && <p className="mt-1">{report.disclaimer}</p>}
    </div>
  );
}

export function TrendBadge({ trend }: { trend: RecommendationItem['trend'] }) {
  if (!trend) return <Badge>Trend not assessed</Badge>;
  if (!trend.meaningful) return <Badge><Minus className="mr-1 inline h-3 w-3" aria-hidden />No meaningful change</Badge>;
  return trend.direction === 'up'
    ? <Badge tone="danger"><ArrowUpRight className="mr-1 inline h-3 w-3" aria-hidden />Rising</Badge>
    : <Badge tone="success"><ArrowDownRight className="mr-1 inline h-3 w-3" aria-hidden />Falling</Badge>;
}

/** Points earned for each of the three measurable signals. Unassessed signals are shown as such, not as zero. */
export function ScoreBars({ breakdown }: { breakdown: ScoreBreakdown[] }) {
  return (
    <ul className="space-y-2">
      {breakdown.map((b) => (
        <li key={b.signal}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium capitalize text-navy-800">{b.signal}</span>
            <span className="tabular-nums text-slate-500">{b.assessed ? `${b.points} / ${b.max}` : 'not assessed'}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${b.assessed && b.max ? (100 * b.points) / b.max : 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{b.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function Limitations({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-sm font-semibold text-navy-800">Limitations</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
        {items.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </div>
  );
}
