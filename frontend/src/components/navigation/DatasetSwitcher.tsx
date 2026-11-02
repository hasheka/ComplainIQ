import { useDatasets } from '@/context/DatasetContext';
import { formatNumber } from '@/utils/format';

export function DatasetSwitcher() {
  const { datasets, selected, select } = useDatasets();
  if (datasets.length === 0) return null;
  return (
    <div className="hidden min-w-0 items-center gap-2 md:flex">
      <label htmlFor="active-dataset" className="text-xs font-medium uppercase tracking-wide text-slate-500">Dataset</label>
      <select id="active-dataset" value={selected?.id ?? ''} onChange={(e) => select(e.target.value)}
        className="h-9 max-w-[16rem] truncate rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-navy-900 shadow-sm hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>{d.original_filename}{d.rows ? ` (${formatNumber(d.rows)} rows)` : ` (${d.status.replace('_', ' ')})`}</option>
        ))}
      </select>
    </div>
  );
}
