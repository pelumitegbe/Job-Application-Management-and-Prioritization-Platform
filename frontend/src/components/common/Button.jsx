import { Button as UiButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Spinner from './Spinner';

const VARIANTS = { primary: 'default', secondary: 'outline', ghost: 'ghost' };

/**
 * App button with a loading state. While `loading`, it is disabled and shows a
 * spinner plus `loadingText`. variant: "primary" | "secondary" | "ghost".
 */
export default function Button({ variant = 'primary', size, loading = false, loadingText, fullWidth = false, disabled, children, className, ...rest }) {
  return (
    <UiButton
      variant={VARIANTS[variant] || variant}
      size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {loading && loadingText ? loadingText : children}
    </UiButton>
  );
}
