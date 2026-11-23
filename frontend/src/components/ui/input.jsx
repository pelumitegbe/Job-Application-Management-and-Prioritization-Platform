import { cn } from '@/lib/utils';

// shadcn/ui-style input: 44px tall, soft rounded corners, violet focus ring.
// The resting border (--input) is 3.1:1 against white for WCAG 1.4.11.
export function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-xs',
        'placeholder:text-subtle-foreground',
        'transition-[border-color,box-shadow,background-color] duration-150 outline-none',
        'hover:border-gray-500',
        'focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-violet-500/20',
        'aria-invalid:border-destructive aria-invalid:bg-red-50/50 aria-invalid:focus-visible:ring-red-500/20',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        className
      )}
      {...props}
    />
  );
}
