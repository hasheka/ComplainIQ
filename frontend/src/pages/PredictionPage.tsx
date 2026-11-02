import { useState, type FormEvent } from 'react';
import { BrainCircuit, Info, Send, Tag, TriangleAlert } from 'lucide-react';
import { KpiCard } from '@/components/data/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextAreaInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { useApiResource } from '@/hooks/useApiResource';
import { fetchModelCard, predictComplaint } from '@/services/api';
import type { PredictionResponse } from '@/types/types';
import { errorMessage, formatPercent } from '@/utils/format';

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 10000;

const EXAMPLES = [
  'A debt collector keeps calling me every day about a debt that is not mine and will not stop.',
  'My mortgage servicer lost my escrow payment and now says I am behind on my loan.',
];

const LEVEL_TONE = { low: 'warning', moderate: 'navy', high: 'success' } as const;

export function PredictionPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const model = useApiResource((signal) => fetchModelCard(signal), []);

  const trimmed = text.trim();
  const validation = trimmed.length === 0 ? 'Enter a complaint description to classify.' : trimmed.length < MIN_LENGTH ? `Please enter at least ${MIN_LENGTH} characters.` : null;

  const runPrediction = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setResult(await predictComplaint({ text: trimmed }));
    } catch (caught) {
      setResult(null);
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (validation || submitting) return;
    void runPrediction();
  };

  const ev = model.data?.evaluation;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Machine learning" title="AI Complaint Prediction" description="Paste a customer complaint and the trained model will predict which financial product it is about." />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Complaint description" subtitle="Describe the complaint in the customer's own words" className="xl:col-span-3">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="complaint-text" className="sr-only">Complaint description</label>
              <TextAreaInput id="complaint-text" rows={9} maxLength={MAX_LENGTH} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)}
                placeholder="e.g. A debt collector keeps calling me about a debt I do not owe..." aria-invalid={touched && Boolean(validation)} aria-describedby="complaint-text-hint" style={{ minHeight: 220, resize: 'vertical' }} />
              <div id="complaint-text-hint" className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className={touched && validation ? 'text-rose-600' : 'text-slate-400'}>{touched && validation ? validation : `Minimum ${MIN_LENGTH} characters`}</span>
                <span className="tabular-nums text-slate-400">{text.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example, index) => (
                  <button key={index} type="button" onClick={() => setText(example)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-teal-400 hover:text-teal-700">Load example {index + 1}</button>
                ))}
              </div>
              <Button type="submit" loading={submitting} icon={<Send className="h-4 w-4" />} className="w-full sm:w-auto">{submitting ? 'Analysing complaint...' : 'Predict'}</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <div className="flex gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            <p className="text-sm leading-relaxed text-teal-900">The model predicts the <strong>product category</strong> only. It does not predict the issue or the sentiment. Your text is processed on our server and is not stored.</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card" aria-label="About this model">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">About this model</p>
            {model.loading && <p className="mt-3 text-sm text-slate-500">Loading model details...</p>}
            {model.error && <p className="mt-3 text-sm text-slate-500">Model details are not available right now.</p>}
            {model.data && ev?.available && (
              <div className="mt-3 space-y-3 text-sm text-navy-800">
                <p><span className="text-2xl font-semibold text-navy-950">{formatPercent(100 * (ev.accuracy ?? 0), 2)}</span> accuracy on {ev.test_size?.toLocaleString()} complaints it had never seen.</p>
                <p className="text-slate-500">It chooses between {model.data.classes.length} products.</p>
                {ev.weak_classes && ev.weak_classes.length > 0 && (
                  <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Less reliable for: {ev.weak_classes.join(', ')}.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void runPrediction()} />}
      {!error && !result && !submitting && <EmptyState icon={<BrainCircuit className="h-8 w-8" />} title="No prediction yet" message="Enter a complaint above and select Predict to see the model's classification." />}

      {result && !error && result.message && (
        <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden /><div><h3 className="text-sm font-semibold text-amber-900">No prediction made</h3><p className="mt-1 text-sm text-amber-800">{result.message} Try describing the problem in more detail.</p></div></div>
      )}

      {result && !error && !result.message && result.predicted_product && (
        <section aria-label="Prediction results" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <KpiCard label="Predicted product" value={result.predicted_product} icon={Tag} accent="teal" />
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confidence</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-semibold text-navy-950">{result.confidence === null ? '—' : formatPercent(100 * result.confidence)}</span>
                {result.confidence_level && <Badge tone={LEVEL_TONE[result.confidence_level]}>{result.confidence_level} confidence</Badge>}
              </div>
              {result.confidence !== null && <ProgressBar value={100 * result.confidence} label="Model confidence" />}
            </div>
          </div>
          {result.top_predictions.length > 1 && (
            <Card title="Other likely products" subtitle="The model's top choices, with the probability it gave each">
              <ul className="space-y-3">
                {result.top_predictions.map((p) => (
                  <li key={p.product}><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-navy-900">{p.product}</span><span className="tabular-nums text-slate-500">{formatPercent(100 * p.probability)}</span></div><ProgressBar value={100 * p.probability} label={`${p.product} probability`} /></li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">Confidence is the model's own probability. It is not calibrated, so 80% does not mean it is right 80% of the time.</p>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
