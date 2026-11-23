import Spinner from './Spinner';

export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-surface text-muted-foreground" role="status" aria-live="polite">
      <Spinner size="lg" className="text-primary" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}
