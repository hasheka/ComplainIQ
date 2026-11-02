import { useEffect, useState, type DependencyList } from 'react';
import { useRefresh } from '@/hooks/useRefresh';
import { errorMessage } from '@/utils/format';

export interface ApiResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useApiResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): ApiResourceState<T> {
  const { refreshKey, refresh } = useRefresh();
  const [state, setState] = useState<Omit<ApiResourceState<T>, 'refetch'>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));

    loader(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ data: null, error: errorMessage(error), loading: false });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);

  return { ...state, refetch: refresh };
}
