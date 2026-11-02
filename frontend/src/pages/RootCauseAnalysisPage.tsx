import { useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { AsyncSection } from '@/components/data/AsyncSection';
import { EMPTY_FILTERS, FilterBar, toApiFilters } from '@/components/data/FilterBar';
import { DisclaimerBanner, Limitations, TrendBadge } from '@/components/data/RecommendationParts';
import { RequireDataset } from '@/components/data/RequireDataset';
import { RankedBarChart } from '@/components/charts/BarCharts';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchRecommendations } from '@/services/api';
import type { Dataset, RecommendationItem } from '@/types/api';
import { formatNumber, formatPercent } from '@/utils/format';

export function RootCauseAnalysisPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Investigation"
        title="Root Cause Analysis"
        description="For the most frequent complaint issues: what your data actually shows, kept separate from possible explanations that still need to be tested."
      />
      <RequireDataset>{(dataset) => <Body key={dataset.id} dataset={dataset} />}</RequireDataset>
    </div>
  );
}

function Body({ dataset }: { dataset: Dataset }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const report = useApiResource(
    (s) => fetchRecommendations(dataset.id, toApiFilters(filters), 8, s),
    [dataset.id, filters.product, filters.start, filters.end, dataset.processed_at],
  );
  const r = report.data;
  return (
    <div className="space-y-6">
      <FilterBar datasetId={dataset.id} idPrefix="rc" value={filters} onChange={setFilters} />
      <AsyncSection loading={report.loading} error={report.error} onRetry={report.refetch} isEmpty={!r || r.status === 'no_data'} emptyMessage="No complaints match these filters.">
        {r && (
          <>
            <DisclaimerBanner report={r} />
            {r.themes.length > 0 && (
              <Card title="Recurring themes" subtitle="Issue names that describe the same kind of problem are combined">
                <ul className="grid gap-3 md:grid-cols-2">
                  {r.themes.slice(0, 6).map((t) => (
                    <li key={t.rule_id} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-navy-900">{t.title}</p>
                      <p className="text-xs text-slate-500">{formatNumber(t.count)} complaints ({formatPercent(t.share_pct, 1)}) across {t.issues.length} issue name{t.issues.length === 1 ? '' : 's'}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.issues.slice(0, 3).map((i) => i.name).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {r.items.map((item) => <CauseCard key={item.issue} item={item} />)}
            <Limitations items={r.limitations} />
          </>
        )}
      </AsyncSection>
    </div>
  );
}

function CauseCard({ item }: { item: RecommendationItem }) {
  const rec = item.recommendation;
  return (
    <Card
      title={`${item.rank}. ${item.issue}`}
      subtitle={`${formatNumber(item.count)} complaints · ${formatPercent(item.share_pct, 2)} of all`}
      action={<TrendBadge trend={item.trend} />}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="What the data shows">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Badge tone="teal">Data-supported</Badge> What the data shows</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {item.why_highlighted.map((w) => <li key={w}>{w}</li>)}
          </ul>
          {item.products.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-500">Where it comes from (products)</p>
              <RankedBarChart data={item.products.map((p) => ({ label: p.name, value: p.count }))} valueFormatter={formatNumber} height={Math.max(140, item.products.length * 32)} labelWidth={170} />
            </div>
          )}
          {item.sub_issues.available && item.sub_issues.items.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-500">Most common sub-issues</p>
              <RankedBarChart data={item.sub_issues.items.map((p) => ({ label: p.name, value: p.count }))} valueFormatter={formatNumber} color="#1f3d63" height={Math.max(140, item.sub_issues.items.length * 32)} labelWidth={170} />
            </div>
          )}
          {item.same_theme_variants.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">Also reported under similar names: {item.same_theme_variants.slice(0, 4).map((v) => `${v.name} (${formatNumber(v.count)})`).join(', ')}</p>
          )}
        </section>
        <section aria-label="Possible explanations">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Badge tone="warning">Possible, not proven</Badge> Possible explanations to test</h4>
          <p className="mt-2 text-sm text-slate-700">{rec.context}</p>
          <p className="mt-3 text-xs font-medium text-slate-500">Assumptions and what would confirm them</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {rec.evidence_and_assumptions.map((e) => <li key={e}>{e}</li>)}
          </ul>
          {!rec.specific && <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><Search className="h-3 w-3" aria-hidden />General guidance: no issue-specific rule matches this issue name.</p>}
        </section>
      </div>
    </Card>
  );
}
