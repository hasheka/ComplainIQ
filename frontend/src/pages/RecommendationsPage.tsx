import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Save } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AsyncSection } from '@/components/data/AsyncSection';
import { EMPTY_FILTERS, FilterBar, toApiFilters } from '@/components/data/FilterBar';
import { DisclaimerBanner, Limitations, ScoreBars, TIER_BORDER, TIER_TONE, TrendBadge } from '@/components/data/RecommendationParts';
import { RequireDataset } from '@/components/data/RequireDataset';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchRecommendations, saveReport } from '@/services/api';
import type { Dataset } from '@/types/api';
import { errorMessage, formatNumber, formatPercent } from '@/utils/format';

type TierFilter = 'all' | 'High' | 'Medium' | 'Low';

export function RecommendationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Action plan"
        title="AI-Based Solution Recommendations"
        description="Practical actions for the most frequent complaint issues, ranked by a transparent score from volume, trend and sentiment. Every item explains why it was suggested."
      />
      <RequireDataset>{(dataset) => <Body key={dataset.id} dataset={dataset} />}</RequireDataset>
    </div>
  );
}

function Body({ dataset }: { dataset: Dataset }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tier, setTier] = useState<TierFilter>('all');
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ state: 'idle' });
  const report = useApiResource(
    (s) => fetchRecommendations(dataset.id, toApiFilters(filters), 10, s),
    [dataset.id, filters.product, filters.start, filters.end, dataset.processed_at],
  );
  const r = report.data;
  const items = (r?.items ?? []).filter((i) => tier === 'all' || i.tier === tier);
  const count = (t: string) => (r?.items ?? []).filter((i) => i.tier === t).length;

  async function onSave() {
    setSave({ state: 'saving' });
    try {
      await saveReport(dataset.id, 'recommendations', undefined, filters.product || undefined);
      setSave({ state: 'saved' });
    } catch (error) {
      setSave({ state: 'error', message: errorMessage(error) });
    }
  }

  return (
    <div className="space-y-6">
      <FilterBar datasetId={dataset.id} idPrefix="rec" value={filters} onChange={(v) => { setFilters(v); setSave({ state: 'idle' }); }} />
      <AsyncSection loading={report.loading} error={report.error} onRetry={report.refetch} isEmpty={!r || r.status === 'no_data'} emptyMessage="No complaints match these filters.">
        {r && (
          <>
            <DisclaimerBanner report={r} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                label="Priority"
                value={tier}
                onChange={setTier}
                options={[
                  { value: 'all', label: `All (${r.items.length})` },
                  { value: 'High', label: `High (${count('High')})` },
                  { value: 'Medium', label: `Medium (${count('Medium')})` },
                  { value: 'Low', label: `Low (${count('Low')})` },
                ]}
              />
              <div className="flex items-center gap-3">
                {save.state === 'saved' && <span className="text-xs text-emerald-700">Saved. <Link className="underline" to="/app/reports">Open Reports</Link></span>}
                {save.state === 'error' && <span className="text-xs text-rose-700">{save.message}</span>}
                <Button variant="secondary" size="sm" loading={save.state === 'saving'} onClick={onSave} icon={<Save className="h-3.5 w-3.5" />}>Save this report</Button>
              </div>
            </div>
            {r.method && (
              <p className="text-xs text-slate-500">
                Score = volume (max {r.method.signals.volume}) + trend (max {r.method.signals.trend}) + sentiment (max {r.method.signals.sentiment}). {r.method.note}
                {r.dataset && !r.dataset.sentiment_available && ' Sentiment has not been run, so that signal is not assessed.'}
              </p>
            )}
            {items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No issues at this priority.</p>}
            {items.map((item) => (
              <Card
                key={item.issue}
                className={`border-l-4 ${TIER_BORDER[item.tier] ?? ''}`}
                title={`${item.rank}. ${item.issue}`}
                subtitle={`${formatNumber(item.count)} complaints · ${formatPercent(item.share_pct, 2)} of all · score ${item.score.total}`}
                action={<div className="flex items-center gap-2"><TrendBadge trend={item.trend} /><Badge tone={TIER_TONE[item.tier] ?? 'neutral'}>{item.tier} priority</Badge></div>}
              >
                <div className="grid gap-6 lg:grid-cols-3">
                  <section className="lg:col-span-2" aria-label="Recommended actions">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-navy-800"><ClipboardCheck className="h-4 w-4 text-teal-600" aria-hidden />{item.recommendation.title}</h4>
                    {!item.recommendation.specific && <p className="mt-1 text-xs text-slate-500">General guidance: no issue-specific rule matches this issue name.</p>}
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-800">
                      {item.recommendation.actions.map((a) => <li key={a}>{a}</li>)}
                    </ol>
                    <h4 className="mt-4 text-sm font-semibold text-navy-800">Why this is suggested</h4>
                    <p className="mt-1 text-sm text-slate-700">{item.recommendation.reason}</p>
                    <h4 className="mt-4 text-sm font-semibold text-navy-800">How to know it worked</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {item.recommendation.follow_up_metrics.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </section>
                  <section aria-label="Why it ranks here" className="space-y-3 rounded-lg bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold text-navy-800">Why it ranks here</h4>
                    <ScoreBars breakdown={item.score.breakdown} />
                    <p className="text-xs text-slate-500">{item.recommendation.priority_criteria}</p>
                  </section>
                </div>
              </Card>
            ))}
            <Limitations items={r.limitations} />
          </>
        )}
      </AsyncSection>
    </div>
  );
}
