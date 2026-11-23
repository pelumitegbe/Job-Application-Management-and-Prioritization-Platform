import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Custom SVG illustration of the product: an application board with four
 * stage columns (Saved, Applied, Interviewing, Offer), cards moving through
 * them, and a rising priority chart. Purely decorative (aria-hidden); pages
 * describe the product in visible text next to it.
 */
export default function TrackingBoardIllustration({ className }) {
  const id = useId().replace(/:/g, '');
  const g = (name) => `${id}-${name}`;

  const columns = [
    { x: 40, label: '#a78bfa', cards: 3 }, // Saved (violet)
    { x: 132, label: '#60a5fa', cards: 2 }, // Applied (blue)
    { x: 224, label: '#2dd4bf', cards: 2 }, // Interviewing (teal)
    { x: 316, label: '#fbbf24', cards: 1 }, // Offer (amber)
  ];

  return (
    <svg viewBox="0 0 420 300" className={cn('h-auto w-full', className)} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g('window')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f5f3ff" />
        </linearGradient>
        <linearGradient id={g('chart')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={g('area')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.28" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
        <filter id={g('shadow')} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#3b0764" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* App window */}
      <g filter={`url(#${g('shadow')})`}>
        <rect x="20" y="16" width="380" height="268" rx="18" fill={`url(#${g('window')})`} />
      </g>
      <rect x="20" y="16" width="380" height="36" rx="18" fill="#ffffff" />
      <rect x="20" y="40" width="380" height="12" fill="#ffffff" />
      <circle cx="42" cy="34" r="4.5" fill="#ff7a59" />
      <circle cx="56" cy="34" r="4.5" fill="#f59e0b" />
      <circle cx="70" cy="34" r="4.5" fill="#14b8a6" />
      <rect x="150" y="29" width="120" height="10" rx="5" fill="#ede9fe" />
      <line x1="20" y1="52" x2="400" y2="52" stroke="#ede9fe" strokeWidth="1.5" />

      {/* Stage columns with application cards */}
      {columns.map(({ x, label, cards }, col) => (
        <g key={x}>
          <rect x={x} y="66" width="80" height="130" rx="10" fill="#ffffff" stroke="#ede9fe" />
          <rect x={x + 10} y="76" width="34" height="7" rx="3.5" fill={label} />
          <rect x={x + 48} y="76" width="14" height="7" rx="3.5" fill="#ede9fe" />
          {Array.from({ length: cards }).map((_, i) => (
            <g key={i}>
              <rect x={x + 8} y={92 + i * 34} width="64" height="28" rx="7" fill={col === 2 && i === 0 ? '#f0fdfa' : '#faf8ff'} stroke={col === 2 && i === 0 ? '#5eead4' : '#e9e5f7'} />
              <circle cx={x + 18} cy={106 + i * 34} r="5" fill={label} opacity="0.85" />
              <rect x={x + 27} y={101 + i * 34} width="36" height="4" rx="2" fill="#c4b5fd" />
              <rect x={x + 27} y={108 + i * 34} width="24" height="4" rx="2" fill="#e4dffa" />
            </g>
          ))}
        </g>
      ))}

      {/* Card moving from Applied to Interviewing */}
      <path d="M 196 150 C 210 150, 214 132, 226 128" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 4" fill="none" strokeLinecap="round" />
      <path d="M 221 124 L 227 128 L 220 132" stroke="#a78bfa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Priority chart */}
      <rect x="40" y="208" width="356" height="62" rx="12" fill="#ffffff" stroke="#ede9fe" />
      <path d="M 56 256 L 110 246 L 160 250 L 214 234 L 266 238 L 320 222 L 376 218 L 376 262 L 56 262 Z" fill={`url(#${g('area')})`} />
      <path d="M 56 256 L 110 246 L 160 250 L 214 234 L 266 238 L 320 222 L 376 218" stroke={`url(#${g('chart')})`} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="376" cy="218" r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
      <rect x="56" y="216" width="56" height="6" rx="3" fill="#ddd6fe" />
    </svg>
  );
}
