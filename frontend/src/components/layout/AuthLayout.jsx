import Logo from '../common/Logo';
import AuthShowcase from './AuthShowcase';

/**
 * Shared layout for login and registration. Both pages render through it, so
 * they are visually identical apart from title, subtitle, form and footer.
 *
 * - lg and up: form column (left) + colourful product showcase (right).
 * - below lg: a compact gradient brand header with the form card overlapping it.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-full bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-4 lg:p-4">
      <div className="relative flex min-h-full flex-col lg:min-h-0 lg:rounded-3xl">
        {/* Small screens: gradient brand header */}
        <header className="relative overflow-hidden bg-brand-gradient px-5 pb-20 pt-6 text-white sm:px-8 lg:hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]"
            aria-hidden="true"
          />
          <div className="relative">
            <Logo inverted />
            <p className="mt-6 max-w-sm text-lg font-semibold leading-snug">Know which application deserves your attention next.</p>
          </div>
        </header>

        {/* Large screens: logo above the form */}
        <header className="hidden px-8 pt-6 lg:block">
          <Logo />
        </header>

        <main className="relative -mt-14 flex flex-1 items-start justify-center px-4 pb-10 sm:px-8 lg:mt-0 lg:items-center lg:py-10">
          <div className="w-full max-w-[440px] rounded-3xl border border-border/80 bg-card p-6 shadow-lg sm:p-9">
            <div className="mb-7">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[32px]">{title}</h1>
              {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="mt-7 border-t border-border/80 pt-6 text-center text-[13.5px] text-muted-foreground">{footer}</div>}
          </div>
        </main>
      </div>

      <aside className="hidden lg:block" aria-label="About the platform">
        <div className="sticky top-4 h-[calc(100vh-2rem)] min-h-[640px]">
          <AuthShowcase />
        </div>
      </aside>
    </div>
  );
}
