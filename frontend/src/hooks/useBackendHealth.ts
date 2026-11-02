import { useEffect, useState } from 'react';
import { fetchHealth } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import { errorMessage } from '@/utils/format';

export type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected'; detail: string }
  | { status: 'offline'; detail: string };

const HEALTH_INTERVAL_MS = 30000;

export function useBackendHealth(): ConnectionState {
  const { refreshKey } = useRefresh();
  const [state, setState] = useState<ConnectionState>({ status: 'checking' });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const check = () => {
      fetchHealth(controller.signal)
        .then((health) => {
          if (!active) return;
          const modelOk = health.model_files.model && health.model_files.vectorizer;
          if (health.status !== 'ok') setState({ status: 'offline', detail: 'The server is running but its database is unavailable.' });
          else setState({ status: 'connected', detail: modelOk ? 'Server, database and prediction model are available.' : 'Connected, but the prediction model files are missing on the server.' });
        })
        .catch((error: unknown) => {
          if (!active || controller.signal.aborted) return;
          setState({ status: 'offline', detail: errorMessage(error) });
        });
    };

    setState({ status: 'checking' });
    check();
    const timer = window.setInterval(check, HEALTH_INTERVAL_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  return state;
}
