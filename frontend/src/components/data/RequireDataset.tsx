import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import { useDatasets } from '@/context/DatasetContext';
import type { Dataset } from '@/types/api';

const NOT_READY: Record<string, string> = {
  uploaded: 'This dataset is still being uploaded.',
  processing: 'This dataset is being cleaned. This page will fill in when it is ready.',
  needs_mapping: 'This dataset needs you to match its columns before it can be analysed.',
  failed: 'This dataset could not be processed.',
};

/** Renders `children(dataset)` only when a READY dataset is selected; otherwise explains what to do. */
export function RequireDataset({ children }: { children: (dataset: Dataset) => ReactNode }) {
  const { datasets, selected, loading, error, reload } = useDatasets();
  const toData = (label: string) => (
    <Link to="/app/data">
      <Button>{label}</Button>
    </Link>
  );
  if (loading) return <LoadingState label="Loading your datasets..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (datasets.length === 0 || !selected) {
    return (
      <EmptyState
        icon={<Database className="h-8 w-8" aria-hidden />}
        title="No data yet"
        message="Upload a CSV file of customer complaints to see your dashboard and analysis."
        action={toData('Upload data')}
      />
    );
  }
  if (selected.status !== 'ready') {
    return (
      <EmptyState
        icon={<Database className="h-8 w-8" aria-hidden />}
        title={`"${selected.original_filename}" is not ready`}
        message={selected.error ?? NOT_READY[selected.status] ?? 'This dataset is not ready.'}
        action={toData('Open data page')}
      />
    );
  }
  return <>{children(selected)}</>;
}
