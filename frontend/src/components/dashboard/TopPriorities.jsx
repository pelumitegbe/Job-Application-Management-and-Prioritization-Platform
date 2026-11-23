import { Link } from 'react-router';
import { ArrowDownWideNarrow, ArrowRight, RotateCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Alert from '../common/Alert';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import IconTile from '../common/IconTile';
import { CategoryBadge, ScoreMeter, UrgencyBadges } from '../priorities/PriorityIndicators';
import { mostRelevantExplanation } from '../../utils/priorityInsights';
import { formatDate } from '../../utils/formatters';

/** The three highest-ranked actionable applications, straight from GET /priorities?limit=3. */
export default function TopPriorities({ data, error, isLoading, onRetry }) {
  const items = data?.applications ?? [];
  return (
    <Card as="section" aria-labelledby="top-priorities-heading" className="lg:col-span-3">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile icon={ArrowDownWideNarrow} tone="coral" />
          <div>
            <CardTitle as="h3" id="top-priorities-heading">Top priorities</CardTitle>
            <CardDescription>What to work on first, ranked by deadline, follow-up, stage and interest.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3" aria-busy={isLoading || undefined}>
        {isLoading ? (
          <div role="status" className="flex flex-col gap-2.5">
            <span className="sr-only">Loading top priorities…</span>
            {[0, 1, 2].map((n) => (
              <span key={n} className="block h-16 animate-pulse rounded-xl bg-gray-100" aria-hidden="true" />
            ))}
          </div>
        ) : error ? (
          <>
            <Alert type="error" title="Couldn't load priorities">
              {error.message || 'Something went wrong. Please try again.'}
            </Alert>
            <Button variant="secondary" className="w-fit" onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </>
        ) : items.length === 0 ? (
          <EmptyState illustration="folder" tone="coral" title="Nothing to prioritise yet">
            Add applications with deadlines or follow-up dates and they'll be ranked here.
          </EmptyState>
        ) : (
          <ol className="flex flex-col gap-2.5" data-testid="top-priorities">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border/80 bg-surface p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-[13px] font-bold text-foreground ring-1 ring-border tabular-nums">
                  <span className="sr-only">Rank </span>#{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 truncate text-[14px] font-semibold text-foreground">{item.position}</p>
                    <CategoryBadge category={item.priority.category} />
                  </div>
                  <p className="truncate text-[13px] text-muted-foreground">{item.company}</p>
                  <UrgencyBadges application={item} className="mt-1.5" />
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/80">{mostRelevantExplanation(item)}</p>
                </div>
                <ScoreMeter score={item.priority.score} category={item.priority.category} stacked className="w-20 shrink-0 sm:w-28" />
              </li>
            ))}
          </ol>
        )}
        {data?.scoring?.referenceDate && !isLoading && !error && (
          <p className="text-[12px] text-subtle-foreground" data-testid="top-priorities-date">
            Scored for {formatDate(data.scoring.referenceDate)} ({(data.scoring.timezone ?? 'UTC').replaceAll('_', ' ')}).
          </p>
        )}
        <Link
          to="/priorities"
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded text-[13.5px] font-semibold text-violet-700 outline-none hover:text-violet-800 focus-visible:ring-3 focus-visible:ring-ring/45"
        >
          View all priorities
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
