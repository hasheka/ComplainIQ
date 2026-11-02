import { useState } from 'react';
import { Download, Eye, FilePlus2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { AsyncSection } from '@/components/data/AsyncSection';
import { useDatasets } from '@/context/DatasetContext';
import { useApiResource } from '@/hooks/useApiResource';
import { exportAnalysis, getAnalysis, listAnalyses, removeAnalysis, saveReport } from '@/services/api';
import type { AnalysisDetail, AnalysisListItem, DashboardResponse, RecommendationReport } from '@/types/api';
import { errorMessage, formatDate, formatNumber } from '@/utils/format';

export function ReportsPage() {
  const { selected } = useDatasets();
  const list = useApiResource((s) => listAnalyses(100, s), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [viewing, setViewing] = useState<AnalysisDetail | null>(null);

  async function run(key: string, action: () => Promise<unknown>, okText?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      if (okText) setMessage({ tone: 'ok', text: okText });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  const createSummary = () =>
    run('create', async () => { await saveReport(selected!.id, 'summary'); list.refetch(); }, 'Summary report saved.');
  const open = (a: AnalysisListItem) => run(`view-${a.id}`, async () => setViewing(await getAnalysis(a.id)));
  const remove = (a: AnalysisListItem) => {
    if (!window.confirm(`Delete the report "${a.title ?? 'Report'}"? This cannot be undone.`)) return;
    void run(`del-${a.id}`, async () => { await removeAnalysis(a.id); list.refetch(); }, 'Report deleted.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="History"
        title="Reports & History"
        description="Reports you saved from the Recommendations page, plus summary reports. Reopen them or export them as CSV, Markdown or JSON."
        actions={
          <Button onClick={createSummary} disabled={!selected || selected.status !== 'ready'} loading={busy === 'create'} icon={<FilePlus2 className="h-4 w-4" />}>
            New summary report
          </Button>
        }
      />
      {message && (
        <p role="status" className={`rounded-lg px-4 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{message.text}</p>
      )}
      <Card bodyClassName="p-0">
        <AsyncSection loading={list.loading} error={list.error} onRetry={list.refetch} isEmpty={!list.data?.length} emptyMessage="No saved reports yet. Save one from the Recommendations page, or create a summary report above.">
          <ul className="divide-y divide-slate-100">
            {(list.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-navy-900">
                    {a.title ?? 'Report'} <Badge tone={a.kind === 'recommendations' ? 'teal' : 'navy'}>{a.kind === 'recommendations' ? 'Recommendations' : 'Summary'}</Badge>
                  </p>
                  <p className="truncate text-xs text-slate-500">{a.headline}</p>
                  <p className="text-xs text-slate-400">{a.dataset_name} · {formatDate(a.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" loading={busy === `view-${a.id}`} onClick={() => void open(a)} icon={<Eye className="h-3.5 w-3.5" />}>View</Button>
                  {(['csv', 'md', 'json'] as const).map((fmt) => (
                    <Button key={fmt} size="sm" variant="ghost" loading={busy === `${fmt}-${a.id}`} onClick={() => void run(`${fmt}-${a.id}`, () => exportAnalysis(a.id, fmt))} icon={<Download className="h-3.5 w-3.5" />}>{fmt.toUpperCase()}</Button>
                  ))}
                  <Button size="sm" variant="ghost" loading={busy === `del-${a.id}`} onClick={() => remove(a)} icon={<Trash2 className="h-3.5 w-3.5 text-rose-600" />}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        </AsyncSection>
      </Card>
      <Modal open={viewing !== null} title={viewing?.title ?? 'Report'} onClose={() => setViewing(null)} footer={<Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>}>
        {viewing && <ReportView detail={viewing} />}
      </Modal>
    </div>
  );
}

function ReportView({ detail }: { detail: AnalysisDetail }) {
  if (detail.kind === 'recommendations') {
    const r = detail.report as unknown as RecommendationReport;
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{r.label}</p>
        <p className="text-slate-600">{detail.headline}</p>
        <ol className="space-y-3">
          {r.items.map((i) => (
            <li key={i.issue} className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-navy-900">{i.rank}. {i.issue} <Badge tone={i.tier === 'High' ? 'danger' : i.tier === 'Medium' ? 'warning' : 'neutral'}>{i.tier}</Badge></p>
              <p className="text-xs text-slate-500">{formatNumber(i.count)} complaints · {i.recommendation.title}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">{i.recommendation.actions.slice(0, 3).map((a) => <li key={a}>{a}</li>)}</ul>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const r = detail.report as unknown as DashboardResponse;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">{detail.headline}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h4 className="font-semibold text-navy-800">Top products</h4><ul className="mt-1 text-xs text-slate-700">{r.top_products.slice(0, 5).map((p) => <li key={p.name}>{p.name}: {formatNumber(p.count)}</li>)}</ul></div>
        <div><h4 className="font-semibold text-navy-800">Top issues</h4><ul className="mt-1 text-xs text-slate-700">{r.top_issues.slice(0, 5).map((p) => <li key={p.name}>{p.name}: {formatNumber(p.count)}</li>)}</ul></div>
      </div>
    </div>
  );
}
