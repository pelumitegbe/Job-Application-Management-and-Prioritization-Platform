import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full min-w-0 resize-y rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-xs',
        'placeholder:text-subtle-foreground transition-[border-color,box-shadow] duration-150 outline-none hover:border-gray-500',
        'focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-violet-500/20',
        'aria-invalid:border-destructive aria-invalid:bg-red-50/50 aria-invalid:focus-visible:ring-red-500/20',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        className
      )}
      {...props}
    />
  );
}
