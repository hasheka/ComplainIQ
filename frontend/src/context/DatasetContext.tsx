import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DATASET_STORAGE_KEY } from '@/context/AuthContext';
import { useRefresh } from '@/hooks/useRefresh';
import { listDatasets } from '@/services/api';
import type { Dataset } from '@/types/api';
import { errorMessage } from '@/utils/format';

interface DatasetValue {
  datasets: Dataset[];
  selected: Dataset | null;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  reload: () => Promise<void>;
}

const DatasetContext = createContext<DatasetValue | null>(null);
const POLL_MS = 2000;
const BUSY = new Set(['uploaded', 'processing']);

/** Picks the stored choice if it still exists, otherwise the newest ready dataset, otherwise the newest one. */
export function chooseSelected(datasets: Dataset[], storedId: string | null): string | null {
  if (storedId && datasets.some((d) => d.id === storedId)) return storedId;
  return (datasets.find((d) => d.status === 'ready') ?? datasets[0])?.id ?? null;
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const { refreshKey } = useRefresh();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(DATASET_STORAGE_KEY));
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const rows = await listDatasets();
      if (!alive.current) return;
      setDatasets(rows);
      setError(null);
      setSelectedId((current) => chooseSelected(rows, current));
    } catch (caught) {
      if (alive.current) setError(errorMessage(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload, refreshKey]);

  // keep polling only while something is being processed
  const busy = datasets.some((d) => BUSY.has(d.status));
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [busy, reload]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(DATASET_STORAGE_KEY, selectedId);
  }, [selectedId]);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const selected = datasets.find((d) => d.id === selectedId) ?? null;
  const value = useMemo(() => ({ datasets, selected, loading, error, select, reload }), [datasets, selected, loading, error, select, reload]);
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDatasets(): DatasetValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error('useDatasets must be used inside <DatasetProvider>.');
  return ctx;
}
