import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck, CircleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ToastContext = createContext(null);
const DEFAULT_DURATION_MS = 6000;

/**
 * Minimal toast notifications. Toasts appear in a polite live region
 * (bottom-right on desktop, bottom on mobile) and dismiss themselves.
 *   const { showToast } = useToast();
 *   showToast({ title: 'Saved', description: '…', action: { label: 'View', to: '/applications' } });
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  const showToast = useCallback(({ title, description, variant = 'success', action, duration = DEFAULT_DURATION_MS }) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, title, description, variant, action, duration }]);
    return id;
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live (not role="status") so it doesn't compete with page-level status messages */}
      <section
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const { id, title, description, variant, action, duration } = toast;
  const Icon = variant === 'error' ? CircleAlert : CircleCheck;
  const dismiss = () => onDismiss(id);

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg animate-in">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          variant === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        {action && (
          <Link
            to={action.to}
            onClick={dismiss}
            className="mt-2 inline-block rounded text-[13px] font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/45"
          >
            {action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification"
        className="-m-1 rounded-md p-1 text-subtle-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
