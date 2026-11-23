import { RotateCcw } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { APPLICATION_STATUSES } from '@/constants/applications';
import { PRIORITY_CATEGORIES } from '../../utils/priorityInsights';

/** Category, status and include-rejected filters. The order is always the backend's priority ranking. */
export default function PriorityFilters({ filters, onChange, disabled }) {
  const statuses = filters.includeRejected ? APPLICATION_STATUSES : APPLICATION_STATUSES.filter((s) => s !== 'Rejected');
  const active = filters.category || filters.status || filters.includeRejected;

  return (
    <form
      role="search"
      aria-label="Filter priorities"
      className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-1.5 sm:w-44">
        <Label htmlFor="filter-category">Category</Label>
        <NativeSelect id="filter-category" className="h-10" value={filters.category} disabled={disabled} onChange={(e) => onChange({ category: e.target.value })}>
          <option value="">All categories</option>
          {PRIORITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5 sm:w-44">
        <Label htmlFor="filter-status">Status</Label>
        <NativeSelect id="filter-status" className="h-10" value={filters.status} disabled={disabled} onChange={(e) => onChange({ status: e.target.value })}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </div>
      <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-foreground">
        <input
          type="checkbox"
          className="size-4 rounded border-input accent-violet-600"
          checked={filters.includeRejected}
          disabled={disabled}
          onChange={(e) => onChange({ includeRejected: e.target.checked, ...(!e.target.checked && filters.status === 'Rejected' && { status: '' }) })}
        />
        Include rejected
      </label>
      <p className="text-[12.5px] text-muted-foreground sm:ml-auto sm:self-center">Sorted by priority (highest first)</p>
      {active && (
        <Button type="button" variant="ghost" size="sm" className="h-10 sm:self-end" disabled={disabled} onClick={() => onChange({ category: '', status: '', includeRejected: false })}>
          <RotateCcw aria-hidden="true" />
          Reset filters
        </Button>
      )}
    </form>
  );
}
