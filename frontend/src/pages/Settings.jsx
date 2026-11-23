import AppLayout from '../components/layout/AppLayout';
import TimezoneSettings from '../components/settings/TimezoneSettings';

export default function Settings() {
  return (
    <AppLayout title="Settings" hideTimezoneSuggestion>
      <div className="flex flex-col gap-6">
        <section aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="text-2xl font-bold tracking-tight text-foreground">
            Settings
          </h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">Preferences for your account.</p>
        </section>
        <TimezoneSettings />
      </div>
    </AppLayout>
  );
}
