import { INTEREST_LABELS, INTEREST_LEVELS } from '@/constants/applications';
import { cn } from '@/lib/utils';

/** Read-only interest level: five pips, with the value as accessible text. */
export function InterestLevelIndicator({ value, className }) {
  if (!Number.isInteger(value)) return null;
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={`Interest: ${value} of 5 (${INTEREST_LABELS[value]})`}>
      {INTEREST_LEVELS.map((level) => (
        <span key={level} className={cn('h-2 w-3.5 rounded-full', level <= value ? 'bg-violet-500' : 'bg-gray-200')} aria-hidden="true" />
      ))}
      <span className="sr-only">
        Interest {value} of 5 ({INTEREST_LABELS[value]})
      </span>
    </span>
  );
}

/**
 * Interest level picker: a radio group styled as a 1-5 segmented control.
 * Native radios keep arrow-key navigation and screen-reader semantics.
 */
export function InterestLevelInput({ value, onChange, name = 'interestLevel', error, errorId, disabled }) {
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined} disabled={disabled}>
      <legend className="mb-2 text-[13.5px] font-semibold leading-none text-foreground">Interest level</legend>
      <div className="grid grid-cols-5 gap-1.5 rounded-xl bg-muted p-1">
        {INTEREST_LEVELS.map((level) => (
          <label key={level} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex h-9 items-center justify-center rounded-lg text-sm font-semibold text-muted-foreground transition-colors',
                'hover:bg-white/70 hover:text-foreground',
                'peer-checked:bg-brand-gradient peer-checked:text-white peer-checked:shadow-sm',
                'peer-focus-visible:ring-3 peer-focus-visible:ring-ring/45'
              )}
              aria-hidden="true"
            >
              {level}
            </span>
            <span className="sr-only">
              {level} – {INTEREST_LABELS[level]}
            </span>
          </label>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground" aria-hidden="true">
        {INTEREST_LABELS[value] ? `${value} – ${INTEREST_LABELS[value]}` : 'Choose 1 (very low) to 5 (very high).'}
      </p>
      {error && (
        <p id={errorId} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
