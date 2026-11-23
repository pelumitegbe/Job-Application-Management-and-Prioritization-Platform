import { ArrowDownWideNarrow, BellRing, Check, Layers } from 'lucide-react';
import { APP_TAGLINE } from '@/config';
import { cn } from '@/lib/utils';
import TrackingBoardIllustration from '../illustrations/TrackingBoardIllustration';

// Example content for the illustration only (not user data, never fetched).
const SAMPLE_RANKING = [
  { role: 'Frontend Engineer', score: 92, bar: 'bg-violet-500' },
  { role: 'Product Designer', score: 78, bar: 'bg-blue-500' },
  { role: 'Data Analyst', score: 64, bar: 'bg-teal-500' },
];
const STAGES = ['Saved', 'Applied', 'Interview', 'Offer'];

const FEATURES = [
  { icon: Layers, label: 'Track every stage' },
  { icon: ArrowDownWideNarrow, label: 'Rank by priority' },
  { icon: BellRing, label: 'Never miss a follow-up' },
];

function FloatingCard({ className, children }) {
  return <div className={cn('absolute rounded-2xl border border-white/70 bg-white/95 p-3.5 shadow-xl backdrop-blur', className)}>{children}</div>;
}

function RankingCard() {
  return (
    <FloatingCard className="right-0 top-2 w-56 motion-safe:animate-float xl:-right-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
        <ArrowDownWideNarrow className="size-3.5" />
        Priority ranking
      </p>
      <ol className="space-y-2">
        {SAMPLE_RANKING.map(({ role, score, bar }, index) => (
          <li key={role} className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-violet-50 text-[10px] font-bold text-violet-700">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="truncate font-medium text-foreground">{role}</span>
                <span className="font-semibold tabular-nums text-muted-foreground">{score}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-violet-100">
                <div className={cn('h-full rounded-full', bar)} style={{ width: `${score}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </FloatingCard>
  );
}

function ProgressCard() {
  const current = 2; // "Interview"
  return (
    <FloatingCard className="-bottom-4 left-0 w-60 motion-safe:animate-float-slow xl:-left-6">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-foreground">UX Researcher</p>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Interviewing</span>
      </div>
      <div className="mt-3 flex items-center">
        {STAGES.map((stage, index) => (
          <div key={stage} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-white',
                index < current && 'bg-teal-500',
                index === current && 'bg-teal-500 ring-4 ring-teal-100',
                index > current && 'border-2 border-violet-200 bg-white'
              )}
            >
              {index < current && <Check className="size-3" strokeWidth={3} />}
            </span>
            {index < STAGES.length - 1 && <span className={cn('mx-1 h-0.5 flex-1 rounded-full', index < current ? 'bg-teal-400' : 'bg-violet-100')} />}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9.5px] font-medium text-muted-foreground">
        {STAGES.map((stage) => (
          <span key={stage}>{stage}</span>
        ))}
      </div>
    </FloatingCard>
  );
}

function FollowUpChip() {
  return (
    <FloatingCard className="left-6 top-0 flex items-center gap-2.5 rounded-xl px-3 py-2.5 motion-safe:animate-float-slow">
      <span className="flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
        <BellRing className="size-3.5" />
      </span>
      <div className="leading-tight">
        <p className="text-[11px] font-semibold text-foreground">Follow up tomorrow</p>
        <p className="text-[10px] text-muted-foreground">Recruiter check-in</p>
      </div>
    </FloatingCard>
  );
}

/**
 * Colourful product showcase for the authentication pages (large screens):
 * short messaging, the board illustration and floating example cards.
 */
export default function AuthShowcase() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-brand-gradient px-10 py-12 text-white shadow-xl shadow-violet-900/20 xl:px-14">
      {/* Restrained texture: a faint dot grid and two soft light pools */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:22px_22px]"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 size-80 rounded-full bg-sky-400/25 blur-3xl" aria-hidden="true" />

      <div className="relative max-w-md">
        <span className="inline-flex items-center rounded-full bg-violet-950/20 px-3 py-1 text-[12px] font-semibold ring-1 ring-inset ring-white/30">
          Job Application Management &amp; Prioritization
        </span>
        <h2 className="mt-5 text-[28px] font-bold leading-tight tracking-tight xl:text-[32px]">Know which application deserves your attention next.</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white">{APP_TAGLINE}</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-violet-950/20 px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset ring-white/25">
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <figure className="relative mx-auto mt-auto w-full max-w-[520px] pb-6 pt-14">
        <div className="relative" aria-hidden="true">
          <TrackingBoardIllustration />
          <RankingCard />
          <ProgressCard />
          <FollowUpChip />
        </div>
        <figcaption className="sr-only">Illustration of an application board with example priority scores and interview progress.</figcaption>
      </figure>
    </div>
  );
}
