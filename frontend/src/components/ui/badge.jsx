import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-primary-soft text-primary-soft-foreground',
      outline: 'border border-border bg-card text-muted-foreground',
      muted: 'bg-muted text-muted-foreground',
      // "Coming soon" marker: amber, so unavailable features read the same everywhere.
      soon: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
      onBrand: 'bg-violet-950/20 text-white ring-1 ring-inset ring-white/30',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
