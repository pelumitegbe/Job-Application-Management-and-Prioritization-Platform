import { NavLink } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './navigation';

const itemBase = 'flex h-10 items-center gap-3 rounded-xl px-2 text-[13.5px] font-medium';

/** Sidebar navigation. Available pages are links; upcoming features are visibly disabled, non-interactive items. */
export default function SidebarNav({ onNavigate }) {
  const available = NAV_ITEMS.filter((item) => item.to);
  const upcoming = NAV_ITEMS.filter((item) => !item.to);

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-1">
        {available.map(({ label, to, icon: Icon }) => (
          <li key={label}>
            <NavLink
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  itemBase,
                  'outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/45',
                  isActive ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn('flex size-7 items-center justify-center rounded-lg', isActive ? 'bg-brand-gradient text-white shadow-sm shadow-violet-600/30' : TONES.violet.tile)}
                    aria-hidden="true"
                  >
                    <Icon className="size-4" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div>
        <p id="upcoming-nav-heading" className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle-foreground">
          Coming next
        </p>
        <ul aria-labelledby="upcoming-nav-heading" className="flex flex-col gap-1">
          {upcoming.map(({ label, icon: Icon, tone }) => (
            <li key={label}>
              <span aria-disabled="true" className={cn(itemBase, 'cursor-default text-muted-foreground')}>
                <span className={cn('flex size-7 items-center justify-center rounded-lg opacity-75', TONES[tone].tile)} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">{label}</span>
                <Badge variant="soon">
                  Soon<span className="sr-only">: not available yet</span>
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
