import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ArrowRight, Eraser, Plus, RotateCw } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import BulkApplicationRow from '../components/applications/BulkApplicationRow';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import { buttonVariants } from '@/components/ui/button';
import { useToast } from '../context/ToastContext';
import { useFormSubmission } from '../hooks/useFormSubmission';
import { createApplication } from '../services/applicationService';
import { ApiError } from '../services/api';
import { APPLICATION_FIELD_ORDER, mapServerFieldErrors, toCreatePayload } from '../utils/applicationForm';
import { createInitialRows, createRow, isRowEmpty, MAX_BULK_ROWS, pendingRows, validateRows } from '../utils/bulkApplications';
import { pluralize } from '../utils/formatters';

/**
 * Bulk entry: several applications in one go, created with the existing
 * POST /api/applications endpoint, one request at a time (never in parallel).
 * Created rows are locked and never sent again; failed rows keep their values
 * and errors so they can be corrected and retried.
 */
export default function BulkAddApplications() {
  const [rows, setRows] = useState(() => createInitialRows());
  const [progress, setProgress] = useState(null); // { current, total } while sending
  const [summary, setSummary] = useState(null); // { created, failed } after a run
  const [formError, setFormError] = useState('');
  const { submitting, run } = useFormSubmission();
  const { showToast } = useToast();
  const listRef = useRef(null);
  // Field to focus after the next render, e.g. "company-4" (set by addRow / validation).
  const focusAfterRender = useRef(null);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    listRef.current?.querySelector(`[name="${focusAfterRender.current}"]`)?.focus();
    focusAfterRender.current = null;
  });

  const pending = pendingRows(rows);
  const createdCount = rows.length - pending.length;
  const failedCount = rows.filter((row) => row.status === 'failed').length;
  const hasEmptyRows = rows.some((row) => row.status !== 'created' && isRowEmpty(row.values));

  function updateRow(key, patch) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch(row) } : row)));
  }

  function handleChange(key, field, value) {
    updateRow(key, (row) => {
      const { [field]: _removed, ...errors } = row.errors;
      return { values: { ...row.values, [field]: value }, errors };
    });
  }

  function addRow() {
    if (rows.length >= MAX_BULK_ROWS) return;
    const row = createRow();
    focusAfterRender.current = `company-${row.key}`; // focus the new row's first field
    setRows((current) => [...current, row]);
  }

  function removeRow(key) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  }

  function removeEmptyRows() {
    setRows((current) => {
      const kept = current.filter((row) => row.status === 'created' || !isRowEmpty(row.values));
      return kept.length ? kept : [createRow()];
    });
  }

  function startNewBatch() {
    setRows(createInitialRows());
    setSummary(null);
    setFormError('');
  }

  function focusFirstError(validatedRows) {
    for (const row of validatedRows) {
      const field = APPLICATION_FIELD_ORDER.find((name) => row.errors[name]);
      if (field) {
        focusAfterRender.current = `${field}-${row.key}`; // focused once the errors have rendered
        return;
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      setFormError('');
      setSummary(null);

      // 1. Validate everything first; nothing is sent while any row is invalid.
      const validation = validateRows(rows);
      setRows(validation.rows);
      if (!validation.valid) {
        const invalid = validation.rows.filter((row) => Object.keys(row.errors).length).length;
        setFormError(`Fix the highlighted fields in ${pluralize(invalid, 'application')} before submitting. Nothing has been created yet.`);
        focusFirstError(validation.rows);
        return;
      }

      // 2. Send pending rows one at a time.
      const queue = pendingRows(validation.rows);
      let created = 0;
      let failed = 0;
      for (let i = 0; i < queue.length; i += 1) {
        const row = queue[i];
        setProgress({ current: i + 1, total: queue.length });
        updateRow(row.key, () => ({ status: 'submitting', error: '' }));
        try {
          const application = await createApplication(toCreatePayload(row.values));
          created += 1;
          updateRow(row.key, () => ({ status: 'created', application, errors: {}, error: '' }));
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            // Session ended: AuthContext clears it and the route guard redirects to login.
            updateRow(row.key, () => ({ status: 'draft' }));
            return;
          }
          failed += 1;
          if (err instanceof ApiError) {
            const { fields, other } = mapServerFieldErrors(err.fieldErrors);
            const message = other.length ? other.join(' ') : Object.keys(fields).length ? 'The server rejected some fields. Fix them and retry.' : err.message;
            updateRow(row.key, () => ({ status: 'failed', errors: fields, error: message }));
          } else {
            updateRow(row.key, () => ({ status: 'failed', error: err.message || 'Something went wrong. Please try again.' }));
          }
        }
      }

      setProgress(null);
      setSummary({ created, failed });
      if (created > 0) {
        showToast({
          title: `${pluralize(created, 'application')} added`,
          description: failed ? `${failed} could not be created. Fix them and retry.` : undefined,
          action: { label: 'View applications', to: '/applications' },
        });
      }
    });
  }

  const allDone = rows.length > 0 && pending.length === 0;
  const submitLabel = failedCount > 0 ? `Retry ${pluralize(pending.length, 'application')}` : `Create ${pluralize(pending.length, 'application')}`;

  return (
    <AppLayout title="Add multiple applications">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="bulk-heading" className="flex flex-col gap-3">
          <Link
            to="/applications"
            className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to applications
          </Link>
          <div>
            <h2 id="bulk-heading" className="text-2xl font-bold tracking-tight text-foreground">
              Add multiple applications
            </h2>
            <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">
              Fill in one card per application (up to {MAX_BULK_ROWS}). Company and position are required
              <span className="text-destructive" aria-hidden="true">
                {' '}*
              </span>
              . Everything is checked before anything is saved, and applications are created one at a time.
            </p>
          </div>
        </section>

        {/* Live progress and results */}
        <div aria-live="polite" className="space-y-3">
          {progress && (
            <div className="rounded-2xl border border-violet-200 bg-card p-4 shadow-xs" role="status">
              <p className="text-[14px] font-semibold text-foreground">
                Creating {progress.current} of {progress.total} {progress.total === 1 ? 'application' : 'applications'}…
              </p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-brand-gradient transition-[width]" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {summary && !progress && (
            <Alert
              type={summary.failed ? 'error' : 'success'}
              title={summary.failed ? `${summary.created} created, ${summary.failed} not created` : `All ${pluralize(summary.created, 'application')} created`}
            >
              {summary.failed
                ? 'Successfully created applications are saved and locked, so they won’t be sent again. Fix the rows marked “Not created” and retry.'
                : 'They are now on your applications page.'}
            </Alert>
          )}
          {formError && <Alert type="error">{formError}</Alert>}
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <ol ref={listRef} className="flex flex-col gap-4" aria-label="Applications to add">
            {rows.map((row, index) => (
              <BulkApplicationRow
                key={row.key}
                row={row}
                index={index}
                // Rows lock only while requests are being sent. (Locking during the
                // instant validation step would blur the field we want to focus.)
                disabled={Boolean(progress)}
                canRemove={rows.length > 1}
                onChange={handleChange}
                onRemove={removeRow}
              />
            ))}
          </ol>

          {!allDone && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={addRow} disabled={submitting || rows.length >= MAX_BULK_ROWS}>
                <Plus aria-hidden="true" />
                Add another
              </Button>
              {hasEmptyRows && (
                <Button variant="ghost" onClick={removeEmptyRows} disabled={submitting}>
                  <Eraser aria-hidden="true" />
                  Remove empty rows
                </Button>
              )}
              <p className="text-[13px] text-muted-foreground">
                {rows.length} of {MAX_BULK_ROWS} rows
                {createdCount > 0 && ` · ${createdCount} created`}
              </p>
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:rounded-2xl sm:border sm:px-5">
            {allDone ? (
              <>
                <Button variant="secondary" onClick={startNewBatch}>
                  <Plus aria-hidden="true" />
                  Start a new batch
                </Button>
                <Link to="/applications" className={buttonVariants({ className: 'w-full sm:w-auto' })}>
                  View applications
                  <ArrowRight aria-hidden="true" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/applications"
                  className={buttonVariants({ variant: 'outline', className: ['w-full sm:w-auto', submitting && 'pointer-events-none opacity-60'] })}
                  aria-disabled={submitting || undefined}
                  tabIndex={submitting ? -1 : undefined}
                >
                  {createdCount > 0 ? 'Done' : 'Cancel'}
                </Link>
                <Button
                  type="submit"
                  loading={submitting}
                  loadingText={progress ? `Creating ${progress.current} of ${progress.total}…` : 'Checking…'}
                  className="w-full sm:w-auto"
                >
                  {failedCount > 0 ? <RotateCw aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  {submitLabel}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
