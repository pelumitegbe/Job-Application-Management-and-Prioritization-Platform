import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = { sm: 'size-4', md: 'size-5', lg: 'size-6' };

export default function Spinner({ size = 'md', label, className }) {
  return (
    <LoaderCircle
      className={cn('animate-spin text-current', SIZES[size], className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
