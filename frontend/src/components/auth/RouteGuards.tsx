import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LoadingState } from '@/components/ui/StateViews';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState label="Checking your session..." />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/register pages: signed-in visitors go straight to the app. */
export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingState label="Checking your session..." />;
  if (status === 'authenticated') return <Navigate to="/app" replace />;
  return <Outlet />;
}
