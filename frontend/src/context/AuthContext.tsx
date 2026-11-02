import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe, loginUser, logoutUser, registerUser } from '@/services/api';
import { setUnauthorizedHandler } from '@/services/apiClient';
import type { User } from '@/types/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
export const DATASET_STORAGE_KEY = 'complainiq.dataset';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: AuthStatus; user: User | null }>({ status: 'loading', user: null });

  useEffect(() => {
    const controller = new AbortController();
    getMe(controller.signal)
      .then((user) => setState({ status: 'authenticated', user }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'anonymous', user: null });
      });
    // Any later 401 from the API means the session ended (expired, signed out elsewhere): show the sign-in page.
    setUnauthorizedHandler(() => setState({ status: 'anonymous', user: null }));
    return () => {
      controller.abort();
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await loginUser({ email, password });
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const user = await registerUser({ display_name: displayName, email, password });
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      /* the session is gone either way */
    }
    localStorage.removeItem(DATASET_STORAGE_KEY);
    setState({ status: 'anonymous', user: null });
  }, []);

  const value = useMemo(() => ({ ...state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
