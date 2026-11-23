import { CalendarDays, Eye, ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '../../utils/formatters';
import StatusBadge from './StatusBadge';
import { InterestLevelIndicator } from './InterestLevel';

const EMPTY = <span className="text-subtle-foreground">—</span>;
const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-subtle-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/45';

const describe = (application) => `${application.position} at ${application.company}`;

function JobLink({ application, className }) {
  if (!application.jobUrl) return null;
  return (
    <a
      href={application.jobUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(iconButton, 'size-8 hover:bg-gray-100 hover:text-primary', className)}
      aria-label={`Open job posting for ${describe(application)} (opens in a new tab)`}
    >
      <ExternalLink className="size-4" aria-hidden="true" />
    </a>
  );
}

function CompanyAvatar({ company }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-sm font-bold text-violet-700" aria-hidden="true">
      {company.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** The position doubles as the "view details" control. */
function ViewButton({ application, onView, className }) {
  return (
    <button
      type="button"
      onClick={() => onView(application)}
      aria-label={`${describe(application)}: view details`}
      className={cn(
        'rounded text-left font-semibold text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/45',
        className
      )}
    >
      {application.position}
    </button>
  );
}

function RowActions({ application, onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button type="button" onClick={() => onEdit(application)} className={cn(iconButton, 'hover:bg-gray-100 hover:text-foreground')} aria-label={`Edit ${describe(application)}`}>
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onDelete(application)} className={cn(iconButton, 'hover:bg-red-50 hover:text-red-700')} aria-label={`Delete ${describe(application)}`}>
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Desktop (md and up): structured table. */
function ApplicationTable({ applications, onView, onEdit, onDelete }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block" data-testid="applications-table">
      <table className="w-full table-fixed text-left text-[13.5px]">
        <caption className="sr-only">Your job applications, newest first</caption>
        <thead className="border-b border-border bg-surface text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="w-[33%] px-5 py-3">
              Role
            </th>
            <th scope="col" className="w-[15%] px-3 py-3">
              Status
            </th>
            <th scope="col" className="hidden w-[13%] px-3 py-3 lg:table-cell">
              Location
            </th>
            <th scope="col" className="w-[12%] px-3 py-3">
              Applied
            </th>
            <th scope="col" className="w-[12%] px-3 py-3">
              Deadline
            </th>
            <th scope="col" className="w-[11%] px-3 py-3">
              Interest
            </th>
            <th scope="col" className="w-[96px] px-4 py-3 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((application) => (
            <tr key={application.id} className="transition-colors hover:bg-gray-50/70">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <CompanyAvatar company={application.company} />
                  <div className="min-w-0 flex-1">
                    <ViewButton application={application} onView={onView} className="block max-w-full truncate" />
                    <p className="truncate text-muted-foreground">{application.company}</p>
                  </div>
                  <JobLink application={application} />
                </div>
              </td>
              <td className="px-3 py-3.5">
                <StatusBadge status={application.status} />
              </td>
              <td className="hidden truncate px-3 py-3.5 text-muted-foreground lg:table-cell">{application.location || EMPTY}</td>
              <td className="px-3 py-3.5 text-muted-foreground">{formatDate(application.applicationDate) || EMPTY}</td>
              <td className="px-3 py-3.5 text-muted-foreground">{formatDate(application.deadline) || EMPTY}</td>
              <td className="px-3 py-3.5">
                <InterestLevelIndicator value={application.interestLevel} />
              </td>
              <td className="px-3 py-3.5">
                <RowActions application={application} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile (below md): stacked cards, no horizontal scrolling. */
function ApplicationCards({ applications, onView, onEdit, onDelete }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" data-testid="applications-cards" aria-label="Your job applications, newest first">
      {applications.map((application) => {
        const applied = formatDate(application.applicationDate);
        const deadline = formatDate(application.deadline);
        return (
          <li key={application.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <CompanyAvatar company={application.company} />
              <div className="min-w-0 flex-1">
                <ViewButton application={application} onView={onView} className="break-words" />
                <p className="break-words text-[13.5px] text-muted-foreground">{application.company}</p>
              </div>
              <JobLink application={application} className="-mr-1 -mt-1" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <StatusBadge status={application.status} />
              <InterestLevelIndicator value={application.interestLevel} />
            </div>
            {(application.location || applied || deadline) && (
              <dl className="mt-3 grid gap-1.5 border-t border-border pt-3 text-[13px] text-muted-foreground">
                {application.location && (
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">Location</dt>
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                    <dd className="min-w-0 break-words">{application.location}</dd>
                  </div>
                )}
                {applied && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                    <dt>Applied</dt>
                    <dd className="font-medium text-foreground">{applied}</dd>
                  </div>
                )}
                {deadline && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                    <dt>Deadline</dt>
                    <dd className="font-medium text-foreground">{deadline}</dd>
                  </div>
                )}
              </dl>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => onView(application)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-foreground outline-none hover:bg-gray-50 focus-visible:ring-3 focus-visible:ring-ring/45"
                aria-label={`View details for ${describe(application)}`}
              >
                <Eye className="size-4" aria-hidden="true" />
                Details
              </button>
              <button
                type="button"
                onClick={() => onEdit(application)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-[13px] font-semibold text-foreground outline-none hover:bg-gray-50 focus-visible:ring-3 focus-visible:ring-ring/45"
                aria-label={`Edit ${describe(application)}`}
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(application)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 text-[13px] font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-3 focus-visible:ring-ring/45"
                aria-label={`Delete ${describe(application)}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Responsive application listing: a table from md up, cards below md.
 * Both are rendered; CSS hides the one that doesn't fit (display:none also
 * hides it from assistive technology), so there is no JavaScript layout logic.
 */
export default function ApplicationList({ applications, busy = false, onView, onEdit, onDelete }) {
  const handlers = { onView, onEdit, onDelete };
  return (
    <div aria-busy={busy || undefined} className={cn('transition-opacity', busy && 'opacity-60')}>
      <ApplicationTable applications={applications} {...handlers} />
      <ApplicationCards applications={applications} {...handlers} />
    </div>
  );
}
