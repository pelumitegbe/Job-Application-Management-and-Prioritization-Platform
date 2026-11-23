import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Globe2 } from 'lucide-react';
import Button from '../common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_TIMEZONE, detectBrowserTimeZone } from '../../utils/timezone';

const label = (zone) => zone.replaceAll('_', ' ');

/**
 * One-time suggestion for accounts that have never chosen a time zone (they
 * use UTC). Nothing is saved without a click: "Use …" saves the browser's time
 * zone, "Keep UTC" saves UTC. Either way the choice is stored, so the
 * suggestion doesn't come back.
 */
export default function TimezoneSuggestion() {
  const { user, updateTimeZone } = useAuth();
  const { showToast } = useToast();
  const detected = useMemo(() => detectBrowserTimeZone(), []);
  const [saving, setSaving] = useState(null); // the zone being saved
  const [error, setError] = useState('');

  const current = user?.timezone ?? DEFAULT_TIMEZONE;
  if (!user || user.timezoneSource === 'user' || !detected || detected === current) return null;

  async function choose(zone) {
    setSaving(zone);
    setError('');
    try {
      await updateTimeZone(zone);
      showToast({ title: 'Time zone saved', description: `Priorities now use ${label(zone)}.` });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSaving(null);
    }
  }

  return (
    <section
      aria-labelledby="timezone-suggestion-heading"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
      data-testid="timezone-suggestion"
    >
      <Globe2 className="hidden size-6 shrink-0 text-blue-700 sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="timezone-suggestion-heading" className="text-[14px] font-semibold text-foreground">
          Use your time zone for priorities?
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/80">
          Deadlines and follow-ups currently change day at midnight {label(current)}. Your browser is set to{' '}
          <strong>{label(detected)}</strong>. You can change this any time in <Link to="/settings" className="font-semibold text-blue-800 underline underline-offset-2">Settings</Link>.
        </p>
        {error && (
          <p role="alert" className="mt-1.5 text-[13px] font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => choose(detected)} loading={saving === detected} loadingText="Saving…" disabled={Boolean(saving)}>
          Use {label(detected)}
        </Button>
        <Button variant="secondary" onClick={() => choose(current)} loading={saving === current} loadingText="Saving…" disabled={Boolean(saving)}>
          Keep {label(current)}
        </Button>
      </div>
    </section>
  );
}
