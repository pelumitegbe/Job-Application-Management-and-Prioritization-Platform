import { AlertTriangle, CalendarClock, CalendarX2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_STYLES, urgencyIndicators } from '../../utils/priorityInsights';

/** Category pill. The category name is always shown, so colour is never the only cue. */
export function CategoryBadge({ category, className }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES['No action'];
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset', style.badge, className)}
      data-testid="category-badge"
    >
      {category}
    </span>
  );
}

/**
 * Score out of 100: the number is printed ("84/100"); the bar only reinforces
 * it, so the score reads the same without colour.
 */
export function ScoreMeter({ score, category, className, size = 'md', stacked = false }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES['No action'];
  return (
    <div className={cn('flex min-w-0', stacked ? 'flex-col items-end gap-1.5' : 'items-center gap-2.5', className)} data-testid="score-meter">
      <span className="shrink-0 tabular-nums" aria-hidden="true">
        <span className={cn('font-bold text-foreground', size === 'lg' ? 'text-3xl' : 'text-[17px]')}>{score}</span>
        <span className="text-[12px] font-medium text-muted-foreground">/100</span>
      </span>
      <span className="sr-only">Priority score {score} out of 100</span>
      <span
        className={cn('relative block min-w-12 overflow-hidden rounded-full bg-gray-100', size === 'lg' ? 'h-2.5' : 'h-1.5', stacked ? 'w-full' : 'flex-1')}
        aria-hidden="true"
      >
        <span className={cn('absolute inset-y-0 left-0 rounded-full', style.bar)} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </span>
    </div>
  );
}

const TONE_STYLES = {
  danger: 'bg-red-50 text-red-700 ring-red-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  muted: 'bg-gray-100 text-gray-700 ring-gray-200',
};

const ICONS = {
  'follow-up-overdue': AlertTriangle,
  'follow-up-today': Clock,
  'deadline-expired': CalendarX2,
  'deadline-today': CalendarClock,
  'deadline-soon': CalendarClock,
};

/**
 * Overdue follow-ups, follow-ups due today, upcoming and expired Saved
 * deadlines, read from the backend's factor details. Shown independently of
 * the category, so an overdue follow-up stands out even on a Medium item.
 */
export function UrgencyBadges({ application, className }) {
  const indicators = urgencyIndicators(application);
  if (!indicators.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Warnings">
      {indicators.map(({ key, label, tone }) => {
        const Icon = ICONS[key];
        return (
          <li
            key={key}
            className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset', TONE_STYLES[tone])}
            data-testid={`urgency-${key}`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}
