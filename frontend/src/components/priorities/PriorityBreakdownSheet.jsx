import { Info, PanelRightOpen } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import StatusBadge from '../applications/StatusBadge';
import { CategoryBadge, ScoreMeter, UrgencyBadges } from './PriorityIndicators';
import { CATEGORY_STYLES, FACTORS, FORMULA } from '../../utils/priorityInsights';
import { formatDate } from '../../utils/formatters';

const points = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Explainable breakdown of one backend-scored application. Every number shown
 * comes from the API's `priority` object; nothing is recalculated here.
 */
export default function PriorityBreakdownSheet({ item, open, onOpenChange, onOpenDetails, referenceDate, timezone }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" closeLabel="Close breakdown" className="overflow-y-auto bg-card">
        {item && <BreakdownBody item={item} onOpenDetails={onOpenDetails} referenceDate={referenceDate} timezone={timezone} />}
      </SheetContent>
    </Sheet>
  );
}

function BreakdownBody({ item, onOpenDetails, referenceDate, timezone }) {
  const { priority } = item;
  const style = CATEGORY_STYLES[priority.category] || CATEGORY_STYLES['No action'];

  return (
    <>
      <header className="border-b border-border px-6 pb-5 pr-16 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority breakdown · Rank #{item.rank}</p>
        <SheetTitle className="mt-1 break-words text-lg font-bold leading-snug tracking-tight text-foreground">{item.position}</SheetTitle>
        <SheetDescription className="break-words text-[14px] text-muted-foreground">{item.company}</SheetDescription>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <CategoryBadge category={priority.category} />
        </div>
      </header>

      <div className="flex flex-col gap-6 px-6 py-5">
        <section aria-labelledby="overall-heading" className="rounded-2xl border border-border bg-surface p-4">
          <h3 id="overall-heading" className="text-[13px] font-semibold text-muted-foreground">
            Overall score
          </h3>
          <ScoreMeter score={priority.score} category={priority.category} size="lg" className="mt-1" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            Category: <span className="font-semibold text-foreground">{priority.category}</span>
            {priority.nextActionDate && (
              <>
                {' '}· Next action <span className="font-semibold text-foreground">{formatDate(priority.nextActionDate)}</span>
              </>
            )}
          </p>
          {priority.override && (
            <p className="mt-2 flex items-start gap-2 text-[13px] text-foreground" data-testid="priority-override">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {priority.override}
            </p>
          )}
          <UrgencyBadges application={item} className="mt-3" />
        </section>

        <section aria-labelledby="factors-heading">
          <h3 id="factors-heading" className="text-[15px] font-bold tracking-tight text-foreground">
            How the score is made
          </h3>
          <p className="mt-1 font-mono text-[13px] text-foreground" data-testid="priority-formula">
            {FORMULA}
          </p>
          <table className="mt-3 w-full text-left text-[13px]" data-testid="factor-table">
            <caption className="sr-only">Factor scores and weighted contributions</caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-2 font-semibold">Factor</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Score</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Weight</th>
                <th scope="col" className="py-2 pl-2 text-right font-semibold">Points</th>
              </tr>
            </thead>
            <tbody>
              {FACTORS.map(({ key, letter, label }) => {
                const factor = priority.factors[key];
                return (
                  <tr key={key} className="border-b border-border/70 align-top last:border-b-0" data-testid={`factor-${key}`}>
                    <th scope="row" className="py-2.5 pr-2 font-medium text-foreground">
                      {label} <span className="text-muted-foreground">({letter})</span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                        <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${factor.score}%` }} />
                      </span>
                    </th>
                    <td className="px-2 py-2.5 text-right tabular-nums">{factor.score}/100</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{Math.round(factor.weight * 100)}%</td>
                    <td className="py-2.5 pl-2 text-right font-semibold tabular-nums text-foreground">{points(factor.contribution)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <th scope="row" colSpan={3} className="py-2.5 pr-2 text-right font-semibold text-foreground">
                  Total {priority.override ? '(before override)' : '(rounded to score)'}
                </th>
                <td className="py-2.5 pl-2 text-right font-bold tabular-nums text-foreground">{points(priority.rawScore)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section aria-labelledby="explanations-heading">
          <h3 id="explanations-heading" className="text-[15px] font-bold tracking-tight text-foreground">
            Why it ranks here
          </h3>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-foreground marker:text-subtle-foreground" data-testid="priority-explanations">
            {priority.explanations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          {referenceDate && (
            <p className="mt-3 text-[12px] text-subtle-foreground">
              Dates compared with {formatDate(referenceDate)}, today in {(timezone ?? 'UTC').replaceAll('_', ' ')} (calendar days).
            </p>
          )}
        </section>

        <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenDetails(item)}>
          <PanelRightOpen aria-hidden="true" />
          Open application details
        </Button>
      </div>
    </>
  );
}
