import { useState } from 'react';
import { Download, Settings2, Trash2 } from 'lucide-react';
import { AnalysisJobs } from '@/components/data/AnalysisJobs';
import { AsyncSection } from '@/components/data/AsyncSection';
import { DataPreview } from '@/components/data/DataPreview';
import { DataTable, type Column } from '@/components/data/DataTable';
import { KpiCard } from '@/components/data/KpiCard';
import { MappingForm } from '@/components/data/MappingForm';
import { QualityReport } from '@/components/data/QualityReport';
import { StatusBadge } from '@/components/data/StatusBadge';
import { UploadDropzone } from '@/components/data/UploadDropzone';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/StateViews';
import { useDatasets } from '@/context/DatasetContext';
import { useApiResource } from '@/hooks/useApiResource';
import { downloadCleaned, fetchInfo, getDataset, removeDataset } from '@/services/api';
import type { Dataset } from '@/types/api';
import { errorMessage, formatDate, formatNumber } from '@/utils/format';
import { CalendarRange, FileText, MessageSquareText, Rows3 } from 'lucide-react';

const sizeLabel = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function DataPage() {
  const { datasets, selected, select, reload } = useDatasets();
  const info = useApiResource((signal) => fetchInfo(signal), []);
  const detail = useApiResource(
    async (signal) => (selected ? getDataset(selected.id, signal) : null),
    [selected?.id, selected?.status, selected?.processed_at],
  );
  const [showMapping, setShowMapping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const columns: Column<Dataset>[] = [
    { key: 'name', header: 'File', render: (d) => <span className="font-medium text-navy-900">{d.original_filename}</span> },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    { key: 'rows', header: 'Rows', align: 'right', render: (d) => formatNumber(d.rows) },
    { key: 'size', header: 'Size', align: 'right', render: (d) => sizeLabel(d.size_bytes) },
    { key: 'date', header: 'Uploaded', render: (d) => formatDate(d.created_at) },
    { key: 'sel', header: '', render: (d) => (selected?.id === d.id ? <span className="text-xs font-medium text-teal-700">Selected</span> : <Button size="sm" variant="ghost" onClick={() => select(d.id)}>Open</Button>) },
  ];

  const doDelete = async () => {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await removeDataset(selected.id);
      setConfirmDelete(false);
      await reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const doDownload = async () => {
    if (!selected) return;
    setActionError(null);
    try { await downloadCleaned(selected.id); } catch (caught) { setActionError(errorMessage(caught)); }
  };

  const d = detail.data;
  const s = d?.summary;
  const afterMapping = () => { setShowMapping(false); void reload(); };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Your data" title="Data & Upload" description="Upload a CSV of customer complaints. We check it, clean it, and show you exactly what changed before you analyse anything." />
      <Card title="Upload a file"><UploadDropzone maxMb={info.data?.limits.max_upload_mb ?? 500} onUploaded={async (ds) => { select(ds.id); await reload(); }} /></Card>

      <Card title="Your datasets" bodyClassName="p-0">
        <DataTable columns={columns} rows={datasets} rowKey={(r) => r.id} empty={<EmptyState title="No datasets yet" message="Upload your first file above to get started." />} />
      </Card>

      {selected && (
        <section aria-label="Selected dataset" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="truncate text-lg font-semibold text-navy-950">{selected.original_filename}</h2><div className="mt-1 flex items-center gap-2"><StatusBadge status={selected.status} /><span className="text-xs text-slate-500">{sizeLabel(selected.size_bytes)}</span></div></div>
            <div className="flex flex-wrap gap-2">
              {selected.status === 'ready' && <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => void doDownload()}>Download cleaned CSV</Button>}
              {d?.file_columns && selected.status !== 'processing' && <Button variant="secondary" size="sm" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setShowMapping((v) => !v)}>Adjust columns</Button>}
              <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>Delete</Button>
            </div>
          </div>
          {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{actionError}</p>}

          <AsyncSection loading={detail.loading && !d} error={detail.error} onRetry={detail.refetch} isEmpty={!d} loadingLabel="Loading dataset details...">
            {d && (<>
              {selected.error && selected.status !== 'ready' && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{selected.error}</p>}
              {(selected.status === 'processing' || selected.status === 'uploaded') && <EmptyState title="Cleaning your data" message="This usually takes a few seconds, longer for very large files. This page updates by itself." />}
              {(d.status === 'needs_mapping' || d.status === 'failed' || showMapping) && d.file_columns && <MappingForm key={`${d.id}-${d.status}`} dataset={d} onSaved={afterMapping} title={d.status === 'ready' ? 'Adjust your columns' : 'Match your columns'} />}
              {d.status === 'ready' && s && (<>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <KpiCard label="Rows" value={formatNumber(s.total_complaints)} icon={Rows3} accent="teal" />
                  <KpiCard label="With a narrative" value={`${s.narrative_pct}%`} icon={FileText} accent="navy" hint={`${formatNumber(s.narratives_present)} complaints`} />
                  <KpiCard label="Date range" value={s.date_min ? `${formatDate(s.date_min)} to ${formatDate(s.date_max)}` : 'No valid dates'} icon={CalendarRange} accent="sky" />
                  <KpiCard label="Products / issues" value={`${s.unique_products} / ${s.unique_issues}`} icon={MessageSquareText} accent="amber" />
                </div>
                <QualityReport dataset={d} />
                <AnalysisJobs dataset={selected} />
                <DataPreview datasetId={d.id} version={d.processed_at ?? ''} />
              </>)}
            </>)}
          </AsyncSection>
        </section>
      )}

      <Modal open={confirmDelete} title="Delete this dataset?" onClose={() => setConfirmDelete(false)}
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={() => void doDelete()}>Delete permanently</Button></>}>
        <p className="text-sm text-slate-600">This permanently deletes <strong>{selected?.original_filename}</strong>: the original upload, the cleaned copy, any sentiment and prediction results, and the reports saved from it. This cannot be undone.</p>
      </Modal>
    </div>
  );
}
