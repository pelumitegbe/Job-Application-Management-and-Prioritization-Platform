import { CircleAlert, CircleCheck, LoaderCircle, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { APPLICATION_STATUSES, FIELD_LIMITS, INTEREST_LABELS, INTEREST_LEVELS } from '@/constants/applications';
import { cn } from '@/lib/utils';
import FormField from '../common/FormField';
import StatusBadge from './StatusBadge';

const ROW_STYLES = {
  draft: 'border-border',
  submitting: 'border-violet-300 ring-2 ring-violet-100',
  created: 'border-green-200 bg-green-50/40',
  failed: 'border-red-200 ring-2 ring-red-50',
};

/**
 * One application in the bulk-entry form: a numbered fieldset whose fields use
 * the backend's names and the same labelled FormField controls as the single form.
 * Created rows collapse to a read-only summary and are never sent again.
 */
export default function BulkApplicationRow({ row, index, disabled, canRemove, onChange, onRemove }) {
  const number = index + 1;
  const { values, errors, status } = row;
  const locked = disabled || status === 'created' || status === 'submitting';
  const set = (name) => (event) => onChange(row.key, name, name === 'interestLevel' ? Number(event.target.value) : event.target.value);
  const legend = `Application ${number}`;

  if (status === 'created') {
    return (
      <li className={cn('rounded-2xl border bg-card p-4 shadow-xs sm:px-5', ROW_STYLES.created)} data-testid={`bulk-row-${number}`}>
        <div className="flex flex-wrap items-center gap-3">
          <RowNumber number={number} tone="created" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{row.application.position}</p>
            <p className="truncate text-[13px] text-muted-foreground">{row.application.company}</p>
          </div>
          <StatusBadge status={row.application.status} />
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-green-800">
            <CircleCheck className="size-4" aria-hidden="true" />
            Created
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className={cn('rounded-2xl border bg-card shadow-xs', ROW_STYLES[status])} data-testid={`bulk-row-${number}`}>
      <fieldset disabled={locked} className="min-w-0 p-4 sm:p-5" aria-describedby={row.error ? `bulk-row-${row.key}-error` : undefined}>
        <legend className="sr-only">{legend}</legend>
        <div className="mb-4 flex items-center gap-3">
          <RowNumber number={number} tone={status} />
          <p className="flex-1 text-[14px] font-semibold text-foreground" aria-hidden="true">
            {legend}
          </p>
          {status === 'submitting' && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-violet-700">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Creating…
            </span>
          )}
          {status === 'failed' && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-700">
              <CircleAlert className="size-4" aria-hidden="true" />
              Not created
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(row.key)}
            disabled={locked || !canRemove}
            aria-label={`Remove application ${number}`}
            className="inline-flex size-9 items-center justify-center rounded-lg text-subtle-foreground outline-none transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:ring-3 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>

        {row.error && (
          <p id={`bulk-row-${row.key}-error`} role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {row.error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Company" required error={errors.company}>
            {(p) => <Input {...p} name={`company-${row.key}`} value={values.company} onChange={set('company')} maxLength={FIELD_LIMITS.company} autoComplete="organization" />}
          </FormField>
          <FormField label="Position" required error={errors.position}>
            {(p) => <Input {...p} name={`position-${row.key}`} value={values.position} onChange={set('position')} maxLength={FIELD_LIMITS.position} />}
          </FormField>
          <FormField label="Status" error={errors.status}>
            {(p) => (
              <NativeSelect {...p} name={`status-${row.key}`} value={values.status} onChange={set('status')}>
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Interest level" error={errors.interestLevel}>
            {(p) => (
              <NativeSelect {...p} name={`interestLevel-${row.key}`} value={values.interestLevel} onChange={set('interestLevel')}>
                {INTEREST_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level} – {INTEREST_LABELS[level]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>

          <FormField label="Location" error={errors.location}>
            {(p) => <Input {...p} name={`location-${row.key}`} value={values.location} onChange={set('location')} maxLength={FIELD_LIMITS.location} />}
          </FormField>
          <FormField label="Application date" error={errors.applicationDate}>
            {(p) => <Input {...p} type="date" name={`applicationDate-${row.key}`} value={values.applicationDate} onChange={set('applicationDate')} />}
          </FormField>
          <FormField label="Deadline" error={errors.deadline}>
            {(p) => <Input {...p} type="date" name={`deadline-${row.key}`} value={values.deadline} onChange={set('deadline')} />}
          </FormField>
          <FormField label="Follow-up date" error={errors.followUpDate}>
            {(p) => <Input {...p} type="date" name={`followUpDate-${row.key}`} value={values.followUpDate} onChange={set('followUpDate')} />}
          </FormField>

          <FormField label="Job posting URL" error={errors.jobUrl} className="sm:col-span-2">
            {(p) => <Input {...p} type="url" inputMode="url" placeholder="https://" name={`jobUrl-${row.key}`} value={values.jobUrl} onChange={set('jobUrl')} />}
          </FormField>
          <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={1} className="min-h-11" name={`notes-${row.key}`} value={values.notes} onChange={set('notes')} maxLength={FIELD_LIMITS.notes} />}
          </FormField>
        </div>
      </fieldset>
    </li>
  );
}

function RowNumber({ number, tone }) {
  const styles = {
    draft: 'bg-violet-50 text-violet-700',
    submitting: 'bg-violet-100 text-violet-800',
    created: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold tabular-nums', styles[tone] || styles.draft)} aria-hidden="true">
      {number}
    </span>
  );
}
