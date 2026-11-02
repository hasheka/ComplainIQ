import { useRef, useState, type DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { uploadDataset } from '@/services/api';
import type { DatasetDetail } from '@/types/api';
import { errorMessage } from '@/utils/format';

/** Quick checks in the browser so obvious mistakes fail instantly. The server checks everything again. */
export function validateFile(file: File, maxMb: number): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Please choose a .csv file.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > maxMb * 1024 * 1024) return `That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${maxMb} MB.`;
  return null;
}

interface Props {
  maxMb: number;
  onUploaded: (dataset: DatasetDetail) => void;
}

export function UploadDropzone({ maxMb, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    const problem = validateFile(file, maxMb);
    setError(problem);
    if (problem) return;
    setFileName(file.name);
    setProgress(0);
    try {
      onUploaded(await uploadDataset(file, setProgress));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void handle(event.dataTransfer.files[0]);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-teal-500 bg-teal-50/60' : 'border-slate-300 bg-slate-50/60'}`}
      >
        <UploadCloud className="h-9 w-9 text-teal-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-navy-900">Drag a CSV file here</p>
          <p className="mt-1 text-xs text-slate-500">or choose one from your computer. Up to {maxMb} MB. We look for date, product, issue and narrative columns.</p>
        </div>
        <input ref={input} id="csv-file" type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose a CSV file" onChange={(e) => void handle(e.target.files?.[0])} disabled={busy} />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>Choose file</Button>
        {busy && (
          <div className="w-full max-w-sm space-y-1.5" aria-live="polite">
            <ProgressBar value={progress ?? 0} label="Upload progress" />
            <p className="text-xs text-slate-500">{progress === 100 ? `Uploaded ${fileName}. The server is reading it...` : `Uploading ${fileName}... ${progress}%`}</p>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
