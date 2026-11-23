import { useEffect, useMemo, useState } from 'react';
import { Clock, LocateFixed, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import Alert from '../common/Alert';
import Button from '../common/Button';
import IconTile from '../common/IconTile';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { ApiError } from '../../services/api';
import { DEFAULT_TIMEZONE, detectBrowserTimeZone, formatTimeInZone, listTimeZones } from '../../utils/timezone';

/** Groups "America/Chicago" style names by region for the <select>. */
function groupZones(zones) {
  const groups = new Map();
  for (const zone of zones) {
    const region = zone.includes('/') ? zone.split('/')[0] : 'General';
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(zone);
  }
  return [...groups.entries()];
}

const label = (zone) => zone.replaceAll('_', ' ');

/**
 * Time zone preference. Detects the browser's time zone and suggests it, but
 * only saves when the user presses Save.
 */
export default function TimezoneSettings() {
  const { user, updateTimeZone } = useAuth();
  const { showToast } = useToast();
  const saved = user?.timezone ?? DEFAULT_TIMEZONE;
  const isDefault = user?.timezoneSource !== 'user';
  const detected = useMemo(() => detectBrowserTimeZone(), []);
  const [selected, setSelected] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => setSelected(saved), [saved]);
  // Keeps the "time there" preview current; one update a minute is enough.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const zones = useMemo(() => {
    const all = listTimeZones();
    // The saved and detected names are always selectable, even if the browser lists them under another name.
    return [...new Set([...all, saved, ...(detected ? [detected] : [])])];
  }, [saved, detected]);
  const groups = useMemo(() => groupZones(zones), [zones]);

  async function handleSave(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const updated = await updateTimeZone(selected);
      showToast({ title: 'Time zone saved', description: `Priorities now use ${label(updated.timezone)}.` });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // session ended; the route guard redirects
      setError(err.fieldErrors?.timezone || err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const unchanged = selected === saved && !isDefault;

  return (
    <Card as="section" aria-labelledby="timezone-heading">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={Clock} tone="blue" />
          <div>
            <CardTitle as="h3" id="timezone-heading">
              Time zone
            </CardTitle>
            <CardDescription>
              Your time zone decides when a new day starts for deadline and follow-up urgency. For example, a follow-up
              due today becomes overdue at midnight in this time zone. Dates you enter are never shifted.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-5">
        <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
          <div className="rounded-xl bg-surface px-4 py-3">
            <dt className="text-[12px] font-medium text-muted-foreground">Current time zone</dt>
            <dd className="mt-1 font-semibold text-foreground" data-testid="current-timezone">
              {label(saved)}
              {isDefault && <span className="ml-1.5 font-normal text-muted-foreground">(default, not chosen yet)</span>}
            </dd>
            <dd className="mt-0.5 text-[12.5px] text-muted-foreground">It is {formatTimeInZone(now, saved)} there.</dd>
          </div>
          <div className="rounded-xl bg-surface px-4 py-3">
            <dt className="text-[12px] font-medium text-muted-foreground">Detected from this browser</dt>
            <dd className="mt-1 font-semibold text-foreground" data-testid="detected-timezone">
              {detected ? label(detected) : 'Not available'}
            </dd>
          </div>
        </dl>

        <form onSubmit={handleSave} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone-select">Time zone for priorities</Label>
            <NativeSelect
              id="timezone-select"
              value={selected}
              disabled={saving}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'timezone-error' : undefined}
              onChange={(e) => {
                setSelected(e.target.value);
                setError('');
              }}
            >
              {groups.map(([region, regionZones]) => (
                <optgroup key={region} label={region}>
                  {regionZones.map((zone) => (
                    <option key={zone} value={zone}>
                      {label(zone)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          {error && (
            <p id="timezone-error" className="text-[13px] font-medium text-destructive">
              {error}
            </p>
          )}
          {detected && detected !== selected && (
            <Alert type="info">
              Your browser reports <strong>{label(detected)}</strong>. Choose “Use detected time zone”, then save, to use it.
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={saving} loadingText="Saving…" disabled={unchanged}>
              <Save aria-hidden="true" />
              {isDefault && selected === saved ? `Confirm ${label(saved)}` : 'Save time zone'}
            </Button>
            {detected && detected !== selected && (
              <Button variant="ghost" onClick={() => setSelected(detected)} disabled={saving}>
                <LocateFixed aria-hidden="true" />
                Use detected time zone
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
