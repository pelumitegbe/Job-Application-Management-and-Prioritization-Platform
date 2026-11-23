import { useEffect, useState } from 'react';
import { ExternalLink, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { INTEREST_LABELS } from '@/constants/applications';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import StatusBadge from './StatusBadge';
import { InterestLevelIndicator } from './InterestLevel';
import { getApplication } from '../../services/applicationService';
import { ApiError } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/formatters';

const NOT_SET = <span className="text-subtle-foreground">Not set</span>;

function DetailRow({ label, children, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[14px] text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Side sheet showing every field of one application, loaded fresh with
 * GET /api/applications/:id each time it opens. Offers Edit and Delete.
 * On 404 (deleted elsewhere, or not owned) it says so and calls onMissing().
 */
export default function ApplicationDetailsSheet({ applicationId, open, onOpenChange, onEdit, onDelete, onMissing }) {
  const [application, setApplication] = useState(null);
  const [state, setState] = useState('loading'); // 'loading' | 'ready' | 'missing' | 'error'
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open || !applicationId) return undefined;
    const controller = new AbortController();
    setState('loading');
    setApplication(null);
    getApplication(applicationId, { signal: controller.signal })
      .then((result) => {
        setApplication(result);
        setState('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setState('missing');
          onMissing?.();
        } else {
          setState('error');
          setError(err.message || 'Something went wrong while loading this application.');
        }
      });
    return () => controller.abort();
  }, [open, applicationId, reloadToken]); // onMissing is a notification callback only

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" closeLabel="Close details" className="bg-card">
        {state === 'ready' && application ? (
          <>
            <header className="border-b border-border px-6 pb-5 pr-16 pt-6">
              <div className="flex items-start gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-base font-bold text-violet-700" aria-hidden="true">
                  {application.company.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="break-words text-lg font-bold leading-snug tracking-tight text-foreground">{application.position}</SheetTitle>
                  <SheetDescription className="break-words text-[14px] text-muted-foreground">{application.company}</SheetDescription>
                  <StatusBadge status={application.status} className="mt-2.5" />
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={() => onEdit(application)}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="h-9 border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50" onClick={() => onDelete(application)}>
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <DetailRow label="Status">
                  <StatusBadge status={application.status} />
                </DetailRow>
                <DetailRow label="Interest level">
                  <span className="inline-flex items-center gap-2">
                    <InterestLevelIndicator value={application.interestLevel} />
                    <span aria-hidden="true">
                      {application.interestLevel} – {INTEREST_LABELS[application.interestLevel]}
                    </span>
                  </span>
                </DetailRow>
                <DetailRow label="Location">{application.location || NOT_SET}</DetailRow>
                <DetailRow label="Job posting">
                  {application.jobUrl ? (
                    <a
                      href={application.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 break-all font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/45"
                    >
                      <span className="break-all">{application.jobUrl}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    NOT_SET
                  )}
                </DetailRow>
                <DetailRow label="Application date">{formatDate(application.applicationDate) || NOT_SET}</DetailRow>
                <DetailRow label="Deadline">{formatDate(application.deadline) || NOT_SET}</DetailRow>
                <DetailRow label="Follow-up date">{formatDate(application.followUpDate) || NOT_SET}</DetailRow>
                <DetailRow label="Notes" wide>
                  {application.notes ? <p className="whitespace-pre-wrap break-words rounded-xl bg-surface px-4 py-3 leading-relaxed">{application.notes}</p> : NOT_SET}
                </DetailRow>
              </dl>

              <dl className="mt-6 grid gap-3 border-t border-border pt-5 text-[13px] text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="inline">Created </dt>
                  <dd className="inline font-medium text-foreground">{formatDateTime(application.createdAt) || '—'}</dd>
                </div>
                <div>
                  <dt className="inline">Last updated </dt>
                  <dd className="inline font-medium text-foreground">{formatDateTime(application.updatedAt) || '—'}</dd>
                </div>
              </dl>
            </div>
          </>
        ) : (
          <>
            <header className="border-b border-border px-6 pb-5 pr-16 pt-6">
              <SheetTitle className="text-lg font-bold tracking-tight text-foreground">Application details</SheetTitle>
              <SheetDescription className="sr-only">Details of the selected job application.</SheetDescription>
            </header>
            <div className="px-6 py-6">
              {state === 'loading' && (
                <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground" role="status">
                  <Spinner size="md" className="text-primary" />
                  Loading application…
                </div>
              )}
              {state === 'missing' && (
                <Alert type="error" title="Application not found">
                  This application no longer exists. It may have been deleted in another tab or device.
                </Alert>
              )}
              {state === 'error' && (
                <div className="space-y-4">
                  <Alert type="error" title="Couldn't load this application">
                    {error}
                  </Alert>
                  <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
                    <RotateCw aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
