import { TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';

/** Rounded, tinted square holding an icon. tone: violet | blue | teal | coral | amber. */
export default function IconTile({ icon: Icon, tone = 'violet', size = 'md', className }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center', size === 'lg' ? 'size-11 rounded-xl' : 'size-9 rounded-lg', TONES[tone].tile, className)}
      aria-hidden="true"
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-[18px]'} />
    </span>
  );
}
