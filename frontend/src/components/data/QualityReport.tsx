import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { DatasetDetail } from '@/types/api';
import { formatNumber, formatPercent } from '@/utils/format';

const FIELD_LABEL: Record<string, string> = {
  date: 'Date', product: 'Product', issue: 'Issue', sub_product: 'Sub-product', sub_issue: 'Sub-issue',
  narrative: 'Complaint narrative', company: 'Company', state: 'State', complaint_id: 'Complaint ID',
};
export const fieldLabel = (key: string) => FIELD_LABEL[key] ?? key;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-navy-900">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function QualityReport({ dataset }: { dataset: DatasetDetail }) {
  const r = dataset.cleaning_report;
  const p = dataset.profile;
  if (!r || !p) return null;
  const blanks = Object.entries(r.blank_text_to_missing);
  return (
    <Card title="Data-quality report" subtitle="What we found in your file and what we changed. Nothing is removed without being counted here.">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Rows read" value={formatNumber(r.rows_in)} />
        <Stat label="Rows kept" value={formatNumber(r.rows_out)} hint={r.rows_in === r.rows_out ? 'No rows removed' : `${formatNumber(r.rows_in - r.rows_out)} removed`} />
        <Stat label="Unreadable dates" value={formatNumber(r.invalid_dates)} hint={r.invalid_dates ? 'Kept, but left out of time charts' : 'All dates were read'} />
        <Stat label="Narratives" value={`${formatNumber(r.narratives_present)}`} hint={`${formatNumber(r.narratives_missing)} have none (${formatPercent((100 * r.narratives_missing) / Math.max(r.rows_out, 1))})`} />
      </dl>

      <ul className="mt-5 space-y-2 text-sm text-navy-800">
        <li>Date format detected: <span className="font-mono text-xs">{r.date_format_used ?? 'unknown'}</span></li>
        {r.duplicate_ids_removed > 0 && <li>{formatNumber(r.duplicate_ids_removed)} rows with a repeated complaint ID were removed.</li>}
        {r.exact_duplicate_rows_found > 0 && (
          <li>{formatNumber(r.exact_duplicate_rows_found)} rows are identical to another row except for the ID; {r.exact_duplicate_rows_removed ? 'they were removed' : 'they were kept, because different customers can file the same complaint'}.</li>
        )}
        {r.invalid_date_examples.length > 0 && <li>Examples of unreadable dates: {r.invalid_date_examples.map((d) => <code key={d} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-xs">{d}</code>)}</li>}
        {blanks.length > 0 && <li>Blank or "N/A" values turned into proper missing values: {blanks.map(([c, n]) => `${fieldLabel(c)} (${formatNumber(n)})`).join(', ')}.</li>}
        {r.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>

      <h3 className="mt-6 text-sm font-semibold text-navy-900">Missing values by column</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-4 font-medium">Field</th><th className="py-2 pr-4 font-medium">From your column</th><th className="py-2 pr-4 text-right font-medium">Missing</th><th className="w-40 py-2 font-medium">Share</th><th className="py-2 pl-4 text-right font-medium">Distinct</th></tr></thead>
          <tbody>
            {p.columns.map((c) => (
              <tr key={c.column} className="border-b border-slate-50">
                <td className="py-2 pr-4 font-medium text-navy-900">{fieldLabel(c.column)}</td>
                <td className="py-2 pr-4 text-slate-500">{dataset.mapping?.[c.column] ?? '—'}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(c.missing)}</td>
                <td className="py-2"><div className="flex items-center gap-2"><div className="w-24"><ProgressBar value={c.missing_pct} color={c.missing_pct > 50 ? 'bg-amber-500' : 'bg-teal-500'} label={`${fieldLabel(c.column)} missing`} /></div><span className="w-12 text-xs tabular-nums text-slate-500">{formatPercent(c.missing_pct)}</span></div></td>
                <td className="py-2 pl-4 text-right tabular-nums text-slate-500">{formatNumber(c.unique)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
