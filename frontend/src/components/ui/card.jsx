import { cn } from '@/lib/utils';

export function Card({ className, as: Component = 'div', ...props }) {
  return <Component className={cn('rounded-2xl border border-border/80 bg-card text-card-foreground shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 px-6 pt-6', className)} {...props} />;
}

export function CardTitle({ className, as: Component = 'h2', ...props }) {
  return <Component className={cn('text-[15px] font-semibold tracking-tight text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-[13px] leading-relaxed text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-6 pb-6 pt-4', className)} {...props} />;
}
