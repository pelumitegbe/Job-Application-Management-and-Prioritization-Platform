import { TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';
import EmptyStateIllustration from '../illustrations/EmptyStateIllustration';

/** Tinted empty-state panel with a spot illustration, title and short explanation. */
export default function EmptyState({ illustration = 'folder', tone = 'violet', title, children, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl px-6 py-7 text-center', TONES[tone].soft, className)}>
      <EmptyStateIllustration variant={illustration} tone={tone} className="w-20" />
      <p className="mt-3 text-[13.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
