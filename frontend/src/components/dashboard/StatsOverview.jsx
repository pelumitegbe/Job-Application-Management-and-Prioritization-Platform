import { BriefcaseBusiness, CircleCheckBig, Info, Layers, MessagesSquare, RotateCw } from 'lucide-react';
import { TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';
import Alert from '../common/Alert';
import Button from '../common/Button';
import IconTile from '../common/IconTile';
import { STAT_DEFINITIONS } from '../../utils/applicationStats';
import { STATS_MAX_PAGES, STATS_PAGE_SIZE } from '../../services/applicationService';

const STATS = [
  { key: 'total', label: 'Total applications', icon: BriefcaseBusiness, tone: 'violet' },
  { key: 'inProgress', label: 'In progress', icon: Layers, tone: 'blue' },
  { key: 'interviews', label: 'Interviews', icon: MessagesSquare, tone: 'teal' },
  { key: 'offers', label: 'Offers', icon: CircleCheckBig, tone: 'amber' },
];

/** Four statistic cards computed from the user's real applications. */
export default function StatsOverview({ stats, complete, isLoading, error, onRetry }) {
  return (
    <section aria-labelledby="overview-heading" aria-busy={isLoading || undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="overview-heading" className="text-[15px] font-bold tracking-tight text-foreground">
          Overview
        </h3>
      </div>

      {error && !isLoading ? (
        <div className="space-y-3">
          <Alert type="error" title="Couldn't load your statistics">
            {error.message || 'Something went wrong. Please try again.'}
          </Alert>
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : (
        <>
          {isLoading && <span className="sr-only" role="status">Loading statistics…</span>}
          <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {STATS.map(({ key, label, icon, tone }) => (
              <div key={key} className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5" data-testid={`stat-${key}`}>
                <span className={cn('absolute inset-x-0 top-0 h-1', TONES[tone].solid)} aria-hidden="true" />
                <IconTile icon={icon} tone={tone} />
                <dt className="mt-3 text-[13px] font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1">
                  {isLoading || !stats ? (
                    <span className="block h-[26px] w-12 animate-pulse rounded-md bg-gray-100" aria-hidden="true" />
                  ) : (
                    <span className="block text-[26px] font-bold leading-none tracking-tight text-foreground tabular-nums">{stats[key]}</span>
                  )}
                  <span className="mt-1.5 block text-[12px] leading-snug text-subtle-foreground">{STAT_DEFINITIONS[key]}</span>
                </dd>
              </div>
            ))}
          </dl>
          {!isLoading && stats && !complete && (
            <p className="mt-3 flex items-start gap-2 text-[13px] text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Total is exact. Status counts cover your {(STATS_MAX_PAGES * STATS_PAGE_SIZE).toLocaleString()} most recent applications.
            </p>
          )}
        </>
      )}
    </section>
  );
}
