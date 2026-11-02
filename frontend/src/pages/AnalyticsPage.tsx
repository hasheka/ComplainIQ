import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SelectField } from '@/components/ui/Field';
import { AsyncSection, ChartCard } from '@/components/data/AsyncSection';
import { EMPTY_FILTERS, FilterBar, toApiFilters } from '@/components/data/FilterBar';
import { RequireDataset } from '@/components/data/RequireDataset';
import { RankedBarChart } from '@/components/charts/BarCharts';
import { TrendChart } from '@/components/charts/TrendChart';
import { SERIES_PALETTE } from '@/components/charts/chartTheme';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchIssueBreakdown, fetchIssues, fetchProducts, fetchRising, fetchTrends } from '@/services/api';
import type { Dataset } from '@/types/api';
import { formatDecimal, formatMonth, formatNumber, formatPercent } from '@/utils/format';

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analysis"
        title="Complaint Analytics"
        description="Which issues and products draw the most complaints, how they change over time, and which issues are rising. All figures are computed from your uploaded data."
      />
      <RequireDataset>{(dataset) => <AnalyticsBody key={dataset.id} dataset={dataset} />}</RequireDataset>
    </div>
  );
}

function AnalyticsBody({ dataset }: { dataset: Dataset }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [trendBy, setTrendBy] = useState<'issue' | 'product'>('issue');
  const [drillIssue, setDrillIssue] = useState('');
  const f = toApiFilters(filters);
  const deps = [dataset.id, filters.product, filters.start, filters.end, dataset.processed_at];

  const issues = useApiResource((s) => fetchIssues(dataset.id, f, 15, s), deps);
  const products = useApiResource((s) => fetchProducts(dataset.id, f, 15, s), deps);
  const trends = useApiResource((s) => fetchTrends(dataset.id, f, trendBy, 5, s), [...deps, trendBy]);
  const rising = useApiResource((s) => fetchRising(dataset.id, f, 'issue', 12, s), deps);
  const issueNames = issues.data?.items.map((i) => i.name) ?? [];
  const selectedIssue = issueNames.includes(drillIssue) ? drillIssue : issueNames[0] ?? '';   // falls back when a filter removes the chosen issue
  const breakdown = useApiResource(
    (s) => (selectedIssue ? fetchIssueBreakdown(dataset.id, selectedIssue, f, s) : Promise.resolve(null)),
    [...deps, selectedIssue],
  );

  const cat = trends.data?.by_category;
  const names = cat ? Object.keys(cat.series) : [];
  const multi = cat ? cat.months.map((month, i) => ({ month, ...Object.fromEntries(names.map((n) => [n, cat.series[n][i]])) })) : [];

  return (
    <div className="space-y-6">
      <FilterBar datasetId={dataset.id} idPrefix="an" value={filters} onChange={setFilters} />

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Most Frequent Issues" subtitle={issues.data ? `Top 15 of ${formatNumber(issues.data.total_unique)} issues` : undefined}>
          <AsyncSection loading={issues.loading} error={issues.error} onRetry={issues.refetch} isEmpty={!issues.data?.items.length}>
            <RankedBarChart data={(issues.data?.items ?? []).map((i) => ({ label: i.name, value: i.count }))} valueFormatter={formatNumber} color="#1f3d63" highlightFirst labelWidth={200} />
          </AsyncSection>
        </ChartCard>
        <ChartCard title="Complaints by Product" subtitle={products.data ? `Top 15 of ${formatNumber(products.data.total_unique)} products` : undefined}>
          <AsyncSection loading={products.loading} error={products.error} onRetry={products.refetch} isEmpty={!products.data?.items.length}>
            <RankedBarChart data={(products.data?.items ?? []).map((i) => ({ label: i.name, value: i.count }))} valueFormatter={formatNumber} highlightFirst labelWidth={200} />
          </AsyncSection>
        </ChartCard>
      </div>

      <ChartCard
        title="Monthly Trend of the Biggest Categories"
        subtitle="Complaints per month for the five largest"
        action={<SegmentedControl label="Trend by" value={trendBy} onChange={setTrendBy} options={[{ value: 'issue', label: 'Issues' }, { value: 'product', label: 'Products' }]} />}
      >
        <AsyncSection loading={trends.loading} error={trends.error} onRetry={trends.refetch} isEmpty={!multi.length} emptyMessage="No dated complaints in this selection.">
          <TrendChart
            data={multi}
            xKey="month"
            series={names.map((n, i) => ({ key: n, label: n, color: SERIES_PALETTE[i % SERIES_PALETTE.length] }))}
            xFormatter={formatMonth}
            valueFormatter={formatNumber}
            height={320}
          />
          <p className="mt-2 text-xs text-slate-500">The latest month may be incomplete if the data ends mid-month.</p>
        </AsyncSection>
      </ChartCard>

      <Card title="Issue Drill-down" subtitle="Which products and sub-issues make up one issue">
        <SelectField
          id="an-drill"
          label="Issue"
          wrapperClassName="mb-4 w-full sm:w-96"
          value={selectedIssue}
          onChange={(e) => setDrillIssue(e.target.value)}
          options={(issues.data?.items ?? []).map((i) => ({ value: i.name, label: i.name }))}
        />
        <AsyncSection loading={breakdown.loading} error={breakdown.error} onRetry={breakdown.refetch} isEmpty={!breakdown.data}>
          {breakdown.data && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-navy-800">Products ({formatNumber(breakdown.data.count)} complaints)</h4>
                <RankedBarChart data={breakdown.data.products.map((i) => ({ label: i.name, value: i.count }))} valueFormatter={formatNumber} labelWidth={180} />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-navy-800">Sub-issues</h4>
                {breakdown.data.sub_issues.available && breakdown.data.sub_issues.items.length ? (
                  <>
                    <RankedBarChart data={breakdown.data.sub_issues.items.map((i) => ({ label: i.name, value: i.count }))} valueFormatter={formatNumber} color="#1f3d63" labelWidth={180} />
                    {breakdown.data.sub_issues.missing_pct !== null && (
                      <p className="mt-2 text-xs text-slate-500">{formatPercent(breakdown.data.sub_issues.missing_pct, 0)} of these complaints have no sub-issue recorded.</p>
                    )}
                  </>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">This dataset has no sub-issue column, or none is recorded for this issue.</p>
                )}
              </div>
            </div>
          )}
        </AsyncSection>
      </Card>

      <Card
        title="Rising and Falling Issues"
        subtitle="Share of complaints in the last 12 complete months compared with the 12 months before"
        bodyClassName="p-0"
      >
        <AsyncSection loading={rising.loading} error={rising.error} onRetry={rising.refetch} isEmpty={false}>
          {rising.data?.status !== 'ok' ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">{rising.data?.reason ?? 'Not enough dated data to compare two periods.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <p className="px-5 pt-3 text-xs text-slate-500">
                {rising.data.period_prev?.join(' to ')} versus {rising.data.period_recent?.join(' to ')}. "Meaningful" means statistically significant (FDR-adjusted), at least 50 complaints and a 20% relative change in share.
              </p>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-5 py-2">Issue</th><th className="px-3 py-2 text-right">Earlier share</th><th className="px-3 py-2 text-right">Recent share</th><th className="px-3 py-2 text-right">Change</th><th className="px-5 py-2">Verdict</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rising.data.items.slice(0, 12).map((r) => (
                    <tr key={r.name}>
                      <td className="max-w-xs px-5 py-2 font-medium text-navy-900">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(r.share_prev_pct, 2)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(r.share_recent_pct, 2)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.share_change_pp > 0 ? '+' : ''}{formatDecimal(r.share_change_pp, 2)} pp</td>
                      <td className="px-5 py-2">
                        {r.meaningful ? <Badge tone={r.direction === 'up' ? 'danger' : 'success'}>{r.direction === 'up' ? 'Rising' : 'Falling'}</Badge> : <Badge>No meaningful change</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncSection>
      </Card>
    </div>
  );
}
