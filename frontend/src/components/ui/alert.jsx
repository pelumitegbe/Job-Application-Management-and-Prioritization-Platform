import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-[13px] leading-5 animate-in', {
  variants: {
    variant: {
      error: 'border-red-200 bg-destructive-soft text-destructive-soft-foreground',
      success: 'border-emerald-200 bg-success-soft text-success-soft-foreground',
      info: 'border-blue-200 bg-info-soft text-info-soft-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info };

/**
 * Inline message. Errors use role="alert" (announced immediately);
 * success/info use role="status" (announced politely).
 */
export function Alert({ variant = 'info', title, children, onDismiss, className }) {
  const Icon = ICONS[variant];
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-m-1 rounded-md p-1 opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
