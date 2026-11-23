import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, RotateCw } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import EmptyState from '../components/common/EmptyState';
import ApplicationList from '../components/applications/ApplicationList';
import ApplicationFormDialog from '../components/applications/ApplicationFormDialog';
import ApplicationDetailsSheet from '../components/applications/ApplicationDetailsSheet';
import DeleteApplicationDialog from '../components/applications/DeleteApplicationDialog';
import Pagination from '../components/applications/Pagination';
import { useApplications } from '../hooks/useApplications';
import { useToast } from '../context/ToastContext';
import { APPLICATIONS_PAGE_SIZE } from '../constants/applications';
import { ApiError, NetworkError } from '../services/api';
import { pluralize } from '../utils/formatters';

/** Reads ?page=N; anything that isn't a positive integer means page 1. */
function readPage(searchParams) {
  const raw = searchParams.get('page');
  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
}

function errorMessage(error) {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError && error.status >= 500) return 'The server had a problem loading your applications. Please try again.';
  return error?.message || 'Something went wrong while loading your applications.';
}

function LoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <span className="sr-only">Loading applications…</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-b-0" aria-hidden="true">
          <span className="size-9 animate-pulse rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-gray-100" />
            <span className="block h-3 w-1/4 animate-pulse rounded bg-gray-100" />
          </div>
          <span className="hidden h-5 w-20 animate-pulse rounded-full bg-gray-100 sm:block" />
        </div>
      ))}
    </div>
  );
}

export default function Applications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams);
  const [formOpen, setFormOpen] = useState(false);
  // `open` and the target are kept separately so a dialog keeps its content while closing.
  const [details, setDetails] = useState({ open: false, id: null });
  const [edit, setEdit] = useState({ open: false, id: null });
  const [removal, setRemoval] = useState({ open: false, application: null });
  const { showToast } = useToast();
  const { data, error, isFetching, isInitialLoad, reload } = useApplications({ page, limit: APPLICATIONS_PAGE_SIZE });

  const total = data?.pagination.total ?? null;

  function goToPage(nextPage) {
    setSearchParams(nextPage > 1 ? { page: String(nextPage) } : {});
  }

  // A page past the end (e.g. ?page=99) jumps to the last page that has data.
  useEffect(() => {
    if (!data || isFetching) return;
    const { totalPages } = data.pagination;
    if (data.applications.length === 0 && totalPages > 0 && page > totalPages) goToPage(totalPages);
  }, [data, isFetching, page]); // goToPage only wraps setSearchParams

  function handleCreated(application) {
    showToast({ title: 'Application added', description: `${application.position} at ${application.company} was saved.` });
    // The list is newest first, so the new application appears at the top of page 1.
    if (page === 1) reload();
    else goToPage(1);
  }

  const openDetails = (application) => setDetails({ open: true, id: application.id });
  const openEdit = (application) => {
    setDetails((d) => ({ ...d, open: false }));
    setEdit({ open: true, id: application.id });
  };
  const openDelete = (application) => {
    setDetails((d) => ({ ...d, open: false }));
    setRemoval({ open: true, application });
  };

  function handleUpdated(application) {
    showToast({ title: 'Changes saved', description: `${application.position} at ${application.company} was updated.` });
    reload(); // stay on the current page
  }

  function handleMissing() {
    showToast({ variant: 'error', title: 'Application not found', description: 'It may have been deleted elsewhere. The list has been refreshed.' });
    reload();
  }

  function handleDeleted(application) {
    showToast({ title: 'Application deleted', description: `${application.position} at ${application.company} was deleted.` });
    // Deleting the only item on a later page would leave it empty: step back a page.
    const lastItemOnPage = data?.applications.length === 1;
    if (lastItemOnPage && page > 1) goToPage(page - 1);
    else reload();
  }

  const addButton = (
    <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
      <Plus aria-hidden="true" />
      Add application
    </Button>
  );

  let content;
  if (isInitialLoad) {
    content = <LoadingSkeleton />;
  } else if (error && !(error instanceof ApiError && error.status === 401)) {
    content = (
      <div className="space-y-4">
        <Alert type="error" title="Couldn't load applications">
          {errorMessage(error)}
        </Alert>
        <Button variant="secondary" onClick={reload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  } else if (data && data.pagination.total === 0) {
    content = (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <EmptyState illustration="folder" tone="violet" title="No applications yet" className="py-10">
          Add the jobs you're applying for to track their status, deadlines and your interest in one place.
        </EmptyState>
        <div className="mt-5 flex justify-center">{addButton}</div>
      </div>
    );
  } else if (data) {
    content = (
      <div className="space-y-4">
        {data.applications.length > 0 ? (
          <ApplicationList applications={data.applications} busy={isFetching} onView={openDetails} onEdit={openEdit} onDelete={openDelete} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-muted-foreground">This page has no applications.</p>
        )}
        <Pagination pagination={data.pagination} onPageChange={goToPage} disabled={isFetching} />
      </div>
    );
  }

  return (
    <AppLayout title="Applications">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="applications-heading" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="applications-heading" className="text-2xl font-bold tracking-tight text-foreground">
                Your applications
              </h2>
              {total !== null && (
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200" data-testid="application-count">
                  {pluralize(total, 'application')}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[14px] text-muted-foreground">Every job you're tracking, newest first.</p>
          </div>
          {addButton}
        </section>

        {content}
      </div>

      <ApplicationFormDialog open={formOpen} onOpenChange={setFormOpen} onCreated={handleCreated} />
      <ApplicationFormDialog
        open={edit.open}
        applicationId={edit.id}
        onOpenChange={(open) => setEdit((e) => ({ ...e, open }))}
        onUpdated={handleUpdated}
        onMissing={handleMissing}
      />
      <ApplicationDetailsSheet
        open={details.open}
        applicationId={details.id}
        onOpenChange={(open) => setDetails((d) => ({ ...d, open }))}
        onEdit={openEdit}
        onDelete={openDelete}
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
