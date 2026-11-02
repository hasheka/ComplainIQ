import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { fieldLabel } from '@/components/data/QualityReport';
import { saveMapping } from '@/services/api';
import type { DatasetDetail } from '@/types/api';
import { errorMessage } from '@/utils/format';

interface Props {
  dataset: DatasetDetail;
  onSaved: () => void;
  title?: string;
}

/** Lets the user say which column of THEIR file holds each field, then re-cleans the data. */
export function MappingForm({ dataset, onSaved, title = 'Match your columns' }: Props) {
  const columns = dataset.file_columns ?? [];
  const [choice, setChoice] = useState<Record<string, string>>({ ...(dataset.mapping ?? {}) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = columns.map((c) => ({ value: c, label: c }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const missing = dataset.required_fields.filter((f) => !choice[f]);
    if (missing.length) {
      setError(`Choose a column for: ${missing.map(fieldLabel).join(', ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const chosen = Object.fromEntries(Object.entries(choice).filter(([, v]) => v));
      await saveMapping(dataset.id, chosen);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, required: boolean) => (
    <SelectField key={key} id={`map-${key}`} label={`${fieldLabel(key)}${required ? ' *' : ''}`} value={choice[key] ?? ''}
      placeholder={required ? 'Choose a column' : 'Not in my file'} options={options}
      onChange={(e) => setChoice((c) => ({ ...c, [key]: e.target.value }))} />
  );

  return (
    <Card title={title} subtitle="Tell us which column in your file holds each field. Fields marked * are required.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dataset.required_fields.map((f) => field(f, true))}
          {dataset.optional_fields.map((f) => field(f, false))}
        </div>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}
        <Button type="submit" loading={busy}>{busy ? 'Cleaning...' : 'Save and clean data'}</Button>
      </form>
    </Card>
  );
}
