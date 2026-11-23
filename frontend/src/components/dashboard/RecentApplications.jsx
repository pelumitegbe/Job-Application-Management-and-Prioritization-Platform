import { Link } from 'react-router';
import { ArrowRight, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Button from '../common/Button';
import EmptyStateIllustration from '../illustrations/EmptyStateIllustration';
import StatusBadge from '../applications/StatusBadge';
import { formatDate, pluralize } from '../../utils/formatters';

/** Latest applications (from the same data as the statistics) or an empty state. */
export default function RecentApplications({ recent, total, isLoading, error, onAdd }) {
  const isEmpty = !isLoading && !error && total === 0;

  return (
    <Card as="section" aria-labelledby="recent-heading">
      <div className="flex flex-col gap-4 p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="recent-heading" className="text-[17px] font-bold tracking-tight text-foreground">
              {isEmpty ? 'No applications yet' : 'Recent applications'}
            </h3>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              {isEmpty
                ? 'Add the jobs you’re applying for and follow each one from Saved to Offer.'
                : total
                  ? `You're tracking ${pluralize(total, 'application')}. Here are the latest.`
                  : 'Your latest applications appear here.'}
            </p>
          </div>
          {!isEmpty && (
            <Link to="/applications" className={buttonVariants({ variant: 'outline', className: 'shrink-0' })}>
              View all applications
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>

        {isLoading && (
          <ul className="divide-y divide-border rounded-xl border border-border" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <span className="size-8 animate-pulse rounded-lg bg-gray-100" />
                <span className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
              </li>
            ))}
          </ul>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-violet-50/60 px-6 py-8 text-center">
            <EmptyStateIllustration variant="folder" tone="violet" className="w-20" />
            <Button onClick={onAdd}>
              <Plus aria-hidden="true" />
              Add your first application
            </Button>
          </div>
        )}

        {!isLoading && !error && recent.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {recent.map((application) => (
              <li key={application.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-xs font-bold text-violet-700" aria-hidden="true">
                  {application.company.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-foreground">{application.position}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {application.company}
                    {application.deadline && <> · Deadline {formatDate(application.deadline)}</>}
                  </p>
                </div>
                <StatusBadge status={application.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
