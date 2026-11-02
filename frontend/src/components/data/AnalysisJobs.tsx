import { useCallback, useEffect, useRef, useState } from 'react';
import { BrainCircuit, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useRefresh } from '@/hooks/useRefresh';
import { listJobs, startPredictions, startSentiment } from '@/services/api';
import type { Dataset, Job, JobKind } from '@/types/api';
import { errorMessage } from '@/utils/format';

const META: Record<JobKind, { title: string; text: string; icon: typeof BrainCircuit; start: (id: string) => Promise<Job> }> = {
  sentiment: { title: 'Sentiment analysis', text: 'Estimates how negative each narrative reads. Needed for the sentiment charts and filters.', icon: MessageSquareText, start: startSentiment },
  prediction: { title: 'Batch product prediction', text: 'Predicts the product category of every narrative with the trained model.', icon: BrainCircuit, start: startPredictions },
};
const ACTIVE = new Set(['queued', 'running']);

export function AnalysisJobs({ dataset }: { dataset: Dataset }) {
  const { refresh } = useRefresh();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const previousActive = useRef(false);
  const hasNarratives = (dataset.summary?.narratives_present ?? 0) > 0;

  const load = useCallback(async () => {
    try { setJobs(await listJobs(dataset.id)); } catch (caught) { setError(errorMessage(caught)); }
  }, [dataset.id]);

  useEffect(() => { void load(); }, [load]);
  const active = jobs.some((j) => ACTIVE.has(j.status));
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [active, load]);
  useEffect(() => {          // when a run finishes, let the other pages pick up the new results
    if (previousActive.current && !active) refresh();
    previousActive.current = active;
  }, [active, refresh]);

  const run = async (kind: JobKind) => {
    setError(null);
    try { await META[kind].start(dataset.id); await load(); } catch (caught) { setError(errorMessage(caught)); }
  };

  return (
    <Card title="Run analyses" subtitle="These can take a few minutes on large files. You can leave this page while they run.">
      {!hasNarratives && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">This dataset has no complaint narratives, so sentiment and prediction are not possible.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(META) as JobKind[]).map((kind) => {
          const m = META[kind]; const Icon = m.icon;
          const job = jobs.find((j) => j.kind === kind);
          const running = job ? ACTIVE.has(job.status) : false;
          return (
            <div key={kind} className="rounded-xl border border-slate-200/80 p-4">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon className="h-4 w-4" aria-hidden /></span>
                <div><h3 className="text-sm font-semibold text-navy-900">{m.title}</h3><p className="mt-0.5 text-xs leading-relaxed text-slate-500">{m.text}</p></div></div>
              <div className="mt-4 space-y-2" aria-live="polite">
                {running && <><ProgressBar value={job!.progress} label={`${m.title} progress`} /><p className="text-xs text-slate-500">{job!.status === 'queued' ? 'Waiting to start...' : `Working... ${job!.progress}%`}</p></>}
                {job?.status === 'done' && <p className="text-xs font-medium text-emerald-700">Finished. Results are ready.</p>}
                {job?.status === 'failed' && <p role="alert" className="text-xs text-rose-700">{job.error ?? 'The analysis failed.'}</p>}
                <Button size="sm" variant={job?.status === 'done' ? 'secondary' : 'primary'} disabled={!hasNarratives || running} onClick={() => void run(kind)}>{job?.status === 'done' ? 'Run again' : running ? 'Running...' : 'Run'}</Button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}
    </Card>
  );
}
