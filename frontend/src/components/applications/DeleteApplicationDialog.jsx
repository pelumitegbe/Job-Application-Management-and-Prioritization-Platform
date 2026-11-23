import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Trash2 } from 'lucide-react';
import Alert from '../common/Alert';
import Button from '../common/Button';
import { deleteApplication } from '../../services/applicationService';
import { ApiError } from '../../services/api';
import { useFormSubmission } from '../../hooks/useFormSubmission';
import { useReturnFocus } from '@/lib/useReturnFocus';

/**
 * Accessible confirmation before DELETE /api/applications/:id.
 * - role="alertdialog", named by its title and described by its warning text.
 * - Focus starts on Cancel (the safe choice); Escape cancels; focus returns to
 *   the button that opened it.
 * - Both buttons are disabled while the request runs, and the dialog can't be
 *   dismissed mid-request.
 * Calls onDeleted(application) after 204, or onMissing(application) after 404
 * (already deleted elsewhere). Network/server errors are shown inside the dialog.
 */
export default function DeleteApplicationDialog({ application, open, onOpenChange, onDeleted, onMissing }) {
  const { submitting, run } = useFormSubmission();
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setError('');
  }, [open]);

  function handleDelete() {
    run(async () => {
      setError('');
      try {
        await deleteApplication(application.id);
        onDeleted?.(application);
        onOpenChange(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return; // session ended; route guard redirects
        if (err instanceof ApiError && err.status === 404) {
          onMissing?.(application);
          onOpenChange(false);
          return;
        }
        setError(err.message || 'Something went wrong. Please try again.');
      }
    });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <ConfirmContent
          application={application}
          submitting={submitting}
          error={error}
          onCancel={() => onOpenChange(false)}
          onConfirm={handleDelete}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Mounted only while open, so useReturnFocus captures the button that opened the dialog. */
function ConfirmContent({ application, submitting, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const handleCloseAutoFocus = useReturnFocus();

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
        <DialogPrimitive.Content
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
          onInteractOutside={(event) => submitting && event.preventDefault()}
          className="pointer-events-auto w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl outline-none data-[state=open]:animate-in"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700" aria-hidden="true">
              <Trash2 className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-foreground">Delete this application?</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{application?.position}</span> at{' '}
                <span className="font-semibold text-foreground">{application?.company}</span> will be permanently deleted. This can't be undone.
              </DialogPrimitive.Description>
            </div>
          </div>

          {error && (
            <Alert type="error" className="mt-5">
              {error}
            </Alert>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} loading={submitting} loadingText="Deleting…">
              <Trash2 aria-hidden="true" />
              Delete application
            </Button>
          </div>
        </DialogPrimitive.Content>
      </div>
    </>
  );
}
