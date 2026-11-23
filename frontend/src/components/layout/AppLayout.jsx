import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LogOut, Menu, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import Logo from '../common/Logo';
import SidebarNav from './SidebarNav';
import TimezoneSuggestion from '../settings/TimezoneSuggestion';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** Honest roadmap note at the bottom of the sidebar (no links: nothing to open yet). */
function RoadmapNote() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-800">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Next up
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Follow-up reminders are coming next.
      </p>
    </div>
  );
}

function SidebarContents({ onNavigate }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="p-3">
        <RoadmapNote />
      </div>
    </>
  );
}

/**
 * Shell for authenticated pages.
 * - lg and up: fixed sidebar + content column.
 * - below lg: the sidebar moves into a slide-over sheet opened from the header.
 */
export default function AppLayout({ title, children, hideTimezoneSuggestion = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-full bg-surface lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-md focus:ring-3 focus:ring-ring/45"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-border lg:bg-surface">
        <div className="flex h-16 items-center px-5">
          <Link to="/dashboard" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/45">
            <Logo />
          </Link>
        </div>
        <SidebarContents />
      </aside>

      <div className="flex min-h-full min-w-0 flex-col bg-background lg:min-h-screen">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          {/* Mobile navigation */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2 size-10 lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined}>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-16 items-center border-b border-border pl-5 pr-14">
                <Logo />
              </div>
              <SidebarContents onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-foreground">{title}</h1>

          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-sm shadow-violet-600/30 ring-2 ring-white"
                aria-hidden="true"
              >
                {initials(user?.name)}
              </span>
              <div className="hidden min-w-0 leading-tight md:block">
                <p className="max-w-48 truncate text-[13px] font-semibold text-foreground">{user?.name}</p>
                <p className="max-w-48 truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <span className="sr-only md:hidden">Signed in as {user?.name}</span>
            </div>
            <span className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
            <Button variant="outline" size="sm" onClick={handleLogout} className="h-10 min-w-10 sm:h-9 sm:min-w-0">
              <LogOut aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Log out</span>
            </Button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            {!hideTimezoneSuggestion && <TimezoneSuggestion />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
