import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DateRangeFields } from '@/components/ui/DateRangeFields';
import { SelectField } from '@/components/ui/Field';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchFilterOptions } from '@/services/api';
import type { AnalyticsFilters } from '@/types/api';

export interface FilterState { product: string; start: string; end: string }
export const EMPTY_FILTERS: FilterState = { product: '', start: '', end: '' };

export function toApiFilters(f: FilterState): AnalyticsFilters {
  return { product: f.product || undefined, date_from: f.start || undefined, date_to: f.end || undefined };
}

interface FilterBarProps {
  datasetId: string;
  idPrefix: string;
  value: FilterState;
  onChange: (next: FilterState) => void;
}

/** Product + date-range filters, populated from the dataset's real values. */
export function FilterBar({ datasetId, idPrefix, value, onChange }: FilterBarProps) {
  const options = useApiResource((signal) => fetchFilterOptions(datasetId, signal), [datasetId]);
  const productOptions = (options.data?.products ?? []).map((name) => ({ value: name, label: name }));
  const active = Boolean(value.product || value.start || value.end);
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-card sm:flex-row sm:items-end" role="search" aria-label="Filters">
      <SelectField
        id={`${idPrefix}-product`}
        label="Product"
        wrapperClassName="w-full sm:w-56"
        placeholder="All products"
        value={value.product}
        onChange={(event) => onChange({ ...value, product: event.target.value })}
        options={productOptions}
      />
      <DateRangeFields
        idPrefix={idPrefix}
        start={value.start}
        end={value.end}
        onStartChange={(start) => onChange({ ...value, start })}
        onEndChange={(end) => onChange({ ...value, end })}
      />
      <Button variant="ghost" size="sm" disabled={!active} onClick={() => onChange(EMPTY_FILTERS)} icon={<RotateCcw className="h-3.5 w-3.5" />}>
        Reset
      </Button>
    </div>
  );
}
