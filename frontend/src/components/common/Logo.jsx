import { APP_NAME } from '@/config';
import { cn } from '@/lib/utils';

/** Brand mark: three rising "priority" bars with a check, on the brand gradient. */
export function BrandMark({ className, inverted = false }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] shadow-sm',
        inverted ? 'bg-white text-violet-700' : 'bg-brand-gradient text-white shadow-violet-600/30',
        className
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none">
        <rect x="4" y="13" width="3.2" height="7" rx="1.2" fill="currentColor" opacity="0.55" />
        <rect x="10.4" y="9" width="3.2" height="11" rx="1.2" fill="currentColor" opacity="0.8" />
        <rect x="16.8" y="5" width="3.2" height="15" rx="1.2" fill="currentColor" />
        <path d="M3.5 7.5l2.2 2.2L10 5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Product mark + wordmark. `showName={false}` keeps the name for screen readers only. */
export default function Logo({ showName = true, inverted = false, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark inverted={inverted} />
      <span className={cn('text-[15px] font-bold tracking-tight', inverted ? 'text-white' : 'text-foreground', !showName && 'sr-only')}>{APP_NAME}</span>
    </span>
  );
}
