import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface RefreshContextValue {
  refreshKey: number;
  refresh: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({ refreshKey: 0, refresh: () => undefined });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const value = useMemo(() => ({ refreshKey, refresh }), [refreshKey, refresh]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh(): RefreshContextValue {
  return useContext(RefreshContext);
}
