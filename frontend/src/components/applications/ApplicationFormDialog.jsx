import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { APPLICATION_STATUSES, FIELD_LIMITS } from '@/constants/applications';
import Alert from '../common/Alert';
import Button from '../common/Button';
import FormField from '../common/FormField';
import Spinner from '../common/Spinner';
import { InterestLevelInput } from './InterestLevel';
import { createApplication, getApplication, updateApplication } from '../../services/applicationService';
import { ApiError } from '../../services/api';
import { useFormSubmission } from '../../hooks/useFormSubmission';
import {
  APPLICATION_FIELD_ORDER,
  EMPTY_APPLICATION_FORM,
  mapServerFieldErrors,
  toCreatePayload,
  toFormValues,
  toUpdatePayload,
  validateApplicationForm,
} from '../../utils/applicationForm';

const MISSING_MESSAGE = 'This application no longer exists. It may have been deleted in another tab or device.';

/**
 * Application form in a modal, used for both creating and editing.
 *
 * Create mode (no `applicationId`): POST /api/applications, then onCreated(application).
 * Edit mode (`applicationId` set): loads the latest version with GET /:id, sends only the
 * changed fields with PATCH /:id, then onUpdated(application). If the application no
 * longer exists (404 on load or save), the dialog says so and calls onMissing().
 */
