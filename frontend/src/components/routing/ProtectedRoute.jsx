import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import FullPageLoader from '../common/FullPageLoader';

/** Renders child routes only for authenticated users; otherwise redirects to /login. */
export default function ProtectedRoute() {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  // Wait for the stored session to be verified before deciding.
  if (isInitializing) return <FullPageLoader label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
