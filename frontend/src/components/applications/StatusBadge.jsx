import { STATUS_STYLES } from '@/constants/applications';
import { cn } from '@/lib/utils';

/** Coloured status pill. The status is always shown as text, so colour is never the only cue. */
export default function StatusBadge({ status, className }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.Saved;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', style.badge, className)}>
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {status}
    </span>
  );
}
