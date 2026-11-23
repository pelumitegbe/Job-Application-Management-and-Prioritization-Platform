import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Previous/next pagination driven entirely by the backend's pagination metadata
 * ({ page, limit, total, totalPages, hasNextPage, hasPrevPage }).
 */
export default function Pagination({ pagination, onPageChange, disabled = false }) {
  const { page, limit, total, totalPages, hasNextPage, hasPrevPage } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const showingRange = first <= total;

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-[13px] text-muted-foreground" aria-live="polite">
        {showingRange ? (
          <>
            Showing <span className="font-semibold text-foreground">{first}</span>–<span className="font-semibold text-foreground">{last}</span> of{' '}
            <span className="font-semibold text-foreground">{total}</span>
          </>
        ) : (
          'No applications on this page.'
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-9" onClick={() => onPageChange(page - 1)} disabled={disabled || !hasPrevPage}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="min-w-24 text-center text-[13px] font-medium text-foreground">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button variant="outline" size="sm" className="h-9" onClick={() => onPageChange(page + 1)} disabled={disabled || !hasNextPage}>
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
