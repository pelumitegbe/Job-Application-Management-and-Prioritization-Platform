import { ArrowDownWideNarrow, BriefcaseBusiness, CalendarClock, LayoutDashboard } from 'lucide-react';

// `to` is set only for pages that exist. Items without it are upcoming
// features: they are shown as disabled, never as links.
// `tone` keeps each feature's accent colour consistent across the app (see lib/tones.js).
export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, tone: 'violet' },
  { label: 'Applications', to: '/applications', icon: BriefcaseBusiness, tone: 'blue' },
  { label: 'Priorities', icon: ArrowDownWideNarrow, tone: 'coral' },
  { label: 'Follow-ups', icon: CalendarClock, tone: 'amber' },
];
