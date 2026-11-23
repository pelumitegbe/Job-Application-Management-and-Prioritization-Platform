import { AlertTriangle, CalendarClock, Flame, ListChecks } from 'lucide-react';
import { TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';
import IconTile from '../common/IconTile';

const CARDS = [
  { key: 'actionable', label: 'Actionable', hint: 'Applications that are not rejected', icon: ListChecks, tone: 'violet' },
  { key: 'highPriority', label: 'High priority', hint: 'Scored High or Critical', icon: Flame, tone: 'coral' },
  { key: 'overdueFollowUps', label: 'Overdue follow-ups', hint: 'Follow-up date has passed', icon: AlertTriangle, tone: 'amber' },
  { key: 'upcomingDeadlines', label: 'Upcoming deadlines', hint: 'Saved, deadline within 7 days', icon: CalendarClock, tone: 'blue' },
];

/** Four counts over the full ranking (never just the visible page). */
export default function PrioritySummary({ summary, isLoading }) {
  return (
    <section aria-labelledby="priority-summary-heading">
      <h3 id="priority-summary-heading" className="sr-only">
        Priority summary
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {CARDS.map(({ key, label, hint, icon, tone }) => (
          <div key={key} className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5" data-testid={`summary-${key}`}>
            <span className={cn('absolute inset-x-0 top-0 h-1', TONES[tone].solid)} aria-hidden="true" />
            <IconTile icon={icon} tone={tone} />
            <dt className="mt-3 text-[13px] font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1">
              {isLoading || !summary ? (
                <span className="block h-[26px] w-12 animate-pulse rounded-md bg-gray-100" aria-hidden="true" />
              ) : (
                <span className="block text-[26px] font-bold leading-none tracking-tight text-foreground tabular-nums">{summary[key]}</span>
              )}
              <span className="mt-1.5 block text-[12px] leading-snug text-subtle-foreground">{hint}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
