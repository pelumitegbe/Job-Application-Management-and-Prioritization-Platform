import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import FullPageLoader from '../common/FullPageLoader';

/**
 * Login/registration routes: authenticated users are sent on to the page they
 * originally asked for (set by ProtectedRoute), or the dashboard.
 */
export default function GuestRoute() {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) return <FullPageLoader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to={safeRedirectPath(location.state?.from)} replace />;
  return <Outlet />;
}

/** Only allow same-app paths (e.g. "/dashboard"), never external URLs. */
export function safeRedirectPath(from) {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' && from !== '/register'
    ? from
    : '/dashboard';
}
