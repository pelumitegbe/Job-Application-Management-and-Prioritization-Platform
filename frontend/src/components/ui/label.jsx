import { cn } from '@/lib/utils';

export function Label({ className, ...props }) {
  return <label className={cn('text-[13.5px] font-semibold leading-none text-foreground', className)} {...props} />;
}
