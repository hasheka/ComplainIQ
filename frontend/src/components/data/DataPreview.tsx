import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { AsyncSection } from '@/components/data/AsyncSection';
import { DataTable, type Column } from '@/components/data/DataTable';
import { useApiResource } from '@/hooks/useApiResource';
import { previewDataset } from '@/services/api';
import { fieldLabel } from '@/components/data/QualityReport';

const PAGE_SIZE = 10;
type Row = Record<string, string | boolean | null>;

export function DataPreview({ datasetId, version }: { datasetId: string; version: string }) {
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useApiResource((signal) => previewDataset(datasetId, page, PAGE_SIZE, signal), [datasetId, page, version]);
  const keys = data?.rows[0] ? Object.keys(data.rows[0]).filter((k) => k !== 'has_narrative') : [];
  const columns: Column<Row>[] = keys.map((key) => ({
    key, header: fieldLabel(key),
    render: (row) => <span className={key === 'narrative' ? 'block max-w-xs truncate text-slate-600' : ''} title={key === 'narrative' ? String(row[key] ?? '') : undefined}>{row[key] === null || row[key] === '' ? <span className="text-slate-300">—</span> : String(row[key])}</span>,
  }));
  return (
    <Card title="Preview of the cleaned data" subtitle="Narratives are shortened here. This is your own data, shown only to you." bodyClassName="p-0">
      <AsyncSection loading={loading && !data} error={error} onRetry={refetch} isEmpty={!data || data.rows.length === 0} emptyMessage="There are no rows to show.">
        {data && (<><DataTable columns={columns} rows={data.rows} rowKey={(r) => `${page}-${String(r.complaint_id ?? '')}-${String(r.date)}-${String(r.issue)}-${String(r.narrative ?? '').slice(0, 20)}-${data.rows.indexOf(r)}`} /><div className="border-t border-slate-100 px-5 py-3"><Pagination page={page} pageSize={PAGE_SIZE} total={data.total_rows} onPageChange={setPage} /></div></>)}
      </AsyncSection>
    </Card>
  );
}
