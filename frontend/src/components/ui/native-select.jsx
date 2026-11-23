import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Styled native <select>: fully keyboard/screen-reader accessible and mobile-friendly. */
export function NativeSelect({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          'flex h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-card pl-3.5 pr-10 text-sm text-foreground shadow-xs',
          'transition-[border-color,box-shadow] duration-150 outline-none hover:border-gray-500',
          'focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-violet-500/20',
          'aria-invalid:border-destructive aria-invalid:focus-visible:ring-red-500/20',
          'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden="true" />
    </div>
  );
}