export default function ApplicationFormDialog({ open, onOpenChange, applicationId = null, onCreated, onUpdated, onMissing }) {
  const isEdit = Boolean(applicationId);
  const [values, setValues] = useState(EMPTY_APPLICATION_FORM);
  const [initialValues, setInitialValues] = useState(EMPTY_APPLICATION_FORM);
  const [loadState, setLoadState] = useState('ready'); // 'loading' | 'ready' | 'missing' | 'error'
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const { submitting, run } = useFormSubmission();
  const formRef = useRef(null);

  // Reset (create) or load the latest version (edit) whenever the dialog opens.
  useEffect(() => {
    if (!open) return undefined;
    setErrors({});
    setFormError('');
    setFormNotice('');
    if (!isEdit) {
      setValues(EMPTY_APPLICATION_FORM);
      setInitialValues(EMPTY_APPLICATION_FORM);
      setLoadState('ready');
      return undefined;
    }

    const controller = new AbortController();
    setLoadState('loading');
    getApplication(applicationId, { signal: controller.signal })
      .then((application) => {
        const formValues = toFormValues(application);
        setValues(formValues);
        setInitialValues(formValues);
        setLoadState('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadState('missing');
          onMissing?.();
        } else {
          setLoadState('error');
          setLoadError(err.message || 'Something went wrong while loading this application.');
        }
      });
    return () => controller.abort();
    // onMissing is a notification callback; reloading on its identity change is not wanted.
  }, [open, isEdit, applicationId, reloadToken]);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setFormNotice('');
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  }

  const onInput = (event) => setField(event.target.name, event.target.value);

  function focusFirstError(fieldErrors) {
    const first = APPLICATION_FIELD_ORDER.find((field) => fieldErrors[field]);
    const element = first && formRef.current?.elements.namedItem(first);
    // Radio groups return a RadioNodeList; focus its first radio.
    (element?.focus ? element : element?.[0])?.focus();
  }

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      setFormError('');
      setFormNotice('');
      const clientErrors = validateApplicationForm(values);
      setErrors(clientErrors);
      if (Object.keys(clientErrors).length) {
        setFormError('Please fix the highlighted fields.');
        focusFirstError(clientErrors);
        return;
      }

      try {
        if (isEdit) {
          const changes = toUpdatePayload(initialValues, values);
          if (Object.keys(changes).length === 0) {
            setFormNotice("You haven't changed anything yet.");
            return;
          }
          const application = await updateApplication(applicationId, changes);
          onUpdated?.(application);
        } else {
          const application = await createApplication(toCreatePayload(values));
          onCreated?.(application);
        }
        onOpenChange(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // The session ended; AuthContext clears it and the route guard redirects to login.
          return;
        }
        if (isEdit && err instanceof ApiError && err.status === 404) {
          setLoadState('missing');
          onMissing?.();
          return;
        }
        if (err instanceof ApiError) {
          // Backend field-level errors go next to their inputs; anything else is shown in the alert.
          const { fields, other } = mapServerFieldErrors(err.fieldErrors);
          setErrors(fields);
          const hasFieldErrors = Object.keys(fields).length > 0;
          setFormError(other.length ? other.join(' ') : hasFieldErrors ? 'Please fix the highlighted fields.' : err.message);
          focusFirstError(fields);
        } else {
          setFormError(err.message || 'Something went wrong. Please try again.');
        }
      }
    });
  }

  // Keep the dialog open while a request is in flight.
  const handleOpenChange = (next) => {
    if (!submitting) onOpenChange(next);
  };

  const title = isEdit ? 'Edit application' : 'Add application';
  const optionalHint = isEdit ? ' Leave empty to remove it.' : '';

  let body;
  if (loadState === 'loading') {
    body = (
      <DialogBody>
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground" role="status">
          <Spinner size="md" className="text-primary" />
          Loading application…
        </div>
      </DialogBody>
    );
  } else if (loadState === 'missing' || loadState === 'error') {
    body = (
      <>
        <DialogBody>
          <Alert type="error" title={loadState === 'missing' ? 'Application not found' : "Couldn't load this application"}>
            {loadState === 'missing' ? MISSING_MESSAGE : loadError}
          </Alert>
        </DialogBody>
        <DialogFooter>
          {loadState === 'error' && (
            <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </>
    );
  } else {
    body = (
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-5">
          {formError && <Alert type="error">{formError}</Alert>}
          {formNotice && <Alert type="info">{formNotice}</Alert>}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Company" required error={errors.company}>
              {(p) => <Input {...p} name="company" value={values.company} onChange={onInput} maxLength={FIELD_LIMITS.company} autoComplete="organization" autoFocus />}
            </FormField>
            <FormField label="Position" required error={errors.position}>
              {(p) => <Input {...p} name="position" value={values.position} onChange={onInput} maxLength={FIELD_LIMITS.position} autoComplete="organization-title" />}
            </FormField>

            <FormField label="Status" error={errors.status}>
              {(p) => (
                <NativeSelect {...p} name="status" value={values.status} onChange={onInput}>
                  {APPLICATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField label="Location" error={errors.location} hint={`City, region or “Remote”.${optionalHint}`}>
              {(p) => <Input {...p} name="location" value={values.location} onChange={onInput} maxLength={FIELD_LIMITS.location} />}
            </FormField>

            <FormField label="Job posting URL" error={errors.jobUrl} className="sm:col-span-2">
              {(p) => <Input {...p} type="url" name="jobUrl" value={values.jobUrl} onChange={onInput} placeholder="https://" inputMode="url" />}
            </FormField>

            <FormField label="Application date" error={errors.applicationDate}>
              {(p) => <Input {...p} type="date" name="applicationDate" value={values.applicationDate} onChange={onInput} />}
            </FormField>
            <FormField label="Deadline" error={errors.deadline}>
              {(p) => <Input {...p} type="date" name="deadline" value={values.deadline} onChange={onInput} />}
            </FormField>
            <FormField label="Follow-up date" error={errors.followUpDate}>
              {(p) => <Input {...p} type="date" name="followUpDate" value={values.followUpDate} onChange={onInput} />}
            </FormField>

            <InterestLevelInput value={values.interestLevel} onChange={(level) => setField('interestLevel', level)} error={errors.interestLevel} errorId="interestLevel-error" />

            <FormField label="Notes" error={errors.notes} hint={`Up to ${FIELD_LIMITS.notes.toLocaleString()} characters.${optionalHint}`} className="sm:col-span-2">
              {(p) => <Textarea {...p} name="notes" value={values.notes} onChange={onInput} rows={4} maxLength={FIELD_LIMITS.notes} />}
            </FormField>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} loadingText="Saving…">
            {isEdit ? 'Save changes' : 'Save application'}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel="Close" onInteractOutside={(e) => submitting && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEdit ? (
              <>
                Update any field. To clear an optional field, empty it. Fields marked <span className="font-semibold text-destructive">*</span> are required.
              </>
            ) : (
              <>
                Fields marked <span className="font-semibold text-destructive">*</span> are required.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
