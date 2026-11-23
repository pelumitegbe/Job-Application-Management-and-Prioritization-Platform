import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Info, RotateCw } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import EmptyState from '../components/common/EmptyState';
import Pagination from '../components/applications/Pagination';
import ApplicationDetailsSheet from '../components/applications/ApplicationDetailsSheet';
import ApplicationFormDialog from '../components/applications/ApplicationFormDialog';
import DeleteApplicationDialog from '../components/applications/DeleteApplicationDialog';
import PrioritySummary from '../components/priorities/PrioritySummary';
import PriorityFilters from '../components/priorities/PriorityFilters';
import PriorityList from '../components/priorities/PriorityList';
import PriorityBreakdownSheet from '../components/priorities/PriorityBreakdownSheet';
import { usePriorities } from '../hooks/usePriorities';
import { useToast } from '../context/ToastContext';
import { APPLICATION_STATUSES } from '../constants/applications';
import { PRIORITIES_MAX_PAGES, PRIORITIES_PAGE_SIZE } from '../services/applicationService';
import { ApiError, NetworkError } from '../services/api';
import { filterPriorities, PRIORITY_CATEGORIES, summarizePriorities } from '../utils/priorityInsights';
import { formatDate } from '../utils/formatters';

export const PRIORITY_LIST_PAGE_SIZE = 10;

/** Filters and page live in the URL (?category=&status=&rejected=1&page=), so they survive reloads and Back. */
function readFilters(searchParams) {
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const rawPage = searchParams.get('page');
  const includeRejected = searchParams.get('rejected') === '1';
  return {
    category: PRIORITY_CATEGORIES.includes(category) ? category : '',
    status: APPLICATION_STATUSES.includes(status) && (status !== 'Rejected' || includeRejected) ? status : '',
    includeRejected,
    page: rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1,
  };
}

function errorMessage(error) {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError && error.status >= 500) return 'The server had a problem loading your priorities. Please try again.';
  return error?.message || 'Something went wrong while loading your priorities.';
}

function LoadingSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading priorities…</span>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-hidden="true">
          <span className="size-10 animate-pulse rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-gray-100" />
            <span className="block h-3 w-1/4 animate-pulse rounded bg-gray-100" />
          </div>
          <span className="hidden h-2 w-40 animate-pulse rounded-full bg-gray-100 md:block" />
        </div>
      ))}
    </div>
  );
}

