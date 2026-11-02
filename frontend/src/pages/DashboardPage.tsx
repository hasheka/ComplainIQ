import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, CircleAlert, MessageSquareWarning, Package, RotateCcw, Target, Trophy } from 'lucide-react';
import { KpiCard } from '@/components/data/KpiCard';
import { AsyncSection, ChartCard } from '@/components/data/AsyncSection';
import { SENTIMENT_COLORS, SENTIMENT_ORDER } from '@/components/data/SentimentBadge';
import { DateRangeFields } from '@/components/ui/DateRangeFields';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField } from '@/components/ui/Field';
import { Card } from '@/components/ui/Card';
import { TrendChart } from '@/components/charts/TrendChart';
import { RankedBarChart } from '@/components/charts/BarCharts';
import { ChartLegend, DonutChart } from '@/components/charts/DonutChart';
import { SERIES_PALETTE } from '@/components/charts/chartTheme';
import { RequireDataset } from '@/components/data/RequireDataset';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchDashboardSummary, fetchFilterOptions, listAnalyses } from '@/services/api';
import type { Dataset } from '@/types/api';
import type { DashboardFilters } from '@/types/types';
import { formatDate, formatDecimal, formatMonth, formatNumber, formatPercent, toPercentage, capitalise } from '@/utils/format';

const EMPTY_FILTERS = { product: '', start: '', end: '' };

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Executive Dashboard"
        description="Complaint volume, product exposure and sentiment at a glance. Filter by product or date to focus the view."
      />
      <RequireDataset>{(dataset) => <DashboardBody key={dataset.id} dataset={dataset} />}</RequireDataset>
    </div>
  );
}

