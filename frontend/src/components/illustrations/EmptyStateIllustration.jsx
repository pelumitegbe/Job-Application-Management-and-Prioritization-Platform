import { cn } from '@/lib/utils';

// Small spot illustrations for empty states, in the same flat style as
// TrackingBoardIllustration. Decorative only (aria-hidden).

const PALETTES = {
  violet: { bg: '#ede9fe', accent: '#8b5cf6', soft: '#c4b5fd' },
  coral: { bg: '#ffede6', accent: '#ff7a59', soft: '#fdba9f' },
  amber: { bg: '#fef3c7', accent: '#f59e0b', soft: '#fcd34d' },
  teal: { bg: '#ccfbf1', accent: '#14b8a6', soft: '#5eead4' },
};

function Folder({ c }) {
  return (
    <>
      <rect x="18" y="30" width="84" height="58" rx="10" fill="#ffffff" stroke={c.soft} strokeWidth="2" />
      <path d="M18 40 a10 10 0 0 1 10 -10 h22 l8 8 h34 a10 10 0 0 1 10 10" fill={c.bg} />
      <rect x="32" y="52" width="40" height="6" rx="3" fill={c.soft} />
      <rect x="32" y="64" width="28" height="6" rx="3" fill={c.bg} />
      <circle cx="92" cy="82" r="14" fill={c.accent} />
      <path d="M92 75 v14 M85 82 h14" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Calendar({ c }) {
  return (
    <>
      <rect x="22" y="26" width="76" height="66" rx="12" fill="#ffffff" stroke={c.soft} strokeWidth="2" />
      <path d="M22 38 a12 12 0 0 1 12 -12 h52 a12 12 0 0 1 12 12 v6 h-76 z" fill={c.accent} />
      <rect x="40" y="18" width="6" height="16" rx="3" fill={c.soft} />
      <rect x="74" y="18" width="6" height="16" rx="3" fill={c.soft} />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect key={`${row}-${col}`} x={32 + col * 15} y={52 + row * 12} width="9" height="7" rx="2" fill={row === 1 && col === 2 ? c.accent : c.bg} />
        ))
      )}
    </>
  );
}

function Bell({ c }) {
  return (
    <>
      <circle cx="60" cy="58" r="38" fill={c.bg} />
      <path d="M60 30 c-13 0 -22 10 -22 23 v14 l-6 8 h56 l-6 -8 v-14 c0 -13 -9 -23 -22 -23z" fill="#ffffff" stroke={c.accent} strokeWidth="3" strokeLinejoin="round" />
      <path d="M53 80 a7 7 0 0 0 14 0" fill={c.accent} />
      <circle cx="80" cy="34" r="7" fill={c.accent} />
      <path d="M30 40 q-6 8 0 18 M90 40 q6 8 0 18" stroke={c.soft} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  );
}

const SCENES = { folder: Folder, calendar: Calendar, bell: Bell };

export default function EmptyStateIllustration({ variant = 'folder', tone = 'violet', className }) {
  const Scene = SCENES[variant];
  return (
    <svg viewBox="0 0 120 110" className={cn('h-auto w-24', className)} aria-hidden="true" focusable="false">
      <Scene c={PALETTES[tone]} />
    </svg>
  );
}