export default function Priorities() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const { data, error, isLoading, reload } = usePriorities();
  const { showToast } = useToast();
  const [breakdown, setBreakdown] = useState({ open: false, item: null });
  const [details, setDetails] = useState({ open: false, id: null });
  const [edit, setEdit] = useState({ open: false, id: null });
  const [removal, setRemoval] = useState({ open: false, application: null });

  const items = data?.items;
  const summary = useMemo(() => (items ? summarizePriorities(items) : null), [items]);
  const filtered = useMemo(
    () => (items ? filterPriorities(items, filters) : []),
    [items, filters.category, filters.status, filters.includeRejected] // filters is rebuilt each render; depend on its values
  );

  // Client-side pages over the filtered full ranking, in the shape the Pagination component expects.
  const total = filtered.length;
  const totalPages = Math.ceil(total / PRIORITY_LIST_PAGE_SIZE);
  const page = Math.min(filters.page, Math.max(totalPages, 1));
  const pageItems = filtered.slice((page - 1) * PRIORITY_LIST_PAGE_SIZE, page * PRIORITY_LIST_PAGE_SIZE);
  const pagination = { page, limit: PRIORITY_LIST_PAGE_SIZE, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };

  function updateParams({ category = filters.category, status = filters.status, includeRejected = filters.includeRejected, page: nextPage = 1 }) {
    const next = {};
    if (category) next.category = category;
    if (status) next.status = status;
    if (includeRejected) next.rejected = '1';
    if (nextPage > 1) next.page = String(nextPage);
    setSearchParams(next);
  }

  // A ?page= past the end (e.g. after a delete) is corrected in the URL too.
  useEffect(() => {
    if (data && filters.page !== page) updateParams({ page });
  }, [data, filters.page, page]); // updateParams only wraps setSearchParams

  const openBreakdown = (item) => setBreakdown({ open: true, item });
  const openDetails = (item) => {
    setBreakdown((b) => ({ ...b, open: false }));
    setDetails({ open: true, id: item.id });
  };
  const openEdit = (application) => {
    setDetails((d) => ({ ...d, open: false }));
    setEdit({ open: true, id: application.id });
  };
  const openDelete = (application) => {
    setDetails((d) => ({ ...d, open: false }));
    setRemoval({ open: true, application });
  };

  // Edits and deletes notify the priorities data (services/applicationEvents.js), which reloads itself.
  function handleUpdated(application) {
    showToast({ title: 'Changes saved', description: `${application.position} at ${application.company} was updated. Priorities refreshed.` });
  }
  function handleDeleted(application) {
    showToast({ title: 'Application deleted', description: `${application.position} at ${application.company} was deleted.` });
  }
  function handleMissing() {
    showToast({ variant: 'error', title: 'Application not found', description: 'It may have been deleted elsewhere. Priorities have been refreshed.' });
    reload();
  }

  const authError = error instanceof ApiError && error.status === 401; // AuthContext signs out; the route guard redirects

  let content;
  if (isLoading && !data) {
    content = <LoadingSkeleton />;
  } else if (error && !authError) {
    content = (
      <div className="space-y-4">
        <Alert type="error" title="Couldn't load priorities">
          {errorMessage(error)}
        </Alert>
        <Button variant="secondary" onClick={reload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  } else if (data && data.items.length === 0) {
    content = (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <EmptyState illustration="folder" tone="coral" title="No applications to prioritise" className="py-10">
          Add applications from the Applications page. Each one is scored and ranked here automatically.
        </EmptyState>
      </div>
    );
  } else if (data) {
    content = (
      <div className="space-y-4">
        {pageItems.length > 0 ? (
          <PriorityList items={pageItems} onSelect={openBreakdown} busy={isLoading} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center" data-testid="priorities-filtered-empty">
            <p className="font-semibold text-foreground">No applications match these filters</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Try another category or status, or include rejected applications.</p>
          </div>
        )}
        <Pagination pagination={pagination} onPageChange={(p) => updateParams({ page: p })} disabled={isLoading} />
      </div>
    );
  }

  return (
    <AppLayout title="Priorities">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="priorities-heading">
          <h2 id="priorities-heading" className="text-2xl font-bold tracking-tight text-foreground">
            Priorities
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">
            Your applications ranked by deadline urgency, follow-up urgency, stage and interest. Select one to see how its score is made.
          </p>
          {data?.referenceDate && (
            <p className="mt-2 text-[13px] text-muted-foreground" data-testid="scoring-date">
              Scored for <span className="font-semibold text-foreground">{formatDate(data.referenceDate)}</span> in{' '}
              <span className="font-semibold text-foreground">{(data.timezone ?? 'UTC').replaceAll('_', ' ')}</span>. Updates automatically at midnight.{' '}
              <Link to="/settings" className="font-semibold text-violet-700 underline-offset-2 hover:underline">
                Change time zone
              </Link>
            </p>
          )}
        </section>

        {!(error && !authError) && <PrioritySummary summary={summary} isLoading={isLoading && !data} />}

        {data && !data.complete && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground" data-testid="priorities-incomplete">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Showing the top {(PRIORITIES_MAX_PAGES * PRIORITIES_PAGE_SIZE).toLocaleString()} of {data.total.toLocaleString()} ranked applications. Counts and filters cover those only.
          </p>
        )}

        {data && data.items.length > 0 && (
          <PriorityFilters
            filters={filters}
            disabled={isLoading}
            onChange={(change) => updateParams({ ...filters, ...change, page: 1 })}
          />
        )}

        {content}
      </div>

      <PriorityBreakdownSheet
        item={breakdown.item}
        open={breakdown.open}
        onOpenChange={(open) => setBreakdown((b) => ({ ...b, open }))}
        onOpenDetails={openDetails}
        referenceDate={data?.referenceDate}
        timezone={data?.timezone}
      />
      <ApplicationDetailsSheet
        open={details.open}
        applicationId={details.id}
        onOpenChange={(open) => setDetails((d) => ({ ...d, open }))}
        onEdit={openEdit}
        onDelete={openDelete}
        onMissing={handleMissing}
      />
      <ApplicationFormDialog
        open={edit.open}
        applicationId={edit.id}
        onOpenChange={(open) => setEdit((e) => ({ ...e, open }))}
        onUpdated={handleUpdated}
        onMissing={handleMissing}
      />
      <DeleteApplicationDialog
        open={removal.open}
        application={removal.application}
        onOpenChange={(open) => setRemoval((r) => ({ ...r, open }))}
        onDeleted={handleDeleted}
        onMissing={handleMissing}
      />
    </AppLayout>
  );
}