function DashboardBody({ dataset }: { dataset: Dataset }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const activeFilters: DashboardFilters = {
    product: filters.product || undefined,
    start_date: filters.start || undefined,
    end_date: filters.end || undefined,
  };

  const options = useApiResource((signal) => fetchFilterOptions(dataset.id, signal), [dataset.id]);
  const recent = useApiResource((signal) => listAnalyses(5, signal), [dataset.id]);
  const summary = useApiResource(
    (signal) => fetchDashboardSummary(dataset.id, activeFilters, signal),
    [dataset.id, filters.product, filters.start, filters.end, dataset.processed_at],
  );

  const data = summary.data;
  const sd = data?.sentiment_distribution ?? null;
  const sentimentTotal = sd ? sd.positive + sd.negative + sd.neutral : 0;
  const sentimentData = sd
    ? SENTIMENT_ORDER.map((key) => ({
        name: capitalise(key),
        value: sd[key],
        color: SENTIMENT_COLORS[key],
      }))
    : [];

  const productOptions = (options.data?.products ?? []).map((name) => ({ value: name, label: name }));
  const hasFilters = Boolean(filters.product || filters.start || filters.end);

  const kpis = data
    ? [
        { label: 'Total Complaints', value: formatNumber(data.total_complaints), icon: MessageSquareWarning, accent: 'teal' as const },
        { label: 'Total Products', value: formatNumber(data.total_products), icon: Package, accent: 'navy' as const },
        { label: 'Total Issues', value: formatNumber(data.total_issues), icon: CircleAlert, accent: 'amber' as const },
        {
          label: 'Avg. Complaints / Month',
          hint: 'Complete months only',
          value: data.avg_complaints_per_month === null ? '—' : formatDecimal(data.avg_complaints_per_month, 0),
          icon: CalendarRange,
          accent: 'sky' as const,
        },
        { label: 'Most Reported Product', value: data.most_reported_product ?? '—', icon: Trophy, accent: 'emerald' as const },
        { label: 'Most Frequent Issue', value: data.most_frequent_issue ?? '—', icon: Target, accent: 'rose' as const },
      ]
    : [];

  return (
    <div className="space-y-6">
          <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:flex-row sm:items-end" role="search" aria-label="Dashboard filters">
            <SelectField
              id="dash-product"
              label="Product"
              wrapperClassName="w-full sm:w-56"
              placeholder="All products"
              value={filters.product}
              onChange={(event) => setFilters((current) => ({ ...current, product: event.target.value }))}
              options={productOptions}
            />
            <DateRangeFields
              idPrefix="dash"
              start={filters.start}
              end={filters.end}
              onStartChange={(value) => setFilters((current) => ({ ...current, start: value }))}
              onEndChange={(value) => setFilters((current) => ({ ...current, end: value }))}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasFilters}
              onClick={() => setFilters(EMPTY_FILTERS)}
              icon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Reset
            </Button>
          </div>

      <AsyncSection
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.refetch}
        isEmpty={!data}
        loadingLabel="Loading dashboard figures..."
      >
        {data && (
          <>
            <p className="text-xs text-slate-500">
              {dataset.original_filename}: {data.date_min ? `${formatDate(data.date_min)} to ${formatDate(data.date_max)}` : 'no valid dates'}; {formatPercent(data.narrative_pct, 0)} of complaints include a narrative.
            </p>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-6">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} hint={'hint' in kpi ? kpi.hint : undefined} />
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <ChartCard
                title="Monthly Complaint Trend"
                subtitle="Complaints received per month"
                className="xl:col-span-2"
              >
                {data.monthly_trend.length ? (
                  <TrendChart
                    data={data.monthly_trend}
                    xKey="month"
                    series={[{ key: 'complaints', label: 'Complaints', color: '#1ea8a0' }]}
                    xFormatter={formatMonth}
                    valueFormatter={formatNumber}
                    height={300}
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No monthly data for this selection.</p>
                )}
                {data.latest_month_partial && (
                  <p className="mt-2 text-xs text-slate-500">The latest month is incomplete (the data ends on {formatDate(data.date_max)}), so its count looks lower than it really is.</p>
                )}
              </ChartCard>

              <ChartCard title="Sentiment Distribution" subtitle="Share of complaints by sentiment">
                {sentimentTotal ? (
                  <div className="grid items-center gap-6 sm:grid-cols-2 xl:grid-cols-1">
                    <DonutChart
                      data={sentimentData.map((item) => ({ name: item.name, value: item.value }))}
                      colors={sentimentData.map((item) => item.color)}
                      centerValue={formatNumber(sentimentTotal)}
                      centerLabel="complaints"
                      valueFormatter={formatNumber}
                      height={220}
                    />
                    <ChartLegend
                      items={sentimentData.map((item) => ({
                        name: item.name,
                        value: formatPercent(toPercentage(item.value, sentimentTotal)),
                        color: item.color,
                      }))}
                    />
                  </div>
                ) : sd ? (
                  <p className="py-16 text-center text-sm text-slate-500">No analysed narratives in this selection.</p>
                ) : (
                  <div className="py-10 text-center">
                    <p className="text-sm text-slate-600">Sentiment has not been run for this dataset yet.</p>
                    <p className="mt-1 text-xs text-slate-500">Complaints without a narrative are never counted as neutral.</p>
                    <Link to="/app/data" className="mt-4 inline-block"><Button size="sm" variant="secondary">Run sentiment analysis</Button></Link>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Top 10 Products" subtitle="Ranked by complaint count">
                <RankedBarChart
                  data={data.top_products.slice(0, 10).map((item) => ({ label: item.label, value: item.count }))}
                  valueFormatter={formatNumber}
                  highlightFirst
                />
              </ChartCard>

              <ChartCard title="Top 10 Complaint Issues" subtitle="Most reported issue categories">
                <RankedBarChart
                  data={data.top_issues.slice(0, 10).map((item) => ({ label: item.label, value: item.count }))}
                  valueFormatter={formatNumber}
                  color="#1f3d63"
                  highlightFirst
                />
              </ChartCard>

              <ChartCard title="Complaint Distribution by Product" subtitle="Share of total complaints">
                {data.product_distribution.length ? (
                  <div className="grid items-center gap-6 sm:grid-cols-2">
                    <DonutChart
                      data={data.product_distribution.slice(0, 8).map((item) => ({ name: item.label, value: item.count }))}
                      centerValue={formatNumber(data.total_complaints)}
                      centerLabel="total"
                      valueFormatter={formatNumber}
                      height={240}
                    />
                    <ChartLegend
                      items={data.product_distribution.slice(0, 8).map((item, index) => ({
                        name: item.label,
                        value: formatPercent(item.percentage ?? toPercentage(item.count, data.total_complaints)),
                        color: SERIES_PALETTE[index % SERIES_PALETTE.length],
                      }))}
                    />
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No product distribution available.</p>
                )}
              </ChartCard>

              <Card title="Recent reports" subtitle="Reports you saved from this app" className="xl:col-span-2" bodyClassName="p-0">
                <AsyncSection loading={recent.loading} error={recent.error} onRetry={recent.refetch} isEmpty={!recent.data || recent.data.length === 0} emptyMessage="You have not saved any reports yet. Saved reports will appear here.">
                  <ul className="divide-y divide-slate-100">
                    {(recent.data ?? []).map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <div className="min-w-0"><p className="truncate text-sm font-medium text-navy-900">{r.title ?? 'Report'}</p><p className="truncate text-xs text-slate-500">{r.headline}</p></div>
                        <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </AsyncSection>
              </Card>
            </div>
          </>
        )}
      </AsyncSection>

    </div>
  );
}
