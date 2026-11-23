import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReturnFocus } from '@/lib/useReturnFocus';

// shadcn/ui-style modal dialog on Radix Dialog: focus trap, Escape to close,
// scroll lock, aria-modal semantics and focus returned to the trigger.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent(props) {
  // Rendered only while open (Portal), so the inner component mounts with the dialog.
  return (
    <DialogPrimitive.Portal>
      <DialogContentInner {...props} />
    </DialogPrimitive.Portal>
  );
}

function DialogContentInner({ className, children, closeLabel = 'Close', onCloseAutoFocus, ...props }) {
  const handleCloseAutoFocus = useReturnFocus(onCloseAutoFocus);
  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
        <DialogPrimitive.Content
          onCloseAutoFocus={handleCloseAutoFocus}
          className={cn(
            'pointer-events-auto relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-xl outline-none',
            'sm:max-h-[88vh] sm:max-w-2xl sm:rounded-3xl',
            'data-[state=open]:animate-in',
            className
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-gray-100 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45"
            aria-label={closeLabel}
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </>
  );
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn('border-b border-border px-6 pb-5 pr-16 pt-6', className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('text-lg font-bold tracking-tight text-foreground', className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('mt-1 text-[13.5px] text-muted-foreground', className)} {...props} />;
}

export function DialogBody({ className, ...props }) {
  return <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse gap-2 border-t border-border bg-surface px-6 py-4 sm:flex-row sm:justify-end', className)} {...props} />;
}
