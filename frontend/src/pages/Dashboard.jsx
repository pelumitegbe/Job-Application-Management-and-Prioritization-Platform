import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, BellRing, CalendarClock, Plus, UserRound } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import ApplicationFormDialog from '../components/applications/ApplicationFormDialog';
import { useToast } from '../context/ToastContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import IconTile from '../components/common/IconTile';
import EmptyState from '../components/common/EmptyState';
import TrackingBoardIllustration from '../components/illustrations/TrackingBoardIllustration';
import { useAuth } from '../hooks/useAuth';
import { useApplicationStats } from '../hooks/useApplicationStats';
import StatsOverview from '../components/dashboard/StatsOverview';
import RecentApplications from '../components/dashboard/RecentApplications';
import TopPriorities from '../components/dashboard/TopPriorities';
import { useTopPriorities } from '../hooks/usePriorities';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function ComingSoon() {
  return <Badge variant="soon">Coming soon</Badge>;
}

function CardHeading({ id, icon, tone, title, children }) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={icon} tone={tone} />
          <CardTitle as="h3" id={id}>
            {title}
          </CardTitle>
        </div>
        <ComingSoon />
      </div>
      {children}
    </CardHeader>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const stats = useApplicationStats();
  const top = useTopPriorities(3);
  const firstName = user?.name?.split(/\s+/)[0] || 'there';

  function handleCreated(application) {
    showToast({
      title: 'Application added',
      description: `${application.position} at ${application.company} was saved.`,
      action: { label: 'View applications', to: '/applications' },
    });
    stats.reload(); // statistics include the new application
    // Top priorities refresh themselves on application changes (services/applicationEvents.js).
  }

  return (
    <AppLayout title="Dashboard">
      <div className="flex flex-col gap-8">
        {/* Welcome banner */}
        <section aria-labelledby="welcome-heading" className="relative overflow-hidden rounded-3xl bg-brand-gradient text-white shadow-lg shadow-violet-900/15">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:22px_22px]"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-6 px-6 py-6 sm:px-8 sm:py-7 md:grid-cols-[minmax(0,1fr)_230px] lg:grid-cols-[minmax(0,1fr)_250px]">
            <div>
              <Badge variant="onBrand">Your job search workspace</Badge>
              <h2 id="welcome-heading" className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[30px]">
                Welcome, {firstName}
              </h2>
              <p className="mt-1.5 max-w-lg text-[15px] leading-relaxed text-white">
                This is your workspace for managing and prioritizing job applications.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-violet-700 shadow-sm outline-none transition-colors hover:bg-violet-50 focus-visible:ring-3 focus-visible:ring-white/70"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add application
                </button>
                <Link
                  to="/applications"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-950/20 px-4 text-sm font-semibold text-white ring-1 ring-inset ring-white/30 outline-none transition-colors hover:bg-violet-950/30 focus-visible:ring-3 focus-visible:ring-white/70"
                >
                  View applications
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <TrackingBoardIllustration className="drop-shadow-xl" />
            </div>
          </div>
        </section>

        {/* Real statistics from the user's applications */}
        <StatsOverview stats={stats.stats} complete={stats.complete} isLoading={stats.isLoading} error={stats.error} onRetry={stats.reload} />

        <RecentApplications recent={stats.recent} total={stats.total} isLoading={stats.isLoading} error={stats.error} onAdd={() => setFormOpen(true)} />

        <div className="grid items-start gap-6 lg:grid-cols-5">
          {/* Top 3 actionable applications from GET /api/applications/priorities?limit=3 */}
          <TopPriorities data={top.data} error={top.error} isLoading={top.isLoading} onRetry={top.reload} />

          {/* Future deadlines and follow-ups */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card as="section" aria-labelledby="deadlines-heading">
              <CardHeading id="deadlines-heading" icon={CalendarClock} tone="coral" title="Upcoming deadlines" />
              <CardContent>
                <EmptyState illustration="calendar" tone="coral" title="No deadlines to show">
                  Submission deadlines from your applications will appear here.
                </EmptyState>
              </CardContent>
            </Card>

            <Card as="section" aria-labelledby="followups-heading">
              <CardHeading id="followups-heading" icon={BellRing} tone="amber" title="Follow-up reminders" />
              <CardContent>
                <EmptyState illustration="bell" tone="amber" title="No follow-ups to show">
                  Planned follow-ups will appear here so nothing slips through.
                </EmptyState>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Account */}
        <Card as="section" aria-labelledby="account-heading">
          <CardHeader>
            <div className="flex items-center gap-3">
              <IconTile icon={UserRound} tone="blue" />
              <CardTitle as="h3" id="account-heading">
                Your account
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 text-[13.5px] sm:grid-cols-3">
              <div className="min-w-0 rounded-xl bg-surface px-4 py-3">
                <dt className="text-[12px] font-medium text-muted-foreground">Name</dt>
                <dd className="mt-1 truncate font-semibold text-foreground">{user?.name}</dd>
              </div>
              <div className="min-w-0 rounded-xl bg-surface px-4 py-3">
                <dt className="text-[12px] font-medium text-muted-foreground">Email</dt>
                <dd className="mt-1 break-all font-semibold text-foreground">{user?.email}</dd>
              </div>
              <div className="min-w-0 rounded-xl bg-surface px-4 py-3">
                <dt className="text-[12px] font-medium text-muted-foreground">Member since</dt>
                <dd className="mt-1 font-semibold text-foreground">{formatDate(user?.createdAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <ApplicationFormDialog open={formOpen} onOpenChange={setFormOpen} onCreated={handleCreated} />
    </AppLayout>
  );
}
