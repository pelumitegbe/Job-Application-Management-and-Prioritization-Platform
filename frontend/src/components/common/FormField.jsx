import { useId } from 'react';
import { CircleAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Label + control + hint/error wrapper shared by every form control.
 * `children` is a render function receiving the props to spread on the control
 * ({ id, required, 'aria-invalid', 'aria-describedby' }), so inputs, selects and
 * textareas all get the same labelling and error linking.
 * Required fields show a visual asterisk; the control's `required` attribute
 * announces it to screen readers.
 */
export default function FormField({ label, error, hint, id, required = false, className, children }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={controlId}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children({
        id: controlId,
        required: required || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] leading-5 text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-[13px] leading-5 text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
