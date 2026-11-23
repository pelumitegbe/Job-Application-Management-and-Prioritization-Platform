import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReturnFocus } from '@/lib/useReturnFocus';

// shadcn/ui-style left-side sheet (drawer) built on Radix Dialog, which
// provides focus trapping, Escape to close, scroll locking and focus return.

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

const SIDES = {
  left: 'inset-y-0 left-0 w-72 max-w-[85vw] border-r data-[state=open]:animate-slide-in',
  right: 'inset-y-0 right-0 w-full sm:max-w-lg sm:border-l data-[state=open]:animate-slide-in-right',
};

export function SheetContent(props) {
  // Rendered only while open (Portal), so the inner component mounts with the sheet.
  return (
    <DialogPrimitive.Portal>
      <SheetContentInner {...props} />
    </DialogPrimitive.Portal>
  );
}

function SheetContentInner({ className, children, side = 'left', closeLabel = 'Close menu', onCloseAutoFocus, ...props }) {
  const handleCloseAutoFocus = useReturnFocus(onCloseAutoFocus);
  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-gray-950/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          'fixed z-50 flex flex-col border-border bg-surface shadow-xl outline-none',
          SIDES[side],
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3.5 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-gray-100 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45"
          aria-label={closeLabel}
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </>
  );
}
