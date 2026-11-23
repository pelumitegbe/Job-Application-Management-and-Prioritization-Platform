import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/routing/ProtectedRoute';
import GuestRoute from './components/routing/GuestRoute';
import FullPageLoader from './components/common/FullPageLoader';
import { ToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import NotFound from './pages/NotFound';

function RootRedirect() {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) return <FullPageLoader label="Checking your session…" />;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ToastProvider>
  );
}
