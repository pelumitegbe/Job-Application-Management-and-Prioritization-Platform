import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import StatusBadge from '../applications/StatusBadge';
import { InterestLevelIndicator } from '../applications/InterestLevel';
import { CategoryBadge, ScoreMeter, UrgencyBadges } from './PriorityIndicators';
import { CATEGORY_STYLES, mostRelevantExplanation } from '../../utils/priorityInsights';
import { formatDate } from '../../utils/formatters';

/**
 * Ranked list in the backend's order. `rank` is the item's position in the
 * full ranking, so it stays correct when filters or paging hide other items.
 * One responsive card layout serves desktop and mobile. The position title is
 * the card's button; its ::after overlay makes the whole card clickable while
 * the card content stays readable (lists, badges) to screen readers.
 */
export default function PriorityList({ items, onSelect, busy }) {
  return (
    <ol className={cn('flex flex-col gap-3', busy && 'opacity-60')} aria-label="Ranked applications" data-testid="priority-list">
      {items.map((item) => {
        const { priority } = item;
        const style = CATEGORY_STYLES[priority.category] || CATEGORY_STYLES['No action'];
        return (
          <li
            key={item.id}
            data-testid="priority-item"
            className={cn(
              'group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-3 rounded-2xl border border-l-4 border-border/80 bg-card p-4 shadow-sm transition-shadow sm:p-5',
              'hover:shadow-md has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/45',
              'md:grid-cols-[auto_minmax(0,1fr)_13rem_auto]',
              style.accent
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-[15px] font-bold text-foreground ring-1 ring-border tabular-nums" data-testid="priority-rank">
              <span className="sr-only">Rank </span>#{item.rank}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h4 className="min-w-0 text-[15px] font-semibold text-foreground">
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    aria-label={`${item.position} at ${item.company}: view priority breakdown`}
                    className="text-left outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                  >
                    {item.position}
                  </button>
                </h4>
                <CategoryBadge category={priority.category} />
              </div>
              <p className="mt-0.5 truncate text-[13.5px] text-muted-foreground">{item.company}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-muted-foreground">
                <StatusBadge status={item.status} />
                <InterestLevelIndicator value={item.interestLevel} />
                <span>
                  Next action: <span className="font-medium text-foreground">{priority.nextActionDate ? formatDate(priority.nextActionDate) : 'None'}</span>
                </span>
              </div>
              <UrgencyBadges application={item} className="mt-2.5" />
              <p className="mt-2 text-[13px] leading-relaxed text-foreground/80" data-testid="priority-explanation">
                {mostRelevantExplanation(item)}
              </p>
            </div>

            <ScoreMeter score={priority.score} category={priority.category} className="col-span-3 col-start-1 md:col-span-1 md:col-start-auto md:pt-2" />

            <ChevronRight className="col-start-3 row-start-1 mt-2.5 size-5 text-subtle-foreground transition-transform group-hover:translate-x-0.5 md:col-start-4" aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );
}
