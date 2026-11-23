import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import FormField from './FormField';

/**
 * Labelled input with an optional hint and error message (see FormField).
 * `trailing` renders inside the input on the right (e.g. a password visibility toggle).
 */
export default function TextField({ label, error, hint, id, required, trailing, className, ...inputProps }) {
  return (
    <FormField label={label} error={error} hint={hint} id={id} required={required} className={className}>
      {(controlProps) => (
        <div className="relative">
          <Input {...controlProps} className={cn(trailing && 'pr-11')} {...inputProps} />
          {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
        </div>
      )}
    </FormField>
  );
}
