import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Frown, MessageSquareText, Smile, TextCursorInput } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/StateViews';
import { AsyncSection, ChartCard } from '@/components/data/AsyncSection';
import { EMPTY_FILTERS, FilterBar, toApiFilters } from '@/components/data/FilterBar';
import { KpiCard } from '@/components/data/KpiCard';
import { RequireDataset } from '@/components/data/RequireDataset';
import { SENTIMENT_COLORS } from '@/components/data/SentimentBadge';
import { RankedBarChart } from '@/components/charts/BarCharts';
import { ChartLegend, DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchFilterOptions, fetchSentimentResults } from '@/services/api';
import type { Dataset } from '@/types/api';
import { formatDecimal, formatMonth, formatNumber, formatPercent } from '@/utils/format';

export function SentimentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analysis"
        title="Sentiment Analysis"
        description="How negative the complaint narratives sound, by product, issue and month. Scored with VADER, a rule-based text method that runs on this computer."
      />
      <RequireDataset>{(dataset) => <SentimentBody key={dataset.id} dataset={dataset} />}</RequireDataset>
    </div>
  );
}

function SentimentBody({ dataset }: { dataset: Dataset }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const f = toApiFilters(filters);
  const options = useApiResource((s) => fetchFilterOptions(dataset.id, s), [dataset.id, dataset.processed_at]);
  const available = options.data?.sentiment_available ?? false;
  const results = useApiResource(
    (s) => (available ? fetchSentimentResults(dataset.id, f, s) : Promise.resolve(null)),
    [dataset.id, available, filters.product, filters.start, filters.end],
  );

  if (!options.loading && !options.error && !available) {
    return (
      <EmptyState
        icon={<MessageSquareText className="h-8 w-8" aria-hidden />}
        title="Sentiment has not been run for this dataset"
        message="Sentiment scoring reads each complaint narrative and takes a few minutes for large files. Start it from the Data page; this page fills in when it finishes. Complaints without a narrative are never counted as neutral."
        action={<Link to="/app/data"><Button>Go to Data &amp; Upload</Button></Link>}
      />
    );
  }

  const r = results.data;
  const d = r?.distribution;
  const donut = d ? (['Positive', 'Neutral', 'Negative'] as const).map((k) => ({ name: k, value: d.counts[k], color: SENTIMENT_COLORS[k.toLowerCase() as 'positive' | 'neutral' | 'negative'] })) : [];
  const monthly = (r?.monthly ?? []).filter((m) => !m.low_sample && m.negative_pct !== null);

  return (
    <div className="space-y-6">
      <FilterBar datasetId={dataset.id} idPrefix="se" value={filters} onChange={setFilters} />
      <AsyncSection loading={options.loading || results.loading} error={options.error ?? results.error} onRetry={results.refetch} isEmpty={!r}>
        {r && d && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <KpiCard label="Narratives analysed" value={formatNumber(d.analysed)} icon={TextCursorInput} accent="navy" hint={`${formatNumber(d.no_text)} have no narrative`} />
              <KpiCard label="Negative" value={formatPercent(d.pct.Negative)} icon={Frown} accent="rose" />
              <KpiCard label="Positive" value={formatPercent(d.pct.Positive)} icon={Smile} accent="emerald" />
              <KpiCard label="Average score" value={d.mean_compound === null ? '—' : formatDecimal(d.mean_compound, 2)} icon={MessageSquareText} accent="sky" hint="-1 very negative, +1 very positive" />
            </div>

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong>Read with care:</strong> {d.note}
            </p>

            <div className="grid gap-6 xl:grid-cols-3">
              <ChartCard title="Sentiment Distribution" subtitle="Share of analysed narratives">
                <div className="grid items-center gap-6 sm:grid-cols-2 xl:grid-cols-1">
                  <DonutChart data={donut.map((x) => ({ name: x.name, value: x.value }))} colors={donut.map((x) => x.color)} centerValue={formatNumber(d.analysed)} centerLabel="narratives" valueFormatter={formatNumber} height={220} />
                  <ChartLegend items={donut.map((x) => ({ name: x.name, value: formatPercent(d.pct[x.name]), color: x.color }))} />
                </div>
              </ChartCard>
              <ChartCard title="Negative Share by Month" subtitle="Months with fewer than 30 narratives are left out" className="xl:col-span-2">
                {monthly.length ? (
                  <TrendChart
                    data={monthly.map((m) => ({ month: m.month, negative: m.negative_pct }))}
                    xKey="month"
                    series={[{ key: 'negative', label: 'Negative %', color: '#e11d48' }]}
                    xFormatter={formatMonth}
                    valueFormatter={(v) => `${v.toFixed(0)}%`}
                    height={260}
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">Not enough dated narratives for a monthly view.</p>
                )}
              </ChartCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Most Negative Issues" subtitle={`Share of negative narratives (issues with at least ${r.min_narratives_per_category} analysed)`}>
                {r.most_negative_issues.length ? (
                  <RankedBarChart data={r.most_negative_issues.map((i) => ({ label: i.name, value: i.negative_pct }))} valueFormatter={(v) => `${v.toFixed(0)}%`} color="#e11d48" highlightFirst labelWidth={200} />
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No issue has enough analysed narratives.</p>
                )}
              </ChartCard>
              <ChartCard title="Negative Share by Product" subtitle="Products with enough analysed narratives">
                {r.by_product.length ? (
                  <RankedBarChart data={r.by_product.map((i) => ({ label: i.name, value: i.negative_pct }))} valueFormatter={(v) => `${v.toFixed(0)}%`} color="#1f3d63" highlightFirst labelWidth={200} />
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No product has enough analysed narratives.</p>
                )}
              </ChartCard>
            </div>

            <Card title="Details by product" subtitle="Counts behind the chart" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-2">Product</th><th className="px-3 py-2 text-right">Analysed</th><th className="px-3 py-2 text-right">Negative</th><th className="px-3 py-2 text-right">Neutral</th><th className="px-3 py-2 text-right">Positive</th><th className="px-5 py-2 text-right">Negative %</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.by_product.map((p) => (
                      <tr key={p.name}>
                        <td className="px-5 py-2 font-medium text-navy-900">{p.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.analysed)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.negative)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.neutral)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.positive)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{formatPercent(p.negative_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </AsyncSection>
    </div>
  );
}
